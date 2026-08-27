// src/preload.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tvdl', {
  inspectEpisodes: (url) => ipcRenderer.invoke('episodes:inspect', url),
  start: (opts) => ipcRenderer.invoke('download:start', opts),
  cancel: () => ipcRenderer.invoke('download:cancel'),
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  getDefaultDir: () => ipcRenderer.invoke('app:getDefaultDir'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  on: (channel, cb) => {
    const allowed = ['stage', 'progress', 'log', 'meta', 'done', 'error', 'cancelled', 'stages', 'batch', 'episode', 'batchDone'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
