const fs = require('node:fs');
const p = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(p, 'utf8');
// 修掉上一步误写进去的 HTML 实体
t = t.replace(/versionName\s+&quot;[0-9.]+&quot;/, 'versionName "2.2.1"');
t = t.replace(/versionName\s+"?[0-9.]+"?/, 'versionName "2.2.1"');
t = t.replace(/versionCode\s+\d+/, 'versionCode 48');
fs.writeFileSync(p, t, 'utf8');
const lines = t.split('\n').filter((l) => l.includes('versionCode') || l.includes('versionName'));
console.log(lines.join(' | '));
console.log('含实体?', t.includes('&quot;'));
