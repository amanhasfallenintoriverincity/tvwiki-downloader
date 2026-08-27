// src/main.js
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { extract, UA } = require('./extract');
const { parseManifest } = require('./manifest');
const { fetchManifest, remuxToMp4 } = require('./remux');
const { downloadSegments } = require('./downloader');
const { isSeasonPage, parseEpisodeList, selectEpisodes } = require('./episodes');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;
let abortCtl = null;

function send(channel, payload) { mainWindow?.webContents.send(channel, payload); }
function stage(name) { send('stage', { name, at: Date.now() }); }

const STAGES = ['세션 확보', '키 회수', '매니페스트', '다운로드', '변환', '완료'];

// 시즌 페이지(/world/<시즌>/<에피소드>)에서 에피소드 목록을 수집한다.
async function fetchEpisodeList(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`시즌 페이지 수신 실패: HTTP ${res.status}`);
  return parseEpisodeList(await res.text(), url);
}

/** 링크를 붙여넣을 때는 다운로드 없이 선택 가능한 목록만 돌려준다. */
async function inspectEpisodeList(url) {
  if (!isSeasonPage(url)) return [{ url, title: '단일 영상' }];
  const episodes = await fetchEpisodeList(url);
  if (!episodes.length) throw new Error('시즌 페이지에서 에피소드를 찾지 못했습니다');
  return episodes;
}

// 에피소드 1개 다운로드. 성공 시 저장 경로 반환, 실패 시 throw.
async function downloadOne({ url, outdir, concurrency, probe }, myCtl) {
  stage('세션 확보');
  const { info, title, embed } = await extract({
    pageUrl: url,
    log: (m) => send('log', m),
  });
  const cleanTitle = (title || 'video').replace(/\s*다시보기.*$|\s*-\s*티비위키.*$/, '').trim() || 'video';
  send('meta', { title: cleanTitle, segments: info.segments, duration: info.duration });

  stage('매니페스트');
  const manifestText = await fetchManifest(info.playlist_url, embed);
  const manifest = parseManifest(manifestText, info.playlist_url);
  if (!manifest.segments.length) throw new Error('매니페스트에 세그먼트가 없습니다');
  const key = Buffer.from(info.key_b64, 'base64');
  const iv = info.iv_hex ? Buffer.from(info.iv_hex, 'hex') : null;

  const urls = probe ? manifest.segments.slice(0, 2) : manifest.segments;
  stage('다운로드');
  await fsp.mkdir(outdir, { recursive: true });
  const tsPath = path.join(outdir, `.${cleanTitle}.ts`);
  await downloadSegments({
    urls, key, iv, outFile: tsPath, concurrency,
    signal: myCtl.signal,
    fetchOptions: { headers: { 'User-Agent': UA, Referer: embed } },
    onProgress: (e) => send('progress', { ...e, total: urls.length, probe }),
  });

  stage('변환');
  const mp4Path = path.join(outdir, `${cleanTitle}.mp4`);
  if (probe) {
    const probePath = mp4Path.replace(/\.mp4$/, '.probe.ts');
    await fsp.copyFile(tsPath, probePath);
    await fsp.unlink(tsPath);
    stage('완료');
    send('done', { path: probePath, probe: true });
    return probePath;
  }
  await remuxToMp4(tsPath, mp4Path, {
    totalDuration: manifest.totalDuration,
    onProgress: (f) => send('progress', { remux: f }),
  });
  await fsp.unlink(tsPath);
  stage('완료');
  send('done', { path: mp4Path });
  return mp4Path;
}

async function startDownload({
  url,
  outdir,
  concurrency = 8,
  probe = false,
  selectedEpisodeUrls = [],
}) {
  // 이전 다운로드가 진행 중이면 먼저 취소
  if (abortCtl) {
    try { abortCtl.abort(); } catch (_) {}
  }
  const myCtl = abortCtl = new AbortController();
  try {
    // 시즌은 UI에서 선택한 URL만, 원래 회차 순서대로 순차 처리한다.
    if (isSeasonPage(url)) {
      const allEpisodes = await fetchEpisodeList(url);
      const requestedUrls = Array.isArray(selectedEpisodeUrls) ? selectedEpisodeUrls : [];
      const episodes = requestedUrls.length
        ? selectEpisodes(allEpisodes, requestedUrls)
        : allEpisodes;
      if (!episodes.length) throw new Error('선택한 에피소드를 찾지 못했습니다');
      send('batch', { episodes: episodes.map((e) => e.title) });
      const results = [];
      for (let i = 0; i < episodes.length; i++) {
        if (myCtl.signal.aborted) throw new Error('aborted');
        const ep = episodes[i];
        send('episode', { index: i, total: episodes.length, title: ep.title });
        try {
          const saved = await downloadOne({ url: ep.url, outdir, concurrency, probe }, myCtl);
          results.push({ title: ep.title, path: saved, ok: true });
          send('episode', { index: i, total: episodes.length, title: ep.title, status: 'done' });
        } catch (e) {
          if (myCtl.signal.aborted) throw e;
          results.push({ title: ep.title, ok: false, error: e.message || String(e) });
          send('episode', { index: i, total: episodes.length, title: ep.title, status: 'error', error: e.message });
          send('log', `${ep.title} 실패: ${e.message} — 다음 에피소드로 넘어갑니다`);
        }
      }
      send('batchDone', { results });
      return;
    }
    await downloadOne({ url, outdir, concurrency, probe }, myCtl);
  } catch (e) {
    if (myCtl.signal.aborted) send('cancelled', { message: '다운로드를 취소했습니다.' });
    else send('error', { message: e.message || String(e) });
  } finally {
    if (abortCtl === myCtl) abortCtl = null;
  }
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 532, height: 326, minWidth: 532, minHeight: 326,
    frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer-app', 'dist', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });

  // 렌더러가 준비된 이후에 STAGES를 전송
  mainWindow.webContents.on('did-finish-load', () => {
    send('stages', STAGES);
  });

  ipcMain.handle('episodes:inspect', async (_e, url) => {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('http 또는 https 링크만 사용할 수 있습니다');
    const episodes = await inspectEpisodeList(parsed.href);
    send('log', `${episodes.length}개 에피소드 목록을 불러왔습니다.`);
    return episodes;
  });
  ipcMain.handle('download:start', (_e, opts) => { startDownload(opts); });
  ipcMain.handle('download:cancel', () => { abortCtl?.abort(); });
  ipcMain.handle('dialog:chooseFolder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('shell:showInFolder', (_e, p) => { shell.showItemInFolder(p); });
  ipcMain.handle('app:getDefaultDir', () => path.join(app.getPath('downloads')));
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:close', () => mainWindow?.close());
});

app.on('window-all-closed', () => app.quit());
