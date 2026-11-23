const fs = require('node:fs');

/* ================= 1) 整体放大：UI 缩放 ================= */
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1(`var viewMode='';
function layout(){`,
`var viewMode='';
/* 全局 UI 放大系数：所有布局都用"虚拟像素"，画的时候整体放大，字和图都变大 */
var UIZOOM=1.18;
function layout(){`, 'UIZOOM');

sub1(`  REALW=window.innerWidth; REALH=window.innerHeight;
  var availH=REALH-SAFE;`,
`  REALW=window.innerWidth; REALH=window.innerHeight;
  var availH=(REALH-SAFE)/UIZOOM;
  REALW=Math.round(REALW/UIZOOM);`, '虚拟尺寸');

sub1(`  c.width=REALW*DPR|0; c.height=REALH*DPR|0;
  c.style.width=REALW+'px'; c.style.height=REALH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}`,
`  var realW=window.innerWidth, realH=window.innerHeight;
  c.width=realW*DPR|0; c.height=realH*DPR|0;
  c.style.width=realW+'px'; c.style.height=realH+'px';
  ctx.setTransform(DPR*UIZOOM,0,0,DPR*UIZOOM,0,0);
}`, 'DPR 缩放'); 

// 点击坐标也要按缩放换算
sub1(`  return {x:t.clientX-r.left-OFFX, y:t.clientY-r.top-SAFE};`,
     `  return {x:(t.clientX-r.left)/UIZOOM-OFFX, y:(t.clientY-r.top)/UIZOOM-SAFE/UIZOOM};`, '点击换算');
fs.writeFileSync(p1, t1, 'utf8');

/* ================= 2) 渲染：铺底 + 平移要用真实像素 ================= */
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2(`  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle='#0e141c'; ctx.fillRect(0,0,REALW,REALH);
  ctx.save(); ctx.translate(OFFX,SAFE);`,
`  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#0e141c';
  ctx.fillRect(0,0,c.width|0,c.height|0);
  ctx.setTransform(DPR*UIZOOM,0,0,DPR*UIZOOM,0,0);
  ctx.save(); ctx.translate(OFFX,SAFE/UIZOOM);`, '铺底与平移');

// 电视小屏（DOM 元素）也要跟着缩放
sub2(`  TV.video.style.left=(r.x+OFFX+4)+'px';
  TV.video.style.top=(r.y+SAFE+4)+'px';
  TV.video.style.width=(r.w-8)+'px';
  TV.video.style.height=(r.h-8)+'px';`,
`  TV.video.style.left=((r.x+OFFX)*UIZOOM+4)+'px';
  TV.video.style.top=((r.y+SAFE/UIZOOM)*UIZOOM+4)+'px';
  TV.video.style.width=((r.w-8)*UIZOOM)+'px';
  TV.video.style.height=((r.h-8)*UIZOOM)+'px';`, '电视 DOM 缩放');

/* ================= 3) 动物列表：可以滚动，全部都能看到 ================= */
sub2(`var zooSel=0;`, `var zooSel=0, zooScroll=0;`, 'zooScroll');
sub2(`function zooGeom(){ return {x:8,y:82,w:VW-16,h:VH-220}; }`,
     `function zooGeom(){ return {x:8,y:82,w:VW-16,h:VH-200}; }`, '列表高度');
sub2(`function zooCardRect(i){
  var zg=zooGeom(), n=zooCols(), cw=(zg.w-10)/n;
  var ch=LANDSCAPE?88:98;
  return {x:zg.x+4+(i%n)*(cw+4),y:zg.y+4+Math.floor(i/n)*(ch+6),w:cw-4,h:ch};
}`,
`function zooCardRect(i){
  var zg=zooGeom(), n=zooCols(), cw=(zg.w-10)/n;
  var ch=LANDSCAPE?88:104;
  return {x:zg.x+4+(i%n)*(cw+4),y:zg.y+4+Math.floor(i/n)*(ch+6)-zooScroll,w:cw-4,h:ch};
}
function zooTotalHeight(){
  var zg=zooGeom(), n=zooCols(), ch=LANDSCAPE?88:104;
  return Math.ceil(Math.max(1,zoo.length)/n)*(ch+6)+12;
}`, '动物卡滚动');

// 标题显示总数 + 滚动提示
sub2(`  ctx.fillStyle='#3f2a12'; ctx.font='700 13px system-ui';
  ctx.fillText('🐾 我们的动物 · 共 '+zoo.length+' 只', 14, 100);`,
`  ctx.fillStyle='#3f2a12'; ctx.font='700 13px system-ui';
  ctx.fillText('🐾 我们的动物 · 共 '+zoo.length+' 只（上下拖动看全部）', 14, 100);`, '标题');

// 滚动条 + 裁剪
sub2(`  var zg=zooGeom();
  ctx.save(); ctx.beginPath(); ctx.rect(0,zg.y,VW,zg.h); ctx.clip();`,
`  var zg=zooGeom();
  var total=zooTotalHeight();
  if(zooScroll>Math.max(0,total-zg.h)) zooScroll=Math.max(0,total-zg.h);
  if(zooScroll<0) zooScroll=0;
  ctx.save(); ctx.beginPath(); ctx.rect(0,zg.y,VW,zg.h); ctx.clip();`, '滚动裁剪');
sub2(`  ctx.restore();
  // 底部操作区`,
`  ctx.restore();
  if(total>zg.h){
    var barH=Math.max(28,zg.h*zg.h/total);
    var barY=zg.y+(zg.h-barH)*(zooScroll/Math.max(1,total-zg.h));
    ctx.fillStyle='rgba(120,90,50,.22)'; rr(VW-8,zg.y,5,zg.h,3); ctx.fill();
    ctx.fillStyle='rgba(120,90,50,.55)'; rr(VW-8,barY,5,barH,3); ctx.fill();
  }
  // 底部操作区`, '滚动条');

// 触摸滚动：动物列表也支持
sub2(`  if((scene==='market'&&!panel)||(scene==='zoo'&&!panel)){
    if(scene==='market'){
      var items=marketItems(), mg=marketGeom();
      var total=Math.ceil(items.length/mg.cols)*mg.cardH;
      marketScroll=Math.max(0,Math.min(Math.max(0,total-mg.h+10),marketScroll-dy));
    }
    dragY=y;`,
`  if((scene==='market'&&!panel)||(scene==='zoo'&&!panel)){
    if(scene==='market'){
      var items=marketItems(), mg=marketGeom();
      var total=Math.ceil(items.length/mg.cols)*mg.cardH;
      marketScroll=Math.max(0,Math.min(Math.max(0,total-mg.h+10),marketScroll-dy));
    } else {
      var zg2=zooGeom(), tot2=zooTotalHeight();
      zooScroll=Math.max(0,Math.min(Math.max(0,tot2-zg2.h),zooScroll-dy));
    }
    dragY=y;`, '动物滚动');

// 切场景时把滚动复位
sub2(`      if(px>=t0.x&&px<=t0.x+t0.w&&py>=t0.y&&py<=t0.y+t0.h){ scene=t0.id; sfx(700,0.2); return; }`,
     `      if(px>=t0.x&&px<=t0.x+t0.w&&py>=t0.y&&py<=t0.y+t0.h){ scene=t0.id; zooScroll=0; marketScroll=0; sfx(700,0.2); return; }`, '切场景复位');
fs.writeFileSync(p2, t2, 'utf8');
console.log('改了:', ok.concat(ok2).join(' / '));
