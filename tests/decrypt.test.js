// tests/decrypt.test.js
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { decryptSegment } = require('../src/decrypt');

const KEY = crypto.randomBytes(16);
const IV = crypto.randomBytes(16);

test('AES-128-CBC 왕복 복호', () => {
  const plain = crypto.randomBytes(188 * 7); // TS 패킷 크기 배수
  const cipher = crypto.createCipheriv('aes-128-cbc', KEY, IV);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const decrypted = decryptSegment(encrypted, KEY, IV);
  assert.deepStrictEqual(decrypted, plain);
});

test('hex 문자열 IV를 Buffer로 받아도 동작', () => {
  const plain = Buffer.from('a'.repeat(64));
  const cipher = crypto.createCipheriv('aes-128-cbc', KEY, IV);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const decrypted = decryptSegment(encrypted, KEY, IV.toString('hex'));
  assert.deepStrictEqual(decrypted, plain);
});

test('IV가 없으면 세그먼트 번호 기반 기본 IV 사용', () => {
  // HLS 사양: IV 미지정 시 미디어 시퀀스 번호를 16바이트 빅엔디언으로 사용
  const seq = 5;
  const defaultIv = Buffer.alloc(16);
  defaultIv.writeUInt32BE(seq, 12);
  const plain = Buffer.from('b'.repeat(48));
  const cipher = crypto.createCipheriv('aes-128-cbc', KEY, defaultIv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const decrypted = decryptSegment(encrypted, KEY, null, seq);
  assert.deepStrictEqual(decrypted, plain);
});
