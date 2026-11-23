/**
 * 时间与日期工具 —— 全部使用 UTC 纯日期计算，避免时区导致的跨日 bug。
 */

export const MS_DAY = 86_400_000;
export const MIN_OF_DAY = 1440;

/** 把时间戳/Date 转为 YYYY-MM-DD（本地时区语义下的"今天"） */
export function toISODate(input: Date | number = new Date()): string {
  const d = typeof input === 'number' ? new Date(input) : input;
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → UTC 零点时间戳（用于纯日期加减） */
export function parseISODate(iso: string): number {
  const [y, m, d] = iso.split('-').map((v) => Number.parseInt(v, 10));
  return Date.UTC(y, m - 1, d);
}

export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = parseISODate(iso);
  if (Number.isNaN(t)) return false;
  return toISODateUTC(t) === iso;
}

function toISODateUTC(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  return toISODateUTC(parseISODate(iso) + n * MS_DAY);
}

/** a - b，单位：天 */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a) - parseISODate(b)) / MS_DAY);
}

/** a 是否在 [from, to] 之间（含端点），to 为 null 表示开区间 */
export function isBetween(iso: string, from: string, to: string | null): boolean {
  if (diffDays(iso, from) < 0) return false;
  if (to === null) return true;
  return diffDays(to, iso) >= 0;
}

export function minToClock(min: number): string {
  const safe = ((Math.round(min) % MIN_OF_DAY) + MIN_OF_DAY) % MIN_OF_DAY;
  const h = `${Math.floor(safe / 60)}`.padStart(2, '0');
  const m = `${safe % 60}`.padStart(2, '0');
  return `${h}:${m}`;
}

export function clockToMin(clock: string): number {
  const [h, m] = clock.split(':').map((v) => Number.parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

/** 秒 → mm:ss 或 h:mm:ss */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${`${m}`.padStart(2, '0')}:${`${sec}`.padStart(2, '0')}`;
  return `${`${m}`.padStart(2, '0')}:${`${sec}`.padStart(2, '0')}`;
}

/** 毫秒 → "29:41" 倒计时显示 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${`${m % 60}`.padStart(2, '0')}:${`${s}`.padStart(2, '0')}`;
  }
  return `${`${m}`.padStart(2, '0')}:${`${s}`.padStart(2, '0')}`;
}

/** 月份网格（含前后补位），返回 6*7 的日期字符串数组 */
export function monthMatrix(year: number, month1to12: number): string[][] {
  const first = new Date(Date.UTC(year, month1to12 - 1, 1));
  const firstWeekday = first.getUTCDay();
  const startMs = first.getTime() - firstWeekday * MS_DAY;
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const row: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      row.push(toISODateUTC(startMs + (w * 7 + d) * MS_DAY));
    }
    weeks.push(row);
  }
  return weeks;
}

export function monthLabel(year: number, month1to12: number): string {
  return `${year} 年 ${month1to12} 月`;
}

export function shiftMonth(
  year: number,
  month1to12: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + (month1to12 - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function daysTogether(boundAt: number | null, now: number): number {
  if (!boundAt) return 0;
  const a = toISODate(boundAt);
  const b = toISODate(now);
  return Math.max(0, diffDays(b, a));
}

/**
 * 展示用的「在一起第 N 天」。
 *
 * `daysTogether` 返回的是"已经过去多少天"，绑定当天是 0；
 * 但恋爱产品里第一天应该显示"第 1 天"，显示 0 看着像算错了。
 */
export function togetherDayNumber(startAt: number | null, now: number): number {
  if (!startAt) return 0;
  return Math.max(1, daysTogether(startAt, now) + 1);
}

export function todayISO(now: number = Date.now()): string {
  return toISODate(now);
}

export function weekdayCN(iso: string): string {
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  return names[new Date(parseISODate(iso)).getUTCDay()];
}
