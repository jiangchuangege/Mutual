const fs = require('node:fs');

// 本地起一个临时实例做冒烟测试（不碰线上数据）
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 8899;
const DATA = path.resolve('tmp/smoke-space.json');
fs.mkdirSync(path.dirname(DATA), { recursive: true });
if (fs.existsSync(DATA)) fs.unlinkSync(DATA);

const child = spawn(process.execPath, ['server/sync-server.mjs'], {
  cwd: path.resolve('.'),
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_FILE: DATA },
  stdio: 'ignore',
});

const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(p) {
  const res = await fetch(base + p);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 json */ }
  return { status: res.status, json, text, headers: res.headers };
}
async function post(p, body) {
  const res = await fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 json */ }
  return { status: res.status, json };
}

(async () => {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const r = await get('/ping');
      if (r.json?.ok) { ready = true; break; }
    } catch { /* 还没起 */ }
  }
  console.log('服务启动:', ready);
  if (!ready) { child.kill(); process.exit(1); }

  console.log('\n== 片源清单（空配置）==');
  const apis = await get('/api/cms/apis');
  console.log(apis.status, JSON.stringify(apis.json));

  console.log('\n== 列表（没配源时的表现）==');
  const list = await get('/api/cms/list?pg=1');
  console.log(list.status, JSON.stringify(list.json).slice(0, 160));

  console.log('\n== 跨域中转（用 github API 验通道）==');
  const relay = await get('/api/relay?url=' + encodeURIComponent('https://api.github.com/zen'));
  console.log(relay.status, 'cors=' + relay.headers.get('access-control-allow-origin'), 'body=' + relay.text.slice(0, 60));

  console.log('\n== 内网地址必须被拦 ==');
  const blocked = await get('/api/relay?url=' + encodeURIComponent('http://127.0.0.1:8899/ping'));
  console.log(blocked.status, JSON.stringify(blocked.json));

  console.log('\n== 弹幕：发一条 / 拉一次 ==');
  const dpost = await post('/api/watch/danmaku', { key: 'abc123:ep1', text: '这镜头绝了', at: 12.5, from: '路人甲' });
  console.log('POST', dpost.status, JSON.stringify(dpost.json).slice(0, 120));
  const dget = await get('/api/watch/danmaku?key=abc123:ep1');
  console.log('GET', dget.status, '条数=' + (dget.json?.value?.items?.length ?? -1));

  console.log('\n== 评论：发/列/点赞/举报 ==');
  const cpost = await post('/api/watch/comment', { key: 'abc123', text: '看完哭了', from: '路人乙', spoiler: true });
  console.log('POST', cpost.status, JSON.stringify(cpost.json).slice(0, 140));
  const cid = cpost.json?.value?.id;
  const clist = await get('/api/watch/comment?key=abc123');
  console.log('GET', clist.status, '条数=' + (clist.json?.value?.items?.length ?? -1));
  if (cid) {
    const like = await post('/api/watch/comment/like', { id: cid });
    console.log('LIKE', like.status, JSON.stringify(like.json));
    const report = await post('/api/watch/comment/report', { id: cid, reason: 'spam' });
    console.log('REPORT', report.status, JSON.stringify(report.json));
  }

  console.log('\n== 含链接的评论应被拒 ==');
  const bad = await post('/api/watch/comment', { key: 'abc123', text: '看这里 https://x.com/a.m3u8' });
  console.log(bad.status, JSON.stringify(bad.json));

  console.log('\n== 房间状态：写/读 ==');
  const rpost = await post('/api/watch/room', { room: 'ep1', from: 'dev1', state: { leader: 'dev1', playing: true, pos: 42, rate: 1 } });
  console.log('POST', rpost.status, JSON.stringify(rpost.json).slice(0, 160));
  const rget = await get('/api/watch/room?room=ep1');
  console.log('GET', rget.status, JSON.stringify(rget.json));

  child.kill();
  await sleep(300);
  console.log('\n冒烟测试结束');
})();
