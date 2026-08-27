// src/decrypt.js
'use strict';
const crypto = require('node:crypto');

function toIv(iv, sequenceNumber) {
  if (iv == null) {
    const buf = Buffer.alloc(16);
    buf.writeUInt32BE(sequenceNumber >>> 0, 12);
    return buf;
  }
  if (Buffer.isBuffer(iv)) return iv;
  if (typeof iv === 'string') return Buffer.from(iv.replace(/^0x/i, ''), 'hex');
  return Buffer.from(iv);
}

function decryptSegment(data, key, iv, sequenceNumber = 0) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, toIv(iv, sequenceNumber));
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

module.exports = { decryptSegment };
