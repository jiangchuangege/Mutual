/**
 * Agora RTC Token 服务（本地 Node，仅用于开发/演示环境）
 *
 * 为什么必须有它：Token 鉴权模式要求用 App Certificate 在**服务端**签 token，
 * 证书绝不能进客户端。所以这里提供一个最小可用的签发服务。
 *
 * 启动：
 *   $env:AGORA_APP_ID="你的AppId"
 *   $env:AGORA_APP_CERTIFICATE="你的AppCertificate"
 *   node server/token-server.mjs
 *
 * 客户端配置（app.json）：
 *   "extra": { "rtcAppId": "...", "rtcTokenServer": "http://192.168.1.10:8788" }
 *
 * 注意端口：这个服务默认 8788，同步服务器默认 8787——两个都跑的话不要改成同一个端口。
 *
 * 安全提醒：这是开发用服务，没有鉴权、没有限流。生产必须放在你自己的后端里，
 * 并校验登录态（只有该 Space 的两个成员才能拿到该频道 token）。
 */

import http from 'node:http';

// agora-token 是 CommonJS 包，Node 24 的 ESM 具名导入会直接报
// `SyntaxError: Named export 'RtcRole' not found`，所以必须走 default 再解构。
// 用动态 import 是为了在没有装这个依赖时给出人话提示，而不是甩一坨堆栈。
let RtcTokenBuilder;
let RtcRole;
try {
  const mod = await import('agora-token');
  const pkg = mod.default ?? mod;
  RtcTokenBuilder = pkg.RtcTokenBuilder;
  RtcRole = pkg.RtcRole;
  if (!RtcTokenBuilder || !RtcRole) throw new Error('agora-token 结构不符合预期');
} catch (err) {
  console.error('[twospace] 无法加载 agora-token，请先在 C:\\ts 下执行 npm install。');
  console.error(`[twospace] 具体错误：${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const APP_ID = process.env.AGORA_APP_ID ?? '';
const APP_CERT = process.env.AGORA_APP_CERTIFICATE ?? '';
const PORT = Number(process.env.PORT ?? 8788);
const MAX_EXPIRE = 3600;

function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-max-age': '86400',
    });
    res.end();
    return;
  }

  // 连通性探测（和同步服务器保持同一个形状，方便同一个检测脚本打两处）
  if (url.pathname === '/ping') {
    json(res, 200, {
      ok: true,
      pong: true,
      service: 'twospace-token',
      version: 1,
      mode: APP_CERT ? 'token' : 'appId-only',
      ts: Date.now(),
    });
    return;
  }

  if (url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      configured: Boolean(APP_ID && APP_CERT),
      mode: APP_CERT ? 'token' : 'appId-only',
    });
    return;
  }

  if (url.pathname !== '/token') {
    json(res, 404, { error: 'not found' });
    return;
  }

  const channel = (url.searchParams.get('channel') ?? '').trim();
  const uidRaw = url.searchParams.get('uid') ?? '0';
  const uid = Number(uidRaw);
  const expireRaw = Number(url.searchParams.get('expire') ?? 3600);
  const expire = Math.max(60, Math.min(MAX_EXPIRE, Number.isFinite(expireRaw) ? expireRaw : 3600));

  if (!channel) {
    json(res, 400, { error: '缺少 channel' });
    return;
  }
  if (!Number.isInteger(uid) || uid <= 0 || uid > 2147483647) {
    json(res, 400, { error: 'uid 必须是 1~2^31-1 的整数' });
    return;
  }
  if (!APP_ID) {
    json(res, 500, { error: '服务端未配置 AGORA_APP_ID' });
    return;
  }
  if (!APP_CERT) {
    // 没有证书 → 该 Agora 项目是 App ID 无证书模式，客户端 token 传空串即可
    json(res, 200, { token: '', appId: APP_ID, channel, uid, mode: 'appId-only', expireAt: null });
    return;
  }

  const issuedAt = Date.now();
  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    channel,
    uid,
    RtcRole.PUBLISHER,
    expire,
    expire,
  );
  json(res, 200, {
    token,
    appId: APP_ID,
    channel,
    uid,
    mode: 'token',
    expireAt: issuedAt + expire * 1000,
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const mode = APP_CERT ? 'Token 鉴权模式' : 'App ID 无证书模式（token 为空）';
  console.log(`[twospace] Agora token server on http://0.0.0.0:${PORT}  · ${mode}`);
  if (!APP_ID) console.warn('[twospace] 警告：未设置 AGORA_APP_ID，/token 会返回 500');
  console.log(`[twospace] 自检： curl "http://localhost:${PORT}/health"`);
  console.log(`[twospace] 取 token： curl "http://localhost:${PORT}/token?channel=twospace_dev&uid=1001"`);
});
