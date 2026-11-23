/**
 * 全库统计（17 个内置接口全量抓取后去重）
 *
 * 由 tools 里的一次性统计任务产出：把每个接口能翻到的所有页面都抓一遍，
 * 先去"站内重复"，再去"跨站同名重复"。用于片库页头显示**真实的片数**，
 * 而不是"各接口自报行数相加"（那个数字会虚高 5~6 倍）。
 *
 * 统计时间：2026-11-23
 */
export interface LibraryStats {
  /** 从接口实际抓到的行数（含重复） */
  rows: number;
  /** 精确同名去重后的片数（只去掉完全同名的重复） */
  uniqueExact: number;
  /** 更严格口径：额外把"第N集/国语/4K/括号内容"也视为同一部 */
  uniqueLoose: number;
  anime: number;
  animeLoose: number;
  jpkrAnime: number;
  cnAnime: number;
  euAnime: number;
  movie: number;
  series: number;
  variety: number;
  doc: number;
  /** 统计时能连上的接口数 */
  sources: number;
}

export const LIBRARY_STATS: LibraryStats = {
  rows: 1377556,
  uniqueExact: 280170,
  uniqueLoose: 247522,
  anime: 29018,
  animeLoose: 24263,
  jpkrAnime: 9897,
  cnAnime: 8936,
  euAnime: 2319,
  movie: 98305,
  series: 110527,
  variety: 10598,
  doc: 5821,
  sources: 16,
};

/** 一行给人看的说明：片库页头用 */
export function libraryStatsLine(): string {
  const n = (v: number): string => v.toLocaleString('zh-CN');
  return `已收录 ${n(LIBRARY_STATS.uniqueExact)} 部（${LIBRARY_STATS.sources} 个源去重后）`;
}
