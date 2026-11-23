const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');

// 小屋外观：回到手绘版本（和素材拼装比，这个在竖屏里更协调）
const hs = t.indexOf('function drawHouseExterior(){');
const he = t.indexOf('/** 超市摊位（点进超市） */');
if (hs < 0 || he < 0) throw new Error('找不到小屋外观段');
const house = `function drawHouseExterior(){
  var r=houseRect(), w=r.w, h=r.h, x=r.x, y=r.y;
  var bodyH=Math.min(h*0.62,96);
  softShadow(x+w/2,y+h,w*0.5,h*0.08,0.2);
  var wg=ctx.createLinearGradient(x,y+h-bodyH,x+w,y+h);
  wg.addColorStop(0,'#fdf1dc'); wg.addColorStop(1,'#e6cfae');
  ctx.fillStyle=wg; rr(x,y+h-bodyH,w,bodyH,8); ctx.fill();
  ctx.strokeStyle='rgba(150,110,70,.35)'; ctx.lineWidth=1.5; rr(x,y+h-bodyH,w,bodyH,8); ctx.stroke();
  // 屋顶
  ctx.fillStyle='#c2543a';
  ctx.beginPath();
  ctx.moveTo(x-w*0.1,y+h-bodyH);
  ctx.lineTo(x+w/2,y+h-bodyH*1.75);
  ctx.lineTo(x+w*1.1,y+h-bodyH);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.moveTo(x-w*0.1,y+h-bodyH);
  ctx.lineTo(x+w/2,y+h-bodyH*1.75); ctx.lineTo(x+w/2,y+h-bodyH); ctx.closePath(); ctx.fill();
  // 烟囱
  ctx.fillStyle='#a9674c'; ctx.fillRect(x+w*0.7,y+h-bodyH*1.55,w*0.1,bodyH*0.28);
  ctx.fillStyle='rgba(255,255,255,.55)';
  for(var s=0;s<3;s++){
    var sy=y+h-bodyH*1.62-s*9-(tick%40)/12;
    ctx.beginPath(); ctx.arc(x+w*0.75+Math.sin(tick/40+s)*3,sy,3+s*0.6,0,6.2832); ctx.fill();
  }
  // 门
  var dw=w*0.24, dh=bodyH*0.62;
  ctx.fillStyle='#8a5f38'; rr(x+w*0.5-dw/2,y+h-dh,dw,dh,6); ctx.fill();
  ctx.fillStyle='#ffd75e';
  ctx.beginPath(); ctx.arc(x+w*0.5+dw*0.28,y+h-dh*0.45,2.6,0,6.2832); ctx.fill();
  // 窗
  ctx.fillStyle='#bfe4f0'; rr(x+w*0.12,y+h-bodyH*0.88,w*0.2,bodyH*0.34,4); ctx.fill();
  ctx.strokeStyle='#8a5f38'; ctx.lineWidth=2; rr(x+w*0.12,y+h-bodyH*0.88,w*0.2,bodyH*0.34,4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.22,y+h-bodyH*0.88); ctx.lineTo(x+w*0.22,y+h-bodyH*0.54); ctx.stroke();
  // 门牌
  ctx.fillStyle='rgba(255,252,240,.95)'; rr(x+w*0.5-26,y+h-bodyH-8,52,16,5); ctx.fill();
  ctx.strokeStyle='rgba(120,80,40,.4)'; ctx.lineWidth=1.2; rr(x+w*0.5-26,y+h-bodyH-8,52,16,5); ctx.stroke();
  ctx.fillStyle='#8a4a2a'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
  ctx.fillText('我们的小窝',x+w*0.5,y+h-bodyH+4); ctx.textAlign='left';
}
`;
t = t.slice(0, hs) + house + t.slice(he);

// 摊位：也回到手绘版本
const ms = t.indexOf('function drawMarketStall(){');
const me = t.indexOf('/** 农家院装饰 */');
if (ms < 0 || me < 0) throw new Error('找不到摊位段');
const stall = `function drawMarketStall(){
  var r=marketRect(), x=r.x, y=r.y, w=r.w, h=r.h;
  softShadow(x+w/2,y+h,w*0.44,h*0.1,0.18);
  ctx.fillStyle='#f7efd9'; rr(x,y+h*0.42,w,h*0.58,6); ctx.fill();
  ctx.fillStyle='#c9a06a'; ctx.fillRect(x,y+h*0.66,w,3);
  for(var i=0;i<3;i++){
    ctx.fillStyle=['#e8465f','#f2c86b','#7fc8a9'][i];
    rr(x+w*0.12+i*w*0.26,y+h*0.5,w*0.16,h*0.14,3); ctx.fill();
  }
  for(var s=0;s<6;s++){
    ctx.fillStyle=s%2?'#fdf6e6':'#e05b3e';
    ctx.beginPath();
    ctx.moveTo(x-w*0.06+s*(w*1.12/6),y+h*0.42);
    ctx.lineTo(x-w*0.06+(s+1)*(w*1.12/6),y+h*0.42);
    ctx.lineTo(x-w*0.06+(s+1)*(w*1.12/6),y+h*0.26);
    ctx.lineTo(x-w*0.06+s*(w*1.12/6),y+h*0.26);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle='#8a5f38'; ctx.fillRect(x-w*0.06,y+h*0.2,w*1.12,4);
  ctx.fillStyle='rgba(255,252,240,.95)'; rr(x+w*0.24,y+h*0.72,w*0.52,16,5); ctx.fill();
  ctx.fillStyle='#a1407a'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
  ctx.fillText('超 市',x+w*0.5,y+h*0.72+12); ctx.textAlign='left';
}
`;
t = t.slice(0, ms) + stall + t.slice(me);
fs.writeFileSync(p, t, 'utf8');
console.log('小屋/摊位改回手绘版本（素材只留树、灌木、栅栏、风车等点缀）');
