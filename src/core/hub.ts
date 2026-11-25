/**
 * Hub —— 服务端权威状态模拟（真实产品里这是后端 + 数据库）
 *
 * 设计要点：
 * 1. 所有写操作都在这里校验，UI 不能绕过；
 * 2. snapshot(role) **按角色做隐私投影**，未授权的经期字段根本不出现在返回值里；
 * 3. 房间播放状态以服务端 mediaState 为唯一权威，设备只做跟随与校准；
 * 4. 通知文案强制过脱敏白名单，模板被污染时拒发而不是降级明文。
 */

import { Emitter } from './emitter';
import { expandMod, parseMod } from './voxelMod';

/** 模组列表元素（形状已展开进存档，这里只留展示信息） */
type HubModList = Array<{ id: string; name: string; blocks: Array<{ id: number; name: string; color: string }>; createdAt: number }>;
import { MASK, projectGiftIdeas, projectPeriodForPartner, safeMaskText } from './privacy';
import { predictNext } from './period';
import { isTerminal, transition } from './room';
import { togetherDayNumber, todayISO } from './time';
import type {
  Achievement,
  ActivityAction,
  ActivityItem,
  AnnualReport,
  Assignee,
  AuditEntry,
  BoundaryCategory,
  BoundaryItem,
  CalendarEvent,
  Card,
  CardKind,
  Chore,
  CmsSourceConfig,
  CollectionItem,
  CollectionKind,
  ComfortItem,
  CommentItem,
  ConflictEntry,
  DailyQuestion,
  DataChoice,
  Danmaku,
  DiaryEntry,
  EventCategory,
  FlowLevel,
  GameSession,
  GameSpec,
  VoxelWorld,
  GiftIdea,
  Goal,
  Gender,
  Habit,
  IntimacyCard,
  LdrPlan,
  LedgerEntry,
  LiveSourceConfig,
  MediaState,
  Member,
  MusicState,
  MusicTrack,
  MoodEntry,
  NotificationRecord,
  PeriodData,
  PeriodRecord,
  PeriodTier,
  PickSession,
  PlanItem,
  Reaction,
  ReactionKind,
  RelStage,
  Role,
  Room,
  RoomEvent,
  RoomView,
  SafetyEvent,
  ShoppingItem,
  SocialReport,
  SpaceSnapshot,
  SpaceState,
  ThemeId,
  TimelineNode,
  Todo,
  TrustSettings,
  UnbindRequest,
  ValuesTopic,
  VaultItem,
  VoiceCallState,
  VoiceNote,
  Vote,
  WatchPlan,
  WatchQueueItem,
  Weather,
  WeeklyReview,
  Result,
} from './types';
import { fail, ok } from './types';

export interface HubOptions {
  /** 时间压缩倍数：60 表示 60 倍速（演示用）。默认 1 = 真实时间 */
  scale?: number;
  /** 模拟网络单程延迟（毫秒），用于对时样本 */
  latencyMs?: number;
  /** 各设备时钟偏移（毫秒），默认 B 快 700ms，用来证明对时逻辑有效 */
  clockSkew?: Record<Role, number>;
  now?: () => number;
  seed?: boolean;
}

let seqCounter = 0;
function uid(prefix: string): string {
  seqCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${seqCounter.toString(36)}`;
}

function randomCode(): string {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

/**
 * 生成一个人固定的对外 ID（例：TW7K3M9Q）。
 *
 * 用去掉易混字符（0/O/1/I/L）的字母表，方便口头念、手抄不认错。
 */
export function newPublicId(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `TW${out.slice(0, 6)}`.padEnd(8, 'X');
}

/** 规范化用户输入的 ID：去空格、转大写 */
export function normalizePublicId(input: string): string {
  return (input ?? '').replace(/[\s-]/g, '').toUpperCase();
}

function randomToken(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 22; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function emptyPeriod(ownerRole: Role): PeriodData {
  return {
    tier: 'private',
    predictionEnabled: true,
    records: [],
    tierHistory: [],
    planLog: [],
    shareHistoryFrom: null,
    sharePlanLog: false,
  };
}

function emptySelfAssess(): SelfAssessmentLike | null {
  return null;
}

type SelfAssessmentLike = {
  satisfaction: number;
  security: number;
  communication: number;
  fairness: number;
  at: number;
  history: Array<{
    at: number;
    satisfaction: number;
    security: number;
    communication: number;
    fairness: number;
  }>;
};

function emptyVoice(): VoiceCallState {
  return {
    status: 'idle',
    byRole: null,
    startedAt: null,
    invitedAt: null,
    muted: { A: false, B: false },
    speaker: { A: false, B: false },
    volume: { A: 80, B: 80 },
    textOnly: false,
  };
}

function weekKeyOf(now: number): string {
  const d = new Date(now);
  const first = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - first.getTime()) / 86400000);
  const week = Math.ceil((days + first.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${`${week}`.padStart(2, '0')}`;
}

/**
 * RoomView → Room（远程模式反向还原用）。
 *
 * 投影里有、Room 里没有对应语义的三个字段（心跳保护期、对端事件时间、场景更新时间）
 * 在这里只能给保守默认值：远程模式下的播放控制走服务端，客户端不需要这两个计时器。
 */
function roomFromView(view: RoomView): Room {
  return {
    id: view.id,
    code: view.code,
    codeVersion: view.codeVersion,
    token: view.token,
    createdAt: view.createdAt,
    expireAt: view.expireAt,
    state: view.state,
    leaderRole: view.leaderRole,
    readiness: view.readiness,
    mediaState: view.mediaState,
    danmaku: view.danmaku,
    reactions: view.reactions,
    mediaOffset: view.mediaOffset,
    movieTitle: view.movieTitle,
    sourceUrl: view.sourceUrl,
    peerJoinedAt: view.peerJoinedAt,
    joinRequestedBy: view.joinRequestedBy ?? null,
    joinRequestedAt: view.joinRequestedAt ?? null,
    countdownEndsAt: view.countdownEndsAt,
    offlineSince: view.offlineSince,
    endedAt: view.endedAt,
    recap: view.recap,
    pendingLeadRequest: view.pendingLeadRequest,
    pendingAction: view.pendingAction,
    holdUntil: 0,
    lastPeerEventAt: 0,
    scene: { ...view.scene, updatedAt: 0 },
  };
}

type WeddingPlanLike = {
  budgetCents: number;
  styles: string[];
  guests: string[];
  dates: string[];
};

/** 4.2 每日一问题库（按天轮换） */
const DAILY_QUESTIONS = [
  '今天最想被怎样关心？',
  '这周有什么事想让我知道？',
  '最近有什么小事让你开心？',
  '如果明天可以一起做一件事，你想做什么？',
  '你希望我在你累的时候怎么做？',
  '最近有什么压力是我可以分担的？',
  '哪一刻让你觉得被爱着？',
  '你最近在为什么事情开心？',
  '有什么话你一直没好意思说？',
  '如果给你一天完全空闲，你想怎么过？',
  '最近一次觉得委屈是什么时候？',
  '你希望我们多一点什么？少一点什么？',
  '我做的哪件小事让你记到现在？',
  '你最近想尝试什么新东西？',
  '什么会让你瞬间放松下来？',
  '你觉得我们最默契的一次是什么时候？',
  '最近有没有想一个人待一会儿的时候？',
  '你想让我更了解你的哪一面？',
  '这个月你最期待哪一天？',
  '你最近睡得怎么样？',
  '有什么事情你希望我别问了，直接抱一下就行？',
  '你觉得我什么时候最可爱？',
  '最近有什么让你生气但没说的事？',
  '如果我们要一起去旅行，你第一站想去哪？',
  '你更喜欢我怎样表达在意？',
  '最近有什么事让你觉得被理解？',
  '你想一起养成什么习惯？',
  '你手机里最舍不得删的一张照片是什么？',
  '你最近在为什么事情焦虑？',
  '你希望吵架之后我第一句话说什么？',
  '这周有什么想被夸的地方？',
  '你小时候最开心的一件事是什么？',
  '有什么事情你希望我们早点聊清楚？',
  '你觉得我们最近最像什么时候的样子？',
  '你想让我陪你做什么，哪怕很无聊？',
  '最近有什么让你感动的小细节？',
  '如果给我们的关系起个名字，你会叫什么？',
  '你想对我说但今天还没说的一句话是什么？',
  '你希望我怎么陪你度过低落的一天？',
  '此刻你最想吃什么？',
];

/** 动作 → 中文动词（拼通知文案用：「TA 新增了日记」） */
const ACTIVITY_VERB: Record<ActivityAction, string> = {
  add: '新增',
  update: '修改',
  delete: '删除',
  done: '完成',
};

/** 心情 → 中文（动态标题用；和 UI 的天气文案保持一致） */
const MOOD_ACTIVITY_LABEL: Record<string, string> = {
  sunny: '晴天',
  cloudy: '多云',
  rainy: '下雨',
  hug: '需要抱抱',
};

/** 卡片种类 → 中文（动态文案：「TA 新增了抱抱卡」） */
const CARD_KIND_LABEL: Record<string, string> = {
  thanks: '感谢卡',
  praise: '夸夸卡',
  apology: '道歉卡',
  calm: '冷静卡',
  makeup: '和好卡',
  hug: '抱抱卡',
};

/** 集合型清单 → 中文名（动态文案：「TA 新增了愿望清单」） */
const COLLECTION_LABEL: Record<string, string> = {
  wishlist: '愿望清单',
  restaurant: '餐厅清单',
  trip: '旅行清单',
  playlist: '歌单',
  inventory: '物品清单',
  movieList: '片单',
  people: '朋友清单',
  milestone: '里程碑',
  careEvent: '关怀日程',
  familyHoliday: '家庭节日',
  growthPlan: '成长计划',
  jointAsset: '共同资产',
  photoMemory: '照片回忆',
  wishJar: '愿望罐',
};

/** 照料动作 → 中文（动态文案：「TA 完成了小屋宠物：浇水」） */
const PET_CARE_LABEL: Record<string, string> = {
  water: '浇水',
  feed: '喂食',
  pet: '摸摸',
};

/**
 * 匿名投票的对外投影：抹掉"谁投了什么"，只留每个选项的票数。
 *
 * 以前匿名投票只是界面上不显示，投影里的 `votes` 依旧是 `{A:'o2',B:'o1'}`，
 * 对方在那台手机上可以直接看到。匿名就必须在**数据层**匿名。
 */
function anonymizeVote(
  vote: Vote,
  viewer: Role,
): Vote & { tallies: Record<string, number>; myChoice: string | null } {
  const tallies: Record<string, number> = {};
  for (const option of vote.options) tallies[option.id] = 0;
  for (const choice of Object.values(vote.votes)) {
    if (choice && tallies[choice] !== undefined) tallies[choice] += 1;
  }
  /*
   * 只保留"看这份投影的人自己"的那一票：
   * 自己知道自己投了什么不算破匿名，但对方的票绝不能下发。
   */
  const mine = vote.votes[viewer] ?? null;
  return {
    ...vote,
    votes: mine ? ({ [viewer]: mine } as Partial<Record<Role, string>>) : {},
    tallies,
    myChoice: mine,
  };
}

export class Hub {
  readonly scale: number;
  readonly latencyMs: number;
  readonly clockSkew: Record<Role, number>;
  private readonly nowFn: () => number;
  private readonly emitter = new Emitter<{ role: Role; snapshot: SpaceSnapshot }>();
  private state: SpaceState;
  private revision = 0;
  /** 各角色最近一次心跳（服务端时间） */
  private lastSeen: Record<Role, number>;
  private online: Record<Role, boolean>;
  /** 催一下的限流时间戳（只在内存里，不必持久化） */
  private lastNudgeAt: Record<Role, number> = { A: 0, B: 0 };
  /**
   * 宠物衰减的基准时间（只在内存里）。
   * 绝对不能写回 state.pet.lastWateredAt/lastFedAt：那两个字段是「上次照料时间」，
   * 每次 tick 改写它们会让快照永远在变，导致状态推送无法去重（白烧流量/反复重连）。
   */
  private petDecayBase: { water: number | null; food: number | null } = { water: null, food: null };

  constructor(opts: HubOptions = {}) {
    this.scale = opts.scale ?? 1;
    this.latencyMs = opts.latencyMs ?? 120;
    this.clockSkew = opts.clockSkew ?? { A: 0, B: 700 };
    this.nowFn = opts.now ?? (() => Date.now());
    this.revision = 0;
    const now = this.now();
    this.state = {
      spaceId: uid('space'),
      boundAt: null,
      members: {
        A: {
          role: 'A',
          name: '',
          avatar: '🌷',
          online: true,
          avatarUri: null,
          gender: null,
          birthDate: null,
          age: null,
          profileCompleted: false,
          publicId: newPublicId(),
        },
        B: {
          role: 'B',
          name: '',
          avatar: '🌿',
          online: true,
          avatarUri: null,
          gender: null,
          birthDate: null,
          age: null,
          profileCompleted: false,
          publicId: newPublicId(),
        },
      },
      bindRequest: null,
      invite: null,
      events: [],
      todos: [],
      shopping: [],
      moods: { A: null, B: null },
      period: { A: emptyPeriod('A'), B: emptyPeriod('B') },
      giftIdeas: [],
      rooms: {},
      activeRoomId: null,
      watchPlans: [],
      watchQueue: [],
      comments: {},
      games: [],
      fmSources: [],
      gameSession: null,
      voxelWorld: { edits: [], updatedAt: 0, updatedBy: 'A' },
      voxelMods: [],
      pickSession: null,
      profile: { backgroundUri: null, startedAt: null },
      quizUsed: [],
      music: {
        queue: [],
        index: 0,
        action: 'pause',
        positionSec: 0,
        updatedAtServerMs: now,
        seq: 0,
        loop: false,
        shuffle: false,
        updatedBy: 'A',
      },
      chores: [],
      ledger: [],
      collection: [],
      habits: [],
      goals: [],
      careReminders: [],
      comfort: { A: [], B: [] },
      cards: [],
      dailyQuestion: null,
      voiceNotes: [],
      diary: [],
      weeklyReviews: [],
      timeline: [],
      unbind: null,
      audit: [],
      notifications: [],
      activity: [],
      cms: { apis: [], manager: 'A', updatedAt: 0, updatedBy: 'A' },
      live: { urls: [], manager: 'A', updatedAt: 0, updatedBy: 'A' },
      decor: {
        slots: {
          wall: 'wall-cream',
          floor: 'floor-wood',
          light: 'light-warm',
          plant: null,
          shelf: null,
          window: null,
          rug: null,
          desk: null,
        },
        updatedAt: now,
        updatedBy: 'A',
      },
      pet: {
        name: '小绿',
        water: 60,
        food: 60,
        affection: 20,
        lastWateredAt: null,
        lastFedAt: null,
        lastPettedAt: null,
        careDays: 0,
        lastCareDay: null,
        decorUnlocked: 0,
      },
      themes: { current: { A: 'cream', B: 'cream' }, synced: false },
      voice: emptyVoice(),
      relProfile: {
        meetMethod: '',
        firstDate: '',
        stage: 'dating',
        milestones: [],
        submittedBy: [],
        confirmedBy: [],
        updatedAt: now,
      },
      valuesCard: { drafts: {}, scheduledAt: null, consensus: '', revealed: false },
      plans: [],
      boundaries: [],
      conflicts: [],
      selfAssess: { A: null, B: null },
      votes: [],
      ldr: { enabled: false, nextMeetDate: null, ticket: '', budgetCents: 0, checklist: [] },
      trust: {
        locationShareUntil: null,
        shareWith: [],
        arrivedReport: false,
        emergencyContact: false,
      },
      safety: [],
      intimacy: [],
      socialReports: [],
      vault: [],
      wedding: {
        budgetCents: 0,
        styles: [],
        guests: [],
        dates: [],
        sharedWithPartner: false,
        ownerRole: 'A' as const,
        updatedAt: now,
      },
      achievements: [],
      lastSeq: 0,
    };
    this.lastSeen = { A: now, B: now };
    this.online = { A: true, B: true };
  }

  // -------------------------------------------------------------------------
  // 基础设施
  // -------------------------------------------------------------------------

  now(): number {
    return this.nowFn();
  }

  /** 把真实毫秒按压缩倍数缩放（用于房间各类超时） */
  scaled(realMs: number): number {
    return Math.round(realMs / Math.max(1, this.scale));
  }

  /** 服务端时间 → 某设备的本地时钟读数 */
  toDeviceClock(role: Role, serverMs: number): number {
    return serverMs + this.clockSkew[role];
  }

  setScaleHint(_scale: number): void {
    // scale 目前为构造期不可变，避免运行中出现"时间口径混合"的 bug
  }

  subscribe(role: Role, listener: (snapshot: SpaceSnapshot) => void): () => void {
    return this.emitter.on((p) => {
      if (p.role === role) listener(p.snapshot);
    });
  }

  private notify(): void {
    this.revision += 1;
    for (const role of ['A', 'B'] as Role[]) {
      this.emitter.emit({ role, snapshot: this.snapshot(role) });
    }
  }

  private audit(actor: Role, kind: string, detail: string): void {
    const entry: AuditEntry = { id: uid('aud'), at: this.now(), actor, kind, detail };
    this.state.audit.unshift(entry);
    if (this.state.audit.length > 200) this.state.audit.pop();
  }

  private pushNotification(toRole: Role, kind: string, template: string): void {
    const text = safeMaskText(template);
    if (text === null) {
      // 模板被污染：拒绝发送并留痕，绝不降级为明文
      this.audit('A', 'notification-blocked', `模板含敏感词：${kind}`);
      return;
    }
    const record: NotificationRecord = { id: uid('ntf'), at: this.now(), toRole, kind, text };
    this.state.notifications.unshift(record);
    if (this.state.notifications.length > 60) this.state.notifications.pop();
  }

  /**
   * 记一条「TA 做了什么」，同时给对方推一条通知。
   *
   * 这是「对方有任何新增/删除都要提醒我」的唯一出口：
   * 所有会改变空间内容的方法末尾都调它一次，客户端的提示框就只认这里的数据。
   * 不自己 notify()——调用方紧接着就会 notify（避免一次操作推两遍）。
   */
  private logActivity(
    byRole: Role,
    action: ActivityAction,
    entity: string,
    entityLabel: string,
    title = '',
  ): void {
    const partner: Role = byRole === 'A' ? 'B' : 'A';
    const entry: ActivityItem = {
      id: uid('act'),
      byRole,
      action,
      entity,
      entityLabel,
      title: title.trim().slice(0, 40),
      at: this.now(),
    };
    this.state.activity.unshift(entry);
    if (this.state.activity.length > 120) this.state.activity.pop();
    const verb = ACTIVITY_VERB[action];
    const short = entry.title ? `「${entry.title}」` : '';
    this.pushNotification(partner, `activity:${entity}`, `TA ${verb}了${entityLabel}${short}`);
  }

  private requireBound(): Result<null> {
    if (this.state.boundAt === null) return fail('还没有完成双人绑定');
    if (this.state.unbind && this.state.unbind.status === 'done') return fail('双人空间已结束');
    return ok(null);
  }

  // -------------------------------------------------------------------------
  // 投影（隐私的核心）
  // -------------------------------------------------------------------------

  snapshot(role: Role): SpaceSnapshot {
    const partner: Role = role === 'A' ? 'B' : 'A';
    const today = todayISO(this.now());
    const partnerPeriod = projectPeriodForPartner(
      this.state.period[partner],
      partner,
      role,
      today,
    );

    const room = this.state.activeRoomId ? this.state.rooms[this.state.activeRoomId] : null;
    const snapshot = {
      role,
      spaceId: this.state.spaceId,
      boundAt: this.state.boundAt,
      invite: this.state.invite
        ? {
            code: this.state.invite.code,
            expireAt: this.state.invite.expireAt,
            createdBy: this.state.invite.createdBy ?? 'A',
            createdByClientId: this.state.invite.createdByClientId ?? null,
          }
        : null,
      members: this.state.members,
      partnerOnline: this.online[partner],
      bindRequest: this.state.bindRequest,
      events: this.state.events.filter(
        (e) => e.visibility === 'shared' || e.ownerRole === role,
      ),
      todos: [...this.state.todos].sort((a, b) => Number(a.done) - Number(b.done)),
      shopping: [...this.state.shopping].sort((a, b) => Number(a.done) - Number(b.done)),
      myMood: this.state.moods[role],
      partnerMood: this.state.moods[partner],
      myPeriod: this.state.period[role],
      partnerPeriod,
      giftIdeas: projectGiftIdeas(this.state.giftIdeas, role),
      activeRoom: room ? this.toRoomView(room, role) : null,
      recaps: Object.values(this.state.rooms)
        .filter((r) => r.recap !== null && (r.state === 'ENDED' || r.state === 'RECAP'))
        .map((r) => ({
          id: r.id,
          movieTitle: r.recap?.movieTitle ?? r.movieTitle,
          endedAt: r.recap?.endedAt ?? r.createdAt,
          durationSec: r.recap?.durationSec ?? 0,
          ratings: r.recap?.ratings ?? {},
          reviews: r.recap?.reviews ?? {},
          saved: r.recap?.saved ?? [],
        }))
        .sort((a, b) => b.endedAt - a.endedAt),
      unbind: this.state.unbind,
      audit: this.state.audit.filter((a) => a.actor === role || a.kind.startsWith('consent')),
      notifications: this.state.notifications.filter((n) => n.toRole === role),
      // 只把"TA 做的"给我：自己的动作自己知道，不需要提醒自己
      activity: this.state.activity.filter((a) => a.byRole !== role).slice(0, 60),
      cms: this.state.cms,
      live: this.state.live,
      revision: this.revision,
      serverNowMs: this.now(),
    };

    // 私有数据：不属于我的记录一律不出现（服务端不返回，而不是前端隐藏）
    snapshot.myPeriod = {
      ...this.state.period[role],
      records: this.state.period[role].records.filter((r) => r.ownerRole === role),
    };

    // ---- 其余模块的按角色投影（未授权字段在这里就被摘掉）----
    const collection = this.state.collection.filter(
      (i) => i.visibility === 'shared' || i.ownerRole === role,
    );
    const ledger = this.state.ledger.filter(
      (l) => l.visibility === 'shared' || l.createdBy === role,
    );
    const intimacy = this.state.intimacy.filter((c) => c.ownerRole === role || c.shared);
    const vault = this.state.vault
      .filter((v) => v.ownerRole === role || v.granted.includes(role))
      .map((v) => ({
        id: v.id,
        ownerRole: v.ownerRole,
        label: v.label,
        granted: v.granted,
        views: v.views,
        createdAt: v.createdAt,
        canOpen: v.ownerRole === role || v.granted.includes(role),
        // 只有本人那条才带明文（远程模式下本人得能打开自己的保险箱）；
        // 别人的条目连 secret 这个键都不出现，列表里永远不下发密文。
        ...(v.ownerRole === role ? { secret: v.secret } : {}),
      }));
    const safety = this.state.safety.filter(
      (s) => s.byRole === role || s.expiresAt === null || s.expiresAt > this.now(),
    );

    const extra = {
      chores: this.state.chores,
      ledger,
      collection,
      habits: this.state.habits,
      goals: this.state.goals,
      careReminders: this.state.careReminders.filter(
        (r) => r.ownerRole === role || r.visibleToPartner,
      ),
      // 「怎么照顾我」：自己的可改，TA 的只读（伴侣能看到是为了照着做，不是给改的）
      myComfort: this.state.comfort[role],
      partnerComfort: this.state.comfort[partner],
      cards: this.state.cards,
      dailyQuestion: this.state.dailyQuestion,
      voiceNotes: this.state.voiceNotes,
      diary: this.state.diary,
      weeklyReviews: this.state.weeklyReviews,
      timeline: this.state.timeline,
      watchPlans: this.state.watchPlans,
      watchQueue: this.state.watchQueue,
      comments: this.state.comments,
      games: this.state.games,
      // 焦焦FM 的收听源 + 一起听进度（以前漏了，导致两台手机看不到对方加的源）
      fmSources: this.state.fmSources ?? [],
      fmProgress: this.state.fmProgress ?? null,
      // 自定义背景（以前漏了 → 上传成功但客户端永远收不到，"背景没变"就是这个原因）
      customBackground: this.state.customBackground ?? null,
      // 对方此刻在哪个模块（首页提示"TA 在看电影/在听歌，快加入"）
      presence: this.state.presence ?? {},
      gameSession: this.state.gameSession,
      voxelWorld: this.state.voxelWorld,
      voxelMods: this.state.voxelMods,
      pickSession: this.state.pickSession,
      music: this.state.music,
      profile: this.state.profile,
      decor: this.state.decor,
      pet: this.state.pet,
      themes: this.state.themes,
      voice: this.state.voice,
      voiceChannel: this.voiceChannelName(),
      relProfile: this.state.relProfile,
      valuesCard: this.valuesProjection(role),
      plans: this.state.plans,
      boundaries: this.state.boundaries,
      conflicts: this.state.conflicts,
      mySelfAssess: this.state.selfAssess[role],
      /*
     * 匿名投票必须**真的匿名**：以前 votes 按 role 原样下发，
     * 对方手机上明明白白写着 {A:'o2',B:'o1'}，"匿名"只是一层界面遮罩。
     * 现在匿名投票只下发票数统计，谁投了什么谁也拿不到。
     */
    votes: this.state.votes.map((v) => (v.anonymous ? anonymizeVote(v, role) : v)),
      ldr: this.state.ldr,
      trust: this.state.trust,
      safety,
      intimacy,
      socialReports: this.state.socialReports,
      vault,
      wedding:
        this.state.wedding.sharedWithPartner || this.state.wedding.ownerRole === role
          ? this.state.wedding
          : null,
      achievements: this.state.achievements,
      annual: this.buildAnnualCached(),
    };

    return { ...snapshot, ...extra } as SpaceSnapshot;
  }

