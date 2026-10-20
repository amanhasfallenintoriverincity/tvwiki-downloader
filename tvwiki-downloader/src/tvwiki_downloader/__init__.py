"""tvwiki-downloader — 티비위키 임베드 영상 다운로더."""

__version__ = "1.0.0"

from tvwiki_downloader.core import TvdlConfig, download_page

__all__ = ["TvdlConfig", "download_page", "__version__"]
