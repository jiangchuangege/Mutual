const fs = require('node:fs');

/* ---------- 1) 画布：横屏时用竖屏虚拟画布居中 + 顶部安全区 ---------- */
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub(`var DPR=Math.min(window.devicePixelRatio||1,2), VW=0, VH=0;
function layout(){
  VW=window.innerWidth; VH=window.innerHeight;
  c.width=VW*DPR|0; c.height=VH*DPR|0; c.style.width=VW+'px'; c.style.height=VH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}`,
`var DPR=Math.min(window.devicePixelRatio||1,2), VW=0, VH=0;
/* 横屏/刘海屏适配：竖屏虚拟画布 + 顶部安全区，横屏时两侧留黑边居中 */
var OFFX=0, SAFE=26, LANDSCAPE=false, REALW=0, REALH=0;
function layout(){
  REALW=window.innerWidth; REALH=window.innerHeight;
  LANDSCAPE=REALW>REALH*1.05;
  var availH=REALH-SAFE;
  if(LANDSCAPE){
    var vw=Math.min(REALW, Math.round(availH*9/16));
    VW=vw; VH=availH; OFFX=Math.round((REALW-vw)/2);
  } else {
    VW=REALW; VH=availH; OFFX=0;
  }
  c.width=REALW*DPR|0; c.height=REALH*DPR|0;
  c.style.width=REALW+'px'; c.style.height=REALH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}`, '横屏适配');

// 点击坐标减去偏移
sub(`function evPos(e){
  var t=e.changedTouches?e.changedTouches[0]:(e.touches?e.touches[0]:e);
  var r=c.getBoundingClientRect();
  return {x:t.clientX-r.left,y:t.clientY-r.top};
}`,
`function evPos(e){
  var t=e.changedTouches?e.changedTouches[0]:(e.touches?e.touches[0]:e);
  var r=c.getBoundingClientRect();
  return {x:t.clientX-r.left-OFFX, y:t.clientY-r.top-SAFE};
}`, '点击偏移');
fs.writeFileSync(p1, t1, 'utf8');

/* ---------- 2) 渲染：先铺满真实画布，再按虚拟画布平移 ---------- */
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const before = t2;
t2 = t2.replace(`function render(){
  hitRects=[];`,
`function render(){
  hitRects=[];
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle='#0e141c'; ctx.fillRect(0,0,REALW,REALH);
  ctx.save(); ctx.translate(OFFX,SAFE);`);
t2 = t2.replace(`  drawChrome();
  renderPanel();
}`,
`  drawChrome();
  renderPanel();
  ctx.restore();
}`);
fs.writeFileSync(p2, t2, 'utf8');
console.log('改了:', ok.join(' / '), '| 渲染包裹:', t2 !== before);

/* ---------- 3) 电视小屏位置加上偏移 ---------- */
const p3 = 'C:/ts/src/core/farmRoomShop.ts';
let t3 = fs.readFileSync(p3, 'utf8');
t3 = t3.replace(
  `  TV.video.style.left=r.x+'px';
  TV.video.style.top=r.y+'px';`,
  `  TV.video.style.left=(r.x+OFFX)+'px';
  TV.video.style.top=(r.y+SAFE)+'px';`,
);
fs.writeFileSync(p3, t3, 'utf8');
console.log('电视小屏偏移已加');
