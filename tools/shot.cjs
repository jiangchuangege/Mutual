// 用 CDP 在精确的手机视口里截图（headless Chrome 最小窗口 500px，靠设备模拟解决）
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [, , htmlPath, outPng, wArg, hArg, waitArg] = process.argv;
const W = Number(wArg || 390), H = Number(hArg || 844), WAIT = Number(waitArg || 2500);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333 + (Math.floor(Math.random() * 200));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.resolve('tmp/chrome-profile-' + PORT),
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(200);
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      const j = await r.json();
      wsUrl = j.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
  }
  if (!wsUrl) { proc.kill(); throw new Error('Chrome 没起来'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params, sessionId) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params: params || {}, sessionId }));
  });

  const { result: target } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: attached } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sid = attached.sessionId;

  await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: true,
  }, sid);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sid);
  await send('Page.navigate', { url: 'file:///' + path.resolve(htmlPath).replace(/\\/g, '/') }, sid);
  await sleep(WAIT);
  if (process.env.EVAL) {
    const r = await send('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true, awaitPromise: true }, sid);
    console.log('EVAL:', JSON.stringify(r.result && r.result.result && r.result.result.value));
  }
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    ...(process.env.CLIP ? (() => {
      const [x, y, cw, ch, cs] = process.env.CLIP.split(',').map(Number);
      return { clip: { x, y, width: cw, height: ch, scale: cs || 2 } };
    })() : {}),
  }, sid);
  if (!shot.result || !shot.result.data) throw new Error('截图失败: ' + JSON.stringify(shot).slice(0, 200));
  fs.writeFileSync(outPng, Buffer.from(shot.result.data, 'base64'));
  console.log('截图:', outPng, fs.statSync(outPng).size, 'bytes', W + 'x' + H + '@2x');
  ws.close();
  proc.kill();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
