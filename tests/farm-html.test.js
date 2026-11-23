// 「我们的小窝」无头冒烟测试：vm + canvas/DOM 桩把 4 个场景和全部交互真跑一遍
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildFarmHtml } = require('../dist-core/gameFarm.js');
const cat = require('../dist-core/farmCatalog.js');

const UIZOOM = 1.18;    // 游戏内部放大系数
const VW = 390;                     // 游戏内部虚拟宽度
const VH = 818;                     // 游戏内部虚拟高度
const SAFE_TOP = 26;                // 顶部安全区（客户端像素）
const CLIENT_W = Math.round(VW * UIZOOM);
const CLIENT_H = Math.round(VH * UIZOOM + SAFE_TOP);
const BOARD_TOP = 92;
const BOARD_W = Math.min(VW - 20, 382);
const BOARD_H = BOARD_W * 0.60;

/* ---------- 桩 ---------- */
function makeCtx() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  const ctx = {
    save: noop, restore: noop, fillRect: noop, clearRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop,
    rect: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, fill: noop, stroke: noop, clip: noop,
    translate: noop, scale: noop, rotate: noop, setTransform: noop, drawImage: noop,
    roundRect: noop, fillText: noop, strokeText: noop, setLineDash: noop,
    measureText: () => ({ width: 30 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
  };
  return ctx;
}
function makeNode(tag) {
  const node = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: { cssText: '' },
    textContent: '',
    id: '',
    src: '',
    width: 0,
    height: 0,
    onclick: null,
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    },
    setAttribute() {},
    addEventListener(type, fn) { (this.events = this.events || {})[type] = fn; },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    requestFullscreen() { this.fullscreen = true; return Promise.resolve(); },
    canPlayType: () => '',
    play: () => Promise.resolve(),
    pause() {},
    getContext: () => makeCtx(),
  };
  return node;
}

function boot(role = 'A', relay) {
  const html = buildFarmHtml(role);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2, '兼容层 + 游戏脚本');
  const ctx = makeCtx();
  const listeners = {};
  const canvasEl = makeNode('canvas');
  canvasEl.getContext = () => ctx;
  canvasEl.addEventListener = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
  const goEl = makeNode('div');
  let goHandler = null;
  goEl.addEventListener = (_t, f) => { goHandler = f; };
  const body = makeNode('body');
  const head = makeNode('head');
  const document = {
    body,
    head,
    getElementById: (id) => (id === 'c' ? canvasEl : id === 'go' ? goEl : null),
    createElement: (tag) => makeNode(tag),
    addEventListener() {},
  };
  let rafQueue = [];
  let nowMs = 0;
  const sent = [];
  const posted = [];
  class ImageStub {
    constructor() { this.complete = true; this.naturalWidth = 879; this.naturalHeight = 881; this.src = ''; }
    addEventListener() {}
  }
  const ls = (globalThis.__LS__ = globalThis.__LS__ || new Map());
  const localStorageStub = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); },
  };
  const sandbox = {
    document,
    localStorage: localStorageStub,
    Image: ImageStub,
    console,
    performance: { now: () => nowMs },
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    addEventListener() {},
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
    setInterval: () => 0,
    clearInterval() {},
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = CLIENT_W;
  sandbox.window.innerHeight = CLIENT_H;
  sandbox.window.devicePixelRatio = 2;
  sandbox.window.ReactNativeWebView = {
    postMessage: (data) => {
      assert.ok(String(data).startsWith('TW_STATE:'));
      const json = String(data).slice('TW_STATE:'.length);
      posted.push(json);
      sent.push(JSON.parse(json));
      if (relay) relay(json);
    },
  };
  vm.createContext(sandbox);
  for (const s of scripts) vm.runInContext(s, sandbox, { filename: 'farm.js' });

  const frame = (n) => {
    for (let i = 0; i < n; i++) {
      const q = rafQueue;
      rafQueue = [];
      nowMs += 16;
      for (const cb of q) cb(nowMs);
    }
  };
  const tap = (x, y) => {
    const cx = x * UIZOOM;
    const cy = y * UIZOOM + SAFE_TOP;
    for (const f of listeners['touchstart'] || []) f({ changedTouches: [{ clientX: cx, clientY: cy }] });
    for (const f of listeners['touchend'] || []) f({ changedTouches: [{ clientX: cx, clientY: cy }] });
  };
  const lastState = () => {
    for (let i = sent.length - 1; i >= 0; i--) if (sent[i].w) return sent[i].w;
    return null;
  };
  return { html, sandbox, document, body, frame, tap, sent, posted, lastState,
    start: () => goHandler(), applyRemote: (json) => sandbox.window.TwGame.apply(json) };
}

