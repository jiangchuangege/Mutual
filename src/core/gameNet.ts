/**
 * 双人联机运行层（Netplay Runtime）。
 *
 * 用户要的："从别的地方下载的游戏，直接传进游戏库，还要能双人玩"。
 * 下载来的单文件 HTML（itch.io / 网页小游戏）根本不知道我们存在，
 * 所以这一层**不改游戏代码**也要让它两个人一起玩：
 *
 *   1. **输入镜像**：我把自己的键盘/触摸事件压成很小的包发给对方，
 *      对方的页面里合成同样的事件 → 两台手机的同一个游戏收到同一串操作。
 *      两人各用各自那一半操作（一个用方向键、一个用 WASD）时就是真正的双人。
 *   2. **同种子随机**：`Math.random` 换成同一颗种子的可复现随机数，
 *      两边跑出来的怪、掉落、洗牌顺序完全一样，画面才不会各跑各的。
 *   3. **慢速兜底**：游戏如果自己实现了 `TwGame.send/apply`（我们的内置样例、
 *      或者按接口写过的游戏），继续走"整段局面同步"，比输入镜像更稳。
 *
 * 界面里显示的状态条就是这一层报上去的：已连接 / 等待对方 / 单机。
 *
 * 传输：`TW_NET:` 前缀消息 → App → 服务端 → 对方的 WebView → `TwNet.applyRemote`。
 * 服务端从不 eval 陌生代码，只转发字符串。
 */

export type NetMode = 'auto' | 'input' | 'state';

export interface NetOptions {
  /** 我在这一对里的角色：A 是世界的写入者 */
  role: 'A' | 'B';
  /** 同一对、同一个游戏 → 两台手机得到同一颗种子 */
  seed: number;
  /** 输入镜像的节流（毫秒）；太小会打满带宽，太大手感会有延迟 */
  throttleMs?: number;
  /** 关掉输入镜像（只用 TwGame 状态同步的游戏） */
  mode?: NetMode;
}

/** 默认节流：60ms ≈ 每秒 16 个包，够跟手也不至于刷爆 */
export const DEFAULT_THROTTLE_MS = 60;

/* ============================ 纯函数（可测） ============================ */

/** 稳定的字符串 → 32 位种子（两台手机对同一对 id 必须得到同一个值） */
export function seedOf(text: string): number {
  const s = String(text ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h || 1) >>> 0;
}

/** 和注入到页面里的那一份完全一样的随机数发生器（线性同余，够用且便宜） */
export function makePrng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 一个输入事件压成一行：类型|键|x|y（坐标保留 3 位，省带宽） */
export function encodeInput(e: {
  type: string;
  key?: string;
  code?: string;
  x?: number;
  y?: number;
}): string {
  const type = String(e.type ?? '').slice(0, 12);
  const key = String(e.key ?? e.code ?? '').slice(0, 12).replace(/[|\n]/g, '');
  const x = typeof e.x === 'number' && Number.isFinite(e.x) ? e.x.toFixed(3) : '';
  const y = typeof e.y === 'number' && Number.isFinite(e.y) ? e.y.toFixed(3) : '';
  return [type, key, x, y].join('|');
}

export function decodeInput(line: string): { type: string; key: string; x: number | null; y: number | null } | null {
  const parts = String(line ?? '').split('|');
  if (parts.length < 2) return null;
  const type = parts[0];
  if (!type) return null;
  const key = parts[1] ?? '';
  const x = parts[2] === '' || parts[2] === undefined ? null : Number(parts[2]);
  const y = parts[3] === '' || parts[3] === undefined ? null : Number(parts[3]);
  return { type, key, x: Number.isFinite(x as number) ? (x as number) : null, y: Number.isFinite(y as number) ? (y as number) : null };
}

/** 一包输入：{ t:'i', s:起始序号, q:[行...] } */
export interface NetInputPacket {
  t: 'i';
  s: number;
  q: string[];
}

/** 一包自定义动作：{ t:'a', d:任意 JSON } */
export interface NetActionPacket {
  t: 'a';
  d: unknown;
}

