const fs = require('node:fs');

const g = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(g, 'utf8');
t = t.replace(/versionCode\s+\d+/, 'versionCode 63');
t = t.replace(/versionName\s+"[0-9.]+"/, 'versionName "3.0.1"');
fs.writeFileSync(g, t, 'utf8');

const a = 'C:/ts/app.json';
let j = fs.readFileSync(a, 'utf8');
j = j.replace(/"version"\s*:\s*"[0-9.]+"/, '"version": "3.0.1"');
j = j.replace(/"versionCode"\s*:\s*\d+/, '"versionCode": 63');
fs.writeFileSync(a, j, 'utf8');

console.log(t.split('\n').filter((l) => /versionCode|versionName/.test(l)).join(' | '));
