const fs = require('node:fs');
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 电视：尺寸跟着墙高走，整块挂在墙上，底边不落到地板
sub(`function tvScreenRect(){
  var g=roomGeom2();
  var w=Math.min(g.w*0.30,150);
  return {x:g.x+g.w*0.64-w/2, y:g.floorY-g.wallH*0.74, w:w, h:w*0.6};
}`,
`function tvScreenRect(){
  var g=roomGeom2();
  var wallH=g.wallH;
  var w=Math.min(g.w*0.26, Math.min(170, wallH*1.65));
  var h=w*0.60;
  var y=g.floorY-h-wallH*0.12;
  if(y<g.y+10) y=g.y+10;
  return {x:g.x+g.w*0.62-w/2, y:y, w:w, h:h};
}`, '电视挂墙');

// 电视柜放到地板上（而不是浮在屏幕下面）
sub(`  drawFurniture('cabinetTelevision',0,tr.x+tr.w/2,tr.y+tr.h+22,tr.h*0.5);`,
    `  drawFurniture('cabinetTelevision',0,tr.x+tr.w/2,g.floorY+8,Math.max(34,tr.h*0.42));`, '电视柜落地');

// 挂架（墙上一点支撑感）
sub(`  ctx.fillStyle='#241f27'; rr(tr.x-5,tr.y-5,tr.w+10,tr.h+10,9); ctx.fill();`,
`  ctx.fillStyle='rgba(90,70,50,.35)'; rr(tr.x+tr.w*0.2,g.floorY-g.wallH*0.12,tr.w*0.6,6,3); ctx.fill();
  ctx.fillStyle='#241f27'; rr(tr.x-5,tr.y-5,tr.w+10,tr.h+10,9); ctx.fill();`, '挂架');

// 频道文字放在电视正下方（墙上），不压地板线
sub(`  ctx.fillText((typeof TV!=='undefined'&&CHANNELS[TV.ch]?CHANNELS[TV.ch].n:'CCTV-1')+' · 点电视全屏',
    tr.x+tr.w/2,tr.y+tr.h+40); ctx.textAlign='left';`,
`  ctx.fillText((typeof TV!=='undefined'&&CHANNELS[TV.ch]?CHANNELS[TV.ch].n:'CCTV-1')+' · 点电视全屏',
    tr.x+tr.w/2,tr.y+tr.h+16); ctx.textAlign='left';`, '频道文字位置');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
