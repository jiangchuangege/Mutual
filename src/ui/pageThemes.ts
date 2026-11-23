/**
 * 各页面独立主题（每页一套，不重复 —— 用户明确要求"每个都不要一样，要不太呆"）。
 *
 * 用法：页面里 `const t = pageTheme('today')`，然后 t.bg / t.card / t.accent / t.ink 直接用。
 * 只影响视觉，不动任何逻辑；四个页面互相独立，删掉某个页面的主题不影响别的页面。
 */
export interface PageTheme {
  /** 页面底层背景（两色渐变，从上到下） */
  bg: [string, string];
  /** 卡片底色（半透明，透出背景） */
  card: string;
  /** 卡片描边 */
  line: string;
  /** 主色（图标 / 按钮 / 高亮） */
  accent: string;
  /** 主色的柔和背景 */
  accentSoft: string;
  /** 主文字 */
  ink: string;
  /** 次要文字 */
  inkSoft: string;
  /** 点缀色（第二种强调色） */
  spark: string;
}

/** 今天 —— 晨光暖米：日出、纸感、温柔 */
export const todayTheme: PageTheme = {
  bg: ['#FFF8EE', '#FFEFDC'],
  card: 'rgba(255,255,255,0.82)',
  line: 'rgba(226,196,158,0.55)',
  accent: '#E9A24B',
  accentSoft: 'rgba(233,162,75,0.14)',
  ink: '#4A3728',
  inkSoft: '#8C7460',
  spark: '#F2C75C',
};

/** 生活 —— 薄荷手账：清爽、绿意、日常感 */
export const lifeTheme: PageTheme = {
  bg: ['#F2FBF5', '#E3F5EA'],
  card: 'rgba(255,255,255,0.85)',
  line: 'rgba(160,206,178,0.55)',
  accent: '#4FAE7C',
  accentSoft: 'rgba(79,174,124,0.14)',
  ink: '#26402F',
  inkSoft: '#6B8A77',
  spark: '#8FD9A8',
};

/** 关怀 —— 樱花光晕：粉、柔、被照顾的感觉 */
export const careTheme: PageTheme = {
  bg: ['#FFF4F7', '#FFE7EE'],
  card: 'rgba(255,255,255,0.84)',
  line: 'rgba(238,181,199,0.55)',
  accent: '#E8739A',
  accentSoft: 'rgba(232,115,154,0.14)',
  ink: '#4A2A36',
  inkSoft: '#96707E',
  spark: '#FFB3CC',
};

/** 我们 —— 玫瑰金星屑：隆重一点、纪念日感 */
export const usTheme: PageTheme = {
  bg: ['#2A1420', '#3D1C2C'],
  card: 'rgba(255,255,255,0.09)',
  line: 'rgba(255,205,225,0.22)',
  accent: '#F0B3C8',
  accentSoft: 'rgba(240,179,200,0.16)',
  ink: '#FFF2F7',
  inkSoft: 'rgba(255,242,247,0.66)',
  spark: '#FFD37A',
};

export const PAGE_THEMES = {
  today: todayTheme,
  life: lifeTheme,
  care: careTheme,
  us: usTheme,
} as const;

export type PageThemeKey = keyof typeof PAGE_THEMES;

export function pageTheme(key: PageThemeKey): PageTheme {
  return PAGE_THEMES[key] ?? todayTheme;
}
