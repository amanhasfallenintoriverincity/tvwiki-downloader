'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeFilename } = require('../src/filename');

test('Windows에서 사용할 수 없는 파일명 문자를 바꾼다', () => {
  assert.equal(sanitizeFilename('드라마: 1화? <완결>'), '드라마_ 1화_ _완결_');
});

test('Windows 예약 파일명과 끝의 점·공백을 피한다', () => {
  assert.equal(sanitizeFilename('CON'), '_CON');
  assert.equal(sanitizeFilename('제목.  '), '제목');
});

test('빈 제목에는 기본 파일명을 사용한다', () => {
  assert.equal(sanitizeFilename('  ...  '), 'video');
});
