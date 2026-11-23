const vm = require('node:vm');
const { buildFarmHtml } = require('../dist-core/gameFarm.js');
const noop = () => {};
const grad = { addColorStop: noop };
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 30 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad
      : k === 'createPattern' ? () => null : noop),
  set: () => true,
});
function makeNode(tag) {
  return {
    tagName: tag, children: [], style: {}, textContent: '', id: '', src: '',
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    addEventListener(t, f) { (this.events = this.events || {})[t] = f; },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    requestFullscreen() { return Promise.resolve(); }, canPlayType: () => '', play: () => Promise.resolve(), pause() {},
    getContext: () => ctxStub,
  };
}
const store = new Map();
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
function boot() {
  const html = buildFarmHtml('A');
  class ImageStub { constructor() { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; this.src = ''; } addEventListener() {} }
  const listeners = {};
  const canvas = makeNode('canvas');
  canvas.getContext = () => ctxStub;
  canvas.addEventListener = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
  let goHandler = null;
  const go = makeNode('div');
  go.addEventListener = (_t, f) => { goHandler = f; };
  const body = makeNode('body'), head = makeNode('head');
  const document = {
    body, head,
    getElementById: (id) => (id === 'c' ? canvas : id === 'go' ? go : null),
    createElement: (t) => makeNode(t),
    addEventListener() {},
    visibilityState: 'visible',
  };
  let raf = [], now = 0;
  const sandbox = {
    document, console, Image: ImageStub, localStorage: localStorageStub,
    performance: { now: () => now },
    requestAnimationFrame: (cb) => { raf.push(cb); return 1; },
    addEventListener() {}, setTimeout: (f) => { if (typeof f === 'function') f(); return 0; },
    setInterval: () => 0, clearInterval() {},
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = Math.round(390 * 1.18);
  sandbox.window.innerHeight = Math.round(818 * 1.18 + 26);
  sandbox.window.devicePixelRatio = 2;
  sandbox.window.ReactNativeWebView = { postMessage: () => {} };
  vm.createContext(sandbox);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], sandbox, { filename: 'farm.js' });
  const frame = (n) => { for (let i = 0; i < n; i++) { const q = raf; raf = []; now += 16; for (const cb of q) cb(now); } };
  return { sandbox, frame, start: () => goHandler() };
}

const h1 = boot();
h1.frame(3); h1.start(); h1.frame(3);
const items = h1.sandbox.marketItems();
const target = items.find((it) => !it.done && it.p <= h1.sandbox.coins);
h1.sandbox.buyMarket(target);
h1.frame(200);
console.log('第一次: coins', h1.sandbox.coins);
const raw = localStorageStub.getItem('mutual_farm_v1');
console.log('localStorage 里存的:', raw ? raw.slice(0, 60) + '…' : '(空)');
const w = raw ? JSON.parse(raw).w : '';
console.log('存档金币段:', w.split('|')[4]);

const h2 = boot();
h2.frame(2);
console.log('重进: coins', h2.sandbox.coins);
try {
  h2.sandbox.dec(w);
  console.log('手动 dec 后 coins:', h2.sandbox.coins);
} catch (e) {
  console.log('dec 抛错:', e && e.message);
}
try {
  const save = h2.sandbox.loadLocalSave();
  console.log('loadLocalSave 返回:', save ? ('有, 长度 ' + String(save.w).length) : 'null');
  console.log('sandbox.localStorage 有值?', !!h2.sandbox.localStorage.getItem('mutual_farm_v1'));
} catch (e) {
  console.log('loadLocalSave 抛错:', e && e.message);
}
