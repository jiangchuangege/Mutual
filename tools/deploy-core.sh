#!/bin/bash
set -e
cd /opt/twospace
STAMP=$(date +%Y%m%d-%H%M%S)
cp -a dist-core "dist-core.bak-$STAMP"
tar -xf /tmp/dist-core-deploy.tar -C /opt/twospace
rm -f /tmp/dist-core-deploy.tar
echo "== 部署后自检 =="
echo "addWatchQueue 出现次数: $(grep -c addWatchQueue dist-core/hub.js || true)"
echo "addWatchQueueBatch 出现次数: $(grep -c addWatchQueueBatch dist-core/hub.js || true)"
echo "RECAP 空转移表残留(应为 0): $(grep -c 'RECAP: {}' dist-core/room.js || true)"
echo "备份目录: dist-core.bak-$STAMP"
sudo -n systemctl restart twospace.service
sleep 2
echo "服务状态: $(systemctl is-active twospace.service)"
curl -s -m 5 http://127.0.0.1:8787/health || true
echo
echo "== 最近日志 =="
sudo -n journalctl -u twospace.service -n 12 --no-pager | tail -12
