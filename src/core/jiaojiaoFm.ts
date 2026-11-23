/**
 * 焦焦FM 的核心逻辑（听书 / 故事 / 有声小说）。
 *
 * 独立性是硬约束（用户原话：「FM 不要跟他们掺到一块，听书是听书，看电影是看电影」）：
 *   - 数据：`jfm_sources` / `jfm_items` / `jfm_progress`，和影院的 watchQueue、片源接口、
 *     电视直播的 tvSources **零交叉**；
 *   - 源格式也不同：这里是「音频直链 / 播客 RSS / 列表 JSON」，影院是 MacCMS JSON，
 *     直播是 m3u 播放列表；
 *   - 播放器也独立（音频引擎，优先后台播放）。
 *
 * 本文件只放**纯逻辑**（不碰 RN、不碰网络），所以能直接单元测试：
 *   源判定 → 拉取解析 → 条目归一化 → 健康分级 → 双人进度合并。
 */

/* ============================ 类型 ============================ */

/** 收听源的种类（自动判定 + 用户可改） */
export type FmSourceKind = 'audio' | 'rss' | 'json';

export interface FmSource {
  id: string;
  name: string;
  url: string;
  kind: FmSourceKind;
  createdAt: number;
  enabled: boolean;
}

/** 一条能听的内容（一集 / 一章 / 一个故事） */
export interface FmItem {
  /** 同源内唯一：url 的稳定短键 */
  key: string;
  title: string;
  /** 所属节目/专辑名（RSS 的 channel title、JSON 的 album） */
  album: string;
  /** 作者 / 主播 */
  author: string;
  /** 封面（可能为空 → UI 用生成的占位封面） */
  cover: string | null;
  /** 音频地址（m3u8/mp3/m4a/aac/ogg 都行） */
  audio: string;
  /** 秒；0 = 未知 */
  duration: number;
  /** 简介（可空） */
  summary: string;
  /** 发布时间（毫秒；0 = 未知）—— 用来做"最新上线"排序 */
  publishedAt: number;
  /** 来自哪个源 */
  sourceId: string;
}

/** 健康状态：和影院/直播用同一套语义，但各自存各自的数据 */
export type FmHealth = 'ok' | 'slow' | 'fail';

export interface FmHealthReport {
  url: string;
  status: FmHealth;
  /** 耗时（毫秒） */
  ms: number;
  /** 拿到多少条 */
  count: number;
  /** 失败原因（status='fail' 时给用户看） */
  error: string | null;
  checkedAt: number;
}

/** 双人一起听的进度（谁在听、听到哪、什么速度） */
export interface FmProgress {
  itemKey: string;
  /** 秒 */
  positionSec: number;
  rate: number;
  playing: boolean;
  /** 谁最后操作的 */
  role: 'A' | 'B';
  updatedAt: number;
}

