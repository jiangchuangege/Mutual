#!/bin/bash
cd /opt/twospace
node -e '
const { Hub } = require("./dist-core/hub.js");
const h = new Hub();
console.log("部署内核自检：");
console.log("  addWatchQueue      =", typeof h.addWatchQueue);
console.log("  addWatchQueueBatch =", typeof h.addWatchQueueBatch);
console.log("  removeWatchQueue   =", typeof h.removeWatchQueue);
console.log("  clearWatchQueue    =", typeof h.clearWatchQueue);
console.log("  playFromQueue      =", typeof h.playFromQueue);
const { transition } = require("./dist-core/room.js");
console.log("  RECAP + END    =", transition("RECAP", "END"));
console.log("  RECAP + CANCEL =", transition("RECAP", "CANCEL"));
'
echo "运行中的进程启动时间："
ps -eo pid,etime,cmd | grep 'sync-server' | grep -v grep
echo "健康检查："
curl -s -m 5 http://127.0.0.1:8787/health; echo
