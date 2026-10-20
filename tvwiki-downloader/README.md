<div align="center">

# tvwiki-downloader

**티비위키 임베드 영상 다운로더**

영상 페이지 링크 하나만 넣으면, 보호된 임베드 플레이어에서 복호화 키를 회수하고
`yt-dlp`로 영상을 내려받습니다.

[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![uv](https://img.shields.io/badge/uv-package%20manager-DE5FE4)](https://docs.astral.sh/uv/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

> **사용 전에 확인해 주세요.**
>
> 이 도구는 개인 백업 용도로 제작했습니다. 저작권이 있는 콘텐츠의 배포와 공유에 대한 책임은 전적으로 사용자에게 있습니다. 이 도구는 사이트의 콘텐츠 보호 메커니즘을 우회하므로, 사용하기 전에 거주 지역의 법률과 사이트 이용 약관을 확인해 주세요.

## 시작하기

### 요구사항

| 도구 | 버전 | 비고 |
| --- | --- | --- |
| Python | 3.11 이상 | `uv`가 가상 환경을 관리합니다 |
| [uv](https://docs.astral.sh/uv/) | 최신 | 패키지 설치와 실행을 담당합니다 |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 최신 | 세그먼트 다운로드를 담당합니다 |
| [FFmpeg](https://ffmpeg.org/) | 최신 | 영상과 오디오를 병합합니다 |

두 도구가 `PATH`에 등록되어 있어야 합니다. 다음 명령으로 확인할 수 있습니다.

```sh
yt-dlp --version
ffmpeg -version
```

### 설치

리포지토리를 복제하고 의존성을 설치한 뒤, 헤드리스 브라우저를 내려받습니다.

```sh
git clone https://github.com/amanhasfallenintoriverincity/tvwiki-downloader.git
cd tvwiki-downloader

uv sync
uv run playwright install chromium
```

### 첫 다운로드

영상 페이지 링크를 인자로 넘기면 됩니다. 기본 저장 위치는 `~/downloads`입니다.

```sh
uv run tvdl "https://tvwiki47.net/movie/32005/406777415"
```

실행이 끝나면 제목으로 된 `.mp4` 파일이 저장됩니다.

## 사용법

`tvdl`과 `tvwiki-downloader`는 같은 명령입니다. 편한 쪽을 사용하면 됩니다.

```sh
# 기본 저장 위치(~/downloads)에 내려받기
uv run tvdl "<영상 페이지 URL>"

# 저장 위치 지정하기
uv run tvdl "<영상 페이지 URL>" -o /path/to/dir

# 다운로드 없이 키 회수와 복호화만 검증하기
uv run tvdl "<영상 페이지 URL>" --probe

# 병렬 다운로드 수 조절과 상세 로그
uv run tvdl "<영상 페이지 URL>" -N 16 -v
```

### 명령줄 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `url` | (필수) | 티비위키 영상 페이지 URL |
| `-o`, `--outdir` | `~/downloads` | 출력 디렉터리 |
| `--probe` | 끔 | 키 회수와 복호화만 검증하고 저장하지 않음 |
| `-N`, `--concurrency` | `10` | 세그먼트 병렬 다운로드 수 |
| `-v`, `--verbose` | 끔 | 디버그 로그 출력 |

## 동작 원리

티비위키는 영상을 정적으로 노출하지 않고, 세 단계의 보호 계층을 겹쳐 둡니다. 이 도구는 각 계층을 다음 순서로 통과합니다.

1. **세션 확보** — 헤드리스 크로미엄으로 영상 페이지를 열면, 페이지가 `create_session.php` API를 호출해 임베드 URL을 생성합니다. 도구는 이 과정이 끝날 때까지 기다렸다가 임베드 URL을 확보합니다.
2. **키 회수** — 임베드 플레이어(`player.bunny-frame.online`)는 자체 HLS CDN을 사용하고, 복호화 키를 7겹으로 난독화한 뒤 WASM 안에서 복호합니다. 복호 로직은 이식이 불가능하므로, 사이트 플레이어 스스로 복호화한 AES-128 키를 브라우저 메모리에서 그대로 회수합니다.
3. **다운로드** — 회수한 키를 로컬 파일로 저장하고, 매니페스트의 키 참조를 로컬 파일로 다시 씁니다. 이후 `yt-dlp`가 세그먼트를 병렬로 내려받아 하나의 영상 파일로 병합합니다.

## 개발자 API

파이썬 코드에서 직접 호출할 수도 있습니다.

```python
from tvwiki_downloader import TvdlConfig, download_page

# 설정을 만들고 다운로드를 시작합니다.
path = download_page(TvdlConfig(
    page_url="https://tvwiki47.net/movie/32005/406777415",
    outdir="~/downloads",
))
print(path)  # 저장된 파일 경로
```

`TvdlConfig`의 속성은 다음과 같습니다.

| 속성 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `page_url` | `str` | (필수) | 티비위키 영상 페이지 URL |
| `outdir` | `str` | `~/downloads` | 출력 디렉터리 |
| `concurrency` | `int` | `10` | 세그먼트 병렬 다운로드 수 |
| `probe` | `bool` | `False` | 검증만 수행할지 여부 |

## 문제 해결

### 임베드 세션 생성에 실패합니다

사이트가 일시적으로 느릴 때 발생합니다. 도구는 최대 3회까지 자동으로 재시도하며, 재시도할 때마다 새 세션을 발급받습니다. 계속 실패한다면 잠시 후 다시 시도해 주세요.

### 다운로드 도중 403 오류가 납니다

임베드 토큰은 수 분에서 수 시간 뒤에 만료됩니다. 도구를 다시 실행하면 새 토큰으로 다운로드가 재개됩니다.

### 사이트 구조가 바뀌어 동작하지 않습니다

사이트가 플레이어 구조를 바꾼 경우입니다. `src/tvwiki_downloader/core.py`의 다음 두 지점을 점검해 주세요.

- `EMBED_HOST_RE` — 임베드 도메인 패턴
- `EXTRACT_JS` — 브라우저 메모리에서 키를 회수하는 스크립트

## 참고 사항

- 매니페스트는 단일 비트레이트(보통 1080p)에 AES-128 키 하나, 2초 길이 세그먼트 수천 개로 구성됩니다.
- 세그먼트는 여러 도메인(`c9.*.com`)으로 분산되어 있고, 확장자는 `.gif`로 위장되어 있습니다.
- 다른 번호 도메인(예: `tvwiki48.net`)도 같은 플레이어 구조를 사용한다면 그대로 동작합니다.

## 라이선스

[MIT](LICENSE)
