'use strict';

function parseManifest(text, baseUrl = null) {
  const lines = text.split(/\r?\n/);
  const segments = [];
  let totalDuration = 0;
  let method = null, keyUri = null, ivHex = null;

  let pendingDuration = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXT-X-KEY')) {
      const m = trimmed.match(/METHOD=([^,]+)/);
      const u = trimmed.match(/URI="([^"]+)"/);
      const iv = trimmed.match(/IV=0x([0-9a-fA-F]+)/);
      method = m ? m[1] : null;
      keyUri = u ? u[1] : null;
      ivHex = iv ? iv[1].toLowerCase() : null;
    } else if (trimmed.startsWith('#EXTINF:')) {
      pendingDuration = parseFloat(trimmed.slice(8)) || 0;
      totalDuration += pendingDuration;
    } else if (trimmed && !trimmed.startsWith('#')) {
      let url = trimmed;
      if (!/^https?:/i.test(url) && baseUrl) url = new URL(url, baseUrl).href;
      segments.push(url);
    }
  }
  return {
    segments,
    totalDuration,
    method,
    keyUri,
    ivHex,
    isLive: !lines.some((l) => l.trim() === '#EXT-X-ENDLIST'),
  };
}

module.exports = { parseManifest };
