/**
 * 双人空间 / TwoSpace —— 领域模型定义（全量 77 项功能）
 * 纯类型 + 常量，无运行时依赖，可被 Node 直接编译测试。
 */

export type Role = 'A' | 'B';

/** 经期可见四档（方案 §3.5 / §6 投影表） */
export type PeriodTier = 'private' | 'care' | 'predict' | 'full';

export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'hug';

export type FlowLevel = 'light' | 'medium' | 'heavy';

export type EventCategory = 'date' | 'anniversary' | 'chore' | 'trip' | 'reminder' | 'movie';

export type Assignee = Role | 'either';

export type ReactionKind = 'lol' | 'scared' | 'ship' | 'hug';

export type UnbindStatus = 'cooling' | 'done' | 'cancelled';

export type DataChoice = 'export' | 'delete';

/** 电影院房间状态（对应方案 §2.2 状态机） */
export type RoomState =
  | 'CREATED'
  | 'WAITING_PEER'
  /** 对方点了「加入」，等房主同意 */
  | 'PEER_REQUESTED'
  | 'PREPARING'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'PAUSED'
  | 'PEER_OFFLINE'
  | 'WAITING_RECONNECT'
  | 'ENDED'
  | 'RECAP'
  | 'DISSOLVED'
  | 'EXPIRED';

/** 房间状态机事件 */
export type RoomEvent =
  | 'INVITE_SHARED'
  | 'PEER_OPENED'
  /** 对方申请加入（不用邀请码，点了就申请） */
  | 'PEER_REQUESTED'
  /** 房主同意对方进来 */
  | 'PEER_APPROVED'
  | 'PEER_JOINED'
  | 'PEER_DECLINED'
  | 'BOTH_READY'
  | 'COUNTDOWN_DONE'
  | 'PLAY'
  | 'PAUSE'
  | 'SEEK'
  | 'LEADER_TIMEOUT'
  | 'PEER_OFFLINE'
  | 'PEER_ONLINE_PLAYING'
  | 'PEER_ONLINE_PAUSED'
  | 'RECONNECT_TIMEOUT'
  | 'END'
  | 'SAVE_RECAP'
  | 'CANCEL'
  | 'INVITE_EXPIRED'
  | 'ROOM_TIMEOUT';

export type Result<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: string;
      /**
       * 机器可读的失败原因：
       *  - `auth`  = 登录状态失效（token 过期/账号被删）→ 必须请用户重新登录
       *  - `retry` = 瞬时状态（还没完成认证、连接刚建好）→ 稍后重试即可
       * 不要再用"错误文案里有没有登录/认证字样"来判断——
       * 「还没完成身份认证，请稍后重试」这种可重试的话把用户踢下线过。
       */
      code?: 'auth' | 'retry';
    };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(error: string, code?: 'auth' | 'retry'): Result<T> =>
  code ? { ok: false, error, code } : { ok: false, error };

// ===========================================================================
// 模块1 双人空间
// ===========================================================================

export type ThemeId =
  | 'cream'
  | 'handdrawn'
  | 'paper'
  | 'starry'
  | 'mint'
  | 'ocean'
  | 'sakura'
  | 'sepia';

export type DecorSlot =
  | 'wall'
  | 'floor'
  | 'light'
  | 'plant'
  | 'shelf'
  | 'window'
  | 'rug'
  | 'desk';

/** 共同房间：slotId → 家具 id（null 表示空位） */
export interface DecorState {
  slots: Record<string, string | null>;
  updatedAt: number;
  updatedBy: Role;
}

export interface PetState {
  name: string;
  water: number;
  food: number;
  affection: number;
  lastWateredAt: number | null;
  lastFedAt: number | null;
  lastPettedAt: number | null;
  /** 累计照料天数（不是连续天数，不做断签惩罚） */
  careDays: number;
  lastCareDay: string | null;
  decorUnlocked: number;
}

export interface ThemeState {
  current: Record<Role, ThemeId>;
  synced: boolean;
}

// ===========================================================================
// 模块2 共享生活工具
// ===========================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 当天分钟数 0-1439 */
  startMin: number;
  endMin: number;
  category: EventCategory;
  ownerRole: Role;
  visibility: 'shared' | 'self';
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface Todo {
  id: string;
  title: string;
  assignee: Assignee;
  done: boolean;
  dueDate: string | null;
  createdBy: Role;
  createdAt: number;
  doneAt: number | null;
  version: number;
}

export interface ShoppingItem {
  id: string;
  title: string;
  qty: string;
  category: 'fresh' | 'daily' | 'medicine' | 'snack' | 'other';
  done: boolean;
  createdBy: Role;
  createdAt: number;
  doneAt: number | null;
}

