const fs = require('node:fs');
const p = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(/versionCode \d+/, 'versionCode 40');
t = t.replace(/versionName "[0-9.]+"/, 'versionName "2.0.4"');
fs.writeFileSync(p, t, 'utf8');
console.log(t.split('\n').filter((l) => l.includes('versionCode') || l.includes('versionName')).join(' | '));
