/* eslint-disable */
/**
 * 连接层测试：URL 解析 + 指数退避 + ConnectionManager 的握手/重连/队列/假死检测。
 *
 * 这里用**假 Socket + 假定时器**，所以完全不碰网络，结果确定可复现。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const U = require('../dist-core/serverUrl.js');
const { ConnectionManager, backoffDelay } = require('../dist-core/connectionManager.js');

// ---------------------------------------------------------------------------
// 假 WebSocket + 假时钟
// ---------------------------------------------------------------------------

function makeEnv() {
  const timers = [];
  let seq = 1;
  const clock = { t: 0 };
  const sockets = [];

  const env = {
    now: () => clock.t,
    setTimeout: (fn, ms) => {
      const item = { id: seq++, at: clock.t + ms, fn, cleared: false };
      timers.push(item);
      return item.id;
    },
    clearTimeout: (id) => {
      const item = timers.find((t) => t.id === id);
      if (item) item.cleared = true;
    },
    createSocket: (url) => {
      const socket = {
        url,
        readyState: 0,
        sent: [],
        closed: false,
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send(data) {
          if (this.readyState !== 1) throw new Error('socket not open');
          this.sent.push(data);
        },
        close() {
          this.closed = true;
          this.readyState = 3;
        },
        // 测试辅助
        fireOpen() {
          this.readyState = 1;
          if (this.onopen) this.onopen();
        },
        fireMessage(obj) {
          if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) });
        },
        fireClose(reason = 'network down') {
          this.readyState = 3;
          if (this.onclose) this.onclose({ code: 1006, reason });
        },
        fireError() {
          if (this.onerror) this.onerror(new Error('boom'));
        },
      };
      sockets.push(socket);
      return socket;
    },
  };

  /** 推进时间并执行到期的定时器（按时间顺序，一次一步） */
  function advance(ms) {
    const target = clock.t + ms;
    for (;;) {
      const due = timers
        .filter((t) => !t.cleared && t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.cleared = true;
      clock.t = due.at;
      due.fn();
    }
    clock.t = target;
  }

  return { env, clock, sockets, advance, timers, latest: () => sockets[sockets.length - 1] };
}

// ---------------------------------------------------------------------------
// 1. 地址解析与协议推导
// ---------------------------------------------------------------------------

test('默认地址就是公网服务器', () => {
  assert.equal(U.DEFAULT_SERVER_URL, 'https://sync.example.com');
});

test('normalizeServerUrl：补协议、去尾斜杠、协议小写', () => {
  assert.equal(U.normalizeServerUrl('sync.example.com'), 'https://sync.example.com');
  assert.equal(U.normalizeServerUrl('  https://sync.example.com///  '), 'https://sync.example.com');
  assert.equal(U.normalizeServerUrl('HTTPS://A.B'), 'https://A.B');
  assert.equal(U.normalizeServerUrl(''), U.DEFAULT_SERVER_URL);
});

test('https → wss，http → ws', () => {
  assert.equal(U.toWebSocketUrl('https://sync.example.com'), 'wss://sync.example.com');
  assert.equal(U.toWebSocketUrl('https://sync.example.com/'), 'wss://sync.example.com');
  assert.equal(U.toWebSocketUrl('http://192.168.1.10:8787'), 'ws://192.168.1.10:8787');
  assert.equal(U.toWebSocketUrl('https://a.b', '/ws'), 'wss://a.b/ws');
});

test('/ping 探测地址', () => {
  assert.equal(U.toPingUrl('https://sync.example.com'), 'https://sync.example.com/ping');
  assert.equal(U.toPingUrl('http://192.168.1.10:8787/'), 'http://192.168.1.10:8787/ping');
});

test('主机分类：本机 / 局域网 / 公网', () => {
  assert.equal(U.describeHost('http://localhost:8787'), 'loopback');
  assert.equal(U.describeHost('http://127.0.0.1:8787'), 'loopback');
  assert.equal(U.describeHost('http://[::1]:8787'), 'loopback');
  assert.equal(U.describeHost('http://192.168.1.10:8787'), 'private');
  assert.equal(U.describeHost('http://10.0.0.5'), 'private');
  assert.equal(U.describeHost('http://172.20.3.4'), 'private');
  assert.equal(U.describeHost('https://sync.example.com'), 'public');
});