/** 家务分工：可认领、可轮换、只看完成状态，不做排名 */
export interface Chore {
  id: string;
  title: string;
  assignee: Assignee;
  /** 'weekly' 表示本周内轮换，assignee 保留初始人 */
  rotation: Assignee[];
  rotationIndex: number;
  weekKey: string;
  doneWeekKeys: string[];
  createdBy: Role;
  createdAt: number;
}

/** 共同记账：分摊需对方确认才生效 */
export interface LedgerEntry {
  id: string;
  title: string;
  amountCents: number;
  payerRole: Role;
  /** equal = 人均；custom = 按 shares 比例 */
  split: 'equal' | 'custom';
  shares: Record<Role, number>;
  category: 'travel' | 'rent' | 'daily' | 'gift' | 'other';
  /** 私密条目对伴侣不可见（金额敏感） */
  visibility: 'shared' | 'owner';
  confirmedBy: Role[];
  date: string;
  createdBy: Role;
  createdAt: number;
}

/** 集合型功能（愿望/餐厅/旅行/歌单/库存/片单/人物/里程碑/关怀日程/家庭节日/成长/资产/照片/愿望罐） */
export type CollectionKind =
  | 'wishlist'
  | 'restaurant'
  | 'trip'
  | 'playlist'
  | 'inventory'
  | 'movieList'
  | 'people'
  | 'milestone'
  | 'careEvent'
  | 'familyHoliday'
  | 'growthPlan'
  | 'jointAsset'
  | 'photoMemory'
  | 'wishJar';

export interface CollectionItem {
  id: string;
  kind: CollectionKind;
  title: string;
  note: string;
  tags: string[];
  amountCents: number | null;
  date: string | null;
  level: number;
  done: boolean;
  ownerRole: Role;
  /** owner = 仅创建者可见（礼物灵感 / 私密人物卡 / 私密生日卡） */
  visibility: 'shared' | 'owner';
  meta: Record<string, string>;
  votes: Record<Role, 'like' | 'nope' | null>;
  claimedBy: Role | null;
  createdAt: number;
  updatedAt: number;
}

/** 习惯打卡：断签不清零、不惩罚、无红点 */
export interface Habit {
  id: string;
  title: string;
  checkins: string[];
  createdBy: Role;
  createdAt: number;
}

/** 共同目标 / 存钱 / 旅行基金 */
export interface Goal {
  id: string;
  title: string;
  targetCents: number | null;
  savedCents: number;
  contributions: Array<{ role: Role; cents: number; at: number }>;
  targetDate: string | null;
  done: boolean;
  createdBy: Role;
  createdAt: number;
}

export interface GiftIdea {
  id: string;
  ownerRole: Role;
  text: string;
  occasion: string;
  createdAt: number;
  revealed: boolean;
}

// ===========================================================================
// 模块3 经期与健康关怀
// ===========================================================================

