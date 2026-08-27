'use strict';

/** 시즌 에피소드 목록을 지원하는 티비위키 world URL인지 판별한다. */
function isSeasonPage(url) {
  try {
    return /^\/world\/\d+\/\d+\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** 시즌 페이지 HTML에서 오래된 화부터 정렬된 고유 에피소드 목록을 추출한다. */
function parseEpisodeList(html, pageUrl) {
  const seasonId = new URL(pageUrl).pathname.split('/')[2];
  const re = new RegExp(
    `<a[^>]*href="(https?://[^"]*?/world/${seasonId}/(\\d+))"[^>]*>([\\s\\S]*?)</a>`,
    'g'
  );
  const found = new Map();
  let match;

  while ((match = re.exec(String(html))) !== null) {
    const url = match[1];
    const id = Number(match[2]);
    const title = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (found.has(id) || !/\d+화\s*$/.test(title)) continue;
    found.set(id, { url, title });
  }

  return [...found.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, episode]) => episode);
}

/** 선택한 URL만 원래 시즌 순서를 보존해 다운로드 대상으로 고른다. */
function selectEpisodes(episodes, selectedUrls) {
  const selected = new Set(Array.isArray(selectedUrls) ? selectedUrls : []);
  return episodes.filter((episode) => selected.has(episode.url));
}

module.exports = { isSeasonPage, parseEpisodeList, selectEpisodes };
