"""tvdl.core — 페이지 파싱, 키 회수, 매니페스트 재작성, 다운로드."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
from dataclasses import dataclass, field
from html import unescape

logger = logging.getLogger("tvdl")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
EMBED_HOST_RE = re.compile(r"(https://player\.bunny-frame\.online/v/[^\"'\s<>]+)")

# 사이트 자체 플레이어가 복호화한 AES 키를 hls.js 메모리에서 회수.
# 키 복호 로직은 WASM 내부라 재구현 불가 → 메모리 회수만 유효.
EXTRACT_JS = """() => {
  try {
    const art = window.tvchakArtPlayer;
    if (!art || !art._tvchakHls) return null;
    const hls = art._tvchakHls;
    const det = hls.levels && hls.levels[0] && hls.levels[0].details;
    if (!det || !det.fragments || !det.fragments.length) return null;
    const dd = det.fragments[0].decryptdata;
    if (!dd || !dd.key || dd.key.byteLength !== 16) return null;
    const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
    const hex = b => Array.from(new Uint8Array(b))
        .map(x => x.toString(16).padStart(2, '0')).join('');
    return JSON.stringify({
      key_b64: b64(dd.key),
      iv_hex: dd.iv ? hex(dd.iv) : null,
      playlist_url: hls.url,
      segments: det.fragments.length,
      duration: det.totalduration
    });
  } catch (e) { return null; }
}"""

NUDGE_JS = (
    "(() => { try { const a = window.tvchakArtPlayer;"
    " if (a && a.play) a.play(); } catch(e) {} })()"
)


class TvdlError(RuntimeError):
    """다운로드 파이프라인에서 발생하는 치명적 오류."""


@dataclass
class TvdlConfig:
    """다운로드 구성.

    :param page_url: 티비위키 영상 페이지 URL (필수).
    :param outdir: 출력 디렉토리. 기본 ~/downloads.
    :param concurrency: 세그먼트 병렬 다운로드 수.
    :param probe: True면 키/복호화만 검증하고 저장하지 않음.
    """

    page_url: str
    outdir: str = field(default_factory=lambda: os.path.expanduser("~/downloads"))
    concurrency: int = 10
    probe: bool = False


def _http_get(url: str, referer: str | None = None, timeout: int = 30) -> bytes:
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_static(page_url: str) -> tuple[str | None, str | None]:
    """정적 HTML에서 임베드/타이틀 시도 (없을 수 있음)."""
    html = _http_get(page_url).decode("utf-8", "replace")
    m = EMBED_HOST_RE.search(html)
    embed = unescape(m.group(1)) if m else None
    t = re.search(r"<title>(.*?)</title>", html, re.S)
    title = None
    if t:
        title = re.sub(
            r"\s*다시보기.*$|\s*-\s*티비위키.*$", "", unescape(t.group(1)).strip()
        )
    return embed, title


def _clean_title(title: str | None) -> str | None:
    if not title:
        return None
    return re.sub(r"\s*다시보기.*$|\s*-\s*티비위키.*$", "", title).strip() or None


def recover_key(page_url: str, timeout_s: int = 90, attempts: int = 3):
    """티비위키 페이지를 열어 세션 임베드 확보 → 임베드에서 키 회수.

    사이트가 일시적으로 느릴 수 있어 전체 과정을 최대 `attempts`회 재시도.

    :return: (info, embed_url, title)
    :raises TvdlError: 세션/키 확보 실패.
    """
    from playwright.sync_api import sync_playwright

    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        if attempt > 1:
            logger.warning("재시도 %d/%d ...", attempt, attempts)
            time.sleep(2 * attempt)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=[
                        "--autoplay-policy=no-user-gesture-required",
                        "--disable-blink-features=AutomationControlled",
                    ],
                )
                try:
                    ctx = browser.new_context(
                        user_agent=UA,
                        locale="ko-KR",
                        viewport={"width": 1280, "height": 720},
                    )

                    # 1단계: create_session으로 주입되는 임베드 URL 대기
                    page = ctx.new_page()
                    page.goto(page_url, wait_until="domcontentloaded")
                    embed = None
                    for _ in range(30):
                        page.wait_for_timeout(1000)
                        src = page.evaluate(
                            "() => { const f = document.getElementById('view_iframe');"
                            " return f ? (f.src || '') : ''; }"
                        )
                        if "bunny-frame" in src:
                            embed = src
                            break
                    try:
                        title = page.evaluate("() => document.title")
                    except Exception:
                        title = None
                    page.close()
                    if not embed:
                        raise TvdlError("임베드 세션 생성 실패 (사이트가 응답하지 않음)")

                    # 2단계: 임베드에서 플레이어 메모리의 키 회수
                    epage = ctx.new_page()
                    epage.goto(embed, wait_until="domcontentloaded", referer=page_url)
                    deadline = time.time() + timeout_s
                    while time.time() < deadline:
                        epage.wait_for_timeout(1000)
                        try:
                            r = epage.evaluate(EXTRACT_JS)
                            if r:
                                return json.loads(r), embed, title
                            epage.evaluate(NUDGE_JS)
                        except Exception:
                            pass
                    raise TvdlError("키 추출 시간 초과 (임베드 토큰 만료 또는 차단 가능성)")
                finally:
                    browser.close()
        except TvdlError as e:
            last_err = e
        except Exception as e:  # playwright 자체 오류 등
            last_err = e
    raise TvdlError(f"키 추출 실패 ({attempts}회 시도): {last_err}")


def build_local_playlist(info: dict, workdir: str, embed_url: str) -> str:
    """회수한 키를 로컬 파일로 저장하고 매니페스트를 재작성."""
    key_path = os.path.join(workdir, "seg.key")
    with open(key_path, "wb") as f:
        f.write(base64.b64decode(info["key_b64"]))

    manifest = _http_get(info["playlist_url"], referer=embed_url).decode(
        "utf-8", "replace"
    )
    if "#EXTM3U" not in manifest:
        raise TvdlError("매니페스트 수신 실패 (토큰 만료?)")

    out = []
    for line in manifest.splitlines():
        if line.startswith("#EXT-X-KEY"):
            m = re.search(r"IV=0x([0-9a-fA-F]+)", line)
            iv = m.group(1) if m else info.get("iv_hex")
            key_attr = f'URI="file://{key_path}"' + (f",IV=0x{iv}" if iv else "")
            out.append(f"#EXT-X-KEY:METHOD=AES-128,{key_attr}")
        else:
            out.append(line)
    if not any(l.strip() == "#EXT-X-ENDLIST" for l in out):
        out.append("#EXT-X-ENDLIST")

    pl_path = os.path.join(workdir, "playlist.m3u8")
    with open(pl_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    return pl_path


def _probe(workdir: str, pl_path: str) -> bool:
    """매니페스트를 첫 2개 세그먼트로 잘라 복호화까지 검증."""
    with open(pl_path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    trunc, seen = [], 0
    for l in lines:
        trunc.append(l)
        if l.startswith("http"):
            seen += 1
            if seen >= 2:
                break
    trunc = [l for l in trunc if l != "#EXT-X-ENDLIST"]
    trunc.append("#EXT-X-ENDLIST")
    probe_pl = os.path.join(workdir, "probe.m3u8")
    with open(probe_pl, "w", encoding="utf-8") as f:
        f.write("\n".join(trunc) + "\n")
    probe = os.path.join(workdir, "probe.%(ext)s")
    rc = subprocess.run(
        [
            "yt-dlp", "--enable-file-urls", f"file://{probe_pl}",
            "--referer", "https://player.bunny-frame.online/",
            "-o", probe, "--no-part", "-q",
        ]
    ).returncode
    ok = any(
        f.startswith("probe.") and f != "probe.m3u8" for f in os.listdir(workdir)
    )
    return rc == 0 and ok


def download_page(cfg: TvdlConfig) -> str:
    """전체 파이프라인 실행. :return: 저장된 파일 경로.

    :raises TvdlError: 세션/키/매니페스트/다운로드 실패.
    :raises SystemExit: yt-dlp 비정상 종료.
    """
    _, static_title = parse_static(cfg.page_url)
    info, embed, title = recover_key(cfg.page_url)
    title = _clean_title(title) or static_title or f"tvdl_{int(time.time())}"
    logger.info("제목: %s", title)
    logger.info("임베드: %s", embed)
    logger.info("키 회수 완료 · %s개 세그먼트 · %.0f초", info["segments"], info["duration"])

    workdir = tempfile.mkdtemp(prefix="tvdl-")
    try:
        pl_path = build_local_playlist(info, workdir, embed)

        if cfg.probe:
            ok = _probe(workdir, pl_path)
            logger.info("probe: %s", "OK" if ok else "FAIL")
            if not ok:
                raise TvdlError("probe 검증 실패")
            return ""

        os.makedirs(cfg.outdir, exist_ok=True)
        outtmpl = os.path.join(cfg.outdir, f"{title}.%(ext)s")
        cmd = [
            "yt-dlp", "--enable-file-urls", f"file://{pl_path}",
            "--referer", "https://player.bunny-frame.online/",
            "--add-header", f"User-Agent:{UA}",
            "-N", str(cfg.concurrency),
            "--retries", "10", "--fragment-retries", "10",
            "-o", outtmpl, "--newline", "--no-part",
        ]
        logger.info("다운로드 시작 → %s", cfg.outdir)
        rc = subprocess.run(cmd).returncode
        if rc != 0:
            raise SystemExit(rc)

        for f in sorted(os.listdir(cfg.outdir)):
            if f.startswith(title) and not f.endswith((".ytdl",)):
                return os.path.join(cfg.outdir, f)
        return outtmpl
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
