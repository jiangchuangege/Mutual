/**
 * 影院分类修正（纯函数，可单测）
 *
 * 用户反馈：「动漫分类他连真人都汇集到一块了，分类不对」。
 *
 * 原因：分类是**采集站自己标的**，同一个站里「动漫」这个一级分类下面
 * 经常混进真人剧、真人电影（采集站为了凑数量，把整库都挂到热门分类下），
 * 而 `type_name` 字段本身又是准的（它写的是「国产剧」「动作片」）。
 *
 * 所以这里做两件事：
 *   1. 用 `type_name / 片名 / 简介 / 地区` 给每一部片判一个「动漫 or 真人」，
 *      在动漫分类下把判成真人的剔掉；
 *   2. 把采集站五花八门的一级分类（国产动漫/日本动漫/动漫、动作片/科幻片/喜剧片…）
 *      归并成固定的几档：动漫 / 电影 / 剧集 / 综艺 / 纪录片 / 其他，
 *      这样分类条不再是一长串乱七八糟的站内分类。
 *
 * 判定思路：分词表打分，命中越"硬"的词权重越高（type_name 权重最高），
 * 名字里出现「真人版」「真人」直接判真人；打平就当"不确定"，不动它。
 */

import type { CmsCategory, CmsVod } from './cms';

export type CinemaKind = 'anime' | 'live' | 'unknown';

/** 归并后的分类档位 */
export type BucketKey = 'anime' | 'movie' | 'series' | 'variety' | 'doc' | 'other';

export interface CinemaSubCategory {
  id: string;
  name: string;
}

export interface CinemaGroup {
  key: BucketKey;
  label: string;
  emoji: string;
  /** 归属于这一档的全部采集站分类 id（含一级和它的子类） */
  ids: string[];
  /** 这些 id 来自哪些原始分类名（界面上可以展开看） */
  sources: string[];
  /** 这一档是不是"二次元"（用来决定 UI 用樱花粉还是月紫） */
  anime: boolean;
  /** 二级分类（动作片 / 恐怖片 / 科幻片 …），点进去只看这一类 */
  subs: CinemaSubCategory[];
}

export const BUCKET_META: Record<BucketKey, { label: string; emoji: string }> = {
  anime: { label: '动漫', emoji: '🌸' },
  movie: { label: '电影', emoji: '🎬' },
  series: { label: '剧集', emoji: '📺' },
  variety: { label: '综艺', emoji: '🎤' },
  doc: { label: '纪录片', emoji: '🌏' },
  other: { label: '其他', emoji: '🎞️' },
};

/** 出现这些词就强烈说明是动画（看 type_name 最准） */
const ANIME_WORDS = [
  '动漫',
  '动画',
  '番剧',
  '国漫',
  '日漫',
  '美漫',
  '泡面番',
  '新番',
  '补番',
  '里番',
  '番',
  '动画片',
  '动漫电影',
  '动画电影',
  '剧场版',
  '3D动画',
  '少儿',
  '儿童动画',
  '亲子动画',
  '幼教动画',
  '偶动漫',
];

/** 出现这些词说明是真人内容 */
const LIVE_WORDS = [
  '电视剧',
  '连续剧',
  '国产剧',
  '港剧',
  '台剧',
  '日剧',
  '韩剧',
  '美剧',
  '泰剧',
  '欧美剧',
  '海外剧',
  '短剧',
  '微短剧',
  '网剧',
  '综艺',
  '脱口秀',
  '真人秀',
  '访谈',
  '纪录片',
  '纪实',
  '专题片',
  '动作片',
  '喜剧片',
  '爱情片',
  '科幻片',
  '恐怖片',
  '惊悚片',
  '战争片',
  '剧情片',
  '悬疑片',
  '犯罪片',
  '冒险片',
  '武侠片',
  '古装片',
  '枪战片',
  '灾难片',
  '伦理片',
  '家庭片',
  '同性片',
  '真人',
  '真人版',
];

/** 名字里出现这些，直接判真人（优先级最高，"斗罗大陆真人版"不能被当动画） */
const LIVE_HARD_WORDS = ['真人版', '真人剧', '真人秀', '真人电影'];

/** 名字里出现这些，直接判动画 */
const ANIME_HARD_WORDS = ['剧场版', '动画版', 'TV版动画', '动画电影'];

function hit(text: string, words: string[]): number {
  const t = String(text ?? '').toLowerCase();
  if (!t) return 0;
  let n = 0;
  for (const w of words) {
    if (t.includes(w.toLowerCase())) n += 1;
  }
  return n;
}

