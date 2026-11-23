/**
 * 服务器地址的解析、校验与协议推导。
 *
 * 这个文件刻意**不引入任何 React Native 依赖**，所以能直接编译进 dist-core、
 * 在 node 里跑单测（`tests/connection.test.js`），不用起模拟器就能验。
 */

/** 公网同步服务器（WebSocket + HTTPS） */
/**
/**
 * 默认同步服务器地址。
 * 仓库里只留占位符；自己的部署地址用环境变量注入（打包机设置即可），不写进公开代码：
 *   EXPO_PUBLIC_SERVER_URL=https://你的域名
 */
const ENV_URL = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.EXPO_PUBLIC_SERVER_URL;
export const DEFAULT_SERVER_URL =
  ENV_URL && /^https?:\/\//i.test(ENV_URL) ? ENV_URL : 'https://sync.example.com';

export type HostKind = 'loopback' | 'private' | 'public' | 'invalid';

export interface UrlCheck {
  ok: boolean;
  /** 规范化之后的地址（ok=false 时是原样返回，方便回填输入框） */
  url: string;
  /** 致命错误：不能保存 */
  error: string | null;
  /** 非致命提醒：能连，但要告诉用户代价 */
  warnings: string[];
  hostKind: HostKind;
  isHttps: boolean;
}

/**
 * 规范化用户输入：
 * - 去掉首尾空格与末尾多余的 `/`
 * - 没写协议时按 `https://` 处理（公网默认就是 https，别逼用户自己敲）
 * - 协议名统一小写
 */
export function normalizeServerUrl(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) return DEFAULT_SERVER_URL;
  const withScheme = /^[a-z][a-z0-9+.\-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const m = /^([a-z][a-z0-9+.\-]*):\/\/(.*)$/i.exec(withScheme);
  if (!m) return withScheme.replace(/\/+$/, '');
  const scheme = m[1].toLowerCase();
  const rest = m[2].replace(/\/+$/, '');
  return `${scheme}://${rest}`;
}

/** 取出 hostname（不带端口），解析失败返回空串 */
export function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.\-]*:\/\/([^/?#]+)/i.exec((url ?? '').trim());
  if (!m) return '';
  let host = m[1];
  // 去掉 user:pass@
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  // 去掉端口（IPv6 用方括号包着，里面的冒号不能当端口分隔）
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end > 0 ? host.slice(0, end + 1) : host;
  }
  const colon = host.indexOf(':');
  return colon >= 0 ? host.slice(0, colon) : host;
}

export function describeHost(url: string): HostKind {
  const host = hostOf(url).toLowerCase();
  if (!host) return 'invalid';
  if (host === 'localhost' || host === '[::1]' || host === '::1' || /^127\./.test(host)) {
    return 'loopback';
  }
  // 局域网私有段：能用，但只在自家 Wi-Fi 里有意义
  if (/^10\./.test(host)) return 'private';
  if (/^192\.168\./.test(host)) return 'private';
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'private';
  if (/\.local$/.test(host)) return 'private';
  return 'public';
}

export function isLoopbackHost(url: string): boolean {
  return describeHost(url) === 'loopback';
}

/**
 * 校验服务器地址。
 *
 * 只对「能用但有代价」的情况给提醒（本机地址、局域网地址）。
 * **http 不影响语音**：语音走 Agora 的原生 RTC 通道，根本不经过这个服务器，
 * 所以服务端填 http 还是 https 与能不能开麦无关（实测 http 语音正常）。
 */
