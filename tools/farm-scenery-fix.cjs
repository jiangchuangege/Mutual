const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 小屋：按 houseRect 的实际大小缩放，别用院子高度硬套
sub(`  var wallH=h*0.5, wallY=y+h-wallH;
  // 墙
  var ww=h*1.25;
  drawSce('wall-wood', x+w/2, y+h, wallH*1.02);
  // 屋顶
  drawSce('roof-gable', x+w/2, wallY+h*0.06, h*0.5);
  // 门 + 窗
  drawSce('wall-wood-door', x+w*0.5, y+h, h*0.34);
  drawSce('wall-wood-window-shutters', x+w*0.2, wallY+wallH*0.5, h*0.2);
  drawSce('wall-wood-window-shutters', x+w*0.8, wallY+wallH*0.5, h*0.2);
  // 烟囱
  drawSce('chimney', x+w*0.78, wallY+h*0.02, h*0.26);`,
`  var bodyH=Math.min(h*0.52,86), wallY=y+h-bodyH;
  // 墙
  drawSce('wall-wood', x+w/2, y+h, bodyH);
  // 屋顶
  drawSce('roof-gable', x+w/2, wallY+4, bodyH*0.85);
  // 门 + 窗
  drawSce('wall-wood-door', x+w*0.5, y+h, bodyH*0.7);
  drawSce('wall-wood-window-shutters', x+w*0.2, wallY+bodyH*0.55, bodyH*0.34);
  drawSce('wall-wood-window-shutters', x+w*0.8, wallY+bodyH*0.55, bodyH*0.34);
  // 烟囱
  drawSce('chimney', x+w*0.74, wallY, bodyH*0.45);`, '小屋尺寸');

// 摊位也按 rect 缩
sub(`  drawSce('stall-red', x+w/2, y+h, h*1.05);`,
    `  drawSce('stall-red', x+w/2, y+h, Math.min(h*0.8,52));`, '摊位尺寸');

// 院子：统一用参照高度，避免巨大化
sub(`  var groundY=y+h*0.98;
  // 树（大小错落）
  drawSce('tree_oak', x+w*0.80, groundY, h*0.92);
  drawSce('tree_pineTallA', x+w*0.94, groundY, h*0.80);
  drawSce('tree_small', x+w*0.06, groundY-h*0.02, h*0.52);
  // 灌木 / 石头 / 木头
  drawSce('plant_bushLarge', x+w*0.68, groundY-h*0.01, h*0.24);
  drawSce('plant_bush', x+w*0.32, groundY, h*0.18);
  drawSce('rock_largeA', x+w*0.46, groundY, h*0.2);
  drawSce('rock_smallA', x+w*0.56, groundY-h*0.01, h*0.11);
  drawSce('log', x+w*0.24, groundY, h*0.13);
  // 花
  drawSce('flower_redA', x+w*0.12, groundY-h*0.02, h*0.12);
  drawSce('flower_yellowA', x+w*0.18, groundY-h*0.01, h*0.11);
  drawSce('flower_purpleA', x+w*0.5, groundY-h*0.02, h*0.12);
  // 风车（右下角点缀）
  drawSce('windmill', x+w*0.88, groundY-h*0.12, h*0.5);
  // 木牌
  drawSce('sign', x+w*0.40, groundY-h*0.02, h*0.2);
  // 栅栏一排
  for(var fx=x-6;fx<x+w+6;fx+=Math.max(26,w*0.09)){
    drawSce('fence_simple', fx, groundY-h*0.005, h*0.15);
  }`,
`  var groundY=y+h*0.96;
  var R=Math.min(h*0.85,120);
  // 树（大小错落）
  drawSce('tree_oak', x+w*0.82, groundY, R*0.62);
  drawSce('tree_pineTallA', x+w*0.96, groundY, R*0.5);
  drawSce('tree_small', x+w*0.05, groundY, R*0.34);
  // 灌木 / 石头 / 木头
  drawSce('plant_bushLarge', x+w*0.70, groundY, R*0.16);
  drawSce('plant_bush', x+w*0.30, groundY, R*0.12);
  drawSce('rock_largeA', x+w*0.46, groundY, R*0.14);
  drawSce('rock_smallA', x+w*0.56, groundY, R*0.08);
  drawSce('log', x+w*0.22, groundY, R*0.09);
  // 花
  drawSce('flower_redA', x+w*0.13, groundY, R*0.08);
  drawSce('flower_yellowA', x+w*0.19, groundY, R*0.07);
  drawSce('flower_purpleA', x+w*0.52, groundY, R*0.08);
  // 风车（右下角点缀）
  drawSce('windmill', x+w*0.90, groundY-R*0.06, R*0.34);
  // 木牌
  drawSce('sign', x+w*0.38, groundY, R*0.13);
  // 栅栏一排
  for(var fx=x+4;fx<x+w;fx+=Math.max(24,w*0.085)){
    drawSce('fence_simple', fx, groundY+R*0.09, R*0.1);
  }`, '院子尺寸');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