  /** 价值观卡：未揭示时只看得到自己的草稿 */
  private valuesProjection(role: Role) {
    const v = this.state.valuesCard;
    if (v.revealed) return v;
    const mine: Partial<Record<ValuesTopic, string>> = v.drafts[role] ?? {};
    const drafts: Partial<Record<Role, Partial<Record<ValuesTopic, string>>>> = {};
    drafts[role] = mine;
    return { drafts, scheduledAt: v.scheduledAt, consensus: '', revealed: false };
  }

  private toRoomView(room: Room, role: Role): RoomView {
    const partner: Role = role === 'A' ? 'B' : 'A';
    return {
      id: room.id,
      code: room.code,
      codeVersion: room.codeVersion,
      token: room.token,
      state: room.state,
      leaderRole: room.leaderRole,
      mediaState: room.mediaState,
      movieTitle: room.movieTitle,
      sourceUrl: room.sourceUrl,
      expireAt: room.expireAt,
      countdownEndsAt: room.countdownEndsAt,
      readiness: room.readiness,
      mediaOffset: room.mediaOffset,
      peerOnline: this.online[partner],
      peerJoinedAt: room.peerJoinedAt,
      joinRequestedBy: room.joinRequestedBy ?? null,
      joinRequestedAt: room.joinRequestedAt ?? null,
      offlineSince: room.offlineSince,
      /**
       * 弹幕按片源过滤。
       *
       * 用户实测：「我明明是在另一部剧里发的弹幕，切换电影之后那些弹幕跑到新剧里来了」。
       * 以前房间的弹幕是一个大池子，换片只改 sourceUrl，池子里的旧弹幕照样按
       * mediaPosSec 往新片上飘。现在每条弹幕记着它是在哪个片源下发的，
       * 只把当前片源的显示出来（没有 sourceUrl 的老数据在换片时会被 stamp 成旧地址）。
       */
      danmaku: room.danmaku.filter((d) => !d.sourceUrl || d.sourceUrl === room.sourceUrl),
      reactions: room.reactions,
      recap: room.recap,
      pendingLeadRequest: room.pendingLeadRequest,
      pendingAction: room.pendingAction,
      scene: room.scene,
      createdAt: room.createdAt,
      endedAt: room.endedAt,
    };
  }

  // -------------------------------------------------------------------------
  // 绑定
  // -------------------------------------------------------------------------

  /** 邀请码有效期：10 分钟（当面念一遍足够，过期就重新生成） */
  static readonly INVITE_TTL_MS = 10 * 60 * 1000;

  /**
   * 生成邀请码：**双方都能生成**。
   * 谁生成，谁就在自己手机上显示这个 6 位数；对方输入后即完成绑定。
   *
   * `clientId` 是生成者设备的唯一 ID——判断"这是不是自己的码"要靠它，
   * 不能只靠角色（两台设备可能被分到同一个角色）。
   */
  createInvite(byRole: Role, clientId?: string | null): Result<{ code: string; expireAt: number }> {
    if (this.state.boundAt !== null) return fail('你们已经绑定了，不需要再生成邀请码');
    const now = this.now();
    const expireAt = now + this.scaled(Hub.INVITE_TTL_MS);
    this.state.invite = {
      code: randomCode(),
      expireAt,
      version: (this.state.invite?.version ?? 0) + 1,
      createdBy: byRole,
      createdByClientId: clientId ?? null,
    };
    this.notify();
    return ok({ code: this.state.invite.code, expireAt });
  }

  /**
   * 延长当前邀请码的有效期（**码不变**，只续时间）。
   *
   * 为什么需要：码只有 10 分钟，对方一忙、或者念错重念就过期了；
   * 重新生成会让对方手里那个数字失效，所以给一个"续期"而不是"换码"。
   */
  extendInvite(byRole: Role, clientId?: string | null): Result<{ code: string; expireAt: number }> {
    if (this.state.boundAt !== null) return fail('你们已经绑定了，不需要邀请码');
    const invite = this.state.invite;
    if (!invite) return fail('还没有邀请码，先生成一个');
    const sameDevice = invite.createdByClientId && clientId
      ? invite.createdByClientId === clientId
      : invite.createdBy === byRole;
    if (!sameDevice) return fail('只有生成这个码的人可以续期');
    const expireAt = this.now() + this.scaled(Hub.INVITE_TTL_MS);
    this.state.invite = { ...invite, expireAt };
    this.notify();
    return ok({ code: invite.code, expireAt });
  }

  regenerateInvite(byRole: Role, clientId?: string | null): Result<{ code: string; expireAt: number }> {
    if (this.state.boundAt !== null) return fail('你们已经绑定了，不需要再生成邀请码');
    const now = this.now();
    const expireAt = now + this.scaled(Hub.INVITE_TTL_MS);
    this.state.invite = {
      code: randomCode(),
      expireAt,
      version: (this.state.invite?.version ?? 0) + 1,
      createdBy: byRole,
      createdByClientId: clientId ?? null,
    };
    this.notify();
    return ok({ code: this.state.invite.code, expireAt });
  }

  /**
   * 用对方的邀请码加入：**双方都能输入**，只要这个码不是自己生成的。
   *
   * 判"自己"优先用设备 ID（clientId）：两台设备角色相同的情况真的出现过，
   * 那时按角色判断会把对方当成自己，直接拒掉。只有都拿不到设备 ID 时才退回角色比较。
   */
  joinWithCode(byRole: Role, code: string, clientId?: string | null): Result<null> {
    if (this.state.boundAt !== null) return fail('你已在一个双人空间中，需先解绑');
    const invite = this.state.invite;
    if (!invite) return fail('还没有人生成邀请码：让 TA 在自己手机上点「生成邀请码」');
    if (this.now() > invite.expireAt) {
      return fail('邀请码已过期（10 分钟内有效），让 TA 重新生成一个');
    }
    if (invite.code !== code.trim()) return fail('这 6 位数字不对，核对一下 TA 手机上显示的码');
    // 是不是自己的码：有设备 ID 就用设备 ID，没有才退回角色
    const sameDevice =
      invite.createdByClientId && clientId
        ? invite.createdByClientId === clientId
        : invite.createdBy === byRole;
    if (sameDevice) {
      return fail('这是你自己生成的邀请码，要填 TA 手机上显示的那一个');
    }

    const now = this.now();
    this.state.boundAt = now;
    this.state.invite = null;
    this.state.bindRequest = null;
    this.state.period.A.tierHistory.push({
      at: now,
      from: 'private',
      to: 'private',
      byRole: 'A',
      shareHistory: false,
    });
    this.state.audit.unshift({
      id: uid('aud'),
      at: now,
      actor: 'B',
      kind: 'bind',
      detail: 'A 与 B 完成双人绑定',
    });
    this.notify();
    return ok(null);
  }

  // -------------------------------------------------------------------------
  // 用固定 ID 绑定：搜 ID → 发请求 → 对方确认
  // -------------------------------------------------------------------------

  /**
   * 按对方 ID 发起绑定请求。
   *
   * 相比限时邀请码：没有时效、不用抢时间念数字、对方不在线也能先把请求发过去，
   * 而且 ID 固定不变，随时可以再发一次。
   */
  requestBind(byRole: Role, targetId: string): Result<{ paired: boolean }> {
    if (this.state.boundAt !== null) return fail('你已在一个双人空间中，需先解绑');
    const partner: Role = byRole === 'A' ? 'B' : 'A';
    const wanted = normalizePublicId(targetId);
    if (!wanted) return fail('请输入对方的 ID');
    const target = this.state.members[partner];
    if (target.publicId !== wanted) {
      return fail('没找到这个 ID：核对一下对方「我们」页顶部那串 8 位 ID');
    }
    if (!target.profileCompleted) {
      return fail('对方还没有建档，让他/她先打开 App 完成建档');
    }
    // 对方之前已经向我发过请求 → 双向同意，直接绑定
    if (this.state.bindRequest?.fromRole === partner) {
      this.finishBind(partner);
      return ok({ paired: true });
    }
    this.state.bindRequest = { fromRole: byRole, at: this.now() };
    this.pushNotification(partner, 'bindRequest', '有人想和你建立双人空间');
    this.notify();
    return ok({ paired: false });
  }

  /**
   * 把某个端的固定 ID 设成外部身份（账号 ID）。
   *
   * 账号模型下"空间里那个人的 ID"就是他的账号 ID —— 用户只需要记一个 ID，
   * 而空间的隐私投影、绑定请求核对仍然按这个字符串走。
   */
  adoptPublicId(byRole: Role, publicId: string): Result<null> {
    const id = normalizePublicId(publicId);
    if (!id) return fail('ID 不能为空');
    this.state.members[byRole].publicId = id;
    this.notify();
    return ok(null);
  }

  /** 同意对方的绑定请求 */
  acceptBind(byRole: Role): Result<null> {
    const req = this.state.bindRequest;
    if (!req) return fail('没有待确认的绑定请求');
    if (req.fromRole === byRole) return fail('这是你自己发出的请求，要等对方确认');
    this.finishBind(byRole);
    return ok(null);
  }

  /** 拒绝对方的绑定请求 */
  declineBind(byRole: Role): Result<null> {
    const req = this.state.bindRequest;
    if (!req) return fail('没有待确认的绑定请求');
    if (req.fromRole === byRole) return fail('这是你自己发出的请求，要让对方处理');
    this.state.bindRequest = null;
    this.notify();
    return ok(null);
  }

  /**
   * 账号模型专用：两个账号都确认过了，直接把这个空间标记为已绑定。
   *
   * 和 requestBind/acceptBind 的区别：那两条是"空间内部的两个端互相发请求"，
   * 而账号模型里请求发生在**账号之间**（由服务端的账号表管理），
   * 空间这边只需要把结果落地。actor 只用来记审计。
   */
  bindPair(actor: Role = 'A'): Result<null> {
    if (this.state.boundAt !== null) return fail('这个空间已经绑定了');
    this.finishBind(actor);
    return ok(null);
  }

  /** 完成绑定：邀请码与 ID 请求共用同一套收尾逻辑 */
  private finishBind(actor: Role): void {    const now = this.now();
    this.state.boundAt = now;
    this.state.invite = null;
    this.state.bindRequest = null;
    this.state.period.A.tierHistory.push({
      at: now,
      from: 'private',
      to: 'private',
      byRole: 'A',
      shareHistory: false,
    });
    this.state.audit.unshift({
      id: uid('aud'),
      at: now,
      actor,
      kind: 'bind',
      detail: 'A 与 B 完成双人绑定',
    });
    this.notify();
  }

  // -------------------------------------------------------------------------
  // 日历
  // -------------------------------------------------------------------------