function parse(w) {
  const s = w.split('|');
  assert.equal(s[0], 'v4', '存档版本');
  const plots = [];
  for (let i = 0; i < 12; i++) {
    const t = s[1].substr(i * 6, 6);
    plots.push({
      crop: t.substr(0, 2) === 'zz' ? -1 : parseInt(t.substr(0, 2), 36),
      grow: +t.substr(2, 2), ready: t[4] === '1', water: +t[5],
    });
  }
  const zoo = [];
  const zs = s[2] || '';
  for (let q = 0; q + 7 <= zs.length; q += 7) {
    const u = zs.substr(q, 7);
    zoo.push({
      sp: parseInt(u.substr(0, 2), 36), st: +u[2], gr: +u.substr(3, 2),
      aff: +u[5], pen: (+u[6]) - 2, prog: +u.substr(7, 2),
    });
  }
  const bag = {};
  if (s[7]) for (const kv of s[7].split('.')) { const [k, v] = kv.split(':'); if (k) bag[parseInt(k, 36)] = +v; }
  const house = [];
  if (s[9]) for (const kv of s[9].split('.')) {
    const [i, x, y] = kv.split(':');
    if (i) house.push({ i: parseInt(i, 36), x: parseInt(x, 36), y: parseInt(y, 36) });
  }
  return {
    plots, zoo, house, bag,
    penCount: +s[3], coins: +s[4], hearts: +s[5],
    unlocked: s[6] ? s[6].split('.').filter(Boolean).map((k) => parseInt(k, 36)) : [],
    ownedDecor: s[8] ? s[8].split('.').filter(Boolean).map((k) => parseInt(k, 36)) : [],
    ach: +s[12], sel: +s[13],
  };
}

/* ---------- 测试 ---------- */
test('目录规模：作物/动物/商品/装饰都到位', () => {
  assert.equal(cat.CROP_COUNT, 28, '28 种作物');
  assert.equal(cat.ANIMAL_COUNT, 24, '24 只宠物');
  assert.equal(cat.GOOD_COUNT, 63, '63 件商品');
  assert.equal(cat.DECOR_COUNT, 63, '63 件家具');
  const cropKeys = new Set(cat.FARM_CROPS.map((c) => c.s));
  assert.equal(cropKeys.size, cat.CROP_COUNT, '每种作物都有自己的图');
  const animalKeys = new Set(cat.FARM_ANIMALS.map((a) => a.k));
  assert.equal(animalKeys.size, cat.ANIMAL_COUNT, '每只动物都有自己的图');
  const goodKeys = new Set(cat.MARKET_GOODS.map((g) => g.s));
  assert.equal(goodKeys.size, cat.GOOD_COUNT, '每件商品都有自己的图');
  const furnKeys = new Set(cat.DECOR_ITEMS.map((d) => d.f));
  assert.equal(furnKeys.size, cat.DECOR_COUNT, '每件家具都有自己的图');
  assert.ok(cat.TV_CHANNELS.length >= 5, '电视频道');
  assert.ok(cat.TV_CHANNELS[0].u.includes('cctv1'), 'CCTV1 源');
});

test('农场：播种 → 浇水 → 成熟 → 收获 → 存档', () => {
  const h = boot();
  h.frame(3);
  h.start();
  h.frame(5);
  assert.equal(parse(h.lastState()).unlocked.includes(0), true, '草莓默认解锁');

  const plotY = BOARD_TOP + 30;
  h.tap(200, plotY);
  h.frame(3);
  let st = parse(h.lastState());
  assert.equal(st.plots.filter((p) => p.crop >= 0).length, 1, '播下 1 块');
  assert.ok(st.coins < 520, '扣了种子钱');

  h.tap(200, plotY);          // 浇水
  h.frame(3);
  st = parse(h.lastState());
  assert.equal(st.plots.find((p) => p.crop >= 0).water, 3, '浇水 +3');

  h.frame(900);               // 长熟
  st = parse(h.lastState());
  assert.equal(st.plots.find((p) => p.crop >= 0).ready, true, '成熟');

  const before = st.coins;
  h.tap(200, plotY);          // 收获
  h.frame(3);
  st = parse(h.lastState());
  assert.ok(st.coins > before, '收获加钱');
  assert.equal(st.plots.every((p) => p.crop < 0), true, '收完空田');
});

