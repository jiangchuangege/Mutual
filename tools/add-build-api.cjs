const fs = require('node:fs');

// ---------- 1) 服务端：加 /api/build 与 /api/build/env ----------
let s = fs.readFileSync('C:/ts/server/sync-server.mjs', 'utf8');
if (!s.includes('/api/build')) {
  s = s.replace(
    "import { createServer } from 'node:http';",
    "import { createServer } from 'node:http';\nimport { buildApk, buildEnvStatus } from './buildApk.mjs';"
  );
  const route = `
  // ---- 云编译：Java 源码 → 可安装 APK ----
  if (url.pathname === '/api/build/env' && req.method === 'GET') {
    const account = requireAccount(req, res, url, {});
    if (!account) return;
    json(res, 200, { ok: true, value: buildEnvStatus() });
    return;
  }

  if (url.pathname === '/api/build' && req.method === 'POST') {
    const body = await readBody(req);
    const account = requireAccount(req, res, url, body);
    if (!account) return;
    const result = buildApk({ title: body.title, files: body.files });
    if (!result.ok) {
      json(res, 400, { ok: false, error: result.error });
      return;
    }
    // 编译产物落到 games/ 目录，客户端按 /game/xxx.apk 下载
    const dir = uploadDir('game');
    fs.mkdirSync(dir, { recursive: true });
    const name = \`\${account.id}-\${Date.now().toString(36)}.apk\`;
    fs.copyFileSync(result.apk, path.join(dir, name));
    try {
      fs.unlinkSync(result.apk);
    } catch {
      // 临时文件删不掉就算了
    }
    console.log(\`[build] 账号=\${account.id} 产物=\${name} \${Math.round(result.bytes / 1024)}KB\`);
    json(res, 200, { ok: true, value: { path: \`/game/\${name}\`, bytes: result.bytes, title: result.title } });
    return;
  }
`;
  // 插到 /api/rpc 路由之前
  const anchor = "  if (url.pathname === '/api/rpc' && req.method === 'POST') {";
  if (!s.includes(anchor)) throw new Error('找不到 /api/rpc 路由作为插入点');
  s = s.replace(anchor, route + '\n' + anchor);
  fs.writeFileSync('C:/ts/server/sync-server.mjs', s, 'utf8');
}
console.log('server /api/build:', s.includes("'/api/build'"), '| env:', s.includes("'/api/build/env'"));
