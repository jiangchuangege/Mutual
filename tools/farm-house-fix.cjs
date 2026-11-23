const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 小屋：加"自带的家具"——地毯 / 床 / 厨房角 / 盆栽 / 墙画 / 电视柜，让屋子一进来就像个家
sub(
  `  ctx.fillStyle='#8a5f38'; ctx.fillRect(r.x,r.y+r.wallH-6,r.w,6);`,
  `  ctx.fillStyle='#8a5f38'; ctx.fillRect(r.x,r.y+r.wallH-6,r.w,6);
  // 踢脚线下的一点暖光
  var glow=ctx.createRadialGradient(r.x+r.w*0.5,r.y+r.wallH-30,10,r.x+r.w*0.5,r.y+r.wallH-30,r.w*0.8);
  glow.addColorStop(0,'rgba(255,236,190,.35)'); glow.addColorStop(1,'rgba(255,236,190,0)');
  ctx.fillStyle=glow; ctx.fillRect(r.x,r.y+r.wallH-90,r.w,90);
  // 自带家具（摆在最底层，玩家买的装饰会盖在上面）
  var fy=r.y+r.h;
  drawDecorItem({c:'rug',p:3,s:2,n:'地毯'}, r.x+r.w*0.5, fy-96, r.w*0.62, r.w*0.3);
  drawDecorItem({c:'bed',p:5,s:2,n:'床'}, r.x+r.w*0.24, fy-128, r.w*0.38, r.w*0.24);
  drawDecorItem({c:'kitchen',p:1,s:2,n:'厨房'}, r.x+r.w*0.82, fy-104, r.w*0.34, r.w*0.2);
  drawDecorItem({c:'plant',p:6,s:1,n:'盆栽'}, r.x+r.w*0.1, fy-60, r.w*0.14, r.w*0.13);
  drawDecorItem({c:'wall',p:7,s:1,n:'墙画'}, r.x+r.w*0.3, r.y+r.wallH*0.34, r.w*0.16, r.w*0.14);
  drawDecorItem({c:'lamp',p:2,s:1,n:'落地灯'}, r.x+r.w*0.62, fy-70, r.w*0.13, r.w*0.2);`,
  '自带家具'
);

// 电视柜 + 电视摆正
sub(
  `  ctx.fillStyle='rgba(255,255,255,.9)'; ctx.font='600 9px system-ui'; ctx.textAlign='center';
  ctx.fillText('点我看电视',tr.x+tr.w/2,tr.y+tr.h+14); ctx.textAlign='left';`,
  `  // 电视柜
  ctx.fillStyle='#8a5f38';
  rr(tr.x-14,tr.y+tr.h+8,tr.w+28,16,5); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.18)';
  rr(tr.x-8,tr.y+tr.h+11,tr.w+16,4,2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='600 9px system-ui'; ctx.textAlign='center';
  ctx.fillText('点我看电视',tr.x+tr.w/2,tr.y+tr.h+38); ctx.textAlign='left';`,
  '电视柜'
);

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
