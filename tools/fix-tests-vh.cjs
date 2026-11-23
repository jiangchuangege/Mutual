const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 游戏虚拟画布高度 = 客户端高度 - 顶部安全区(26)
sub('const VW = 390;\nconst VH = 844;',
    'const VW = 390;\nconst CLIENT_H = 844;   // 真实窗口高度\nconst SAFE_TOP = 26;    // 游戏顶部安全区\nconst VH = CLIENT_H - SAFE_TOP;  // 游戏内部虚拟高度', '虚拟高度常量');
sub('  sandbox.window.innerHeight = VH;', '  sandbox.window.innerHeight = CLIENT_H;', '窗口高度');
sub('  const SAFE = 26; // 游戏顶部安全区，派发点击时要补上\n  const tap = (x, y) => {\n    const cy = y + SAFE;',
    '  const tap = (x, y) => {\n    const cy = y + SAFE_TOP;', '点击补安全区');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