export interface KindVerdict {
  kind: CinemaKind;
  /** 判成动漫的分 */
  animeScore: number;
  /** 判成真人的分 */
  liveScore: number;
  /** 判定依据（调试 / 界面上解释"为什么这部被过滤"） */
  reason: string;
}

/**
 * 判断一部片是动漫还是真人。
 *
 * 权重：type_name(3) > 片名(2) > 备注(1) > 地区(1) > 简介(0.5→按 1 计但只取一次)
 */
export function classifyVod(vod: CmsVod): KindVerdict {
  const name = String(vod.name ?? '');
  const typeName = String(vod.typeName ?? '');
  const remarks = String(vod.remarks ?? '');
  const area = String(vod.area ?? '');
  const content = String(vod.content ?? '').slice(0, 200);

  // 硬规则：名字里明确写了真人版，直接真
  const hardLive = hit(name, LIVE_HARD_WORDS);
  if (hardLive > 0) {
    return { kind: 'live', animeScore: 0, liveScore: 100, reason: `片名含「真人版」类字样` };
  }
  const hardAnime = hit(name, ANIME_HARD_WORDS);
  if (hardAnime > 0 && hit(name, LIVE_WORDS) === 0) {
    return { kind: 'anime', animeScore: 100, liveScore: 0, reason: `片名含「剧场版/动画」字样` };
  }

  let animeScore = 0;
  let liveScore = 0;

  // type_name 最可信
  animeScore += hit(typeName, ANIME_WORDS) * 3;
  liveScore += hit(typeName, LIVE_WORDS) * 3;
  // 片名
  animeScore += hit(name, ANIME_WORDS) * 2;
  liveScore += hit(name, LIVE_WORDS) * 2;
  // 备注（"更新至第12集"两边都有，所以这里只用强词表）
  const remarksAnime = hit(remarks, ['动画', '动漫', '番剧', '国漫', '日漫']);
  const remarksLive = hit(remarks, ['真人', '电视剧', '综艺', '纪录']);
  animeScore += remarksAnime;
  liveScore += remarksLive;
  // 地区：日本/国产动画常见；但真人剧也有日韩，所以只给动漫加一点
  if (/日本|国产|大陆/.test(area) && hit(typeName, ANIME_WORDS) > 0) animeScore += 1;
  // 简介只作为弱信号
  animeScore += hit(content, ['动画', '动漫', '番剧']) > 0 ? 1 : 0;
  liveScore += hit(content, ['真人', '电视剧', '综艺']) > 0 ? 1 : 0;

  if (animeScore === 0 && liveScore === 0) {
    return { kind: 'unknown', animeScore, liveScore, reason: '接口没给能判断的类型信息' };
  }
  if (animeScore > liveScore) {
    return { kind: 'anime', animeScore, liveScore, reason: `类型「${typeName || '—'}」+ 名称特征判为动画` };
  }
  if (liveScore > animeScore) {
    return { kind: 'live', animeScore, liveScore, reason: `类型「${typeName || '—'}」判为真人` };
  }
  return { kind: 'unknown', animeScore, liveScore, reason: '动画/真人特征打平，保持原样' };
}

/** 只看动漫：剔掉明确是真人（unknown 保留，避免误杀） */
export function filterAnimeOnly(list: CmsVod[]): { list: CmsVod[]; dropped: number } {
  const out: CmsVod[] = [];
  let dropped = 0;
  for (const v of list) {
    const verdict = classifyVod(v);
    if (verdict.kind === 'live') {
      dropped += 1;
      continue;
    }
    out.push(v);
  }
  return { list: out, dropped };
}

/**
 * 动漫分类下的智能过滤。
 *
 * 保护策略：如果这个"动漫分类"里超过 65% 的片子其实是真人，
 * 说明这个分类本身就标错了（不是混了几部，而是整个分类是假的），
 * 这时候**不要**把库清空——只提示，不做过滤，否则用户会看到"动漫 0 部"。
 */
export function smartFilterAnime(list: CmsVod[]): { list: CmsVod[]; dropped: number; suspicious: boolean } {
  if (list.length === 0) return { list, dropped: 0, suspicious: false };
  let liveCount = 0;
  for (const v of list) {
    if (classifyVod(v).kind === 'live') liveCount += 1;
  }
  const ratio = liveCount / list.length;
  const suspicious = ratio > 0.65;
  if (suspicious) return { list, dropped: 0, suspicious: true };
  const filtered = filterAnimeOnly(list);
  return { list: filtered.list, dropped: filtered.dropped, suspicious: false };
}

