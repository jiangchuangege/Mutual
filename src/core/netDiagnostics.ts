/**
 * 网络故障分类与诊断。
 *
 * 为什么需要它：App 连不上服务器时，原生层抛回来的往往只有一句
 * `Network request failed` 或 `java.net.UnknownHostException`，
 * 用户和开发者都看不出**到底断在哪一步**。而这个区别非常关键：
 *
 *   域名解析失败（DNS）  → 改设备 DNS / 等负缓存过期 / 换地址，跟服务器代码无关
 *   TLS 握手被重置       → 网络中间设备挡了（Cloudflare IP 在国内常见），换网络或换直连地址
 *   连接超时             → 防火墙 / 端口没开 / 隧道没起
 *   HTTP 4xx/5xx         → 服务器在，但路由或配置不对
 *
 * 这里把常见的原生错误文案归成几类，并给出**可执行**的建议。
 * 纯函数，不碰网络，可在 node 里单测。
 */

export type NetFailureKind =
  | 'dns'
  | 'tls'
  | 'cert'
  | 'timeout'
  | 'refused'
  | 'offline'
  | 'http'
  | 'unknown';

export interface NetFailure {
  kind: NetFailureKind;
  /** 给用户看的一句话结论 */
  title: string;
  /** 往哪一步查、怎么改 */
  advice: string;
  /** 原始错误文案（保留，方便贴给服务端排查） */
  raw: string;
}

/**
 * 把错误归因。参数既可以是 Error，也可以是原生抛回来的字符串。
 */
export function classifyNetworkError(err: unknown): NetFailure {
  const raw =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
        ? err
        : err === null || err === undefined
          ? ''
          : JSON.stringify(err);
  const text = raw.toLowerCase();

  // ---- DNS ----
  if (
    text.includes('unknownhostexception') ||
    text.includes('unable to resolve host') ||
    text.includes('getaddrinfo') ||
    text.includes('enotfound') ||
    text.includes('nodename nor servname') ||
    text.includes('name or service not known') ||
    text.includes('dns')
  ) {
    return {
      kind: 'dns',
      title: '域名解析失败',
      advice:
        '手机查不到这个域名。先在电脑上确认解析是否正常（nslookup 你的域名 8.8.8.8）；' +
        '手机上把「私有 DNS」设成 dns.google，或开关一次飞行模式清掉旧的解析缓存；' +
        '也可以先改用局域网 IP 地址。',
      raw,
    };
  }

  // ---- 证书问题（TLS 握手其实成功了，只是证书不匹配）----
  // 这一类和"握手被重置"必须分开：证书错说明**网络通到了服务器**，
  // 这种情况换成正确的域名/关闭代理即可，不是链路拦截。
  if (
    text.includes('certificate') ||
    text.includes('cert') ||
    text.includes('trust anchor') ||
    text.includes('hostnameverifier') ||
    text.includes('sslpeerunverified')
  ) {
    return {
      kind: 'cert',
      title: '证书校验失败',
      advice:
        '能连到服务器，但证书和域名对不上：确认填的是域名（不是 IP），' +
        '并检查 Cloudflare 的 SSL/TLS 模式（建议 Full 或 Full strict）。',
      raw,
    };
  }

  // ---- TLS / 握手被重置 ----
  if (
    text.includes('ssl') ||
    text.includes('tls') ||
    text.includes('handshake') ||
    text.includes('connection reset') ||
    text.includes('econnreset') ||
    text.includes('recv failure')
  ) {
    return {
      kind: 'tls',
      title: '安全连接建立失败（TLS 被重置）',
      advice:
        '域名解析和端口都没问题，但 HTTPS 握手被中途打断。这通常是网络链路/中间设备按域名挡了 CDN，' +
        '不是 App 或服务器代码的问题：换一个网络（手机流量 vs Wi-Fi）试试，' +
        '或在「备用地址」里填局域网 IP 让 App 自动切换。',
      raw,
    };
  }

  // ---- 超时 ----
  if (text.includes('timeout') || text.includes('timed out') || text.includes('etimedout')) {
    return {
      kind: 'timeout',
      title: '连接超时',
      advice:
        '大概率是端口没对外开放或隧道没起来：确认服务器在跑、防火墙放行、' +
        'Cloudflare 隧道指向的是本机 8787；局域网直连时确认手机和电脑在同一 Wi-Fi。',
      raw,
    };
  }

  // ---- 拒绝连接 ----
  if (
    text.includes('econnrefused') ||
    text.includes('connection refused') ||
    text.includes('failed to connect to')
  ) {
    return {
      kind: 'refused',
      title: '对方拒绝连接',
      advice:
        '地址和端口是对的，但那个端口上没有服务在监听：确认 npm run backend 还在跑，' +
        '并且监听的是 0.0.0.0（而不是只监听 127.0.0.1）。',
      raw,
    };
  }

  // ---- 没网 ----
  if (text.includes('network is unreachable') || text.includes('no address associated')) {
    return {
      kind: 'offline',
      title: '设备没有网络',
      advice: '先确认这台设备本身能不能上网（开个网页试试）。',
      raw,
    };
  }

  return {
    kind: 'unknown',
    title: '连接失败',
    advice: '先点「测试连接」看是不是 /ping 都打不通；再看服务器日志有没有收到请求。',
    raw: raw || '没有拿到具体错误信息',
  };
}