export interface PeriodRecord {
  id: string;
  ownerRole: Role;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string | null;
  flow: FlowLevel | null;
  symptoms: string[];
  moods: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface TierChange {
  at: number;
  from: PeriodTier;
  to: PeriodTier;
  byRole: Role;
  /** 是否把历史记录也一并共享（默认 false，只共享此后新记录） */
  shareHistory: boolean;
}

/** 备孕 / 避孕记录：仅记录，不做任何医疗判断，默认私密 */
export interface PlanEntry {
  id: string;
  kind: 'prepare' | 'contraception';
  date: string;
  note: string;
}

export interface PeriodData {
  tier: PeriodTier;
  predictionEnabled: boolean;
  records: PeriodRecord[];
  tierHistory: TierChange[];
  planLog: PlanEntry[];
  /** 用户在授权页手动勾选的"历史记录也共享"标记 */
  shareHistoryFrom: number | null;
  /** 3.10 计划记录是否对伴侣可见（默认 false） */
  sharePlanLog: boolean;
}

/** 3.4 用药 / 饮水 / 休息提醒 */
export interface CareReminder {
  id: string;
  ownerRole: Role;
  kind: 'water' | 'medicine' | 'rest';
  time: string;
  enabled: boolean;
  note: string;
  /** 授权后伴侣可看到"TA 设了这个提醒"，但看不到身体数据 */
  visibleToPartner: boolean;
}

/**
 * 「我希望被这样照顾」的条目。
 *
 * 由本人自己写、自己删，伴侣**只能看和照做**，不能替你改。
 * 产品不预置任何模板：刚开始就是空的，第一句话必须你自己填。
 */
export interface ComfortItem {
  id: string;
  text: string;
  createdAt: number;
}

// ===========================================================================
// 模块4 情感互动
// ===========================================================================

export interface MoodEntry {
  weather: Weather;
  note: string;
  at: number;
}

export type CardKind = 'thanks' | 'praise' | 'apology' | 'calm' | 'makeup' | 'hug';

export interface Card {
  id: string;
  kind: CardKind;
  from: Role;
  text: string;
  /** 夸夸卡的"具体行为"，感谢卡的"那件小事"，道歉卡的模板 */
  detail: string;
  /** 冷静卡：space / listen / hug */
  meta: string;
  at: number;
  replies: Array<{ role: Role; text: string; at: number }>;
  accepted: boolean;
  /** 谁收下的、什么时候收的（老存档没有这两个字段） */
  acceptedBy?: Role | null;
  acceptedAt?: number | null;
}

export interface DailyQuestion {
  day: string;
  question: string;
  answers: Partial<Record<Role, string>>;
}

export interface VoiceNote {
  id: string;
  from: Role;
  durationSec: number;
  uri: string;
  deliverAt: number | null;
  listenedAt: number | null;
  at: number;
}

export interface DiaryEntry {
  id: string;
  body: Partial<Record<Role, string>>;
  createdAt: number;
  updatedAt: number;
  /** 每段各自的最后编辑时间：日记不能撤回，但可以改错别字 */
  editedAt: Partial<Record<Role, number>>;
}

export interface WeeklyReview {
  id: string;
  weekKey: string;
  answers: Partial<Record<Role, { happy: string; trouble: string; want: string }>>;
  at: number;
}

export interface TimelineNode {
  id: string;
  title: string;
  date: string;
  note: string;
  emoji: string;
  createdBy: Role;
  createdAt: number;
}

// ===========================================================================
// 模块5 情侣电影院
// ===========================================================================

export interface Danmaku {
  id: string;
  senderRole: Role;
  text: string;
  mediaPosSec: number;
  at: number;
  /**
   * 这条弹幕是在哪个片源下发的。
   *
   * 换片之后只显示当前片源的弹幕——不然上一部剧的弹幕会飘到新片上
   * （用户实测反馈）。老存档里没有这个字段，会在换片时补成"换片前的地址"。
   */
  sourceUrl?: string | null;
}

export interface Reaction {
  id: string;
  senderRole: Role;
  kind: ReactionKind;
  mediaPosSec: number;
  at: number;
}

export interface MediaState {
  action: 'play' | 'pause';
  positionSec: number;
  rate: number;
  seq: number;
  updatedAtServerMs: number;
  leaderRole: Role;
}

export interface Recap {
  movieTitle: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  ratings: Partial<Record<Role, number>>;
  reviews: Partial<Record<Role, string>>;
  saved: Role[];
  screenshots: string[];
}

export interface Room {
  id: string;
  code: string;
  codeVersion: number;
  token: string;
  createdAt: number;
  expireAt: number;
  state: RoomState;
  leaderRole: Role;
  readiness: Record<Role, boolean>;
  mediaState: MediaState;
  danmaku: Danmaku[];
  reactions: Reaction[];
  mediaOffset: Record<Role, number>;
  movieTitle: string;
  /** 在线片库直链（m3u8/mp4）；为空表示各自自备片源 */
  sourceUrl: string | null;
  peerJoinedAt: number | null;
  /** 谁在申请加入（不用邀请码的流程）：房主据此显示「同意/拒绝」 */
  joinRequestedBy: Role | null;
  joinRequestedAt: number | null;
  countdownEndsAt: number | null;
  offlineSince: number | null;
  endedAt: number | null;
  recap: Recap | null;
  pendingLeadRequest: Role | null;
  pendingAction: { role: Role; action: 'play' | 'pause' } | null;
  /** 由 App 发起 play/pause/seek 后的心跳保护期：此期间不接受主控旧位置覆盖 */
  holdUntil: number;
  lastPeerEventAt: number;
  /** 5.9 虚拟影院场景开关 */
  scene: { popcorn: boolean; cat: boolean; blanket: boolean; updatedBy: Role; updatedAt: number };
}

export interface VoiceCallState {
  status: 'idle' | 'inviting' | 'connected' | 'declined' | 'ended';
  byRole: Role | null;
  startedAt: number | null;
  invitedAt: number | null;
  muted: Record<Role, boolean>;
  speaker: Record<Role, boolean>;
  volume: Record<Role, number>;
  textOnly: boolean;
}

// ---- 一起听（同步音乐）----

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  /** .mp3 / .m4a / .aac / .wav / .ogg 直链 */
  url: string;
  cover: string | null;
  addedBy: Role;
  createdAt: number;
}

/** 一起听的操作（客户端 → 服务端） */
export type MusicAction = 'play' | 'pause' | 'seek' | 'change_track' | 'setting';

/**
 * 在线片库接口（CMS）。
 *
 * 产品决定：**接口只由一个人管理**，两个人从同一份接口拉片。
 * 不用"各配一份"的原因：同一个采集站被抓两次会产生重复条目/重复计数，
 * 而且一方换了接口另一方还在用旧的，看起来就是我这边能播、TA 那边没有。
 * 但看片是两个人的事——所以接口归一个人管，内容双方都能看。
 */
