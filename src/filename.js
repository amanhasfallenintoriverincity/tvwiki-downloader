'use strict';

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/** Windows와 POSIX에서 모두 저장할 수 있는 파일명으로 바꾼다. */
function sanitizeFilename(value, fallback = 'video') {
  let name = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  if (!name) return fallback;
  if (WINDOWS_RESERVED_NAMES.test(name)) name = `_${name}`;
  return name.slice(0, 180).replace(/[. ]+$/g, '') || fallback;
}

module.exports = { sanitizeFilename };
