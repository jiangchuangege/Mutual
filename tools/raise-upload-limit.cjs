const fs = require('node:fs');
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');

// 1) 把 4MB 硬上限放开（音频 24MB base64 / 游戏 64MB base64 都要能进得来）
const old = "      if (raw.length > 4 * 1024 * 1024) req.destroy();";
const neu = `      // 上限设为 80MB：比"音频 24MB / 游戏 64MB 的 base64"都大一点。
      // 以前这里是 4MB 并且直接 req.destroy()，于是上传几 MB 的音乐/游戏时
      // 手机会看到 "fetch failed: Connection reset"（服务端把连接掐了）。
      if (raw.length > 80 * 1024 * 1024) {
        tooBig = true;
        req.destroy();
      }`;
if (!t.includes(old)) throw new Error('readBody 上限那行没找到');
t = t.replace(old, neu);

// 2) 补 tooBig 标记，便于给出明确错误（而不是安静地断掉）
t = t.replace(
  "function readBody(req) {\n  return new Promise((resolve) => {\n    let raw = '';",
  "function readBody(req) {\n  return new Promise((resolve) => {\n    let raw = '';\n    let tooBig = false;"
);
t = t.replace(
  "    req.on('end', () => {\n      try {",
  "    req.on('close', () => {\n      if (tooBig) resolve({ __tooBig: true });\n    });\n    req.on('end', () => {\n      try {"
);

// 3) 路由里遇到 tooBig 明确回 413
const anchor = "  if (url.pathname === '/api/upload' && req.method === 'POST') {\n    const body = await readBody(req);";
if (t.includes(anchor)) {
  t = t.replace(
    anchor,
    "  if (url.pathname === '/api/upload' && req.method === 'POST') {\n    const body = await readBody(req);\n    if (body && body.__tooBig) {\n      json(res, 413, { ok: false, error: '这个文件太大了（上限约 60MB）' });\n      return;\n    }"
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('已放开上传体积上限:', {
  '80MB': t.includes('80 * 1024 * 1024'),
  tooBig: t.includes('tooBig'),
  413: t.includes('413'),
});
