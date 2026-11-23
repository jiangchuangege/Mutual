/**
 * 经期周期计算（方案 3.2 / 3.11）
 * 只做记录与统计，不做任何医疗判断；异常仅输出"建议就医检查"的中性提示。
 */

import type { PeriodData, PeriodRecord } from './types';
import { addDays, diffDays, isBetween } from './time';

export interface CycleSummary {
  starts: string[];
  cycleLengths: number[];
  periodLengths: number[];
  avgCycle: number | null;
  avgLength: number | null;
  sampleCount: number;
  lastStart: string | null;
}

export interface Prediction {
  nextStart: string | null;
  predictedDates: string[];
  avgCycle: number | null;
  avgLength: number | null;
  confidence: 'none' | 'low' | 'medium';
  note: string;
}

export const DEFAULT_CYCLE = 28;
export const DEFAULT_LENGTH = 5;
export const MIN_SAMPLES_FOR_PREDICTION = 1;
export const RELIABLE_SAMPLES = 3;

function sortedAsc(records: PeriodRecord[]): PeriodRecord[] {
  return [...records].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

export function summarize(records: PeriodRecord[]): CycleSummary {
  const asc = sortedAsc(records);
  const starts = asc.map((r) => r.startDate);
  const cycleLengths: number[] = [];
  for (let i = 1; i < starts.length; i += 1) {
    cycleLengths.push(diffDays(starts[i], starts[i - 1]));
  }
  const periodLengths = asc
    .filter((r) => r.endDate !== null)
    .map((r) => diffDays(r.endDate as string, r.startDate) + 1)
    .filter((n) => n > 0 && n <= 30);

  const avg = (arr: number[]): number | null =>
    arr.length === 0 ? null : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  return {
    starts,
    cycleLengths,
    periodLengths,
    avgCycle: avg(cycleLengths),
    avgLength: avg(periodLengths),
    sampleCount: starts.length,
    lastStart: starts.length > 0 ? starts[starts.length - 1] : null,
  };
}

export function predictNext(
  records: PeriodRecord[],
  today: string,
  enabled = true,
): Prediction {
  if (!enabled) {
    return {
      nextStart: null,
      predictedDates: [],
      avgCycle: null,
      avgLength: null,
      confidence: 'none',
      note: '预测已关闭',
    };
  }
  const summary = summarize(records);
  if (summary.lastStart === null || summary.sampleCount < MIN_SAMPLES_FOR_PREDICTION) {
    return {
      nextStart: null,
      predictedDates: [],
      avgCycle: null,
      avgLength: null,
      confidence: 'none',
      note: '再记录 1–2 次就能给你估算',
    };
  }

  const cycle = summary.avgCycle ?? DEFAULT_CYCLE;
  const length = summary.avgLength ?? DEFAULT_LENGTH;
  let nextStart = addDays(summary.lastStart, cycle);

  // 若预测日已明显过去（用户未继续记录），顺延到未来最近的一次
  let guard = 0;
  while (diffDays(nextStart, today) < 0 && guard < 24) {
    nextStart = addDays(nextStart, cycle);
    guard += 1;
  }

  const predictedDates: string[] = [];
  for (let i = 0; i < length; i += 1) predictedDates.push(addDays(nextStart, i));

  const confidence: Prediction['confidence'] =
    summary.sampleCount >= RELIABLE_SAMPLES ? 'medium' : 'low';

  return {
    nextStart,
    predictedDates,
    avgCycle: cycle,
    avgLength: length,
    confidence,
    note:
      confidence === 'medium'
        ? '预测仅供参考，身体变化时可能不准'
        : '记录次数较少，估算可能偏差较大',
  };
}

export interface AnomalyResult {
  flagged: boolean;
  reasons: string[];
  /** 中性文案，仅本人可见，永不带诊断结论 */
  copy: string;
}

/**
 * 规则触发的温和提示（不做诊断、不推送给伴侣）。
 * 规则：周期跨度 > 45 天、经期持续 > 10 天、连续两次周期波动 > 14 天。
 */
export function anomalyFlags(records: PeriodRecord[]): AnomalyResult {
  const reasons: string[] = [];
  const summary = summarize(records);

  if (summary.cycleLengths.some((n) => n > 45)) reasons.push('cycle-too-long');
  if (summary.periodLengths.some((n) => n > 10)) reasons.push('period-too-long');

  if (summary.cycleLengths.length >= 2) {
    for (let i = 1; i < summary.cycleLengths.length; i += 1) {
      if (Math.abs(summary.cycleLengths[i] - summary.cycleLengths[i - 1]) > 14) {
        reasons.push('cycle-fluctuation');
        break;
      }
    }
  }

  const flagged = reasons.length > 0;
  return {
    flagged,
    reasons,
    copy: flagged
      ? '这段时间的记录变化较大，建议去医院做一次检查。本提示仅根据你自己记录的数据生成，不构成诊断。'
      : '',
  };
}

/** 某天是否处于经期中（用于日历渲染） */
export function recordsOnDay(records: PeriodRecord[], iso: string): PeriodRecord[] {
  return records.filter((r) => isBetween(iso, r.startDate, r.endDate));
}

/** 当前进行中的记录（未填结束日期且已开始） */
export function ongoingRecord(records: PeriodRecord[], today: string): PeriodRecord | null {
  const candidates = records.filter(
    (r) => r.endDate === null && diffDays(today, r.startDate) >= 0,
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
}

/** 把预测日期在给定月份里的天号抽出来（日历标记用） */
export function predictedDaysInMonth(
  data: PeriodData,
  today: string,
  year: number,
  month1to12: number,
): number[] {
  const prediction = predictNext(data.records, today, data.predictionEnabled);
  const prefix = `${year}-${`${month1to12}`.padStart(2, '0')}-`;
  return prediction.predictedDates
    .filter((d) => d.startsWith(prefix))
    .map((d) => Number.parseInt(d.slice(8), 10));
}

/** 经期天号列表（本人日历用） */
export function periodDaysInMonth(
  records: PeriodRecord[],
  year: number,
  month1to12: number,
): number[] {
  const days = new Set<number>();
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${`${month1to12}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
    if (recordsOnDay(records, iso).length > 0) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}