/** 一包状态：{ t:'s', d:局面 JSON 字符串 } */
export interface NetStatePacket {
  t: 's';
  d: string;
}

export type NetPacket = NetInputPacket | NetActionPacket | NetStatePacket;

/** 序列化（页面 → App 的字符串） */
export function encodePacket(p: NetPacket): string {
  return JSON.stringify(p);
}

/**
 * 解析对方的包。任何不认识/坏掉的内容都返回 null，
 * 绝不让一个坏包把游戏页面搞崩（对方可能是旧版本）。
 */
export function decodePacket(text: string): NetPacket | null {
  const raw = String(text ?? '').trim();
  if (!raw || raw[0] !== '{') return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const t = o.t;
  if (t === 'i') {
    const s = Number(o.s);
    const q = Array.isArray(o.q) ? (o.q.filter((x) => typeof x === 'string') as string[]) : null;
    if (!Number.isFinite(s) || !q) return null;
    // 一条包最多 200 下操作：多出来的直接丢掉，别让对方一个包把画面卡死
    if (q.length === 0) return null;
    return { t: 'i', s: Math.max(0, Math.round(s)), q: q.slice(0, 200) };
  }
  if (t === 'a') return { t: 'a', d: o.d ?? null };
  if (t === 's') {
    if (typeof o.d !== 'string' || o.d.length > 2_000_000) return null;
    return { t: 's', d: o.d };
  }
  return null;
}

/**
 * 把"游戏自己声明的清单"读出来。
 *
 * 下载来的游戏可以在 HTML 里写一行
 *   <!--mutual-game {"title":"像素农场","players":2,"scene":"草地"}-->
 * 我们就能在游戏库里显示正确名字，而不是文件名。
 */
export function readGameManifest(html: string): {
  title: string | null;
  players: 1 | 2 | null;
  controls: string | null;
} {
  const s = String(html ?? '');
  const m = /<!--\s*mutual-game\s*(\{[\s\S]*?\})\s*-->/i.exec(s);
  let parsed: Record<string, unknown> = {};
  if (m) {
    try {
      parsed = JSON.parse(m[1]) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 40) : null;
  const players = parsed.players === 1 ? 1 : parsed.players === 2 ? 2 : null;
  const controls = typeof parsed.controls === 'string' ? parsed.controls.slice(0, 80) : null;
  return { title, players, controls };
}

/** 从文件名推一个能看的标题（itch 下载常见 `game-1.0.0.html`） */
export function titleFromFileName(name: string): string {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const noExt = base.replace(/\.(html?|zip|apk)$/i, '');
  const cleaned = noExt.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || '导入的游戏').slice(0, 40);
}

/* ============================ 注入到页面的运行层 ============================ */

