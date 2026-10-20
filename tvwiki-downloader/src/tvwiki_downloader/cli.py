"""tvdl.cli — 명령줄 진입점."""
from __future__ import annotations

import argparse
import logging
import sys

from tvwiki_downloader.core import TvdlConfig, TvdlError, download_page


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(
        prog="tvdl",
        description="티비위키(tvwiki) 임베드 영상 다운로더",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("url", help="티비위키 영상 페이지 URL")
    ap.add_argument(
        "-o", "--outdir",
        default="~/downloads",
        help="출력 디렉토리",
    )
    ap.add_argument(
        "--probe", action="store_true",
        help="키/복호화만 검증하고 다운로드하지 않음",
    )
    ap.add_argument(
        "-N", "--concurrency", type=int, default=10,
        help="세그먼트 병렬 다운로드 수",
    )
    ap.add_argument(
        "-v", "--verbose", action="store_true",
        help="디버그 로그 출력",
    )
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(message)s",
        stream=sys.stdout,
    )

    cfg = TvdlConfig(
        page_url=args.url,
        outdir=args.outdir,
        concurrency=args.concurrency,
        probe=args.probe,
    )
    try:
        out = download_page(cfg)
        if out:
            print(f"\n[tvdl] 저장 완료: {out}")
    except TvdlError as e:
        print(f"[tvdl] 실패: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