/* ============================ 源判定 ============================ */

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|flac|wav|m3u8)(?:$|[?#])/i;
const RSS_HINT = /<rss|<feed|<channel[^>]*>|<\?xml/i;

/** 判断一个地址属于哪种源（用户也可以手动改，这里只做默认值） */
export function detectSourceKind(input: string, contentType?: string | null): FmSourceKind {
  const url = String(input ?? '').trim();
  const ct = String(contentType ?? '').toLowerCase();
  if (AUDIO_EXT.test(url)) return 'audio';
  if (ct.includes('rss') || ct.includes('xml')) return 'rss';
  if (ct.includes('json')) return 'json';
  if (/\/feed|\.rss$|\.xml$|\/rss/i.test(url)) return 'rss';
  if (/\.json$|\/api\//i.test(url)) return 'json';
  return 'rss';
}

/** 源内容像什么（拿到正文后再确认一次，比看 URL 准） */
export function sniffBodyKind(body: string): FmSourceKind | null {
  const s = String(body ?? '').trim();
  if (!s) return null;
  if (RSS_HINT.test(s.slice(0, 4000))) return 'rss';
  if (s[0] === '[' || s[0] === '{') return 'json';
  return null;
}

/* ============================ 解析：RSS / 列表 JSON ============================ */

/** 极简 XML 取值：只要第一个匹配（不引第三方库，够 RSS 用） */
function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  if (!m) return '';
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}

/** 取所有同名标签（ITEMS 用） */
function tagAll(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** RSS 里的 <enclosure url=...> / <media:content url=...> */
function enclosureUrl(itemXml: string): string {
  const m = /<(?:enclosure|media:content|media:thumbnail)[^>]*\burl=["']([^"']+)["']/i.exec(itemXml);
  return m ? decodeEntities(m[1]).trim() : '';
}

function decodeEntities(s: string): string {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** 去掉 HTML 标签，留纯文本（简介里常混着 <p>） */
export function plainText(html: string, max = 200): string {
  const s = decodeEntities(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 把各种时长写法归一成秒：298 / "04:58" / "1:02:03" / "3721" */
export function parseDuration(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) return Math.round(input);
  const s = String(input ?? '').trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map((x) => Number(x) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/** 稳定短键：同一条音频永远得到同一个 key（去重、记进度都靠它） */
export function itemKey(audio: string): string {
  const s = String(audio ?? '').trim();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `jfm_${h.toString(36)}`;
}

/** 解析播客 RSS → 条目列表 */
export function parseRss(xml: string, sourceId: string): FmItem[] {
  const body = String(xml ?? '');
  const channelXml = /<channel[^>]*>([\s\S]*?)<\/channel>/i.exec(body)?.[1] ?? body;
  const album = tag(channelXml, 'title') || '焦焦FM';
  const channelImage =
    /<image[^>]*>[\s\S]*?<url>([^<]+)<\/url>/i.exec(channelXml)?.[1] ??
    /<itunes:image[^>]*href=["']([^"']+)["']/i.exec(channelXml)?.[1] ??
    '';

  const items: FmItem[] = [];
  for (const raw of tagAll(channelXml, 'item')) {
    const audio = enclosureUrl(raw);
    if (!audio || !AUDIO_EXT.test(audio)) continue;
    const title = tag(raw, 'title') || '未命名';
    const published = Date.parse(tag(raw, 'pubDate') || '') || 0;
    const cover =
      /<itunes:image[^>]*href=["']([^"']+)["']/i.exec(raw)?.[1] ?? channelImage ?? '';
    items.push({
      key: itemKey(audio),
      title,
      album,
      author: tag(raw, 'itunes:author') || tag(raw, 'author') || '',
      cover: cover ? decodeEntities(cover) : null,
      audio,
      duration: parseDuration(tag(raw, 'itunes:duration')),
      summary: plainText(tag(raw, 'description') || tag(raw, 'summary') || ''),
      publishedAt: published,
      sourceId,
    });
  }
  return items;
}

/**
 * 解析「列表 JSON」源 → 条目列表。
 *
 * 兼容几种常见形状（用户从哪里抄来的都能吃）：
 *   [{title,url|audio|src, cover?, album?, duration?}]
 *   {items:[...]} / {list:[...]} / {data:[...]} / {songs:[...]} / {episodes:[...]}
 */
export function parseListJson(text: string, sourceId: string): FmItem[] {
  let data: unknown;
  try {
    data = JSON.parse(String(text ?? ''));
  } catch {
    return [];
  }
  const arr = pickArray(data);
  const out: FmItem[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const audio = String(o.url ?? o.audio ?? o.src ?? o.playUrl ?? o.file ?? o.mp3 ?? '').trim();
    if (!audio) continue;
    const title = String(o.title ?? o.name ?? o.bookName ?? o.chapter ?? '未命名').trim();
    out.push({
      key: itemKey(audio),
      title: title || '未命名',
      album: String(o.album ?? o.channel ?? o.author ?? '').trim(),
      author: String(o.author ?? o.artist ?? o.narrator ?? '').trim(),
      cover: o.cover || o.pic || o.image ? String(o.cover ?? o.pic ?? o.image) : null,
      audio,
      duration: parseDuration(o.duration ?? o.time ?? o.length),
      summary: plainText(String(o.summary ?? o.desc ?? o.description ?? '')),
      publishedAt: Date.parse(String(o.publishedAt ?? o.date ?? o.pubDate ?? '')) || 0,
      sourceId,
    });
  }
  return out;
}

function pickArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['items', 'list', 'data', 'songs', 'episodes', 'audios', 'result']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

/** 统一入口：一个源 + 正文 → 条目列表 */
export function parseSource(text: string, source: Pick<FmSource, 'id' | 'url' | 'kind'>): FmItem[] {
  const kind = sniffBodyKind(text) ?? source.kind;
  if (kind === 'json') return parseListJson(text, source.id);
  if (kind === 'rss') return parseRss(text, source.id);
  // 单条音频直链：就一个条目，标题用文件名
  const name = decodeURIComponent(String(source.url).split('/').pop() ?? '') || '未命名音频';
  return [
    {
      key: itemKey(source.url),
      title: name.replace(AUDIO_EXT, ''),
      album: '',
      author: '',
      cover: null,
      audio: String(source.url),
      duration: 0,
      summary: '',
      publishedAt: 0,
      sourceId: source.id,
    },
  ];
}

/* ============================ 健康分级 ============================ */

/** 按耗时/结果给源定一个健康档（影院、直播、FM 语义一致，但各存各的） */
export function gradeHealth(input: {
  ok: boolean;
  ms: number;
  count: number;
  error?: string | null;
}): FmHealthReport['status'] {
  if (!input.ok || input.count <= 0) return 'fail';
  if (input.ms > 4000) return 'slow';
  return 'ok';
}

/** 那一堆源里，坏的是哪几个（UI 上标红并置顶） */
export function failingSources(reports: FmHealthReport[]): string[] {
  return reports.filter((r) => r.status === 'fail').map((r) => r.url);
}

/** 健康总结：「12 个源 · 10 正常 / 1 慢 / 1 坏」 */
export function healthSummary(reports: FmHealthReport[]): string {
  const ok = reports.filter((r) => r.status === 'ok').length;
  const slow = reports.filter((r) => r.status === 'slow').length;
  const bad = reports.filter((r) => r.status === 'fail').length;
  return `${reports.length} 个源 · ${ok} 正常 / ${slow} 慢 / ${bad} 坏`;
}

/* ============================ 双人一起听 ============================ */

/**
 * 合并两边的进度（纯函数，方便单测）。
 *
 * 规则：**谁后操作听谁的**（updatedAt 晚的赢）；同时间戳时 A 优先（A 是写入者）。
 * 返回值可以直接喂给播放器 seek，精度到秒。
 */
export function mergeProgress(local: FmProgress | null, remote: FmProgress | null): FmProgress | null {
  if (!local) return remote ?? null;
  if (!remote) return local;
  if (remote.itemKey !== local.itemKey) {
    // 换集了：后换的那一方赢
    return remote.updatedAt >= local.updatedAt ? remote : local;
  }
  if (remote.updatedAt > local.updatedAt) return remote;
  if (remote.updatedAt < local.updatedAt) return local;
  return local.role === 'A' ? local : remote;
}

/** 两边进度差多少秒（超过这个值就强制 seek 对齐） */
export function driftSeconds(a: FmProgress, b: FmProgress): number {
  return Math.abs(a.positionSec - b.positionSec);
}

/** 要不要把对方拉过来（默认 1.5 秒，和影院同一标准） */
export function shouldSeek(local: FmProgress, remote: FmProgress, tolerance = 1.5): boolean {
  return local.itemKey === remote.itemKey && driftSeconds(local, remote) > tolerance;
}
