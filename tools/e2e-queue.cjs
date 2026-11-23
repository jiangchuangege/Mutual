/* 端到端验证：用"和线上完全同一份" server + dist-core 起一个临时实例，
 * 走真实的 HTTP 接口：注册两个账号 → 互相绑定 → 批量加入队列两次 → 看计数。
 * 目的：证明 addWatchQueueBatch / 判重 / 计数在 HTTP 路径上真的成立，而不只是单测。
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-e2e-'));

const post = async (p, body, token) => {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
};

(async () => {
  const srv = spawn(process.execPath, ['server/sync-server.mjs'], {
    cwd: 'C:/ts',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TWOSPACE_DATA: dataDir },
    stdio: 'ignore',
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let health = null;
  for (let i = 0; i < 40; i++) {
    await wait(250);
    try {
      health = await (await fetch(`${BASE}/health`)).json();
      break;
    } catch {
      /* 还没起来 */
    }
  }
  if (!health) {
    console.log('临时服务器没起来');
    srv.kill();
    process.exit(1);
  }
  console.log('临时服务器 ok，账号模型:', health.model);

  const a = await post('/api/account/create', {
    name: '端到端甲',
    gender: 'male',
    birthDate: '1999-01-01',
    pin: '111111',
  });
  const b = await post('/api/account/create', {
    name: '端到端乙',
    gender: 'female',
    birthDate: '2000-02-02',
    pin: '222222',
  });
  const tok = (r) => (r.value ? r.value.token : r.token);
  const acc = (r) => (r.value ? r.value.accountId : r.accountId);
  if (!tok(a) || !tok(b)) {
    console.log('注册失败:', JSON.stringify(a), JSON.stringify(b));
    srv.kill();
    process.exit(1);
  }
  console.log('账号:', acc(a), acc(b));

  await post('/api/pair/request', { targetId: acc(b) }, tok(a));
  await post('/api/pair/accept', {}, tok(b));
  await wait(300);

  const eps = [1, 2, 3, 4, 5].map((n) => ({
    title: '影子姐妹2026',
    url: `https://cdn.example.com/shadow/ep${n}.m3u8`,
    episodeIndex: n - 1,
    episodeName: `第0${n}集`,
    vodId: 'vod-shadow',
  }));

  const first = await post('/api/rpc', { method: 'addWatchQueueBatch', args: [eps] }, tok(a));
  const again = await post('/api/rpc', { method: 'addWatchQueueBatch', args: [eps] }, tok(a));
  const state = await post('/api/rpc', { method: 'snapshot', args: [] }, tok(b));
  const queue = state.value ? state.value.watchQueue : state.watchQueue;

  console.log('第一次批量加入:', JSON.stringify(first.value ?? first));
  console.log('第二次批量加入:', JSON.stringify(again.value ?? again));
  console.log('B 看到的队列长度:', Array.isArray(queue) ? queue.length : '(读不到)');

  const passed =
    first.ok && first.value.added === 5 && first.value.dup === 0 &&
    again.ok && again.value.added === 0 && again.value.dup === 5 &&
    Array.isArray(queue) && queue.length === 5;
  console.log(passed ? '✅ 端到端通过：批量加入 + 判重 + 双方可见' : '❌ 端到端不符合预期');

  srv.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(passed ? 0 : 1);
})().catch((err) => {
  console.error('端到端脚本异常:', err);
  process.exit(1);
});
