#!/bin/bash
cd /opt/twospace
node -e '
const { Hub } = require("./dist-core/hub.js");
const h = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
h.updateMyProfile("A", { name: "a", birthDate: "1999-01-01", gender: "male" });
const snap = h.snapshot("A");
console.log("snapshot.games 是数组:", Array.isArray(snap.games));
console.log("gameSession 字段存在:", "gameSession" in snap);
console.log("methods:", typeof h.addGame, typeof h.startGame, typeof h.pushGameState, typeof h.endGame);
const g = h.addGame("A", { title: "t", code: "<html><body><canvas></canvas><script>window.TwGame={send(){},apply(){}}</script></body></html>" });
console.log("addGame ok:", g.ok);
'
