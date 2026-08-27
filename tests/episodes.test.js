const test = require('node:test');
const assert = require('node:assert');

const {
  isSeasonPage,
  parseEpisodeList,
  selectEpisodes,
} = require('../src/episodes');

const SEASON_URL = 'https://tvwiki47.net/world/123/456';
const SEASON_HTML = `
  <a href="https://tvwiki47.net/world/123/30">테스트 드라마 3화</a>
  <a href="https://tvwiki47.net/world/123/10">테스트 드라마 1화</a>
  <a href="https://tvwiki47.net/world/123/20">테스트 드라마 2화</a>
  <a href="https://tvwiki47.net/world/123/20">테스트 드라마 2화</a>
  <a href="https://tvwiki47.net/world/123/20">다음화</a>
  <a href="https://tvwiki47.net/world/999/40">다른 시즌 4화</a>
`;

test('시즌 링크만 에피소드 목록 조회 대상으로 판별', () => {
  assert.strictEqual(isSeasonPage(SEASON_URL), true);
  assert.strictEqual(isSeasonPage('https://tvwiki47.net/movie/123/456'), false);
});

test('시즌 HTML에서 중복 없이 오래된 화부터 에피소드 목록을 파싱', () => {
  assert.deepStrictEqual(parseEpisodeList(SEASON_HTML, SEASON_URL), [
    { url: 'https://tvwiki47.net/world/123/10', title: '테스트 드라마 1화' },
    { url: 'https://tvwiki47.net/world/123/20', title: '테스트 드라마 2화' },
    { url: 'https://tvwiki47.net/world/123/30', title: '테스트 드라마 3화' },
  ]);
});

test('선택한 URL만 원래 에피소드 순서대로 다운로드 대상으로 남긴다', () => {
  const episodes = parseEpisodeList(SEASON_HTML, SEASON_URL);
  assert.deepStrictEqual(
    selectEpisodes(episodes, [
      'https://tvwiki47.net/world/123/30',
      'https://tvwiki47.net/world/123/10',
      'https://tvwiki47.net/world/123/missing',
    ]),
    [
      { url: 'https://tvwiki47.net/world/123/10', title: '테스트 드라마 1화' },
      { url: 'https://tvwiki47.net/world/123/30', title: '테스트 드라마 3화' },
    ]
  );
});
