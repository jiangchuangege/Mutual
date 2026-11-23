/* eslint-disable */
/** 通用游戏运行时：归一化 + 兼容层 + 联网判定 + 给 AI 的指令模板 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRuntimeHtml, needsNetwork, isFullHtml, AI_PROMPT } = require('../dist-core/gameRuntime.js');

test('完整 HTML：只在 </body> 前插入兼容层，原代码不动', () => {
  const code = '<!doctype html><html><body><canvas id="c"></canvas><script>var a=1;</script></body></html>';
  const html = buildRuntimeHtml(code);
  assert.ok(html.startsWith('<!doctype html>'), '原文档结构保留');
  assert.ok(html.includes('var a=1;'), '原代码不能丢');
  assert.ok(html.includes('__TW_RUNTIME__'), '要注入兼容层');
  assert.ok(html.indexOf('__TW_RUNTIME__') < html.indexOf('</body>'), '兼容层要在 body 结束前');
});

test('只有片段的代码：自动套最小骨架（AI 经常只给一段 script）', () => {
  const html = buildRuntimeHtml('<canvas id="c"></canvas><script>console.log(1)</script>');
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes('<canvas id="c"></canvas>'));
  assert.ok(html.includes('__TW_RUNTIME__'));
  assert.ok(html.includes('viewport'), '手机要适配 viewport');
});

test('兼容层提供 send/apply/host 三个桥接方法，并兜底 window.onRemoteState', () => {
  const html = buildRuntimeHtml('<html><body>x</body></html>');
  assert.ok(html.includes('TwGame'), '要暴露 TwGame');
  assert.ok(html.includes('onRemoteState'), '要兜底 AI 常见的接收函数');
  assert.ok(html.includes('GAME_STATE'), '要兼容把局面放全局的写法');
  assert.ok(html.includes('twgame-state'), '要派发事件，方便游戏自己监听');
});

test('联网判定：CDN / 网络 API 才放开，纯本地代码保持离线沙箱', () => {
  assert.equal(needsNetwork('<script src="https://cdn.jsdelivr.net/npm/three@0.160/build/three.min.js"></script>'), true);
  assert.equal(needsNetwork('<script src="https://unpkg.com/phaser@3"></script>'), true);
  assert.equal(needsNetwork('fetch("/api/score")'), true);
  assert.equal(needsNetwork('new WebSocket("wss://x")'), true);
  assert.equal(needsNetwork('<canvas></canvas><script>var a=1</script>'), false);
});

test('isFullHtml 认得各种完整文档写法', () => {
  assert.equal(isFullHtml('<!DOCTYPE html><html></html>'), true);
  assert.equal(isFullHtml('<html lang="zh"><body></body></html>'), true);
  assert.equal(isFullHtml('<div>片段</div>'), false);
  assert.equal(isFullHtml(''), false);
});

test('给 AI 的指令模板必须写明联机契约（send / onRemoteState / turn）', () => {
  assert.match(AI_PROMPT, /TwGame\.send/);
  assert.match(AI_PROMPT, /onRemoteState/);
  assert.match(AI_PROMPT, /turn/);
  assert.match(AI_PROMPT, /单文件|一个文件/);
});
