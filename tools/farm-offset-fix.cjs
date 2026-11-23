const fs = require('node:fs');

// 1) evPos 在 engine2 里，补上偏移
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const from = `function evPos(e){
  var t=e.changedTouches?e.changedTouches[0]:(e.touches?e.touches[0]:e);
  var r=c.getBoundingClientRect();
  return {x:t.clientX-r.left,y:t.clientY-r.top};
}`;
const to = `function evPos(e){
  var t=e.changedTouches?e.changedTouches[0]:(e.touches?e.touches[0]:e);
  var r=c.getBoundingClientRect();
  return {x:t.clientX-r.left-OFFX, y:t.clientY-r.top-SAFE};
}`;
if (t2.includes(from)) { t2 = t2.replace(from, to); fs.writeFileSync(p2, t2, 'utf8'); console.log('evPos 偏移已加'); }
else console.log('evPos 没找到，检查:', /OFFX/.test(t2));

// 2) 测试里的 tap 用"虚拟画布坐标"，派发时补上安全区
const p3 = 'C:/ts/tests/farm-html.test.js';
let t3 = fs.readFileSync(p3, 'utf8');
const from3 = `  const tap = (x, y) => {
    for (const f of listeners['touchstart'] || []) f({ changedTouches: [{ clientX: x, clientY: y }] });
    for (const f of listeners['touchend'] || []) f({ changedTouches: [{ clientX: x, clientY: y }] });
  };`;
const to3 = `  const SAFE = 26; // 游戏顶部安全区，派发点击时要补上
  const tap = (x, y) => {
    const cy = y + SAFE;
    for (const f of listeners['touchstart'] || []) f({ changedTouches: [{ clientX: x, clientY: cy }] });
    for (const f of listeners['touchend'] || []) f({ changedTouches: [{ clientX: x, clientY: cy }] });
  };`;
if (t3.includes(from3)) { t3 = t3.replace(from3, to3); fs.writeFileSync(p3, t3, 'utf8'); console.log('测试 tap 已补安全区'); }
else console.log('测试 tap 没找到');
