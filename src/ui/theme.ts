/**
 * 设计令牌（方案 §6.3）
 * 奶油渐变 / 治愈手绘 / 圆角卡片；经期相关页面**禁用血红警告色**。
 */

export const color = {
  // 半透明底色：用户设置的背景图可以透出来，文字仍然清晰。
  // 用户反馈「上传背景后基本看不到」——原来是 0.90，几乎把整张图盖住了；
  // 现在放到 0.55，配合 AppFrame 里那层很淡的薄雾（0.12），背景图真的能看出来。
  bg: 'rgba(255,248,244,0.55)',
  /** 完全不透明底色：弹层、入口页这类"必须绝对可读"的地方用它 */
  bgSolid: '#FFF8F4',
  bgTint: '#FDEFE7',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF3EC',
  ink: '#2E2A28',
  inkMid: '#5C534E',
  inkSoft: '#8A7C75',
  inkFaint: '#B9ABA3',
  line: '#F1E3DA',
  lineStrong: '#E4D2C7',

  primary: '#E8836B',
  primaryPress: '#D4715A',
  primarySoft: '#FFE7DE',
  primaryInk: '#8C4634',

  mint: '#7FC8A9',
  mintSoft: '#E4F5ED',
  sky: '#8FB8E8',
  skySoft: '#E7F0FB',
  lavender: '#B3A4E0',
  lavenderSoft: '#EFEAFA',
  butter: '#F2C86B',
  butterSoft: '#FCF2DA',

  /** 经期关怀专用：低饱和暖陶色，绝不是警告红 */
  care: '#E0A48C',
  careSoft: '#FBEDE6',
  careInk: '#9A6350',

  danger: '#B4574E',
  dangerSoft: '#F8E7E4',
  ok: '#4E9E7B',
} as const;

export const weatherMeta = {
  sunny: { emoji: '☀️', label: '晴天', color: color.butterSoft },
  cloudy: { emoji: '⛅', label: '多云', color: color.skySoft },
  rainy: { emoji: '🌧️', label: '小雨', color: color.lavenderSoft },
  hug: { emoji: '🤗', label: '需要抱抱', color: color.primarySoft },
} as const;

export const categoryMeta = {
  date: { emoji: '🍽️', label: '约会', color: color.primary },
  anniversary: { emoji: '💗', label: '纪念日', color: color.care },
  chore: { emoji: '🧹', label: '家务', color: color.mint },
  trip: { emoji: '🧳', label: '旅行', color: color.sky },
  reminder: { emoji: '⏰', label: '提醒', color: color.inkSoft },
  movie: { emoji: '🎬', label: '一起看电影', color: color.lavender },
} as const;

export const reactionMeta = {
  lol: { emoji: '😂', label: '笑哭' },
  scared: { emoji: '😱', label: '害怕' },
  ship: { emoji: '💞', label: '嗑到了' },
  hug: { emoji: '🤗', label: '需要抱抱' },
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const font = {
  h1: { fontSize: 26, fontWeight: '700' as const, color: color.ink, letterSpacing: 0.2 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: color.ink },
  h3: { fontSize: 16, fontWeight: '600' as const, color: color.ink },
  body: { fontSize: 14, fontWeight: '400' as const, color: color.inkMid, lineHeight: 21 },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const, color: color.ink },
  small: { fontSize: 12, fontWeight: '400' as const, color: color.inkSoft, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: '500' as const, color: color.inkFaint },
  mono: { fontSize: 13, fontWeight: '600' as const, color: color.ink },
} as const;