export interface CmsSourceConfig {
  apis: string[];
  /** 谁在管理这份接口（另一方只读） */
  manager: Role;
  updatedAt: number;
  /** 最近修改者，用于提示"TA 刚换了接口" */
  updatedBy: Role;
}

/**
 * 电视直播源（和片库接口同一套规则：**只由一个人管理，两个人共用一份**）。
 *
 * 用户的原话：「直播源和片源一样共用一份，还要有一起看的效果」。
 * 所以这里只存播放列表地址（m3u/m3u8/txt），不存频道内容本身 ——
 * 频道是拉下来现解析的，源换了两个人一起变。
 */
export interface LiveSourceConfig {
  /** 播放列表地址列表（可以有多个源） */
  urls: string[];
  /** 谁在管理这份直播源（另一方只读） */
  manager: Role;
  updatedAt: number;
  updatedBy: Role;
}

export interface MusicState {
  queue: MusicTrack[];
  index: number;
  action: 'play' | 'pause';
  positionSec: number;
  updatedAtServerMs: number;
  seq: number;
  loop: boolean;
  shuffle: boolean;
  /** 最后操作者：用于"自己的动作不回声"防死循环 */
  updatedBy: Role;
}

/**
 * 一起看队列里的一项（从片库挑的片子，挑好就能直接点播）。
 *
 * 为什么要有它：以前从片库进房间只能"就这一集/这一部"，电视剧得每次重新找；
 * 现在选中的片子进队列，房间页点一下就能播，换集也只是点另一项。
 */
export interface WatchQueueItem {
  id: string;
  /** 片名（队列里显示） */
  title: string;
  /** 这一项对应第几集（电影就是第 1 项） */
  episodeIndex: number;
  /** 集名，例如"第3集"；电影为空 */
  episodeName: string;
  /** 直链（http/https） */
  url: string;
  /** 来源接口地址（换源用，可为空） */
  api: string | null;
  /** 片库里的 vod id */
  vodId: string | null;
  addedBy: Role;
  createdAt: number;
}

/** 一条评论：影视的影评区、生活点滴的评论区都用它，靠 key 隔离 */
/**
 * 一个游戏（存"代码"本身，不存成品）。
 *
 * 用户的做法：去找 DeepSeek 要一段 HTML 小游戏代码 → 粘贴进 App → 一键生成
 * → 存进游戏库 → 双方点开就能一起玩。所以这里只存源码文本。
 */
export interface GameSpec {
  id: string;
  title: string;
  /** 单文件 HTML（含 <script>）；在沙箱 WebView 里跑 */
  code: string;
  /**
   * 大游戏的服务器相对路径（`/game/xxx.html`）。
   *
   * 有它就说明这个游戏体积远超"能塞进同步状态"的规模（Unity WebGL、几十 MB 资源…），
   * 客户端按网址加载、不再把代码放进空间状态 —— 于是**体积不再有 400KB 上限**。
   */
  assetPath?: string | null;
  /**
   * 安卓包的原生包名（服务端从 APK 的 AndroidManifest.xml 里解析出来的）。
   *
   * 有它，游戏库才能"点卡片直接打开这个游戏"；没有就只能反复弹安装器
   * （以前这里写死了我们自己云编译的 com.mutual.generated，别人的 APK 打不开）。
   */
  packageName?: string | null;
  /** 怎么跑：html=WebView / link=交给手机打开 / source=源码跑不了（默认 html） */
  kind?: 'html' | 'link' | 'source' | 'native';
  /** 玩家人数，1 或 2（我们只做 2 人联机） */
  players: 1 | 2;
  createdBy: Role;
  createdAt: number;
  /** 内置样例不参与"删除"以外的特殊处理，这里留个标记 */
  /** true = 普通内置样例；"voxel3d" = 代码在运行时拼（含内联 three.js） */
  builtin?: boolean | string;
}

/** 一局正在进行的双人游戏：shared 是局面，两边都按它渲染 */
export interface GameSession {
  gameId: string;
  title: string;
  /** 局面：任意 JSON（游戏自己解释） */
  state: string;
  /**
   * 联机层（TwNet）的最新一个数据包。
   * 粘贴进来的第三方 HTML 游戏靠这条通道镜像两个人的操作 / 同步随机种子；
   * 内置样例与农场/沙盒走 state 通道，不依赖它。
   */
  net?: string;
  netSeq?: number;
  netFrom?: Role | null;
  /** 谁的回合（0/1 对应两边） */
  turn: number;
  updatedAt: number;
  updatedBy: Role;
  seq: number;
}

/**
 * 3D 体素世界的**存档**。
 *
 * 只存"和确定性地形不一样的地方"（挖掉的 / 放上去的），格式 `x,y,z,v`：
 *  - 世界本体由固定种子生成，两端一致，所以不用存整张地图；
 *  - 一次挖/放只增加一条，几千条也就几十 KB；
 *  - 下次打开、换手机、对方进来，都从这份存档复原（跟联机版我的世界一个思路）。
 */
