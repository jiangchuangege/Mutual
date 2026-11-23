/* eslint-disable */
/**
 * 账号模型验收：这是 v2 服务端的地基，必须真的能跑。
 *
 * 规则（也是产品规则）：
 *   1. 每个人注册一个账号，账号 ID 唯一，带 6 位登录码
 *   2. 一台手机登录一个账号；换手机用「账号 ID + 登录码」登录，数据跟着账号走
 *   3. 每个账号先有自己的个人空间；两个账号互相确认后合并成一个双人空间
 *   4. token 认人：没有 token 拿不到任何数据，别的账号的空间你连"存在"都看不到
 *
 * 全部用真实进程 + 真实 HTTP / WebSocket 跑。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const BASE_PORT = 9850;

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

async function boot(port) {
  const dataFile = path.join(os.tmpdir(), `twospace-acc-${port}-${Date.now()}.json`);
  const child = spawn(process.execPath, ['server/sync-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { log: '' };
  child.stdout.on('data', (d) => (state.log += d.toString()));
  child.stderr.on('data', (d) => (state.log += d.toString()));
  const base = `http://127.0.0.1:${port}`;
  await waitFor(() => state.log.includes('已启动'));
  return {
    base,
    child,
    stop() {
      child.kill();
      try {
        fs.unlinkSync(dataFile);
      } catch {}
    },
  };
}

async function post(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

async function getState(base, token) {
  const res = await fetch(`${base}/api/wait?rev=-1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  assert.equal(body.ok, true, `取状态失败：${JSON.stringify(body)}`);
  return body.state;
}

async function makeAccount(base, name, gender) {
  const res = await post(`${base}/api/account/create`, {
    name,
    birthDate: '1999-05-20',
    gender,
    pin: '123456',
  });
  assert.equal(res.status, 200, `注册失败：${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);
  return res.body.value;
}

test('账号：注册后各自有独立空间，别人看不到、也进不来', async (t) => {
  const port = BASE_PORT;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '小玫', 'female');
    const b = await makeAccount(srv.base, '小泽', 'male');

    assert.match(a.accountId, /^TW[A-Z0-9]{4,8}$/);
    assert.match(b.accountId, /^TW[A-Z0-9]{4,8}$/);
    assert.notEqual(a.accountId, b.accountId, '两个账号的 ID 必须不同');
    assert.equal(a.bound, false, '新账号不该是已绑定状态');
    assert.ok(a.token && b.token);

    // 各自的空间互相看不到
    const sa = await getState(srv.base, a.token);
    const sb = await getState(srv.base, b.token);
    assert.notEqual(sa.spaceId, sb.spaceId, '两个账号必须是两个不同的空间');
    assert.equal(sa.members.A.name, '小玫');
    assert.equal(sa.members.B.name, '', '对方槽位不该有别人的名字');
    assert.equal(sb.members.A.name, '小泽');
    assert.equal(sa.boundAt, null);

    // 账号 ID 就是空间里那个人的固定 ID，不用记两个
    assert.equal(sa.members.A.publicId, a.accountId);
    assert.equal(sb.members.A.publicId, b.accountId);

    // 没有 token 一律 401
    const noAuth = await fetch(`${srv.base}/api/wait?rev=-1`);
    assert.equal(noAuth.status, 401);
    const badAuth = await fetch(`${srv.base}/api/wait?rev=-1`, {
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    assert.equal(badAuth.status, 401);
    const badRpc = await post(`${srv.base}/api/rpc`, { method: 'snapshot', args: [] });
    assert.equal(badRpc.status, 401);
  } finally {
    srv.stop();
  }
});

test('账号：搜账号 ID 发请求 → 对方确认 → 组成双人空间（两端名字/ID 都对）', async (t) => {
  const port = BASE_PORT + 1;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '小玫', 'female');
    const b = await makeAccount(srv.base, '小泽', 'male');

    // A 搜 B 的账号 ID
    const req = await post(`${srv.base}/api/pair/request`, { targetId: b.accountId }, a.token);
    assert.equal(req.status, 200, JSON.stringify(req.body));
    assert.equal(req.body.value.paired, false);

    // B 那边应该看到"有人请求"，并且能看到是谁
    const sbPending = await getState(srv.base, b.token);
    assert.ok(sbPending.bindRequest, 'B 应该看到待确认的请求');
    assert.equal(sbPending.bindRequest.fromPublicId, a.accountId);
    assert.equal(sbPending.bindRequest.fromName, '小玫');

    // A 那边显示"已发出"
    const saWaiting = await getState(srv.base, a.token);
    assert.ok(saWaiting.bindRequest, 'A 应该看到自己发出的请求');

    // B 确认
    const accept = await post(`${srv.base}/api/pair/accept`, {}, b.token);
    assert.equal(accept.status, 200, JSON.stringify(accept.body));
    assert.equal(accept.body.value.paired, true);

    // 两端现在在同一个空间里，各自看到对方
    const sa = await getState(srv.base, a.token);
    const sb = await getState(srv.base, b.token);
    assert.equal(sa.spaceId, sb.spaceId, '绑定后两端必须是同一个空间');
    assert.notEqual(sa.boundAt, null, '绑定后应有绑定时间');
    assert.equal(sa.members.A.name, '小玫');
    assert.equal(sa.members.B.name, '小泽');
    assert.equal(sb.members.A.name, '小玫');
    assert.equal(sb.members.B.name, '小泽');
    assert.notEqual(sa.members.A.publicId, sa.members.B.publicId);
    assert.equal(sa.bindRequest, null);

    // /api/account/me 也要对
    const meA = await fetch(`${srv.base}/api/account/me`, {
      headers: { authorization: `Bearer ${a.token}` },
    }).then((r) => r.json());
    assert.equal(meA.ok, true);
    assert.equal(meA.value.account.id, a.accountId);
    assert.equal(meA.value.pair.bound, true);
    assert.equal(meA.value.partner.id, b.accountId);
    assert.equal(meA.value.partner.name, '小泽');
  } finally {
    srv.stop();
  }
});

test('账号：登录码错了进不来，对了能拿到新 token 并看到同一个账号', async (t) => {
  const port = BASE_PORT + 2;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '小玫', 'female');

    const wrong = await post(`${srv.base}/api/account/login`, {
      accountId: a.accountId,
      pin: '000000',
    });
    assert.equal(wrong.status, 400);
    assert.match(String(wrong.body.error), /登录码/);

    const right = await post(`${srv.base}/api/account/login`, {
      accountId: a.accountId,
      pin: '123456',
    });
    assert.equal(right.status, 200, JSON.stringify(right.body));
    assert.ok(right.body.value.token);
    assert.notEqual(right.body.value.token, a.token, '每次登录发新 token');

    const me = await fetch(`${srv.base}/api/account/me`, {
      headers: { authorization: `Bearer ${right.body.value.token}` },
    }).then((r) => r.json());
    assert.equal(me.value.account.id, a.accountId);
    assert.equal(me.value.account.name, '小玫');

    // 不存在的账号
    const ghost = await post(`${srv.base}/api/account/login`, {
      accountId: 'TWZZZZZZ',
      pin: '123456',
    });
    assert.equal(ghost.status, 400);
    assert.match(String(ghost.body.error), /没有这个账号/);
  } finally {
    srv.stop();
  }
});

test('账号：自己搜自己是明确报错，不是把两个人绑在一起', async (t) => {
  const port = BASE_PORT + 3;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '小玫', 'female');
    const self = await post(`${srv.base}/api/pair/request`, { targetId: a.accountId }, a.token);
    assert.equal(self.status, 400);
    assert.match(String(self.body.error), /你自己的账号/);

    const sa = await getState(srv.base, a.token);
    assert.equal(sa.boundAt, null, '不能因为填了自己的 ID 就变成已绑定');
    assert.equal(sa.members.B.name, '');

    // 填一个不存在的账号要明确说找不到，而不是静默成功
    const ghost = await post(`${srv.base}/api/pair/request`, { targetId: 'TWNOPE00' }, a.token);
    assert.equal(ghost.status, 400);
    assert.match(String(ghost.body.error), /没找到账号/);
  } finally {
    srv.stop();
  }
});

test('账号：解绑后各自回到个人空间，昵称/账号 ID 都还在', async (t) => {
  const port = BASE_PORT + 4;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '小玫', 'female');
    const b = await makeAccount(srv.base, '小泽', 'male');
    await post(`${srv.base}/api/pair/request`, { targetId: b.accountId }, a.token);
    await post(`${srv.base}/api/pair/accept`, {}, b.token);

    const reset = await post(`${srv.base}/api/pair/reset`, {}, a.token);
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    const sa = await getState(srv.base, a.token);
    const sb = await getState(srv.base, b.token);
    assert.notEqual(sa.spaceId, sb.spaceId, '解绑后又回到两个独立空间');
    assert.equal(sa.boundAt, null);
    assert.equal(sa.members.A.name, '小玫', '解绑不该把昵称也弄丢');
    assert.equal(sa.members.A.publicId, a.accountId, '账号 ID 不变');
    assert.equal(sb.members.A.name, '小泽');
    assert.equal(sb.members.B.name, '');

    // 解绑之后还能再绑一次
    const again = await post(`${srv.base}/api/pair/request`, { targetId: b.accountId }, a.token);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const accept2 = await post(`${srv.base}/api/pair/accept`, {}, b.token);
    assert.equal(accept2.status, 200, JSON.stringify(accept2.body));
  } finally {
    srv.stop();
  }
});

function openWs(url) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url);
    const inbox = [];
    sock.onmessage = (ev) => {
      try {
        inbox.push(JSON.parse(ev.data));
      } catch {
        inbox.push({ type: '__raw', data: ev.data });
      }
    };
    sock.onerror = () => reject(new Error('ws error'));
    sock.onopen = () =>
      resolve({
        sock,
        inbox,
        send: (obj) => sock.send(JSON.stringify(obj)),
        welcome: () => inbox.find((m) => m.type === 'welcome') ?? null,
        error: () => inbox.find((m) => m.type === 'error') ?? null,
      });
    setTimeout(() => reject(new Error('ws open timeout')), 5000);
  });
}

/** 只建连、不发 hello 的连接（用来验证"还没认证"的可重试错误码） */
function openWsWithoutHello(url) {
  return openWs(url);
}

