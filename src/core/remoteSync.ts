/**
 * 远程同步客户端（账号模型）。
 *
 * 所有请求都带 `Authorization: Bearer <token>`：服务端凭 token 认账号，
 * 再由账号找到它所在的双人空间。**客户端不再告诉服务端"我是 A 还是 B"**，
 * 端只是空间内部的槽位，界面上永远不出现。
 *
 * - createAccountOnServer / loginOnServer：拿 token
 * - fetchMe：账号 + 对方 + 绑定状态（连接后立刻对齐一次）
 * - rpcOnServer：所有写操作转发给服务端执行（服务端是唯一权威）
 * - waitForChange：20 秒长轮询，服务端状态一变就返回
 * - pairRequest / pairAccept / pairDecline / pairReset：两台账号之间的绑定动作
 */

import type { Gender, Result, Role, SpaceState } from './types';

export interface AccountCreated {
  accountId: string;
  token: string;
  pairId: string;
  role: Role;
  bound: boolean;
}

export interface AccountProfileInput {
  name: string;
  birthDate: string;
  gender: Gender;
  avatarUri?: string | null;
  pin: string;
  deviceId?: string;
}

export interface MeResult {
  account: {
    id: string;
    name: string;
    gender: Gender | null;
    birthDate: string | null;
    avatarUri: string | null;
    role: Role;
  };
  pair: { id: string; bound: boolean; boundAt: number | null; pending: { fromName: string; at: number } | null };
  partner: { id: string; name: string; gender: Gender | null; publicId: string } | null;
  rev: number;
}

function base(serverUrl: string): string {
  return serverUrl.trim().replace(/\/+$/, '');
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms = 12_000): Promise<T> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
  try {
    return await fn(controller?.signal as AbortSignal);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes('abort') ? '连接服务器超时' : `连接失败：${msg}`;
}

async function postJson<T>(
  serverUrl: string,
  path: string,
  body: unknown,
  token?: string,
  ms = 12_000,
): Promise<Result<T>> {
  if (!/^https?:\/\//i.test(serverUrl.trim())) {
    return { ok: false, error: '服务器地址需要以 http:// 或 https:// 开头' };
  }
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${base(serverUrl)}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body ?? {}),
        signal,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        value?: T;
        error?: string;
        code?: 'auth' | 'retry';
      };
      if (!res.ok || !payload.ok) {
        const code =
          payload.code === 'auth' || payload.code === 'retry'
            ? payload.code
            : res.status === 401
              ? ('auth' as const)
              : undefined;
        const base = {
          ok: false as const,
          error: payload.error ?? (res.status === 401 ? '登录状态已失效，请重新登录' : `服务器返回 ${res.status}`),
        };
        return code ? { ...base, code } : base;
      }
      return { ok: true, value: payload.value as T };
    }, ms);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

/** 注册账号：昵称/生日/性别/头像 + 6 位登录码 */
export function createAccountOnServer(
  serverUrl: string,
  input: AccountProfileInput,
): Promise<Result<AccountCreated>> {
  return postJson<AccountCreated>(serverUrl, '/api/account/create', input);
}

/** 登录已有的账号：账号 ID + 登录码 */
export function loginOnServer(
  serverUrl: string,
  input: { accountId: string; pin: string; deviceId?: string },
): Promise<Result<AccountCreated>> {
  return postJson<AccountCreated>(serverUrl, '/api/account/login', input);
}

