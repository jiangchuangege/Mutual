#!/bin/bash
# 服务以 User=admin 运行、Restart=always：结束旧进程，systemd 会用新代码自动拉起
echo "== 结束旧进程 =="
pkill -f 'server/sync-server.mjs' && echo "已发送 TERM" || echo "没找到进程（可能已在重启中）"
sleep 6
echo "== 服务状态 =="
systemctl is-active twospace.service
echo "== 健康检查（uptimeSec 应该是几秒，说明真的重启了）=="
curl -s -m 5 http://127.0.0.1:8787/health; echo
echo "== 进程 =="
ps -eo user,pid,etime,cmd | grep 'sync-server' | grep -v grep
echo "== 日志（若没有权限就跳过）=="
journalctl -u twospace.service -n 8 --no-pager 2>/dev/null | tail -8 || echo "（无日志读取权限）"
