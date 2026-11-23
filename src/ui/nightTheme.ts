/**
 * 二次元夜景主题（影院 / 电视直播专用）
 *
 * 配色取自 Wallpaper Engine 壁纸《伊蕾娜：闲暇微恙——夜幕 Night》（id 3470764447）：
 * 壁纸作者自己设的主色是 rgb(87,248,255) 青蓝，夜空是深靛紫，月亮和灯是暖金。
 * 所以这里不是随便找个"暗色主题"，而是按那张壁纸取的一套色：
 *   - 底色：深靛夜空（#070B18 → #131B36），带一点点紫
 *   - 主色：青蓝 #57F8FF（壁纸主色）
 *   - 副色：月紫 #A98BFF、樱粉 #FF9BD2、暖金 #FFD37A
 *   - 卡片：半透明"玻璃"，让夜空透出来（不是纯黑块）
 *
 * 注意：本文件只服务影院/直播两个模块。其他页面仍用 ui/theme.ts 的奶油暖色，
 * 两边互不影响（用户明确要求"直播不要跟影院加一块"，视觉上它们是一套，但代码独立）。
 */

export const night = {
  // ---- 夜空底色 ----
  bgDeep: '#070B18',
  bg: '#0B1020',
  bgSoft: '#131B36',
  bgLift: '#1A2347',

  // ---- 玻璃卡片 ----
  glass: 'rgba(20,28,56,0.72)',
  glassHi: 'rgba(38,52,100,0.62)',
  glassDeep: 'rgba(9,13,28,0.86)',
  cardSolid: '#141C38',

  // ---- 描边 / 分隔 ----
  line: 'rgba(120,186,255,0.16)',
  lineStrong: 'rgba(120,186,255,0.38)',
  lineGlow: 'rgba(87,248,255,0.55)',

  // ---- 文字 ----
  text: '#EAF4FF',
  textDim: '#A8BBDD',
  textFaint: '#6C7FA6',
  textOnLight: '#06232B',

  // ---- 主色（壁纸主色）----
  cyan: '#57F8FF',
  cyanSoft: 'rgba(87,248,255,0.14)',
  cyanLine: 'rgba(87,248,255,0.42)',

  violet: '#A98BFF',
  violetSoft: 'rgba(169,139,255,0.18)',

  pink: '#FF9BD2',
  pinkSoft: 'rgba(255,155,210,0.16)',

  gold: '#FFD37A',
  goldSoft: 'rgba(255,211,122,0.16)',

  mint: '#7BF1C6',
  mintSoft: 'rgba(123,241,198,0.16)',

  // ---- 状态 ----
  ok: '#4FF0B6',
  warn: '#FFC24B',
  danger: '#FF5F7A',
  dangerSoft: 'rgba(255,95,122,0.16)',
  unknown: '#7C8BB0',
} as const;

/**
 * 夜空分层（从下往上叠）。
 * RN 没有内置线性渐变（本项目也没装 expo-linear-gradient，不想为了一张背景加原生依赖），
 * 所以用"多层半透明 View 依次叠加"来伪造渐变，视觉效果足够。
 */
export const nightLayers = [
  { color: '#070B18', opacity: 1 },
  { color: '#0D1330', opacity: 0.9 },
  { color: '#152046', opacity: 0.55 },
  { color: '#241A4A', opacity: 0.35 },
] as const;

/** 月亮 / 光源的暖金光晕 */
export const glow = {
  moon: 'rgba(255,226,170,0.30)',
  moonCore: '#FFE7B8',
  cyan: 'rgba(87,248,255,0.30)',
  violet: 'rgba(169,139,255,0.26)',
  pink: 'rgba(255,155,210,0.22)',
} as const;

/**
 * 夜景模块的文字。
 * 自定义壁纸（浅色 MV/插画）会在模块背后透出来，纯浅色文字压在浅背景上会糊，
 * 所以统一加一层很淡的黑色文字阴影——不遮壁纸，但字能看清。
 */
export const nightFont = {
  hero: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: night.text,
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 8,
  },
  h1: {
    fontSize: 21,
    fontWeight: '700' as const,
    color: night.text,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 7,
  },
  h2: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: night.text,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
  body: {
    fontSize: 13.5,
    fontWeight: '400' as const,
    color: night.textDim,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
  },
  bodyStrong: {
    fontSize: 13.5,
    fontWeight: '600' as const,
    color: night.text,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
  },
  small: {
    fontSize: 11.5,
    fontWeight: '400' as const,
    color: night.textDim,
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
  },
  tiny: {
    fontSize: 10.5,
    fontWeight: '500' as const,
    color: night.textDim,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
  },
  num: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: night.text,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
  },
} as const;

/** 玻璃卡片的阴影（深色底上要偏黑，偏暖的阴影会脏） */
export const nightShadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  glow: {
    shadowColor: night.cyan,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
} as const;
