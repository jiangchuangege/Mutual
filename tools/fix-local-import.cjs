const fs = require('node:fs');

// 1) 本地 sync-server.mjs 补上 import（之前每次部署都被旧副本覆盖，根因就是本地文件本身没有这行）
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');
if (!t.includes("from './buildApk.mjs'")) {
  const lines = t.split('\n');
  let lastImport = -1;
  for (let i = 0; i < Math.min(lines.length, 80); i += 1) {
    if (/^import\s/.test(lines[i]) || /^\}\s*from\s+/.test(lines[i])) lastImport = i;
  }
  lines.splice(lastImport + 1, 0, "import { buildApk, buildEnvStatus } from './buildApk.mjs';");
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
  console.log('本地已插入 import（第 ' + (lastImport + 2) + ' 行）');
} else {
  console.log('本地已有 import');
}

// 2) 部署脚本别再覆盖 sync-server.mjs（它就是用 /tmp 里的旧文件把 import 冲掉的）
const d = 'C:/ts/tools/deploy-full.sh';
let s = fs.readFileSync(d, 'utf8');
const bad = "if [ -f /tmp/sync-server.mjs ]; then cp -f /tmp/sync-server.mjs server/sync-server.mjs; fi\n";
if (s.includes(bad)) {
  s = s.replace(bad, '# 注意：不要在这里覆盖 server/sync-server.mjs —— 曾用 /tmp 里的旧副本把 buildApk 的 import 冲掉过\n');
  fs.writeFileSync(d, s, 'utf8');
  console.log('部署脚本已停止覆盖 sync-server.mjs');
}
