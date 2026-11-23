const fs = require('node:fs');
const p = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(/versionName "[0-9.]+"/, 'versionName "1.8.0"');
fs.writeFileSync(p, t, 'utf8');
const lines = t.split('\n').filter((l) => l.includes('versionCode') || l.includes('versionName'));
console.log(lines.join(' | '));
