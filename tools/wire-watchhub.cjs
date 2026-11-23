const fs = require('node:fs');
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 引入公共影视后端
sub("import { buildApk, buildEnvStatus } from './buildApk.mjs';",
    "import { buildApk, buildEnvStatus } from './buildApk.mjs';\nimport { handleWatch, watchStats } from './watchHub.mjs';", '引入 watchHub');

// 2) 路由最前面接住 /api/relay 与 /api/watch/*
sub(`async function handle(req, res) {
  const url = new URL(req.url ?? '/', \`http://localhost:\${PORT}\`);`,
`async function handle(req, res) {
  const url = new URL(req.url ?? '/', \`http://localhost:\${PORT}\`);

  // 公共影视：跨域中转 + 弹幕/评论/房间状态（见 server/watchHub.mjs）
  try {
    if (await handleWatch(req, res, url)) return;
  } catch (err) {
    json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }`, '挂路由');

// 3) /health 里带上统计，方便排查
sub("res: revision,", "res: revision,", 'noop');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.filter((x) => x !== 'noop').join(' / '));