test('http 地址不再被"语音必须 HTTPS"拦：语音不走这个服务器', () => {
  // 语音是 Agora 原生 RTC，跟同步服务器用 http 还是 https 无关——实测 http 语音正常。
  const pub = U.checkServerUrl('http://sync.example.com');
  assert.equal(pub.ok, true);
  assert.equal(pub.isHttps, false);
  assert.deepEqual(pub.warnings, [], '公网 http 不再产生任何警告');

  // localhost / 局域网仍然提醒（那是"只有本机能用/必须同 Wi-Fi"的提示，与语音无关）
  const loop = U.checkServerUrl('http://localhost:8787');
  assert.ok(loop.ok);
  assert.ok(loop.warnings.some((w) => w.includes('本机地址')));

  const lan = U.checkServerUrl('http://192.168.1.10:8787');
  assert.ok(lan.warnings.some((w) => w.includes('同一个 Wi-Fi')));

  // https 一律没有警告
  const https = U.checkServerUrl('https://sync.example.com');
  assert.deepEqual(https.warnings, []);
  assert.equal(https.isHttps, true);
});

test('非法地址被拒绝，并说清原因', () => {
  assert.equal(U.checkServerUrl('ftp://a.b').ok, false);
  assert.match(U.checkServerUrl('ftp://a.b').error, /http/);
  assert.equal(U.checkServerUrl('https://').ok, false);
});

// ---------------------------------------------------------------------------
// 1.5 主地址 + 备用地址（公网被拦时自动切换）
// ---------------------------------------------------------------------------

test('候选列表：主地址在前、备用在后', () => {
  const list = U.buildServerCandidates('https://sync.example.com', 'http://192.168.1.10:8787');
  assert.equal(list.length, 2);
  assert.equal(list[0].url, 'https://sync.example.com');
  assert.equal(list[1].url, 'http://192.168.1.10:8787');
  assert.equal(list[1].hostKind, 'private');
});

test('候选列表：去重（主备填成同一个只留一个）', () => {
  const a = U.buildServerCandidates('https://a.b/', ' https://a.b '); // 规范化后同一个
  assert.equal(a.length, 1);
  assert.equal(a[0].url, 'https://a.b');
});

test('候选列表：非法/空备用被丢弃，不影响主地址', () => {
  assert.equal(U.buildServerCandidates('https://a.b', '').length, 1);
  assert.equal(U.buildServerCandidates('https://a.b', null).length, 1);
  assert.equal(U.buildServerCandidates('https://a.b', undefined).length, 1);
  assert.equal(U.buildServerCandidates('https://a.b', 'ftp://x').length, 1);
  assert.equal(U.buildServerCandidates('https://a.b', '   ').length, 1);
});

test('候选列表：主地址非法时，合法的备用仍可用', () => {
  const list = U.buildServerCandidates('ftp://bad', 'http://127.0.0.1:8787');
  assert.equal(list.length, 1);
  assert.equal(list[0].url, 'http://127.0.0.1:8787');
});

test('候选列表：最多 3 个（再多只会拖慢失败反馈）', () => {
  const list = U.buildServerCandidates(
    'https://a.b',
    'https://c.d',
    'https://e.f',
    'https://g.h',
  );
  assert.equal(list.length, 3);
});

test('isPublicHttp 只对"公网 + 明文"为真（这种地址语音一定用不了）', () => {
  const pub = U.buildServerCandidates('http://sync.example.com')[0];
  const lan = U.buildServerCandidates('http://192.168.1.10:8787')[0];
  const sec = U.buildServerCandidates('https://sync.example.com')[0];
  assert.equal(U.isPublicHttp(pub), true);
  assert.equal(U.isPublicHttp(lan), false);
  assert.equal(U.isPublicHttp(sec), false);
});

// ---------------------------------------------------------------------------
// 2. 指数退避
// ---------------------------------------------------------------------------