/** 分类名 → 归并档位 */
export function canonicalBucket(categoryName: string): BucketKey {
  const name = String(categoryName ?? '').trim();
  if (!name) return 'other';
  const t = name.toLowerCase();

  // 顺序很重要：短剧要在「剧」之前，动画要在「片」之前
  if (/动漫|动画|番剧|国漫|日漫|美漫|少儿|儿童|亲子|里番|泡面番|剧场版/.test(t)) return 'anime';
  if (/短剧|微短剧/.test(t)) return 'series';
  if (/纪录|纪实|专题/.test(t)) return 'doc';
  if (/综艺|秀|脱口秀|访谈/.test(t)) return 'variety';
  /*
   * 顺序很关键：**「…片」要先于「剧」判断**。
   * 否则「剧情片」「喜剧片」会因为带一个"剧"字被判成剧集 ——
   * 结果它们在「电影」分类里被过滤掉（这正是用户说的"电影里少了片/跑到别的类里"）。
   */
  if (/电影|片|篇/.test(t)) return 'movie';
  if (/剧/.test(t)) return 'series';
  return 'other';
}

/**
 * 把采集站的一级分类归并成固定的几档。
 *
 * `categories` 传 `fetchCmsCategories` 的结果（含 pid 层级），
 * 返回顺序固定为：动漫 / 电影 / 剧集 / 综艺 / 纪录片 / 其他（只返回存在的档）。
 * 每一档的 `ids` 里包含该档全部一级分类**及其子分类**，
 * 这样点「动漫」时可以把「国产动漫」「日本动漫」的子类一起拉，不会只剩几部。
 */
export function groupCategories(categories: CmsCategory[]): CinemaGroup[] {
  const roots = categories.filter((c) => (c.pid ?? '0') === '0');
  const pool = roots.length > 0 ? roots : categories;

  const byBucket = new Map<BucketKey, CinemaGroup>();
  for (const root of pool) {
    const bucket = canonicalBucket(root.name);
    const ids = [root.id];
    const subs: CinemaSubCategory[] = [];
    for (const child of categories) {
      if ((child.pid ?? '0') !== root.id) continue;
      ids.push(child.id);
      if (!subs.some((s) => s.name === child.name)) subs.push({ id: child.id, name: child.name });
    }
    // 没有子分类的站：把一级分类自己当"全部"之下的唯一一项
    if (subs.length === 0) subs.push({ id: root.id, name: root.name });
    const exist = byBucket.get(bucket);
    if (exist) {
      for (const id of ids) if (!exist.ids.includes(id)) exist.ids.push(id);
      if (!exist.sources.includes(root.name)) exist.sources.push(root.name);
      for (const s of subs) if (!exist.subs.some((x) => x.name === s.name)) exist.subs.push(s);
    } else {
      byBucket.set(bucket, {
        key: bucket,
        label: BUCKET_META[bucket].label,
        emoji: BUCKET_META[bucket].emoji,
        ids,
        sources: [root.name],
        anime: bucket === 'anime',
        subs,
      });
    }
  }

  const order: BucketKey[] = ['anime', 'movie', 'series', 'variety', 'doc', 'other'];
  return order.map((k) => byBucket.get(k)).filter((g): g is CinemaGroup => Boolean(g));
}

/** 一部片属于哪一档（给"全部"之外的兜底展示用） */
export function bucketOfVod(vod: CmsVod): BucketKey {
  return canonicalBucket(vod.typeName || vod.name);
}

/**
 * 严格按档位过滤（用户要求："分类一定要严谨，短剧别跑到恐怖片/电影里去"）。
 *
 * 采集站经常把「短剧」「综艺」「动漫」也塞进电影分类里，
 * 所以选了某一档之后，再按每部片的 `typeName` 复核一遍：判得出档位就必须同档，
 * 判不出来（other）才放行 —— 宁愿少几部，也不要把不相干的混进来。
 */
export function filterByBucket(list: CmsVod[], key: BucketKey): { list: CmsVod[]; dropped: number } {
  if (!list.length) return { list, dropped: 0 };
  const out: CmsVod[] = [];
  let dropped = 0;
  for (const v of list) {
    const typeName = String(v.typeName ?? '').trim();
    if (!typeName) {
      out.push(v);
      continue;
    }
    const bucket = canonicalBucket(typeName);
    if (bucket === 'other' || bucket === key) {
      out.push(v);
      continue;
    }
    // 纪录片的分类本身也算"电影里的一个子类"，两边都放行
    if (key === 'movie' && bucket === 'doc') {
      out.push(v);
      continue;
    }
    dropped += 1;
  }
  return { list: out, dropped };
}