export function checkServerUrl(input: string): UrlCheck {
  const url = normalizeServerUrl(input);
  const scheme = (/^([a-z][a-z0-9+.\-]*):\/\//i.exec(url)?.[1] ?? '').toLowerCase();
  const hostKind = describeHost(url);

  const base: UrlCheck = {
    ok: false,
    url,
    error: null,
    warnings: [],
    hostKind,
    isHttps: scheme === 'https',
  };

  if (scheme !== 'http' && scheme !== 'https') {
    return {
      ...base,
      error: '地址要以 http:// 或 https:// 开头（WebSocket 会自动转换，不用手填 wss://）',
    };
  }
  if (hostKind === 'invalid') {
    return { ...base, error: '这个地址里没有有效的主机名' };
  }
  if (/\s/.test(url)) {
    return { ...base, error: '地址里不能有空格' };
  }

  const warnings: string[] = [];
  if (scheme === 'http' && hostKind === 'loopback') {
    warnings.push('这是本机地址，只在你自己这台电脑上调试时有意义');
  }
  if (scheme === 'http' && hostKind === 'private') {
    warnings.push('局域网地址：两台手机必须连同一个 Wi-Fi 才能互通');
  }
  // 注意：这里**不再**警告"http 不能用语音"。
  // 语音走的是 Agora 的原生 RTC 通道，根本不经过这个 HTTP 服务器，
  // 所以服务端是 http 还是 https 跟能不能开麦没有任何关系（实测 http 语音正常）。

  return { ...base, ok: true, warnings };
}

/**
 * http(s) → ws(s)。
 * `https://<你的服务器地址>` → `wss://<你的服务器域名>`
 *
 * path 默认空串：长连接直接挂在根路径上；如果你的服务端挂在 `/ws`，
 * 把 `WS_PATH` 传进来即可，不用改别的地方。
 */
export const WS_PATH = '';

export function toWebSocketUrl(httpUrl: string, path: string = WS_PATH): string {
  const url = normalizeServerUrl(httpUrl);
  const scheme = (/^([a-z][a-z0-9+.\-]*):\/\//i.exec(url)?.[1] ?? 'https').toLowerCase();
  const ws = scheme === 'http' ? 'ws' : 'wss';
  const rest = url.slice(url.indexOf('://') + 3);
  const suffix = !path ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${ws}://${rest}${suffix}`;
}

/** 连通性探测地址：规格要求打 `/ping` */
export function toPingUrl(httpUrl: string): string {
  const url = normalizeServerUrl(httpUrl);
  // 已经写了具体路径就直接用，避免把用户自定义的探测地址改坏
  if (/\/[a-z0-9._~%-]+$/i.test(url) && !/^https?:\/\/[^/]+\/?$/i.test(url)) return url;
  return `${url}/ping`;
}

/** 兼容旧版 HTTP 服务端的健康检查地址 */
export function toHealthUrl(httpUrl: string): string {
  return `${normalizeServerUrl(httpUrl)}/health`;
}

export interface ServerCandidate {
  url: string;
  warnings: string[];
  isHttps: boolean;
  hostKind: HostKind;
}

/**
 * 主地址 + 备用地址 → 按顺序尝试的候选列表。
 *
 * 为什么需要：公网域名可能在**某些网络链路上被按域名拦掉**（DNS 和端口都正常，
 * 唯独 TLS 握手被重置），但同一个服务用局域网 IP 就能连。
 * 与其让用户在设置页里来回改，不如两个都填上，连不上自动换下一个。
 *
 * 规则：
 * - 非法地址直接丢弃（不占位、不报错，界面上另有实时校验）
 * - 规范化后去重（避免主备填成同一个）
 * - 最多 3 个，再多只会拖慢失败反馈
 */
export function buildServerCandidates(
  primary: string,
  ...rest: Array<string | null | undefined>
): ServerCandidate[] {
  const out: ServerCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of [primary, ...rest]) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const check = checkServerUrl(raw);
    if (!check.ok) continue;
    if (seen.has(check.url)) continue;
    seen.add(check.url);
    out.push({
      url: check.url,
      warnings: check.warnings,
      isHttps: check.isHttps,
      hostKind: check.hostKind,
    });
    if (out.length >= 3) break;
  }
  return out;
}

/** 该地址是否"公网 http"（语音一定用不了的那种） */
export function isPublicHttp(candidate: ServerCandidate): boolean {
  return !candidate.isHttps && candidate.hostKind === 'public';
}