test('账号：WebSocket 用 token 握手，没有 token 会被明确拒绝', async (t) => {
  if (typeof globalThis.WebSocket !== 'function') {
    t.skip('当前 Node 没有全局 WebSocket');
    return;
  }
  const port = BASE_PORT + 5;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '小玫', 'female');
    const b = await makeAccount(srv.base, '小泽', 'male');
    await post(`${srv.base}/api/pair/request`, { targetId: b.accountId }, a.token);
    await post(`${srv.base}/api/pair/accept`, {}, b.token);

    const wa = await openWs(`ws://127.0.0.1:${port}`);
    wa.send({ v: 1, type: 'hello', token: a.token, clientId: 'phone-a' });
    await waitFor(() => wa.welcome() !== null);
    assert.equal(wa.welcome().role, 'A');
    await waitFor(() => wa.inbox.some((m) => m.type === 'state'));
    const stateA = wa.inbox.find((m) => m.type === 'state').state;
    assert.equal(stateA.members.A.name, '小玫');
    assert.equal(stateA.members.B.name, '小泽');

    const wb = await openWs(`ws://127.0.0.1:${port}`);
    wb.send({ v: 1, type: 'hello', token: b.token, clientId: 'phone-b' });
    await waitFor(() => wb.welcome() !== null);
    assert.equal(wb.welcome().role, 'B');

    // 假 token：必须收到 error，而不是静默挂住
    const wc = await openWs(`ws://127.0.0.1:${port}`);
    wc.send({ v: 1, type: 'hello', token: 'fake-token', clientId: 'phone-x' });
    await waitFor(() => wc.error() !== null);
    assert.match(String(wc.error().error), /登录|认证/);
    assert.equal(wc.welcome(), null);

    wa.sock.close();
    wb.sock.close();
    wc.sock.close();
  } finally {
    srv.stop();
  }
});

