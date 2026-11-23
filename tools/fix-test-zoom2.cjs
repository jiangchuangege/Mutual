const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 让"客户端像素"和"虚拟像素"对上：窗口 = 虚拟尺寸 × 缩放 + 安全区
sub(`const VW = 390;
const CLIENT_H = 844;   // 真实窗口高度
const SAFE_TOP = 26;    // 游戏顶部安全区
const VH = CLIENT_H - SAFE_TOP;  // 游戏内部虚拟高度`,
`const UIZOOM = 1.18;    // 游戏内部放大系数
const VW = 390;                     // 游戏内部虚拟宽度
const VH = 818;                     // 游戏内部虚拟高度
const SAFE_TOP = 26;                // 顶部安全区（客户端像素）
const CLIENT_W = Math.round(VW * UIZOOM);
const CLIENT_H = Math.round(VH * UIZOOM + SAFE_TOP);`, '尺寸常量');

sub(`  sandbox.window.innerWidth = VW;
  sandbox.window.innerHeight = CLIENT_H;`,
`  sandbox.window.innerWidth = CLIENT_W;
  sandbox.window.innerHeight = CLIENT_H;`, '窗口尺寸');

sub(`  const UIZOOM = 1.18; // 游戏内部放大系数（虚拟坐标 → 客户端坐标）
  const tap = (x, y) => {`,
`  const tap = (x, y) => {`, '去掉重复常量');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
