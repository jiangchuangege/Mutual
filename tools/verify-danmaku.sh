#!/bin/bash
cd /opt/twospace
node -e '
const { Hub } = require("./dist-core/hub.js");
const h = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
h.updateMyProfile("A", { name: "甲", birthDate: "1999-01-01", gender: "male" });
h.updateMyProfile("B", { name: "乙", birthDate: "1999-01-01", gender: "female" });
h.bindPair("A");
const r = h.createRoom("A", "片A", "https://cdn.example.com/a1.m3u8");
h.joinRoomByCode("B", r.value.code);
const d = h.sendDanmaku("A", "在片A里说的");
console.log("弹幕带片源 :", d.value && d.value.sourceUrl);
console.log("片A下可见数 :", h.snapshot("A").activeRoom.danmaku.length);
h.setRoomSource("A", "https://cdn.example.com/b1.m3u8", "片B");
console.log("换到片B后 :", h.snapshot("B").activeRoom.danmaku.length, "(应为 0)");
h.setRoomSource("A", "https://cdn.example.com/a1.m3u8", "片A");
console.log("换回片A后 :", h.snapshot("B").activeRoom.danmaku.length, "(应为 1)");
const { transition } = require("./dist-core/room.js");
console.log("RECAP+CANCEL :", transition("RECAP", "CANCEL"), "/ RECAP+END :", transition("RECAP", "END"));
'
echo "--- 线上健康 ---"
curl -s -m 5 http://127.0.0.1:8787/health; echo
