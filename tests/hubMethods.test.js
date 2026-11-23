/* eslint-disable */
/**
 * 「缺少 role」事故的回归测试。
 *
 * 事故现象：两台手机连上后，界面每 250ms 弹一次「同步失败：缺少 role」。
 * 根因：store 的 250ms 定时器调 `hub.tick()`，而 tick 没有 role 参数；
 * 它又不在"只在本机跑"的名单里，于是被 facade 转发成
 * `POST /api/rpc {role: undefined, method:"tick"}`，服务器如实拒绝。
 *
 * 这组测试守三件事：
 *  1) 没有 role 的方法清单完整（tick 在内）
 *  2) 静态扫描 store.tsx：不存在"不带 role 却会转发"的 this.hub.X(...) 调用
 *  3) 真正启动 sync-server，验证 role 缺失会被拒、带 role 才通过
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

const M = require('../dist-core/hubMethods.js');
const { Hub } = require('../dist-core/hub.js');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. 清单本身
// ---------------------------------------------------------------------------

test('role-less 清单包含 tick 及所有"没有 role 参数"的方法', () => {
  for (const name of ['tick', 'now', 'scaled', 'snapshot', 'serialize', 'hydrate']) {
    assert.ok(M.ROLE_LESS_HUB_METHODS.includes(name), `${name} 缺少 role，必须在清单里`);
  }
  // 只在本机的清单必须覆盖 role-less
  for (const name of M.ROLE_LESS_HUB_METHODS) {
    assert.ok(M.LOCAL_ONLY_HUB_METHODS.includes(name), `${name} 应该同时属于只在本机的清单`);
  }
});

test('清单里的方法在 Hub 上确实存在（防止改名后清单失效）', () => {
  const hub = new Hub();
  for (const name of M.LOCAL_ONLY_HUB_METHODS) {
    assert.equal(typeof hub[name], 'function', `Hub 上没有 ${name}，清单需要同步更新`);
  }
});

test('shouldForwardToServer：有 role 才转发，role-less 一律不转发', () => {
  assert.equal(M.shouldForwardToServer('addTodo', ['A', {}]), true);
  assert.equal(M.shouldForwardToServer('addTodo', ['B', {}]), true);
  // 事故现场
  assert.equal(M.shouldForwardToServer('tick', []), false);
  // 第一个参数不是 role，即使方法名不认识也不转发
  assert.equal(M.shouldForwardToServer('someFutureMethod', [undefined]), false);
  assert.equal(M.shouldForwardToServer('someFutureMethod', [42]), false);
  assert.equal(M.shouldForwardToServer('someFutureMethod', [{ role: 'A' }]), false);
});

// ---------------------------------------------------------------------------
// 「完成建档点不动」事故：赋值类方法必须本地先执行，且 RPC 不能被静默丢弃
// ---------------------------------------------------------------------------

test('赋值类方法在本地乐观清单里（点一下立刻有反馈）', () => {
  for (const name of ['updateMyProfile', 'setMyAvatar', 'setBackground', 'setStartedAt']) {
    assert.ok(M.LOCAL_OPTIMISTIC_METHODS.includes(name), `${name} 应该本地先执行一遍`);
  }
  // 这些方法都是"设值"，重复执行不会产生重复数据
  const hub = new Hub();
  for (const name of M.LOCAL_OPTIMISTIC_METHODS) {
    assert.equal(typeof hub[name], 'function', `Hub 上没有 ${name}`);
  }
});

test('乐观方法仍然要转发给服务器（本地只是先跑一遍）', () => {
  for (const name of M.LOCAL_OPTIMISTIC_METHODS) {
    assert.equal(M.shouldForwardToServer(name, ['A', {}]), true, `${name} 仍应转发`);
    assert.ok(!M.LOCAL_ONLY_HUB_METHODS.includes(name), `${name} 不能进"只在本机"清单`);
  }
});

test('store.tsx 的业务 RPC 不再用可选链发送（防止 conn 为 null 时静默丢消息）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  const lines = src.split(/\r?\n/);

  // 逐行检查：`this.conn?.send(` 只允许出现在 sendHello / sendResume 里
  // （协议消息没有连接时本来就发不出去，下次连上会重发，可以容忍）
  const allowed = new Set(['sendHello', 'sendResume']);
  const offenders = [];
  let currentFn = '';
  for (const line of lines) {
    const fn = /^\s*private\s+([A-Za-z0-9_]+)\s*\(/.exec(line);
    if (fn) currentFn = fn[1];
    if (/this\.conn\?\.\s*send\s*\(/.test(line) && !allowed.has(currentFn)) {
      offenders.push(`${currentFn || '(类顶层)'} → ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `业务 RPC 不能走 conn?.send：连接销毁时会静默丢掉操作\n${offenders.join('\n')}`);

  assert.ok(/private forwardRpc\(/.test(src), '应该有统一的 forwardRpc 兜底通道');
  assert.match(
    src,
    /rpcOnServer\(this\.remoteServer, this\.token, method, args\)/,
    'forwardRpc 要能在长连接不可用时走 HTTP（用 token 认账号）',
  );
  assert.match(src, /token: this\.token/, 'WS 的 RPC 要带上 token');

  // teardown 必须把 transport 一起清掉
  const teardown = /private teardownConnection\([^)]*\): void \{([\s\S]{0,420})/.exec(src);
  assert.ok(teardown, '找不到 teardownConnection');
  assert.match(teardown[1], /this\.transport = null/, 'teardown 必须清掉 transport');
});

test('Hub.tick() 真的不接受 role（保持无参语义）', () => {
  const hub = new Hub();
  assert.equal(hub.tick.length, 0, 'tick 必须是无参方法，否则说明签名被改过');
});

// ---------------------------------------------------------------------------
// 2. 静态扫描 store.tsx（真正的回归防线）
// ---------------------------------------------------------------------------

test('store.tsx 里没有"不带 role 却被转发"的 hub 调用', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  // 匹配 this.hub.方法名(  取到该调用的第一个参数片段
  const re = /this\.hub\.([A-Za-z0-9_]+)\s*\(\s*([^\n]{0,40})/g;
  const offenders = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1];
    const firstArg = m[2];
    // 只在本机的清单放行
    if (M.LOCAL_ONLY_HUB_METHODS.includes(method)) continue;
    // 第一个参数必须是 this.role 或某个 role 变量
    const okFirstArg =
      /^this\.role\b/.test(firstArg) || /^\w*role\b/i.test(firstArg) || /^(byRole|me)\b/.test(firstArg);
    if (!okFirstArg) offenders.push(`${method}(${firstArg.trim()}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `这些调用没有把 role 作为第一个参数，远程模式下会被服务器拒绝「缺少 role」：\n${offenders.join('\n')}`,
  );
});

// ---------------------------------------------------------------------------
// 3. 真服务器：role 缺失必须被拒，带 role 才通过
// ---------------------------------------------------------------------------

const PORT = 9801;

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

test('异步 RPC 的结果一律先判 ok 再取值（防闪退）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');

  // 事故：远程模式下 facade 返回 { ok: true, value: null }，
  // 旧代码 `res.ok ? res.value.code : null` 直接抛 TypeError → release 包闪退。
  const unsafe = [];
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // 注释里提到不算
    const touchesCode = /res\.value\.[a-zA-Z]/.test(line);
    const guarded = /(res\.ok\s*&&|if\s*\(\s*!res\.ok|res\.value\s*(&&|\?))/.test(line);
    if (touchesCode && !guarded) unsafe.push(line.trim());
  }
  assert.deepEqual(unsafe, [], `不能在没有判 ok 的情况下取 res.value.xxx：\n${unsafe.join('\n')}`);

  // 需要"服务器怎么说"的操作都必须走统一入口，而不是只信本地 hub 的返回值
  assert.ok(/private async sendRpcAwait\(/.test(src), '要有统一的"发 rpc 并等结果"入口');
  assert.match(src, /this\.pendingRpcs\.set\(id/, 'WS 模式要等 rpc-result 回来');
  assert.match(src, /rpcOnServer\(this\.remoteServer, this\.token, method, methodArgs\)/, 'HTTP 模式要直接读响应');
  assert.match(src, /token: this\.token/, 'WS 的 RPC 也要带上 token');
});

test('_layout 装了全局错误兜底（把闪退降级成提示）', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'src', 'app', '_layout.tsx'), 'utf8');
  assert.match(layout, /installGlobalErrorHandler/, '必须装全局异常处理，否则未捕获异常会闪退');
  assert.match(layout, /ErrorBoundary/, '渲染异常要有兜底页');
  const handler = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'globalErrorHandler.ts'), 'utf8');
  assert.match(handler, /setGlobalHandler/, '要真的注册到 ErrorUtils');
});

test('长轮询空返回不再报"重连中"（指示灯乱闪的根因）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  const loop = /private async httpLoop\(\)[\s\S]*?\n  \}/.exec(src);
  assert.ok(loop, '找不到 httpLoop');

  // 长轮询挂起到点返回空是正常节奏：必须连续失败若干次才允许报重连
  assert.match(loop[0], /failures \+= 1/, '要统计连续失败次数');
  assert.match(loop[0], /failures >= 3/, '连续失败 3 次以上才报重连中');
  assert.ok(
    !/res\) \{[\s\S]{0,80}else \{[\s\S]{0,200}status: 'reconnecting'/.test(loop[0]),
    '不能在第一次空返回就切到重连中',
  );

  // 连接过程中不能把状态重置成"未连接"（否则会一路闪）
  assert.match(src, /teardownConnection\(keepStatus = false\)/, 'teardown 要能保留状态');
  assert.match(src, /this\.teardownConnection\(true\)/, '连接过程中要保留「连接中」');
  assert.match(src, /label: '连接中'/, '连接期间应显示「连接中」');
});

test('远程模式下所有写操作都先在本地落地（否则"已送出"但列表是空的）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  const facade = /private createFacade\([\s\S]*?\n  \}/.exec(src);
  assert.ok(facade, '找不到 createFacade');
  // 必须无条件先 callLocal()（现在包在"标记本地回声"的 IIFE 里，
  // 目的是只让用户操作引起的 notify 刷界面，避免服务端投影和本地投影互相覆盖到闪屏）
  assert.match(facade[0], /const localResult = /, '写操作要无条件先本地执行');
  assert.match(facade[0], /callLocal\(\)/, '必须先调本地 hub');
  assert.match(facade[0], /store\.localEcho = true;/, '本地执行要打上"用户操作"的标记');
  assert.match(facade[0], /store\.forwardRpc\(role, name, methodArgs\);/, '然后把同一个调用转发给服务器');
  // 不允许再出现"只对某几个方法本地执行"的旧写法
  assert.ok(
    !/if \(LOCAL_OPTIMISTIC_METHODS\.includes\(name\)\)/.test(facade[0]),
    '不能再只对少数方法本地执行：其它模块会出现"提示成功但列表为空"',
  );
});

test('服务端做了持久化，并提供"用本机数据恢复"的入口', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server', 'sync-server.mjs'), 'utf8');
  assert.match(server, /function loadPersisted\(/, '启动时要读回上次的空间');
  assert.match(server, /function saveNow\(/, '状态变化要落盘');
  assert.match(server, /loadPersisted\(\);/, '启动流程里必须真的调用');
  assert.match(server, /scheduleSave\(\)/, 'bump() 里要安排落盘');
  assert.match(server, /pathname === '\/api\/restore'/, '要有"用手机副本恢复空间"的接口');
  // 恢复只允许在服务端为空时进行
  assert.match(server, /服务端已经有数据了，不需要恢复/, '服务端有数据时不能被旧手机覆盖');
});
test('sync-server（账号模型）：没有 token 一律 401，有 token 才执行业务方法', async (t) => {
  if (!(await portFree(PORT))) {
    t.skip(`端口 ${PORT} 被占用`);
    return;
  }
  const child = spawn(process.execPath, ['server/sync-server.mjs'], {
    cwd: ROOT,
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
  const rpc = async (body, token) => {
    const res = await fetch(`${base}/api/rpc`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  try {
    await waitFor(() => log.includes('已启动'));

    // 没有 token：必须 401，而且不能泄露任何数据
    const noToken = await rpc({ method: 'snapshot', args: [] });
    assert.equal(noToken.status, 401);
    assert.match(String(noToken.body.error), /登录/);

    // 注册账号后带上 token：正常执行
    const created = await (
      await fetch(`${base}/api/account/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '阿玫', birthDate: '1998-03-12', gender: 'female', pin: '123456' }),
      })
    ).json();
    assert.equal(created.ok, true, JSON.stringify(created));
    const token = created.value.token;

    const good = await rpc({ method: 'setStartedAt', args: ['2026-01-01'] }, token);
    assert.equal(good.status, 200, JSON.stringify(good.body));
    assert.equal(good.body.ok, true);

    // 服务端内部管理方法不许从网上调用（账号体系的地基）
    for (const method of ['hydrate', 'resetToEmpty', 'requestBind', 'acceptBind', 'joinWithCode']) {
      const denied = await rpc({ method, args: [] }, token);
      assert.equal(denied.status, 400, `${method} 必须被拒绝`);
      assert.match(String(denied.body.error), /不允许的方法/);
    }

    const ping = await (await fetch(`${base}/ping`)).json();
    assert.equal(ping.ok, true);
    assert.equal(ping.model, 'account');
  } finally {
    child.kill();
  }
});

// ---------------------------------------------------------------------------
// 账号模型：绑定动作必须问服务器
// ---------------------------------------------------------------------------

test('绑定走账号接口，全部以服务器结果为准', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');

  const requestBind = /async requestBind\(targetId: string\)[\s\S]*?\n  \}/.exec(src);
  assert.ok(requestBind, '找不到 requestBind');
  assert.match(requestBind[0], /pairRequestOnServer\(/, 'requestBind 必须问服务器');
  assert.ok(!/this\.hub\.requestBind\(/.test(requestBind[0]), '不能拿本地 hub 的返回值当结论');

  const acceptBind = /async acceptBind\(\)[\s\S]*?\n  \}/.exec(src);
  const declineBind = /async declineBind\(\)[\s\S]*?\n  \}/.exec(src);
  assert.ok(acceptBind && declineBind, '找不到 acceptBind / declineBind');
  assert.match(acceptBind[0], /pairAcceptOnServer\(/, '同意绑定必须问服务器');
  assert.match(declineBind[0], /pairDeclineOnServer\(/, '拒绝绑定必须问服务器');

  assert.match(src, /async refreshFromServer\(\): Promise<void>/, '要有主动拉取最新状态的方法');
  assert.match(requestBind[0], /refreshFromServer\(\)/, '绑定后要重新拉一次状态');
});

test('账号模型：服务端按 token 认人，界面不再出现「端」', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server', 'sync-server.mjs'), 'utf8');

  // 服务端：token → 账号 → 空间
  assert.match(server, /function accountOfToken\(/, '要有 token → 账号 的解析');
  assert.match(server, /function roleOf\(/, '要有账号 → 槽位 的解析');
  assert.match(server, /Authorization/i, '要真的读 Authorization 头');
  assert.match(server, /hashPin\(/, '登录码不能明文存');
  assert.match(server, /const hubs = new Map\(\)/, '每个双人空间一份状态（多账号隔离）');

  // 客户端：不再有「女端 / 男端」，roleLabel 一律返回空串
  // （注释里提历史不算：只扫真正会显示出去的代码行）
  const codeOnly = src
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');
  assert.ok(!/女端|男端/.test(codeOnly), 'store 的代码里不该再有"女端/男端"字样');
  const label = /get roleLabel\(\): string \{[\s\S]{0,200}?\n  \}/.exec(src);
  assert.ok(label, '找不到 roleLabel');
  assert.match(label[0], /return ''/, 'roleLabel 应该统一返回空串（界面上没有"端"）');
});

test('账号模型：注册/登录都在客户端有入口，且失败会说人话', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  assert.match(src, /async createAccount\(/, '要有注册账号');
  assert.match(src, /async loginAccount\(/, '要有登录账号');
  assert.match(src, /async logoutAccount\(/, '要有退出登录');
  assert.match(src, /saveAccountSession\(/, '登录状态要存本地（下次打开自动恢复）');

  const gate = fs
    .readFileSync(path.join(ROOT, 'src', 'ui', 'ProfileGate.tsx'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');
  assert.match(gate, /创建账号/, '入口页要有"创建账号"');
  assert.match(gate, /登录已有账号/, '入口页要有"登录已有账号"');
  assert.match(gate, /6 位登录码/, '要说明登录码');
  assert.ok(!/女端|男端/.test(gate), '入口页不该出现"端"');

  const bind = fs
    .readFileSync(path.join(ROOT, 'src', 'app', 'bind.tsx'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');
  assert.match(bind, /我的账号/, '绑定页要显示我的账号');
  assert.match(bind, /store\.refreshFromServer\(\)/, '绑定页要主动拉状态');
  assert.ok(!/女端|男端/.test(bind), '绑定页不该出现"端"');
});

// ---------------------------------------------------------------------------
// 「显示已连接但不同步」的防线：看门狗 + 跨空间快照 + 手动同步
// ---------------------------------------------------------------------------

test('同步看门狗存在，且不会把"半年没消息"当成正常', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  assert.match(src, /private syncWatchdog\(/, '要有同步看门狗');
  assert.match(src, /this\.lastInboundAt/, '要记录最后一次收到下行消息的时间');
  assert.match(src, /silentMs > 25_000/, '静默 25 秒要先用 HTTP 自查（不掐长连接）');
  assert.match(src, /silentMs > 90_000/, '90 秒没消息才真重连');
  assert.match(src, /网络波动/, '指示灯要诚实显示网络波动');
  assert.match(src, /async forceSyncNow\(/, '要有"立即同步"这个手动入口');

  // 心跳必须能抓到半死连接
  const cm = fs.readFileSync(path.join(ROOT, 'src', 'core', 'connectionManager.ts'), 'utf8');
  assert.match(cm, /silentFor > this\.opts\.silenceLimitMs/, '心跳无回应要判失联（阈值可配置，默认 heartbeat*2+ack）');
  assert.match(cm, /silenceLimitMs: options\.silenceLimitMs/, '允许上层放宽静默阈值');
  assert.match(cm, /连接已失联/, '要有明确的状态文案');
});

test('换了空间就不再用 rev 比大小（服务端重启后 rev 会重新计数）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  assert.match(src, /const spaceChanged = Boolean\(payload\.spaceId\) && payload\.spaceId !== this\.lastSpaceId/, '要识别"换了空间"');
  assert.match(src, /if \(!spaceChanged && rev !== null && rev < this\.remoteRev\) return;/, '同空间内才按 rev 丢弃旧快照');
});

test('服务端把版本号一起落盘，重启后接着数', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server', 'sync-server.mjs'), 'utf8');
  assert.match(server, /revision,\s*\n\s*accounts: db\.accounts/, '存档里要带 revision');
  assert.match(server, /Math\.max\(revision, persisted, REVISION_FLOOR\)/, '启动时要把 revision 接上，并且给一个足够大的下限');
  assert.match(server, /\[rpc\] 账号=/, '每个写操作都要留一行日志（排查同步问题靠它）');
});


test('老连接迟到的状态事件不许覆盖新连接（"其实连上了却红着已断开"）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  const fired = src.match(/if \(this\.conn !== conn\) return;/g) || [];
  assert.ok(fired.length >= 4, '状态/开启/重连/消息四个回调都要挡住老连接，实际 ' + fired.length + ' 处');
});

// ---------------------------------------------------------------------------
// 身份错位事故：绑定之后账号的槽位从 A 变成 B，客户端必须跟着改
// 否则界面会把对方的名字当成自己，还会把对方的档案写成自己的账号
// ---------------------------------------------------------------------------

test('服务端每份快照都带 role（绑定后槽位会变）', () => {
  const wsCore = fs.readFileSync(path.join(ROOT, 'server', 'wsCore.mjs'), 'utf8');
  assert.match(wsCore, /type: 'state', rev: hooks\.revision\(\), role: client\.role/, 'WS 快照要带 role');
  assert.match(wsCore, /hooks\.refreshRole/, '每次 hello 都要重新解析角色');

  const server = fs.readFileSync(path.join(ROOT, 'server', 'sync-server.mjs'), 'utf8');
  assert.match(server, /role: roleOf\(account\.id\), state/, '/api/wait 也要带 role');
  assert.match(server, /refreshRole: true/, 'sync-server 要打开 refreshRole');
});

test('客户端会采纳服务端下发的槽位，且不在槽位没对齐时写档案', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  assert.match(src, /private adoptServerRole\(/, '要能采纳服务端下发的槽位');
  assert.match(src, /this\.adoptServerRole\(msg\.role\)/, 'WS 快照到达时要采纳');
  assert.match(src, /this\.adoptServerRole\(res\.role\)/, '长轮询到达时也要采纳');
  assert.match(src, /private canPushMyProfile\(\)/, '写档案前要确认槽位是我的');
  assert.match(src, /slotId === this\.accountId/, '判定标准：槽位 publicId 必须等于我的账号 ID');

  // 远程模式下不再用本地备份"认领"档案（那是 v1 的补丁，会把别人的名字写进我的账号）
  const adopt = /adoptProfileIfNeeded\(\): boolean \{([\s\S]{0,200})/.exec(src);
  assert.ok(adopt, '找不到 adoptProfileIfNeeded');
  assert.match(adopt[1], /if \(this\.remoteServer\) return false/, '远程模式下必须禁用本地认领');
});


// ---------------------------------------------------------------------------
// 「点了创建账号没反应」：生日不补零会被判格式错误，错误又只闪一下
// ---------------------------------------------------------------------------

test('生日输入自动补零（2000-2-11 → 2000-02-11），表单错误内联显示', () => {
  const acc = fs.readFileSync(path.join(ROOT, 'src', 'core', 'account.ts'), 'utf8');
  assert.match(acc, /export function normalizeBirthDate\(/, '要有生日规范化函数');
  assert.match(acc, /padStart\(2, '0'\)/, '月和日要补零');

  const gate = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'ProfileGate.tsx'), 'utf8');
  assert.match(gate, /normalizeBirthDate\(birthDate\)/, '提交时要先规范化生日');
  assert.match(gate, /formError/, '要有内联错误（不能只靠 3 秒消失的 toast）');
  assert.match(gate, /没有提交成功/, '错误标题要明确');
});

// ---------------------------------------------------------------------------
// 身份硬自愈：快照里每个槽位都带账号 ID，"我在哪一格"是确定性题
// ---------------------------------------------------------------------------

test('resolveMyRole：靠槽位上的账号 ID 判定我在哪一格（不依赖服务端下发槽位）', () => {
  const { resolveMyRole } = require('../dist-core/account.js');
  const pair = { A: { publicId: 'TWWRW' }, B: { publicId: 'TWOO' } };
  assert.equal(resolveMyRole('TWWRW', pair), 'A');
  assert.equal(resolveMyRole('TWOO', pair), 'B');
  // 自己一个人的空间
  assert.equal(resolveMyRole('TWSOLO', { A: { publicId: 'TWSOLO' }, B: { publicId: 'TWX' } }), 'A');
  // 快照里根本没有我的 ID（还没同步到 / 不是我的空间）
  assert.equal(resolveMyRole('TWNOBODY', pair), null);
  assert.equal(resolveMyRole('TWWRW', null), null);
  assert.equal(resolveMyRole('', pair), null);
});

test('客户端每份快照都做一次身份自愈（否则会把对方的名字当成自己）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.tsx'), 'utf8');
  assert.match(src, /const mineRole = resolveMyRole\(this\.accountId, projected\.members\)/, '要按账号 ID 判定自己的格子');
  assert.match(src, /已自动校正身份/, '自愈时要告诉用户发生了什么');
});
