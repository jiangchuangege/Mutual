// 农场 HTML 冒烟测试：不用模拟器，用 vm + canvas 桩真跑一遍游戏逻辑
const vm = require('node:vm');
const { buildFarmHtml } = require('../dist-core/gameFarm.js');

const html = buildFarmHtml();
const code = html.split('<script>')[1].split('</script>')[0];

const grad = { addColorStop() {} };
const ctx = {
  save() {}, restore() {}, fillRect() {}, clearRect() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
  arc() {}, ellipse() {}, bezierCurveTo() {}, quadraticCurveTo() {},
  fill() {}, stroke() {}, clip() {}, translate() {}, scale() {}, rotate() {},
  setTransform() {}, drawImage() {}, roundRect() {}, fillText() {}, setLineDash() {},
  measureText: () => ({ width: 24 }),
  createLinearGradient: () => grad,
  createRadialGradient: () => grad,
  createPattern: () => null,
};

const listeners = {};
const canvasEl = {
  width: 0, height: 0, style: {},
  getContext: () => ctx,
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
};
let goHandler = null;
const document = {
  getElementById: (id) => (id === 'c' ? canvasEl : { style: {}, addEventListener: (_t, f) => { goHandler = f; } }),
  createElement: () => ({ set src(_v) {}, onload: null }),
  head: { appendChild() {} },
  addEventListener() {},
};

let rafQueue = [];
let nowMs = 0;
const sandbox = {
  document,
  console,
  Image: class { constructor() { this.complete = false; this.naturalWidth = 0; this.src = ''; } },
  performance: { now: () => nowMs },
  requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
  addEventListener() {},
  setTimeout: () => 0,
};
sandbox.window = sandbox;
sandbox.window.innerWidth = 390;
sandbox.window.innerHeight = 844;
sandbox.window.devicePixelRatio = 2;
sandbox.window.AudioContext = undefined;
sandbox.window.webkitAudioContext = undefined;
sandbox.window.TwGame = { send: (s) => { sandbox.__sent = (sandbox.__sent || 0) + 1; } };

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'farm.js' });

const frame = (n) => {
  for (let i = 0; i < n; i++) {
    const q = rafQueue; rafQueue = [];
    nowMs += 16;
    for (const cb of q) cb(nowMs);
  }
};
const click = (x, y) => {
  for (const f of listeners['click'] || []) f({ clientX: x, clientY: y });
};

frame(3);
if (!goHandler) throw new Error('开始按钮没绑定');
goHandler();
frame(5);

const VW = 390, VH = 844;
// 商店条（底部 2 行 × 3）
click(VW / 2 - 100, VH - 30);
click(VW / 2, VH - 60);
// 田里播种：4×3 的中间
const gx = VW / 2, gy = 60 + (VH - 60 - 8 - (VH < 640 ? 58 : 74) - 8) * 0.25;
click(gx, gy + 40);
frame(30);
click(gx, gy + 40);          // 浇水
frame(400);                  // 长到成熟
click(gx, gy + 40);          // 收获
// 畜栏喂食 + 收取
const penY = VH - 78 - 8 - (VH < 640 ? 58 : 74) + 50;
click(60, penY);
frame(900);
click(60, penY);
// 仓库面板：打开 → 全部卖出 → 关闭
click(VW - 104 + 20, 32);
frame(2);
click(VW / 2, VH / 2 + 200);   // 全部卖出按钮附近
frame(2);
click(VW - 60, 100);           // 关掉
// 任务面板：打开 → 领奖 → 关闭
click(VW - 56 + 20, 32);
frame(2);
for (let i = 0; i < 3; i++) click(VW - 60, 200 + i * 56);
frame(2);
click(VW - 60, 100);
frame(300);

console.log('冒烟通过 ✅  html', html.length, '字符 · 帧数 ~1660 · TwGame.send 调用', sandbox.__sent || 0);
console.log('远端回调', typeof sandbox.window.onRemoteState);
sandbox.window.onRemoteState(JSON.stringify({ t: 10, w: '', x: 1, y: 1 }));
frame(5);
console.log('远端消息处理通过 ✅');
