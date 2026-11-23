/* eslint-disable */
/**
 * 网络故障分类 + 四步诊断的测试。
 *
 * 用真实的**原生错误文案**（Android/iOS/Node 各一套）来钉住分类结果，
 * 再用手写的 ping / socket 替身验证"到底断在哪一步"。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyNetworkError, diagnoseServer } = require('../dist-core/netDiagnostics.js');
const { checkServerUrl, toWebSocketUrl } = require('../dist-core/serverUrl.js');

// ---------------------------------------------------------------------------
// 1. 错误分类
// ---------------------------------------------------------------------------

test('UnknownHostException → dns（并给出可执行建议）', () => {
  const f = classifyNetworkError(new Error('java.net.UnknownHostException: sync.example.com'));
  assert.equal(f.kind, 'dns');
  assert.match(f.title, /域名解析失败/);
  assert.match(f.advice, /私有 DNS|飞行模式|IP/);
  assert.equal(f.raw.includes('UnknownHostException'), true);
});

test('其它平台的 DNS 文案也能认出来', () => {
  for (const msg of [
    'getaddrinfo ENOTFOUND sync.example.com',
    'nodename nor servname provided, or not known',
    'Name or service not known',
    'unable to resolve host sync.example.com',
  ]) {
    assert.equal(classifyNetworkError(new Error(msg)).kind, 'dns', msg);
  }
});

test('TLS 被重置 → tls，且明确说不是 App 的锅', () => {
  for (const msg of [
    'Recv failure: Connection was reset',
    'SSL handshake failed',
    'schannel: failed to receive handshake',
    'javax.net.ssl.SSLException: Connection reset',
  ]) {
    const f = classifyNetworkError(new Error(msg));
    assert.equal(f.kind, 'tls', msg);
    assert.match(f.advice, /网络|CDN|http:\/\//);
  }
});

test('证书错 ≠ 握手被重置：前者说明网络已经通了', () => {
  for (const msg of [
    'java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.',
    'SSLPeerUnverifiedException: Hostname sync.example.com not verified',
    'Certificate for <1.2.3.4> doesn\'t match any of the subject alternative names',
  ]) {
    const f = classifyNetworkError(new Error(msg));
    assert.equal(f.kind, 'cert', msg);
    assert.match(f.advice, /域��|Cloudflare|证书/);
  }
  // 同样含 SSL 字样，但语义是"被重置"，必须还归到 tls
  assert.equal(classifyNetworkError(new Error('javax.net.ssl.SSLException: Connection reset')).kind, 'tls');
});

test('超时 / 拒连 / 没网 各自归位', () => {
  assert.equal(classifyNetworkError(new Error('ETIMEDOUT')).kind, 'timeout');
  assert.equal(classifyNetworkError(new Error('connect ETIMEDOUT 1.2.3.4:8787')).kind, 'timeout');
  assert.equal(classifyNetworkError(new Error('ECONNREFUSED 127.0.0.1:8787')).kind, 'refused');
  assert.equal(classifyNetworkError(new Error('Network is unreachable')).kind, 'offline');
});

test('完全未知的错误也不会甩空话', () => {
  const f = classifyNetworkError(undefined);
  assert.equal(f.kind, 'unknown');
  assert.ok(f.title.length > 0);
  assert.ok(f.advice.length > 0);
  assert.ok(f.raw.length > 0);
});

test('字符串 / 对象入参都能处理', () => {
  assert.equal(classifyNetworkError('java.net.UnknownHostException: a.b').kind, 'dns');
  assert.equal(classifyNetworkError({ code: 'ECONNREFUSED' }).kind, 'refused');
});

// ---------------------------------------------------------------------------
// 2. 四步诊断
// ---------------------------------------------------------------------------

const deps = (over) => ({
  ping: async () => ({ ok: true, text: '连接正常', detail: '/ping 返回 {"ok":true}' }),
  openSocket: async () => ({ ok: true, detail: 'wss 升级成功' }),
  ...over,
});

test('全部通过时 summary 是明确的"可以连"', async () => {
  const report = await diagnoseServer(
    'https://sync.example.com',
    deps(),
    checkServerUrl,
    toWebSocketUrl,
  );
  assert.equal(report.ok, true);
  assert.equal(report.failedAt, null);
  assert.deepEqual(report.steps.map((s) => s.id), ['url', 'ping', 'websocket']);
  assert.match(report.summary, /全部通过/);
});

test('地址不合法：第一步就停，不再去打网络', async () => {
  let pinged = false;
  const report = await diagnoseServer(
    'ftp://a.b',
    deps({ ping: async () => ((pinged = true), { ok: true, text: '', detail: '' }) }),
    checkServerUrl,
    toWebSocketUrl,
  );
  assert.equal(report.ok, false);
  assert.equal(report.failedAt, 'url');
  assert.equal(pinged, false);
  assert.equal(report.steps.length, 1);
});

test('DNS 挂掉：报在 HTTP 探测这一步，且说清是解析问题', async () => {
  const report = await diagnoseServer(
    'https://sync.example.com',
    deps({
      ping: async () => {
        throw new Error('java.net.UnknownHostException: sync.example.com');
      },
    }),
    checkServerUrl,
    toWebSocketUrl,
  );
  assert.equal(report.ok, false);
  assert.equal(report.failedAt, 'ping');
  const ping = report.steps.find((s) => s.id === 'ping');
  assert.equal(ping.ok, false);
  assert.match(ping.detail, /域名解析失败/);
  assert.match(report.summary, /HTTP 层就不通/);
});

test('HTTP 通但 WebSocket 升不上去：告诉用户会自动回退，功能不受影响', async () => {
  const report = await diagnoseServer(
    'http://192.168.1.10:8787',
    deps({
      openSocket: async () => ({ ok: false, detail: '服务器返回 400（没有 upgrade 处理）' }),
    }),
    checkServerUrl,
    toWebSocketUrl,
  );
  assert.equal(report.ok, false);
  assert.equal(report.failedAt, 'websocket');
  assert.match(report.summary, /回退到长轮询|sync-server/);
});

test('诊断走的是 http→ws、https→wss', async () => {
  const seen = [];
  await diagnoseServer(
    'https://a.b',
    deps({
      openSocket: async (u) => (seen.push(u), { ok: true, detail: 'ok' }),
    }),
    checkServerUrl,
    toWebSocketUrl,
  );
  await diagnoseServer(
    'http://1.2.3.4:8787',
    deps({
      openSocket: async (u) => (seen.push(u), { ok: true, detail: 'ok' }),
    }),
    checkServerUrl,
    toWebSocketUrl,
  );
  assert.deepEqual(seen, ['wss://a.b', 'ws://1.2.3.4:8787']);
});