/** 账号现状：我是谁、对方是谁、绑定到没有 */
export async function fetchMe(serverUrl: string, token: string): Promise<Result<MeResult>> {
  if (!token) return { ok: false, error: '请先登录账号' };
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${base(serverUrl)}/api/account/me`, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        value?: MeResult;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        return {
          ok: false,
          error: payload.error ?? (res.status === 401 ? '登录状态已失效，请重新登录' : `服务器返回 ${res.status}`),
        };
      }
      return { ok: true, value: payload.value as MeResult };
    }, 10_000);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function rpcOnServer(
  serverUrl: string,
  token: string,
  method: string,
  args: unknown[],
): Promise<Result<unknown>> {
  if (!token) return { ok: false, error: '请先登录账号' };
  return postJson<unknown>(serverUrl, '/api/rpc', { method, args }, token, 10_000);
}

/** 搜对方账号 ID 发绑定请求 */
export function pairRequestOnServer(
  serverUrl: string,
  token: string,
  targetId: string,
): Promise<Result<{ paired: boolean }>> {
  return postJson<{ paired: boolean }>(serverUrl, '/api/pair/request', { targetId }, token);
}

/** 同意待处理的绑定请求 */
export function pairAcceptOnServer(
  serverUrl: string,
  token: string,
): Promise<Result<{ paired: boolean }>> {
  return postJson<{ paired: boolean }>(serverUrl, '/api/pair/accept', {}, token);
}

/** 拒绝对方的请求 / 撤回自己的请求 */
export function pairDeclineOnServer(serverUrl: string, token: string): Promise<Result<null>> {
  return postJson<null>(serverUrl, '/api/pair/decline', {}, token);
}

/**
 * 解绑并各自清空（「我们重来一次」）。
 *
 * 两个账号都保留（昵称/生日/头像还在账号上），空间各自回到"未绑定、没有数据"。
 */
export function pairResetOnServer(serverUrl: string, token: string): Promise<Result<null>> {
  return postJson<null>(serverUrl, '/api/pair/reset', {}, token, 15_000);
}

/** 用本机数据把服务端空间恢复出来（服务端确实是空的时候才生效） */
export function restoreSpaceOnServer(
  serverUrl: string,
  token: string,
  state: SpaceState,
): Promise<Result<{ bound: boolean }>> {
  return postJson<{ bound: boolean }>(serverUrl, '/api/restore', { state }, token, 15_000);
}

export interface WaitResult {
  rev: number;
  /** 服务端认定我在空间里的槽位（绑定后会从 A 变成 B，必须每次都采纳） */
  role?: Role;
  state: SpaceState;
}

/** 长轮询：状态变化或 20 秒到点都会返回；返回 null 表示请求被中断 */
export async function waitForChange(
  serverUrl: string,
  token: string,
  sinceRev: number,
): Promise<WaitResult | null> {
  if (!token) return null;
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${base(serverUrl)}/api/wait?rev=${sinceRev}`, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        ok?: boolean;
        rev?: number;
        role?: Role;
        state?: SpaceState;
      };
      if (!body.ok || typeof body.rev !== 'number' || !body.state) return null;
      return { rev: body.rev, role: body.role, state: body.state };
    }, 26_000);
  } catch {
    return null;
  }
}

export interface PingResult {
  ok: boolean;
  /** 给 UI 直接显示的结论（规格要求这两句） */
  text: '连接正常' | '无法连接服务器';
  detail: string;
}

/**
 * 连通性探测：按规格打 `/ping`。
 *
 * 老版本服务端只有 `/health`，所以 ping 失败时再试一次 /health——
 * 这样同一个按钮既能测公网服务端，也能测本地开发服务端。
 */
export async function pingServer(serverUrl: string): Promise<PingResult> {
  const baseUrl = base(serverUrl);
  const probe = async (path: string): Promise<string | null> => {
    try {
      return await withTimeout(async (signal) => {
        const res = await fetch(`${baseUrl}${path}`, { method: 'GET', signal });
        if (!res.ok) return null;
        const text = await res.text();
        return text.slice(0, 120);
      }, 8_000);
    } catch {
      return null;
    }
  };

  const ping = await probe('/ping');
  if (ping !== null) {
    return { ok: true, text: '连接正常', detail: `/ping 返回 ${ping.trim() || 'ok'}` };
  }
  const health = await probe('/health');
  if (health !== null) {
    return { ok: true, text: '连接正常', detail: `/health 可用（老版本服务端）：${health.trim()}` };
  }
  return {
    ok: false,
    text: '无法连接服务器',
    detail: '两个探测地址都没有响应，检查地址、网络或服务器是否在运行',
  };
}

/**
 * 服务器健康状态。
 *
 * 账号模型下 `/health` **不含任何个人信息**（只有账号数、空间数），
 * 所以这里能显示的东西有限——这是有意的：谁都能访问这个地址。
 */
export async function checkServerHealth(serverUrl: string): Promise<{ ok: boolean; text: string }> {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${base(serverUrl)}/health`, { method: 'GET', signal });
      const body = (await res.json()) as {
        ok?: boolean;
        rev?: number;
        version?: number;
        model?: string;
        accounts?: number;
        pairs?: number;
        boundPairs?: number;
      };
      if (!body.ok) return { ok: false, text: '服务器未就绪' };
      if (body.model !== 'account') {
        return {
          ok: false,
          text: '这台服务器还是旧版（端分配模型），请更新后端的 server/sync-server.mjs',
        };
      }
      return {
        ok: true,
        text: `rev ${body.rev} · ${body.accounts ?? 0} 个账号 · ${body.boundPairs ?? 0} 对已绑定`,
      };
    }, 8_000);
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  }
}
