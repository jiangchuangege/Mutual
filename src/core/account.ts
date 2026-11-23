/**
 * 账号（客户端这一侧）。
 *
 * 产品规则只有一条：**账号不一样，就是不同的账户**。
 *  - 每个人注册一个账号，账号 ID 唯一（形如 TW8K3M9Q），带 6 位登录码
 *  - 一台手机登录一个账号；换手机用「账号 ID + 登录码」登录，数据跟着账号走
 *  - 两台账号互相确认后组成一个双人空间；空间里有两个槽位，但那是**内部实现**，
 *    界面上永远不出现「A 端 / B 端」这种东西
 *
 * 这里只负责三件事：本地保存登录状态、账号 ID 规范化、给 UI 用的展示信息。
 * 网络请求都在 core/remoteSync.ts，界面不直接碰。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Role } from './types';

/** 登录状态：token 是服务端发的，账号 ID 用于界面显示 */
export interface AccountSession {
  accountId: string;
  token: string;
  /** 这个账号属于哪台服务器（换服务器要重新登录） */
  server: string;
  /** 注册/登录成功的时间 */
  since: number;
}

const ACCOUNT_KEY = 'twospace::account';

/** 账号 ID 的字符集（和服务端一致）：去掉了容易看错的 0/1/I/O */
const ID_RE = /^TW[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,8}$/;

/** 用户输入 → 规范账号 ID：去空格/横线、转大写 */
export function normalizeAccountId(raw: string): string {
  return String(raw ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .slice(0, 12);
}

/** 长得像不像一个账号 ID（用来在输入时给即时反馈，不做强校验） */
export function looksLikeAccountId(raw: string): boolean {
  return ID_RE.test(normalizeAccountId(raw));
}

/** 登录码：6 位数字 */
export function isValidPin(raw: string): boolean {
  return /^\d{6}$/.test(String(raw ?? '').trim());
}

/**
 * 从快照的两个槽位里，判断「我」到底在哪一格。
 *
 * 为什么需要这个"硬自愈"：空间里每个槽位都带着那个人的**账号 ID**
 * （`members.X.publicId` 就是他的账号 ID），而我的账号 ID 是本地 token 对应的、
 * 绝对不会变。所以判断"我在哪一格"其实是一道**确定性**的题，不该依赖
 * 服务端告诉我们槽位，也不该依赖连接时机。
 *
 * 真实事故：她注册时是自己个人空间的 A，被绑进对方的空间后应该变成 B，
 * 但她的手机没有及时更新槽位 —— 于是她把对方（wrw）的档案当成自己显示，
 * 看起来像"我注册的 oo 变成了 wrw"。
 */
export function resolveMyRole(
  accountId: string,
  members: { A?: { publicId?: string }; B?: { publicId?: string } } | null | undefined,
): Role | null {
  if (!accountId) return null;
  const a = members?.A?.publicId || '';
  const b = members?.B?.publicId || '';
  if (a && a === accountId) return 'A';
  if (b && b === accountId) return 'B';
  return null;
}

/** 生日输入规范化：把用户随手写的日期补成 YYYY-MM-DD。
 *
 * 为什么要做：让人"必须补零"是最烦的输入体验（`2000-2-11` 明明一眼就对，
 * 却被判成格式错误，点了创建没反应——真实事故）。这里接受
 * `2000-2-11` / `2000/2/11` / `2000.2.11` / `20000211` / `2000年2月11日`，
 * 统一成 `2000-02-11`。实在解析不出来才返回空串。
 */
export function normalizeBirthDate(raw: string): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  // 纯数字：20000211
  const digits = text.replace(/\D/g, '');
  if (digits.length === 8 && !/[-/.年月日]/.test(text)) {
    const y = digits.slice(0, 4);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  const m = text.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export async function loadAccountSession(): Promise<AccountSession | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountSession>;
    if (!parsed || typeof parsed.accountId !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }
    if (!parsed.token) return null;
    return {
      accountId: normalizeAccountId(parsed.accountId),
      token: parsed.token,
      server: typeof parsed.server === 'string' ? parsed.server : '',
      since: typeof parsed.since === 'number' ? parsed.since : Date.now(),
    };
  } catch {
    return null;
  }
}

export async function saveAccountSession(session: AccountSession | null): Promise<void> {
  try {
    if (!session) {
      await AsyncStorage.removeItem(ACCOUNT_KEY);
      return;
    }
    await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(session));
  } catch {
    // 存不下也不影响本次使用
  }
}