test('退避序列 2s / 4s / 8s / 16s / 30s 封顶', () => {
  const seq = [1, 2, 3, 4, 5, 6, 10].map((n) => backoffDelay(n));
  assert.deepEqual(seq, [2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

test('抖动之后也不会超过上限', () => {
  for (let i = 0; i < 50; i += 1) {
    const d = backoffDelay(9, 2000, 30000, 0.3);
    assert.ok(d <= 30000 && d > 0, `got ${d}`);
  }
});

// ---------------------------------------------------------------------------
// 3. ConnectionManager 生命周期
// ---------------------------------------------------------------------------

test('connect 用 wss 地址建连，open 后触发 onOpened', () => {
  const { env, latest } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://sync.example.com', env });
  let opened = 0;
  conn.onOpened(() => (opened += 1));
  conn.connect();
  assert.equal(conn.url, 'wss://sync.example.com');
  assert.equal(conn.rawStatus, 'connecting');
  latest().fireOpen();
  assert.equal(conn.rawStatus, 'open');
  assert.equal(conn.isOpen, true);
  assert.equal(opened, 1);
  assert.equal(conn.statusInfo().tone, 'ok');
});

test('意外断开：2s→4s→8s→16s 逐级退避，成功后重置', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env, connectTimeoutMs: 60_000 });
  const delays = [];

  conn.onStatus((s) => {
    if (s.status === 'reconnecting') delays.push(s.retryInMs);
  });

  conn.connect();
  latest().fireOpen();

  // 第 1 次掉线 → 2s
  latest().fireClose();
  assert.equal(conn.rawStatus, 'reconnecting');
  assert.equal(delays.at(-1), 2000);

  // 到点重连，但立刻再掉 → 4s
  advance(2000);
  latest().fireClose();
  assert.equal(delays.at(-1), 4000);

  advance(4000);
  latest().fireClose();
  assert.equal(delays.at(-1), 8000);

  advance(8000);
  latest().fireClose();
  assert.equal(delays.at(-1), 16000);

  advance(16000);
  latest().fireOpen();
  assert.equal(conn.rawStatus, 'open');
  assert.equal(conn.statusInfo().attempt, 0, '连上后尝试次数要归零');

  // 再掉线又从 2s 开始
  latest().fireClose();
  assert.equal(delays.at(-1), 2000);
});

test('重连成功会触发 onResync（用于补发房间状态），首次连接不会', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env });
  let opened = 0;
  let resync = 0;
  conn.onOpened(() => (opened += 1));
  conn.onResync(() => (resync += 1));

  conn.connect();
  latest().fireOpen();
  assert.equal(opened, 1);
  assert.equal(resync, 0);

  latest().fireClose();
  advance(2000);
  latest().fireOpen();
  assert.equal(opened, 1, '重连不再触发首次 onOpened');
  assert.equal(resync, 1);
});

test('断线期间的消息进队列，重连后按顺序补发', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env });
  conn.connect();
  latest().fireOpen();
  latest().fireClose();

  assert.equal(conn.send({ type: 'rpc', id: 1, method: 'addTodo', args: ['买菜'] }), false);
  assert.equal(conn.send({ type: 'rpc', id: 2, method: 'addTodo', args: ['拖地'] }), false);
  assert.equal(conn.pendingCount, 2);

  advance(2000);
  const s = latest();
  s.fireOpen();
  assert.equal(conn.pendingCount, 0);
  assert.equal(s.sent.length, 2);
  assert.match(s.sent[0], /买菜/);
  assert.match(s.sent[1], /拖地/);
});

test('队列有上限，不会无限增长', () => {
  const { env } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env, maxQueue: 3 });
  conn.connect();
  for (let i = 0; i < 10; i += 1) conn.send({ type: 'rpc', id: i });
  assert.equal(conn.pendingCount, 3);
});

test('手动断开不再重连，也不留定时器', () => {
  const { env, latest, advance, timers } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env });
  conn.connect();
  latest().fireOpen();
  conn.disconnect();
  assert.equal(conn.rawStatus, 'closed');
  assert.equal(conn.statusInfo().tone, 'danger');

  const before = timers.filter((t) => !t.cleared).length;
  advance(60_000);
  assert.equal(timers.filter((t) => !t.cleared).length, before, '不应再排新的定时器');
  conn.disconnect(); // 幂等
});

test('连接超时会进入退避，而不是一直挂着', () => {
  const { env, advance } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env, connectTimeoutMs: 1000 });
  conn.connect();
  assert.equal(conn.rawStatus, 'connecting');
  advance(1000);
  assert.equal(conn.rawStatus, 'reconnecting');
  assert.match(String(conn.statusInfo().lastError), /超时/);
});