const NET_SHIM = String.raw`
(function(){
  if (window.__TW_NET__) return;
  window.__TW_NET__ = true;

  var ROLE = __ROLE__;
  var SEED = __SEED__ >>> 0;
  var MODE = '__MODE__';
  var THROTTLE = __THROTTLE__;

  /* ---- 1. 同种子随机：两台手机跑出同一个世界 ---- */
  try {
    var _s = SEED || 1;
    Math.random = function(){
      _s = (Math.imul(_s, 1664525) + 1013904223) >>> 0;
      return _s / 4294967296;
    };
  } catch(e) {}

  var RN = window.ReactNativeWebView;
  var seq = 0;            // 我发出去的输入序号
  var rxSeq = 0;          // 对方发来的最大序号（去重用）
  var lastPostAt = 0;
  var queue = [];         // 待打包的输入
  var flushTimer = 0;
  var peers = 0;          // 收到过对方多少个包
  var lastRxAt = 0;
  var synth = false;      // 正在合成"对方的事件"，别再次采集

  function now(){ return Date.now(); }

  /* ---- 2. 传输：一包一行字符串，App 负责转发 ---- */
  function post(obj){
    if (!RN || !RN.postMessage) return;
    try { RN.postMessage('TW_NET:' + JSON.stringify(obj)); } catch(e) {}
  }

  function flush(){
    flushTimer = 0;
    if (!queue.length) return;
    if (now() - lastPostAt < THROTTLE) {
      flushTimer = setTimeout(flush, THROTTLE);
      return;
    }
    lastPostAt = now();
    var q = queue; queue = [];
    post({ t:'i', s: seq, q: q });
    seq += q.length;
  }

  function collect(line){
    if (MODE === 'state') return;   // 只走状态同步的游戏不镜像输入
    queue.push(line);
    if (queue.length >= 24) { if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; } flush(); return; }
    if (!flushTimer) flushTimer = setTimeout(flush, THROTTLE);
  }

  /* ---- 3. 采集：键盘 + 指针 + 触摸 ---- */
  function norm(n, total){ return total > 0 ? Math.max(0, Math.min(1, n / total)) : 0; }

  window.addEventListener('keydown', function(e){
    if (synth) return;
    collect(e.type + '|' + (e.key || e.code || ''));
  }, true);
  window.addEventListener('keyup', function(e){
    if (synth) return;
    collect(e.type + '|' + (e.key || e.code || ''));
  }, true);

  var down = false, lastMove = 0;
  window.addEventListener('pointerdown', function(e){
    if (synth) return;
    down = true;
    collect('pointerdown||' + norm(e.clientX, innerWidth).toFixed(3) + '|' + norm(e.clientY, innerHeight).toFixed(3));
  }, true);
  window.addEventListener('pointermove', function(e){
    if (synth || !down) return;
    var t = now();
    if (t - lastMove < 50) return;   // 拖动最多 20 帧/秒
    lastMove = t;
    collect('pointermove||' + norm(e.clientX, innerWidth).toFixed(3) + '|' + norm(e.clientY, innerHeight).toFixed(3));
  }, true);
  window.addEventListener('pointerup', function(e){
    if (synth) return;
    down = false;
    collect('pointerup||' + norm(e.clientX, innerWidth).toFixed(3) + '|' + norm(e.clientY, innerHeight).toFixed(3));
  }, true);

  /* ---- 4. 回放：在本地合成同样的输入，让游戏以为是自己按的 ---- */
  function fire(target, ev){ try { target.dispatchEvent(ev); } catch(e) {} }

  function replay(line){
    var p = String(line).split('|');
    var type = p[0], key = p[1] || '';
    var hasXY = p.length >= 4 && p[2] !== '';
    synth = true;
    try {
      if (type === 'keydown' || type === 'keyup') {
        var kd = new KeyboardEvent(type, { key: key, code: key, bubbles: true, cancelable: true });
        fire(document, kd);
        fire(window, new KeyboardEvent(type, { key: key, code: key, bubbles: true, cancelable: true }));
      } else {
        var x = hasXY ? Number(p[2]) * innerWidth : innerWidth / 2;
        var y = hasXY ? Number(p[3]) * innerHeight : innerHeight / 2;
        var ctor = window.PointerEvent || window.MouseEvent;
        var pd = new ctor(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1 });
        fire(document, pd);
        var cv = document.querySelector('canvas');
        if (cv) fire(cv, new ctor(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1 }));
      }
    } catch(e) {}
    synth = false;
  }

  /* ---- 5. 给游戏用的显式接口（想自己控制同步就调这些） ---- */
  var actionHandlers = [];
  var stateHandlers = [];
  var actionSender = null;

  var api = {
    role: ROLE,
    /** 对方是不是在线（最近 6 秒收到过包） */
    get connected(){ return now() - lastRxAt < 6000; },
    /** 收到过对方多少包（调试用） */
    get packets(){ return peers; },
    /** 发一个自定义动作（游戏自己决定里面放什么） */
    send: function(data){
      if (typeof data === 'function') { actionSender = data; return; }
      post({ t:'a', d: typeof data === 'string' ? data : data });
    },
    /** 对方动作到了 */
    onAction: function(fn){ if (typeof fn === 'function') actionHandlers.push(fn); },
    /** 上报局面（字符串或对象） */
    state: function(data){
      post({ t:'s', d: typeof data === 'string' ? data : JSON.stringify(data) });
    },
    onState: function(fn){ if (typeof fn === 'function') stateHandlers.push(fn); },
    /** App 调用：把对方的包喂进来 */
    applyRemote: function(text){
      var pkt;
      try { pkt = JSON.parse(String(text)); } catch(e) { return; }
      if (!pkt || typeof pkt !== 'object') return;
      lastRxAt = now();
      peers += 1;
      if (pkt.t === 'i') {
        var s = Number(pkt.s) || 0;
        if (s + (pkt.q ? pkt.q.length : 0) <= rxSeq) return;   // 老的重复包，丢掉
        var list = pkt.q || [];
        for (var i = 0; i < list.length; i++) replay(list[i]);
        rxSeq = Math.max(rxSeq, s + list.length);
        return;
      }
      if (pkt.t === 'a') {
        for (var a = 0; a < actionHandlers.length; a++) { try { actionHandlers[a](pkt.d); } catch(e) {} }
        return;
      }
      if (pkt.t === 's') {
        for (var b = 0; b < stateHandlers.length; b++) { try { stateHandlers[b](pkt.d); } catch(e) {} }
        /* 也顺手喂给 TwGame 的老接口，内置样例那套写法继续能用 */
        try { if (window.TwGame && window.TwGame.apply) window.TwGame.apply(pkt.d); } catch(e) {}
        return;
      }
    },
    /** 调试：对方最近一次发包距现在多久 */
    latency: function(){ return lastRxAt ? now() - lastRxAt : -1; },
  };
  window.TwNet = api;

  /* 心跳：App 靠它判断"对方在不在"，也顺手带一下自己的角色 */
  setInterval(function(){ post({ t:'k', r: ROLE, s: seq }); }, 2000);

  /* 老写法兼容：window.onRemoteNet(pkt) */
  var legacy = window.onRemoteNet;
  if (typeof legacy === 'function') api.onAction(legacy);
})();
`;

