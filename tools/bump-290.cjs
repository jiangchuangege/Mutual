const fs = require('node:fs');

const g = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(g, 'utf8');
t = t.replace(/versionCode\s+\d+/, 'versionCode 61');
t = t.replace(/versionName\s+"[0-9.]+"/, 'versionName "2.9.0"');
fs.writeFileSync(g, t, 'utf8');

const a = 'C:/ts/app.json';
let j = fs.readFileSync(a, 'utf8');
j = j.replace(/"version"\s*:\s*"[0-9.]+"/, '"version": "2.9.0"');
j = j.replace(/"versionCode"\s*:\s*\d+/, '"versionCode": 61');
fs.writeFileSync(a, j, 'utf8');

const s = 'C:/ts/src/core/gameFarm.ts';
let k = fs.readFileSync(s, 'utf8');
k = k.replace(' *  - 作物 260 种（10 科：浆果/瓜/根/叶/秆/西瓜/果树/花/菌/椒）', ' *  - 作物 28 种（Kenney Food Kit，一条一张图）');
k = k.replace(' *  - 动物 116 种（13 型 chibi，可喂/撸/繁殖/买卖/当宠物/入畜栏产东西）', ' *  - 动物 24 只（Kenney Cube Pets，一只一张图，可喂/撸/繁殖/买卖/当宠物）');
k = k.replace(' *  - 超市 132 件商品（零食/饮料/生鲜/日用/礼物/宠物用品）', ' *  - 超市 63 件商品（Kenney Food Kit，一件一张图）');
k = k.replace(' *  - 小屋 360 件家具装饰（12 类 × 30 配色），可自由摆放', ' *  - 小屋 63 件家具（Kenney Furniture Kit，一件一张图），可自由摆放');
fs.writeFileSync(s, k, 'utf8');

console.log(t.split('\n').filter((l) => /versionCode|versionName/.test(l)).join(' | '));