test('socket 报错同样走退避重连', () => {
  const { env, latest } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env });
  conn.connect();
  latest().fireOpen();
  latest().fireError();
  assert.equal(conn.rawStatus, 'reconnecting');
  assert.ok(conn.statusInfo().retryInMs > 0);
});

test('收到任何消息都会重置"等回包"计时（假死检测不会误杀）', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({
    url: 'https://a.b',
    env,
    heartbeatMs: 1000,
    ackTimeoutMs: 2000,
  });
  conn.connect();
  const s = latest();
  s.fireOpen();

  // 发一条需要回包的 RPC
  conn.send({ type: 'rpc', id: 1 }, true);
  // 服务器按时回包
  advance(1500);
  s.fireMessage({ type: 'rpc-result', id: 1, result: { ok: true } });
  // 再过很久也不该判定假死（心跳会发 ping，但 socket 是好的）
  advance(1500);
  assert.equal(conn.rawStatus, 'open');
});

test('发出去的 RPC 迟迟没有回包 → 判定假死并重连', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({
    url: 'https://a.b',
    env,
    heartbeatMs: 500,
    ackTimeoutMs: 1000,
  });
  conn.connect();
  const s = latest();
  s.fireOpen();
  conn.send({ type: 'rpc', id: 1 }, true);
  advance(2000); // 期间只有心跳，没有回包
  assert.equal(conn.rawStatus, 'reconnecting');
  assert.match(String(conn.statusInfo().lastError), /无响应/);
});

test('心跳会把保活 ping 发出去', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env, heartbeatMs: 1000 });
  conn.connect();
  const s = latest();
  s.fireOpen();
  advance(1000);
  const pings = s.sent.filter((raw) => raw.includes('"ping"'));
  assert.equal(pings.length, 1);
});

test('非 JSON 消息不会让客户端崩，交给上层拿到 null', () => {
  const { env, latest } = makeEnv();
  const conn = new ConnectionManager({ url: 'https://a.b', env });
  const seen = [];
  conn.onMessage((msg, raw) => seen.push([msg, raw]));
  conn.connect();
  const s = latest();
  s.fireOpen();
  s.onmessage({ data: 'not json at all' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], null);
  assert.equal(seen[0][1], 'not json at all');
});

test('状态订阅：绿 → 黄 → 红 的语义正确', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({ url: 'a.b', env });
  const tones = [];
  conn.onStatus((s) => tones.push([s.status, s.tone]));
  conn.connect();
  latest().fireOpen();
  latest().fireClose();
  advance(2000);
  latest().fireOpen();
  conn.disconnect();
  assert.deepEqual(
    tones.map((t) => t[1]),
    ['warn', 'ok', 'warn', 'warn', 'ok', 'danger'],
  );
});

// ---------------------------------------------------------------------------
// 「显示已连接，但一条推送都收不到」——手机上最常见的半死连接
// ---------------------------------------------------------------------------

test('心跳没有回应 → 判定失联并重连（这是"显示已连接却不同步"的根因）', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({
    url: 'https://a.b',
    env,
    heartbeatMs: 500,
    ackTimeoutMs: 1000,
  });
  conn.connect();
  const s = latest();
  s.fireOpen();
  // 完全不发生任何事：没有 onclose、readyState 一直是 OPEN，
  // 就像手机切网 / 被系统挂起 / NAT 丢映射之后那样。
  advance(1200); // 第一次心跳发出去了，pong 没回
  assert.equal(conn.rawStatus, 'open', '第一轮不该立刻判死（给一个心跳周期的宽限）');
  advance(2000); // 再等一轮，仍然没有 pong
  assert.equal(conn.rawStatus, 'reconnecting', '心跳连续无回应必须主动重连');
  assert.match(String(conn.statusInfo().lastError), /心跳无回应|失联/);
});

test('心跳有回应就一直保持连接（不能误杀）', () => {
  const { env, latest, advance } = makeEnv();
  const conn = new ConnectionManager({
    url: 'https://a.b',
    env,
    heartbeatMs: 500,
    ackTimeoutMs: 1000,
  });
  conn.connect();
  const s = latest();
  s.fireOpen();
  for (let i = 0; i < 10; i += 1) {
    advance(500);
    s.fireMessage({ v: 1, type: 'pong', t: 1 });
  }
  assert.equal(conn.rawStatus, 'open');
});