test('超市：买种子解锁 / 买动物 / 买装饰 / 买零食', () => {
  const h = boot();
  h.frame(3); h.start(); h.frame(3);
  h.tap(266, 20);             // 切到超市
  h.frame(3);
  // 种子页第 1 张卡：直接买（会解锁）
  const cardBuyY = 132 + 10 + 92 - 30 + 12;
  h.tap(215, cardBuyY);
  h.frame(3);
  let st = parse(h.lastState());
  assert.ok(st.unlocked.length >= 2, '多解锁一种作物');

  // 第 2 个标签：动物
  h.tap(100, 94);
  h.frame(3);
  h.tap(100, cardBuyY);
  h.frame(3);
  st = parse(h.lastState());
  assert.equal(st.zoo.length, 1, '买到一只动物');
  assert.equal(st.zoo[0].st, 0, '是宝宝');

  // 装饰页
  h.tap(180, 94);
  h.frame(3);
  const coinsBefore = parse(h.lastState()).coins;
  h.tap(100, cardBuyY);
  h.frame(3);
  st = parse(h.lastState());
  assert.equal(st.ownedDecor.length, 1, '买到一件装饰');
  assert.ok(st.coins < coinsBefore, '花了钱');

  // 零食页
  h.tap(12 + 3 * 74, 94);
  h.frame(3);
  h.tap(100, cardBuyY);
  h.frame(3);
  st = parse(h.lastState());
  assert.ok(Object.keys(st.bag).length >= 1, '包里有了零食');
});

test('动物：喂食长大 / 抚摸加好感 / 繁殖 / 出售 / 当宠物', () => {
  const h = boot();
  h.frame(3); h.start(); h.frame(3);
  h.tap(266, 20); h.frame(3);      // 超市
  h.tap(100, 94); h.frame(3);      // 动物页
  h.tap(100, 212); h.frame(3);     // 买第一只
  h.tap(339, 20); h.frame(3);      // 去动物场景

  const baseY = VH - 108;
  const bw = (VW - 24 - 12) / 4;
  // 选第一张卡
  h.tap(60, 100); h.frame(3);
  // 喂 4 次 → 长大
  for (let i = 0; i < 4; i++) { h.tap(12 + bw + 4 + bw / 2, baseY + 30 + 16); h.frame(6); }
  let st = parse(h.lastState());
  assert.equal(st.zoo[0].st, 1, '喂到成年');

  // 抚摸 → 好感 +1
  h.tap(12 + bw / 2, baseY + 30 + 16); h.frame(40);
  st = parse(h.lastState());
  assert.ok(st.zoo[0].aff >= 2, '抚摸加好感');

  // 买第二只同种 → 繁殖
  h.tap(266, 20); h.frame(3);
  h.tap(100, 212); h.frame(3);
  h.tap(339, 20); h.frame(3);
  h.tap(210, 100); h.frame(3);     // 选第二张卡
  for (let i = 0; i < 4; i++) { h.tap(12 + bw + 4 + bw / 2, baseY + 30 + 16); h.frame(6); }
  h.tap(12 + bw / 2, baseY + 30 + 16); h.frame(6);
  h.tap(12 + bw / 2, baseY + 30 + 16); h.frame(6);
  st = parse(h.lastState());
  const heartsBefore = st.hearts;
  h.tap(12 + bw / 2, baseY + 68 + 16); h.frame(6);   // 繁殖
  st = parse(h.lastState());
  if (st.zoo.length === 3) assert.ok(st.hearts >= heartsBefore, '生宝宝加心动');

  // 当宠物
  h.tap(210, 100); h.frame(3);
  h.tap(12 + 2 * (bw + 4) + bw / 2, baseY + 30 + 16); h.frame(6);
  st = parse(h.lastState());
  assert.ok(st.zoo.some((a) => a.pen === -2), '有一只成了宠物');

  // 卖掉一只
  const n0 = st.zoo.length;
  h.tap(12 + bw + 4 + bw / 2, baseY + 68 + 16); h.frame(6);
  st = parse(h.lastState());
  assert.equal(st.zoo.length, n0 - 1, '卖掉一只');
});

