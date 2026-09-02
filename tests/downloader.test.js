// tests/downloader.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { downloadSegments } = require('../src/downloader');
const { decryptSegment } = require('../src/decrypt');

function startMockServer(segments /* [{bytes}] */) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const idx = Number(new URL(req.url, 'http://x').searchParams.get('i'));
      const flaky = req.headers['x-test-flaky'];
      if (flaky && !req.headers['x-retried']) { // 재시도 유도: 첫 요청만 500
        res.writeHead(500); res.end(); return;
      }
      res.writeHead(200, { 'content-type': 'video/mp2t' });
      res.end(segments[idx].bytes);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('병렬 다운로드 + 복호 + 순서 보존', async () => {
  const key = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const plains = [0, 1, 2, 3, 4].map(() => crypto.randomBytes(1024));
  const segments = plains.map((p) => {
    const c = crypto.createCipheriv('aes-128-cbc', key, iv);
    return { bytes: Buffer.concat([c.update(p), c.final()]) };
  });
  const server = await startMockServer(segments);
  const { port } = server.address();
  const urls = segments.map((_, i) => `http://127.0.0.1:${port}/seg?i=${i}`);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvdl-test-'));
  const outFile = path.join(outDir, 'out.ts');
  const events = [];
  await downloadSegments({
    urls, key, iv, outFile,
    concurrency: 3,
    fetchOptions: { headers: { 'x-retried': '1' } },
    onProgress: (e) => events.push(e),
  });

  const got = fs.readFileSync(outFile);
  assert.deepStrictEqual(got, Buffer.concat(plains));
  assert.ok(events.length >= 1);
  assert.strictEqual(events.at(-1).done, urls.length);
  server.close();
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('많은 세그먼트를 병합해도 WriteStream 리스너 경고를 만들지 않는다', async () => {
  const segments = Array.from({ length: 12 }, (_, i) => ({ bytes: Buffer.from(`segment-${i}\n`) }));
  const server = await startMockServer(segments);
  const { port } = server.address();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvdl-listeners-'));
  const outFile = path.join(outDir, 'out.ts');
  const warnings = [];
  const onWarning = (warning) => {
    if (warning.name === 'MaxListenersExceededWarning') warnings.push(warning);
  };
  process.on('warning', onWarning);

  try {
    await downloadSegments({
      urls: segments.map((_, i) => `http://127.0.0.1:${port}/seg?i=${i}`),
      outFile,
      concurrency: 4,
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(fs.readFileSync(outFile), Buffer.concat(segments.map((segment) => segment.bytes)));
    assert.deepStrictEqual(warnings, []);
  } finally {
    process.off('warning', onWarning);
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('500 응답은 재시도 후 성공', async () => {
  const key = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-128-cbc', key, iv);
  const enc = Buffer.concat([c.update(Buffer.from('hello')), c.final()]);
  const server = await startMockServer([{ bytes: enc }]);
  const { port } = server.address();

  // 첫 요청은 500, 재시도는 통과하는 모의 서버용 헤더 조합
  let attempts = 0;
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvdl-test-'));
  const outFile = path.join(outDir, 'out.ts');
  await downloadSegments({
    urls: [`http://127.0.0.1:${port}/seg?i=0`],
    key, iv, outFile, concurrency: 1,
    fetchOptions: {
      get headers() { attempts++; return attempts === 1 ? { 'x-test-flaky': '1' } : { 'x-retried': '1' }; },
    },
    retries: 3,
  });
  assert.deepStrictEqual(fs.readFileSync(outFile), Buffer.from('hello'));
  server.close();
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('취소 신호는 진행 중인 세그먼트 요청을 중단하고 임시 파일을 정리', async () => {
  const key = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from('cancel me')), cipher.final()]);
  const server = http.createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'video/mp2t' });
      res.end(encrypted);
    }, 500);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvdl-cancel-'));
  const outFile = path.join(outDir, 'out.ts');
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);

  try {
    await assert.rejects(
      downloadSegments({
        urls: [`http://127.0.0.1:${port}/seg`],
        key,
        iv,
        outFile,
        concurrency: 1,
        signal: controller.signal,
      }),
      /abort/i
    );
    assert.strictEqual(fs.existsSync(outFile), false);
    assert.strictEqual(fs.existsSync(`${outFile}.parts`), false);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