  addEvent(
    byRole: Role,
    input: {
      title: string;
      date: string;
      startMin: number;
      endMin: number;
      category: EventCategory;
      visibility: 'shared' | 'self';
    },
  ): Result<CalendarEvent> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!input.title.trim()) return fail('标题不能为空');
    if (input.endMin <= input.startMin) return fail('结束时间需晚于开始时间');
    const now = this.now();
    const event: CalendarEvent = {
      id: uid('evt'),
      title: input.title.trim(),
      date: input.date,
      startMin: input.startMin,
      endMin: input.endMin,
      category: input.category,
      ownerRole: byRole,
      visibility: input.visibility,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.state.events.push(event);
    this.logActivity(byRole, 'add', 'event', '安排', event.title);
    this.notify();
    return ok(event);
  }

  updateEvent(
    byRole: Role,
    id: string,
    patch: Partial<Pick<CalendarEvent, 'title' | 'startMin' | 'endMin' | 'date'>>,
  ): Result<CalendarEvent> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const event = this.state.events.find((e) => e.id === id);
    if (!event) return fail('这条安排不存在');
    if (event.ownerRole !== byRole) return fail('只能修改自己创建的安排');
    if (patch.title !== undefined) event.title = patch.title.trim() || event.title;
    if (patch.date !== undefined) event.date = patch.date;
    /*
     * 以前是先改字段再校验，校验失败直接 return —— 非法时间已经写进内存了，
     * 既不回滚也不推送，于是服务端/本机/对方三份分叉。
     * 现在先算候选值，校验通过才落盘。
     */
    const nextStart = patch.startMin !== undefined ? patch.startMin : event.startMin;
    const nextEnd = patch.endMin !== undefined ? patch.endMin : event.endMin;
    if (nextEnd <= nextStart) return fail('结束时间需晚于开始时间');
    if (patch.startMin !== undefined) event.startMin = patch.startMin;
    if (patch.endMin !== undefined) event.endMin = patch.endMin;
    event.updatedAt = this.now();
    event.version += 1;
    this.logActivity(byRole, 'update', 'event', '安排', event.title);
    this.notify();
    return ok(event);
  }

  deleteEvent(byRole: Role, id: string): Result<null> {
    const event = this.state.events.find((e) => e.id === id);
    if (!event) return fail('这条安排不存在');
    if (event.ownerRole !== byRole) return fail('只能删除自己创建的安排');
    this.state.events = this.state.events.filter((e) => e.id !== id);
    this.logActivity(byRole, 'delete', 'event', '安排', event.title);
    this.notify();
    return ok(null);
  }

  // -------------------------------------------------------------------------
  // 待办与购物
  // -------------------------------------------------------------------------

  addTodo(byRole: Role, input: { title: string; assignee: Assignee; dueDate: string | null }): Result<Todo> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!input.title.trim()) return fail('待办内容不能为空');
    const todo: Todo = {
      id: uid('todo'),
      title: input.title.trim(),
      assignee: input.assignee,
      done: false,
      dueDate: input.dueDate,
      createdBy: byRole,
      createdAt: this.now(),
      doneAt: null,
      version: 1,
    };
    this.state.todos.unshift(todo);
    this.logActivity(byRole, 'add', 'todo', '待办', todo.title);
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'todo', MASK.todoAdded);
    this.notify();
    return ok(todo);
  }

  toggleTodo(byRole: Role, id: string): Result<Todo> {
    const todo = this.state.todos.find((t) => t.id === id);
    if (!todo) return fail('这条待办不存在');
    todo.done = !todo.done;
    todo.doneAt = todo.done ? this.now() : null;
    todo.version += 1;
    this.audit(byRole, 'todo-toggle', `${todo.title} → ${todo.done ? '完成' : '未完成'}`);
    if (todo.done) this.logActivity(byRole, 'done', 'todo', '待办', todo.title);
    this.notify();
    return ok(todo);
  }

  setTodoAssignee(byRole: Role, id: string, assignee: Assignee): Result<Todo> {
    const todo = this.state.todos.find((t) => t.id === id);
    if (!todo) return fail('这条待办不存在');
    todo.assignee = assignee;
    todo.version += 1;
    this.notify();
    return ok(todo);
  }

  deleteTodo(byRole: Role, id: string): Result<null> {
    const todo = this.state.todos.find((t) => t.id === id);
    if (!todo) return fail('这条待办不存在');
    this.state.todos = this.state.todos.filter((t) => t.id !== id);
    this.logActivity(byRole, 'delete', 'todo', '待办', todo.title);
    this.notify();
    return ok(null);
  }

  addShopping(
    byRole: Role,
    input: { title: string; qty: string; category: ShoppingItem['category'] },
  ): Result<ShoppingItem> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!input.title.trim()) return fail('商品名不能为空');
    const item: ShoppingItem = {
      id: uid('shop'),
      title: input.title.trim(),
      qty: input.qty.trim(),
      category: input.category,
      done: false,
      createdBy: byRole,
      createdAt: this.now(),
      doneAt: null,
    };
    this.state.shopping.unshift(item);
    this.logActivity(byRole, 'add', 'shopping', '购物清单', item.title);
    this.notify();
    return ok(item);
  }

  toggleShopping(byRole: Role, id: string): Result<ShoppingItem> {
    const item = this.state.shopping.find((s) => s.id === id);
    if (!item) return fail('这件商品不存在');
    item.done = !item.done;
    item.doneAt = item.done ? this.now() : null;
    if (item.done) this.logActivity(byRole, 'done', 'shopping', '购物清单', item.title);
    this.notify();
    return ok(item);
  }

  clearDoneShopping(): Result<number> {
    const before = this.state.shopping.length;
    this.state.shopping = this.state.shopping.filter((s) => !s.done);
    const removed = before - this.state.shopping.length;
    this.notify();
    return ok(removed);
  }

  // -------------------------------------------------------------------------
  // 心情天气
  // -------------------------------------------------------------------------

  setMood(byRole: Role, weather: Weather, note: string): Result<MoodEntry> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const entry: MoodEntry = { weather, note: note.trim().slice(0, 30), at: this.now() };
    this.state.moods[byRole] = entry;
    this.logActivity(byRole, 'update', 'mood', '心情', MOOD_ACTIVITY_LABEL[weather] ?? '');
    if (weather === 'hug') {
      this.pushNotification(byRole === 'A' ? 'B' : 'A', 'mood', MASK.moodSet);
    }
    this.notify();
    return ok(entry);
  }

  /**
   * 回应对方「需要抱抱」。
   *
   * 以前点了「抱抱」只是发一张抱抱卡，对方的"需要抱抱"状态还在原地，
   * 于是卡片永远显示"需要抱抱"+"抱抱/说一句"按钮，点多少次都像没反应。
   * 现在：发卡 + **把那个抱抱请求收下**（清掉对方的 hug 状态并留一条记录），
   * 对方那边会看到"被抱到了"，按钮也不再重复出现。
   */
  hugBack(byRole: Role, words = ''): Result<{ card: Card | null }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const partner: Role = byRole === 'A' ? 'B' : 'A';
    const partnerMood = this.state.moods[partner];
    if (!partnerMood || partnerMood.weather !== 'hug') {
      return fail('TA 现在没有在等抱抱');
    }
    const card = this.sendCard(byRole, 'hug', words.trim() || '抱一下', '收到你的「需要抱抱」');
    if (!card.ok) return fail(card.error);
    // 收下请求：清掉对方的 hug 状态，双方都不再看到"需要抱抱"
    this.state.moods[partner] = null;
    this.state.audit.unshift({
      id: uid('aud'),
      at: this.now(),
      actor: byRole,
      kind: 'card',
      detail: `收到 ${partner} 的抱抱请求并回应了`,
    });
    this.pushNotification(partner, 'card', 'TA 抱了你一下');
    this.notify();
    return ok({ card: card.value });
  }

  // -------------------------------------------------------------------------
  // 经期与授权
  // -------------------------------------------------------------------------

  addPeriodRecord(
    byRole: Role,
    input: {
      startDate: string;
      endDate: string | null;
      flow: FlowLevel | null;
      symptoms: string[];
      moods: string[];
      note: string;
    },
  ): Result<PeriodRecord> {
    const record: PeriodRecord = {
      id: uid('per'),
      ownerRole: byRole,
      startDate: input.startDate,
      endDate: input.endDate,
      flow: input.flow,
      symptoms: input.symptoms,
      moods: input.moods,
      note: input.note.trim().slice(0, 200),
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.state.period[byRole].records.push(record);
    this.audit(byRole, 'period-write', '写入一条记录');
    this.notify();
    return ok(record);
  }

  updatePeriodRecord(
    byRole: Role,
    id: string,
    patch: Partial<Pick<PeriodRecord, 'startDate' | 'endDate' | 'flow' | 'symptoms' | 'moods' | 'note'>>,
  ): Result<PeriodRecord> {
    const record = this.state.period[byRole].records.find((r) => r.id === id);
    if (!record) return fail('这条记录不存在');
    if (record.ownerRole !== byRole) return fail('只能修改自己的记录');
    Object.assign(record, patch);
    record.updatedAt = this.now();
    this.audit(byRole, 'period-write', '修改一条记录');
    this.notify();
    return ok(record);
  }

  deletePeriodRecord(byRole: Role, id: string): Result<null> {
    const record = this.state.period[byRole].records.find((r) => r.id === id);
    if (!record) return fail('这条记录不存在');
    if (record.ownerRole !== byRole) return fail('只能删除自己的记录');
    this.state.period[byRole].records = this.state.period[byRole].records.filter(
      (r) => r.id !== id,
    );
    this.audit(byRole, 'period-write', '删除一条记录');
    this.notify();
    return ok(null);
  }

  setPeriodTier(byRole: Role, tier: PeriodTier, shareHistory: boolean): Result<null> {
    const data = this.state.period[byRole];
    const from = data.tier;
    /*
     * 降级方向也要处理：以前只有 shareHistory === true 时才写 shareHistoryFrom = 0，
     * 关掉"包含历史记录"时从不把它清回 null —— 界面上写着「仅此后新记录」，
     * 对方却仍然能看到全部历史经期明细。
     */
    const wasSharingHistory = data.shareHistoryFrom !== null;
    if (from === tier && shareHistory === wasSharingHistory) return ok(null);
    data.tier = tier;
    data.tierHistory.push({
      at: this.now(),
      from,
      to: tier,
      byRole,
      shareHistory,
    });
    data.shareHistoryFrom = shareHistory ? 0 : null;
    this.audit(byRole, 'consent', `经期可见范围：${from} → ${tier}${shareHistory ? '（含历史）' : ''}`);
    // 伴侣收到中性通知，无原因、无内容
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'consent', MASK.authChanged);
    this.notify();
    return ok(null);
  }

  revokeAllConsent(byRole: Role): Result<null> {
    const data = this.state.period[byRole];
    const revokeFrom = data.tier;
    data.tier = 'private';
    data.shareHistoryFrom = null;
    data.tierHistory.push({
      at: this.now(),
      from: revokeFrom,
      to: 'private',
      byRole,
      shareHistory: false,
    });
    this.audit(byRole, 'consent', '一键撤回全部授权');
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'consent', MASK.authChanged);
    this.notify();
    return ok(null);
  }

  togglePeriodPrediction(byRole: Role): Result<boolean> {
    const data = this.state.period[byRole];
    data.predictionEnabled = !data.predictionEnabled;
    this.notify();
    return ok(data.predictionEnabled);
  }

  addPlanEntry(byRole: Role, kind: 'prepare' | 'contraception', date: string, note: string): Result<null> {
    this.state.period[byRole].planLog.push({ id: uid('plan'), kind, date, note });
    this.audit(byRole, 'period-plan', '写入计划记录');
    this.notify();
    return ok(null);
  }

  // -------------------------------------------------------------------------
  // 礼物灵感（反向隐私：默认对伴侣不可见）
  // -------------------------------------------------------------------------

  addGiftIdea(byRole: Role, text: string, occasion: string): Result<GiftIdea> {
    if (!text.trim()) return fail('记一句话就好');
    const idea: GiftIdea = {
      id: uid('gift'),
      ownerRole: byRole,
      text: text.trim().slice(0, 120),
      occasion: occasion.trim(),
      createdAt: this.now(),
      revealed: false,
    };
    this.state.giftIdeas.unshift(idea);
    this.notify();
    return ok(idea);
  }

  revealGiftIdea(byRole: Role, id: string): Result<GiftIdea> {
    const idea = this.state.giftIdeas.find((g) => g.id === id);
    if (!idea) return fail('这条灵感不存在');
    if (idea.ownerRole !== byRole) return fail('只能揭示自己的记录');
    idea.revealed = true;
    this.audit(byRole, 'gift-reveal', '揭示一条礼物灵感');
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'gift', MASK.giftRevealed);
    this.notify();
    return ok(idea);
  }

  // -------------------------------------------------------------------------
  // 电影院
  // -------------------------------------------------------------------------

  private activeRoom(): Room | null {
    return this.state.activeRoomId ? this.state.rooms[this.state.activeRoomId] : null;
  }

  private applyRoomEvent(room: Room, event: RoomEvent): Result<Room> {
    const next = transition(room.state, event);
    if (next === null) return fail(`房间状态不允许该操作（${room.state} / ${event}）`);
    room.state = next;
    return ok(room);
  }

  createRoom(byRole: Role, movieTitle: string, sourceUrl: string | null = null): Result<RoomView> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    /*
     * 关键修复（用户："我刚刚才开房间，怎么立马就过期了"）：
     * 上一局的房间如果是 EXPIRED / DISSOLVED，以前这里会判成"已有一个进行中的房间"
     * 而拒绝新建 —— 界面于是继续显示那张**旧的过期房间**，看起来就像新开的房间立刻过期。
     * 现在先把这种已作废的房间清掉，再建一个全新的（新邀请码 + 全新的 30 分钟）。
     */
    const existing = this.activeRoom();
    if (existing && (existing.state === 'EXPIRED' || existing.state === 'DISSOLVED')) {
      this.state.activeRoomId = null;
    } else if (existing && existing.state !== 'ENDED' && existing.state !== 'RECAP') {
      return fail('已有一个进行中的房间');
    }
    const now = this.now();
    const room: Room = {
      id: uid('room'),
      code: randomCode(),
      codeVersion: 1,
      token: randomToken(),
      createdAt: now,
      expireAt: now + this.scaled(30 * 60 * 1000),
      state: 'CREATED',
      leaderRole: byRole,
      readiness: { A: false, B: false },
      mediaState: {
        action: 'pause',
        positionSec: 0,
        rate: 1,
        seq: 0,
        updatedAtServerMs: now,
        leaderRole: byRole,
      },
      danmaku: [],
      reactions: [],
      mediaOffset: { A: 0, B: 0 },
      movieTitle: movieTitle.trim().slice(0, 40) || '一起看电影',
      sourceUrl,
      peerJoinedAt: null,
      joinRequestedBy: null,
      joinRequestedAt: null,
      countdownEndsAt: null,
      offlineSince: null,
      endedAt: null,
      recap: null,
      pendingLeadRequest: null,
      pendingAction: null,
      holdUntil: 0,
      lastPeerEventAt: now,
      scene: { popcorn: true, cat: false, blanket: false, updatedBy: byRole, updatedAt: now },
    };
    this.state.rooms[room.id] = room;
    this.state.activeRoomId = room.id;
    this.applyRoomEvent(room, 'INVITE_SHARED');
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  regenerateRoomCode(byRole: Role): Result<{ code: string; expireAt: number }> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.state !== 'CREATED' && room.state !== 'WAITING_PEER' && room.state !== 'EXPIRED') {
      return fail('房间已经开始，不能再重新生成邀请');
    }
    if (room.state === 'EXPIRED') {
      room.state = 'WAITING_PEER';
    }
    const now = this.now();
    room.code = randomCode();
    room.codeVersion += 1;
    room.token = randomToken();
    room.expireAt = now + this.scaled(30 * 60 * 1000);
    this.notify();
    return ok({ code: room.code, expireAt: room.expireAt });
  }

  extendRoomCode(byRole: Role): Result<{ expireAt: number }> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    room.expireAt += this.scaled(30 * 60 * 1000);
    this.notify();
    return ok({ expireAt: room.expireAt });
  }

  joinRoomByCode(byRole: Role, code: string): Result<RoomView> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (byRole !== 'B') return fail('房间由被邀请的一方加入：把观影房间的 6 位房号填进来');
    const room = this.activeRoom();
    if (!room) return fail('邀请码无效或已过期');
    if (room.state === 'EXPIRED' || room.state === 'DISSOLVED') return fail('邀请码无效或已过期');
    if (this.now() > room.expireAt && (room.state === 'CREATED' || room.state === 'WAITING_PEER')) {
      room.state = 'EXPIRED';
      this.notify();
      return fail('邀请码无效或已过期');
    }
    if (room.peerJoinedAt !== null) return fail('房间已满');
    if (room.code !== code.trim()) return fail('邀请码无效或已过期');
    room.peerJoinedAt = this.now();
    const applied = this.applyRoomEvent(room, 'PEER_JOINED');
    if (!applied.ok) return fail(applied.error);
    this.pushNotification(room.leaderRole, 'room', MASK.roomInvite);
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  setReady(byRole: Role): Result<RoomView | null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.peerJoinedAt === null) return fail('TA 还没进来');
    if (room.state !== 'PREPARING' && room.state !== 'COUNTDOWN') return fail('现在不是片源准备阶段');
    room.readiness[byRole] = true;
    if (room.readiness.A && room.readiness.B && room.state === 'PREPARING') {
      const now = this.now();
      room.countdownEndsAt = now + this.scaled(3000);
      this.applyRoomEvent(room, 'BOTH_READY');
    }
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  // =========================================================================
  // 一起看：不用邀请码的加入流程（已绑定的情侣直接申请，房主同意即进）
  // =========================================================================

  /**
   * 申请加入对方开的影厅。
   *
   * 为什么不再要邀请码：两个人已经绑定了，谁开的房间本来就在同一份空间状态里，
   * 让用户手抄 6 位数字纯属折腾。现在点一下就申请，房主同意才进房
   * —— 既省事，又保留了"必须对方允许"这个边界。
   */
  requestJoinRoom(byRole: Role): Result<RoomView> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const room = this.activeRoom();
    if (!room) return fail('对方还没有开房间');
    if (room.leaderRole === byRole) return fail('这是你自己开的房间');
    if (room.peerJoinedAt !== null) return fail('你已经在房间里了');
    if (isTerminal(room.state)) return fail('这个房间已经结束了');
    if (
      room.state !== 'CREATED' &&
      room.state !== 'WAITING_PEER' &&
      room.state !== 'PEER_REQUESTED'
    ) {
      return fail(`现在不能申请加入（${room.state}）`);
    }
    const applied = this.applyRoomEvent(room, 'PEER_REQUESTED');
    if (!applied.ok) return fail(applied.error);
    room.joinRequestedAt = this.now();
    room.joinRequestedBy = byRole;
    this.pushNotification(room.leaderRole, 'room', MASK.roomInvite);
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  /** 房主同意对方进来 */
  approveJoinRoom(byRole: Role): Result<RoomView> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return fail('只有开房间的人能同意');
    if (room.state !== 'PEER_REQUESTED') return fail('现在没有人在申请加入');
    room.peerJoinedAt = this.now();
    const applied = this.applyRoomEvent(room, 'PEER_APPROVED');
    if (!applied.ok) return fail(applied.error);
    room.joinRequestedAt = null;
    room.joinRequestedBy = null;
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  /** 房主拒绝 / 申请人撤回 */
  declineJoinRoom(byRole: Role): Result<RoomView> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.state !== 'PEER_REQUESTED') return fail('现在没有待处理的申请');
    if (byRole === room.leaderRole) {
      const applied = this.applyRoomEvent(room, 'PEER_DECLINED');
      if (!applied.ok) return fail(applied.error);
    } else {
      // 申请人自己撤回：回到"等对方加入"
      room.state = 'WAITING_PEER';
    }
    room.joinRequestedAt = null;
    room.joinRequestedBy = null;
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  // =========================================================================
  // 一起听：同步音乐（队列 + 播放状态都以服务端为准）
  // =========================================================================

  private isAudioUrl(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) return false;
    return /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i.test(url);
  }

  addMusicTrack(byRole: Role, input: { title: string; artist: string; url: string; cover?: string | null }): Result<MusicTrack> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!input.title.trim()) return fail('歌名不能为空');
    if (!this.isAudioUrl(input.url.trim())) {
      return fail('请填 .mp3 / .m4a / .aac / .wav / .ogg 的 http(s) 直链');
    }
    const track: MusicTrack = {
      id: uid('track'),
      title: input.title.trim().slice(0, 60),
      artist: (input.artist ?? '').trim().slice(0, 40),
      url: input.url.trim(),
      cover: input.cover ?? null,
      addedBy: byRole,
      createdAt: this.now(),
    };
    this.state.music.queue.push(track);
    if (this.state.music.queue.length === 1) this.state.music.index = 0;
    this.logActivity(byRole, 'add', 'music', '一起听歌曲', track.title);
    this.notify();
    return ok(track);
  }

  removeMusicTrack(byRole: Role, id: string): Result<null> {
    const m = this.state.music;
    const idx = m.queue.findIndex((t) => t.id === id);
    if (idx < 0) return fail('这首歌不在队列里');
    const removed = m.queue[idx];
    m.queue.splice(idx, 1);
    if (m.index >= m.queue.length) m.index = Math.max(0, m.queue.length - 1);
    m.seq += 1;
    m.updatedAtServerMs = this.now();
    m.updatedBy = byRole;
    this.logActivity(byRole, 'delete', 'music', '一起听歌曲', removed.title);
    this.notify();
    return ok(null);
  }

  /**
   * 音乐信令：play / pause / seek / change_track / setting(loop,shuffle)
   * 任何一方都能操作，服务端以最后一条为准并打上 seq 与时间戳。
   */
  musicAction(
    byRole: Role,
    action: 'play' | 'pause' | 'seek' | 'change_track' | 'setting',
    payload: { positionSec?: number; index?: number; loop?: boolean; shuffle?: boolean } = {},
  ): Result<MusicState> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const m = this.state.music;
    if (m.queue.length === 0) return fail('队列里还没有歌');

    if (action === 'change_track') {
      const next = Math.max(0, Math.min(m.queue.length - 1, Math.round(payload.index ?? m.index)));
      m.index = next;
      m.positionSec = 0;
      m.action = 'play';
    } else if (action === 'seek') {
      m.positionSec = Math.max(0, payload.positionSec ?? 0);
    } else if (action === 'play' || action === 'pause') {
      m.action = action;
      if (typeof payload.positionSec === 'number') {
        m.positionSec = Math.max(0, payload.positionSec);
      }
    } else if (action === 'setting') {
      if (typeof payload.loop === 'boolean') m.loop = payload.loop;
      if (typeof payload.shuffle === 'boolean') m.shuffle = payload.shuffle;
    }

    m.updatedAtServerMs = this.now();
    m.seq += 1;
    m.updatedBy = byRole;
    this.notify();
    return ok(m);
  }

  /** 下一首（考虑随机与循环），供客户端与"播完自动下一首"复用 */
  nextMusicIndex(from: number, direction: 1 | -1): number {
    const m = this.state.music;
    const len = m.queue.length;
    if (len === 0) return 0;
    if (m.shuffle && len > 1) {
      let next = from;
      let guard = 0;
      while (next === from && guard < 20) {
        next = Math.floor(Math.random() * len);
        guard += 1;
      }
      return next;
    }
    const raw = from + direction;
    if (m.loop) return ((raw % len) + len) % len;
    return Math.max(0, Math.min(len - 1, raw));
  }

  /** 片库「一起看」：把在线直链写进房间，双方用同一个 URL 播放并由 mediaState 同步 */
  // ---- 一起看队列：从片库挑的片子，点一下就能播 ----

  /** 加入队列（同一部片同一集只留一条，避免重复） */
  addWatchQueue(
    byRole: Role,
    input: { title: string; url: string; episodeIndex?: number; episodeName?: string; api?: string | null; vodId?: string | null },
  ): Result<WatchQueueItem> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const url = String(input.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) return fail('播放地址必须以 http/https 开头');
    const title = String(input.title ?? '').trim().slice(0, 60) || '一起看电影';
    const episodeIndex = Math.max(0, Math.round(input.episodeIndex ?? 0));
    const episodeName = String(input.episodeName ?? '').trim().slice(0, 30);
    const vodId = input.vodId ?? null;
    const dup = this.state.watchQueue.find(
      (q) => q.url === url || (!!vodId && q.vodId === vodId && q.episodeIndex === episodeIndex),
    );
    if (dup) return ok(dup);
    const item: WatchQueueItem = {
      id: uid('wq'),
      title,
      episodeIndex,
      episodeName,
      url,
      api: input.api ?? null,
      vodId: input.vodId ?? null,
      addedBy: byRole,
      createdAt: this.now(),
    };
    this.state.watchQueue.push(item);
    this.logActivity(byRole, 'add', 'watchQueue', '一起看队列', episodeName ? `${title} ${episodeName}` : title);
    this.notify();
    return ok(item);
  }

  /**
   * 批量加入队列：电视剧「整部加入」一次走一条 RPC。
   *
   * 为什么需要它：一集一条 RPC 的话，30 集会发 30 条消息、每条都触发一次全量状态推送，
   * 手机上和服务器上都白白忙一遍；而且重复点击会重复发 30 条，界面上就会连刷 30 条
   * 「已加入队列」，看起来像加了 60 集。
   * 这里一次算完，并把「已经在队列里」的条数如实报回去。
   */
  addWatchQueueBatch(
    byRole: Role,
    items: {
      title: string;
      url: string;
      episodeIndex?: number;
      episodeName?: string;
      api?: string | null;
      vodId?: string | null;
    }[],
  ): Result<{ added: number; dup: number; invalid: number; capped: number }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const list = Array.isArray(items) ? items : [];
    let added = 0;
    let dup = 0;
    let invalid = 0;
    let capped = 0;
    for (const input of list) {
      const url = String(input?.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) {
        invalid += 1;
        continue;
      }
      const episodeIndex = Math.max(0, Math.round(input.episodeIndex ?? 0));
      const vodId = input.vodId ?? null;
      const exists = this.state.watchQueue.find(
        (q) => q.url === url || (!!vodId && q.vodId === vodId && q.episodeIndex === episodeIndex),
      );
      if (exists) {
        dup += 1;
        continue;
      }
      this.state.watchQueue.push({
        id: uid('wq'),
        title: String(input.title ?? '').trim().slice(0, 60) || '一起看电影',
        episodeIndex,
        episodeName: String(input.episodeName ?? '').trim().slice(0, 30),
        url,
        api: input.api ?? null,
        vodId,
        addedBy: byRole,
        createdAt: this.now(),
      });
      added += 1;
    }
    if (added > 0) {
      this.logActivity(byRole, 'add', 'watchQueue', '一起看队列', `新增 ${added} 集`);
      this.notify();
    }
    return ok({ added, dup, invalid, capped });
  }

  // ---- 游戏库与双人联机 ----

  /** 粘贴一段代码进游戏库（同一份代码重复粘贴会复用旧的，不产生副本） */
  addGame(
    byRole: Role,
    input: {
      title: string;
      code: string;
      players?: 1 | 2;
      kind?: 'html' | 'link' | 'source' | 'native';
    },
  ): Result<GameSpec> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const code = String(input.code ?? '');
    if (code.trim().length < 8) return fail('内容太短了，看起来不是完整的游戏');
    // 上限只是防呆：真要更大就走 /api/upload 上传成文件（那条路能到 60MB）
    if (code.length > 8_000_000) return fail('代码超过 8MB，请改用「上传成文件」方式');
    const title = String(input.title ?? '').trim().slice(0, 40) || '未命名小游戏';
    const dup = this.state.games.find((g) => g.code === code);
    if (dup) return ok(dup);
    const spec: GameSpec = {
      id: uid('game'),
      title,
      code,
      players: input.players === 1 ? 1 : 2,
      kind: input.kind ?? 'html',
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.games.unshift(spec);
    if (this.state.games.length > 60) this.state.games.length = 60;
    this.logActivity(byRole, 'add', 'game', '游戏库', title);
    this.notify();
    return ok(spec);
  }

  /**
   * 登记一个"大体积游戏"：只存服务器路径，不存代码。
   *
   * 以前的 400KB 上限是因为代码要进空间状态、两台手机同步；
   * 现在先上传成文件（服务端 /game/xxx），状态里只留一个地址 → 再大都能支持。
   */
  addGameAsset(
    byRole: Role,
    input: {
      title: string;
      assetPath: string;
      players?: 1 | 2;
      kind?: 'html' | 'link' | 'source' | 'native';
      /** APK 的原生包名：有了它，点卡片才能直接打开那个游戏 */
      packageName?: string | null;
    },
  ): Result<GameSpec> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const assetPath = String(input.assetPath ?? '').trim();
    if (!assetPath.startsWith('/game/')) return fail('游戏文件路径不对（应以 /game/ 开头）');
    const title = String(input.title ?? '').trim().slice(0, 40) || '未命名小游戏';
    const pkg = typeof input.packageName === 'string' && input.packageName ? input.packageName : null;
    const dup = this.state.games.find((g) => g.assetPath === assetPath);
    if (dup) {
      // 包名可能是后补的（先上传、后解析）：顺手补上，别让用户再传一次
      if (pkg && dup.packageName !== pkg) {
        dup.packageName = pkg;
        this.notify();
      }
      return ok(dup);
    }
    const spec: GameSpec = {
      id: uid('game'),
      title,
      code: '',
      assetPath,
      players: input.players === 1 ? 1 : 2,
      kind: input.kind ?? 'html',
      createdBy: byRole,
      createdAt: this.now(),
    };
    if (pkg) spec.packageName = pkg;
    this.state.games.unshift(spec);
    if (this.state.games.length > 60) this.state.games.length = 60;
    this.logActivity(byRole, 'add', 'game', '游戏库', title);
    this.notify();
    return ok(spec);
  }

  // ---- 焦焦FM（听书）：独立模块，和影院 / 电视直播 / 游戏库零交叉 ----

  /** 加一个收听源（音频直链 / 播客 RSS / 列表 JSON） */
  addFmSource(
    byRole: Role,
    input: { name: string; url: string; kind?: 'audio' | 'rss' | 'json' },
  ): Result<{ id: string }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const url = String(input.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) return fail('源地址要以 http:// 或 https:// 开头');
    const list = this.state.fmSources ?? (this.state.fmSources = []);
    const dup = list.find((x) => x.url === url);
    if (dup) return fail('这个源已经加过了');
    const kind = input.kind === 'audio' || input.kind === 'json' || input.kind === 'rss' ? input.kind : 'rss';
    const item = {
      id: uid('jfm'),
      name: String(input.name ?? '').trim().slice(0, 30) || url.replace(/^https?:\/\//, '').slice(0, 24),
      url,
      kind,
      createdAt: this.now(),
      enabled: true,
    };
    list.unshift(item);
    if (list.length > 40) list.length = 40;
    this.logActivity(byRole, 'add', 'game', '焦焦FM', item.name);
    this.notify();
    return ok({ id: item.id });
  }

  /** 删一个收听源 */
  // ---- 自定义背景（两人共用的满屏背景，图或视频） ----

  /** 设置自定义背景：url 是 /background/xxx 或 /game/xxx，type 决定播放方式 */
  setCustomBackground(
    byRole: Role,
    input: { url: string; type?: 'image' | 'video'; accent?: string; poster?: string },
  ): Result<{ url: string; type: 'image' | 'video' }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const url = String(input.url ?? '').trim();
    if (!url.startsWith('/background/') && !url.startsWith('/game/') && !/^https?:\/\//.test(url)) {
      return fail('背景地址不对');
    }
    const type = input.type === 'image' ? 'image' : 'video';
    const accent = typeof input.accent === 'string' && /^#[0-9A-Fa-f]{6}$/.test(input.accent)
      ? input.accent.toUpperCase()
      : null;
    // 视频首帧截图：视频还没解码出来前先铺这张，页面不会先空一块（beige/白屏）
    const poster =
      typeof input.poster === 'string' && input.poster.startsWith('/background/')
        ? input.poster
        : null;
    this.state.customBackground = {
      url,
      type,
      accent,
      ...(poster ? { poster } : {}),
      updatedAt: this.now(),
      byRole,
    };
    this.notify();
    return ok({ url, type });
  }

  /** 清掉自定义背景，回到内置壁纸 */
  clearCustomBackground(byRole: Role): Result<null> {
    if (!this.state.customBackground) return fail('当前没有自定义背景');
    this.state.customBackground = null;
    this.logActivity(byRole, 'delete', 'game', '自定义背景');
    this.notify();
    return ok(null);
  }

  /**
   * 上报"我现在在哪个模块"（心跳）。
   *
   * 首页要能显示：TA 在线 / 在看电影 / 在听歌·快加入一起听 / 在听书 / 在看电视。
   * 只记一个粗粒度 surface + 可选 detail（比如片名、歌名），不记录任何内容细节，
   * 隐私上等价于"对方看到你在用哪个模块"，跟在线状态一个量级。
   */
  setPresence(
    byRole: Role,
    input: { surface?: string; detail?: string | null },
  ): Result<null> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const surface = String(input?.surface ?? 'app').trim().slice(0, 24) || 'app';
    const rawDetail = typeof input?.detail === 'string' ? input.detail.trim() : '';
    const detail = rawDetail ? rawDetail.slice(0, 40) : null;
    this.state.presence = {
      ...(this.state.presence ?? {}),
      [byRole]: { surface, detail, at: this.now() },
    };
    this.notify();
    return ok(null);
  }

  removeFmSource(byRole: Role, id: string): Result<null> {
    const list = this.state.fmSources ?? [];
    const before = list.length;
    this.state.fmSources = list.filter((x) => x.id !== id);
    if (this.state.fmSources.length === before) return fail('没有这个收听源');
    this.logActivity(byRole, 'delete', 'game', '焦焦FM');
    this.notify();
    return ok(null);
  }

  /**
   * 一起听的进度（存服务端，两台手机都能拿到）。
   * 和影院的 playState 是两张不同的表 —— 听书归听书，看电影归看电影。
   */
  pushFmProgress(byRole: Role, input: Omit<import('./jiaojiaoFm').FmProgress, 'role' | 'updatedAt'>): Result<import('./jiaojiaoFm').FmProgress> {
    const next: import('./jiaojiaoFm').FmProgress = {
      itemKey: String(input.itemKey ?? '').slice(0, 80),
      positionSec: Math.max(0, Number(input.positionSec) || 0),
      rate: Math.max(0.5, Math.min(3, Number(input.rate) || 1)),
      playing: Boolean(input.playing),
      role: byRole,
      updatedAt: this.now(),
    };
    if (!next.itemKey) return fail('缺少正在听的条目');
    this.state.fmProgress = next;
    this.notify();
    return ok(next);
  }

  removeGame(byRole: Role, id: string): Result<null> {
    const before = this.state.games.length;
    this.state.games = this.state.games.filter((g) => g.id !== id);
    if (this.state.games.length === before) return fail('游戏库里没有这个游戏');
    if (this.state.gameSession?.gameId === id) this.state.gameSession = null;
    this.logActivity(byRole, 'delete', 'game', '游戏库');
    this.notify();
    return ok(null);
  }

  /**
   * 开一局**内置样例**（井字棋 / 像素沙盒 / 我们的小窝）。
   *
   * 这些样例是打包在 App 里的，从来没有写进 state.games，于是 startGame 会
   * 报「游戏库里没有这个游戏」—— 用户照样进了游戏页，但服务端没有这一局：
   * 双方局面**根本收不到对方**，看起来就是"两个人各玩各的"。
   */
  startSampleGame(byRole: Role, spec: { id: string; title: string }): Result<GameSession> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const id = String(spec?.id ?? '').trim();
    if (!id) return fail('这个游戏没有 id');
    const cur = this.state.gameSession;
    if (cur && cur.gameId === id) {
      this.notify();
      return ok(cur);
    }
    this.state.gameSession = {
      gameId: id,
      title: String(spec?.title ?? '一起玩').slice(0, 40),
      state: '',
      turn: 0,
      updatedAt: this.now(),
      updatedBy: byRole,
      seq: 0,
      net: '',
      netSeq: 0,
      netFrom: null,
    };
    this.notify();
    return ok(this.state.gameSession);
  }

  /** 开一局：把局面清空，轮到发起人 */
  startGame(byRole: Role, gameId: string): Result<GameSession> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const spec = this.state.games.find((g) => g.id === gameId);
    if (!spec) return fail('游戏库里没有这个游戏');
    /*
     * 同一个游戏再次打开 = 继续这一局，不能把存档清掉。
     * （以前这里每次都重置成 state:'' —— 于是"退出去再进来"世界就回默认值，
     *   金币回到初始 520、田地动物全没了。存档在 pushGameState 里递增 seq。）
     */
    const cur = this.state.gameSession;
    if (cur && cur.gameId === spec.id) {
      this.notify();
      return ok(cur);
    }
    this.state.gameSession = {
      gameId: spec.id,
      title: spec.title,
      state: '',
      turn: 0,
      updatedAt: this.now(),
      updatedBy: byRole,
      seq: 0,
      net: '',
      netSeq: 0,
      netFrom: null,
    };
    this.notify();
    return ok(this.state.gameSession);
  }

  /**
   * 提交局面。
   *
   * 逻辑放在各自的 WebView 里跑（同一份代码、同一个初始局面），
   * 谁操作就有谁把"新局面的 JSON 字符串"交上来，服务端只做存储和广播——
   * 不在服务端 eval 陌生代码，安全边界清楚。
   */
  /**
   * 联机层数据包（第三方 HTML 游戏用）。
   *
   * 传输链路：WebView → `TW_NET:` → App → hub（这里）→ 投影 → 对方 WebView →
   * `window.TwNet.applyRemote(packet)`。只保留最新一个包（输入镜像本来就是实时的，
   * 攒历史没意义，还会把快照撑大）。
   */
  pushGameNet(byRole: Role, packet: string): Result<GameSession> {
    const session = this.state.gameSession;
    if (!session) return fail('没有进行中的游戏');
    const text = String(packet ?? '');
    if (!text) return fail('联机包是空的');
    if (text.length > 64_000) return fail('联机包太大了（上限 64KB）');
    session.net = text;
    session.netSeq = (session.netSeq ?? 0) + 1;
    session.netFrom = byRole;
    session.updatedAt = this.now();
    this.notify();
    return ok(session);
  }

  pushGameState(byRole: Role, state: string, turn?: number): Result<GameSession> {
    const session = this.state.gameSession;
    if (!session) return fail('没有进行中的游戏');
    const text = String(state ?? '');
    // 农场/沙盒类的世界存档：放宽到 2MB
    if (text.length > 2_000_000) return fail('局面数据太大了（上限 2MB）');
    session.state = text;
    session.turn = typeof turn === 'number' ? Math.max(0, Math.min(1, Math.round(turn))) : session.turn;
    session.updatedAt = this.now();
    session.updatedBy = byRole;
    session.seq += 1;
    this.notify();
    return ok(session);
  }

  endGame(_byRole: Role): Result<null> {
    this.state.gameSession = null;
    this.notify();
    return ok(null);
  }

  // ---- 3D 世界模组 ----

  /**
   * 粘贴一个模组 JSON → 校验 → 形状展开成格子 → 并进存档。
   *
   * 用户要的："下次你直接给代码我直接复制就可以直接在我们的存档生成各种模组"。
   * 所以这是**声明式**模组（不是脚本），手机里不执行陌生代码，只按描述摆方块。
   */
  applyVoxelMod(byRole: Role, json: string): Result<{ id: string; name: string; blocks: number }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const parsed = parseMod(json);
    if (!parsed.ok) return fail(parsed.error);
    const edits = expandMod(parsed.mod);
    if (edits.length === 0) return fail('这个模组没有生成任何方块（检查坐标是否在世界范围内）');
    const merged = this.mergeVoxelEdits(byRole, edits);
    if (!merged.ok) return fail(merged.error);
    const id = uid('mod');
    this.state.voxelMods = [
      { id, name: parsed.mod.name, blocks: parsed.mod.blocks ?? [], createdAt: this.now() },
      ...this.state.voxelMods,
    ].slice(0, 40);
    this.logActivity(byRole, 'add', 'game', '3D 模组', parsed.mod.name);
    this.notify();
    return ok({ id, name: parsed.mod.name, blocks: edits.length });
  }

  /** 只从列表里移除记录（摆出来的方块留在世界里，想清掉用"清空存档"） */
  removeVoxelMod(byRole: Role, id: string): Result<null> {
    const before = this.state.voxelMods.length;
    this.state.voxelMods = this.state.voxelMods.filter((m) => m.id !== id);
    if (this.state.voxelMods.length === before) return fail('没有这个模组');
    void byRole;
    this.notify();
    return ok(null);
  }

  // ---- 3D 体素世界存档 ----

  /**
   * 合并一批改动进存档（一次挖/放就一条 `x,y,z,v`，同一格以后来的为准）。
   * 上限 3 万条：够建一座小城堡，也不会把状态撑爆。
   */
  mergeVoxelEdits(byRole: Role, edits: string[]): Result<{ count: number }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const incoming = Array.isArray(edits) ? edits : [];
    const valid = incoming.filter((e) => typeof e === 'string' && /^-?\d+,-?\d+,-?\d+,\d+$/.test(e));
    if (valid.length === 0) return ok({ count: this.state.voxelWorld.edits.length });
    const map = new Map<string, string>();
    const keyOf = (e: string) => {
      const p = e.split(',');
      return p[0] + ',' + p[1] + ',' + p[2];
    };
    for (const e of this.state.voxelWorld.edits) map.set(keyOf(e), e);
    for (const e of valid) map.set(keyOf(e), e);
    let next = [...map.values()];
    if (next.length > 30000) next = next.slice(-30000);
    this.state.voxelWorld = { edits: next, updatedAt: this.now(), updatedBy: byRole };
    this.notify();
    return ok({ count: next.length });
  }

  /** 清空存档（回到刚生成的地形） */
  resetVoxelWorld(byRole: Role): Result<null> {
    this.state.voxelWorld = { edits: [], updatedAt: this.now(), updatedBy: byRole };
    if (this.state.gameSession) this.state.gameSession = null;
    this.logActivity(byRole, 'delete', 'game', '3D 世界存档');
    this.notify();
    return ok(null);
  }

  // ---- 评论区（每个对象一池，互不串） ----

  /** 评论区的 key：影视按片 id（没有就用片名），点滴按记录 id */
  private commentKey(target: 'movie' | 'moment', targetId: string): string {
    return `${target}:${String(targetId ?? '').trim().slice(0, 80)}`;
  }

  /** 某个对象下的评论（新的在前） */
  listComments(target: 'movie' | 'moment', targetId: string): CommentItem[] {
    const list = this.state.comments[this.commentKey(target, targetId)] ?? [];
    return [...list].sort((a, b) => b.at - a.at);
  }

  addComment(
    byRole: Role,
    target: 'movie' | 'moment',
    targetId: string,
    text: string,
  ): Result<CommentItem> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!String(targetId ?? '').trim()) return fail('没有指定评论对象');
    const trimmed = String(text ?? '').trim().slice(0, 200);
    if (!trimmed) return fail('说点什么吧');
    const key = this.commentKey(target, targetId);
    const list = this.state.comments[key] ?? [];
    const item: CommentItem = { id: uid('cm'), byRole, text: trimmed, at: this.now() };
    list.push(item);
    // 每个对象最多留 200 条，避免状态无限膨胀（不删其它对象的）
    this.state.comments[key] = list.length > 200 ? list.slice(-200) : list;
    this.logActivity(
      byRole,
      'add',
      target === 'movie' ? 'movieComment' : 'momentComment',
      target === 'movie' ? '影评' : '点滴评论',
      trimmed.slice(0, 20),
    );
    this.notify();
    return ok(item);
  }

  removeComment(
    byRole: Role,
    target: 'movie' | 'moment',
    targetId: string,
    commentId: string,
  ): Result<null> {
    const key = this.commentKey(target, targetId);
    const list = this.state.comments[key] ?? [];
    const hit = list.find((c) => c.id === commentId);
    if (!hit) return fail('这条评论不在了');
    // 只有作者能删自己的
    if (hit.byRole !== byRole) return fail('只能删自己写的评论');
    this.state.comments[key] = list.filter((c) => c.id !== commentId);
    this.notify();
    return ok(null);
  }

  /** 从队列移除（谁加的、或任何一方都能移，队列是共享的） */
  removeWatchQueue(byRole: Role, id: string): Result<null> {
    const item = this.state.watchQueue.find((q) => q.id === id);
    if (!item) return fail('队列里没有这一项');
    this.state.watchQueue = this.state.watchQueue.filter((q) => q.id !== id);
    this.logActivity(byRole, 'delete', 'watchQueue', '一起看队列', item.title);
    this.notify();
    return ok(null);
  }

  /** 清空队列 */
  clearWatchQueue(byRole: Role): Result<null> {
    if (this.state.watchQueue.length === 0) return ok(null);
    this.state.watchQueue = [];
    this.logActivity(byRole, 'delete', 'watchQueue', '一起看队列');
    this.notify();
    return ok(null);
  }

  /**
   * 点队列里的一项 → 直接开播。
   * 没有房间就建一个；房间已散场（RECAP/ENDED）就开新的；进行中的房间只换源。
   */
  playFromQueue(byRole: Role, id: string): Result<RoomView> {
    const item = this.state.watchQueue.find((q) => q.id === id);
    if (!item) return fail('队列里没有这一项');
    const title = item.episodeName ? `${item.title} ${item.episodeName}` : item.title;
    const room = this.activeRoom();
    const dead =
      !room ||
      room.state === 'RECAP' ||
      room.state === 'ENDED' ||
      room.state === 'DISSOLVED' ||
      room.state === 'EXPIRED' ||
      // 房间开着但对方还没进来过：也没有"一起看"发生，直接换成这一部更符合直觉
      room.peerJoinedAt === null;
    if (dead) {
      if (room) room.state = 'DISSOLVED';
      this.state.activeRoomId = null;
      return this.createRoom(byRole, title, item.url);
    }
    const res = this.setRoomSource(byRole, item.url, title);
    if (!res.ok) return fail(res.error);
    /*
     * play() 在房间还没进入 PLAYING/PAUSED（比如还在倒计时、双方未就绪）时会 fail。
     * 以前这里不看返回值，照样返回 ok：用户从队列点了一部片，片名变了、播放器没动、
     * 也没有任何提示 —— 就是「点了没反应」。
     */
    const played = this.play(byRole, 0);
    if (!played.ok) return fail(played.error ?? '房间还没准备好，稍后再试');
    const fresh = this.activeRoom();
    return fresh ? ok(this.toRoomView(fresh, byRole)) : fail('房间不可用');
  }

  setRoomSource(byRole: Role, sourceUrl: string | null, movieTitle?: string): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (sourceUrl !== null && !/^https?:\/\//i.test(sourceUrl)) {
      return fail('播放地址必须以 http/https 开头');
    }
    // 上一场已经散场（回忆卡/已结束）：换片应该开新房间。
    // 以前这里直接改旧房间的 movieTitle，于是顶部写着新片名、回忆卡却还是上一部
    // （真实截图：「罗梅莉亚战记」标题 + 「大明王朝1566」的回忆卡）。
    if (sourceUrl !== null && (room.state === 'RECAP' || room.state === 'ENDED')) {
      const created = this.createRoom(byRole, movieTitle ?? room.movieTitle, sourceUrl);
      return created.ok ? ok(null) : fail(created.error);
    }
    // 换片之前，把"没记片源"的老弹幕钉在**旧地址**上：
    // 不这么做的话，它们会在新片里继续飘（用户实测反馈的串台）。
    if (room.sourceUrl && room.sourceUrl !== sourceUrl) {
      for (const d of room.danmaku) {
        if (!d.sourceUrl) d.sourceUrl = room.sourceUrl;
      }
    }
    room.sourceUrl = sourceUrl;
    if (movieTitle && movieTitle.trim()) room.movieTitle = movieTitle.trim().slice(0, 40);
    this.audit(byRole, 'room-source', sourceUrl ? '设置在线片源' : '清除在线片源');
    this.notify();
    return ok(null);
  }

  setMediaOffset(byRole: Role, offsetSec: number): Result<number> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    const clamped = Math.max(-120, Math.min(120, Math.round(offsetSec)));
    room.mediaOffset[byRole] = clamped;
    this.notify();
    return ok(clamped);
  }

  /** 播放倍速：主控设置，双方跟着变（1 / 1.25 / 1.5 / 2 / 3） */
  setPlaybackRate(byRole: Role, rate: number): Result<RoomView> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return fail('只有主控能改倍速');
    const allowed = [1, 1.25, 1.5, 2, 3];
    const next = allowed.includes(rate) ? rate : 1;
    const now = this.now();
    // 改倍速前先把已经播过的时长按旧倍速结算，否则"倍速切换那一下"会算错
    if (room.mediaState.action === 'play') {
      room.mediaState.positionSec += ((now - room.mediaState.updatedAtServerMs) / 1000) * room.mediaState.rate;
    }
    room.mediaState.rate = next;
    room.mediaState.updatedAtServerMs = now;
    room.mediaState.seq += 1;
    room.holdUntil = now + 1500;
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  private requirePlayingRoom(byRole: Role): Result<Room> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.state !== 'PLAYING' && room.state !== 'PAUSED') return fail('现在不在观影中');
    return ok(room);
  }

  play(byRole: Role, positionSec?: number): Result<RoomView> {
    const roomCheck = this.requirePlayingRoom(byRole);
    if (!roomCheck.ok) return fail(roomCheck.error);
    const room = roomCheck.value;
    const now = this.now();
    room.mediaState.action = 'play';
    if (typeof positionSec === 'number') room.mediaState.positionSec = Math.max(0, positionSec);
    room.mediaState.updatedAtServerMs = now;
    room.mediaState.seq += 1;
    room.holdUntil = now + 1500;
    this.applyRoomEvent(room, 'PLAY');
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  pause(byRole: Role, positionSec?: number): Result<RoomView> {
    const roomCheck = this.requirePlayingRoom(byRole);
    if (!roomCheck.ok) return fail(roomCheck.error);
    const room = roomCheck.value;
    room.mediaState.action = 'pause';
    if (typeof positionSec === 'number') room.mediaState.positionSec = Math.max(0, positionSec);
    room.mediaState.updatedAtServerMs = this.now();
    room.mediaState.seq += 1;
    room.holdUntil = this.now() + 1500;
    this.applyRoomEvent(room, 'PAUSE');
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  seek(byRole: Role, positionSec: number): Result<RoomView> {
    const roomCheck = this.requirePlayingRoom(byRole);
    if (!roomCheck.ok) return fail(roomCheck.error);
    const room = roomCheck.value;
    /*
     * SEEK_LEADER_ONLY：进度由主控掌握。
     * 以前这里只校验"房间在演"，跟随方在播放器里拖一下进度条
     * 就能改掉两个人的权威位置（房间控制条对跟随方是拦着的，播放器里的拖动条是后门）。
     */
    if (room.leaderRole !== byRole) {
      return fail('进度由主控掌握，需要主控把控制权交给你才能拖动');
    }
    room.mediaState.positionSec = Math.max(0, positionSec);
    room.mediaState.updatedAtServerMs = this.now();
    room.mediaState.seq += 1;
    room.holdUntil = this.now() + 1500;
    this.applyRoomEvent(room, 'SEEK');
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  /** 主控心跳：把服务端权威位置校准到主控真实播放位置 */
  heartbeat(byRole: Role, positionSec: number, playing: boolean): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    this.lastSeen[byRole] = this.now();
    if (room.leaderRole !== byRole) return ok(null);
    if (room.state !== 'PLAYING' && room.state !== 'PAUSED') return ok(null);
    const now = this.now();
    if (room.mediaState.action === 'play') {
      room.mediaState.positionSec += Math.max(0, (now - room.mediaState.updatedAtServerMs) / 1000) * room.mediaState.rate;
    }
    room.mediaState.updatedAtServerMs = now;
    // 保护期：刚由 App 发起 play/pause/seek 后，主控的播放器可能还没跟上，
    // 此时不要用它的旧位置覆盖权威位置（否则用户会看到"暂停后跳回去"）。
    if (now < room.holdUntil) return ok(null);
    /*
     * 这里的校准必须推出去，否则等于没校准：
     * revision 只在 notify() 里自增，跟随方靠 mediaState.seq 变化感知新位置。
     * 以前改完 seq 却全程不 notify，纯观影（没有弹幕/表情这些别的写操作）时
     * 跟随方永远拿不到这次校准。
     */
    /*
     * LEADER_ZERO_GUARD：主控刚重新进入房间时，播放器还没起来，
     * 心跳会报 (0s, 未播放)。以前照单全收：服务端位置被清成 0、房间被转成暂停，
     * 跟随方同步回到 0:00 —— 一场看到一半的电影进度全丢。
     * 服务端位置已经明显大于 0 时，不采纳"0 秒且未播放"这种"播放器还没起来"的信号。
     */
    if (positionSec <= 1 && !playing && room.mediaState.positionSec > 5) {
      return ok(null);
    }
    let changed = false;
    const drift = Math.abs(room.mediaState.positionSec - positionSec);
    /*
     * HEARTBEAT_GLUE：以前阈值是 3 秒 —— 服务端位置按服务器时钟自己往前走，
     * 只有偏离主控真实播放位置 3 秒以上才拉回来。可采集站的片子几秒卡一下是常态，
     * 于是服务端位置就成了「每几秒往前窜一点、再被拽回 3 秒」的锯齿。
     * 跟随方照着这条锯齿校准，表现就是用户看到的「进度一直跳」「一会一样一会往回缩」。
     * 现在缩到 0.8 秒：服务端的权威位置几乎贴着主控的真实播放位置，
     * 跟随方看到的是一条平滑的线（这点抖动落在跟随方的死区里，不会触发 seek）。
     */
    if (drift > 0.8) {
      // 主控的真实播放器偏差过大（用户拖动了本地播放器 / 片子卡了一下）→ 服务端跟随主控
      room.mediaState.positionSec = Math.max(0, positionSec);
      room.mediaState.seq += 1;
      changed = true;
    }
    if (room.mediaState.action === 'play' !== playing) {
      room.mediaState.action = playing ? 'play' : 'pause';
      room.mediaState.seq += 1;
      changed = true;
    }
    if (changed) this.notify();
    return ok(null);
  }

  transferLeader(byRole: Role, to: Role): Result<Room | null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return fail('只有主控可以交出控制权');
    room.leaderRole = to;
    room.mediaState.leaderRole = to;
    room.mediaState.seq += 1;
    this.audit(byRole, 'room-leader', `主控交给 ${to}`);
    this.notify();
    return ok(room);
  }

  /** 非主控方点播放：不直接执行，返回 needs-lead 由 UI 走"请求主控"流程 */
  pressPlay(byRole: Role): Result<'ok' | 'needs-lead'> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return ok('needs-lead');
    this.play(byRole);
    return ok('ok');
  }

  /** 跟随方申请接管主控 */
  requestLead(byRole: Role): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole === byRole) return fail('你已经是主控了');
    if (room.state !== 'PLAYING' && room.state !== 'PAUSED') return fail('现在不能切换主控');
    room.pendingLeadRequest = byRole;
    this.pushNotification(room.leaderRole, 'room', MASK.leadRequest);
    this.notify();
    return ok(null);
  }

  /** 主控同意接管请求 */
  grantLead(byRole: Role): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return fail('只有主控可以同意');
    const requester = room.pendingLeadRequest;
    if (!requester) return fail('没有待处理的接管请求');
    room.pendingLeadRequest = null;
    this.transferLeader(byRole, requester);
    return ok(null);
  }

  /** 主控拒绝接管请求 */
  denyLead(byRole: Role): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return fail('只有主控可以拒绝');
    room.pendingLeadRequest = null;
    this.notify();
    return ok(null);
  }

  /** 跟随方只想发一次操作（不接管主控） */
  requestAction(byRole: Role, action: 'play' | 'pause'): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole === byRole) return fail('你是主控，直接操作即可');
    if (room.state !== 'PLAYING' && room.state !== 'PAUSED') return fail('现在不能操作播放');
    room.pendingAction = { role: byRole, action };
    this.pushNotification(room.leaderRole, 'room', MASK.leadRequest);
    this.notify();
    return ok(null);
  }

  /** 主控同意这一次操作 */
  grantAction(byRole: Role): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return fail('只有主控可以同意');
    const pending = room.pendingAction;
    if (!pending) return fail('没有待处理的操作请求');
    room.pendingAction = null;
    if (pending.action === 'play') {
      const result = this.play(byRole);
      return result.ok ? ok(null) : fail(result.error);
    }
    const result = this.pause(byRole);
    return result.ok ? ok(null) : fail(result.error);
  }

  /** 主控拒绝这一次操作 */
  denyAction(byRole: Role): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.leaderRole !== byRole) return fail('只有主控可以拒绝');
    room.pendingAction = null;
    this.notify();
    return ok(null);
  }

  sendDanmaku(byRole: Role, text: string): Result<Danmaku | null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    const trimmed = text.trim().slice(0, 24);
    if (!trimmed) return fail('说点什么吧');
    const item: Danmaku = {
      id: uid('dm'),
      senderRole: byRole,
      text: trimmed,
      mediaPosSec: room.mediaState.positionSec,
      at: this.now(),
      // 记住这条弹幕属于哪部片：换片后不会再飘到新片上
      sourceUrl: room.sourceUrl ?? null,
    };
    room.danmaku.push(item);
    if (room.danmaku.length > 200) room.danmaku.shift();
    this.notify();
    return ok(item);
  }

  sendReaction(byRole: Role, kind: ReactionKind): Result<Reaction | null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    const reaction: Reaction = {
      id: uid('rct'),
      senderRole: byRole,
      kind,
      mediaPosSec: room.mediaState.positionSec,
      at: this.now(),
    };
    room.reactions.push(reaction);
    if (room.reactions.length > 60) room.reactions.shift();
    this.notify();
    return ok(reaction);
  }

  rateMovie(byRole: Role, stars: number): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (!room.recap) return fail('还没有观影记录');
    room.recap.ratings[byRole] = Math.max(1, Math.min(5, Math.round(stars)));
    this.notify();
    return ok(null);
  }

  reviewMovie(byRole: Role, text: string): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (!room.recap) return fail('还没有观影记录');
    room.recap.reviews[byRole] = text.trim().slice(0, 50);
    this.notify();
    return ok(null);
  }

  saveRecap(byRole: Role): Result<RoomView> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (!room.recap) return fail('还没有观影记录');
    if (!room.recap.saved.includes(byRole)) room.recap.saved.push(byRole);
    if (room.state === 'ENDED') this.applyRoomEvent(room, 'SAVE_RECAP');
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'room', MASK.recapSaved);
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  endRoom(byRole: Role): Result<RoomView> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    // 先确认这次结束是合法的，再改数据。
    // 以前是先写 recap 再 applyRoomEvent，结束失败（比如房间还没人进来）时
    // 会留下半张回忆卡，后面点「一起看队列」换片，这张旧卡还会被带到新房间。
    /*
     * 结束房间也做成幂等：房间已经结束/过期时，状态机不放行 END，
     * 以前这里直接抛「房间还没开始…」——用户看到的就是莫名其妙的"房间状态失败"。
     * 现在直接把房间收尾清掉，操作一定成功。
     */
    if (!transition(room.state, 'END')) {
      room.danmaku = [];
      room.reactions = [];
      room.token = '';
      this.state.activeRoomId = null;
      this.audit(byRole, 'room-end', `房间已结束（原状态 ${room.state}）`);
      this.notify();
      return ok(this.toRoomView(room, byRole));
    }
    const now = this.now();
    room.endedAt = now;
    const startedAt = room.peerJoinedAt ?? room.createdAt;
    if (!room.recap) {
      room.recap = {
        movieTitle: room.movieTitle,
        startedAt,
        endedAt: now,
        durationSec: Math.max(0, Math.round((now - startedAt) / 1000)),
        ratings: {},
        reviews: {},
        saved: [],
        screenshots: [],
      };
    }
    const applied = this.applyRoomEvent(room, 'END');
    if (!applied.ok) return fail(applied.error);
    this.notify();
    return ok(this.toRoomView(room, byRole));
  }

  /**
   * 解散房间。
   *
   * 用户反馈："点解散会报错，说不允许"。原因是房间已经过期（EXPIRED）或已结束，
   * 状态机不再允许 CANCEL —— 但"解散"这件事在任何状态下都应该能收尾，
   * 所以这里改成幂等：状态机不放行就直接把房间清掉，不再抛错。
   */
  cancelRoom(byRole: Role): Result<null> {
    const room = this.activeRoom();
    if (!room) return ok(null);
    const applied = this.applyRoomEvent(room, 'CANCEL');
    if (!applied.ok) {
      room.danmaku = [];
      room.reactions = [];
      room.token = '';
      this.state.activeRoomId = null;
      this.audit(byRole, 'room-cancel', `房间已解散（原状态 ${room.state}）`);
      this.notify();
      return ok(null);
    }
    // 房间解散：清空弹幕、表情、token
    room.danmaku = [];
    room.reactions = [];
    room.token = '';
    this.audit(byRole, 'room-cancel', '房间已解散');
    this.state.activeRoomId = null;
    this.notify();
    return ok(null);
  }

  // -------------------------------------------------------------------------
  // 网络与时钟
  // -------------------------------------------------------------------------

  setOnline(role: Role, online: boolean): Result<null> {
    const room = this.activeRoom();
    const now = this.now();
    this.online[role] = online;
    if (room) {
      const st = room.state;
      if (!online) {
        if (st === 'PLAYING' || st === 'PAUSED' || st === 'COUNTDOWN' || st === 'PREPARING') {
          room.offlineSince = now;
          this.applyRoomEvent(room, 'PEER_OFFLINE');
        }
      } else if (st === 'PEER_OFFLINE' || st === 'WAITING_RECONNECT') {
        room.offlineSince = null;
        const event: RoomEvent =
          room.mediaState.action === 'play' ? 'PEER_ONLINE_PLAYING' : 'PEER_ONLINE_PAUSED';
        this.applyRoomEvent(room, event);
      }
    }
    this.notify();
    return ok(null);
  }

  /** 对时：返回一个完整的 ping 样本（含两侧时钟读数），由 Hub 模拟网络延迟 */
  clockPing(role: Role): { t1: number; t2: number; t3: number; t4: number } {
    const serverNow = this.now();
    const half = Math.max(0, Math.round(this.latencyMs / 2));
    const skew = this.clockSkew[role];
    return {
      t1: serverNow - half + skew,
      t2: serverNow,
      t3: serverNow,
      t4: serverNow + half + skew,
    };
  }

  // -------------------------------------------------------------------------
  // 解绑与删除
  // -------------------------------------------------------------------------

  requestUnbind(byRole: Role, choice: DataChoice): Result<UnbindRequest> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (this.state.unbind && this.state.unbind.status === 'cooling') {
      return fail('已经在冷静期里了');
    }
    const now = this.now();
    const request: UnbindRequest = {
      requestedAt: now,
      byRole,
      coolingEndsAt: now + this.scaled(7 * 24 * 3600 * 1000),
      status: 'cooling',
      /*
       * 按**发起人**记录，不要固定写进 A：B 发起并选"删除全部数据"时，
       * 以前会记成 A=delete、B=export，冷静期里两个人看到的选择正好相反。
       */
      dataChoice: {
        [byRole]: choice,
        [byRole === 'A' ? 'B' : 'A']: 'export',
      } as Record<Role, DataChoice>,
      confirmed: [],
    };
    this.state.unbind = request;
    this.audit(byRole, 'unbind-request', '发起解绑');
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'unbind', MASK.unbind);
    this.notify();
    return ok(request);
  }

  setUnbindChoice(byRole: Role, choice: DataChoice): Result<null> {
    const request = this.state.unbind;
    if (!request || request.status !== 'cooling') return fail('没有进行中的解绑');
    request.dataChoice[byRole] = choice;
    this.notify();
    return ok(null);
  }

  cancelUnbind(byRole: Role): Result<null> {
    const request = this.state.unbind;
    if (!request || request.status !== 'cooling') return fail('没有进行中的解绑');
    request.status = 'cancelled';
    this.audit(byRole, 'unbind-cancel', '撤销解绑');
    this.notify();
    return ok(null);
  }

  confirmUnbind(byRole: Role): Result<null> {
    const request = this.state.unbind;
    if (!request || request.status !== 'cooling') return fail('没有进行中的解绑');
    /*
     * 冷静期以前只是写了个时间戳、从来不校验：双方各点一下就能在同一秒里
     * 走完"申请 → 确认 → 批量删除"，7 天冷静期等于不存在。
     */
    if (request.coolingEndsAt > this.now()) {
      const days = Math.ceil((request.coolingEndsAt - this.now()) / 86400000);
      return fail(`冷静期还没结束（还剩 ${days} 天），到期后双方确认才会生效`);
    }
    if (!request.confirmed.includes(byRole)) request.confirmed.push(byRole);
    if (request.confirmed.length === 2) {
      request.status = 'done';
      this.state.boundAt = null;
      if (request.dataChoice.A === 'delete' || request.dataChoice.B === 'delete') {
        this.state.events = [];
        this.state.todos = [];
        this.state.shopping = [];
        this.state.chores = [];
        this.state.ledger = [];
        this.state.collection = [];
        this.state.habits = [];
        this.state.goals = [];
        this.state.moods = { A: null, B: null };
        this.state.giftIdeas = [];
        this.state.cards = [];
        this.state.voiceNotes = [];
        this.state.diary = [];
        this.state.timeline = [];
        this.state.weeklyReviews = [];
        this.state.watchPlans = [];
        this.state.pickSession = null;
        this.state.plans = [];
        this.state.boundaries = [];
        this.state.conflicts = [];
        this.state.votes = [];
        this.state.intimacy = [];
        this.state.socialReports = [];
        this.state.vault = [];
        this.state.safety = [];
        this.state.achievements = [];
        this.state.relProfile = {
          meetMethod: '',
          firstDate: '',
          stage: 'dating',
          milestones: [],
          submittedBy: [],
          confirmedBy: [],
          updatedAt: this.now(),
        };
        this.state.valuesCard = { drafts: {}, scheduledAt: null, consensus: '', revealed: false };
        this.state.ldr = { enabled: false, nextMeetDate: null, ticket: '', budgetCents: 0, checklist: [] };
        this.state.trust = {
          locationShareUntil: null,
          shareWith: [],
          arrivedReport: false,
          emergencyContact: false,
        };
        this.state.wedding = {
          budgetCents: 0,
          styles: [],
          guests: [],
          dates: [],
          sharedWithPartner: false,
          ownerRole: 'A',
          updatedAt: this.now(),
        };
        /*
         * 用户勾的是"删除全部数据"，那就得连**痕迹**一起删。
         * 以前只清了业务表，活动流(activity)/通知(notifications)/审计(audit)/评论(comments)/
         * 一起看队列(watchQueue)/房间回忆(rooms)/心愿与回忆卡里都嵌着正文片段
         * （例如「新增了日记「…」」），对方手机还能从这些记录里看到已经被"删掉"的内容。
         */
        this.state.activity = [];
        this.state.notifications = [];
        this.state.audit = [];
        this.state.comments = {};
        this.state.watchQueue = [];
        this.state.rooms = {};
        this.state.careReminders = [];
        this.state.comfort = { A: [], B: [] };
        this.state.dailyQuestion = null;
        this.state.games = [];
        this.state.gameSession = null;
        this.state.voxelWorld = { edits: [], updatedAt: this.now(), updatedBy: 'A' };
        this.state.voxelMods = [];
        this.state.fmProgress = null;
        this.state.decor = { slots: {}, updatedAt: this.now(), updatedBy: 'A' };
        this.state.pet = {
          ...this.state.pet,
          name: '',
          water: 0,
          food: 0,
          affection: 0,
          careDays: 0,
          lastCareDay: null,
          lastWateredAt: null,
          lastFedAt: null,
          lastPettedAt: null,
          decorUnlocked: 0,
        };
        // 相册上传的背景是"可见的私人图片"，删数据时一并清掉
        this.state.profile = { ...this.state.profile, backgroundUri: null };
        this.state.customBackground = null;
        this.state.activeRoomId = null;
        this.state.period.A.records = [];
        this.state.period.B.records = [];
        this.state.period.A.planLog = [];
        this.state.period.B.planLog = [];
        this.state.selfAssess = { A: null, B: null };
        this.state.voice = emptyVoice();
        this.state.music = {
          queue: [],
          index: 0,
          action: 'pause',
          positionSec: 0,
          updatedAtServerMs: this.now(),
          seq: 0,
          loop: false,
          shuffle: false,
          updatedBy: 'A',
        };
      }
      this.audit(byRole, 'unbind-done', '双人空间已结束');
    }
    this.notify();
    return ok(null);
  }

  /** 演示用：直接把冷静期拨到结束（真实产品无此入口） */
  fastForwardCooling(): Result<null> {
    const request = this.state.unbind;
    if (!request || request.status !== 'cooling') return fail('没有进行中的解绑');
    request.coolingEndsAt = this.now();
    this.notify();
    return ok(null);
  }

  /**
   * 演示用：把"已掉线时长"往前拨，用于验证 5 分钟 → 等待中、30 分钟 → 自动结束 这两条分支。
   * 真实产品里不存在这个入口，它只是把计时器快进。
   */
  devSkipOfflineTo(msAgo: number): Result<number> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (room.offlineSince === null) return fail('当前没有设备处于掉线状态');
    room.offlineSince = this.now() - msAgo - 1;
    this.notify();
    return ok(room.offlineSince);
  }

  // =========================================================================
  // 模块1 双人空间：共同房间 / 宠物植物 / 主题
  // =========================================================================

  decorate(byRole: Role, slot: string, itemId: string | null): Result<null> {
    if (!(slot in this.state.decor.slots)) return fail('没有这个摆放位置');
    this.state.decor.slots[slot] = itemId;
    this.state.decor.updatedAt = this.now();
    this.state.decor.updatedBy = byRole;
    this.logActivity(byRole, itemId ? 'add' : 'delete', 'decor', '小屋装饰', itemId ?? '');
    this.notify();
    return ok(null);
  }

  /** 温和衰减：只下降不惩罚，affection 永不减少，任何一天回来都能继续 */
  private applyPetDecay(): void {
    const pet = this.state.pet;
    const now = this.now();
    // 基准优先用内存基线，其次是持久化的照料时间；算完只更新内存基线，不动 state
    const decay = (key: 'water' | 'food', ts: number | null, value: number): number => {
      const base = this.petDecayBase[key] ?? ts;
      if (base === null) return value;
      const hours = Math.max(0, (now - base) / 3_600_000);
      this.petDecayBase[key] = now;
      return Math.max(0, Math.round(value - hours * 2));
    };
    pet.water = decay('water', pet.lastWateredAt, pet.water);
    pet.food = decay('food', pet.lastFedAt, pet.food);
  }

  petCare(byRole: Role, action: 'water' | 'feed' | 'pet'): Result<null> {
    this.applyPetDecay();
    const pet = this.state.pet;
    const now = this.now();
    const today = todayISO(now);
    if (action === 'water') {
      pet.water = Math.min(100, pet.water + 25);
      pet.lastWateredAt = now;
      this.petDecayBase.water = now;
    }
    if (action === 'feed') {
      pet.food = Math.min(100, pet.food + 25);
      pet.lastFedAt = now;
      this.petDecayBase.food = now;
    }
    if (action === 'pet') pet.affection = Math.min(100, pet.affection + 10);
    if (pet.lastCareDay !== today) {
      pet.careDays += 1;
      pet.lastCareDay = today;
      pet.decorUnlocked = Math.min(8, Math.floor(pet.careDays / 3));
    }
    this.audit(byRole, 'pet', `照料：${action}`);
    this.logActivity(byRole, 'done', 'pet', '小屋宠物', PET_CARE_LABEL[action] ?? '');
    this.notify();
    return ok(null);
  }

  setTheme(byRole: Role, theme: ThemeId, sync: boolean): Result<null> {
    this.state.themes.current[byRole] = theme;
    if (sync) {
      this.state.themes.synced = true;
      this.state.themes.current.A = theme;
      this.state.themes.current.B = theme;
    }
    this.state.themes.synced = sync;
    this.audit(byRole, 'theme', `主题 ${theme}${sync ? '（同步）' : '（仅我）'}`);
    if (sync) this.logActivity(byRole, 'update', 'theme', '共同主题', theme);
    this.notify();
    return ok(null);
  }

  // =========================================================================
  // 模块2 家务 / 记账 / 集合型清单 / 习惯 / 目标
  // =========================================================================

  addChore(byRole: Role, title: string, assignee: Assignee, rotation?: Assignee[]): Result<Chore> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!title.trim()) return fail('家务内容不能为空');
    const rota = rotation && rotation.length > 0 ? rotation : [assignee];
    const chore: Chore = {
      id: uid('chore'),
      title: title.trim().slice(0, 40),
      assignee,
      rotation: rota,
      rotationIndex: 0,
      weekKey: weekKeyOf(this.now()),
      doneWeekKeys: [],
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.chores.push(chore);
    this.logActivity(byRole, 'add', 'chore', '家务', chore.title);
    this.notify();
    return ok(chore);
  }

  currentChoreAssignee(chore: Chore): Assignee {
    if (chore.rotation.length === 0) return chore.assignee;
    return chore.rotation[chore.rotationIndex % chore.rotation.length];
  }

  claimChore(byRole: Role, id: string): Result<Chore> {
    const chore = this.state.chores.find((c) => c.id === id);
    if (!chore) return fail('这条家务不存在');
    chore.assignee = byRole;
    chore.rotation = [byRole];
    chore.rotationIndex = 0;
    this.notify();
    return ok(chore);
  }

  completeChore(byRole: Role, id: string): Result<Chore> {
    const chore = this.state.chores.find((c) => c.id === id);
    if (!chore) return fail('这条家务不存在');
    const key = weekKeyOf(this.now());
    if (!chore.doneWeekKeys.includes(key)) chore.doneWeekKeys.push(key);
    this.audit(byRole, 'chore', `完成：${chore.title}`);
    this.logActivity(byRole, 'done', 'chore', '家务', chore.title);
    this.notify();
    return ok(chore);
  }

  uncompleteChore(byRole: Role, id: string): Result<Chore> {
    const chore = this.state.chores.find((c) => c.id === id);
    if (!chore) return fail('这条家务不存在');
    const key = weekKeyOf(this.now());
    chore.doneWeekKeys = chore.doneWeekKeys.filter((k) => k !== key);
    this.notify();
    return ok(chore);
  }

  deleteChore(byRole: Role, id: string): Result<null> {
    const chore = this.state.chores.find((c) => c.id === id);
    if (!chore) return fail('这条家务不存在');
    this.state.chores = this.state.chores.filter((c) => c.id !== id);
    this.logActivity(byRole, 'delete', 'chore', '家务', chore.title);
    this.notify();
    return ok(null);
  }

  addLedger(
    byRole: Role,
    input: {
      title: string;
      amountCents: number;
      payerRole: Role;
      split: 'equal' | 'custom';
      shares?: Record<Role, number>;
      category: LedgerEntry['category'];
      date: string;
      visibility?: 'shared' | 'owner';
    },
  ): Result<LedgerEntry> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!input.title.trim()) return fail('写一句花在哪了');
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return fail('金额需要大于 0');
    let shares: Record<Role, number> = { A: 0.5, B: 0.5 };
    if (input.split === 'custom' && input.shares) {
      const total = input.shares.A + input.shares.B;
      if (total <= 0) return fail('分摊比例不合法');
      shares = { A: input.shares.A / total, B: input.shares.B / total };
    }
    const entry: LedgerEntry = {
      id: uid('led'),
      title: input.title.trim().slice(0, 40),
      amountCents: Math.round(input.amountCents),
      payerRole: input.payerRole,
      split: input.split,
      shares,
      category: input.category,
      visibility: input.visibility ?? 'shared',
      confirmedBy: [input.payerRole],
      date: input.date,
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.ledger.unshift(entry);
    this.audit(byRole, 'ledger', `记一笔 ${entry.title} ${(entry.amountCents / 100).toFixed(2)}`);
    this.logActivity(
      byRole,
      'add',
      'ledger',
      '记账',
      `${entry.title} ¥${(entry.amountCents / 100).toFixed(2)}`,
    );
    this.notify();
    return ok(entry);
  }

  confirmLedger(byRole: Role, id: string): Result<LedgerEntry> {
    const entry = this.state.ledger.find((l) => l.id === id);
    if (!entry) return fail('这笔账不存在');
    if (entry.visibility === 'owner' && entry.createdBy !== byRole) return fail('这笔账不可见');
    if (!entry.confirmedBy.includes(byRole)) entry.confirmedBy.push(byRole);
    this.notify();
    return ok(entry);
  }

  /** 结算差额：正数表示 A 应付 B */
  ledgerBalance(): { amountCents: number; settledCount: number; pendingCount: number } {
    let net = 0;
    let settled = 0;
    let pending = 0;
    for (const e of this.state.ledger) {
      if (e.confirmedBy.length < 2) {
        pending += 1;
        continue;
      }
      settled += 1;
      const shareA = Math.round(e.amountCents * e.shares.A);
      const paidA = e.payerRole === 'A' ? e.amountCents : 0;
      net += paidA - shareA;
    }
    return { amountCents: net, settledCount: settled, pendingCount: pending };
  }

  collectionAdd(
    byRole: Role,
    kind: CollectionKind,
    input: {
      title: string;
      note?: string;
      tags?: string[];
      amountCents?: number | null;
      date?: string | null;
      level?: number;
      visibility?: 'shared' | 'owner';
      meta?: Record<string, string>;
    },
  ): Result<CollectionItem> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!input.title.trim()) return fail('标题不能为空');
    const item: CollectionItem = {
      id: uid(kind),
      kind,
      title: input.title.trim().slice(0, 60),
      note: (input.note ?? '').trim().slice(0, 160),
      tags: (input.tags ?? []).slice(0, 6),
      amountCents:
        typeof input.amountCents === 'number' && Number.isFinite(input.amountCents)
          ? Math.round(input.amountCents)
          : null,
      date: input.date ?? null,
      level: input.level ?? 0,
      done: false,
      ownerRole: byRole,
      visibility: input.visibility ?? 'shared',
      meta: input.meta ?? {},
      votes: { A: null, B: null },
      claimedBy: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.state.collection.unshift(item);
    // 私密条目（visibility='owner'）对伴侣连"存在"都不该暴露，所以不进动态
    if (item.visibility === 'shared') {
      this.logActivity(byRole, 'add', kind, COLLECTION_LABEL[kind] ?? '清单', item.title);
    }
    this.notify();
    return ok(item);
  }

  collectionUpdate(
    byRole: Role,
    id: string,
    patch: Partial<Pick<CollectionItem, 'title' | 'note' | 'tags' | 'amountCents' | 'date' | 'level' | 'meta' | 'visibility' | 'done'>>,
  ): Result<CollectionItem> {
    const item = this.state.collection.find((i) => i.id === id);
    if (!item) return fail('这条内容不存在');
    if (item.visibility === 'owner' && item.ownerRole !== byRole) return fail('这条内容不可见');
    Object.assign(item, patch);
    item.updatedAt = this.now();
    // 私密条目改了也不提醒伴侣：连"有这条"都不该知道
    if (item.visibility === 'shared') {
      this.logActivity(byRole, 'update', item.kind, COLLECTION_LABEL[item.kind] ?? '清单', item.title);
    }
    this.notify();
    return ok(item);
  }

  collectionToggle(byRole: Role, id: string): Result<CollectionItem> {
    const item = this.state.collection.find((i) => i.id === id);
    if (!item) return fail('这条内容不存在');
    if (item.visibility === 'owner' && item.ownerRole !== byRole) return fail('这条内容不可见');
    item.done = !item.done;
    item.updatedAt = this.now();
    this.notify();
    return ok(item);
  }

  collectionDelete(byRole: Role, id: string): Result<null> {
    const item = this.state.collection.find((i) => i.id === id);
    if (!item) return fail('这条内容不存在');
    if (item.visibility === 'owner' && item.ownerRole !== byRole) return fail('只能删除自己的内容');
    if (item.visibility === 'shared' && item.ownerRole !== byRole) {
      this.audit(byRole, 'collection-delete', `删除共享条目：${item.title}`);
    }
    this.state.collection = this.state.collection.filter((i) => i.id !== id);
    if (item.visibility === 'shared') {
      this.logActivity(byRole, 'delete', item.kind, COLLECTION_LABEL[item.kind] ?? '清单', item.title);
    }
    this.notify();
    return ok(null);
  }

  collectionVote(byRole: Role, id: string, verdict: 'like' | 'nope' | null): Result<CollectionItem> {
    const item = this.state.collection.find((i) => i.id === id);
    if (!item) return fail('这条内容不存在');
    item.votes[byRole] = verdict;
    item.updatedAt = this.now();
    this.notify();
    return ok(item);
  }

  collectionClaim(byRole: Role, id: string): Result<CollectionItem> {
    const item = this.state.collection.find((i) => i.id === id);
    if (!item) return fail('这条内容不存在');
    item.claimedBy = item.claimedBy === byRole ? null : byRole;
    item.updatedAt = this.now();
    this.notify();
    return ok(item);
  }

  /** 愿望罐：真随机抽一条未完成的小愿望 */
  collectionDrawRandom(byRole: Role): Result<CollectionItem | null> {
    const pool = this.state.collection.filter(
      (i) => i.kind === 'wishJar' && !i.done && (i.visibility === 'shared' || i.ownerRole === byRole),
    );
    if (pool.length === 0) return fail('罐子里还没有愿望');
    const picked = pool[Math.floor(Math.random() * pool.length)];
    this.audit(byRole, 'wish-draw', `抽中：${picked.title}`);
    return ok(picked);
  }

  addHabit(byRole: Role, title: string): Result<Habit> {
    if (!title.trim()) return fail('习惯名称不能为空');
    const habit: Habit = {
      id: uid('habit'),
      title: title.trim().slice(0, 30),
      checkins: [],
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.habits.push(habit);
    this.logActivity(byRole, 'add', 'habit', '习惯', habit.title);
    this.notify();
    return ok(habit);
  }

  /** 打卡只做记录：断签不清零、不惩罚、不生成红点；只能给自己打卡，伴侣只能鼓励 */
  toggleHabit(byRole: Role, id: string, date: string): Result<Habit> {
    const habit = this.state.habits.find((h) => h.id === id);
    if (!habit) return fail('这个习惯不存在');
    if (habit.createdBy !== byRole) return fail('这是 TA 的习惯，你只能给 TA 打气');
    if (habit.checkins.includes(date)) {
      habit.checkins = habit.checkins.filter((d) => d !== date);
    } else {
      habit.checkins.push(date);
      habit.checkins.sort();
      this.logActivity(byRole, 'done', 'habit', '习惯', habit.title);
    }
    this.notify();
    return ok(habit);
  }

  addGoal(
    byRole: Role,
    input: { title: string; targetCents: number | null; targetDate: string | null },
  ): Result<Goal> {
    if (!input.title.trim()) return fail('目标名称不能为空');
    const goal: Goal = {
      id: uid('goal'),
      title: input.title.trim().slice(0, 40),
      targetCents: input.targetCents,
      savedCents: 0,
      contributions: [],
      targetDate: input.targetDate,
      done: false,
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.goals.push(goal);
    this.logActivity(byRole, 'add', 'goal', '共同目标', goal.title);
    this.notify();
    return ok(goal);
  }

  contributeGoal(byRole: Role, id: string, cents: number): Result<Goal> {
    const goal = this.state.goals.find((g) => g.id === id);
    if (!goal) return fail('这个目标不存在');
    if (!Number.isFinite(cents) || cents <= 0) return fail('金额需要大于 0');
    const amount = Math.round(cents);
    goal.contributions.push({ role: byRole, cents: amount, at: this.now() });
    goal.savedCents += amount;
    if (goal.targetCents !== null && goal.savedCents >= goal.targetCents) goal.done = true;
    this.logActivity(byRole, 'update', 'goal', '共同目标', `${goal.title} ¥${(amount / 100).toFixed(2)}`);
    this.notify();
    return ok(goal);
  }

  completeGoal(byRole: Role, id: string): Result<Goal> {
    const goal = this.state.goals.find((g) => g.id === id);
    if (!goal) return fail('这个目标不存在');
    goal.done = !goal.done;
    this.notify();
    return ok(goal);
  }

  // =========================================================================
  // 模块3 关怀提醒 / 计划记录可见性
  // =========================================================================

  addCareReminder(
    byRole: Role,
    kind: 'water' | 'medicine' | 'rest',
    time: string,
    note: string,
  ): Result<null> {
    if (!/^\d{1,2}:\d{2}$/.test(time)) return fail('时间格式应为 HH:mm');
    this.state.careReminders.push({
      id: uid('remind'),
      ownerRole: byRole,
      kind,
      time,
      enabled: true,
      note: note.trim().slice(0, 60),
      visibleToPartner: false,
    });
    this.logActivity(byRole, 'add', 'careReminder', '关怀提醒', time);
    this.notify();
    return ok(null);
  }

  toggleCareReminder(byRole: Role, id: string): Result<null> {
    const r = this.state.careReminders.find((x) => x.id === id);
    if (!r) return fail('这个提醒不存在');
    if (r.ownerRole !== byRole) return fail('只能修改自己的提醒');
    r.enabled = !r.enabled;
    this.notify();
    return ok(null);
  }

  setCareReminderVisibility(byRole: Role, id: string, visible: boolean): Result<null> {
    const r = this.state.careReminders.find((x) => x.id === id);
    if (!r) return fail('这个提醒不存在');
    if (r.ownerRole !== byRole) return fail('只能设置自己的提醒');
    r.visibleToPartner = visible;
    this.audit(byRole, 'consent', `提醒可见性：${visible ? '对 TA 可见' : '仅我可见'}`);
    this.notify();
    return ok(null);
  }

  /** 3.10 计划记录：默认私密，需本人单独开权限伴侣才可见 */
  togglePlanLogShare(byRole: Role): Result<boolean> {
    const data = this.state.period[byRole];
    /*
     * 以前这里要求"先把经期可见范围设为完全共享"才能共享计划记录 ——
     * 但男方根本没有经期记录、也就永远看不到那个开关，于是他**永远无法**把自己的
     * 计划记录共享给伴侣（用户反馈："男方的授权怎么没有显示"）。
     * 计划记录是每个人自己的数据，共享与否只取决于本人，和经期档位无关。
     */
    data.sharePlanLog = !data.sharePlanLog;
    this.audit(byRole, 'consent', `计划记录：${data.sharePlanLog ? '共享' : '仅我可见'}`);
    this.notify();
    return ok(data.sharePlanLog);
  }

  // =========================================================================
  // 3.x「我希望被这样照顾」：自己维护，伴侣只读照做
  // =========================================================================
  /**
   * 加一条。只有本人能往自己的清单里写，谁也不预置。
   * 上限 12 条：清单要能真的被照做，太长就变成没人看的许愿池。
   */
  addComfortItem(byRole: Role, text: string): Result<ComfortItem> {
    const clean = text.trim().slice(0, 40);
    if (!clean) return fail('写点什么吧，比如「给我倒杯热水」');
    const list = this.state.comfort[byRole];
    if (list.length >= 12) return fail('最多 12 条，先把不需要的删掉几条');
    if (list.some((i) => i.text === clean)) return fail('这条已经写过了');
    const item: ComfortItem = { id: uid('comfort'), text: clean, createdAt: this.now() };
    list.push(item);
    // 不带内容：清单里可能写着身体相关的事，提醒只说到"清单"这一层
    this.logActivity(byRole, 'add', 'comfort', '照顾清单');
    this.notify();
    return ok(item);
  }

  /** 删一条：只能删自己的 */
  removeComfortItem(byRole: Role, id: string): Result<null> {
    const list = this.state.comfort[byRole];
    const idx = list.findIndex((i) => i.id === id);
    if (idx < 0) return fail('这条不在你的清单里');
    list.splice(idx, 1);
    this.logActivity(byRole, 'delete', 'comfort', '照顾清单');
    this.notify();
    return ok(null);
  }

  /**
   * 照着 TA 的清单做一件：只能挑**对方**清单里的条目。
   * 这是一次真实的动作（会给对方发一条中性通知），不是本地提示。
   */
  sendCareAction(byRole: Role, itemId: string): Result<null> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const partner: Role = byRole === 'A' ? 'B' : 'A';
    const item = this.state.comfort[partner].find((i) => i.id === itemId);
    if (!item) return fail('这条不在 TA 的清单里');
    // 通知文案固定中性：绝不把清单原文塞进锁屏（清单里可能写着身体相关的事）
    this.pushNotification(partner, 'careAction', MASK.careAction);
    this.audit(byRole, 'care', `照 TA 的清单做了一件（${item.text.slice(0, 20)}）`);
    this.notify();
    return ok(null);
  }

  /**
   * 催一下 TA（观影等待、掉线等待时用）。
   * 以前这里只是前端弹个 Toast，什么都没发出去——现在真的推一条，并且限流 3 分钟。
   */
  nudgePartner(byRole: Role): Result<null> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const partner: Role = byRole === 'A' ? 'B' : 'A';
    const now = this.now();
    const WAIT_MS = 3 * 60 * 1000;
    const last = this.lastNudgeAt[byRole];
    if (last > 0 && now - last < WAIT_MS) {
      const left = Math.ceil((WAIT_MS - (now - last)) / 1000);
      return fail(`刚催过了，${left} 秒后才能再催一次`);
    }
    this.lastNudgeAt[byRole] = now;
    this.pushNotification(partner, 'nudge', MASK.remindPartner);
    this.notify();
    return ok(null);
  }

  /**
   * 给 TA 的习惯打气（不能替对方打卡，只能鼓励）。
   * 同样是真的推一条，而不是本地 Toast。
   */
  cheerHabit(byRole: Role, habitId: string): Result<null> {
    const habit = this.state.habits.find((h) => h.id === habitId);
    if (!habit) return fail('这个习惯不存在');
    if (habit.createdBy === byRole) return fail('给自己打气这件事……自己知道就好');
    const partner: Role = byRole === 'A' ? 'B' : 'A';
    this.pushNotification(partner, 'cheer', MASK.cheerHabit);
    this.notify();
    return ok(null);
  }

  // =========================================================================
  // 模块4 情感互动
  // =========================================================================

  sendCard(
    byRole: Role,
    kind: CardKind,
    text: string,
    detail = '',
    meta = '',
  ): Result<Card> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!text.trim()) return fail('写一句话再发吧');
    const card: Card = {
      id: uid('card'),
      kind,
      from: byRole,
      text: text.trim().slice(0, 120),
      detail: detail.trim().slice(0, 120),
      meta,
      at: this.now(),
      replies: [],
      accepted: false,
    };
    this.state.cards.unshift(card);
    // 卡片本身就是"TA 给我发了个东西"，动态里也要留一笔
    this.logActivity(byRole, 'add', 'card', CARD_KIND_LABEL[kind] ?? '卡片', card.text.slice(0, 18));
    if (kind === 'calm') {
      this.pushNotification(byRole === 'A' ? 'B' : 'A', 'emotion', MASK.careHint);
    } else if (kind === 'hug') {
      // 抱抱卡：真的推一条出去，锁屏只说收到卡片，不带正文
      this.pushNotification(byRole === 'A' ? 'B' : 'A', 'card', MASK.cardFromPartner);
    }
    this.notify();
    return ok(card);
  }

  replyCard(byRole: Role, id: string, text: string): Result<Card> {
    const card = this.state.cards.find((c) => c.id === id);
    if (!card) return fail('这张卡片不存在');
    const clean = text.trim().slice(0, 80);
    if (!clean) return fail('写一句再回');
    // 同一个人的同一句话只记一条：不然"回一句"可以无限点，卡片列表会被刷屏
    if (card.replies.some((r) => r.role === byRole && r.text === clean)) {
      return fail('这句已经回过了');
    }
    card.replies.push({ role: byRole, text: clean, at: this.now() });
    this.notify();
    return ok(card);
  }

  /**
   * 收下卡片（点「收到啦」）。
   *
   * 以前这里只是把 `accepted` 置 true，既没拦重复也没有任何校验：
   * 界面上按钮还在，用户可以无限点，每次都说"接受成功"。
   * 现在：只有收卡人能收、收过就不能再收，并给对方推一条「TA 收下了」。
   */
  acceptCard(byRole: Role, id: string): Result<Card> {
    const card = this.state.cards.find((c) => c.id === id);
    if (!card) return fail('这张卡片不存在');
    if (card.from === byRole) return fail('这张卡是你发的，等 TA 收下');
    if (card.accepted) return fail('这张卡你已经收下过了');
    card.accepted = true;
    card.acceptedAt = this.now();
    card.acceptedBy = byRole;
    this.pushNotification(card.from, 'card', MASK.cardAccepted);
    this.logActivity(byRole, 'done', 'card', CARD_KIND_LABEL[card.kind] ?? '卡片', card.text.slice(0, 18));
    this.notify();
    return ok(card);
  }

  /** 4.2 每日一问：按日期轮换，双方都答完才互见 */
  /**
   * 每日一问：**同一个 Space 内不重复**。
   * 按顺序取还没用过的题；全部用完才重置一遍，保证短期内不会撞题。
   */
  ensureDailyQuestion(): DailyQuestion {
    const day = todayISO(this.now());
    if (this.state.dailyQuestion && this.state.dailyQuestion.day === day) {
      return this.state.dailyQuestion;
    }
    let pool = DAILY_QUESTIONS.filter((q) => !this.state.quizUsed.includes(q));
    if (pool.length === 0) {
      this.state.quizUsed = [];
      pool = [...DAILY_QUESTIONS];
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    this.state.quizUsed.push(picked);
    this.state.dailyQuestion = { day, question: picked, answers: {} };
    return this.state.dailyQuestion;
  }

  answerDailyQuestion(byRole: Role, text: string): Result<null> {
    const q = this.ensureDailyQuestion();
    if (!text.trim()) return fail('写一句再提交');
    q.answers[byRole] = text.trim().slice(0, 120);
    this.notify();
    return ok(null);
  }

  addVoiceNote(byRole: Role, uri: string, durationSec: number, deliverAt: number | null): Result<VoiceNote> {
    if (!uri) return fail('没有录到声音');
    if (durationSec <= 0 || durationSec > 60) return fail('语音需要 1–60 秒');
    const note: VoiceNote = {
      id: uid('voice'),
      from: byRole,
      durationSec: Math.round(durationSec),
      uri,
      deliverAt,
      listenedAt: null,
      at: this.now(),
    };
    this.state.voiceNotes.unshift(note);
    this.logActivity(byRole, 'add', 'voiceNote', '语音留言', `时长约 ${note.durationSec} 秒`);
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'emotion', MASK.voiceNote);
    this.notify();
    return ok(note);
  }

  markVoiceListened(byRole: Role, id: string): Result<null> {
    const note = this.state.voiceNotes.find((v) => v.id === id);
    if (!note) return fail('这条语音不存在');
    note.listenedAt = this.now();
    this.notify();
    return ok(null);
  }

  addDiaryEntry(byRole: Role, text: string): Result<DiaryEntry> {
    if (!text.trim()) return fail('写点什么');
    const day = todayISO(this.now());
    const existing = this.state.diary.find(
      (d) => d.body[byRole] === undefined && todayISO(d.createdAt) === day,
    );
    let entry: DiaryEntry;
    if (existing) {
      entry = existing;
    } else {
      entry = {
        id: uid('diary'),
        body: {},
        createdAt: this.now(),
        updatedAt: this.now(),
        editedAt: {},
      };
      this.state.diary.unshift(entry);
    }
    entry.body[byRole] = text.trim().slice(0, 500);
    entry.updatedAt = this.now();
    // 日记的标题就用正文开头那几个字（提示框里「TA 新增了日记「今天……」」）
    this.logActivity(byRole, 'add', 'diary', '日记', text.trim().slice(0, 18));
    this.notify();
    return ok(entry);
  }

  /**
   * 日记不能撤回（写了就是写了），但可以改错别字。
   * 只能改自己那一段；对方的段落一个字都动不了。
   */
  editDiaryEntry(byRole: Role, id: string, text: string): Result<DiaryEntry> {
    const entry = this.state.diary.find((d) => d.id === id);
    if (!entry) return fail('这篇日记不存在');
    if (entry.body[byRole] === undefined) return fail('这篇文章里没有你的段落');
    if (!text.trim()) return fail('内容不能为空（要删就保留原文）');
    entry.body[byRole] = text.trim().slice(0, 500);
    entry.updatedAt = this.now();
    entry.editedAt = { ...entry.editedAt, [byRole]: this.now() };
    this.logActivity(byRole, 'update', 'diary', '日记', text.trim().slice(0, 18));
    this.notify();
    return ok(entry);
  }

  submitWeeklyReview(byRole: Role, happy: string, trouble: string, want: string): Result<WeeklyReview> {
    const weekKey = weekKeyOf(this.now());
    let review = this.state.weeklyReviews.find((r) => r.weekKey === weekKey);
    if (!review) {
      review = { id: uid('review'), weekKey, answers: {}, at: this.now() };
      this.state.weeklyReviews.unshift(review);
    }
    review.answers[byRole] = {
      happy: happy.trim().slice(0, 120),
      trouble: trouble.trim().slice(0, 120),
      want: want.trim().slice(0, 120),
    };
    review.at = this.now();
    this.logActivity(byRole, 'add', 'weeklyReview', '周复盘', weekKey);
    this.notify();
    return ok(review);
  }

  addTimelineNode(byRole: Role, title: string, date: string, note: string, emoji: string): Result<TimelineNode> {
    if (!title.trim()) return fail('给这个节点起个名字');
    const node: TimelineNode = {
      id: uid('node'),
      title: title.trim().slice(0, 40),
      date,
      note: note.trim().slice(0, 120),
      emoji: emoji || '💗',
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.timeline.push(node);
    this.state.timeline.sort((a, b) => (a.date < b.date ? -1 : 1));
    this.logActivity(byRole, 'add', 'timeline', '时间线', node.title);
    this.notify();
    return ok(node);
  }

  // =========================================================================
  // 模块5 情侣电影院：预约 / 选片 / 虚拟影院 / 语音 / 回忆截图
  // =========================================================================

  addWatchPlan(byRole: Role, movieTitle: string, date: string, startMin: number): Result<WatchPlan> {
    if (!movieTitle.trim()) return fail('片名不能为空');
    const plan: WatchPlan = {
      id: uid('watch'),
      movieTitle: movieTitle.trim().slice(0, 40),
      date,
      startMin,
      confirmedBy: [byRole],
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.watchPlans.unshift(plan);
    this.logActivity(byRole, 'add', 'watchPlan', '观影预约', plan.movieTitle);
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'cinema', MASK.roomInvite);
    this.notify();
    return ok(plan);
  }

  confirmWatchPlan(byRole: Role, id: string): Result<WatchPlan> {
    const plan = this.state.watchPlans.find((p) => p.id === id);
    if (!plan) return fail('这个预约不存在');
    if (!plan.confirmedBy.includes(byRole)) plan.confirmedBy.push(byRole);
    if (plan.confirmedBy.length === 2) {
      const exists = this.state.events.some(
        (e) => e.category === 'movie' && e.date === plan.date && e.title.includes(plan.movieTitle),
      );
      if (!exists) {
        this.addEvent(plan.createdBy, {
          title: `一起看电影：${plan.movieTitle}`,
          date: plan.date,
          startMin: plan.startMin,
          endMin: Math.min(1439, plan.startMin + 150),
          category: 'movie',
          visibility: 'shared',
        });
      }
    }
    this.notify();
    return ok(plan);
  }

  deleteWatchPlan(byRole: Role, id: string): Result<null> {
    const plan = this.state.watchPlans.find((p) => p.id === id);
    if (!plan) return fail('这个预约不存在');
    this.state.watchPlans = this.state.watchPlans.filter((p) => p.id !== id);
    this.logActivity(byRole, 'delete', 'watchPlan', '观影预约', plan.movieTitle);
    this.notify();
    return ok(null);
  }

  startPickSession(byRole: Role, candidates: string[]): Result<PickSession> {
    const list = candidates.map((c) => c.trim()).filter((c) => c.length > 0).slice(0, 12);
    if (list.length < 2) return fail('至少要有 2 个候选');
    const session: PickSession = {
      id: uid('pick'),
      candidates: list,
      picks: { A: {}, B: {} },
      createdAt: this.now(),
      finished: false,
    };
    this.state.pickSession = session;
    this.notify();
    return ok(session);
  }

  pickMovie(byRole: Role, title: string, verdict: 'like' | 'nope'): Result<PickSession | null> {
    const session = this.state.pickSession;
    if (!session) return fail('还没有进行中的选片');
    if (!session.candidates.includes(title)) return fail('不在候选里');
    session.picks[byRole][title] = verdict;
    const done = session.candidates.every(
      (c) => session.picks.A[c] !== undefined && session.picks.B[c] !== undefined,
    );
    session.finished = done;
    this.notify();
    return ok(session);
  }

  /** 共同想看：双方都点了 like，按双方都喜欢的顺序返回 */
  pickMatches(): string[] {
    const session = this.state.pickSession;
    if (!session) return [];
    return session.candidates.filter(
      (c) => session.picks.A[c] === 'like' && session.picks.B[c] === 'like',
    );
  }

  clearPickSession(byRole: Role): Result<null> {
    this.state.pickSession = null;
    this.notify();
    return ok(null);
  }

  toggleScene(byRole: Role, key: 'popcorn' | 'cat' | 'blanket'): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    room.scene[key] = !room.scene[key];
    room.scene.updatedBy = byRole;
    room.scene.updatedAt = this.now();
    this.notify();
    return ok(null);
  }

  // ---- 5.8 语音通话：空间级（首页 / 影院房间共用同一条通话） ----

  /** RTC 频道名由 spaceId 派生：不管从哪个入口发起，两端加入的都是同一个频道 */
  voiceChannelName(): string {
    const tail = this.state.spaceId.replace(/[^a-zA-Z0-9]/g, '').slice(-16);
    return `twospace_${tail}`;
  }

  /** 发起语音：任何时候都能发起，不依赖是否有观影房间 */
  startVoiceInvite(byRole: Role): Result<null> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const v = this.state.voice;
    if (v.status === 'connected') return fail('语音已经接通了');
    if (v.status === 'inviting' && v.byRole === byRole) return fail('已经发出邀请了，等 TA 接就行');
    if (v.status === 'inviting' && v.byRole !== byRole) return fail('TA 正在邀请你，直接同意即可');
    this.state.voice = {
      ...emptyVoice(),
      status: 'inviting',
      byRole,
      invitedAt: this.now(),
    };
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'voice', MASK.voiceInvite);
    this.notify();
    return ok(null);
  }

  acceptVoiceInvite(byRole: Role): Result<null> {
    const v = this.state.voice;
    if (v.status !== 'inviting') return fail('没有待接受的语音邀请');
    if (v.byRole === byRole) return fail('不能自己接受自己的邀请');
    v.status = 'connected';
    v.startedAt = this.now();
    v.invitedAt = null;
    v.textOnly = false;
    this.audit(byRole, 'voice', '接通语音');
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'voice', MASK.voiceConnected);
    this.notify();
    return ok(null);
  }

  declineVoiceInvite(byRole: Role): Result<null> {
    const v = this.state.voice;
    if (v.status !== 'inviting') return fail('没有待处理的语音邀请');
    this.state.voice = { ...emptyVoice(), status: 'declined', byRole: v.byRole };
    this.notify();
    return ok(null);
  }

  setVoiceMuted(byRole: Role, muted: boolean): Result<null> {
    const v = this.state.voice;
    if (v.status !== 'connected') return fail('语音还没接通');
    v.muted[byRole] = muted;
    this.notify();
    return ok(null);
  }

  setVoiceSpeaker(byRole: Role, speaker: boolean): Result<null> {
    const v = this.state.voice;
    if (v.status !== 'connected') return fail('语音还没接通');
    v.speaker[byRole] = speaker;
    this.notify();
    return ok(null);
  }

  setVoiceVolume(byRole: Role, volume: number): Result<null> {
    const v = this.state.voice;
    if (v.status !== 'connected') return fail('语音还没接通');
    v.volume[byRole] = Math.max(0, Math.min(100, Math.round(volume)));
    this.notify();
    return ok(null);
  }

  switchToTextOnly(byRole: Role): Result<null> {
    const v = this.state.voice;
    if (v.status !== 'connected' && v.status !== 'inviting') return fail('当前没有进行中的语音');
    v.textOnly = true;
    v.status = 'ended';
    v.invitedAt = null;
    this.audit(byRole, 'voice', '切换为仅文字互动');
    this.notify();
    return ok(null);
  }

  endVoice(byRole: Role): Result<null> {
    const v = this.state.voice;
    if (v.status === 'idle' || v.status === 'ended') return fail('当前没有进行中的语音');
    this.state.voice = { ...emptyVoice(), status: 'ended', byRole };
    this.audit(byRole, 'voice', '结束语音');
    this.notify();
    return ok(null);
  }

  addRecapScreenshot(byRole: Role, uri: string): Result<null> {
    const room = this.activeRoom();
    if (!room) return fail('没有进行中的房间');
    if (!room.recap) return fail('还没有观影记录');
    if (room.recap.screenshots.length >= 3) return fail('最多 3 张截图');
    room.recap.screenshots.push(uri);
    this.logActivity(byRole, 'add', 'screenshot', '观影截图');
    this.notify();
    return ok(null);
  }

  // =========================================================================
  // 模块7 关系成长 / 未来规划 / 冲突修复 / 信任与安全
  // =========================================================================

  saveRelProfile(
    byRole: Role,
    input: { meetMethod: string; firstDate: string; stage: RelStage; milestones: string[] },
  ): Result<null> {
    const p = this.state.relProfile;
    p.meetMethod = input.meetMethod.trim().slice(0, 60);
    p.firstDate = input.firstDate;
    p.stage = input.stage;
    p.milestones = input.milestones.slice(0, 20);
    if (!p.submittedBy.includes(byRole)) p.submittedBy.push(byRole);
    p.confirmedBy = p.confirmedBy.filter((r) => r !== byRole);
    p.updatedAt = this.now();
    this.audit(byRole, 'rel-profile', '提交关系档案');
    this.notify();
    return ok(null);
  }

  confirmRelProfile(byRole: Role): Result<null> {
    const p = this.state.relProfile;
    if (p.submittedBy.length < 2) return fail('双方都提交后才能确认');
    if (!p.confirmedBy.includes(byRole)) p.confirmedBy.push(byRole);
    this.notify();
    return ok(null);
  }

  saveValuesDraft(byRole: Role, topic: ValuesTopic, text: string): Result<null> {
    const v = this.state.valuesCard;
    if (v.revealed) return fail('已经揭示过，不能再修改草稿');
    const mine = v.drafts[byRole] ?? {};
    mine[topic] = text.trim().slice(0, 200);
    v.drafts[byRole] = mine;
    this.notify();
    return ok(null);
  }

  scheduleValuesTalk(byRole: Role, at: number): Result<null> {
    this.state.valuesCard.scheduledAt = at;
    this.notify();
    return ok(null);
  }

  /** 双方都写完才允许揭示，避免被对方答案带跑 */
  revealValues(byRole: Role): Result<null> {
    const v = this.state.valuesCard;
    const aReady = Object.keys(v.drafts.A ?? {}).length > 0;
    const bReady = Object.keys(v.drafts.B ?? {}).length > 0;
    if (!aReady || !bReady) return fail('双方都写完才能揭示');
    v.revealed = true;
    this.audit(byRole, 'values', '揭示价值观草案');
    this.notify();
    return ok(null);
  }

  saveValuesConsensus(byRole: Role, text: string): Result<null> {
    if (!this.state.valuesCard.revealed) return fail('尚未揭示');
    this.state.valuesCard.consensus = text.trim().slice(0, 300);
    this.notify();
    return ok(null);
  }

  addPlanItem(
    byRole: Role,
    input: { title: string; targetDate: string | null; owners: Role[]; notes: string },
  ): Result<PlanItem> {
    if (!input.title.trim()) return fail('目标名称不能为空');
    const item: PlanItem = {
      id: uid('plan'),
      title: input.title.trim().slice(0, 40),
      stage: 'discuss',
      targetDate: input.targetDate,
      owners: input.owners.length > 0 ? input.owners : [byRole],
      notes: input.notes.trim().slice(0, 200),
      confirmedBy: [],
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.plans.push(item);
    this.logActivity(byRole, 'add', 'plan', '共同计划', item.title);
    this.notify();
    return ok(item);
  }

  confirmPlanItem(byRole: Role, id: string): Result<PlanItem> {
    const item = this.state.plans.find((p) => p.id === id);
    if (!item) return fail('这个目标不存在');
    if (!item.confirmedBy.includes(byRole)) item.confirmedBy.push(byRole);
    if (item.confirmedBy.length === 2) item.stage = 'confirmed';
    this.notify();
    return ok(item);
  }

  setPlanStage(byRole: Role, id: string, stage: PlanItem['stage']): Result<PlanItem> {
    const item = this.state.plans.find((p) => p.id === id);
    if (!item) return fail('这个目标不存在');
    item.stage = stage;
    this.notify();
    return ok(item);
  }

  deletePlanItem(byRole: Role, id: string): Result<null> {
    const item = this.state.plans.find((p) => p.id === id);
    if (!item) return fail('这个目标不存在');
    this.state.plans = this.state.plans.filter((p) => p.id !== id);
    this.logActivity(byRole, 'delete', 'plan', '共同计划', item.title);
    this.notify();
    return ok(null);
  }

  addBoundary(byRole: Role, category: BoundaryCategory, text: string): Result<BoundaryItem> {
    if (!text.trim()) return fail('写一条具体的约定');
    const item: BoundaryItem = {
      id: uid('bound'),
      category,
      text: text.trim().slice(0, 120),
      agreements: {},
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.boundaries.push(item);
    this.logActivity(byRole, 'add', 'boundary', '关系约定', item.text.slice(0, 18));
    this.notify();
    return ok(item);
  }

  setBoundaryAgreement(byRole: Role, id: string, value: 'agree' | 'change'): Result<BoundaryItem> {
    const item = this.state.boundaries.find((b) => b.id === id);
    if (!item) return fail('这条约定不存在');
    item.agreements[byRole] = value;
    this.notify();
    return ok(item);
  }

  deleteBoundary(byRole: Role, id: string): Result<null> {
    const item = this.state.boundaries.find((b) => b.id === id);
    if (!item) return fail('这条约定不存在');
    this.state.boundaries = this.state.boundaries.filter((b) => b.id !== id);
    this.logActivity(byRole, 'delete', 'boundary', '关系约定', item.text.slice(0, 18));
    this.notify();
    return ok(null);
  }

  startConflict(byRole: Role, trigger: string): Result<ConflictEntry> {
    if (!trigger.trim()) return fail('先写下发生了什么');
    const entry: ConflictEntry = {
      id: uid('conflict'),
      trigger: trigger.trim().slice(0, 160),
      feelings: {},
      needs: {},
      calmUsed: false,
      apology: {},
      ritual: '',
      stage: 1,
      resolvedAt: null,
      createdAt: this.now(),
    };
    this.state.conflicts.unshift(entry);
    this.logActivity(byRole, 'add', 'conflict', '冲突记录', entry.trigger.slice(0, 18));
    this.notify();
    return ok(entry);
  }

  setConflictField(
    byRole: Role,
    id: string,
    field: 'feelings' | 'needs' | 'apology',
    text: string,
  ): Result<ConflictEntry> {
    const entry = this.state.conflicts.find((c) => c.id === id);
    if (!entry) return fail('这条冲突记录不存在');
    entry[field][byRole] = text.trim().slice(0, 160);
    entry.stage = Math.max(entry.stage, field === 'feelings' ? 2 : field === 'needs' ? 3 : 4);
    this.notify();
    return ok(entry);
  }

  markConflictCalm(byRole: Role, id: string): Result<ConflictEntry> {
    const entry = this.state.conflicts.find((c) => c.id === id);
    if (!entry) return fail('这条冲突记录不存在');
    entry.calmUsed = true;
    entry.stage = Math.max(entry.stage, 2);
    this.sendCard(byRole, 'calm', '我需要先缓一下', '冷静卡来自冲突修复流程', 'space');
    this.notify();
    return ok(entry);
  }

  resolveConflict(byRole: Role, id: string, ritual: string): Result<ConflictEntry> {
    const entry = this.state.conflicts.find((c) => c.id === id);
    if (!entry) return fail('这条冲突记录不存在');
    if (!entry.feelings.A || !entry.feelings.B) return fail('双方都写下感受后才能收尾');
    entry.ritual = ritual.trim().slice(0, 60);
    entry.stage = 5;
    entry.resolvedAt = this.now();
    this.notify();
    return ok(entry);
  }

  /** 7.7 关系健康自评：只写自己的，对方永远拿不到（不进 snapshot 的 partner 字段） */
  saveSelfAssess(
    byRole: Role,
    input: { satisfaction: number; security: number; communication: number; fairness: number },
  ): Result<null> {
    const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
    const current: SelfAssessmentLike = {
      satisfaction: clamp(input.satisfaction),
      security: clamp(input.security),
      communication: clamp(input.communication),
      fairness: clamp(input.fairness),
      at: this.now(),
      history: [],
    };
    const prev = this.state.selfAssess[byRole];
    if (prev) {
      current.history = [
        ...prev.history,
        {
          at: prev.at,
          satisfaction: prev.satisfaction,
          security: prev.security,
          communication: prev.communication,
          fairness: prev.fairness,
        },
      ].slice(-12);
    }
    this.state.selfAssess[byRole] = current;
    this.audit(byRole, 'self-assess', '更新了一次自评（不共享）');
    this.notify();
    return ok(null);
  }

  createVote(
    byRole: Role,
    title: string,
    options: string[],
    anonymous: boolean,
    deadline: number | null,
  ): Result<Vote> {
    if (!title.trim()) return fail('给这个投票起个名字');
    const opts = options.map((o) => o.trim()).filter(Boolean).slice(0, 5);
    if (opts.length < 2) return fail('至少 2 个选项');
    const vote: Vote = {
      id: uid('vote'),
      title: title.trim().slice(0, 40),
      options: opts.map((label, i) => ({ id: `o${i + 1}`, label })),
      votes: {},
      anonymous,
      deadline,
      createdAt: this.now(),
      createdBy: byRole,
    };
    this.state.votes.unshift(vote);
    this.logActivity(byRole, 'add', 'vote', '投票', vote.title);
    this.notify();
    return ok(vote);
  }

  castVote(byRole: Role, id: string, optionId: string): Result<Vote> {
    const vote = this.state.votes.find((v) => v.id === id);
    if (!vote) return fail('这个投票不存在');
    /*
     * 截止时间以前只是存着、从来不校验：过了期还能继续投，票数一直在变。
     */
    if (vote.deadline !== null && this.now() > vote.deadline) return fail('这个投票已经结束了');
    if (!vote.options.some((o) => o.id === optionId)) return fail('没有这个选项');
    vote.votes[byRole] = optionId;
    this.logActivity(byRole, 'done', 'vote', '投票', vote.title);
    this.notify();
    return ok(vote);
  }

  setLdr(byRole: Role, patch: Partial<LdrPlan>): Result<LdrPlan> {
    Object.assign(this.state.ldr, patch);
    this.notify();
    return ok(this.state.ldr);
  }

  // ---- 在线片库接口：只由一个人管理，两个人共用同一份 ----

  /**
   * 设置片库接口。只有"管理者"能改。
   *
   * 第一次设置的人自动成为管理者（谁先配谁管），之后另一侧只读。
   * 想换人管就显式交接（transferCmsManager），避免两个人在各自手机上互相覆盖。
   */
  setCmsApis(byRole: Role, rawApis: string[]): Result<CmsSourceConfig> {
    const apis = Array.from(
      new Set(
        (Array.isArray(rawApis) ? rawApis : [])
          .map((a) => String(a ?? '').trim())
          .filter((a) => /^https?:\/\//i.test(a)),
      ),
    ); // 不设上限：用户要求"想加多少加多少"（界面自己会滚动）
    if (apis.length === 0) return fail('至少留一个 http(s) 接口地址');
    const cms = this.state.cms;
    const claimed = cms.updatedAt === 0 && cms.apis.length === 0;
    if (!claimed && cms.manager !== byRole) {
      return fail('片库接口由 TA 管理，你这边只能用 TA 配好的');
    }
    this.state.cms = {
      apis,
      manager: claimed ? byRole : cms.manager,
      updatedAt: this.now(),
      updatedBy: byRole,
    };
    this.logActivity(byRole, 'update', 'cms', '片库接口', `${apis.length} 个`);
    this.notify();
    return ok(this.state.cms);
  }

  /** 把管理权交给对方（只有现任管理者能交） */
  transferCmsManager(byRole: Role, to: Role): Result<CmsSourceConfig> {
    if (byRole === to) return fail('管理权已经在你这里了');
    if (this.state.cms.manager !== byRole) return fail('只有现在的管理者才能交接');
    this.state.cms = {
      ...this.state.cms,
      manager: to,
      updatedAt: this.now(),
      updatedBy: byRole,
    };
    this.logActivity(byRole, 'update', 'cms', '片库接口管理权', '交给 TA');
    this.notify();
    return ok(this.state.cms);
  }

  // ---- 电视直播源：和片库接口同一套规则，一人管理、两人共用 ----

  /**
   * 设置直播源地址列表。规则和片库接口完全一致：
   * 第一次配置的人自动成为管理者，之后只有他能改，另一方只读。
   */
  setLiveSourceUrls(byRole: Role, rawUrls: string[]): Result<LiveSourceConfig> {
    const urls = Array.from(
      new Set(
        (Array.isArray(rawUrls) ? rawUrls : [])
          .map((u) => String(u ?? '').trim())
          .filter((u) => /^https?:\/\//i.test(u)),
      ),
    );
    const live = this.state.live;
    const claimed = live.updatedAt === 0 && live.urls.length === 0;
    // 允许清空（比如对方把源全删了），但只有管理者能操作
    if (!claimed && live.manager !== byRole) {
      return fail('直播源由 TA 管理，你这边只能用 TA 配好的');
    }
    this.state.live = {
      urls,
      manager: claimed ? byRole : live.manager,
      updatedAt: this.now(),
      updatedBy: byRole,
    };
    this.logActivity(byRole, 'update', 'cms', '直播源', `${urls.length} 个`);
    this.notify();
    return ok(this.state.live);
  }

  /** 把直播源管理权交给对方 */
  transferLiveManager(byRole: Role, to: Role): Result<LiveSourceConfig> {
    if (byRole === to) return fail('管理权已经在你这里了');
    if (this.state.live.manager !== byRole) return fail('只有现在的管理者才能交接');
    this.state.live = {
      ...this.state.live,
      manager: to,
      updatedAt: this.now(),
      updatedBy: byRole,
    };
    this.logActivity(byRole, 'update', 'cms', '直播源管理权', '交给 TA');
    this.notify();
    return ok(this.state.live);
  }

  /**
   * 只给「本机单人模式」用的兜底：把直播源管理权直接收回到 byRole 名下。
   *
   * 服务端永远不下发这个能力（线上必须走 transferLiveManager、由对方点同意）。
   * 存在的理由是真实事故：历史存档里的管理权可能挂在另一个槽位名下，
   * 而单人模式（没连服务器）没有对方可以交接，于是 setLiveSourceUrls 一律失败，
   * 用户看到的就是「点了删除，界面一动不动，也没有任何报错」。
   */
  claimLiveManagerLocal(byRole: Role): void {
    if (this.state.live.manager === byRole) return;
    this.state.live = {
      ...this.state.live,
      manager: byRole,
      updatedAt: this.now(),
      updatedBy: byRole,
    };
    this.notify();
  }

  /**
   * 同上，片库接口版本。
   */
  claimCmsManagerLocal(byRole: Role): void {
    if (!this.state.cms || this.state.cms.manager === byRole) return;
    this.state.cms = {
      ...this.state.cms,
      manager: byRole,
      updatedAt: this.now(),
      updatedBy: byRole,
    };
    this.notify();
  }

  // ---- 7.14 信任与安全报备：默认关闭、单次授权、无轨迹 ----

  setTrust(byRole: Role, patch: Partial<TrustSettings>): Result<TrustSettings> {
    Object.assign(this.state.trust, patch);
    if (patch.locationShareUntil !== undefined && patch.locationShareUntil === null) {
      this.state.safety.unshift({
        id: uid('safe'),
        kind: 'location-off',
        byRole,
        at: this.now(),
        expiresAt: null,
        label: '已停止位置共享',
      });
    }
    this.audit(byRole, 'trust', `更新安全设置：${JSON.stringify(patch)}`);
    this.notify();
    return ok(this.state.trust);
  }

  requestArrived(byRole: Role): Result<null> {
    this.state.safety.unshift({
      id: uid('safe'),
      kind: 'arrived',
      byRole,
      at: this.now(),
      expiresAt: null,
      label: '已安全到家',
    });
    this.pushNotification(byRole === 'A' ? 'B' : 'A', 'safety', MASK.arrived);
    this.notify();
    return ok(null);
  }

  /** 单次位置共享：到期自动失效，不落历史轨迹 */
  startLocationOnce(byRole: Role, minutes: number, label: string): Result<null> {
    const mins = Math.max(5, Math.min(120, Math.round(minutes)));
    const until = this.now() + mins * 60 * 1000;
    this.state.trust.locationShareUntil = until;
    this.state.trust.shareWith = [byRole === 'A' ? 'B' : 'A'];
    this.state.safety.unshift({
      id: uid('safe'),
      kind: 'location-once',
      byRole,
      at: this.now(),
      expiresAt: until,
      label: label.trim().slice(0, 40) || '在路上',
    });
    this.audit(byRole, 'trust', `单次共享位置 ${mins} 分钟`);
    this.notify();
    return ok(null);
  }

  addIntimacyCard(byRole: Role, topic: string, content: string): Result<IntimacyCard> {
    if (!content.trim()) return fail('写点内容');
    const card: IntimacyCard = {
      id: uid('intim'),
      ownerRole: byRole,
      topic: topic.trim().slice(0, 20) || '边界',
      content: content.trim().slice(0, 200),
      shared: false,
      createdAt: this.now(),
    };
    this.state.intimacy.push(card);
    this.audit(byRole, 'intimacy', '新建一张私密卡（默认不共享）');
    this.notify();
    return ok(card);
  }

  shareIntimacyCard(byRole: Role, id: string, shared: boolean): Result<IntimacyCard> {
    const card = this.state.intimacy.find((c) => c.id === id);
    if (!card) return fail('这张卡不存在');
    if (card.ownerRole !== byRole) return fail('只能共享自己的卡');
    card.shared = shared;
    this.audit(byRole, 'intimacy', shared ? '主动共享一条' : '撤回共享');
    if (shared) this.logActivity(byRole, 'add', 'intimacy', '私密卡', card.topic);
    this.notify();
    return ok(card);
  }

  deleteIntimacyCard(byRole: Role, id: string): Result<null> {
    const card = this.state.intimacy.find((c) => c.id === id);
    if (!card) return fail('这张卡不存在');
    if (card.ownerRole !== byRole) return fail('只能删除自己的卡');
    this.state.intimacy = this.state.intimacy.filter((c) => c.id !== id);
    if (card.shared) this.logActivity(byRole, 'delete', 'intimacy', '私密卡', card.topic);
    this.notify();
    return ok(null);
  }

  addSocialReport(byRole: Role, place: string, people: string, eta: string): Result<SocialReport> {
    if (!this.state.trust.arrivedReport && this.state.socialReports.length === 0) {
      // 首次使用需要显式开启，避免"默认就在报备"
      return fail('请在设置里先开启「聚会报备」再使用');
    }
    const report: SocialReport = {
      id: uid('social'),
      byRole,
      place: place.trim().slice(0, 40),
      people: people.trim().slice(0, 60),
      eta: eta.trim().slice(0, 20),
      at: this.now(),
      withdrawn: false,
    };
    this.state.socialReports.unshift(report);
    this.logActivity(byRole, 'add', 'socialReport', '聚会报备', report.place);
    this.notify();
    return ok(report);
  }

  withdrawSocialReport(byRole: Role, id: string): Result<null> {
    const report = this.state.socialReports.find((r) => r.id === id);
    if (!report) return fail('这条报备不存在');
    if (report.byRole !== byRole) return fail('只能撤回自己的报备');
    report.withdrawn = true;
    this.logActivity(byRole, 'delete', 'socialReport', '聚会报备', report.place);
    this.notify();
    return ok(null);
  }

  // ---- 7.17 共享保险箱：逐条授权 + 查看留痕 ----

  addVaultItem(byRole: Role, label: string, secret: string): Result<VaultItem> {
    if (!label.trim() || !secret.trim()) return fail('名称和内容都要填');
    const item: VaultItem = {
      id: uid('vault'),
      ownerRole: byRole,
      label: label.trim().slice(0, 40),
      secret: secret.slice(0, 200),
      granted: [],
      views: [],
      createdAt: this.now(),
    };
    this.state.vault.push(item);
    this.audit(byRole, 'vault', `新建条目：${item.label}（未授权任何人）`);
    // 保险箱条目默认谁也不给看，动态里只说"存了一条"，不透露名称
    this.logActivity(byRole, 'add', 'vault', '保险箱条目');
    this.notify();
    return ok(item);
  }

  grantVaultAccess(byRole: Role, id: string, to: Role): Result<VaultItem> {
    const item = this.state.vault.find((v) => v.id === id);
    if (!item) return fail('这个条目不存在');
    if (item.ownerRole !== byRole) return fail('只有所有者可以授权');
    if (!item.granted.includes(to)) item.granted.push(to);
    this.audit(byRole, 'vault', `授权 ${to} 查看「${item.label}」`);
    this.notify();
    return ok(item);
  }

  revokeVaultAccess(byRole: Role, id: string, to: Role): Result<VaultItem> {
    const item = this.state.vault.find((v) => v.id === id);
    if (!item) return fail('这个条目不存在');
    if (item.ownerRole !== byRole) return fail('只有所有者可以撤回');
    item.granted = item.granted.filter((r) => r !== to);
    this.audit(byRole, 'vault', `撤回 ${to} 对「${item.label}」的权限`);
    this.notify();
    return ok(item);
  }

  /** 打开保险箱：需要所有者或被授权，且每次查看都留痕 */
  openVaultItem(byRole: Role, id: string): Result<string> {
    const item = this.state.vault.find((v) => v.id === id);
    if (!item) return fail('这个条目不存在');
    if (item.ownerRole !== byRole && !item.granted.includes(byRole)) return fail('你没有查看权限');
    item.views.push({ role: byRole, at: this.now() });
    this.audit(byRole, 'vault-view', `查看「${item.label}」`);
    this.notify();
    return ok(item.secret);
  }

  deleteVaultItem(byRole: Role, id: string): Result<null> {
    const item = this.state.vault.find((v) => v.id === id);
    if (!item) return fail('这个条目不存在');
    if (item.ownerRole !== byRole) return fail('只有所有者可以删除');
    this.state.vault = this.state.vault.filter((v) => v.id !== id);
    this.logActivity(byRole, 'delete', 'vault', '保险箱条目');
    this.notify();
    return ok(null);
  }

  updateWedding(byRole: Role, patch: Partial<Pick<WeddingPlanLike, 'budgetCents' | 'styles' | 'guests' | 'dates'>>): Result<null> {
    const w = this.state.wedding;
    if (w.ownerRole !== byRole && w.updatedAt !== 0) {
      // 首次写入者成为所有者
      if (w.ownerRole !== byRole && (w.styles.length > 0 || w.budgetCents > 0)) {
        return fail('这份计划属于 TA，需要 TA 共享后才能编辑');
      }
    }
    w.ownerRole = byRole;
    Object.assign(w, patch);
    w.updatedAt = this.now();
    this.notify();
    return ok(null);
  }

  shareWedding(byRole: Role, shared: boolean): Result<null> {
    const w = this.state.wedding;
    if (w.ownerRole !== byRole) return fail('只有所有者可以共享');
    w.sharedWithPartner = shared;
    w.updatedAt = this.now();
    this.notify();
    return ok(null);
  }

  // ---- 7.18 里程碑与双人成就（无排行榜） ----

  private syncAchievements(): void {
    const have = new Set(this.state.achievements.map((a) => a.id));
    const add = (id: string, label: string, emoji: string) => {
      if (have.has(id)) return;
      this.state.achievements.push({ id, label, emoji, unlockedAt: this.now() });
      have.add(id);
    };
    const recaps = Object.values(this.state.rooms).filter((r) => r.recap !== null).length;
    if (recaps >= 1) add('first-movie', '第一次一起看电影', '🎬');
    if (recaps >= 10) add('ten-movies', '一起看完 10 部', '🍿');
    const days = this.state.boundAt ? Math.floor((this.now() - this.state.boundAt) / 86400000) : 0;
    if (days >= 100) add('hundred-days', '在一起第 100 天', '💯');
    const thanks = this.state.cards.filter((c) => c.kind === 'thanks').length;
    if (thanks >= 10) add('thanks-10', '收到 10 张感谢卡', '💌');
    if (this.state.goals.some((g) => g.done)) add('goal-done', '共同目标达成', '🎯');
    if (this.state.collection.some((i) => i.kind === 'trip' && i.done)) {
      add('first-trip', '第一次旅行', '🧳');
    }
  }

  /**
   * 年度报告的缓存。
   *
   * 为什么需要：看片时 tick 每秒 notify 一次，每次 notify 给两个角色各做一份投影，
   * 而投影里的年度报告要对**每张卡片正文**做一次正则分词 + Map + 排序。
   * 片库/回忆攒到几百条之后，这份纯展示用的统计就成了每秒一次的重活（掉帧 + 耗电）。
   *
   * 缓存的失效条件是"数据签名变了"，不是纯时间：加卡片、加收藏、标记目标完成
   * 都会立刻让签名变化，所以界面上不会看到过期数字。
   */
  private annualCache: { sig: string; value: AnnualReport } | null = null;

  private annualSignature(): string {
    const st = this.state;
    let cardChars = 0;
    for (const c of st.cards) cardChars += c.text.length;
    const doneGoals = st.goals.reduce((n, g) => n + (g.done ? 1 : 0), 0);
    let recapRooms = 0;
    for (const r of Object.values(st.rooms)) if (r.recap) recapRooms += 1;
    return [
      st.rooms ? Object.keys(st.rooms).length : 0,
      recapRooms,
      st.cards.length,
      cardChars,
      st.collection.length,
      st.goals.length,
      doneGoals,
      new Date(this.now()).getFullYear(),
    ].join(':');
  }

  private buildAnnualCached(): AnnualReport {
    const sig = this.annualSignature();
    if (this.annualCache && this.annualCache.sig === sig) return this.annualCache.value;
    const value = this.buildAnnual();
    this.annualCache = { sig, value };
    return value;
  }

  private buildAnnual(): AnnualReport {
    /*
     * 报告标题是「YYYY 年度报告」，统计口径就必须是**这一年**。
     * 以前 year 取当前年份、数字却是全量历史：跨过 1 月 1 日之后
     * 「2026 年度报告」继续把 2025、2024 的场次算进去，只增不减。
     */
    const year = new Date(this.now()).getFullYear();
    const inYear = (ms: number | null | undefined): boolean => {
      if (!ms) return false;
      const d = new Date(ms);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
    };
    const recaps = Object.values(this.state.rooms)
      .filter((r) => r.recap !== null)
      .map((r) => r.recap as NonNullable<Room['recap']>)
      .filter((r) => inYear(r.endedAt));
    const sortedByEnd = [...recaps].sort((a, b) => b.endedAt - a.endedAt);
    const typeCount = new Map<string, number>();
    for (const item of this.state.collection.filter((i) => i.kind === 'movieList' && inYear(i.createdAt))) {
      const t = item.tags[0] ?? '未分类';
      typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
    }
    const words = new Map<string, number>();
    for (const card of this.state.cards.filter((c) => inYear(c.at))) {
      for (const chunk of card.text.split(/[\s，。、！？,.!?]+/)) {
        const w = chunk.trim();
        if (w.length >= 2 && w.length <= 4) words.set(w, (words.get(w) ?? 0) + 1);
      }
    }
    const topRated = [...recaps].sort((a, b) => {
      const ra = Math.max(a.ratings.A ?? 0, a.ratings.B ?? 0);
      const rb = Math.max(b.ratings.A ?? 0, b.ratings.B ?? 0);
      return rb - ra;
    })[0];
    return {
      year,
      moviesCount: recaps.length,
      movieTypes: [...typeCount.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      latestMovieAt: sortedByEnd[0]?.endedAt ?? null,
      latestMovieTitle: sortedByEnd[0]?.movieTitle ?? null,
      mostMovedTitle: topRated?.movieTitle ?? null,
      tripsCount: this.state.collection.filter((i) => i.kind === 'trip' && inYear(i.createdAt)).length,
      goalsDone: this.state.goals.filter((g) => g.done).length,
      goalsTotal: this.state.goals.length,
      thanksCount: this.state.cards.filter((c) => c.kind === 'thanks' && inYear(c.at)).length,
      milestones: this.state.collection.filter((i) => i.kind === 'milestone' && inYear(i.createdAt)).length,
      /*
       * 「在一起第 N 天」必须和首页用同一套算法：
       *   优先用户自己填的开始日期（profile.startedAt），没有才退回绑定时
       * 然后再 +1（在一起第一天显示"第 1 天"）。
       * 之前这里直接用 boundAt 算"过了多少天"，于是首页 27 天、年报 16 天（真实 bug）。
       */
      daysTogether: (() => {
        const startedAt = this.state.profile?.startedAt;
        const startMs = startedAt
          ? Date.parse(`${startedAt}T00:00:00`)
          : (this.state.boundAt ?? null);
        return togetherDayNumber(Number.isFinite(startMs as number) ? (startMs as number) : null, this.now());
      })(),
      topWords: [...words.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      travelCount: this.state.collection.filter((i) => i.kind === 'trip' && i.done && inYear(i.createdAt)).length,
    };
  }

  // =========================================================================
  // 个人建档 / 外观（头像只能改自己的；背景是双方共用的）
  // =========================================================================

  /** 由生日算年龄（按整年算） */
  private ageFromBirthDate(birthDate: string, now: number): number | null {
    /*
     * 按日历比，不要拿"平均年长"除：
     * 365.2425 天/年会让闰日多出来的天数被抹掉 —— 生日当天 diff/365.2425 还差一点点，
     * floor 出来少 1 岁（实测：2000-06-15 出生的人，2025-06-15 显示 24 岁）。
     * 顺带影响 12 岁门槛校验：正好 12 岁生日那天会被拒。
     */
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate ?? ''));
    if (!m) return null;
    const by = Number(m[1]);
    const bm = Number(m[2]);
    const bd = Number(m[3]);
    if (!by || !bm || !bd) return null;
    const at = new Date(by, bm - 1, bd, 0, 0, 0, 0).getTime();
    if (Number.isNaN(at) || at > now) return null;
    const n = new Date(now);
    let age = n.getFullYear() - by;
    const monthDiff = n.getMonth() + 1 - bm;
    if (monthDiff < 0 || (monthDiff === 0 && n.getDate() < bd)) age -= 1;
    return age < 0 ? null : age;
  }

  /** 登录建档：昵称 / 生日（据此算年龄）/ 性别 */
  updateMyProfile(
    byRole: Role,
    input: { name: string; birthDate: string; gender: Gender },
  ): Result<null> {
    if (!input.name.trim()) return fail('昵称不能为空');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) return fail('生日格式应为 YYYY-MM-DD');
    const age = this.ageFromBirthDate(input.birthDate, this.now());
    if (age === null) return fail('生日不合法（不能是未来日期）');
    if (age < 12 || age > 120) return fail('年龄需要在 12–120 岁之间');
    const m = this.state.members[byRole];
    m.name = input.name.trim().slice(0, 20);
    m.birthDate = input.birthDate;
    m.age = age;
    m.gender = input.gender;
    m.profileCompleted = true;
    this.logActivity(byRole, 'update', 'profile', '个人资料', m.name);
    this.notify();
    return ok(null);
  }

  /** 头像：只能改自己的 */
  setMyAvatar(byRole: Role, uri: string | null): Result<null> {
    this.state.members[byRole].avatarUri = uri;
    this.logActivity(byRole, 'update', 'avatar', '头像');
    this.notify();
    return ok(null);
  }

  /**
   * 清空某个端的档案（换人用）。
   *
   * 场景：还没绑定的时候，这台手机上留下的旧档案（例如"他"的资料被写进了女端 A）
   * 会挡住真正该占这个端的人。未绑定等于没有任何共同数据，清掉是零损失的；
   * 绑定之后不允许调用（关系数据不能这样被抹）。
   * 固定 ID 也一起换新的：旧 ID 已经被别人念叨过、发过请求了，不该被新人继承。
   */
  clearMemberProfile(byRole: Role): Result<null> {
    if (this.state.boundAt !== null) return fail('已经绑定，不能清空成员档案');
    const fallbackAvatar = byRole === 'A' ? '🌷' : '🌿';
    const m = this.state.members[byRole];
    m.name = '';
    m.avatar = fallbackAvatar;
    m.online = true;
    m.avatarUri = null;
    m.gender = null;
    m.birthDate = null;
    m.age = null;
    m.profileCompleted = false;
    m.publicId = newPublicId();
    this.state.bindRequest = null;
    this.notify();
    return ok(null);
  }

  /** 背景图：空间级，双方都能看到；任意一方都可以换（会通知对方） */
  setBackground(byRole: Role, uri: string | null): Result<null> {
    this.state.profile.backgroundUri = uri;
    this.audit(byRole, 'appearance', uri ? '更换了背景图' : '恢复了默认背景');
    this.logActivity(byRole, uri ? 'update' : 'delete', 'background', '空间背景图');
    this.notify();
    return ok(null);
  }

  /** 在一起的开始日期：自己填，不用随机 */
  setStartedAt(byRole: Role, date: string | null): Result<null> {
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail('日期格式应为 YYYY-MM-DD');
    }
    this.state.profile.startedAt = date;
    this.notify();
    return ok(null);
  }

  // =========================================================================
  // 持久化：导出 / 恢复服务端状态
  // =========================================================================

  /** 导出完整服务端状态（纯 JSON，可落盘） */
  serialize(): SpaceState {
    return JSON.parse(JSON.stringify(this.state)) as SpaceState;
  }

  /**
   * 合并一个成员的存档数据。
   *
   * 两个作用：
   *  1. 老存档没有 publicId → 生成一个新的，绝不留下空 ID（空 ID = 谁都搜不到谁）
   *  2. 存档里是空串/undefined 的字段不许把当前值抹掉
   */
  private mergeMember(role: Role, raw: Partial<Member> | undefined): Member {
    const base = this.state.members[role];
    const merged: Member = { ...base, ...(raw ?? {}) } as Member;
    if (!merged.publicId || typeof merged.publicId !== 'string') {
      merged.publicId = base.publicId || newPublicId();
    }
    return merged;
  }

  /** 从持久化快照恢复；缺字段用当前默认值补齐，失败不破坏现有状态 */
  hydrate(raw: SpaceState): boolean {
    try {
      if (!raw || typeof raw.spaceId !== 'string') return false;
      const now = this.now();
      this.state = {
        ...this.state,
        ...raw,
        // 老存档里**没有** publicId 这个字段（它是后加的）。以前这里直接
        // `{...this.state.members, ...raw.members}`，于是 undefined 把新生成的 ID 盖掉，
        // 服务端两个端的 ID 都变成空 → 手机上互相搜 ID 永远「没找到这个 ID」（真实事故）。
        members: {
          A: this.mergeMember('A', raw.members?.A),
          B: this.mergeMember('B', raw.members?.B),
        },
        themes: raw.themes ?? this.state.themes,
        decor: raw.decor ?? this.state.decor,
        pet: raw.pet ?? this.state.pet,
        trust: raw.trust ?? this.state.trust,
        ldr: raw.ldr ?? this.state.ldr,
        wedding: raw.wedding ?? this.state.wedding,
        relProfile: raw.relProfile ?? this.state.relProfile,
        valuesCard: raw.valuesCard ?? this.state.valuesCard,
        selfAssess: raw.selfAssess ?? this.state.selfAssess,
        // 老版本存档里没有这个字段：补成空清单，绝不能变成 undefined 让界面炸
        comfort: {
          A: raw.comfort?.A ?? [],
          B: raw.comfort?.B ?? [],
        },
        bindRequest: raw.bindRequest ?? null,
        /*
         * 自定义背景里后加的字段（视频首帧 poster）必须原样带回来：
         * 存档是老版本写的、或者类型里没写全时，`...raw` 之后被别的赋值覆盖掉，
         * 客户端就永远只拿到没有 poster 的那份 → 视频没解码前仍然白一块。
         */
        customBackground: raw.customBackground ? { ...raw.customBackground } : null,
        presence: raw.presence ?? this.state.presence ?? {},
      };
      this.online = { A: true, B: true };
      this.lastSeen = { A: now, B: now };
      this.revision += 1;
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 远程模式专用：把**服务端投影后的快照**还原进本地 hub。
   *
   * 为什么需要单独一个方法：`/api/wait` 返回的是 `snapshot(role)`（已经按角色裁剪过），
   * 不是完整的 `SpaceState`。以前直接把它丢给 `hydrate()`，于是
   * `moods`/`period`/`comfort`/`rooms` 这些"快照里换了名字"的字段全都没还原——
   * 表现为：两台手机连上以后，心情、经期关怀、照顾清单、观影房间都显示不出来。
   *
   * 这里只还原"我这份快照里确实有的东西"，对方的私密数据服务端不给、也绝不反推。
   */
  hydrateProjected(raw: SpaceSnapshot, role: Role): boolean {
    try {
      if (!raw || typeof raw.spaceId !== 'string') return false;
      const partner: Role = role === 'A' ? 'B' : 'A';
      const moods = { ...this.state.moods };
      moods[role] = raw.myMood;
      moods[partner] = raw.partnerMood;
      const comfort = { ...this.state.comfort };
      comfort[role] = raw.myComfort ?? [];
      comfort[partner] = raw.partnerComfort ?? [];
      const selfAssess = { ...this.state.selfAssess };
      selfAssess[role] = raw.mySelfAssess;

      this.state = {
        ...this.state,
        spaceId: raw.spaceId,
        boundAt: raw.boundAt,
        members: {
          A: this.mergeMember('A', raw.members?.A),
          B: this.mergeMember('B', raw.members?.B),
        },
        bindRequest: raw.bindRequest ?? null,
        invite: raw.invite
          ? {
              code: raw.invite.code,
              expireAt: raw.invite.expireAt,
              createdBy: raw.invite.createdBy ?? 'A',
              createdByClientId: raw.invite.createdByClientId ?? null,
              version: this.state.invite?.version ?? 1,
            }
          : null,
        events: raw.events ?? [],
        todos: raw.todos ?? [],
        shopping: raw.shopping ?? [],
        chores: raw.chores ?? [],
        ledger: raw.ledger ?? [],
        collection: raw.collection ?? [],
        habits: raw.habits ?? [],
        goals: raw.goals ?? [],
        moods,
        // 对方的 period 我拿不到（服务端不发），保持本地原样，不编造
        period: { ...this.state.period, [role]: raw.myPeriod ?? this.state.period[role] },
        careReminders: raw.careReminders ?? [],
        comfort,
        giftIdeas: raw.giftIdeas ?? [],
        cards: raw.cards ?? [],
        dailyQuestion: raw.dailyQuestion,
        voiceNotes: raw.voiceNotes ?? [],
        diary: raw.diary ?? [],
        weeklyReviews: raw.weeklyReviews ?? [],
        timeline: raw.timeline ?? [],
        /*
         * 房间：快照里只有 activeRoom 的投影，反向还原成可再投影的 Room。
         * 注意要**合并**而不是覆盖：回忆卡与"一起看完 N 部"的成就都从 state.rooms 统计，
         * 以前这里直接替换成"只剩当前房间"，一次心跳投影就把本地历史抹掉，
         * 成就（第一次一起看电影等）会重新上锁、年度报告场次归零。
         */
        rooms: raw.activeRoom
          ? { ...this.state.rooms, [raw.activeRoom.id]: roomFromView(raw.activeRoom) }
          : this.state.rooms,
        activeRoomId: raw.activeRoom?.id ?? null,
        watchPlans: raw.watchPlans ?? [],
        watchQueue: (raw as { watchQueue?: WatchQueueItem[] }).watchQueue ?? [],
      // 老存档没有评论区：补空对象，不丢已有数据
      comments: (raw as { comments?: Record<string, CommentItem[]> }).comments ?? {},
      // 老存档没有游戏库/对局：补空，不丢已有数据
      games: (raw as { games?: GameSpec[] }).games ?? [],
      gameSession: (raw as { gameSession?: GameSession | null }).gameSession ?? null,
      voxelWorld:
        (raw as { voxelWorld?: VoxelWorld }).voxelWorld ?? { edits: [], updatedAt: 0, updatedBy: 'A' },
      voxelMods: (raw as { voxelMods?: HubModList }).voxelMods ?? [],
        pickSession: raw.pickSession,
        music: raw.music ?? this.state.music,
        profile: raw.profile ?? this.state.profile,
        unbind: raw.unbind,
        audit: raw.audit ?? [],
        notifications: raw.notifications ?? [],
        activity: (raw as { activity?: ActivityItem[] }).activity ?? [],
        cms: raw.cms ?? { apis: [], manager: 'A', updatedAt: 0, updatedBy: 'A' },
        live: (raw as { live?: LiveSourceConfig }).live ?? {
          urls: [],
          manager: 'A',
          updatedAt: 0,
          updatedBy: 'A',
        },
        decor: raw.decor ?? this.state.decor,
        pet: raw.pet ?? this.state.pet,
        themes: raw.themes ?? this.state.themes,
        voice: raw.voice ?? this.state.voice,
        relProfile: raw.relProfile ?? this.state.relProfile,
        valuesCard: raw.valuesCard ?? this.state.valuesCard,
        plans: raw.plans ?? [],
        boundaries: raw.boundaries ?? [],
        conflicts: raw.conflicts ?? [],
        selfAssess,
        votes: raw.votes ?? [],
        ldr: raw.ldr ?? this.state.ldr,
        trust: raw.trust ?? this.state.trust,
        safety: raw.safety ?? [],
        intimacy: raw.intimacy ?? [],
        socialReports: raw.socialReports ?? [],
        // 保险箱：密钥只在本人这条投影里有；别人的条目本来就没有 secret
        vault: (raw.vault ?? []).map((v) => ({
          ...v,
          secret: v.secret ?? this.state.vault.find((x) => x.id === v.id)?.secret ?? '',
        })),
        wedding: raw.wedding ?? this.state.wedding,
        achievements: raw.achievements ?? [],
        /*
         * 在线状态也要合并进来：
         * 客户端每 30 秒上报一次"我在哪个模块"，这条本地写会触发本地投影；
         * 如果这里不带上服务端的 presence，本地投影里就只剩自己那一条，
         * 对方的状态会被抹掉 —— 首页那行就会在"在听焦焦FM"和"在线"之间闪。
         */
        presence:
          (raw as { presence?: Record<string, { surface: string; detail: string | null; at: number }> })
            .presence ?? this.state.presence ?? {},
        /*
         * 自定义背景 / FM 收听源 / FM 进度也要带回来。
         *
         * 这是同一个坑的第二次踩：客户端任何一次本地写（比如每 30 秒的在线心跳）
         * 都会用**本地投影**刷新界面，而本地投影是从这里 hydrate 出来的 ——
         * 这里漏掉哪个字段，界面上那个字段就会"过一会儿就没了"。
         * 之前是 presence，这次是自定义背景：心跳一发，首页背景就退回旧的那张图，
         * 用户看到的就是"我上传的 MP4 又不见了"。
         */
        customBackground:
          (raw as { customBackground?: SpaceState['customBackground'] }).customBackground ??
          this.state.customBackground ??
          null,
        fmSources: (raw as { fmSources?: SpaceState['fmSources'] }).fmSources ?? this.state.fmSources,
        fmProgress:
          (raw as { fmProgress?: SpaceState['fmProgress'] }).fmProgress ?? this.state.fmProgress ?? null,
      };
      this.revision += 1;
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // 定时推进
  // -------------------------------------------------------------------------

  tick(): void {
    const now = this.now();
    const room = this.activeRoom();
    let dirty = false;

    if (room) {
      // 倒计时结束 → 进入播放
      if (room.state === 'COUNTDOWN' && room.countdownEndsAt !== null && now >= room.countdownEndsAt) {
        room.countdownEndsAt = null;
        room.mediaState.action = 'play';
        room.mediaState.positionSec = 0;
        room.mediaState.updatedAtServerMs = now;
        room.mediaState.seq += 1;
        this.applyRoomEvent(room, 'COUNTDOWN_DONE');
        dirty = true;
      }

      // 邀请过期
      if ((room.state === 'CREATED' || room.state === 'WAITING_PEER') && now > room.expireAt) {
        this.applyRoomEvent(room, 'INVITE_EXPIRED');
        dirty = true;
      }

      // 掉线超时 → 等待重连
      if (
        room.state === 'PEER_OFFLINE' &&
        room.offlineSince !== null &&
        now - room.offlineSince > this.scaled(5 * 60 * 1000)
      ) {
        this.applyRoomEvent(room, 'RECONNECT_TIMEOUT');
        this.pushNotification(room.leaderRole, 'room', MASK.roomWaiting);
        dirty = true;
      }

      // 等待重连再超时 → 结束
      if (
        room.state === 'WAITING_RECONNECT' &&
        room.offlineSince !== null &&
        now - room.offlineSince > this.scaled(30 * 60 * 1000)
      ) {
        room.endedAt = now;
        const startedAt = room.peerJoinedAt ?? room.createdAt;
        if (!room.recap) {
          room.recap = {
            movieTitle: room.movieTitle,
            startedAt,
            endedAt: now,
            durationSec: Math.max(0, Math.round((now - startedAt) / 1000)),
            ratings: {},
            reviews: {},
            saved: [],
            screenshots: [],
          };
        }
        this.applyRoomEvent(room, 'ROOM_TIMEOUT');
        dirty = true;
      }

      // 服务端推进权威播放位置
      if (room.state === 'PLAYING' && room.mediaState.action === 'play') {
        const elapsed = now - room.mediaState.updatedAtServerMs;
        if (elapsed > 1000) {
          room.mediaState.positionSec += (elapsed / 1000) * room.mediaState.rate;
          room.mediaState.updatedAtServerMs = now;
          dirty = true;
        }
      }
    }

    // 预测日期只用于展示，不写库

    // 一起听：服务端推进音乐进度（跟随端据此推算目标位置）
    const m = this.state.music;
    if (m.queue.length > 0 && m.action === 'play') {
      const elapsed = now - m.updatedAtServerMs;
      if (elapsed > 1000) {
        m.positionSec += elapsed / 1000;
        m.updatedAtServerMs = now;
        dirty = true;
      }
    }

    // 宠物温和衰减（不惩罚、不催）
    this.applyPetDecay();

    // 每周轮换家务
    const wk = weekKeyOf(now);
    for (const chore of this.state.chores) {
      if (chore.weekKey !== wk) {
        chore.weekKey = wk;
        if (chore.rotation.length > 1) {
          chore.rotationIndex = (chore.rotationIndex + 1) % chore.rotation.length;
        }
        dirty = true;
      }
    }

    // 语音邀请 60 秒未响应 → 自动视为拒绝（空间级，和观影房间无关）
    const vc = this.state.voice;
    if (vc.status === 'inviting' && vc.invitedAt !== null && now - vc.invitedAt > 60_000) {
      this.state.voice = { ...emptyVoice(), status: 'declined', byRole: vc.byRole };
      dirty = true;
    }

    // 单次位置共享到期自动失效（不落历史轨迹）
    if (this.state.trust.locationShareUntil !== null && now > this.state.trust.locationShareUntil) {
      this.state.trust.locationShareUntil = null;
      this.state.trust.shareWith = [];
      dirty = true;
    }
    const beforeSafety = this.state.safety.length;
    // 单次位置共享到期即物理删除（不落历史）；到家报备保留 24 小时后清理
    this.state.safety = this.state.safety.filter((s) =>
      s.expiresAt !== null ? s.expiresAt > now : now - s.at < 86_400_000,
    );
    if (this.state.safety.length !== beforeSafety) dirty = true;

    // 每日一问随日期滚动
    const beforeQ = this.state.dailyQuestion;
    this.ensureDailyQuestion();
    if (this.state.dailyQuestion !== beforeQ) dirty = true;

    // 双人成就（无排行榜，只在达成时记录）
    const beforeAch = this.state.achievements.length;
    this.syncAchievements();
    if (this.state.achievements.length !== beforeAch) dirty = true;

    if (dirty) this.notify();
  }

  // -------------------------------------------------------------------------
  // 演示辅助
  // -------------------------------------------------------------------------

  /**
   * 重置为「干净的初始状态」：没有情侣、没有任何默认数据。
   * 所有内容都由用户在登录、邀请、建档之后自己填写。
   */
  resetToEmpty(): void {
    const fresh = new Hub({
      scale: this.scale,
      latencyMs: this.latencyMs,
      clockSkew: this.clockSkew,
      now: this.nowFn,
    });
    this.state = fresh.serialize();
    this.revision += 1;
    this.notify();
  }

  /** 兼容旧调用：不再灌入示例数据 */
  seedDemo(): void {
    this.resetToEmpty();
  }
}

export type { Member, SpaceState };