export const shadow = {
  card: {
    shadowColor: '#B58C79',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  float: {
    shadowColor: '#B58C79',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

/** 免责声明：健康相关页面必须常驻 */
export const HEALTH_DISCLAIMER = '仅用于记录和陪伴，不构成医疗建议。';

/* ========================================================================
 * 逐页主题（用户要求：每个页面一套，不能都一样、要二次元且各有气质）
 * 页面只需要：import { themedColor } from '../ui/theme';
 *            const color = themedColor('today');   ← 页面里所有 color.xxx 就地换色
 * 不动任何 JSX 结构，也不影响别的页面。
 * ===================================================================== */
export type PageThemeKey = 'today' | 'life' | 'care' | 'us';

const PAGE_PALETTES: Record<PageThemeKey, { accent: string; accentSoft: string; ink: string; inkSoft: string; bg: string }> = {
  today: { accent: '#E9A24B', accentSoft: 'rgba(233,162,75,0.16)', ink: '#4A3728', inkSoft: '#8C7460', bg: 'rgba(255,248,238,0.72)' },
  life: { accent: '#4FAE7C', accentSoft: 'rgba(79,174,124,0.16)', ink: '#26402F', inkSoft: '#6B8A77', bg: 'rgba(242,251,245,0.72)' },
  care: { accent: '#E8739A', accentSoft: 'rgba(232,115,154,0.16)', ink: '#4A2A36', inkSoft: '#96707E', bg: 'rgba(255,244,247,0.72)' },
  us: { accent: '#F0B3C8', accentSoft: 'rgba(240,179,200,0.18)', ink: '#4A2A36', inkSoft: '#96707E', bg: 'rgba(255,246,250,0.72)' },
};

/** 取某一页的配色（在页面的 color 基础上换主色/文字色/背景） */
export function themedColor(key: PageThemeKey) {
  const p = PAGE_PALETTES[key] ?? PAGE_PALETTES.today;
  return {
    ...color,
    get bg() {
      // 用 getter：color 是模块级常量，读取时才判定（否则永远拿到旧的半透明奶白）
      return CUSTOM_BG_ACTIVE ? 'transparent' : p.bg;
    },
    primary: p.accent,
    primarySoft: p.accentSoft,
    primaryInk: p.accent,
    ink: p.ink,
    inkSoft: p.inkSoft,
  };
}

/* ------------------------------------------------------------------
 * 自定义背景开关
 * 用户上传了 MP4/图片做背景时，页面底色必须是**全透明**，
 * 否则那层半透明奶白（rgba(255,248,244,.55)）会把视频糊成黄色。
 * Aurora 检测到 customBackground 后会调用 setCustomBgActive(true)。
 * ------------------------------------------------------------------ */
let CUSTOM_BG_ACTIVE = false;
export function setCustomBgActive(active: boolean): void {
  CUSTOM_BG_ACTIVE = active;
}
export function isCustomBgActive(): boolean {
  return CUSTOM_BG_ACTIVE;
}

/**
 * 页面根容器底色（渲染时取值，不能进 StyleSheet.create）。
 *
 * 有自定义背景（图片/MP4）时返回 `'transparent'`——用户明确要求
 * 「全透明，不是半透」：原来那层 rgba 奶白会把视频糊成一片黄。
 * 没有背景时返回传入的兜底色（默认就是原来的半透明奶白），视觉零变化。
 */
export function pageBg(fallback: string = color.bg): string {
  return CUSTOM_BG_ACTIVE ? 'transparent' : fallback;
}

/**
 * 卡片/区块表面色（渲染时取值）。
 *
 * 有自定义背景时用**中性薄玻璃** rgba(255,255,255,0.20)：
 *   - 不用 'transparent'：用户实测全透明后"前后融到一块、特别乱"，层次全没了
 *   - 不用奶白 #FFF8F4：那是他嫌"黄"的根源
 * 关键卡片/弹层另有真·毛玻璃（BlurView）叠在上面。
 */
export function surf(kind: 'base' | 'alt' = 'base'): string {
  if (CUSTOM_BG_ACTIVE) return 'rgba(255,255,255,0.95)';
  return kind === 'alt' ? color.surfaceAlt : color.surface;
}

/**
 * 语义色块（粉/红/绿这类柔和底）。
 * 用户明确：只让**背景**透，"UI 必须在背景之上、要看得见"，
 * 所以这里保持原来的柔和底色，不再让它变透明。
 */
export function tint(fill: string): string {
  return fill;
}