export interface VoxelWorld {
  /** 改过的格子：x,y,z,方块id */
  edits: string[];
  updatedAt: number;
  updatedBy: Role;
}

export interface CommentItem {
  id: string;
  byRole: Role;
  text: string;
  at: number;
}

/** 5.3 预约观影 */
export interface WatchPlan {
  id: string;
  movieTitle: string;
  date: string;
  startMin: number;
  confirmedBy: Role[];
  createdBy: Role;
  createdAt: number;
}

/** 5.2 一起选片 */
export interface PickSession {
  id: string;
  candidates: string[];
  picks: Record<Role, Record<string, 'like' | 'nope'>>;
  createdAt: number;
  finished: boolean;
}

// ===========================================================================
// 模块7 关系成长、未来规划与冲突修复
// ===========================================================================

export type RelStage = 'getting-to-know' | 'dating' | 'cohabiting' | 'engaged' | 'married';

export interface RelProfile {
  meetMethod: string;
  firstDate: string;
  stage: RelStage;
  milestones: string[];
  submittedBy: Role[];
  confirmedBy: Role[];
  updatedAt: number;
}

export type ValuesTopic =
  | 'money'
  | 'marriage'
  | 'parenting'
  | 'eldercare'
  | 'city'
  | 'chores'
  | 'familyBoundary'
  | 'career'
  | 'fertility'
  | 'housing'
  | 'faith'
  | 'social'
  | 'consumption'
  | 'holidays'
  | 'pets'
  | 'health';

export interface ValuesCard {
  drafts: Partial<Record<Role, Partial<Record<ValuesTopic, string>>>>;
  scheduledAt: number | null;
  consensus: string;
  revealed: boolean;
}

export interface PlanItem {
  id: string;
  title: string;
  stage: 'discuss' | 'confirmed' | 'done';
  targetDate: string | null;
  owners: Role[];
  notes: string;
  confirmedBy: Role[];
  createdBy: Role;
  createdAt: number;
}

export type BoundaryCategory = 'privacy' | 'social' | 'money' | 'chores' | 'conflict' | 'checkin';

export interface BoundaryItem {
  id: string;
  category: BoundaryCategory;
  text: string;
  agreements: Partial<Record<Role, 'agree' | 'change'>>;
  createdBy: Role;
  createdAt: number;
}

export interface ConflictEntry {
  id: string;
  trigger: string;
  feelings: Partial<Record<Role, string>>;
  needs: Partial<Record<Role, string>>;
  calmUsed: boolean;
  apology: Partial<Record<Role, string>>;
  ritual: string;
  stage: number;
  resolvedAt: number | null;
  createdAt: number;
}

export interface SelfAssessment {
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
}

export interface VoteOption {
  id: string;
  label: string;
}

export interface Vote {
  id: string;
  title: string;
  options: VoteOption[];
  votes: Partial<Record<Role, string>>;
  anonymous: boolean;
  deadline: number | null;
  createdAt: number;
  createdBy: Role;
}

export interface LdrPlan {
  enabled: boolean;
  nextMeetDate: string | null;
  ticket: string;
  budgetCents: number;
  checklist: string[];
}

export interface TrustSettings {
  /** 单次位置共享的到期时间（null = 未开启）；不做长期轨迹 */
  locationShareUntil: number | null;
  shareWith: Role[];
  arrivedReport: boolean;
  emergencyContact: boolean;
}

export interface SafetyEvent {
  id: string;
  kind: 'arrived' | 'location-once' | 'location-off';
  byRole: Role;
  at: number;
  expiresAt: number | null;
  /** 仅单次授权的粗粒度位置，不落历史库（内存 + 到期删除） */
  label: string;
}

export interface IntimacyCard {
  id: string;
  ownerRole: Role;
  topic: string;
  content: string;
  shared: boolean;
  createdAt: number;
}

export interface SocialReport {
  id: string;
  byRole: Role;
  place: string;
  people: string;
  eta: string;
  at: number;
  withdrawn: boolean;
}

export interface VaultItem {
  id: string;
  ownerRole: Role;
  label: string;
  secret: string;
  granted: Role[];
  views: Array<{ role: Role; at: number }>;
  createdAt: number;
}

export interface WeddingPlan {
  budgetCents: number;
  styles: string[];
  guests: string[];
  dates: string[];
  sharedWithPartner: boolean;
  ownerRole: Role;
  updatedAt: number;
}

export interface Achievement {
  id: string;
  label: string;
  emoji: string;
  unlockedAt: number;
}

