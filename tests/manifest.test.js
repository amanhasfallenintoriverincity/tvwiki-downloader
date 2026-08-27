const test = require('node:test');
const assert = require('node:assert');
const { parseManifest } = require('../src/manifest');

const SAMPLE = [
  '#EXTM3U',
  '#EXT-X-VERSION:6',
  '#EXT-X-TARGETDURATION:2',
  '#EXT-X-KEY:METHOD=AES-128,URI="/v/key7?c=abc&token=x",IV=0x639f7ce7b703accb748d448a8c387c60',
  '#EXTINF:2.000000,',
  'https://c9.a.com/v/e/abc/index00000.gif',
  '#EXTINF:2.000000,',
  'https://c9.b.com/v/e/abc/index00001.gif',
  '#EXTINF:0.916667,',
  'https://c9.a.com/v/e/abc/index00002.gif',
  '#EXT-X-ENDLIST',
].join('\n');

test('세그먼트 목록과 시간 추출', () => {
  const m = parseManifest(SAMPLE);
  assert.strictEqual(m.segments.length, 3);
  assert.strictEqual(m.segments[0], 'https://c9.a.com/v/e/abc/index00000.gif');
  assert.strictEqual(m.segments[2], 'https://c9.a.com/v/e/abc/index00002.gif');
  assert.strictEqual(m.totalDuration, 4.916667);
  assert.strictEqual(m.ivHex, '639f7ce7b703accb748d448a8c387c60');
  assert.strictEqual(m.method, 'AES-128');
});

test('상대경로 세그먼트는 base URL 기준으로 해석', () => {
  const rel = '#EXTM3U\n#EXTINF:2,\nseg0.ts\n#EXT-X-ENDLIST\n';
  const m = parseManifest(rel, 'https://cdn.example.com/v/e/x/c.html?t=1');
  assert.strictEqual(m.segments[0], 'https://cdn.example.com/v/e/x/seg0.ts');
});

test('ENDLIST 없으면 live로 표시', () => {
  const m = parseManifest('#EXTM3U\n#EXTINF:2,\nhttps://x/a.ts\n');
  assert.strictEqual(m.isLive, true);
});
