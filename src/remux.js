// src/remux.js
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');

function ffmpegPath() {
  if (process.platform === 'win32' && process.resourcesPath) {
    return path.join(process.resourcesPath, 'ffmpeg.exe');
  }
  try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
}

// ffmpeg 진행률 파싱: stderr의 "time=00:01:23.45" 줄을 초로 변환
function parseTimeSeconds(line) {
  const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}

async function remuxToMp4(tsPath, mp4Path, { totalDuration = 0, onProgress = () => {} } = {}) {
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-y', '-i', tsPath, '-c', 'copy', '-movflags', '+faststart', mp4Path],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const t = parseTimeSeconds(line);
        if (t != null && totalDuration > 0) onProgress(Math.min(1, t / totalDuration));
      }
    });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

async function fetchManifest(url, referer) {
  const res = await fetch(url, { headers: { 'User-Agent': require('./extract').UA, Referer: referer } });
  if (!res.ok) throw new Error(`매니페스트 수신 실패: HTTP ${res.status}`);
  return res.text();
}

module.exports = { remuxToMp4, fetchManifest };
