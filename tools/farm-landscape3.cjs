const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 横屏时院子太矮：不画院子/建筑，避免和畜栏叠在一起（竖屏照常）
sub(`  drawSky(); drawGrass(); drawYard();
  drawHouseExterior(); drawMarketStall(); drawPets();`,
`  drawSky(); drawGrass();
  if(!LANDSCAPE){
    drawYard(); drawHouseExterior(); drawMarketStall(); drawPets();
  }`, '横屏隐藏院子');

// 横屏时给一句提示，别让人以为院子没了
sub(`  // 底部：当前种子条
  var sg=shopGeom();`,
`  if(LANDSCAPE){
    ctx.fillStyle='rgba(0,0,0,.35)'; rr(12,penGeom().y-24,VW-24,18,8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='10px system-ui'; ctx.textAlign='center';
    ctx.fillText('横屏只显示田地 · 转回竖屏看院子和房子',VW/2,penGeom().y-11); ctx.textAlign='left';
  }
  // 底部：当前种子条
  var sg=shopGeom();`, '横屏提示');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
