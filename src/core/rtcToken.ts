/**
 * Token 鉴权客户端：向自建/自有 token 服务取短期 token。
 * 证书只存在服务端；客户端只拿到 token 字符串。
 */

export interface RtcRuntimeConfig {
  appId: string;
  tokenServer: string;
}

export type TokenMode = 'token' | 'appId-only' | 'none';

export interface TokenResult {
  /** App ID 无证书模式下为空字符串（合法），失败时为 null */
  token: string | null;
  mode: TokenMode;
  expireAt: number | null;
  error: string | null;
}

export function uidForRole(role: 'A' | 'B'): number {
  return role === 'A' ? 1001 : 1002;
}

/** 请求 token；服务端是 App ID 无证书模式时返回空字符串 */
export async function fetchRtcToken(
  tokenServer: string,
  channel: string,
  uid: number,
  timeoutMs = 6000,
): Promise<TokenResult> {
  const base = tokenServer.replace(/\/+$/, '');
  const url = `${base}/token?channel=${encodeURIComponent(channel)}&uid=${uid}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!res.ok) {
      return {
        token: null,
        mode: 'none',
        expireAt: null,
        error: `获取语音 token 失败（HTTP ${res.status}）`,
      };
    }
    const body = (await res.json()) as {
      token?: string;
      mode?: string;
      expireAt?: number | null;
      error?: string;
    };
    if (body.error) {
      return { token: null, mode: 'none', expireAt: null, error: `获取语音 token 失败：${body.error}` };
    }
    if (typeof body.token !== 'string') {
      return { token: null, mode: 'none', expireAt: null, error: 'token 服务返回格式不正确' };
    }
    return {
      token: body.token,
      mode: body.mode === 'token' ? 'token' : 'appId-only',
      expireAt: body.expireAt ?? null,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { token: null, mode: 'none', expireAt: null, error: `连接 token 服务失败：${msg}` };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
