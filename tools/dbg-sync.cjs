// 调试双人同步：看 A 收到 B 的包后到底有没有合并
const vm = require('node:vm');
const { buildFarmHtml } = require('../dist-core/gameFarm.js');

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
const noop = () => {};
const grad = { addColorStop: noop };
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 30 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad
      : k === 'createPattern' ? () => null : noop),
  set: () => true,
});

function boot(role, relay) {
  const html = buildFarmHtml(role);
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
  };
  let raf = [], now = 0;
  const sent = [];
  const sandbox = {
    document, console, Image: ImageStub,
    performance: { now: () => now },
    requestAnimationFrame: (cb) => { raf.push(cb); return 1; },
    addEventListener() {}, setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
    setInterval: () => 0, clearInterval() {},
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = 390;
  sandbox.window.innerHeight = 844;
  sandbox.window.devicePixelRatio = 2;
  sandbox.window.ReactNativeWebView = {
    postMessage: (d) => {
      const json = String(d).slice('TW_STATE:'.length);
      const obj = JSON.parse(json);
      sent.push(obj);
      if (relay) relay(json);
    },
  };
  vm.createContext(sandbox);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], sandbox, { filename: 'farm.js' });
  const frame = (n) => { for (let i = 0; i < n; i++) { const q = raf; raf = []; now += 16; for (const cb of q) cb(now); } };
  return { sandbox, frame, sent, start: () => goHandler(), applyRemote: (j) => sandbox.window.TwGame.apply(j) };
}

let A, B;
A = boot('A', (j) => B && B.applyRemote(j));
B = boot('B', (j) => A && A.applyRemote(j));
A.frame(3); B.frame(3); A.start(); B.start(); A.frame(3); B.frame(3);
console.log('开局 A.coins', A.sandbox.coins, 'B.coins', B.sandbox.coins, 'MYROLE A/B',
  A.sandbox.MYROLE, B.sandbox.MYROLE);

const items = B.sandbox.marketItems();
const target = items.find((it) => !it.done && it.p <= B.sandbox.coins);
console.log('B 买', target && target.n, target && target.p);
B.sandbox.buyMarket(target);
console.log('买完 B.coins', B.sandbox.coins, 'A.coins', A.sandbox.coins);
console.log('B 最后发出的包带 w?', typeof B.sent[B.sent.length - 1].w);
A.frame(5);
console.log('A 收到后 A.coins', A.sandbox.coins);
for (let i = 0; i < 20; i++) { A.frame(2); B.frame(2); }
console.log('收敛后 A.coins', A.sandbox.coins, 'B.coins', B.sandbox.coins);
