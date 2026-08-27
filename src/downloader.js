// src/downloader.js
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const { decryptSegment } = require('./decrypt');

async function fetchWithRetry(url, fetchOptions, retries = 3, signal = null) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (signal?.aborted) throw new Error('aborted');
      const opts = typeof fetchOptions === 'function' ? fetchOptions(attempt) : (fetchOptions || {});
      const res = await fetch(url, { ...opts, signal: signal ?? opts.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw new Error('aborted');
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function downloadSegments({ urls, key, iv, outFile, concurrency = 8,
                                  fetchOptions = {}, retries = 3, onProgress = () => {},
                                  signal = null }) {
  const tmpDir = `${outFile}.parts`;
  await fsp.mkdir(tmpDir, { recursive: true });
  let done = 0;
  let next = 0;
  const startedAt = Date.now();
  let bytesTotal = 0;

  async function worker() {
    while (next < urls.length) {
      if (signal?.aborted) throw new Error('aborted');
      const i = next++;
      const data = await fetchWithRetry(urls[i], fetchOptions, retries, signal);
      const plain = key ? decryptSegment(data, key, iv, i) : data;
      await fsp.writeFile(`${tmpDir}/${String(i).padStart(6, '0')}.ts`, plain);
      done++;
      bytesTotal += plain.length;
      onProgress({
        done, total: urls.length, bytes: bytesTotal,
        speed: bytesTotal / Math.max(1, (Date.now() - startedAt) / 1000),
      });
    }
  }
  let out;
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
    // 순서대로 병합: 중간 .tmp 파일 없이 .parts에서 직접 스트리밍
    out = fs.createWriteStream(outFile);
    for (let i = 0; i < urls.length; i++) {
      const rs = fs.createReadStream(`${tmpDir}/${String(i).padStart(6, '0')}.ts`);
      await pipeline(rs, out, { end: false });
    }
    await new Promise((resolve, reject) => {
      out.on('error', reject);
      out.end(resolve);
    });
  } catch (err) {
    if (out) await new Promise((r) => out.destroy(r)).catch(() => {});
    await fsp.unlink(outFile).catch(() => {});
    throw err;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { downloadSegments };
