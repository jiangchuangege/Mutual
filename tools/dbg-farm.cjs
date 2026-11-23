// 调试用：把几个场景的点击结果打印出来，定位坐标问题
const vm = require('node:vm');
const { buildFarmHtml } = require('../dist-core/gameFarm.js');
const VW = 390, VH = 844;
const grad = { addColorStop() {} };
const noop = () => {};
const ctx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 30 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
    if (k === 'createPattern') return () => null;
    if (k in t) return t[k];
    return noop;
  },
  set: () => true,
});
const listeners = {};
function node(tag) {
  return {
    tagName: tag, children: [], style: {}, textContent: '', id: '', src: '',
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    addEventListener(t, f) { (this.events = this.events || {})[t] = f; },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    requestFullscreen() {}, canPlayType: () => '', play: () => Promise.resolve(), pause() {},
    getContext: () => ctx,
  };
}
const canvasEl = node('canvas');
canvasEl.getContext = () => ctx;
canvasEl.addEventListener = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
let goHandler = null;
const goEl = node('div');
goEl.addEventListener = (_t, f) => { goHandler = f; };
const body = node('body'), head = node('head');
const document = {
  body, head,
  getElementById: (id) => (id === 'c' ? canvasEl : id === 'go' ? goEl : null),
  createElement: (tag) => node(tag),
  addEventListener() {},
};
let raf = [], now = 0;
const sent = [];
const sandbox = {
  document, console,
  performance: { now: () => now },
  requestAnimationFrame: (cb) => { raf.push(cb); return 1; },
  addEventListener() {}, setTimeout: () => 0, setInterval: () => 0, clearInterval() {},
};
sandbox.window = sandbox;
sandbox.window.innerWidth = VW;
sandbox.window.innerHeight = VH;
sandbox.window.devicePixelRatio = 2;
sandbox.window.ReactNativeWebView = { postMessage: (d) => sent.push(JSON.parse(String(d).slice(9))) };
const html = buildFarmHtml();
vm.createContext(sandbox);
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], sandbox, { filename: 'farm.js' });

const frame = (n) => { for (let i = 0; i < n; i++) { const q = raf; raf = []; now += 16; for (const cb of q) cb(now); } };
const tap = (x, y) => {
  for (const f of listeners['touchstart'] || []) f({ changedTouches: [{ clientX: x, clientY: y }] });
  for (const f of listeners['touchend'] || []) f({ changedTouches: [{ clientX: x, clientY: y }] });
};
const last = () => { for (let i = sent.length - 1; i >= 0; i--) if (sent[i].w) return sent[i].w; return ''; };
const brief = (tag) => {
  const s = (last() || '').split('|');
  const zooLen = Math.floor(((s[2] || '').length) / 7);
  console.log(tag.padEnd(22), 'scene?', '| coins', s[4], '| zoo', zooLen, '| unlocked', s[6], '| bag', s[7], '| decor', s[8], '| house', s[9]);
};
frame(3); goHandler(); frame(3);
brief('start');
tap(210, 20); frame(3); brief('-> market');
tap(100, 94); frame(3); brief('tab animal');
tap(100, 212); frame(3); brief('buy animal');
tap(300, 20); frame(3); brief('-> zoo');
tap(60, 100); frame(3); brief('select card0');
const baseY = VH - 108, bw = (VW - 24 - 12) / 4;
tap(12 + bw + 4 + bw / 2, baseY + 46); frame(6); brief('feed x1');
for (let i = 0; i < 3; i++) { tap(12 + bw + 4 + bw / 2, baseY + 46); frame(6); }
brief('feed x4');
// house
tap(210, 20); frame(3); brief('-> market');
tap(180, 94); frame(3); brief('tab decor');
tap(100, 212); frame(3); brief('buy decor');
tap(100, 20); frame(3); brief('-> house');
tap(60, VH - 58 + 16); frame(3); brief('decor mode');
tap(30, VH - 62 + 38); frame(3); brief('pick item');
tap(200, 560); frame(3); brief('place');