// ---------------------------------------------------------------------------
// 公网/移动网络下的"抖动重连"：阈值必须够宽，且不能主动掐连接
// ---------------------------------------------------------------------------

test('静默阈值可以放宽，且默认按心跳的两倍 + 回包超时算', () => {
  const { ConnectionManager } = require('../dist-core/connectionManager.js');
  const { env, latest, advance } = makeEnv();
  // 默认：heartbeat 20s，ack 15s → 55s 才算失联
  const conn = new ConnectionManager({ url: 'https://a.b', env, heartbeatMs: 20_000, ackTimeoutMs: 15_000 });
  conn.connect();
  latest().fireOpen();
  advance(50_000); // 50 秒没有任何下行
  assert.equal(conn.rawStatus, 'open', '50 秒的静默在手机上很常见，不能判死');

  // 上层可以显式放宽（App 里给了 60 秒）
  const { env: env2, latest: latest2, advance: adv2 } = makeEnv();
  const conn2 = new ConnectionManager({
    url: 'https://a.b',
    env: env2,
    heartbeatMs: 20_000,
    ackTimeoutMs: 15_000,
    silenceLimitMs: 60_000,
  });
  conn2.connect();
  latest2().fireOpen();
  // 失联判定发生在心跳里（每 20s 一次），所以要多走几轮
  adv2(85_000);
  assert.equal(conn2.rawStatus, 'reconnecting', '超过自定义阈值必须重连');
});

test('抖动抑制：连上就断、断了又连，退避必须往上抬（不能变成死循环重连）', () => {
  const { env, advance, latest } = makeEnv();
  const conn = new ConnectionManager({
    url: 'https://a.b',
    env,
    baseDelayMs: 1000,
    maxDelayMs: 30_000,
    stableMs: 15_000,
    // 把心跳/建连超时调远，只观察退避本身
    heartbeatMs: 600_000,
    ackTimeoutMs: 0,
    silenceLimitMs: 1_200_000,
    connectTimeoutMs: 600_000,
  });

  const delays = [];
  conn.onStatus((s) => {
    // 只统计"安排了一次退避"的事件；真正去连的时候也会报 reconnecting，retryIn 是 0
    if (s.status === 'reconnecting' && s.retryInMs > 0) delays.push(s.retryInMs);
  });

  conn.connect();
  // 连续 5 次"连上 2 秒就断"
  for (let i = 0; i < 5; i += 1) {
    latest().fireOpen();
    advance(2000);
    latest().fireClose('tunnel reset');
    advance(31_000); // 走完退避计时器，造出下一条连接
  }

  assert.ok(delays.length >= 4, '每次抖动都要安排重连');
  // 第 1 次抖动还是 1 秒（attempt=1），后面必须越抬越高
  assert.equal(delays[0], 1000, '第一次抖动不能被无故放大');
  assert.ok(
    delays[delays.length - 1] > delays[0],
    `连续抖动后重连间隔必须变长，实际：${delays.join(' / ')}`,
  );
});

test('抖动抑制：连接真的稳住了，退避就回到正常（不会永久惩罚）', () => {
  const { env, advance, latest } = makeEnv();
  const conn = new ConnectionManager({
    url: 'https://a.b',
    env,
    baseDelayMs: 1000,
    maxDelayMs: 30_000,
    stableMs: 15_000,
    heartbeatMs: 600_000,
    ackTimeoutMs: 0,
    silenceLimitMs: 1_200_000,
    connectTimeoutMs: 600_000,
  });

  const delays = [];
  conn.onStatus((s) => {
    if (s.status === 'reconnecting' && s.retryInMs > 0) delays.push(s.retryInMs);
  });

  conn.connect();
  // 先抖三次（退避已被抬高）
  for (let i = 0; i < 3; i += 1) {
    latest().fireOpen();
    advance(2000);
    latest().fireClose('tunnel reset');
    advance(9_000);
  }
  assert.ok(delays[delays.length - 1] > 1000, `抖动后应该已经加罚，实际：${delays.join(' / ')}`);

  // 这一次撑了 20 秒（> stableMs）才断 → 应该当作正常掉线，从 1 秒重连
  latest().fireOpen();
  advance(20_000);
  latest().fireClose('network changed');

  assert.equal(delays[delays.length - 1], 1000, '稳定过的连接断了，应该按第一次退避重连，而不是继续加罚');
});
