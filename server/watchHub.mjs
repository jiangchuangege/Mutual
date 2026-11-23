/**
 * 「公共影视」后端：给前端（H5 / 小程序 / 网页）用的 4 组接口。
 *
 * 为什么需要它：
 *   浏览器里的 H5 应用不能直接请求第三方影视 CMS 接口（跨域），也不能直接播别人的 m3u8
 *   （hls.js 拉分片同样受 CORS 限制）。这里提供一个无状态的跨域中转，以及
 *   弹幕 / 评论 / 房间状态 的公共存储（轮询型，2~3 秒级）。
 *
 * 合规：
 *   - 中转只做 CORS 打通，**不落盘、不缓存、不留存任何视频内容**；
 *   - 只有弹幕文本、评论文本、房间播放状态这些几十字节的小数据会存盘；
 *   - 不内置、不推荐任何片源，接口地址与播放直链由使用者自己提供。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const WATCH_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), 'data', 'watch.json');

const LIMITS = {
  relayMaxBytes: 300 * 1024 * 1024, // 单次中转上限 300MB
  relayTimeoutMs: 25000,
  playlistMaxBytes: 6 * 1024 * 1024,
  danmakuMaxLen: 60,
  commentMaxLen: 400,
  nicknameMaxLen: 16,
  danmakuPerKey: 800, // 每个分集最多留 800 条（滚动裁剪）
  commentPerKey: 2000,
  danmakuPerMinute: 20, // 每 IP 每分钟
  commentPerMinute: 6,
  roomPerMinute: 240, // 房主心跳比较频繁
};

/* ================= 持久化（原子写 + 去抖） ================= */
let store = { danmaku: {}, comments: {}, likes: {}, rooms: {}, seq: 1 };
let saveTimer = null;

function load() {
  try {
    if (fs.existsSync(WATCH_FILE)) {
      const raw = JSON.parse(fs.readFileSync(WATCH_FILE, 'utf8'));
      store = {
        danmaku: raw.danmaku ?? {},
        comments: raw.comments ?? {},
        likes: raw.likes ?? {},
        rooms: raw.rooms ?? {},
        seq: typeof raw.seq === 'number' ? raw.seq : 1,
      };
    }
  } catch {
    // 文件坏了就当空的，不要让服务起不来
  }
}
load();

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(WATCH_FILE), { recursive: true });
      const tmp = WATCH_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
      fs.renameSync(tmp, WATCH_FILE);
    } catch {
      // 写盘失败不影响本次请求
    }
  }, 800);
}

/* ================= 小工具 ================= */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges',
  'access-control-max-age': '86400',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...CORS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req, cap = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > cap) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/* 简单限流：每 IP 每路由每分钟计数 */
const buckets = new Map();
function rateLimit(req, key, perMinute) {
  const ip = clientIp(req);
  const bucketKey = ip + '|' + key;
  const now = Date.now();
  const cur = buckets.get(bucketKey);
  if (!cur || now - cur.start > 60_000) {
    buckets.set(bucketKey, { start: now, n: 1 });
    return true;
  }
  cur.n += 1;
  return cur.n <= perMinute;
}

/* 内容过滤：长度、链接、基础敏感词、空白 */
const BANNED = ['傻逼', '操你', '尼玛', 'fuck', 'porn', '赌博', '博彩', '加微信', '代开发票'];

function cleanText(input, maxLen) {
  let s = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/https?:\/\/\S+/gi, '') // 公共区不许出现链接
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  if (!s) return { ok: false, error: '内容不能为空' };
  if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(s)) return { ok: false, error: '内容太单调了' };
  const lower = s.toLowerCase();
  for (const bad of BANNED) {
    if (lower.includes(bad)) return { ok: false, error: '包含不被允许的内容' };
  }
  return { ok: true, value: s };
}

function cleanNick(input) {
  const s = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .trim()
    .slice(0, LIMITS.nicknameMaxLen);
  return s || '路人';
}

function keyOf(raw, fallback = '') {
  const s = String(raw ?? '')
    .replace(/[^0-9a-zA-Z:_\-]/g, '')
    .slice(0, 80);
  return s || fallback;
}

function nextId(prefix) {
  store.seq += 1;
  return prefix + store.seq.toString(36) + Math.random().toString(36).slice(2, 5);
}

