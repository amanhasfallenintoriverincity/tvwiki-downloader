'use strict';
const { app } = require('electron');
const { extract } = require('../src/extract');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  const url = process.argv.find((a) => /^https?:/.test(a));
  if (!url) { console.error('사용법: npm run probe -- <tvwiki URL>'); app.exit(2); }
  try {
    const { info, title } = await extract({ pageUrl: url, log: console.log });
    console.log(JSON.stringify({ title, playlist_url: info.playlist_url, segments: info.segments, duration: info.duration }, null, 2));
    app.exit(0);
  } catch (e) {
    console.error('PROBE FAIL:', e.message);
    app.exit(1);
  }
});
