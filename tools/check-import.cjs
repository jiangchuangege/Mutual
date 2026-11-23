// 验证"电脑上把下载的游戏推进游戏库"这条链路（本地 8799 端口）
const BASE = 'http://127.0.0.1:8799';

async function post(p, body, token) {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  // 0) 导入页能打开
  const page = await fetch(BASE + '/import');
  const html = await page.text();
  console.log('import page:', page.status, html.includes('把游戏传进游戏库'), html.length + 'B');

  // 1) 建两个账号并绑定（模拟一对情侣）
  const a = await post('/api/account/create', { name: '阿狸', gender: 'female', birthDate: '1998-05-20', pin: '111111' });
  const b = await post('/api/account/create', { name: '小兔', gender: 'male', birthDate: '1997-02-14', pin: '222222' });
  if (!a.json?.value?.token) {
    console.error('create failed', JSON.stringify(a.json));
    return;
  }
  const ta = a.json.value.token;
  const tb = b.json.value.token;
  const ida = a.json.value.accountId;
  const idb = b.json.value.accountId;
  console.log('accounts:', ida, idb);

  const req = await post('/api/pair/request', { targetId: idb }, ta);
  const acc = await post('/api/pair/accept', {}, tb);
  console.log('pair:', req.status, acc.status, JSON.stringify(acc.json).slice(0, 80));

  // 2) 用登录接口换 token（导入页走的就是这条）
  const login = await post('/api/account/login', { accountId: ida, pin: '999999' });
  console.log('login with wrong pin:', login.status, login.json.error);
  const good = await post('/api/account/login', { accountId: ida, pin: '111111' });
  console.log('login ok:', good.status, Boolean(good.json?.value?.token));

  // 3) 上传一个"下载来的游戏"（小 HTML），看是否进库
  const gameHtml = '<!doctype html><html><head><!--mutual-game {"title":"测试小游戏","players":2}--></head><body><canvas></canvas></body></html>';
  const data = Buffer.from(gameHtml, 'utf8').toString('base64');
  const added = await post('/api/game/add', { title: '测试小游戏', data, ext: 'html', players: 2 }, ta);
  console.log('game/add:', added.status, JSON.stringify(added.json).slice(0, 160));

  const assetPath = added.json?.value?.assetPath;
  if (assetPath) {
    const served = await fetch(BASE + assetPath);
    const text = await served.text();
    console.log('served file:', served.status, served.headers.get('content-type'), text.length + 'B',
      text.includes('测试小游戏'));
  }

  // 4) 对方的视角：B 用长连接拿到空间快照，应能看到同一个游戏
  const seen = await new Promise((resolve) => {
    const ws = new WebSocket(BASE.replace('http', 'ws'));
    const timer = setTimeout(() => resolve(null), 6000);
    ws.onopen = () => ws.send(JSON.stringify({ v: 1, type: 'hello', token: tb, rev: 0 }));
    ws.onmessage = (ev) => {
      let msg = null;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg && msg.type === 'state' && msg.state) {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* 忽略 */
        }
        resolve(msg.state);
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
  });
  const games = seen?.games ?? [];
  console.log('B sees games:', games.length,
    games.map((g) => g.title + '@' + (g.assetPath || 'code')).join(','));
  console.log('B sees the imported game:', games.some((g) => g.title === '测试小游戏'));
})().catch((e) => console.error('FAIL', e.message));