test('账号：RPC 只作用于自己的空间（A 写的东西 B 那个空间看不到）', async (t) => {
  const port = BASE_PORT + 6;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '小玫', 'female');
    const c = await makeAccount(srv.base, '路人', 'other');

    // 未绑定时业务方法会被 hub 拒绝（requireBound），但**不会串到别人的空间**
    const write = await post(`${srv.base}/api/rpc`, { method: 'addTodo', args: [{ title: '偷看', assignee: 'A', dueDate: null }] }, a.token);
    assert.equal(write.status, 400, '未绑定不该能写');
    assert.match(String(write.body.error), /绑定/);

    const sc = await getState(srv.base, c.token);
    assert.equal(sc.todos.length, 0, '别人的空间必须完全不受影响');

    // 绑定后写入只影响自己那一个空间
    const b = await makeAccount(srv.base, '小泽', 'male');
    await post(`${srv.base}/api/pair/request`, { targetId: b.accountId }, a.token);
    await post(`${srv.base}/api/pair/accept`, {}, b.token);
    const okWrite = await post(
      `${srv.base}/api/rpc`,
      { method: 'addTodo', args: [{ title: '买牛奶', assignee: 'A', dueDate: null }] },
      a.token,
    );
    assert.equal(okWrite.status, 200, JSON.stringify(okWrite.body));

    const sa = await getState(srv.base, a.token);
    const sc2 = await getState(srv.base, c.token);
    assert.equal(sa.todos.length, 1);
    assert.equal(sa.todos[0].title, '买牛奶');
    assert.equal(sc2.todos.length, 0, '第三个账号不受影响');
  } finally {
    srv.stop();
  }
});

