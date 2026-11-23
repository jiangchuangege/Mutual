#!/bin/bash
set -e
cd /opt/twospace
STAMP=$(date +%Y%m%d-%H%M%S)
cp -a dist-core "dist-core.bak-$STAMP"
cp -a server/sync-server.mjs "server/sync-server.mjs.bak-$STAMP"
tar -xf /tmp/dist-core-deploy.tar -C /opt/twospace
# 注意：不要在这里覆盖 server/sync-server.mjs —— 曾用 /tmp 里的旧副本把 buildApk 的 import 冲掉过
rm -f /tmp/dist-core-deploy.tar /tmp/sync-server.mjs
echo "== 自检 =="
echo "hub: addComment=$(grep -c 'addComment(' dist-core/hub.js || true) comments字段=$(grep -c 'comments: this.state.comments' dist-core/hub.js || true)"
echo "server: audio上传=$(grep -c \"audio: { dir: 'audio'\" server/sync-server.mjs || true) audio路由=$(grep -c \"'/audio/'\" server/sync-server.mjs || true)"
echo "备份: dist-core.bak-$STAMP / server/sync-server.mjs.bak-$STAMP"
pkill -f 'server/sync-server.mjs' || true
sleep 6
echo "服务: $(systemctl is-active twospace.service)"
curl -s -m 5 http://127.0.0.1:8787/health; echo