export type DiagStepId = 'url' | 'https' | 'ping' | 'websocket';

export interface DiagStep {
  id: DiagStepId;
  label: string;
  ok: boolean;
  /** 这一步的结论（成功给关键信息，失败给原因） */
  detail: string;
}

export interface DiagReport {
  ok: boolean;
  /** 第一个失败的环节；全通过为 null */
  failedAt: DiagStepId | null;
  steps: DiagStep[];
  /** 综合结论 + 接下来该做什么 */
  summary: string;
}

/** 诊断用的最小依赖（方便在测试里替换掉真实网络） */
export interface DiagDeps {
  ping: (url: string) => Promise<{ ok: boolean; text: string; detail: string }>;
  openSocket: (wsUrl: string, timeoutMs: number) => Promise<{ ok: boolean; detail: string }>;
  timeoutMs?: number;
}

/**
 * 四步诊断：地址是否合法 → HTTPS /ping 通不通 → WebSocket 能不能升级。
 *
 * 关键点：**每一步单独报错**。这样"到底断在 DNS、TLS 还是 WebSocket 升级"
 * 一眼就能看出来，而不是笼统的一句"连不上"。
 */
export async function diagnoseServer(
  rawUrl: string,
  deps: DiagDeps,
  checkUrl: (u: string) => { ok: boolean; url: string; error: string | null; isHttps: boolean },
  toWs: (u: string) => string,
): Promise<DiagReport> {
  const steps: DiagStep[] = [];
  const timeoutMs = deps.timeoutMs ?? 6000;

  // 1) 地址
  const check = checkUrl(rawUrl);
  if (!check.ok) {
    steps.push({
      id: 'url',
      label: '地址格式',
      ok: false,
      detail: check.error ?? '地址不合法',
    });
    return {
      ok: false,
      failedAt: 'url',
      steps,
      summary: `地址本身就不对：${check.error ?? '不合法'}`,
    };
  }
  steps.push({
    id: 'url',
    label: '地址格式',
    ok: true,
    detail: `${check.url}${check.isHttps ? '（HTTPS）' : '（HTTP 明文）'}`,
  });

  // 2) HTTPS / HTTP 探测
  let pingOk = false;
  let pingDetail = '';
  try {
    const res = await deps.ping(check.url);
    pingOk = res.ok;
    pingDetail = res.ok ? res.detail : res.detail || res.text;
  } catch (err) {
    const f = classifyNetworkError(err);
    pingDetail = `${f.title} — ${f.advice}`;
  }
  steps.push({
    id: 'ping',
    label: `HTTP 探测 ${check.isHttps ? 'HTTPS' : 'HTTP'}`,
    ok: pingOk,
    detail: pingDetail || (pingOk ? '连接正常' : '打不通 /ping'),
  });
  if (!pingOk) {
    return {
      ok: false,
      failedAt: 'ping',
      steps,
      summary: `HTTP 层就不通了：${pingDetail || '打不通 /ping'}。先解决这一步，WebSocket 不可能通。`,
    };
  }

  // 3) WebSocket 升级
  const wsUrl = toWs(check.url);
  let wsOk = false;
  let wsDetail = '';
  try {
    const res = await deps.openSocket(wsUrl, timeoutMs);
    wsOk = res.ok;
    wsDetail = res.detail;
  } catch (err) {
    const f = classifyNetworkError(err);
    wsDetail = `${f.title} — ${f.advice}`;
  }
  steps.push({ id: 'websocket', label: 'WebSocket 升级', ok: wsOk, detail: wsDetail });
  if (!wsOk) {
    return {
      ok: false,
      failedAt: 'websocket',
      steps,
      summary:
        'HTTP 通了但长连接升不上去。服务端要是只做了 HTTP（没有 upgrade 处理）就会这样——' +
        'App 会自动回退到长轮询，功能不受影响；想用长连接就在 8787 上跑本项目的 sync-server（它同时支持两种）。',
    };
  }

  return {
    ok: true,
    failedAt: null,
    steps,
    summary: '全部通过：域名解析、HTTPS、/ping、WebSocket 都没问题，可以正常连接。',
  };
}
