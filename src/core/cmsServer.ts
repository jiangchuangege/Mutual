/**
 * 影视 CMS 的服务端解析（纯函数，可单测）。
 *
 * 前端只填一个"苹果CMS(MacCMS)"接口地址，服务端负责：
 *  - 拉列表/详情（服务端 fetch 没有跨域问题）
 *  - 解析 vod_play_from / vod_play_url 成"线路 + 集数 + 可直链地址"
 *  - 生成跨片源稳定的 key（片名+年份的哈希），供弹幕/评论/房间分组
 */

export interface CmsLine {
  name: string;
  episodes: { name: string; url: string; format: string }[];
}

export interface CmsItem {
  key: string;
  id: string;
  name: string;
  year: string;
  pic: string;
  remarks: string;
  type: string;
  api: string;
}

const PLAYABLE = /\.(m3u8|mp4|flv|ts)(?:$|[?#])/i;

/** 短哈希（djb2 变体）→ 8 位 base36；同片名+年份必得同值，跨接口稳定 */
export function shortKey(name: string, year: string): string {
  const s = (String(name ?? '').trim() + '|' + String(year ?? '').trim()).toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return ('0000000' + h.toString(36)).slice(-8);
}

/** 把参数拼到接口地址上（接口地址可能已带 ?） */
export function appendQuery(api: string, params: Record<string, string | number | undefined>): string {
  const base = String(api ?? '').trim();
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  if (!parts.length) return base;
  return base + (base.includes('?') ? '&' : '?') + parts.join('&');
}

/** 这条地址浏览器能不能直接播，以及格式 */
export function playableFormat(url: string): 'm3u8' | 'mp4' | 'flv' | 'ts' | '' {
  const s = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  const m = PLAYABLE.exec(s);
  if (!m) return '';
  const ext = m[1].toLowerCase();
  return ext === 'm3u8' ? 'm3u8' : ext === 'mp4' ? 'mp4' : ext === 'flv' ? 'flv' : 'ts';
}

/**
 * 解析 vod_play_url / vod_play_from。
 *
 * 格式：线路之间用 "$$$"，集之间用 "#"，集名和地址之间用 "$"
 * 例：vod_play_from = "线路1$$$线路2"
 *     vod_play_url  = "第1集$https://a/1.m3u8#第2集$https://a/2.m3u8$$$第1集$https://b/1.m3u8"
 * 只有能直接播的地址才会保留（网页播放页/磁力/加密串一律丢掉）。
 */
export function parsePlayUrls(playFrom: string, playUrl: string): CmsLine[] {
  const fromRaw = String(playFrom ?? '').split('$$$');
  const urlRaw = String(playUrl ?? '').split('$$$');
  const lines: CmsLine[] = [];

  urlRaw.forEach((seg, idx) => {
    const episodes: CmsLine['episodes'] = [];
    const eps = String(seg ?? '').split('#');
    eps.forEach((ep, i) => {
      const text = String(ep ?? '').trim();
      if (!text) return;
      const cut = text.indexOf('$');
      const name = cut >= 0 ? text.slice(0, cut).trim() : '';
      const url = cut >= 0 ? text.slice(cut + 1).trim() : text;
      const format = playableFormat(url);
      if (!format) return;
      episodes.push({
        name: name || '第' + (i + 1) + '集',
        url,
        format,
      });
    });
    if (!episodes.length) return;
    const label = (fromRaw[idx] ?? '').trim() || '线路' + (idx + 1);
    lines.push({ name: label, episodes });
  });

  return lines;
}

function pickString(item: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/** 把一条 vod 归一化成前端要的最小对象 */
export function normalizeVod(item: unknown, api: string): CmsItem | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;
  const name = pickString(raw, ['vod_name', 'name', 'title']);
  if (!name) return null;
  const year = pickString(raw, ['vod_year', 'year']).slice(0, 4);
  const id = pickString(raw, ['vod_id', 'id', 'ids']);
  return {
    key: shortKey(name, year),
    id,
    name,
    year,
    pic: pickString(raw, ['vod_pic', 'pic', 'pic_thumb', 'poster']),
    remarks: pickString(raw, ['vod_remarks', 'remarks', 'note']),
    type: pickString(raw, ['vod_type_name', 'type_name', 'vod_class']),
    api,
  };
}

/** 列表归一化 + 去重（同名同年只留一条，优先信息更全的） */
export function normalizeList(list: unknown, api: string): CmsItem[] {
  if (!Array.isArray(list)) return [];
  const out: CmsItem[] = [];
  const seen = new Map<string, number>();
  for (const item of list) {
    const norm = normalizeVod(item, api);
    if (!norm) continue;
    const idx = seen.get(norm.key);
    if (idx === undefined) {
      seen.set(norm.key, out.length);
      out.push(norm);
    } else {
      const cur = out[idx];
      out[idx] = {
        ...cur,
        pic: cur.pic || norm.pic,
        remarks: cur.remarks || norm.remarks,
        type: cur.type || norm.type,
        id: cur.id || norm.id,
      };
    }
  }
  return out;
}

/** 从任意 JSON 里把 list 数组捞出来（不同 CMS 字段名不一样） */
export function extractList(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return [];
  const raw = payload as Record<string, unknown>;
  const candidates = [raw.list, raw.data, raw.videos, raw.items];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (c && typeof c === 'object') {
      const inner = c as Record<string, unknown>;
      for (const k of ['list', 'data', 'items']) {
        if (Array.isArray(inner[k])) return inner[k] as unknown[];
      }
    }
  }
  return [];
}