test('小屋：进屋 / 布置家具 / 收起 / 打开电视 / 关闭', () => {
  const h = boot();
  h.frame(3); h.start(); h.frame(3);
  // 先买一件装饰
  h.tap(266, 20); h.frame(3);
  h.tap(180, 94); h.frame(3);
  h.tap(100, 212); h.frame(3);
  // 进屋（一进来就有初始家具，它们也是可编辑的物件）
  h.tap(119, 20); h.frame(3);
  const baseCount = parse(h.lastState()).house.length;
  assert.ok(baseCount >= 5, '进屋自带一套家具，且都算可编辑物件');
  // 布置模式
  h.tap(60, VH - 58 + 16); h.frame(3);
  // 选第一件
  h.tap(30, VH - 62 + 38); h.frame(3);
  // 放到房间中间
  h.tap(200, 560); h.frame(3);
  let st = parse(h.lastState());
  assert.equal(st.house.length, baseCount + 1, '多摆了一件家具');
  assert.equal(st.ownedDecor.length, 0, '已摆的不在待摆清单');
  // 完成布置
  h.tap(VW - 92 + 40, VH - 62 + 37); h.frame(3);
  // 点家具拿起来（移动位置）
  h.tap(200, 560); h.frame(3);
  st = parse(h.lastState());
  assert.equal(st.house.length, baseCount, '点一下就拿起来了');
  assert.equal(st.ownedDecor.length, 1, '回到待摆清单，可以直接放新位置');
  // 拿起后处于布置模式：先结束布置，再点电视
  h.tap(340, VH - 62 + 34); h.frame(3);

  // 电视：进小屋就挂上常驻小屏，点一下请求全屏
  const inlineTv = h.body.children.find((n) => n.id === 'roomtv');
  assert.ok(inlineTv, '小屋里有电视小屏（小屏也能看到在演什么）');
  h.tap(270, 156); h.frame(3);
  assert.equal(inlineTv.fullscreen, true, '点电视会请求全屏');
  h.tap(46, 20); h.frame(3);           // 回农场，小屏要拆掉
  assert.equal(h.body.children.some((n) => n.id === 'roomtv'), false, '离开小屋后拆掉小屏');
});

test('面板：背包送礼 / 任务 / 种子库切换', () => {
  const h = boot();
  h.frame(3); h.start(); h.frame(3);
  // 买一个礼物
  h.tap(266, 20); h.frame(3);
  h.tap(180, 118); h.frame(3);      // 礼物页
  h.tap(100, 212); h.frame(3);
  h.tap(46, 20); h.frame(3);               // 回农场
  h.tap(29, 55); h.frame(3);               // 打开背包
  h.frame(3);
  // 送给TA 按钮在面板第一行右侧
  const before = parse(h.lastState()).hearts;
  h.tap(VW / 2 + 100, VH / 2 - 240 + 58 + 20);
  h.frame(3);
  const st = parse(h.lastState());
  assert.ok(st.hearts > before, '送礼加心动');
});

test('联机：远端状态回灌 + 互助提示不崩', () => {
  const h = boot();
  h.frame(3); h.start(); h.frame(3);
  const saved = h.lastState();
  assert.ok(saved);
  h.applyRemote(JSON.stringify({ t: 5, w: saved, o: [['w', 1], ['pet', 0], ['gift', 3], ['decor', 2], ['breed', 1], ['sell', 0], ['buy', 2]] }));
  h.frame(5);
  const st = parse(h.lastState());
  assert.equal(st.coins, parse(saved).coins, '回灌后金币不变');
});

