const fs = require('node:fs');

// 1) engine2 的 evPos：按放大系数换算
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const from2 = `  return {x:t.clientX-r.left-OFFX, y:t.clientY-r.top-SAFE};`;
const to2 = `  return {x:(t.clientX-r.left)/UIZOOM-OFFX, y:(t.clientY-r.top)/UIZOOM-SAFE/UIZOOM};`;
if (!t2.includes(from2)) throw new Error('找不到 evPos 返回行');
t2 = t2.replace(from2, to2);
fs.writeFileSync(p2, t2, 'utf8');
console.log('evPos 按 UI 缩放换算');

// 2) 测试 harness：派发点击时把虚拟坐标 × UI 缩放
const p3 = 'C:/ts/tests/farm-html.test.js';
let t3 = fs.readFileSync(p3, 'utf8');
const from3 = `  const tap = (x, y) => {
    const cy = y + SAFE_TOP;
    for (const f of listeners['touchstart'] || []) f({ changedTouches: [{ clientX: x, clientY: cy }] });
    for (const f of listeners['touchend'] || []) f({ changedTouches: [{ clientX: x, clientY: cy }] });
  };`;
const to3 = `  const UIZOOM = 1.18; // 游戏内部放大系数（虚拟坐标 → 客户端坐标）
  const tap = (x, y) => {
    const cx = x * UIZOOM;
    const cy = y * UIZOOM + SAFE_TOP;
    for (const f of listeners['touchstart'] || []) f({ changedTouches: [{ clientX: cx, clientY: cy }] });
    for (const f of listeners['touchend'] || []) f({ changedTouches: [{ clientX: cx, clientY: cy }] });
  };`;
if (!t3.includes(from3)) throw new Error('找不到测试 tap');
t3 = t3.replace(from3, to3);
fs.writeFileSync(p3, t3, 'utf8');
console.log('测试 tap 已按缩放换算');
