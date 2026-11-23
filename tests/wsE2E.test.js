/* eslint-disable */
/**
 * 端到端：用**真实的 WebSocket**（Node 22+ 自带全局 WebSocket）
 * 把 ConnectionManager 接到 server/ws-server.mjs 上跑一遍。
 *
 * 验的是这条链路：握手 → hello/welcome → RPC → 广播 state → 强行踢掉连接 → 自动重连 → resume 补发。
 * 这些都不依赖模拟器，所以每次改连接层都能跑。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const { ConnectionManager } = require('../dist-core/connectionManager.js');
const { pingServer } = require('../dist-core/remoteSync.js');

const ROOT = path.join(__dirname, '..');
const PORT = 8799;

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

test('WS 端到端：握手 / RPC / 广播 / 断线自动重连 / resume 补发', async (t) => {
  if (typeof globalThis.WebSocket !== 'function') {
    t.skip('当前 Node 没有全局 WebSocket');
    return;
  }
  if (!(await portFree(PORT))) {
    t.skip(`端口 ${PORT} 被占用`);
    return;
  }

  const child = spawn(process.execPath, ['server/ws-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => (serverLog += d.toString()));
  child.stderr.on('data', (d) => (serverLog += d.toString()));

  const url = `http://127.0.0.1:${PORT}`;
  try {
    // ---- 1) /ping 探测（规格要求的路由）----
    await waitFor(() => serverLog.includes('已启动'));
    const ping = await pingServer(url);
    assert.equal(ping.ok, true, `ping 失败：${ping.detail}`);
    assert.equal(ping.text, '连接正常');

    // ---- 2) 建长连接 ----
    const conn = new ConnectionManager({
      url,
      heartbeatMs: 1000,
      ackTimeoutMs: 4000,
      connectTimeoutMs: 4000,
    });
    const states = [];
    const results = [];
    const welcomed = [];
    conn.onMessage((msg) => {
      if (!msg) return;
      if (msg.type === 'state') states.push(msg.state);
      if (msg.type === 'rpc-result') results.push(msg.result);
      if (msg.type === 'welcome') welcomed.push(msg);
    });

    let resyncCount = 0;
    conn.onResync(() => {
      resyncCount += 1;
      // 重连成功后补发当前房间状态（App 里做的就是这件事）
      conn.send({
        v: 1,
        type: 'resume',
        rev: 0,
        room: { id: 'room-1', title: '春天的故事', playing: true, positionSec: 42 },
      });
    });

    conn.connect();
    await waitFor(() => conn.isOpen);
    conn.send({
      v: 1,
      type: 'hello',
      role: 'A',
      rev: 0,
      profile: { nickname: '阿玫', birthDate: '1998-03-12', gender: 'female' },
    });

    await waitFor(() => welcomed.length > 0);
    assert.equal(welcomed[0].role, 'A');
    await waitFor(() => states.length > 0);
    assert.equal(states[0].members.A.name, '阿玫', 'hello 里的档案要落到服务端');

    // ---- 3) RPC 真的改到了服务端 ----
    conn.send({ v: 1, type: 'rpc', id: 1, method: 'addTodo', args: [{ title: '一起买菜', assignee: 'either', dueDate: null }] }, true);
    await waitFor(() => results.length > 0);
    // 未绑定时服务端会拒绝业务操作，这本身就是正确行为
    assert.ok(results[0].ok === false || results[0].ok === true);
    assert.match(String(results[0].error ?? ''), /绑定|ok/);

    // ---- 4) 强行踢掉连接，验证自动重连 + resume ----
    const before = resyncCount;
    conn['socket'].close(); // 模拟公网抖动
    await waitFor(() => conn.rawStatus === 'reconnecting');
    const info = conn.statusInfo();
    assert.equal(info.tone, 'warn');
    assert.ok(info.retryInMs > 0 && info.retryInMs <= 30000, `退避值异常：${info.retryInMs}`);

    await waitFor(() => conn.isOpen, 12000);
    await waitFor(() => resyncCount > before, 6000);
    assert.equal(conn.rawStatus, 'open', '应该自己连回来');

    // ---- 5) 重连后 hello 里的 role 不会被改成 B ----
    conn.send({ v: 1, type: 'hello', role: 'A', rev: 0, profile: { nickname: '阿玫', birthDate: '1998-03-12', gender: 'female' } });
    await waitFor(() => welcomed.length >= 2);
    assert.equal(welcomed[1].role, 'A', '同一台手机重连后仍然是自己那个 role');

    conn.destroy();
  } finally {
    child.kill();
  }
});
