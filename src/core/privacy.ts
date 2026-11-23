/**
 * 隐私投影层（方案 §6 权限矩阵 / 四档投影表）
 *
 * 关键原则：**未授权即不下发**。private 档返回 null，调用方（Hub）据此把字段整个删掉，
 * 前端拿不到"有没有数据"的任何线索，不是"前端藏起来"。
 */

import type {
  FlowLevel,
  GiftIdea,
  PartnerPeriodProjection,
  PeriodData,
  PeriodRecord,
  PeriodTier,
  Role,
} from './types';
import { isBetween } from './time';
import { predictNext } from './period';

export const TIER_ORDER: PeriodTier[] = ['private', 'care', 'predict', 'full'];

export interface TierMeta {
  tier: PeriodTier;
  label: string;
  /** 伴侣端会看到什么（授权页实时预览用） */
  partnerSees: string[];
  summary: string;
}

export const TIER_META: Record<PeriodTier, TierMeta> = {
  private: {
    tier: 'private',
    label: '完全私密',
    summary: 'TA 看不到任何经期相关信息',
    partnerSees: ['一条中性说明：TA 的关怀信息由 TA 自己管理'],
  },
  care: {
    tier: 'care',
    label: '仅关怀状态',
    summary: 'TA 只看到「TA 今天可能需要关心」',
    partnerSees: ['是否今天需要关心（是/否）', '可直接执行的关怀动作卡片'],
  },
  predict: {
    tier: 'predict',
    label: '预测日历可见',
    summary: 'TA 在共享日历上看到预测日期标记，看不到细节',
    partnerSees: ['今天的关怀状态', '共享日历上的预测日期点标记（无文字、无细节）'],
  },
  full: {
    tier: 'full',
    label: '完全共享',
    summary: 'TA 可看到日期、流量、症状、情绪、备注',
    partnerSees: ['日期与流量', '症状与情绪标签', '备注全文', '预测日期'],
  },
};

/**
 * 计算伴侣端可见的经期投影。
 * 返回 null 表示"什么都不下发"（private）。
 */
export function projectPeriodForPartner(
  data: PeriodData,
  ownerRole: Role,
  viewerRole: Role,
  today: string,
): PartnerPeriodProjection | null {
  if (ownerRole === viewerRole) {
    throw new Error('projectPeriodForPartner 只用于伴侣视角');
  }
  if (data.tier === 'private') return null;

  const careHint = isCareDay(data, today);
  const projection: PartnerPeriodProjection = {
    tier: data.tier,
    careHint,
    date: today,
  };

  if (data.tier === 'predict' || data.tier === 'full') {
    const prediction = predictNext(data.records, today, data.predictionEnabled);
    projection.predictedDates = prediction.predictedDates;
  }

  if (data.tier === 'full') {
    projection.records = visibleRecords(data).map((r) => ({
      startDate: r.startDate,
      endDate: r.endDate,
      flow: r.flow,
      symptoms: r.symptoms,
      moods: r.moods,
      note: r.note,
    }));
    // 3.10 计划记录：默认完全不可见，必须本人在「完全共享」基础上再单独勾选
    if (data.sharePlanLog) {
      projection.planLog = data.planLog.map((p) => ({
        kind: p.kind,
        date: p.date,
        note: p.note,
      }));
    }
  }

  return projection;
}

/**
 * 历史记录是否一并可见。
 * 规格 P-04 决议：默认只共享"授权之后新建的记录"，历史需用户单独勾选。
 */
export function visibleRecords(data: PeriodData): PeriodRecord[] {
  const sorted = [...data.records].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  if (data.shareHistoryFrom === null) {
    // 只共享最近一次变更之后的记录；若从未变更则全部
    const lastChange = data.tierHistory[data.tierHistory.length - 1];
    if (!lastChange) return sorted;
    return sorted.filter((r) => r.createdAt >= lastChange.at);
  }
  return sorted.filter((r) => r.createdAt >= (data.shareHistoryFrom as number));
}

/** 今天是否需要关心：经期进行中，或落在预测窗口内 */
export function isCareDay(data: PeriodData, today: string): boolean {
  const ongoing = data.records.some((r) =>
    isBetween(today, r.startDate, r.endDate === null ? null : r.endDate),
  );
  if (ongoing) return true;
  if (!data.predictionEnabled) return false;
  const prediction = predictNext(data.records, today, true);
  return prediction.predictedDates.includes(today);
}

/** 礼物灵感：反向隐私保护，只有所有者能看到，除非单条揭示 */
export function projectGiftIdeas(ideas: GiftIdea[], viewerRole: Role): GiftIdea[] {
  return ideas.filter((i) => i.ownerRole === viewerRole || i.revealed);
}

// ---------------------------------------------------------------------------
// 脱敏文案（锁屏 / 推送唯一口径，方案 §9.1）
// ---------------------------------------------------------------------------

export const MASK = {
  periodStartSelf: '今天记得照顾好自己',
  careHint: 'TA 今天可能需要关心',
  predictHint: '这几天多留意 TA 的状态',
  recordSaved: '记录已保存',
  authChanged: 'TA 更新了授权设置',
  roomInvite: 'TA 想和你一起看电影',
  roomWaiting: 'TA 暂时不在了，房间还在',
  recapSaved: '你们的一份回忆已保存',
  arrived: 'TA 已安全到家',
  todoAdded: '清单有更新',
  moodSet: 'TA 更新了今天的状态',
  unbind: '你的双人空间正在变更中',
  giftRevealed: 'TA 给你留了个提示',
  leadRequest: 'TA 想接管播放控制',
  voiceNote: 'TA 给你留了一段话',
  voiceInvite: 'TA 想和你语音',
  voiceConnected: '语音已接通（不录音）',
  /** 照着「怎么照顾我」清单做了一件：锁屏只说有这么个动作，不透露清单原文 */
  careAction: 'TA 想为你做点事',
  /** 收到一张卡片（抱抱卡等）：只说有卡片，不带正文 */
  cardFromPartner: 'TA 给你留了一张卡片',
  /** 收下卡片：只告诉发卡人"被看见了"，同样不带正文 */
  cardAccepted: 'TA 收下了你的卡片',
  /** 催一下：只说在等你，不带房间号/片名 */
  remindPartner: 'TA 在等你',
  /** 打气：不带习惯名称 */
  cheerHabit: 'TA 在给你打气',
} as const;

export const FORBIDDEN_WORDS = [
  '经期',
  '生理期',
  '姨妈',
  '月经',
  '流量',
  '痛经',
  '避孕',
  '备孕',
] as const;

/** 锁屏文案安全检查：出现任何敏感词即视为不合格（有测试守住） */
export function isMaskedCopySafe(text: string): boolean {
  return !FORBIDDEN_WORDS.some((w) => text.includes(w));
}

/** 生成锁屏/通知文案；若模板被污染则拒绝发送而不是降级明文 */
export function safeMaskText(template: string): string | null {
  return isMaskedCopySafe(template) ? template : null;
}

export const SYMPTOM_OPTIONS = ['腹痛', '腰酸', '头痛', '乏力', '长痘', '胸胀', '其他'] as const;
export const MOOD_OPTIONS = ['平稳', '烦躁', '低落', '敏感', '开心', '疲惫'] as const;
export const FLOW_LABEL: Record<FlowLevel, string> = {
  light: '少',
  medium: '中',
  heavy: '多',
};
