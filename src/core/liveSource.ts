/**
 * 电视直播源解析（纯函数，可单测）
 *
 * 支持两种最常见的直播源格式：
 *
 * 1) M3U / M3U8 播放列表
 *    #EXTM3U
 *    #EXTINF:-1 tvg-id="CCTV1" tvg-logo="..." group-title="央视",CCTV-1 综合
 *    http://xxx/cctv1.m3u8
 *
 * 2) TXT 直播源（电视盒子/影视仓最常见的那种）
 *    央视,#genre#
 *    CCTV-1 综合,http://xxx/cctv1.m3u8
 *    卫视,#genre#
 *    湖南卫视,http://xxx/hunan.m3u8#http://xxx/hunan2.m3u8
 *
 * 一个频道可能有多个备用地址（用 # 分隔），这里**保留全部**，
 * 播放时挂了可以自动换下一个（见 pickChannelUrls）。
 */

/**
 * 把 `http://ip/live.m3u8|User-Agent=FongMi|Referer=http://x` 拆成
 * `{ uri, headers }`：中文直播源最常见的写法就是这种"地址 + 请求头"，
 * 播放器必须带着这些头才能拉到流（否则 403 / 黑屏）。
 *
 * 以前我们只把整串当 URL 交给播放器：`|User-Agent=…` 变成路径的一部分，
 * 界面显示"2 条线路"、点进去 12 秒后全部失败。
 */
export function splitStreamHeaders(raw: string): { uri: string; headers: Record<string, string> } {
  const text = String(raw ?? "").trim();
  const cut = text.indexOf("|");
  if (cut < 0) return { uri: text, headers: {} };
  const uri = text.slice(0, cut);
  const headers: Record<string, string> = {};
  for (const part of text.slice(cut + 1).split("|")) {
    const kv = part.trim();
    if (!kv) continue;
    const eq = kv.indexOf("=");
    if (eq <= 0) continue;
    const key = kv.slice(0, eq).trim();
    const value = kv.slice(eq + 1).trim();
    if (key) headers[key] = value;
  }
  return { uri, headers };
}

export interface LiveChannel {
  /** 稳定 id（分组 + 名字 + 地址哈希）：列表 key、收藏、一起看都用它 */
  id: string;
  name: string;
  /** 首选播放地址 */
  url: string;
  /** 全部备用地址（含首选，按顺序） */
  urls: string[];
  /** 分组名，如「央视」「卫视」「地方」；没有分组时是「未分组」 */
  group: string;
  /** tvg-logo / 图标地址（可能有） */
  logo?: string;
  /** tvg-id（可能有，用于跨源匹配同一台） */
  tvgId?: string;
}

export interface LivePlaylist {
  channels: LiveChannel[];
  groups: string[];
  kind: 'm3u' | 'txt' | 'unknown';
  /** 解析时被丢掉的坏行数（给健康检测解释"为什么只认出 3 个台"） */
  skipped: number;
}

const DEFAULT_GROUP = '未分组';

/** 短哈希：同一个台同一个地址稳定得到同一个 id */
function shortHash(input: string): string {
  let h = 5381;
  const s = String(input ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

/**
 * 把一个字段里的多个地址拆开。
 *
 * 直播源里同一台的备用地址常见写法：`http://a.m3u8#http://b.m3u8`，
 * 也有用 `|` 分隔的。注意 m3u8 地址本身可能带 `#` 片段，
 * 所以只有当一个片段**也是完整 http 地址**时才当成备用地址拆开。
 */
export function splitUrls(raw: string): string[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const parts = text
    .split(/[#|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const urls: string[] = [];
  for (const p of parts) {
    if (!isHttpUrl(p)) {
      /*
       * 不是完整地址：可能是主地址里带的"请求头后缀"。
       * 中文直播源最常见的写法是 `http://ip/live.m3u8|User-Agent=FongMi|Referer=…`，
       * 播放器必须带着这些头才能拉到流。以前一律用 '#' 拼回去，
       * 于是 `|User-Agent=…` 变成了 URL 的 fragment（客户端根本不会发送），
       * 结果：界面显示"3 条线路"，实际每条都 403/黑屏。
       * 这里按原分隔符拼回去（split 用的是 /[#|]/，只要记住它原来是哪个）。
       */
      if (urls.length > 0) {
        const prev = urls[urls.length - 1];
        const sep = prev.includes('|') || p.includes('=') ? '|' : '#';
        urls[urls.length - 1] = `${prev}${sep}${p}`;
      }
      continue;
    }
    if (!urls.includes(p)) urls.push(p);
  }
  if (urls.length === 0 && isHttpUrl(text)) return [text];
  return urls;
}

/** 从 #EXTINF 的属性里取 tvg-logo / group-title / tvg-id */
function readAttrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z0-9-_]+)="([^"]*)"/g;
  let m = re.exec(line);
  while (m) {
    out[m[1].toLowerCase()] = m[2];
    m = re.exec(line);
  }
  return out;
}