// ---------------------------------------------------------------------------
// 「先发 hello 再发 rpc」事故 + 增删安排要能跨端同步
// ---------------------------------------------------------------------------

test('rpc 比 hello 先到也能执行（重连时排队的操作不再丢）', async (t) => {
  if (typeof globalThis.WebSocket !== 'function') {
    t.skip('当前 Node 没有全局 WebSocket');
    return;
  }
  const port = BASE_PORT + 7;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '阿玫', 'female');
    const b = await makeAccount(srv.base, '阿泽', 'male');
    await post(`${srv.base}/api/pair/request`, { targetId: b.accountId }, a.token);
    await post(`${srv.base}/api/pair/accept`, {}, b.token);

    const wa = await openWs(`ws://127.0.0.1:${port}`);
    const wb = await openWs(`ws://127.0.0.1:${port}`);
    // 故意：A 不发 hello，直接把一条 rpc 甩过去（模拟重连时排队的操作）
    wa.send({
      v: 1,
      type: 'rpc',
      id: 11,
      method: 'addEvent',
      args: [
        { title: '重连期间加的安排', date: '2026-11-05', startMin: 600, endMin: 660, category: 'date', visibility: 'shared' },
      ],
      token: a.token,
    });
    await waitFor(() => wa.inbox.some((m) => m.type === 'rpc-result' && m.id === 11));
    const res = wa.inbox.find((m) => m.type === 'rpc-result' && m.id === 11);
    assert.equal(res.result.ok, true, `rpc 先到也必须成功：${JSON.stringify(res.result)}`);

    // B 正常握手，必须能看到这条安排
    wb.send({ v: 1, type: 'hello', token: b.token });
    await waitFor(() => wb.inbox.some((m) => m.type === 'state'));
    const stB = wb.inbox.filter((m) => m.type === 'state').pop();
    const titles = stB.state.events.map((e) => e.title);
    assert.ok(titles.includes('重连期间加的安排'), `B 必须看到 A 加的安排，实际：${JSON.stringify(titles)}`);

    // 删除也要跨端同步
    const evtId = stB.state.events.find((e) => e.title === '重连期间加的安排').id;
    wa.send({ v: 1, type: 'rpc', id: 12, method: 'deleteEvent', args: [evtId], token: a.token });
    await waitFor(() => wa.inbox.some((m) => m.type === 'rpc-result' && m.id === 12));
    const del = wa.inbox.find((m) => m.type === 'rpc-result' && m.id === 12);
    assert.equal(del.result.ok, true, `删除应当成功：${JSON.stringify(del.result)}`);
    await waitFor(() => {
      const last = wb.inbox.filter((m) => m.type === 'state').pop();
      return last && !last.state.events.some((e) => e.id === evtId);
    }, 6000);

    wa.sock.close();
    wb.sock.close();
  } finally {
    srv.stop();
  }
});