/** 生成注入用的联机层源码 */
export function buildNetShim(opts: NetOptions): string {
  const role = opts.role === 'B' ? 'B' : 'A';
  const mode: NetMode = opts.mode ?? 'auto';
  const throttle = Math.max(16, Math.min(400, Math.round(opts.throttleMs ?? DEFAULT_THROTTLE_MS)));
  return NET_SHIM.replace(/__ROLE__/g, `'${role}'`)
    .replace(/__SEED__/g, String(seedOf(String(opts.seed >>> 0) || '1')))
    .replace(/__MODE__/g, mode)
    .replace(/__THROTTLE__/g, String(throttle));
}

/**
 * 把联机层拼到页面里。
 * 顺序很重要：**先**放联机层（它会替换 Math.random），**再**放游戏代码，
 * 否则游戏已经把自己算出来的随机数用在初始化里了。
 */
export function injectNetShim(html: string, opts: NetOptions): string {
  const tag = `<script>${buildNetShim(opts)}</script>`;
  const raw = String(html ?? '');
  const head = /<head[^>]*>/i.exec(raw);
  if (head) {
    const at = head.index + head[0].length;
    return `${raw.slice(0, at)}${tag}${raw.slice(at)}`;
  }
  return `${tag}${raw}`;
}

/** 给"想自己写双人逻辑"的游戏看的接口说明（可以复制给 AI） */
export const NET_API_DOC = `双人联机接口（可选，不写也能双人：框架会自动镜像两个人的操作）
1. 我是谁：TwNet.role === 'A' | 'B'；对方在线判断：TwNet.connected
2. 发自定义动作：TwNet.send({...})（任何 JSON 都行，越短越好）
3. 收对方动作：TwNet.onAction(function(data){ ... })
4. 上报局面：TwNet.state(局面对象或 JSON 字符串) → 对方经 TwNet.onState(function(json){...}) 收到
5. 随机数：不要自己 new 随机源，直接用 Math.random()，双方种子相同、结果一致
6. 双人分工建议：A 控制主角/左边半边，B 控制另一个角色/右边半边`;