/** `#EXTINF:-1 xxx,频道名` 里最后一个逗号之后就是频道名 */
function readExtinfName(line: string): string {
  const idx = line.lastIndexOf(',');
  if (idx < 0) return '';
  return line.slice(idx + 1).trim();
}

function makeChannel(
  name: string,
  urls: string[],
  group: string,
  extra?: { logo?: string; tvgId?: string },
): LiveChannel | null {
  const cleanName = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!cleanName || urls.length === 0) return null;
  return {
    id: shortHash(`${group}|${cleanName}|${urls[0]}`),
    name: cleanName,
    url: urls[0],
    urls,
    group: group || DEFAULT_GROUP,
    logo: extra?.logo,
    tvgId: extra?.tvgId,
  };
}

/** 解析 m3u/m3u8 播放列表 */
export function parseM3U(text: string): LivePlaylist {
  const lines = String(text ?? '').split(/\r?\n/);
  const channels: LiveChannel[] = [];
  let pending: { name: string; group: string; logo?: string; tvgId?: string } | null = null;
  let skipped = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#EXTINF/i.test(line)) {
      const attrs = readAttrs(line);
      pending = {
        name: readExtinfName(line),
        group: attrs['group-title'] || DEFAULT_GROUP,
        logo: attrs['tvg-logo'] || attrs['logo'] || undefined,
        tvgId: attrs['tvg-id'] || undefined,
      };
      continue;
    }
    if (line.startsWith('#')) continue; // #EXTM3U / #EXTVLCOPT 之类
    if (!isHttpUrl(line)) {
      skipped += 1;
      continue;
    }
    const urls = splitUrls(line);
    const ch = makeChannel(pending?.name || `频道 ${channels.length + 1}`, urls, pending?.group || DEFAULT_GROUP, {
      logo: pending?.logo,
      tvgId: pending?.tvgId,
    });
    if (ch) channels.push(ch);
    else skipped += 1;
    pending = null;
  }

  return { channels, groups: collectGroups(channels), kind: 'm3u', skipped };
}