/** 年度报告（在 Hub 侧聚合计算，不在客户端拼假数据） */
export interface AnnualReport {
  year: number;
  moviesCount: number;
  movieTypes: Array<{ name: string; count: number }>;
  latestMovieAt: number | null;
  latestMovieTitle: string | null;
  mostMovedTitle: string | null;
  tripsCount: number;
  goalsDone: number;
  goalsTotal: number;
  thanksCount: number;
  milestones: number;
  daysTogether: number;
  topWords: Array<{ word: string; count: number }>;
  travelCount: number;
}

// ===========================================================================
// 系统
// ===========================================================================

export type Gender = 'female' | 'male' | 'other';

export interface Member {
  role: Role;
  name: string;
  /** emoji 头像（未上传图片时使用） */
  avatar: string;
  online: boolean;
  /** 自己上传的头像图片（本地文件），只能改自己的 */
  avatarUri: string | null;
  gender: Gender | null;
  birthDate: string | null;
  /** 由生日推算的年龄 */
  age: number | null;
  /** 是否已完成建档（昵称+生日+性别） */
  profileCompleted: boolean;
  /**
   * 这个人固定的对外 ID（例：TW7K3M9Q）。
   * 绑定不再靠"限时邀请码"，而是让对方搜这个 ID → 双向确认；
   * 没有时效压力，对方不在线也能先把请求发过去。
   */
  publicId: string;
}

export interface AuditEntry {
  id: string;
  at: number;
  actor: Role;
  kind: string;
  detail: string;
}

export interface NotificationRecord {
  id: string;
  at: number;
  toRole: Role;
  kind: string;
  /** 已脱敏的锁屏文案（不含敏感词） */
  text: string;
}

/** 空间外观与关系起点（都由用户自己填，不用随机数） */
export interface SpaceProfile {
  /** App 背景图（相册上传，双方可见） */
  backgroundUri: string | null;
  /** 在一起的开始日期（YYYY-MM-DD），用户可以自己填 */
  startedAt: string | null;
}

export interface UnbindRequest {
  requestedAt: number;
  byRole: Role;
  coolingEndsAt: number;
  status: UnbindStatus;
  dataChoice: Record<Role, DataChoice>;
  confirmed: Role[];
}

/**
 * 空间里发生的一次变化（新增 / 修改 / 删除 / 完成）。
 * 只用来回答一个问题：「TA 刚才在软件里做了什么」。
 * 不含隐私内容：title 取的是这条内容本身的标题，私密档的东西不会进来。
 */
export interface ActivityItem {
  id: string;
  /** 谁做的 */
  byRole: Role;
  action: ActivityAction;
  /** 机器可读的类别，如 'diary' */
  entity: string;
  /** 给人看的中文类别名，如 '日记' */
  entityLabel: string;
  /** 具体是哪一条（标题/摘要），可能为空 */
  title: string;
  at: number;
}

export type ActivityAction = 'add' | 'update' | 'delete' | 'done';

