/**
 * 「时空感」：把当前时间翻译成季节 + 昼夜 + 一套配色。
 *
 * 用户要的是"框架跟着春夏秋冬变化、白天黑夜也跟着时间变，看着高科技一点"。
 * 这里只做纯计算（好测），具体怎么画在 `ui/AmbientSky.tsx`。
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type DayPhase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night' | 'deepNight';

export interface AmbiencePalette {
  /** 垂直渐变的三个色带（上 → 下），用三层半透明 View 叠出来 */
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  /** 光晕/浮游物的颜色 */
  glow: string;
  /** 强调色：季节徽章、边框高光用它 */
  accent: string;
  /** 夜里才撒星星（白天是光斑） */
  stars: boolean;
}

export interface Ambience {
  season: Season;
  phase: DayPhase;
  /** 「春 · 黄昏」这种一句话标签 */
  label: string;
  /** 按时间变化的问候语 */
  greeting: string;
  /** 这个季节飘的小东西 */
  mote: string;
  palette: AmbiencePalette;
}

const SEASON_LABEL: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

const PHASE_LABEL: Record<DayPhase, string> = {
  dawn: '清晨',
  morning: '上午',
  noon: '正午',
  afternoon: '午后',
  dusk: '黄昏',
  night: '夜晚',
  deepNight: '深夜',
};

const SEASON_MOTE: Record<Season, string> = {
  spring: '🌸',
  summer: '✨',
  autumn: '🍂',
  winter: '❄️',
};

const SEASON_ACCENT: Record<Season, string> = {
  spring: '#E8A0B4',
  summer: '#69C3B0',
  autumn: '#D99058',
  winter: '#8FB6DA',
};

/**
 * 季节（北半球，按月就够用）：
 *   3-5 春 / 6-8 夏 / 9-10 秋 / **11-2 冬**
 * 用户在 11 月下旬看到界面写"秋"觉得不对（那时已经穿棉袄了），
 * 所以把冬天提前到 11 月 —— 这也是气象上更贴近体感的划分。
 */
export function seasonOf(date: Date): Season {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 10) return 'autumn';
  return 'winter';
}

export function dayPhaseOf(date: Date): DayPhase {
  const h = date.getHours();
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 11) return 'morning';
  if (h >= 11 && h < 14) return 'noon';
  if (h >= 14 && h < 17) return 'afternoon';
  if (h >= 17 && h < 19) return 'dusk';
  if (h >= 19 && h < 23) return 'night';
  return 'deepNight';
}

function skyFor(season: Season, phase: DayPhase): AmbiencePalette {
  const night = phase === 'night' || phase === 'deepNight';
  const dusk = phase === 'dusk' || phase === 'dawn';
  const accent = SEASON_ACCENT[season];
  if (night) {
    // 夜：深靛蓝 → 墨紫，星星开着
    return {
      skyTop: season === 'winter' ? 'rgba(38,52,84,0.55)' : 'rgba(46,44,84,0.55)',
      skyMid: 'rgba(74,58,102,0.30)',
      skyBottom: 'rgba(255,246,239,0.12)',
      glow: season === 'winter' ? 'rgba(143,182,218,0.55)' : 'rgba(179,164,224,0.45)',
      accent,
      stars: true,
    };
  }
  if (dusk) {
    // 黄昏/清晨：橘粉 + 淡紫
    return {
      skyTop: 'rgba(255,193,166,0.50)',
      skyMid: 'rgba(255,220,200,0.34)',
      skyBottom: 'rgba(255,250,245,0.16)',
      glow: 'rgba(255,190,150,0.60)',
      accent,
      stars: false,
    };
  }
  // 白天
  return {
    skyTop: 'rgba(255,238,226,0.55)',
    skyMid: 'rgba(255,246,236,0.30)',
    skyBottom: 'rgba(255,252,248,0.14)',
    glow: season === 'summer' ? 'rgba(127,200,169,0.45)' : 'rgba(255,214,190,0.55)',
    accent,
    stars: false,
  };
}

function greetingFor(phase: DayPhase, myName: string, partnerName: string): string {
  const who = myName ? `，${myName}` : '';
  const both = partnerName ? `和${partnerName}` : '';
  switch (phase) {
    case 'dawn':
      return `天刚亮${who}。${both}又要开始新的一天了`;
    case 'morning':
      return `早安${who}。${both}今天也要顺顺利利`;
    case 'noon':
      return `中午好${who}。记得吃饭，别空着肚子`;
    case 'afternoon':
      return `下午好${who}。忙里偷个闲吧`;
    case 'dusk':
      return `天色暗下来了${who}。${both}今天怎么样`;
    case 'night':
      return `晚上好${who}。今晚想和你聊两句`;
    default:
      return `夜深了${who}。别熬太晚，${both}明天还要在一起`;
  }
}

export function ambienceFor(
  date: Date = new Date(),
  names: { mine?: string; partner?: string } = {},
): Ambience {
  const season = seasonOf(date);
  const phase = dayPhaseOf(date);
  return {
    season,
    phase,
    label: `${SEASON_LABEL[season]} · ${PHASE_LABEL[phase]}`,
    greeting: greetingFor(phase, names.mine ?? '', names.partner ?? ''),
    mote: SEASON_MOTE[season],
    palette: skyFor(season, phase),
  };
}

/** 参考那几款情侣 App 的"每日一句"：**双方看到的是同一句**，所以只按日期定，不随机 */
const DAILY_QUOTES: string[] = [
  '今天也要一起好好吃饭，吵架的话题留到明天再说。',
  '想你了这句话不用挑时机，随时都能发。',
  '我们不是谁离不开谁，是刚好谁都想留下。',
  '把小事说给对方听，日子就有了回声。',
  '你今天有没有哪一刻，忽然想起我？',
  '不用每天都灿烂，阴天也可以一起待在屋里。',
  '喜欢是心跳，爱是心跳之后还愿意留下来收拾厨房。',
  '两个人的家务、账单、情绪，都算共同项目。',
  '累了就说一声，我这边随时接管。',
  '我们不用赢过谁，赢了日子就行。',
  '如果今天很难，就把标准降到"活着"，我在。',
  '一起看的那部片，哪怕很烂，也会变成我们的梗。',
  '想抱的时候就直说，别等我猜。',
  '我在意的是你有没有好好睡觉，不是你有没有秒回。',
  '把"随便"换成"我想吃这个"，我们会省下很多猜谜时间。',
  '允许彼此有秘密，也允许彼此随时打开话头。',
  '我们把每天过成一样，也是一种浪漫。',
  '今天的风很好，想分你一半。',
  '不完美的人，也能给出很完整的喜欢。',
  '纪念日不只是那天，是"我们还在继续"的每一天。',
];

/** 每天一句：用日期（年月日）做种子，两台手机同一天必然同一句 */
export function dailyQuote(date: Date = new Date()): string {
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  return DAILY_QUOTES[seed % DAILY_QUOTES.length];
}

/** 首页那句"在一起的第 N 天"用的天数（含当天） */
export function daysTogether(startedAt: string | null | undefined, now: Date = new Date()): number {  if (!startedAt) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startedAt.trim());
  if (!m) return 0;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}