test('双人同步：B 花钱后 A 会合并并回广播，两边钱数一致', () => {
  let A;
  let B;
  A = boot('A', (json) => B && B.applyRemote(json));
  B = boot('B', (json) => A && A.applyRemote(json));
  A.frame(3); B.frame(3);
  A.start(); B.start();
  A.frame(3); B.frame(3);

  const coinsOf = (h) => h.sandbox.coins;
  const before = coinsOf(B);
  assert.equal(coinsOf(A), before, '开局两边一致');

  // 挑一件"还没解锁/买得起"的（第一个种子默认已解锁，会买不动）
  const items = B.sandbox.marketItems();
  const target = items.find((it) => !it.done && it.p <= B.sandbox.coins);
  assert.ok(target, '要有一件买得起的商品');
  B.sandbox.buyMarket(target);
  B.frame(3);
  const afterB = coinsOf(B);
  assert.ok(afterB < before, 'B 这边扣钱了');

  for (let i = 0; i < 20; i++) { A.frame(2); B.frame(2); }
  assert.equal(coinsOf(A), afterB, 'A 合并后变成扣过钱的数');
  assert.equal(coinsOf(B), afterB, 'B 保持扣过钱的数');
});

test('同步：每个包都带完整状态（否则退出重进会回默认值）', () => {
  const h = boot('A');
  h.frame(3);
  h.start();
  h.frame(120);            // 跑两秒，让它发一批心跳
  assert.ok(h.sent.length > 0, '应该有发包');
  const missing = h.sent.filter((p) => typeof p.w !== 'string' || p.w.length < 10);
  assert.equal(missing.length, 0, '每个包都要带 w（App 就靠它存档）');
  assert.ok(h.sent.every((p) => p.from === 'A' || p.from === 'B'), '每个包都带身份');
});

test('同步：B 的旧心跳不会冲掉 A 的进度，B 的真改动会被采纳', () => {
  let A;
  let B;
  A = boot('A', (json) => B && B.applyRemote(json));
  B = boot('B', (json) => A && A.applyRemote(json));
  A.frame(3); B.frame(3);
  A.start(); B.start();
  A.frame(3); B.frame(3);

  const staleW = B.lastState();          // A 改动之前，B 那边的状态
  const items = A.sandbox.marketItems();
  const target = items.find((it) => !it.done && it.p <= A.sandbox.coins);
  assert.ok(target, '要有一件买得起的商品');
  A.sandbox.buyMarket(target);
  A.frame(3);
  const afterA = A.sandbox.coins;

  // 旧心跳：chg=0 → 不采纳
  A.applyRemote(JSON.stringify({ t: 1, w: staleW, o: [], x: 0, y: 0, from: 'B', chg: 0 }));
  A.frame(3);
  assert.equal(A.sandbox.coins, afterA, 'B 的旧状态不该覆盖 A');

  // 真改动：chg=1 → 采纳
  const newer = JSON.stringify({ t: 2, w: staleW, o: [], x: 0, y: 0, from: 'B', chg: 1 });
  A.applyRemote(newer);
  A.frame(3);
  assert.notEqual(A.sandbox.coins, afterA, 'B 真改了东西就要采纳');
});

test('本机存档：退出重进（同一台手机）金币不会回到初始值', () => {
  const h1 = boot('A');
  h1.frame(3);
  h1.start();
  h1.frame(3);
  // 买一件东西，钱变了
  const items = h1.sandbox.marketItems();
  const target = items.find((it) => !it.done && it.p <= h1.sandbox.coins);
  h1.sandbox.buyMarket(target);
  h1.frame(200);                       // 跑过两秒，触发本机存档
  const spent = h1.sandbox.coins;
  assert.ok(spent < 520, '钱确实花了');
  assert.ok(h1.sandbox.localStorage.getItem('mutual_farm_v1'), '本地存下了世界存档');

  // 模拟"退出再进来"：新开一个 WebView（没有服务端局面）
  const h2 = boot('A');
  h2.frame(3);
  assert.equal(h2.sandbox.coins, spent, '重进后金币从本机存档恢复');
});

test('自动存档：重进能把钱、作物、动物读回来', () => {
  const h1 = boot();
  h1.frame(3); h1.start(); h1.frame(3);
  h1.tap(200, BOARD_TOP + 30); h1.frame(60);
  const saved = h1.posted[h1.posted.length - 1];
  const st1 = parse(JSON.parse(saved).w);

  const h2 = boot();
  h2.frame(3);
  h2.applyRemote(saved);
  h2.start();
  h2.frame(130);
  const st2 = parse(h2.lastState());
  assert.equal(st2.coins, st1.coins, '金币接上');
  assert.equal(st2.plots.filter((p) => p.crop >= 0).length, st1.plots.filter((p) => p.crop >= 0).length, '作物接上');
});
