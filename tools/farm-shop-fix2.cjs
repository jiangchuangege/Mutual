const fs = require('node:fs');
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 货架排布：行距拉开、架子小一点
sub(`function shopSlotRect(i){
  var g=roomGeom2();
  var col=i%SHOP_COLS, row=Math.floor(i/SHOP_COLS);
  var depth=0.16+row*0.20;
  var p=floorPoint(g,0.16+col*0.28,depth);
  return {x:p.x,y:p.y,depth:depth};
}
function shopShelfHeight(i){ return 76*(1+Math.floor(i/SHOP_COLS)*0.06); }`,
`function shopSlotRect(i){
  var g=roomGeom2();
  var col=i%SHOP_COLS, row=Math.floor(i/SHOP_COLS);
  var depth=0.22+row*0.27;
  var p=floorPoint(g,0.20+col*0.30,depth);
  return {x:p.x,y:p.y,depth:depth};
}
function shopShelfHeight(i){ return (58+Math.floor(i/SHOP_COLS)*4); }`, '货架排布');

// 2) 标签贴到货架正面，不再浮在上方互相压住
sub(`    var slot=shopSlots[i];
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
    } else {
      ctx.fillStyle='#b0a08c'; ctx.font='700 12px system-ui'; ctx.textAlign='center';
      ctx.fillText('空位', r.x, topY-16);
      ctx.fillStyle='#c8b8a0'; ctx.font='10px system-ui';
      ctx.fillText('点我上架', r.x, topY-2);
      ctx.textAlign='left';
    }`,
`    var slot=shopSlots[i];
    var topY=r.y-hh;
    // 标签贴在架子正面
    var tagW=Math.min(46,hh*0.62), tagH=34;
    var tagX=r.x-tagW/2, tagY=r.y-hh*0.62;
    ctx.fillStyle='rgba(255,255,255,.94)';
    rr(tagX,tagY,tagW,tagH,6); ctx.fill();
    ctx.strokeStyle='rgba(150,110,70,.35)'; ctx.lineWidth=1; rr(tagX,tagY,tagW,tagH,6); ctx.stroke();
    if(slot.g>=0&&slot.q>0){
      drawGoodIcon(GOODS[slot.g], r.x, tagY+11, 13);
      ctx.fillStyle='#3f2a12'; ctx.font='700 9px system-ui'; ctx.textAlign='center';
      ctx.fillText('×'+slot.q, r.x, tagY+24);
      ctx.fillStyle='#2f6a26'; ctx.font='700 9px system-ui';
      ctx.fillText(slot.p+'金', r.x, tagY+32);
      ctx.textAlign='left';
    } else {
      ctx.fillStyle='#b0a08c'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
      ctx.fillText('空位', r.x, tagY+15);
      ctx.fillStyle='#c8b8a0'; ctx.font='8px system-ui';
      ctx.fillText('点上架', r.x, tagY+27);
      ctx.textAlign='left';
    }`, '货架标签');

// 3) 收银台缩小、放到最前面，别挡货架
sub(`  var cp=floorPoint(g,0.5,0.92);
  drawFurniture('kitchenBar',0,cp.x,cp.y,86*depthScale(0.92));
  ctx.fillStyle='rgba(0,0,0,.35)'; rr(cp.x-46,cp.y-92,92,20,8); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='700 11px system-ui'; ctx.textAlign='center';
  ctx.fillText('💰 '+coins,cp.x,cp.y-78); ctx.textAlign='left';`,
`  var cp=floorPoint(g,0.5,1.0);
  drawFurniture('kitchenBar',0,cp.x,cp.y,58*depthScale(1.0));
  ctx.fillStyle='rgba(0,0,0,.32)'; rr(cp.x-40,cp.y-60,80,18,7); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
  ctx.fillText('💰 '+coins,cp.x,cp.y-47); ctx.textAlign='left';`, '收银台');

// 4) 顶部统计别被招牌压住
sub(`  ctx.fillStyle='rgba(255,255,255,.75)'; ctx.font='600 11px system-ui';
  ctx.fillText('今日进账 '+shopIncome+' 金 · 顾客 '+shopCrowd.length, g.x+12, g.y+52);`,
`  ctx.fillStyle='rgba(40,60,50,.85)'; ctx.font='600 11px system-ui';
  ctx.fillText('今日进账 '+shopIncome+' 金 · 顾客 '+shopCrowd.length+' 位', g.x+14, g.y+g.wallH+16);`, '顶部统计');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