/** 服务端权威状态 */
export interface SpaceState {
  spaceId: string;
  boundAt: number | null;
  members: Record<Role, Member>;
  invite: {
    code: string;
    expireAt: number;
    version: number;
    /** 谁生成的（按角色）——仅作展示，判断"是不是自己的码"要看 createdByClientId */
    createdBy: Role;
    /**
     * 生成者的设备 ID。
     * 用角色判断"自己填自己的码"不可靠：两台设备可能被分到同一个角色
     * （真实事故），那时会用角色相同就把对方当成自己。设备 ID 才是唯一身份。
     */
    createdByClientId: string | null;
  } | null;
  /**
   * 待处理的绑定请求：对方搜我的账号 ID 发来的、等我确认。
   *
   * fromName / fromPublicId 由服务端在投影时补上（账号模型下请求发生在账号之间，
   * 界面需要显示"是谁在请求"，不能只给一个端）。
   */
  bindRequest: {
    fromRole: Role;
    at: number;
    fromName?: string;
    fromPublicId?: string;
  } | null;
  events: CalendarEvent[];
  todos: Todo[];
  shopping: ShoppingItem[];
  chores: Chore[];
  ledger: LedgerEntry[];
  collection: CollectionItem[];
  habits: Habit[];
  goals: Goal[];
  moods: Record<Role, MoodEntry | null>;
  period: Record<Role, PeriodData>;
  careReminders: CareReminder[];
  /** 「我希望被这样照顾」：每人一份，各自维护，不预置 */
  comfort: Record<Role, ComfortItem[]>;
  giftIdeas: GiftIdea[];
  cards: Card[];
  dailyQuestion: DailyQuestion | null;
  voiceNotes: VoiceNote[];
  diary: DiaryEntry[];
  weeklyReviews: WeeklyReview[];
  timeline: TimelineNode[];
  rooms: Record<string, Room>;
  activeRoomId: string | null;
  watchPlans: WatchPlan[];
  /** 一起看队列（从片库选进来的片子） */
  watchQueue: WatchQueueItem[];
  /**
   * 评论区：**按对象隔离**。key 形如 `movie:<片id或片名>` / `moment:<记录id>`，
   * 每个对象各自一池，互不串（和弹幕按片源隔离是一个道理）。
   */
  comments: Record<string, CommentItem[]>;
  /** 游戏库：粘贴进来的小游戏（HTML 单文件）与内置样例 */
  games: GameSpec[];
  /** 焦焦FM 的收听源（独立模块，和影院/直播/游戏库零交叉） */
  fmSources?: import('./jiaojiaoFm').FmSource[];
  /** 一起听的播放进度（独立于影院的 playState） */
  fmProgress?: import('./jiaojiaoFm').FmProgress | null;
  /**
   * 用户自己上传的背景（图片或视频，视频优先用）。
   * 上传后两台手机都用它当满屏背景，且**不加任何暗色遮罩**。
   */
  customBackground?: {
    url: string;
    type: 'image' | 'video';
    accent?: string | null;
    /** 视频首帧截图：客户端在解码出第一帧之前先铺它，不白屏 */
    poster?: string | null;
    updatedAt: number;
    byRole: 'A' | 'B';
  } | null;
  /**
   * 对方此刻在干什么（首页用来提示"TA 在看电影 / 在听歌，快加入一起听"）。
   * surface: app | cinema | room | live | fm | music | games …
   * at: 最后一次心跳时间；超过约 2 分钟没更新就当离线
   */
  presence?: Partial<
    Record<'A' | 'B', { surface: string; detail: string | null; at: number }>
  >;
  /** 当前这一局双人游戏 */
  gameSession: GameSession | null;
  /** 3D 体素世界的存档（两人共用一份） */
  voxelWorld: VoxelWorld;
  /** 应用过的体力模组（只记名字与方块表，形状已经写进存档） */
  voxelMods: Array<{ id: string; name: string; blocks: Array<{ id: number; name: string; color: string }>; createdAt: number }>;
  pickSession: PickSession | null;
  /** 一起听：同步音乐队列与播放状态 */
  music: MusicState;
  /** 空间外观与关系起点 */
  profile: SpaceProfile;
 /** 每日一问：已经用过的题（用完再重置，保证不重复） */
  quizUsed: string[];
  unbind: UnbindRequest | null;
  audit: AuditEntry[];
  notifications: NotificationRecord[];
  /** 空间动态：谁新增/删除了什么（给另一半的提醒用） */
  activity: ActivityItem[];
  /** 在线片库接口：只由一个人管理，两个人共用 */
  cms: CmsSourceConfig;
  /** 电视直播源：同样只由一个人管理，两个人共用 */
  live: LiveSourceConfig;
  // 模块1
  decor: DecorState;
  pet: PetState;
  themes: ThemeState;
  /** 5.8 语音通话（空间级：首页与影院房间共用同一条通话） */
  voice: VoiceCallState;
  // 模块7
  relProfile: RelProfile;
  valuesCard: ValuesCard;
  plans: PlanItem[];
  boundaries: BoundaryItem[];
  conflicts: ConflictEntry[];
  selfAssess: Record<Role, SelfAssessment | null>;
  votes: Vote[];
  ldr: LdrPlan;
  trust: TrustSettings;
  safety: SafetyEvent[];
  intimacy: IntimacyCard[];
  socialReports: SocialReport[];
  vault: VaultItem[];
  wedding: WeddingPlan;
  achievements: Achievement[];
  lastSeq: number;
}

/** 伴侣侧经期投影（private 档返回 null，接口层直接不下发） */
export interface PartnerPeriodProjection {
  tier: Exclude<PeriodTier, 'private'>;
  careHint: boolean;
  date: string;
  predictedDates?: string[];
  records?: Array<{
    startDate: string;
    endDate: string | null;
    flow: FlowLevel | null;
    symptoms: string[];
    moods: string[];
    note: string;
  }>;
  /** 3.10 计划记录只在本人单独开权限后出现 */
  planLog?: Array<{ kind: 'prepare' | 'contraception'; date: string; note: string }>;
}

export interface RoomView {
  id: string;
  code: string;
  codeVersion: number;
  token: string;
  state: RoomState;
  leaderRole: Role;
  mediaState: MediaState;
  movieTitle: string;
  sourceUrl: string | null;
  expireAt: number;
  countdownEndsAt: number | null;
  readiness: Record<Role, boolean>;
  mediaOffset: Record<Role, number>;
  peerOnline: boolean;
  peerJoinedAt: number | null;
  /** 谁在申请加入（不用邀请码的流程）：房主据此显示「同意/拒绝」 */
  joinRequestedBy: Role | null;
  joinRequestedAt: number | null;
  offlineSince: number | null;
  danmaku: Danmaku[];
  reactions: Reaction[];
  recap: Recap | null;
  pendingLeadRequest: Role | null;
  pendingAction: { role: Role; action: 'play' | 'pause' } | null;
  scene: { popcorn: boolean; cat: boolean; blanket: boolean; updatedBy: Role };
  createdAt: number;
  endedAt: number | null;
}