/**
 * 按片名去重（用户反馈："同一个电影在好几个月份都出现了"）。
 *
 * 原因：同一部片会被十几个采集站各自收录，每家的 `vod_time`（上架时间）都不一样，
 * 于是按月份筛选时它会在好几个月里各出现一次，列表里也会重复显示。
 * 这里按「规范化片名」只留一条 —— 优先留有上架时间、有播放地址的那条。
 */
export function dedupeByTitle(list: CmsVod[]): CmsVod[] {
  const norm = (s: string) =>
    String(s ?? '')
      .replace(/[\s·:：\-—_()（）\[\]【】]/g, '')
      .replace(/(国语|粤语|中字|高清|蓝光|完整版|HD|更新至.*|全\d+集)$/gi, '')
      .toLowerCase();
  const best = new Map<string, CmsVod>();
  const score = (v: CmsVod) =>
    (String(v.time ?? '').length >= 10 ? 2 : 0) + (String(v.playUrlRaw ?? '').length > 0 ? 2 : 0) + (v.pic ? 1 : 0);
  for (const v of list) {
    const key = norm(v.name);
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || score(v) > score(prev)) best.set(key, v);
  }
  return [...best.values()];
}

/**
 * 二级分类的"同义词归并"。
 *
 * 真实问题：用户点「动漫 → 日韩动漫」只看到 5 千多，而单站就有 4.5 千。
 * 原因：各采集站叫法不同 —— mdzyapi 叫「日韩动漫」，subocj / hhzyapi 叫「日本动漫」。
 * 按名字精确对齐时后两个站整站被跳过。
 *
 * 归一化规则：
 *   日韩动漫 / 日本动漫 / 韩日动漫 / 日韩动画  → region=日韩, kind=动漫
 *   国产动漫 / 中国动漫 / 大陆动漫            → region=国产, kind=动漫
 *   动漫电影 / 剧场版（带"电影"）              → kind=动漫电影（不能和「动漫」混）
 */
export interface SubNameKey {
  /** 地区：日韩 / 国产 / 欧美 / 港台 / ''（不限地区） */
  region: string;
  /** 类型：动漫 / 动漫电影 / 电影 / 剧 / 综艺 / 纪录 / '' */
  kind: string;
}

export function subNameKey(categoryName: string): SubNameKey {
  const n = String(categoryName ?? '').replace(/[\s·（）()【】\[\]]/g, '');
  let region = '';
  if (/日韩|日本|韩国|韩日|日漫|韩漫/.test(n)) region = '日韩';
  else if (/国产|中国|大陆|内地|华语/.test(n)) region = '国产';
  else if (/欧美|美国|欧洲|西方/.test(n)) region = '欧美';
  else if (/港台|香港|台湾/.test(n)) region = '港台';

  let kind = '';
  const isAnime = /动漫|动画|番剧|番|国漫|日漫|美漫|里番|剧场版/.test(n);
  const isMovie = /电影|剧场版|片/.test(n);
  if (isAnime) kind = isMovie ? '动漫电影' : '动漫';
  else if (isMovie) kind = '电影';
  else if (/剧|电视/.test(n)) kind = '剧';
  else if (/综艺|秀/.test(n)) kind = '综艺';
  else if (/纪录|纪实/.test(n)) kind = '纪录';
  return { region, kind };
}

/**
 * 「某部片的 typeName」是否属于「用户选的二级分类」。
 * 采集站同一档名字五花八门（日韩动漫 / 日本动漫 / 中国动漫…），
 * 以前用字面包含（`tn.includes(core)`）跨站就漏掉一大片。
 */
export function matchesSubCategory(typeName: string, subName: string): boolean {
  const a = String(typeName ?? '').trim();
  const b = String(subName ?? '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const ka = subNameKey(a);
  const kb = subNameKey(b);
  if (!kb.kind && !kb.region) return a.includes(b) || b.includes(a);
  // 类型必须对得上（动漫 ≠ 动漫电影）
  if (kb.kind && ka.kind !== kb.kind) return false;
  // 用户选了地区（日韩/国产…）时，条目也必须属于同一地区；没选地区就都算
  if (kb.region && ka.region !== kb.region) return false;
  return ka.kind !== '' || ka.region !== '';
}
