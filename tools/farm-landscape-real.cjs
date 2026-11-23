const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 取消横屏信箱：横屏直接用整块屏幕
sub(`  if(LANDSCAPE){
    var vw=Math.min(REALW, Math.round(availH*0.78));
    VW=vw; VH=availH; OFFX=Math.round((REALW-vw)/2);
  } else {
    VW=REALW; VH=availH; OFFX=0;
  }`,
`  VW=REALW; VH=availH; OFFX=0;`, '取消信箱');

// 2) 统一布局：横屏两栏（左田板 / 右院子+畜栏），竖屏保持原样
sub(`function shopGeom(){ var h=(VH<640?64:74), w=Math.min(VW-16,340); return {x:(VW-w)/2,y:VH-h-6,w:w,h:h}; }
function penGeom(){ var sh=shopGeom(); var h=(VH<640?80:100); var w=(VW-24)/3; return {y:sh.y-10-h,h:h,w:w}; }
function yardGeom(){
  var pg=penGeom();
  var top=(VH<640?74:92);
  var w=Math.min(VW-20,382);
  var x0=(VW-w)/2;
  var boardH=w*(VH<640?0.56:0.60);
  // 横屏时高度不够：田板压到畜栏上方，别被盖住
  var maxBoard=pg.y-10-top;
  if(boardH>maxBoard) boardH=Math.max(120,maxBoard);
  var yb=top+boardH;
  var yEnd=pg.y-6;
  return {x0:x0,y0:top,w:w,h:boardH,yb:yb,yardY:yb+4,yardH:Math.max(52,yEnd-yb-6)};
}
function geo(){ var yg=yardGeom(); return {x0:yg.x0,y0:yg.y0,w:yg.w,h:yg.h,pw:yg.w/COLS,ph:yg.h/ROWS}; }`,
`function shopGeom(){ var h=(VH<640?64:74), w=Math.min(VW-16,340); return {x:(VW-w)/2,y:VH-h-6,w:w,h:h}; }
/** 一屏布局：竖屏=上下排；横屏=左田板 + 右院子/畜栏 */
function layoutFarm(){
  var top=(VH<640?74:86);
  var shopH=(VH<640?64:74);
  var shopY=VH-shopH-6;
  var bottom=shopY-8;
  if(LANDSCAPE){
    var leftW=Math.round(VW*0.54);
    var bw=leftW-24;
    var bh=Math.min(bottom-top, bw*0.80);
    var bx=8+Math.max(0,(leftW-16-bw)/2);
    var by=top+Math.max(0,(bottom-top-bh)/2);
    var rx=leftW+4, rw=VW-rx-10;
    var yardH=Math.max(96,(bottom-top)-Math.max(96,(bottom-top)*0.44)-10);
    var penH=(bottom-top)-yardH-10;
    return {
      board:{x:bx,y:by,w:bw,h:bh},
      yard:{x:rx,y:top,w:rw,h:yardH},
      pens:{x:rx,y:top+yardH+10,w:rw,h:Math.max(80,penH)},
      shop:{x:(VW-Math.min(VW-16,340))/2,y:shopY,w:Math.min(VW-16,340),h:shopH}
    };
  }
  var w=Math.min(VW-20,382);
  var boardH=w*(VH<640?0.56:0.60);
  var x0=(VW-w)/2;
  var yb=top+boardH;
  var penH2=(VH<640?80:100);
  var penY=Math.max(yb+60, shopY-10-penH2);
  var yardTop=yb, yardEnd=penY-6;
  return {
    board:{x:x0,y:top,w:w,h:boardH},
    yard:{x:x0,y:yardTop,w:w,h:Math.max(52,yardEnd-yardTop-4)},
    pens:{x:12,y:penY,w:VW-24,h:penH2},
    shop:{x:(VW-Math.min(VW-16,340))/2,y:shopY,w:Math.min(VW-16,340),h:shopH}
  };
}
function penGeom(){
  var L=layoutFarm();
  return {y:L.pens.y,h:L.pens.h,w:(L.pens.w)/3,x0:L.pens.x};
}
function yardGeom(){
  var L=layoutFarm(), y=L.yard;
  return {x0:y.x,y0:y.y,w:y.w,h:y.h,yb:y.y+y.h,yardY:y.y,yardH:y.h};
}
function geo(){ var b=layoutFarm().board; return {x0:b.x,y0:b.y,w:b.w,h:b.h,pw:b.w/COLS,ph:b.h/ROWS}; }`, '两栏布局');

// 3) 畜栏位置跟着新布局
sub('function penRect(i){ var pg=penGeom(); return {x:12+i*pg.w,y:pg.y,w:pg.w-8,h:pg.h}; }',
    'function penRect(i){ var pg=penGeom(); return {x:pg.x0+i*pg.w+2,y:pg.y,w:pg.w-8,h:pg.h}; }', '畜栏位置');

// 4) 横屏不再隐藏院子，也不再显示"只显示田地"提示
sub(`  drawSky(); drawGrass();
  if(!LANDSCAPE){
    drawYard(); drawHouseExterior(); drawMarketStall(); drawPets();
  }`,
`  drawSky(); drawGrass();
  drawYard(); drawHouseExterior(); drawMarketStall(); drawPets();`, '恢复院子');

sub(`  if(LANDSCAPE){
    ctx.fillStyle='rgba(0,0,0,.35)'; rr(12,penGeom().y-24,VW-24,18,8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='10px system-ui'; ctx.textAlign='center';
    ctx.fillText('横屏只显示田地 · 转回竖屏看院子和房子',VW/2,penGeom().y-11); ctx.textAlign='left';
  }
`, '', '去掉横屏提示');

// 5) 底部种子条跟着 shopGeom
sub(`  var sg=shopGeom();
  woodPanel(sg.x,sg.y,sg.w,sg.h);`, `  var sg=shopGeom();
  woodPanel(sg.x,sg.y,sg.w,sg.h);`, 'noop');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.filter((x) => x !== 'noop').join(' / '));