/** 按角色投影后的快照：UI 只吃这个，永远拿不到无权字段 */
export interface SpaceSnapshot {
  role: Role;
  spaceId: string;
  boundAt: number | null;
  /** 待使用的邀请码（已绑定后为 null）；生成方要看到它才能念给 TA */
  invite: {
    code: string;
    expireAt: number;
    createdBy: Role;
    /** 生成者的设备 ID：客户端据此判断"这是不是我自己生成的码" */
    createdByClientId: string | null;
  } | null;
  members: Record<Role, Member>;
  partnerOnline: boolean;
  /** 等我确认的绑定请求（fromRole 是发起方；fromName/fromPublicId 由服务端补） */
  bindRequest: {
    fromRole: Role;
    at: number;
    fromName?: string;
    fromPublicId?: string;
  } | null;
  events: CalendarEvent[];
  todos: Todo[];
  shopping: ShoppingItem[];
  chores: Chore[];
  ledger: LedgerEntry[];
  collection: CollectionItem[];
  habits: Habit[];
  goals: Goal[];
  myMood: MoodEntry | null;
  partnerMood: MoodEntry | null;
  myPeriod: PeriodData;
  partnerPeriod: PartnerPeriodProjection | null;
  careReminders: CareReminder[];
  /** 我自己写的「怎么照顾我」清单 */
  myComfort: ComfortItem[];
  /** TA 写的「怎么照顾 TA」清单：只读，用来照着做 */
  partnerComfort: ComfortItem[];
  giftIdeas: GiftIdea[];
  cards: Card[];
  dailyQuestion: DailyQuestion | null;
  voiceNotes: VoiceNote[];
  diary: DiaryEntry[];
  weeklyReviews: WeeklyReview[];
  timeline: TimelineNode[];
  activeRoom: RoomView | null;
  recaps: Array<{
    id: string;
    movieTitle: string;
    endedAt: number;
    durationSec: number;
    ratings: Partial<Record<Role, number>>;
    reviews: Partial<Record<Role, string>>;
    saved: Role[];
  }>;
  watchPlans: WatchPlan[];
  /** 一起看队列（双方都能看到、都能点播） */
  watchQueue: WatchQueueItem[];
  /** 评论区：按 `movie:<id>` / `moment:<id>` 分池，互不串 */
  comments: Record<string, CommentItem[]>;
  /** 游戏库：粘贴进来的小游戏（HTML 单文件）与内置样例 */
  games: GameSpec[];
  /** 焦焦FM 的收听源（独立模块，和影院/直播/游戏库零交叉） */
  fmSources?: import('./jiaojiaoFm').FmSource[];
  /** 当前这一局双人游戏 */
  gameSession: GameSession | null;
  /** 3D 体素世界存档 */
  voxelWorld: VoxelWorld;
  /** 应用过的模组 */
  voxelMods: Array<{ id: string; name: string; blocks: Array<{ id: number; name: string; color: string }>; createdAt: number }>;
  pickSession: PickSession | null;
  /** 一起听：同步音乐队列与播放状态 */
  music: MusicState;
  profile: SpaceProfile;
  decor: DecorState;
  pet: PetState;
  themes: ThemeState;
  /** 语音通话状态（空间级） */
  voice: VoiceCallState;
  /** RTC 频道名：由 spaceId 派生，两端一致 */
  voiceChannel: string;
  relProfile: RelProfile;
  valuesCard: ValuesCard;
  plans: PlanItem[];
  boundaries: BoundaryItem[];
  conflicts: ConflictEntry[];
  /** 只有自己的自评；对方永远是 null（接口不返回） */
  mySelfAssess: SelfAssessment | null;
  votes: Vote[];
  ldr: LdrPlan;
  trust: TrustSettings;
  safety: SafetyEvent[];
  /** 只含自己创建的 + 对方主动共享的 */
  intimacy: IntimacyCard[];
  socialReports: SocialReport[];
  vault: Array<
    Omit<VaultItem, 'secret'> & {
      canOpen: boolean;
      /** 只有本人创建的那条才带明文；别人的条目服务端根本不下发这个字段 */
      secret?: string;
    }
  >;
  wedding: WeddingPlan | null;
  achievements: Achievement[];
  annual: AnnualReport;
  unbind: UnbindRequest | null;
  audit: AuditEntry[];
  notifications: NotificationRecord[];
  /** 对方的空间动态（只含 TA 做的，最新的在前） */
  activity: ActivityItem[];
  /** 在线片库接口（双方都能读，只有 manager 能改） */
  cms: CmsSourceConfig;
  /** 电视直播源（双方都能读，只有 manager 能改） */
  live: LiveSourceConfig;
  revision: number;
  serverNowMs: number;
}
