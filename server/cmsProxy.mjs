/**
 * 片库后端（BFF）：让前端"零输入、打开就能看"。
 *
 * 前端只调本文件暴露的接口；第三方 CMS 接口由服务端去拉（服务端 fetch 没有跨域限制），
 * 解析出的播放地址再经 /api/relay 中转，浏览器（含安卓 Chrome 的 hls.js）才能播。
 *
 * 合规：不落盘、不缓存任何视频内容；只有列表/详情这些元数据在内存里放 5~10 分钟。
 * 接口列表放在 server/config/cms.json（可热改，不写进前端包）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { shortKey, appendQuery, parsePlayUrls, normalizeList, extractList } from '../dist-core/cmsServer.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_FILE = path.join(HERE, 'config', 'cms.json');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-max-age': '86400',
};

function sendJson(res, status, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...CORS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...(extra ?? {}),
  });
  res.end(body);
}

/* ================= 接口清单（服务端配置，前端看不到完整 URL） ================= */
let apis = [];
let configMtime = 0;

function loadConfig(force) {
  try {
    const st = fs.statSync(CONFIG_FILE);
    if (!force && st.mtimeMs === configMtime) return;
    configMtime = st.mtimeMs;
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    apis = (raw.apis ?? [])
      .filter((a) => a && typeof a.url === 'string' && /^https?:\/\//i.test(a.url) && a.enabled !== false)
      .map((a, i) => ({
        id: String(a.id ?? 'src' + (i + 1)),
        url: a.url,
        label: String(a.label ?? '源' + (i + 1)),
      }));
  } catch {
    apis = [];
  }
}

const health = new Map(); // id -> {ok, at, status, ms}

async function checkOne(api, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(appendQuery(api.url, { ac: 'detail', pg: 1 }), {
      headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/124 Mobile Safari/537.36' },
      signal: controller.signal,
    });
    const ok = res.ok;
    health.set(api.id, { ok, at: Date.now(), status: res.status, ms: Date.now() - started });
    return ok;
  } catch (err) {
    health.set(api.id, {
      ok: false,
      at: Date.now(),
      status: 0,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 健康源优先，最多试 3 个 */
async function healthyOrder() {
  loadConfig();
  const fresh = [];
  const stale = [];
  for (const api of apis) {
    const h = health.get(api.id);
    if (h && Date.now() - h.at < 5 * 60 * 1000) (h.ok ? fresh : stale).push(api);
    else fresh.push(api);
  }
  const ordered = fresh.concat(stale);
  // 没检查过的（在 fresh 里但没 health）优先探一次
  const out = [];
  for (const api of ordered.slice(0, 3)) {
    const h = health.get(api.id);
    if (!h || Date.now() - h.at >= 5 * 60 * 1000) await checkOne(api);
    out.push(api);
  }
  return out;
}

async function fetchJson(url, timeoutMs = 8000, retry = 1) {
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/124 Mobile Safari/537.36' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      return JSON.parse(text);
    } catch (err) {
      if (attempt === retry) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('unreachable');
}

/* ================= 缓存（只有元数据，5~10 分钟） ================= */
const cache = new Map();
const TTL_LIST = 5 * 60 * 1000;
const TTL_DETAIL = 10 * 60 * 1000;

function cacheGet(key, ttl) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 400) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

/* ================= 接口实现 ================= */
function pickTotal(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const page = Number(raw.page ?? raw.pg ?? 1) || 1;
  const pageCount = Number(raw.pagecount ?? raw.total_page ?? raw.page_count ?? raw.pages ?? 0) || 0;
  const total = Number(raw.total ?? raw.recordcount ?? raw.total_count ?? 0) || 0;
  return { page, pageCount, total };
}

async function cmsList(url, res) {
  const pg = Math.max(1, Number(url.searchParams.get('pg') ?? 1) || 1);
  const wd = String(url.searchParams.get('wd') ?? '').trim().slice(0, 40);
  const t = String(url.searchParams.get('t') ?? '').trim().slice(0, 20);
  const prefer = String(url.searchParams.get('prefer') ?? '').trim();

  const candidates = await healthyOrder();
  if (!candidates.length) {
    sendJson(res, 200, {
      ok: false,
      error: '服务端还没有配置片源接口（server/config/cms.json）',
      items: [],
      page: pg,
      pageCount: 0,
      total: 0,
    });
    return true;
  }
  if (prefer) candidates.sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : 0));

  const tried = [];
  for (const api of candidates) {
    const upstream = appendQuery(api.url, { ac: 'detail', pg, wd, t });
    const cacheKey = 'list|' + upstream;
    const cached = cacheGet(cacheKey, TTL_LIST);
    if (cached) {
      sendJson(res, 200, { ...cached, source: api.id, label: api.label, cache: 'hit' }, { 'x-cache': 'hit' });
      return true;
    }
    try {
      const payload = await fetchJson(upstream);
      const rawList = extractList(payload);
      const items = normalizeList(rawList, api.id).map((it) => ({ ...it, label: api.label }));
      const { page, pageCount, total } = pickTotal(payload);
      const value = { ok: true, items, page: page || pg, pageCount, total, source: api.id, label: api.label };
      cacheSet(cacheKey, value);
      sendJson(res, 200, value, { 'x-cache': 'miss' });
      return true;
    } catch (err) {
      tried.push({ id: api.id, label: api.label, error: err instanceof Error ? err.message : String(err) });
      health.set(api.id, { ok: false, at: Date.now(), status: 0 });
    }
  }
  sendJson(res, 200, { ok: false, error: '所有片源暂时不可用', tried, items: [], page: pg, pageCount: 0, total: 0 });
  return true;
}

async function cmsDetail(url, res, origin) {
  const id = String(url.searchParams.get('id') ?? '').trim().slice(0, 40);
  const source = String(url.searchParams.get('source') ?? '').trim();
  const name = String(url.searchParams.get('name') ?? '').trim().slice(0, 60);
  const year = String(url.searchParams.get('year') ?? '').trim().slice(0, 4);
  if (!id && !name) {
    sendJson(res, 400, { ok: false, error: '缺少 id 或 name' });
    return true;
  }
  const candidates = await healthyOrder();
  if (source) candidates.sort((a, b) => (a.id === source ? -1 : b.id === source ? 1 : 0));

  const relay = (u) => `${origin}/api/play?url=${encodeURIComponent(u)}`;
  const tried = [];

  for (const api of candidates) {
    if (!id && !name) break;
    const upstream = id
      ? appendQuery(api.url, { ac: 'detail', ids: id })
      : appendQuery(api.url, { ac: 'detail', wd: name });
    const cacheKey = 'detail|' + upstream;
    try {
      let payload = cacheGet(cacheKey, TTL_DETAIL);
      if (!payload) {
        payload = await fetchJson(upstream);
        cacheSet(cacheKey, payload);
      }
      const list = extractList(payload);
      // 优先 id 精确匹配，其次同名同年
      const target =
        list.find((it) => String((it && it.vod_id) ?? '') === id) ??
        list.find((it) => {
          const n = String((it && it.vod_name) ?? '').trim();
          const y = String((it && it.vod_year) ?? '').trim().slice(0, 4);
          return Boolean(name) && n === name && (!year || y === year);
        }) ??
        (id ? null : list[0]);
      if (!target) continue;

      const rec = target || {};
      const lines = parsePlayUrls(String(rec.vod_play_from ?? ''), String(rec.vod_play_url ?? ''));
      if (!lines.length) {
        tried.push({ id: api.id, label: api.label, error: '没有可直链播放的线路' });
        continue;
      }
      const item = {
        key: shortKey(String(rec.vod_name ?? name), String(rec.vod_year ?? year)),
        name: String(rec.vod_name ?? name),
        year: String(rec.vod_year ?? year).slice(0, 4),
        pic: String(rec.vod_pic ?? ''),
        remarks: String(rec.vod_remarks ?? ''),
        type: String(rec.vod_type_name ?? rec.vod_class ?? ''),
        desc: String(rec.vod_content ?? rec.vod_blurb ?? '').replace(/<[^>]+>/g, '').slice(0, 1200),
        source: api.id,
        label: api.label,
      };
      const linesOut = lines.map((ln) => ({
        name: ln.name,
        episodes: ln.episodes.map((ep) => ({
          name: ep.name,
          format: ep.format,
          url: ep.url,
          playUrl: relay(ep.url),
        })),
      }));
      sendJson(res, 200, { ok: true, item, lines: linesOut, source: api.id, label: api.label });
      return true;
    } catch (err) {
      tried.push({ id: api.id, label: api.label, error: err instanceof Error ? err.message : String(err) });
    }
  }

  sendJson(res, 200, {
    ok: false,
    error: '该片暂时没有可用播放源',
    tried,
    item: { key: shortKey(name, year), name, year },
    lines: [],
  });
  return true;
}

async function cmsApis(res) {
  loadConfig();
  for (const api of apis) await checkOne(api);
  const list = apis.map((api) => {
    const h = health.get(api.id) ?? { ok: false, status: 0 };
    return { id: api.id, label: api.label, healthy: Boolean(h.ok), status: h.status ?? 0 };
  });
  sendJson(res, 200, { ok: true, value: list, healthy: list.filter((a) => a.healthy).length });
  return true;
}

/* ================= 路由入口 ================= */
export async function handleCms(req, res, url) {
  if (!url.pathname.startsWith('/api/cms')) return false;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return true;
  }
  const origin = url.origin;
  if (url.pathname === '/api/cms/apis' && req.method === 'GET') return cmsApis(res);
  if (url.pathname === '/api/cms/list' && req.method === 'GET') return cmsList(url, res);
  if (url.pathname === '/api/cms/detail' && req.method === 'GET') return cmsDetail(url, res, origin);
  if (url.pathname === '/api/cms/reload' && req.method === 'POST') {
    loadConfig(true);
    health.clear();
    sendJson(res, 200, { ok: true, value: { apis: apis.length } });
    return true;
  }
  sendJson(res, 404, { ok: false, error: '没有这个接口' });
  return true;
}

export function cmsStatus() {
  loadConfig();
  return {
    apis: apis.length,
    healthy: apis.filter((a) => (health.get(a.id) ?? {}).ok).length,
    cacheEntries: cache.size,
  };
}