/* ================= 跨域中转 ================= */
const BLOCKED_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

function absoluteUrl(raw, base) {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/** 把 m3u8 里所有分片地址改写成经过本中转的绝对地址，解决分片跨域 */
function rewritePlaylist(text, baseUrl, relayBase) {
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      // 处理 #EXT-X-KEY / #EXT-X-MAP 这类带 URI="..." 的标签
      return trimmed.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const abs = absoluteUrl(uri, baseUrl);
        return abs ? `URI="${relayBase}${encodeURIComponent(abs)}"` : _m;
      });
    }
    const abs = absoluteUrl(trimmed, baseUrl);
    return abs ? relayBase + encodeURIComponent(abs) : trimmed;
  });
  return out.join('\n');
}

async function handleRelay(req, res, url) {
  const target = url.searchParams.get('url') || '';
  let parsed = null;
  try {
    parsed = new URL(target);
  } catch {
    sendJson(res, 400, { ok: false, error: '缺少或不合法的 url 参数' });
    return true;
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    sendJson(res, 400, { ok: false, error: '只允许 http/https' });
    return true;
  }
  if (BLOCKED_HOST.test(parsed.hostname) || BLOCKED_HOST.test(parsed.hostname.replace(/^\[|\]$/g, ''))) {
    sendJson(res, 403, { ok: false, error: '不允许访问内网地址' });
    return true;
  }
  if (!rateLimit(req, 'relay', 600)) {
    sendJson(res, 429, { ok: false, error: '请求太频繁' });
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.relayTimeoutMs);
  try {
    const headers = {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
      accept: '*/*',
    };
    const range = req.headers.range;
    if (typeof range === 'string' && range) headers.range = range;
    const upstream = await fetch(parsed.toString(), { headers, redirect: 'follow', signal: controller.signal });

    const ctype = upstream.headers.get('content-type') || 'application/octet-stream';
    const isPlaylist =
      /mpegurl/i.test(ctype) || /\.m3u8?(?:$|\?)/i.test(parsed.pathname + parsed.search);

    if (isPlaylist) {
      const text = (await upstream.text()).slice(0, LIMITS.playlistMaxBytes);
      const relayBase = `${url.origin}/api/relay?url=`;
      const rewritten = rewritePlaylist(text, upstream.url || parsed.toString(), relayBase);
      res.writeHead(upstream.status === 200 ? 200 : upstream.status, {
        ...CORS,
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
      });
      res.end(rewritten);
      return true;
    }

    // 其它（JSON / mp4 / ts 分片）：直接透传，支持 Range
    res.writeHead(upstream.status, {
      ...CORS,
      'content-type': ctype,
      'cache-control': 'no-store',
      ...(upstream.headers.get('content-length')
        ? { 'content-length': upstream.headers.get('content-length') }
        : {}),
      ...(upstream.headers.get('content-range')
        ? { 'content-range': upstream.headers.get('content-range') }
        : {}),
      'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
    });
    if (!upstream.body) {
      res.end();
      return true;
    }
    // 用 pipe 透传：上游断开、客户端断开、超限都不会把进程带崩
    const stream = Readable.fromWeb(upstream.body);
    let sent = 0;
    stream.on('data', (chunk) => {
      sent += chunk.length;
      if (sent > LIMITS.relayMaxBytes) {
        stream.destroy();
      }
    });
    stream.on('error', () => {
      try {
        res.destroy();
      } catch {
        // ignore
      }
    });
    res.on('close', () => {
      try {
        stream.destroy();
      } catch {
        // ignore
      }
      controller.abort();
    });
    stream.pipe(res);
    return true;
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 502, {
        ok: false,
        error: '上游请求失败：' + (err instanceof Error ? err.message : String(err)),
      });
    } else {
      try {
        res.destroy();
      } catch {
        // ignore
      }
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/* ================= 弹幕 ================= */
function danmakuGet(url, res) {
  const key = keyOf(url.searchParams.get('key'));
  if (!key) {
    sendJson(res, 400, { ok: false, error: '缺少 key' });
    return true;
  }
  const since = Number(url.searchParams.get('since') ?? 0) || 0;
  const all = store.danmaku[key] ?? [];
  const items = all.filter((d) => d.n > since).slice(-300);
  sendJson(res, 200, { ok: true, value: { items, serverTime: Date.now(), total: all.length } });
  return true;
}

async function danmakuPost(req, res) {
  if (!rateLimit(req, 'danmaku', LIMITS.danmakuPerMinute)) {
    sendJson(res, 429, { ok: false, error: '发得太快了，歇一下' });
    return true;
  }
  const body = await readJsonBody(req);
  const key = keyOf(body.key);
  if (!key) {
    sendJson(res, 400, { ok: false, error: '缺少 key（片名+年份+集数的哈希）' });
    return true;
  }
  const clean = cleanText(body.text, LIMITS.danmakuMaxLen);
  if (!clean.ok) {
    sendJson(res, 400, { ok: false, error: clean.error });
    return true;
  }
  const at = Math.max(0, Math.min(60 * 60 * 12, Number(body.at) || 0));
  const item = {
    id: nextId('d'),
    n: store.seq,
    key,
    text: clean.value,
    from: cleanNick(body.from),
    at: Math.round(at * 10) / 10,
    ts: Date.now(),
  };
  const list = store.danmaku[key] ?? [];
  list.push(item);
  if (list.length > LIMITS.danmakuPerKey) list.splice(0, list.length - LIMITS.danmakuPerKey);
  store.danmaku[key] = list;
  scheduleSave();
  sendJson(res, 200, { ok: true, value: item });
  return true;
}

/* ================= 评论 ================= */
function commentGet(url, res) {
  const key = keyOf(url.searchParams.get('key'));
  if (!key) {
    sendJson(res, 400, { ok: false, error: '缺少 key' });
    return true;
  }
  const sort = url.searchParams.get('sort') === 'hot' ? 'hot' : 'new';
  const cursor = Number(url.searchParams.get('cursor') ?? 0) || 0;
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20) || 20));
  let list = (store.comments[key] ?? []).slice();
  if (sort === 'hot') {
    list.sort((a, b) => (store.likes[b.id] ?? 0) - (store.likes[a.id] ?? 0) || b.ts - a.ts);
  } else {
    list.sort((a, b) => b.ts - a.ts);
  }
  const start = cursor > 0 ? list.findIndex((c) => c.ts < cursor) : 0;
  const from = start < 0 ? 0 : start;
  const page = list.slice(from, from + limit).map((c) => ({
    ...c,
    likes: store.likes[c.id] ?? 0,
    hidden: (c.reports ?? 0) >= 3,
  }));
  const nextCursor = page.length === limit ? page[page.length - 1].ts : 0;
  sendJson(res, 200, { ok: true, value: { items: page, nextCursor, total: list.length } });
  return true;
}

