/* eslint-disable */
/**
 * 同一端口双通道验收（账号模型）：
 *   - HTTP 长轮询（/api/account/*、/api/rpc、/api/wait）
 *   - WebSocket 长连接（hello/welcome/state/rpc/resume）
 * 并确认两边读到的是同一份状态、同一个账号。
 *
 * 用真实的 WebSocket + 真实进程，不起模拟器。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const PORT = 9788; // 避开常用端口

function waitFor(cond, timeoutMs = 8000, stepMs = 40) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (cond()) return resolve(true);
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor 超时'));
      setTimeout(tick, stepMs);
    };
    tick();
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    ws.onmessage = (ev) => {
      try {
        inbox.push(JSON.parse(ev.data));
      } catch {
        inbox.push({ type: '__raw', data: ev.data });
      }
    };
    ws.onerror = () => reject(new Error('ws error'));
    ws.onopen = () => resolve({ ws, inbox, send: (obj) => ws.send(JSON.stringify(obj)) });
    setTimeout(() => reject(new Error('ws open timeout')), 5000);
  });
}

test('同一端口：/ping + CORS + 长轮询 + WebSocket 共存（同一个账号两条通道）', async (t) => {
  if (typeof globalThis.WebSocket !== 'function') {
    t.skip('当前 Node 没有全局 WebSocket');
    return;
  }
  if (!(await portFree(PORT))) {
    t.skip(`端口 ${PORT} 被占用`);
    return;
  }

  const child = spawn(process.execPath, ['server/sync-server.mjs'], {
    cwd: ROOT,
    // 必须给独立的数据文件：服务端会持久化，共用会串数据、还会污染真实存档
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_FILE: path.join(require('node:os').tmpdir(), 'twospace-test-' + PORT + '-' + Date.now() + '.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d.toString()));
  child.stderr.on('data', (d) => (log += d.toString()));

  const base = `http://127.0.0.1:${PORT}`;
  try {
    await waitFor(() => log.includes('已启动'));

    // ---- 1) /ping ----
    const pingRes = await fetch(`${base}/ping`);
    assert.equal(pingRes.status, 200);
    const ping = await pingRes.json();
    assert.equal(ping.ok, true);
    assert.equal(ping.pong, true);
    assert.equal(ping.service, 'twospace-sync');
    assert.equal(ping.model, 'account', '必须是账号模型的服务端');
    assert.match(pingRes.headers.get('access-control-allow-origin'), /\*/);

    // ---- 2) CORS 预检 ----
    const pre = await fetch(`${base}/api/rpc`, {
      method: 'OPTIONS',
      headers: { origin: 'https://sync.example.com', 'access-control-request-method': 'POST' },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-methods'), 'GET,POST,OPTIONS');
    assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);

    // ---- 3) HTTP 通道：注册账号 ----
    const created = await (
      await fetch(`${base}/api/account/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '阿玫',
          birthDate: '1998-03-12',
          gender: 'female',
          pin: '123456',
        }),
      })
    ).json();
    assert.equal(created.ok, true, JSON.stringify(created));
    const { accountId, token } = created.value;
    assert.match(accountId, /^TW[A-Z0-9]{4,8}$/);

    // 两个人先在 HTTP 通道上完成绑定（业务方法都要先绑定才能用）
    const partner = await (
      await fetch(`${base}/api/account/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '阿泽',
          birthDate: '1998-11-02',
          gender: 'male',
          pin: '654321',
        }),
      })
    ).json();
    const partnerToken = partner.value.token;
    const requested = await (
      await fetch(`${base}/api/pair/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId: partner.value.accountId }),
      })
    ).json();
    assert.equal(requested.ok, true, JSON.stringify(requested));
    const accepted = await (
      await fetch(`${base}/api/pair/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${partnerToken}` },
        body: JSON.stringify({}),
      })
    ).json();
    assert.equal(accepted.ok, true, JSON.stringify(accepted));

    // ---- 4) WebSocket 通道：用同一个 token 连上 ----
    const client = await openWs(`ws://127.0.0.1:${PORT}`);
    client.send({ v: 1, type: 'hello', token, clientId: 'phone-1', rev: 0 });
    await waitFor(() => client.inbox.some((m) => m.type === 'welcome'));
    await waitFor(() => client.inbox.some((m) => m.type === 'state'));
    const welcome = client.inbox.find((m) => m.type === 'welcome');
    assert.ok(welcome.role === 'A' || welcome.role === 'B');
    const firstState = client.inbox.find((m) => m.type === 'state');
    assert.equal(firstState.state.members.A.name, '阿玫');
    assert.equal(firstState.state.members.A.publicId, accountId, '空间里的 ID 就是账号 ID');

    // ---- 5) WS 发 RPC → 服务端状态变化 → 通过 WS 广播回来 ----
    const before = client.inbox.filter((m) => m.type === 'state').length;
    client.send({ v: 1, type: 'rpc', id: 7, method: 'setMood', args: ['sunny', '今天很好'] });
    await waitFor(() => client.inbox.some((m) => m.type === 'rpc-result' && m.id === 7), 6000);
    const result = client.inbox.find((m) => m.type === 'rpc-result' && m.id === 7);
    assert.equal(result.result.ok, true, JSON.stringify(result.result));
    await waitFor(() => client.inbox.filter((m) => m.type === 'state').length > before, 6000);

    // ---- 6) 关键：HTTP 长轮询也能看到 WS 改出来的状态 ----
    const wait = await (
      await fetch(`${base}/api/wait?rev=-1`, { headers: { authorization: `Bearer ${token}` } })
    ).json();
    assert.equal(wait.ok, true, JSON.stringify(wait));
    assert.equal(wait.state.myMood?.weather, 'sunny', '两条通道必须读写同一份状态');

    // ---- 7) WS 心跳 ping → pong ----
    client.send({ v: 1, type: 'ping', t: 12345 });
    await waitFor(() => client.inbox.some((m) => m.type === 'pong' && m.t === 12345), 4000);

    // ---- 8) resume（断线重连后的状态恢复）能被接受并回推状态 ----
    const beforeResume = client.inbox.filter((m) => m.type === 'state').length;
    client.send({
      v: 1,
      type: 'resume',
      rev: 0,
      room: { id: 'r1', title: '春天的故事', playing: true, positionSec: 88 },
    });
    await waitFor(() => client.inbox.filter((m) => m.type === 'state').length > beforeResume, 4000);

    client.ws.close();
  } finally {
    child.kill();
  }
});
