const fs = require('node:fs');

// 版本号 → 2.6.0 / 58
const gradle = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(gradle, 'utf8');
t = t.replace(/versionCode\s+\d+/, 'versionCode 58');
t = t.replace(/versionName\s+"[0-9.]+"/, 'versionName "2.6.0"');
fs.writeFileSync(gradle, t, 'utf8');

const app = 'C:/ts/app.json';
let a = fs.readFileSync(app, 'utf8');
a = a.replace(/"version"\s*:\s*"[0-9.]+"/, '"version": "2.6.0"');
a = a.replace(/"versionCode"\s*:\s*\d+/, '"versionCode": 58');
fs.writeFileSync(app, a, 'utf8');

// 注释里的数量也更新，别写着 130 种
const g = 'C:/ts/src/core/gameFarm.ts';
let s = fs.readFileSync(g, 'utf8');
s = s.replace(' *  - 作物 130 种（10 科：浆果/瓜/根/叶/秆/西瓜/果树/花/菌/椒）', ' *  - 作物 260 种（10 科：浆果/瓜/根/叶/秆/西瓜/果树/花/菌/椒）');
s = s.replace(' *  - 动物 24 种（13 型 chibi，可喂/撸/繁殖/买卖/当宠物/入畜栏产东西）', ' *  - 动物 116 种（13 型 chibi，可喂/撸/繁殖/买卖/当宠物/入畜栏产东西）');
s = s.replace(' *  - 小屋 240 件家具装饰（12 类 × 20 配色），可自由摆放', ' *  - 小屋 360 件家具装饰（12 类 × 30 配色），可自由摆放');
fs.writeFileSync(g, s, 'utf8');

console.log(t.split('\n').filter((l) => /versionCode|versionName/.test(l)).join(' | '));
