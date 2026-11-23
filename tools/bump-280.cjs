const fs = require('node:fs');

const g = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(g, 'utf8');
t = t.replace(/versionCode\s+\d+/, 'versionCode 60');
t = t.replace(/versionName\s+"[0-9.]+"/, 'versionName "2.8.0"');
fs.writeFileSync(g, t, 'utf8');

const a = 'C:/ts/app.json';
let j = fs.readFileSync(a, 'utf8');
j = j.replace(/"version"\s*:\s*"[0-9.]+"/, '"version": "2.8.0"');
j = j.replace(/"versionCode"\s*:\s*\d+/, '"versionCode": 60');
fs.writeFileSync(a, j, 'utf8');

console.log(t.split('\n').filter((l) => /versionCode|versionName/.test(l)).join(' | '));

// 顺便看下开场文案里的数量
const m = require('../dist-core/gameFarm.js');
const h = m.buildFarmHtml();
const go = h.slice(h.indexOf('<div id="go">'), h.indexOf('<canvas'));
console.log(go.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