async function commentPost(req, res) {
  if (!rateLimit(req, 'comment', LIMITS.commentPerMinute)) {
    sendJson(res, 429, { ok: false, error: '发得太快了，歇一下' });
    return true;
  }
  const body = await readJsonBody(req);
  const key = keyOf(body.key);
  if (!key) {
    sendJson(res, 400, { ok: false, error: '缺少 key' });
    return true;
  }
  const clean = cleanText(body.text, LIMITS.commentMaxLen);
  if (!clean.ok) {
    sendJson(res, 400, { ok: false, error: clean.error });
    return true;
  }
  const item = {
    id: nextId('c'),
    key,
    text: clean.value,
    from: cleanNick(body.from),
    spoiler: Boolean(body.spoiler),
    ts: Date.now(),
    reports: 0,
  };
  const list = store.comments[key] ?? [];
  list.push(item);
  if (list.length > LIMITS.commentPerKey) list.splice(0, list.length - LIMITS.commentPerKey);
  store.comments[key] = list;
  scheduleSave();
  sendJson(res, 200, { ok: true, value: { ...item, likes: 0 } });
  return true;
}

async function commentLike(req, res) {
  const body = await readJsonBody(req);
  const id = String(body.id ?? '');
  if (!id) {
    sendJson(res, 400, { ok: false, error: '缺少 id' });
    return true;
  }
  store.likes[id] = Math.max(0, (store.likes[id] ?? 0) + (body.undo ? -1 : 1));
  scheduleSave();
  sendJson(res, 200, { ok: true, value: { id, likes: store.likes[id] } });
  return true;
}

