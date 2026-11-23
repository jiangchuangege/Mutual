const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 按"目标宽度"画素材，方便把小屋拼整齐
sub(`/** 画一件外景（x=中心, baseY=底边, h=高度） */`,
`/** 按目标宽度画（宽度对齐用） */
function drawSceW(k,x,baseY,targetW){
  var im=sceImg(k);
  if(im&&im.complete&&im.naturalWidth){
    var H=targetW*(im.naturalHeight/im.naturalWidth);
    ctx.drawImage(im,x-targetW/2,baseY-H,targetW,H);
    return H;
  }
  return 0;
}
/** 画一件外景（x=中心, baseY=底边, h=高度） */`, '按宽度画素材');

// 2) 小屋：宽度对齐拼装
sub(`  var bodyH=Math.min(h*0.52,86), wallY=y+h-bodyH;
  // 墙
  drawSce('wall-wood', x+w/2, y+h, bodyH);
  // 屋顶
  drawSce('roof-gable', x+w/2, wallY+4, bodyH*0.85);
  // 门 + 窗
  drawSce('wall-wood-door', x+w*0.5, y+h, bodyH*0.7);
  drawSce('wall-wood-window-shutters', x+w*0.2, wallY+bodyH*0.55, bodyH*0.34);
  drawSce('wall-wood-window-shutters', x+w*0.8, wallY+bodyH*0.55, bodyH*0.34);
  // 烟囱
  drawSce('chimney', x+w*0.74, wallY, bodyH*0.45);`,
`  var hw=Math.min(w*0.86,150);
  var bodyH=drawSceW('wall-wood', x+w/2, y+h, hw);
  var wallY=y+h-bodyH;
  drawSce('roof-gable', x+w/2, wallY+6, hw*0.42);
  drawSce('wall-wood-door', x+w*0.5, y+h, hw*0.26);
  drawSce('wall-wood-window-shutters', x+w*0.24, wallY+bodyH*0.56, hw*0.2);
  drawSce('wall-wood-window-shutters', x+w*0.76, wallY+bodyH*0.56, hw*0.2);
  drawSce('chimney', x+w*0.76, wallY, hw*0.2);`, '小屋宽度对齐');

// 3) 摊位按宽度
sub(`  drawSce('stall-red', x+w/2, y+h, Math.min(h*0.8,52));`,
    `  drawSceW('stall-red', x+w/2, y+h, Math.min(w*0.95,140));`, '摊位宽度');

// 4) 院子加高（田板让一点空间出来）
sub('  var boardH=w*(VH<640?0.68:0.74);', '  var boardH=w*(VH<640?0.56:0.60);', '院子加高');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));

// 测试里的田板高度同步
const tp = 'C:/ts/tests/farm-html.test.js';
let tt = fs.readFileSync(tp, 'utf8');
tt = tt.replace('const BOARD_H = BOARD_W * 0.74;', 'const BOARD_H = BOARD_W * 0.60;');
fs.writeFileSync(tp, tt, 'utf8');
