// renderer/renderer.js
'use strict';
const $ = (id) => document.getElementById(id);
let outdir = null;
let lastPath = null;
let unsub = [];

const api = window.tvdl;

async function init() {
  outdir = await api.getDefaultDir();
  $('dir-label').textContent = outdir;
  api.on('stages', (stages) => {
    const list = $('stages');
    list.textContent = '';
    for (const s of stages) {
      const li = document.createElement('li');
      li.dataset.stage = s;
      li.textContent = s;
      list.appendChild(li);
    }
  });
  unsub = [
    api.on('stage', ({ name }) => markStage(name)),
    api.on('meta', (m) => { $('video-title').textContent = `${m.title} · ${m.segments}개 세그먼트 · ${Math.round(m.duration)}초`; }),
    api.on('progress', onProgress),
    api.on('log', (m) => appendLog(m)),
    api.on('done', (d) => onDone(d)),
    api.on('error', (e) => onError(e)),
  ];
}

function markStage(name) {
  const items = Array.from($('stages').children);
  const idx = items.findIndex((li) => li.dataset.stage === name);
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', i === idx);
    items[i].classList.toggle('passed', i < idx);
  }
}

function onProgress(p) {
  if (p.remux != null) {
    $('progress-fill').style.width = `${Math.round(p.remux * 100)}%`;
    $('progress-text').textContent = `변환 중 ${Math.round(p.remux * 100)}%`;
    return;
  }
  const pct = Math.round((p.done / p.total) * 100);
  $('progress-fill').style.width = `${pct}%`;
  $('progress-text').textContent = `${p.done}/${p.total} 세그먼트 · ${(p.speed / 1048576).toFixed(1)} MB/s`;
}

function appendLog(m) {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = el.scrollHeight;
}

function onDone(d) {
  lastPath = d.path;
  $('progress-fill').style.width = '100%';
  $('progress-text').textContent = d.probe ? '검증 완료' : '다운로드 완료';
  $('btn-open').hidden = false;
  $('btn-start').disabled = false;
}

function onError(e) {
  appendLog('오류: ' + e.message);
  $('btn-start').disabled = false;
}

$('btn-start').onclick = () => {
  const url = $('url-input').value.trim();
  if (!/^https?:\/\/tvwiki/i.test(url)) {
    appendLog('티비위키 링크를 입력하세요.');
    return;
  }
  $('status-card').hidden = false;
  $('btn-open').hidden = true;
  $('log').textContent = '';
  $('btn-start').disabled = true;
  api.start({ url, outdir, concurrency: +$('rng-conc').value, probe: $('chk-probe').checked });
};

$('btn-cancel').onclick = () => api.cancel();

$('btn-dir').onclick = async () => {
  const d = await api.chooseFolder();
  if (d) { outdir = d; $('dir-label').textContent = d; }
};

$('btn-paste').onclick = async () => {
  try {
    $('url-input').value = await navigator.clipboard.readText();
  } catch (_) { /* ignore */ }
};

$('btn-open').onclick = () => api.showInFolder(lastPath);

$('btn-min').onclick = () => api.minimize();
$('btn-close').onclick = () => api.close();

$('rng-conc').oninput = (e) => { $('conc-val').textContent = e.target.value; };

init();
