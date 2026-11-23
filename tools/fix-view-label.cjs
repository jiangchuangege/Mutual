const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const from = "label:LANDSCAPE?'🖥横屏':'📱竖屏'";
const to = "label:LANDSCAPE?'📱竖屏':'🖥横屏'";
if (!t.includes(from)) throw new Error('找不到按钮文案');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('按钮文案改成“点了会变成什么模式”');