/** 解析 txt 直播源（`分组,#genre#` + `频道,地址`） */
export function parseTxt(text: string): LivePlaylist {
  const lines = String(text ?? '').split(/\r?\n/);
  const channels: LiveChannel[] = [];
  let group = DEFAULT_GROUP;
  let skipped = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;

    // 分组标记：`央视,#genre#`（也见过 `央视,#genre#,#genre#` 这种）
    if (/#genre#/i.test(line)) {
      const name = line.split(',')[0].trim();
      group = name || DEFAULT_GROUP;
      continue;
    }

    const comma = line.indexOf(',');
    if (comma < 0) {
      // 没有逗号的行里如果直接是地址，也收（少见，但别丢）
      if (isHttpUrl(line)) {
        const ch = makeChannel(`频道 ${channels.length + 1}`, splitUrls(line), group);
        if (ch) channels.push(ch);
        else skipped += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const name = line.slice(0, comma).trim();
    const rest = line.slice(comma + 1).trim();
    const urls = splitUrls(rest);
    const ch = makeChannel(name, urls, group);
    if (ch) channels.push(ch);
    else skipped += 1;
  }

  return { channels, groups: collectGroups(channels), kind: 'txt', skipped };
}

/** 自动识别格式并解析 */
export function parseLivePlaylist(text: string): LivePlaylist {
  const body = String(text ?? '');
  const trimmed = body.trim();
  if (!trimmed) return { channels: [], groups: [], kind: 'unknown', skipped: 0 };
  if (/#EXTM3U/i.test(trimmed) || /#EXTINF/i.test(trimmed)) return parseM3U(body);
  if (/#genre#/i.test(body)) return parseTxt(body);
  // 没有标记：如果大部分行是 "名字,http..." 就当 txt
  const httpLines = body.split(/\r?\n/).filter((l) => isHttpUrl(l.split(',')[1] ?? '')).length;
  if (httpLines > 0) return parseTxt(body);
  return { channels: [], groups: [], kind: 'unknown', skipped: 0 };
}

function collectGroups(channels: LiveChannel[]): string[] {
  const seen: string[] = [];
  for (const c of channels) {
    if (!seen.includes(c.group)) seen.push(c.group);
  }
  return seen;
}

/** 按分组聚合（保持源里的原始顺序，央视在前） */
export function groupChannels(channels: LiveChannel[]): Array<{ group: string; channels: LiveChannel[] }> {
  const map = new Map<string, LiveChannel[]>();
  for (const c of channels) {
    const list = map.get(c.group);
    if (list) list.push(c);
    else map.set(c.group, [c]);
  }
  return Array.from(map.entries()).map(([group, list]) => ({ group, channels: list }));
}

/**
 * 去掉重复台（同一个台名 + 同一个首选地址只留一条）；
 * 名字相同但地址不同的**保留**（不同源画质/线路不同，让用户自己选）。
 */
export function dedupeChannels(channels: LiveChannel[]): LiveChannel[] {
  const seen = new Set<string>();
  const out: LiveChannel[] = [];
  for (const c of channels) {
    const key = `${normalizeChannelName(c.name)}::${c.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** 台名归一化：去空格、去清晰度/线路后缀，用于搜索和跨源匹配 */
export function normalizeChannelName(name: string): string {
  return String(name ?? '')
    .replace(/\s+/g, '')
    .replace(/[（(【\[].*?[)）】\]]/g, '')
    .replace(/(高清|超清|蓝光|标清|超高清|4K|8K|HD|FHD|线路\d+|备用\d*)/gi, '')
    .toUpperCase();
}

/** 按关键词搜台（支持 CCTV1 → CCTV-1 这种写法差异） */
export function searchChannels(channels: LiveChannel[], keyword: string): LiveChannel[] {
  const kw = normalizeChannelName(keyword);
  if (!kw) return channels;
  const kwTight = kw.replace(/[^0-9A-Z\u4e00-\u9fa5]/g, '');
  return channels.filter((c) => {
    const name = normalizeChannelName(c.name);
    const tight = name.replace(/[^0-9A-Z\u4e00-\u9fa5]/g, '');
    return name.includes(kw) || (!!kwTight && tight.includes(kwTight));
  });
}

/** 频道的全部候选地址（首选在前，备用在后） */
export function pickChannelUrls(channel: LiveChannel): string[] {
  return channel.urls.length > 0 ? channel.urls : [channel.url];
}

/** 合并多个直播源解析出来的频道（同一个台在多个源里都出现时合并备用地址） */
export function mergePlaylists(playlists: LivePlaylist[]): LiveChannel[] {
  const map = new Map<string, LiveChannel>();
  for (const pl of playlists) {
    for (const c of pl.channels) {
      const key = `${normalizeChannelName(c.name)}|${c.group}`;
      const exist = map.get(key);
      if (!exist) {
        map.set(key, c);
        continue;
      }
      // 合并备用地址（同一个台不同源各有线路）
      const urls = [...exist.urls];
      for (const u of c.urls) {
        if (!urls.includes(u)) urls.push(u);
      }
      map.set(key, { ...exist, urls, logo: exist.logo || c.logo, tvgId: exist.tvgId || c.tvgId });
    }
  }
  return Array.from(map.values());
}
