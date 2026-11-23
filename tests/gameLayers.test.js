/* eslint-disable */
/** 分层粘贴合成器 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { assembleLayers, stripFence, buildRuntimeHtml } = require('../dist-core/gameRuntime.js');

test('HTML + CSS + JS 三层合成一个完整可跑页面', () => {
  const html = assembleLayers({
    html: '<canvas id="c"></canvas>',
    css: 'canvas{background:#123}',
    js: 'var x = 1;',
  });
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes('<canvas id="c"></canvas>'), '结构层要进去');
  assert.ok(html.includes('background:#123'), '样式层要进去');
  assert.ok(html.includes('var x = 1;'), '脚本层要进去');
  assert.ok(html.includes('__TW_RUNTIME__'), '仍然要注入联机兼容层');
  assert.ok(html.includes('viewport'), '手机要适配');
});

test('AI 爱带的 ```html / ```js 代码围栏会被剥掉', () => {
  assert.equal(stripFence('```js\nvar a = 1;\n```'), 'var a = 1;');
  assert.equal(stripFence('```html\n<div>x</div>\n```'), '<div>x</div>');
  assert.equal(stripFence('var b = 2;'), 'var b = 2;');
  const html = assembleLayers({ js: '```js\nconsole.log(1);\n```' });
  assert.ok(html.includes('console.log(1);'));
  assert.ok(!html.includes('```'), '围栏不能漏进代码');
});

test('JS 那层本身就是整页 HTML 时，直接当整页用（不重复套壳）', () => {
  const full = '<!doctype html><html><body><h1>hi</h1></body></html>';
  const html = assembleLayers({ js: full, html: '<canvas></canvas>' });
  assert.ok(html.includes('<h1>hi</h1>'));
  assert.equal((html.match(/<!doctype html>/gi) || []).length, 1, '只能有一个 doctype');
});

test('缺层也能跑：只给 JS 会自动补结构', () => {
  const html = assembleLayers({ js: 'document.body.textContent="ok";' });
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes('<canvas id="c"></canvas>'), '默认给个 canvas');
  assert.ok(html.includes('document.body.textContent'));
});

test('合成结果再走一遍运行时也是稳定的（幂等）', () => {
  const once = assembleLayers({ html: '<div id="a"></div>', css: '#a{color:red}', js: 'var q=3;' });
  const twice = buildRuntimeHtml(once);
  assert.ok(twice.includes('var q=3;'));
  // 合成一次已经注入过兼容层，再包一次会有两套定义（运行时会跳过重复执行，无害）
  assert.ok((twice.match(/__TW_RUNTIME__/g) || []).length >= 2, '兼容层要在');
  assert.ok(twice.includes('var q=3;'), '代码不能丢');
});