test('绑定之后，已连着的 WebSocket 必须收到新的槽位（否则客户端会把对方当成自己）', async (t) => {
  if (typeof globalThis.WebSocket !== 'function') {
    t.skip('当前 Node 没有全局 WebSocket');
    return;
  }
  const port = BASE_PORT + 8;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  try {
    const a = await makeAccount(srv.base, '甲', 'female');
    const b = await makeAccount(srv.base, '乙', 'male');

    // B 先连上（此时 B 还是自己个人空间的 A）
    const wb = await openWs(`ws://127.0.0.1:${port}`);
    wb.send({ v: 1, type: 'hello', token: b.token, clientId: 'phone-b' });
    await waitFor(() => wb.welcome() !== null);
    assert.equal(wb.welcome().role, 'A', '一个人时是自己空间的 A');
    await waitFor(() => wb.inbox.some((m) => m.type === 'state'));
    let last = wb.inbox.filter((m) => m.type === 'state').pop();
    assert.equal(last.role, 'A');
    assert.equal(last.state.members.A.publicId, b.accountId, 'B 自己那一格应该是 B 的账号');

    // A 请求绑定，B 同意（绑定发生在连接建立**之后**）
    await post(`${srv.base}/api/pair/request`, { targetId: b.accountId }, a.token);
    await post(`${srv.base}/api/pair/accept`, {}, b.token);

    // 服务端必须马上用**新的槽位**推一份快照给 B
    await waitFor(() => {
      const s = wb.inbox.filter((m) => m.type === 'state').pop();
      return s && s.role === 'B';
    });
    last = wb.inbox.filter((m) => m.type === 'state').pop();
    assert.equal(last.role, 'B', '绑定后 B 的槽位是 B');
    assert.equal(
      last.state.members.B.publicId,
      b.accountId,
      'B 自己那一格必须是 B 的账号，不能变成对方的',
    );
    assert.equal(
      last.state.members.A.publicId,
      a.accountId,
      '另一格是 A 的账号',
    );

    // B 从这条连接发起的写操作，也必须落到 B 自己的那一格
    wb.send({ v: 1, type: 'rpc', id: 9, method: 'updateMyProfile', args: [
      { name: '乙改名', birthDate: '2000-02-02', gender: 'male' },
    ] });
    await waitFor(() => wb.inbox.some((m) => m.type === 'rpc-result' && m.id === 9));
    const me = await (await fetch(`${srv.base}/api/account/me`, {
      headers: { authorization: `Bearer ${b.token}` },
    })).json();
    assert.equal(me.value.account.name, '乙改名', 'B 改的是自己的名字');
    const meA = await (await fetch(`${srv.base}/api/account/me`, {
      headers: { authorization: `Bearer ${a.token}` },
    })).json();
    assert.equal(meA.value.account.name, '甲', 'A 的名字不能被 B 的写操作改掉（这是"串号"事故）');

    wb.sock.close();
  } finally {
    srv.stop();
  }
});

/**
 * 认证相关的错误必须带机器可读的 code。
 *
 * 真实事故：客户端原来用 /登录|认证|token/ 正则匹配错误文案来判断"登录失效"，
 * 而服务端在"rpc 先于 hello 到达"时回的是「还没完成身份认证，请稍后重试」——
 * 里面也有"认证"两个字，于是网络一抖就把用户踢回登录页。
 */
test('认证错误带 code：401 是 auth，「还没认证」是 retry（不能靠文案猜）', async (t) => {
  const port = BASE_PORT + 31;
  if (!(await portFree(port))) {
    t.skip(`端口 ${port} 被占用`);
    return;
  }
  const srv = await boot(port);
  t.after(() => srv.stop());

  // 1) token 无效 → HTTP 401 + code:'auth'
  const bad = await post(`${srv.base}/api/rpc`, { method: 'addTodo', args: [] }, 'not-a-real-token');
  assert.equal(bad.status, 401);
  assert.equal(bad.body.ok, false);
  assert.equal(bad.body.code, 'auth', '401 必须带 code:auth，客户端据此才把用户踢回登录页');

  // 2) 连上但还没 hello 就发 rpc → code:'retry'（可重试，绝不能踢人下线）
  const ws2 = await openWsWithoutHello(`ws://127.0.0.1:${port}`);
  ws2.send({ v: 1, type: 'rpc', id: 2, method: 'setMood', args: ['sunny', ''] });
  await new Promise((r) => setTimeout(r, 900));
  assert.ok(ws2.inbox.length > 0, '服务端对未认证的 rpc 必须有回应，实际什么都没收到');
  const result = ws2.inbox.find((m) => m.type === 'rpc-result');
  assert.ok(result, `没有 rpc-result，收到的是 ${JSON.stringify(ws2.inbox)}`);
  assert.equal(result.result.ok, false);
  assert.equal(result.result.code, 'retry', '「还没完成身份认证」必须标成 retry');
  assert.match(result.result.error, /身份认证/);
  ws2.sock.close();
});
