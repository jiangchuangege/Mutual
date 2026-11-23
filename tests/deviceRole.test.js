/* eslint-disable */
/**
 * 账号会话的回归测试（取代原来的「设备分端」测试）。
 *
 * 旧版本让服务端给每台手机分配 A 端 / B 端，于是同一台手机重连、或先试主地址
 * 再试备用地址，就可能被分到另一个端 → 那个端上档案是空的 → 建档页又弹出来。
 *
 * 账号模型把这类问题从根上消掉了：身份是**账号 ID + token**，
 * 与"第几个连上来""哪台设备"无关。这组测试守这些：
 *   1. 同一个 token 反复请求，身份恒定（不会变来变去）
 *   2. 不同 token 是两个不同账号、两个不同空间
 *   3. 续期后的 token 还是同一个账号（换手机/重装不影响）
 *   4. 账号的档案由账号本身决定，不会被空数据覆盖
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const PORT = 9803;

function waitFor(cond, timeoutMs = 10000, stepMs = 40) {
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

test('账号会话：同一 token 身份恒定，不同 token 是不同账号，续期后还是同一个账号', async (t) => {
  if (!(await portFree(PORT))) {
    t.skip(`端口 ${PORT} 被占用`);
    return;
  }
  const dataFile = path.join(os.tmpdir(), `twospace-session-${Date.now()}.json`);
  const child = spawn(process.execPath, ['server/sync-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d.toString()));
  child.stderr.on('data', (d) => (log += d.toString()));

  const base = `http://127.0.0.1:${PORT}`;
  const post = async (url, body, token) => {
    const res = await fetch(`${base}${url}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json() };
  };
  const meOf = async (token) => {
    const res = await fetch(`${base}/api/account/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return (await res.json()).value;
  };

  try {
    await waitFor(() => log.includes('已启动'));

    const created = (
      await post('/api/account/create', {
        name: '小玫',
        birthDate: '1999-05-20',
        gender: 'female',
        pin: '123456',
      })
    ).body.value;
    assert.ok(created.token);

    // 1) 同一个 token 反复问，身份恒定
    const first = await meOf(created.token);
    const second = await meOf(created.token);
    const third = await meOf(created.token);
    assert.equal(first.account.id, created.accountId);
    assert.equal(second.account.id, created.accountId);
    assert.equal(third.account.id, created.accountId);
    assert.equal(first.account.role, second.account.role, '同一个账号的槽位不该变');
    assert.equal(second.account.role, third.account.role);
    assert.equal(first.account.name, '小玫');

    // 2) 另一个账号是另一个空间
    const other = (
      await post('/api/account/create', {
        name: '小泽',
        birthDate: '1998-11-02',
        gender: 'male',
        pin: '654321',
      })
    ).body.value;
    const otherMe = await meOf(other.token);
    assert.notEqual(otherMe.account.id, created.accountId);
    assert.notEqual(otherMe.pair.id, first.pair.id, '两个账号必须各有一个空间');

    // 3) 登录续期：新 token 还是同一个账号（这就是"换手机/重装"的路径）
    const relogin = await post('/api/account/login', {
      accountId: created.accountId,
      pin: '123456',
      deviceId: 'another-phone',
    });
    assert.equal(relogin.status, 200);
    const afterRelogin = await meOf(relogin.body.value.token);
    assert.equal(afterRelogin.account.id, created.accountId);
    assert.equal(afterRelogin.account.name, '小玫');
    assert.equal(afterRelogin.pair.id, first.pair.id, '登录之后还是原来那个空间');

    // 4) 旧 token 仍然有效（同一账号多设备同时在线是允许的）
    const stillOk = await meOf(created.token);
    assert.equal(stillOk.account.id, created.accountId);

    // 5) 空档案不能把账号的档案盖掉：RPC 传空昵称应当被拒
    const bad = await post(
      '/api/rpc',
      { method: 'updateMyProfile', args: [{ name: '   ', birthDate: '1999-05-20', gender: 'female' }] },
      created.token,
    );
    assert.equal(bad.status, 400, '空昵称不该写进去');
    const afterBad = await meOf(created.token);
    assert.equal(afterBad.account.name, '小玫', '账号档案必须保持不变');
  } finally {
    child.kill();
    try {
      fs.unlinkSync(dataFile);
    } catch {}
  }
});
