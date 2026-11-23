const fs = require('node:fs');
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 商店：墙面加装饰 + 商品图标放大
sub(`  // 招牌
  ctx.fillStyle='#c2543a'; rr(g.x+g.w*0.2,g.y+6,g.w*0.6,30,8); ctx.fill();`,
`  // 墙面装饰
  ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillRect(g.x,g.floorY-64,g.w,64);
  ctx.fillStyle='#f6d9a8';
  rr(g.x+g.w*0.04,g.y+g.wallH*0.34,g.w*0.2,g.wallH*0.3,8); ctx.fill();
  rr(g.x+g.w*0.24,g.y+g.wallH*0.4,g.w*0.16,g.wallH*0.24,8); ctx.fill();
  ctx.fillStyle='#7a5220'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
  ctx.fillText('特价',g.x+g.w*0.14,g.y+g.wallH*0.52);
  ctx.fillText('新到',g.x+g.w*0.32,g.y+g.wallH*0.55);
  ctx.textAlign='left';
  // 挂钟
  ctx.fillStyle='#fdf6e6'; ctx.beginPath(); ctx.arc(g.x+g.w*0.9,g.y+g.wallH*0.4,14,0,6.2832); ctx.fill();
  ctx.strokeStyle='#8a5f38'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.x+g.w*0.9,g.y+g.wallH*0.4);
  ctx.lineTo(g.x+g.w*0.9,g.y+g.wallH*0.4-8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.x+g.w*0.9,g.y+g.wallH*0.4);
  ctx.lineTo(g.x+g.w*0.9+6,g.y+g.wallH*0.4+3); ctx.stroke();
  // 招牌
  ctx.fillStyle='#c2543a'; rr(g.x+g.w*0.2,g.y+6,g.w*0.6,30,8); ctx.fill();`, '商店墙面');

sub(`    var slot=shopSlots[i];
    var topY=r.y-hh;
    ctx.fillStyle='rgba(255,255,255,.9)';
    rr(r.x-16,topY-16,32,20,6); ctx.fill();
    if(slot.g>=0&&slot.q>0){
      drawGoodIcon(GOODS[slot.g], r.x, topY-6, 13);
      ctx.fillStyle='#3f2a12'; ctx.font='700 9px system-ui'; ctx.textAlign='center';
      ctx.fillText('×'+slot.q, r.x, topY+12);
      ctx.fillStyle='#2f6a26'; ctx.fillText(slot.p+'金', r.x, topY+23);
      ctx.textAlign='left';
    } else {`,
`    var slot=shopSlots[i];
    var topY=r.y-hh;
    ctx.fillStyle='rgba(255,255,255,.92)';
    rr(r.x-22,topY-40,44,58,8); ctx.fill();
    ctx.strokeStyle='rgba(150,110,70,.35)'; ctx.lineWidth=1.2; rr(r.x-22,topY-40,44,58,8); ctx.stroke();
    if(slot.g>=0&&slot.q>0){
      drawGoodIcon(GOODS[slot.g], r.x, topY-22, 19);
      ctx.fillStyle='#3f2a12'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
      ctx.fillText('×'+slot.q, r.x, topY-2);
      ctx.fillStyle='#2f6a26'; ctx.font='700 11px system-ui';
      ctx.fillText(slot.p+'金', r.x, topY+12);
      ctx.textAlign='left';
    } else {`, '货架标签放大');

sub(`      ctx.fillStyle='#b0a08c'; ctx.font='700 11px system-ui'; ctx.textAlign='center';
      ctx.fillText('空', r.x, topY-2); ctx.textAlign='left';`,
`      ctx.fillStyle='#b0a08c'; ctx.font='700 12px system-ui'; ctx.textAlign='center';
      ctx.fillText('空位', r.x, topY-16);
      ctx.fillStyle='#c8b8a0'; ctx.font='10px system-ui';
      ctx.fillText('点我上架', r.x, topY-2);
      ctx.textAlign='left';`, '空位提示');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