async function commentReport(req, res) {
  const body = await readJsonBody(req);
  const id = String(body.id ?? '');
  if (!id) {
    sendJson(res, 400, { ok: false, error: '缺少 id' });
    return true;
  }
  for (const key of Object.keys(store.comments)) {
    const hit = store.comments[key].find((c) => c.id === id);
    if (hit) {
      hit.reports = (hit.reports ?? 0) + 1;
      scheduleSave();
      sendJson(res, 200, { ok: true, value: { id, reports: hit.reports } });
      return true;
    }
  }
  sendJson(res, 404, { ok: false, error: '评论不存在' });
  return true;
}

/* ================= 近似一起看（房间状态轮询） ================= */
async function roomPost(req, res) {
  if (!rateLimit(req, 'room', LIMITS.roomPerMinute)) {
    sendJson(res, 429, { ok: false, error: '心跳太频繁' });
    return true;
  }
  const body = await readJsonBody(req);
  const room = keyOf(body.room);
  if (!room) {
    sendJson(res, 400, { ok: false, error: '缺少 room' });
    return true;
  }
  const now = Date.now();
  const prev = store.rooms[room] ?? { viewers: {} };
  const from = keyOf(body.from) || 'anon';
  const viewers = { ...(prev.viewers ?? {}) };
  viewers[from] = now;
  for (const k of Object.keys(viewers)) if (now - viewers[k] > 60_000) delete viewers[k];

  const state = body.state
    ? {
        leader: keyOf(body.state.leader) || from,
        playing: Boolean(body.state.playing),
        pos: Math.max(0, Number(body.state.pos) || 0),
        rate: Math.max(0.25, Math.min(4, Number(body.state.rate) || 1)),
        updatedAt: now,
        seq: store.seq,
      }
    : prev.state ?? null;

  store.rooms[room] = {
    ...prev,
    state,
    viewers,
    updatedAt: now,
    online: Object.keys(viewers).length,
  };
  scheduleSave();
  sendJson(res, 200, { ok: true, value: store.rooms[room] });
  return true;
}

function roomGet(url, res) {
  const room = keyOf(url.searchParams.get('room'));
  if (!room) {
    sendJson(res, 400, { ok: false, error: '缺少 room' });
    return true;
  }
  const now = Date.now();
  const cur = store.rooms[room] ?? { state: null, viewers: {} };
  const viewers = { ...(cur.viewers ?? {}) };
  for (const k of Object.keys(viewers)) if (now - viewers[k] > 60_000) delete viewers[k];
  sendJson(res, 200, {
    ok: true,
    value: { state: cur.state ?? null, online: Object.keys(viewers).length, serverTime: now },
  });
  return true;
}

/* ================= 路由入口 ================= */
export async function handleWatch(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/relay') && !p.startsWith('/api/watch')) return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return true;
  }

  if (p === '/api/relay' && (req.method === 'GET' || req.method === 'HEAD')) return handleRelay(req, res, url);

  if (p === '/api/watch/danmaku' && req.method === 'GET') return danmakuGet(url, res);
  if (p === '/api/watch/danmaku' && req.method === 'POST') return danmakuPost(req, res);
  if (p === '/api/watch/comment' && req.method === 'GET') return commentGet(url, res);
  if (p === '/api/watch/comment' && req.method === 'POST') return commentPost(req, res);
  if (p === '/api/watch/comment/like' && req.method === 'POST') return commentLike(req, res);
  if (p === '/api/watch/comment/report' && req.method === 'POST') return commentReport(req, res);
  if (p === '/api/watch/room' && req.method === 'GET') return roomGet(url, res);
  if (p === '/api/watch/room' && req.method === 'POST') return roomPost(req, res);

  sendJson(res, 404, { ok: false, error: '没有这个接口' });
  return true;
}

export function watchStats() {
  return {
    danmakuKeys: Object.keys(store.danmaku).length,
    commentKeys: Object.keys(store.comments).length,
    rooms: Object.keys(store.rooms).length,
  };
}

/* 保险丝：中转过程里任何漏网的 promise 异常都不许把服务带崩 */
process.on('unhandledRejection', () => {});
