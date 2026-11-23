const fs = require('node:fs');

// 1) 内置片源配置文件（服务端，前端看不到完整地址）
fs.mkdirSync('C:/ts/server/config', { recursive: true });
const cfg = {
  _说明: '片库接口清单。改完这个文件重启服务（或 POST /api/cms/reload）即可生效，前端不用发版。',
  _示例: '{"id":"a1","url":"https://你的接口/api.php/provide/vod","label":"源A","enabled":true}',
  apis: [],
};
fs.writeFileSync('C:/ts/server/config/cms.json', JSON.stringify(cfg, null, 2), 'utf8');
console.log('已写 server/config/cms.json（默认空，填 URL 就能用）');

// 2) 把两个模块挂到 sync-server
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

sub("import { buildApk, buildEnvStatus } from './buildApk.mjs';",
    "import { buildApk, buildEnvStatus } from './buildApk.mjs';\nimport { handleCms, cmsStatus } from './cmsProxy.mjs';\nimport { handleWatch } from './watchHub.mjs';", '引入模块');

sub(`async function handle(req, res) {
  const url = new URL(req.url ?? '/', \`http://localhost:\${PORT}\`);`,
`async function handle(req, res) {
  const url = new URL(req.url ?? '/', \`http://localhost:\${PORT}\`);

  // 公共影视后端：片库代理（零输入）+ 跨域中转 + 弹幕/评论/房间
  try {
    if (await handleCms(req, res, url)) return;
    if (await handleWatch(req, res, url)) return;
  } catch (err) {
    json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }`, '挂路由');

// 3) health 里带片源统计
sub("res: revision,", "res: revision,\n    watch: cmsStatus(),", 'health 统计');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
