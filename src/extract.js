'use strict';
const { BrowserWindow } = require('electron');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// 사이트 플레이어가 복호화한 키를 hls.js 메모리에서 회수.
// 키 복호 로직은 WASM 내부라 재구현 불가 — 메모리 회수만 유효.
const EXTRACT_JS = `(() => {
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
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hiddenWindow() {
  const win = new BrowserWindow({
    show: false, width: 1280, height: 720,
    webPreferences: { offscreen: false },
  });
  win.webContents.setUserAgent(UA);
  return win;
}

// 반환: { info: {key_b64, iv_hex, playlist_url, segments, duration}, embed, title }
async function extract({ pageUrl, timeoutMs = 90000, attempts = 3, log = () => {} }) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) { log(`재시도 ${attempt}/${attempts}...`); await sleep(2000 * attempt); }
    let pageWin, embedWin;
    try {
      // 1단계: create_session이 주입하는 임베드 URL 대기
      pageWin = hiddenWindow();
      await pageWin.loadURL(pageUrl);
      let embed = null, title = null;
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        const src = await pageWin.webContents.executeJavaScript(
          `(() => { const f = document.getElementById('view_iframe'); return f ? (f.src || '') : ''; })()`
        );
        if (src.includes('bunny-frame')) { embed = src; break; }
      }
      try { title = await pageWin.webContents.executeJavaScript('document.title'); } catch {}
      pageWin.close(); pageWin = null;
      if (!embed) throw new Error('임베드 세션 생성 실패 (사이트가 응답하지 않음)');
      log(`임베드 확보: ${embed}`);

      // 2단계: 임베드 로드(티비위키 referer 필수) 후 키 회수 폴링
      embedWin = hiddenWindow();
      await embedWin.loadURL(embed, { httpReferrer: pageUrl });
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await sleep(1000);
        try {
          const raw = await embedWin.webContents.executeJavaScript(EXTRACT_JS);
          if (raw) {
            const info = JSON.parse(raw);
            log(`키 회수 완료 · ${info.segments}개 세그먼트 · ${Math.round(info.duration)}초`);
            embedWin.close(); embedWin = null;
            return { info, embed, title };
          }
          await embedWin.webContents.executeJavaScript(
            `(() => { try { const a = window.tvchakArtPlayer; if (a && a.play) a.play(); } catch(e) {} })()`
          );
        } catch {}
      }
      throw new Error('키 추출 시간 초과');
    } catch (e) {
      lastErr = e;
      try { pageWin?.close(); embedWin?.close(); } catch {}
    }
  }
  throw new Error(`키 추출 실패 (${attempts}회 시도): ${lastErr?.message}`);
}

module.exports = { extract, UA };
