/* eslint-disable */
/**
 * RTC 错误分类测试：保证任何失败都能翻译成"人话 + 出路"，
 * 尤其"额度用完"必须是优雅弹窗而不是裸错误码。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyRtcError, AGORA_CONSOLE_URL } = require('../dist-core/rtcErrors.js');

test('额度用完（错误码）→ quota，且提供充值入口', () => {
  for (const code of [161, 162, 163, 164, 1058]) {
    const info = classifyRtcError(code, null);
    assert.equal(info.kind, 'quota', `错误码 ${code} 应判为额度问题`);
    assert.equal(info.canRecharge, true);
    assert.match(info.title, /额度/);
    assert.match(info.body, /充值/);
    assert.equal(info.primaryLabel, '去官网充值');
  }
});

test('额度用完（文案关键词，错误码未知）也能识别', () => {
  const cases = [
    [null, 'exceed concurrent channel limit'],
    [-1, 'insufficient balance'],
    [null, 'quota exceeded for this month'],
    [99, '并发超限'],
    [null, '免费额度已用尽'],
  ];
  for (const [code, msg] of cases) {
    const info = classifyRtcError(code, msg);
    assert.equal(info.kind, 'quota', `「${msg}」应判为额度问题`);
    assert.equal(info.canRecharge, true);
  }
});

test('token 失效 → token 类，给重试而不是充值', () => {
  for (const code of [109, 110, 120]) {
    const info = classifyRtcError(code, 'whatever');
    assert.equal(info.kind, 'token');
    assert.equal(info.canRecharge, false);
    assert.equal(info.canRetry, true);
    assert.match(info.body, /token 服务|无证书/);
  }
});

test('App ID / 频道名错误 → config 类，不给重试（重试没用）', () => {
  for (const code of [101, 102, 103]) {
    const info = classifyRtcError(code, null);
    assert.equal(info.kind, 'config');
    assert.equal(info.canRetry, false);
    assert.match(info.body, /rtcAppId/);
  }
});

test('网络问题 → network 类，建议切仅文字', () => {
  for (const code of [111, 112, 113, 114]) {
    const info = classifyRtcError(code, null);
    assert.equal(info.kind, 'network');
    assert.equal(info.canRetry, true);
    assert.match(info.body, /仅文字/);
  }
});

test('麦克风权限 → device 类', () => {
  const info = classifyRtcError(null, 'microphone permission denied');
  assert.equal(info.kind, 'device');
  assert.match(info.body, /麦克风权限/);
});

test('完全未知的错误也不甩错误码：有标题/正文/细节', () => {
  const info = classifyRtcError(4242, 'something odd');
  assert.equal(info.kind, 'unknown');
  assert.ok(info.title.length > 0);
  assert.ok(info.body.length > 0);
  assert.match(info.detail, /4242/);
  assert.match(info.detail, /something odd/);
  assert.equal(info.canRetry, true);
});

test('每种分类的文案都非空，且没有把裸错误码当标题', () => {
  const samples = [
    classifyRtcError(161, null),
    classifyRtcError(109, 'x'),
    classifyRtcError(101, null),
    classifyRtcError(111, null),
    classifyRtcError(null, 'permission'),
    classifyRtcError(7, 'zzz'),
  ];
  for (const info of samples) {
    assert.ok(info.title.length >= 4, '标题要能读懂');
    assert.ok(info.body.length >= 20, '正文要有解释');
    assert.ok(info.detail.length > 0);
    assert.equal(/^\d+$/.test(info.title), false, '标题不能只是数字');
  }
});

test('充值链接是 Agora 控制台', () => {
  assert.match(AGORA_CONSOLE_URL, /^https:\/\/console\.agora\.io/);
});
