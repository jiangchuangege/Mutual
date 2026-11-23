// 调试用 2：直接读 vm 里的全局变量（脚本顶层 var 会挂到 context 上）
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
const g = (k) => sandbox[k];
function brief(tag) {
  const a = (g('zoo') || [])[0];
  console.log(tag.padEnd(16),
    'scene=' + g('scene'),
    'panel=' + g('panel'),
    'coins=' + g('coins'),
    'zoo=' + (g('zoo') || []).length,
    a ? ('a0{gr=' + a.gr + ',st=' + a.st + ',aff=' + a.aff + ',pen=' + a.pen + ',prog=' + a.prog + '}') : '',
    'decorMode=' + g('decorMode'),
    'decorSel=' + g('decorSel'),
    'owned=' + (g('ownedDecor') || []).length,
    'house=' + (g('houseItems') || []).length,
    'unlocked=' + Object.keys(g('unlocked') || {}).length,
    'hearts=' + g('hearts'));
}
frame(3); goHandler(); frame(3);
brief('start');
tap(210, 20); frame(3); brief('market');
console.log('marketTab', sandbox.marketTab, 'scroll', sandbox.marketScroll);
const items = sandbox.marketItems();
console.log('first3', items.slice(0, 3).map((i) => i.n + '/' + i.p + '/locked=' + i.locked).join(' | '));
const cardBuyY = 132 + 10 + 92 - 30 + 12;
console.log('tap', 215, cardBuyY);
tap(215, cardBuyY); frame(3); brief('buy card1');
console.log('unlocked', JSON.stringify(sandbox.unlocked), 'coins', sandbox.coins);

