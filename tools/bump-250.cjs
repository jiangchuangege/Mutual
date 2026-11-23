const fs = require('node:fs');

const gradle = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(gradle, 'utf8');
t = t.replace(/versionCode\s+\d+/, 'versionCode 57');
t = t.replace(/versionName\s+"[0-9.]+"/, 'versionName "2.5.0"');
fs.writeFileSync(gradle, t, 'utf8');

const app = 'C:/ts/app.json';
let a = fs.readFileSync(app, 'utf8');
a = a.replace(/"version"\s*:\s*"[0-9.]+"/, '"version": "2.5.0"');
a = a.replace(/"versionCode"\s*:\s*\d+/, '"versionCode": 57');
fs.writeFileSync(app, a, 'utf8');

console.log(
  t.split('\n').filter((l) => /versionCode|versionName/.test(l)).join(' | '),
  '||',
  a.split('\n').filter((l) => /"version"|versionCode/.test(l)).join(' | ').trim(),
);
