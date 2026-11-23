#!/bin/sh
# 部署 sync-server.mjs：先备份，再替换，再重启，最后验证
set -e
TS=$(date +%Y%m%d-%H%M%S)
cd /opt/twospace/server
cp sync-server.mjs "sync-server.mjs.bak-$TS"
echo "backup: sync-server.mjs.bak-$TS"
cp /tmp/sync-server-new.mjs sync-server.mjs
echo "lines: $(wc -l < sync-server.mjs)"
grep -c '把游戏传进游戏库' sync-server.mjs || echo "WARN: import page not found in file"
pkill -f 'server/sync-server.mjs' || true
sleep 3
echo "service: $(systemctl is-active twospace || true)"
echo -n "health: "
curl -s -m 6 http://127.0.0.1:8787/health || echo "(health 没响应)"
echo
echo -n "import page: "
curl -s -o /dev/null -w '%{http_code} %{size_download}B' -m 6 http://127.0.0.1:8787/import || echo "(失败)"
echo
