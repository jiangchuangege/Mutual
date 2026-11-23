#!/bin/bash
# 修：sync-server.mjs 里缺少 buildApk 的 import → 路由调用时报 "buildApk is not defined"
set -euo pipefail
F=/opt/twospace/server/sync-server.mjs
M=/opt/twospace/server/buildApk.mjs

echo "== 现状 =="
echo "buildApk.mjs 存在: $([ -f "$M" ] && echo yes || echo NO)"
echo "sync-server 里提到 buildApk 的行:"
grep -n 'buildApk' "$F" | head -5 || true
echo "是否有 import 行: $(grep -c "from './buildApk.mjs'" "$F" || true)"

if ! grep -q "from './buildApk.mjs'" "$F"; then
  cp -a "$F" "$F.bak-$(date +%H%M%S)"
  # 在文件开头的一批 import 之后插入（用 node 处理，避免 sed 破坏中文/引号）
  node -e '
    const fs = require("fs");
    const f = "/opt/twospace/server/sync-server.mjs";
    let t = fs.readFileSync(f, "utf8");
    if (t.includes("from \"./buildApk.mjs\"") || t.includes("from \x27./buildApk.mjs\x27")) {
      console.log("已有 import，跳过");
      process.exit(0);
    }
    const lines = t.split("\n");
    let lastImport = -1;
    for (let i = 0; i < Math.min(lines.length, 60); i += 1) {
      if (/^import\s/.test(lines[i]) || /^\}\s*from\s+/.test(lines[i])) lastImport = i;
    }
    const inject = "import { buildApk, buildEnvStatus } from \x27./buildApk.mjs\x27;";
    lines.splice(lastImport + 1, 0, inject);
    fs.writeFileSync(f, lines.join("\n"), "utf8");
    console.log("已插入 import（第 " + (lastImport + 2) + " 行）");
  '
fi

echo "== 校验语法 =="
node --check "$F" && echo "语法 OK"

echo "== 重启服务 =="
pkill -f 'server/sync-server.mjs' || true
sleep 6
systemctl is-active twospace.service
curl -s -m 5 http://127.0.0.1:8787/health; echo
echo "== 编译模块自检 =="
cd /opt/twospace && node --input-type=module -e 'import("/opt/twospace/server/buildApk.mjs").then(m=>console.log("buildApk:", typeof m.buildApk, "| env:", JSON.stringify(m.buildEnvStatus())))'
