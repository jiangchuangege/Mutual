// 外壳取色（纯计算部分）测试
const test = require('node:test');
const assert = require('node:assert');

const { dominantAccent, tuneAccent, hexToRgba } = require('../dist-core/shellAccent.js');

/** 造一片纯色像素 */
function solid(r, g, b, n = 64, a = 255) {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

test('纯色画面 → 主色接近该色（但会被提亮/加饱和）', () => {
  const r = dominantAccent(solid(30, 90, 200));
  assert.match(r.hex, /^#[0-9A-F]{6}$/);
  // 蓝色系要保持"偏蓝"
  const b = Number.parseInt(r.hex.slice(5, 7), 16);
  const rr = Number.parseInt(r.hex.slice(1, 3), 16);
  assert.ok(b > rr, '蓝色分量应大于红色');
  assert.ok(r.confidence > 0.9);
});

test('主色不能被纯黑/纯白淹没：黑底上的一块彩色才是主色', () => {
  const px = new Uint8Array(256 * 4);
  // 前 200 个像素接近黑（应被丢弃）
  for (let i = 0; i < 200; i += 1) {
    px[i * 4] = 6; px[i * 4 + 1] = 8; px[i * 4 + 2] = 12; px[i * 4 + 3] = 255;
  }
  // 后 56 个像素是橙红
  for (let i = 200; i < 256; i += 1) {
    px[i * 4] = 210; px[i * 4 + 1] = 90; px[i * 4 + 2] = 40; px[i * 4 + 3] = 255;
  }
  const r = dominantAccent(px);
  const red = Number.parseInt(r.hex.slice(1, 3), 16);
  const blue = Number.parseInt(r.hex.slice(5, 7), 16);
  assert.ok(red > blue, '应该是暖色，不该被黑底拉成冷色');
});

test('透明像素被忽略；全透明/太黑 → 回退默认青蓝', () => {
  const empty = dominantAccent(solid(120, 60, 200, 64, 0));
  assert.equal(empty.hex, '#57F8FF');
  assert.equal(empty.confidence, 0);

  const dark = dominantAccent(solid(8, 8, 8));
  assert.equal(dark.hex, '#57F8FF');
});

test('像素太少 → 回退默认色，不抛错', () => {
  assert.equal(dominantAccent(new Uint8Array(4)).hex, '#57F8FF');
  assert.equal(dominantAccent([]).hex, '#57F8FF');
});

test('tuneAccent：太暗的颜色会被提亮，纯白会被压一点', () => {
  const dark = tuneAccent(10, 20, 40);
  const darkLum = 0.2126 * dark.r + 0.7152 * dark.g + 0.0722 * dark.b;
  assert.ok(darkLum > 30, '提亮后应比原色亮（原亮度约 18）');

  const white = tuneAccent(255, 255, 255);
  assert.ok(white.r < 255, '纯白应被压暗，避免与背景糊在一起');
});

test('hexToRgba：正常 hex 转 rgba，坏输入给兜底', () => {
  assert.equal(hexToRgba('#FF8800', 0.2), 'rgba(255,136,0,0.2)');
  assert.equal(hexToRgba('坏', 0.16), 'rgba(87,248,255,0.16)');
});
