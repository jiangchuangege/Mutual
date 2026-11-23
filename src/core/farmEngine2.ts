/** 引擎下篇：超市 / 小屋 / 动物 / 面板 / 电视 / 输入 / 主循环 */
export const FARM_ENGINE2_JS = String.raw`
/* ================= 辅助 ================= */
function indexOfGood(g){ return GOODS.indexOf(g); }
function ownedGoods(){
  var out=[];
  for(var k in bag){ if(bag[k]>0) out.push({i:+k,q:bag[k]}); }
  out.sort(function(a,b){ return b.q-a.q; });
  return out;
}
function addGood(idx,n){
  bag[idx]=(bag[idx]||0)+(n||1);
}
function useGood(idx){
  if(!bag[idx]||bag[idx]<=0) return false;
  bag[idx]--; if(bag[idx]<=0) delete bag[idx];
  return true;
}

/* ================= 超市 ================= */
var marketTabs=['种子','动物','装饰','零食','饮料','生鲜','日用','礼物','宠物'];
var marketTab=0, marketScroll=0, dragY=0, dragging=false, seedPage=0;
function marketItems(){
  var t=marketTabs[marketTab], out=[];
  if(t==='种子'){
    for(var i=0;i<CROPS.length;i++) out.push({kind:'seed',i:i,n:CROPS[i].n,p:CROPS[i].seed*4,sub:CROPS[i].g+'秒 · 卖'+CROPS[i].sell,done:!!unlocked[i]});
  } else if(t==='动物'){
    for(var a=0;a<ANIMALS.length;a++){
      var d=ANIMALS[a];
      out.push({kind:'animal',i:a,n:d.n,p:d.cost,sub:d.out?('产 '+d.out):'宠物'});
    }
    out.push({kind:'pen',i:0,n:'扩建畜栏',p:600*Math.max(1,penCount-2),sub:'现在 '+penCount+' 个（最多 6）',done:penCount>=6});
  } else if(t==='装饰'){
    for(var q=0;q<DECOR.length;q++) out.push({kind:'decor',i:q,n:DECOR[q].n,p:DECOR[q].price,sub:'家具装饰'});
  } else {
    for(var g=0;g<GOODS.length;g++){
      if(GOODS[g].c!==t) continue;
      out.push({kind:'good',i:g,n:GOODS[g].n,p:GOODS[g].price,sub:GOODS[g].c});
    }
  }
  return out;
}
function marketGeom(){
  var cols=LANDSCAPE?5:3;
  return {x:8,y:132,w:VW-16,h:VH-140,cardH:LANDSCAPE?76:92,cols:cols};
}
function marketCardRect(idx,scroll){
  var mg=marketGeom(), cw=(mg.w-16)/mg.cols;
  var row=Math.floor(idx/mg.cols), col=idx%mg.cols;
  return {x:mg.x+8+col*cw,y:mg.y+10+row*mg.cardH-scroll,w:cw-6,h:mg.cardH-6};
}
function renderMarket(){
  drawSky();
  ctx.fillStyle='rgba(250,244,230,.96)'; ctx.fillRect(0,74,VW,VH-74);
  // 货架背景
  ctx.fillStyle='#e8d7bb';
  for(var s=0;s<9;s++) ctx.fillRect(0,160+s*92,VW,6);
  // 分类标签（2 行 × 5）
  var tw=(VW-24-4*4)/5;
  for(var i=0;i<marketTabs.length;i++){
    var bx=12+(i%5)*(tw+4), by=82+Math.floor(i/5)*27;
    woodBtn(bx,by,tw,24,marketTab===i,marketTabs[i]);
  }
  var items=marketItems(), mg=marketGeom();
  ctx.save();
  ctx.beginPath(); ctx.rect(0,mg.y,VW,mg.h); ctx.clip();
  for(var k=0;k<items.length;k++){
    var r=marketCardRect(k,marketScroll);
    if(r.y+r.h<mg.y-20||r.y>mg.y+mg.h+20) continue;
    var it=items[k];
    ctx.fillStyle='rgba(255,252,244,.96)';
    rr(r.x,r.y,r.w,r.h,10); ctx.fill();
    ctx.strokeStyle='rgba(160,120,70,.35)'; ctx.lineWidth=1.5; rr(r.x,r.y,r.w,r.h,10); ctx.stroke();
    if(it.kind==='seed'){
      drawCrop(CROPS[it.i],r.x+r.w*0.3,r.y+r.h*0.62,r.w*0.34,true,1);
    } else if(it.kind==='animal'){
      ctx.save();
      rr(r.x+2,r.y+2,r.w-4,r.h-4,9); ctx.clip();
      drawAnimal2(ANIMALS[it.i], r.x+r.w*0.28, r.y+r.h*0.86, r.h*0.5, 0, 4);
      ctx.restore();
    } else if(it.kind==='decor'){
      drawFurniture(DECOR[it.i].f,DECOR[it.i].t,r.x+r.w*0.3,r.y+r.h*0.62,r.h*0.42);
    } else if(it.kind==='pen'){
      ctx.fillStyle='#c9a06a'; rr(r.x+r.w*0.12,r.y+r.h*0.3,r.w*0.34,r.h*0.32,5); ctx.fill();
      ctx.fillStyle='#f7efd9'; rr(r.x+r.w*0.15,r.y+r.h*0.34,r.w*0.28,r.h*0.24,4); ctx.fill();
    } else {
      drawGoodIcon(GOODS[it.i],r.x+r.w*0.3,r.y+r.h*0.44,r.w*0.3);
    }
    ctx.fillStyle='#3f2a12'; ctx.font='600 11px system-ui';
    ctx.fillText(it.n.length>6?it.n.slice(0,6):it.n, r.x+r.w*0.56, r.y+18);
    ctx.fillStyle='#7a5220'; ctx.font='10px system-ui';
    ctx.fillText(it.sub||'', r.x+r.w*0.56, r.y+31);
    var canBuy=!it.done&&coins>=it.p;
    woodBtn(r.x+r.w*0.54,r.y+r.h-30,r.w*0.42,24,canBuy,
      it.done?(it.kind==='seed'?'已解锁':'上限'):(it.p+'金'));
  }
  ctx.restore();
  // 滚动条
  var total=Math.ceil(items.length/mg.cols)*mg.cardH;
  if(total>mg.h){
    var barH=Math.max(30,mg.h*mg.h/total);
    var barY=mg.y+(mg.h-barH)*(marketScroll/Math.max(1,total-mg.h));
    ctx.fillStyle='rgba(120,90,50,.28)'; rr(VW-7,mg.y,5,mg.h,3); ctx.fill();
    ctx.fillStyle='rgba(120,90,50,.6)'; rr(VW-7,barY,5,barH,3); ctx.fill();
  }

}
function buyMarket(it){
  if(it.done){ toast(it.kind==='pen'?'畜栏已经满了':'这个已经解锁了'); sfx(300,0.2); return; }
  if(coins<it.p){ toast('金币不够','#8a2a2a'); sfx(300,0.2); return; }
  coins-=it.p;
  if(it.kind==='seed'){
    unlocked[it.i]=1; toast('解锁了 '+CROPS[it.i].n,'#2f6a26');
  } else if(it.kind==='animal'){
    var free=-1;
    for(var p=0;p<penCount;p++){
      var used=false;
      for(var z=0;z<zoo.length;z++) if(zoo[z].pen===p) used=true;
      if(!used){ free=p; break; }
    }
    zoo.push({sp:it.i,st:0,gr:0,aff:1,pen:free,prog:0,cd:0});
    toast('买到了 '+ANIMALS[it.i].n+'（宝宝）'+((free>=0)?'，已放进畜栏':'，去🐾里安排'));
  } else if(it.kind==='decor'){
    ownedDecor.push(it.i); toast('买到 '+DECOR[it.i].n+'，去小屋布置','#6b4a1e');
  } else if(it.kind==='pen'){
    penCount=Math.min(6,penCount+1); toast('畜栏扩建到 '+penCount+' 个');
  } else {
    addGood(it.i,1);
    var g=GOODS[it.i];
    if(g.e==='heart'){ hearts+=2; toast('买下'+g.n+'，心意 +2 💗','#a1407a'); }
    else toast('买下 '+g.n);
  }
  push('buy',it.i); sfx(1020,0.24); checkAch(); netSend(true);
}

/* ================= 小屋 ================= */
var roomGeom=function(){ return {x:8,y:82,w:VW-16,h:VH-150,wallH:(VH-150)*0.46}; };
function tvRect(){ var r=roomGeom(); var w=Math.min(r.w*0.32,120);
  return {x:r.x+r.w*0.5-w/2,y:r.y+r.wallH*0.20,w:w,h:w*0.62}; }
function renderHouse(){ renderRoomScene(); }
/* 布置模式：点房间放家具 */
function placeDecor(px,py){
  if(decorSel<0){ toast('先在下面选一件家具'); return; }
  var idx=ownedDecor[decorSel]; if(idx===undefined) return;
  var def=DECOR[idx], r=roomGeom();
  var isWall=(def.c==='wall'||def.c==='curtain');
  var y=isWall? Math.max(r.y+30,Math.min(r.y+r.wallH-20,py)) : Math.max(r.y+r.wallH+14,Math.min(r.y+r.h-14,py));
  var x=Math.max(r.x+30,Math.min(r.x+r.w-30,px));
  // 同一件家具不重复摆放：已经摆过的先移除
  for(var i=houseItems.length-1;i>=0;i--) if(houseItems[i].i===idx) houseItems.splice(i,1);
  houseItems.push({i:idx,x:Math.round(x),y:Math.round(y)});
  ownedDecor.splice(decorSel,1); decorSel=-1;
  push('decor',idx); sfx(880,0.24); checkAch(); netSend(true);
  toast('摆好了：'+def.n,'#6b4a1e'); burst(x,y,'#ffd75e',10);
}

/* ================= 动物 ================= */
var zooSel=0, zooScroll=0;
function zooGeom(){ return {x:8,y:82,w:VW-16,h:VH-200}; }
function zooCols(){ return LANDSCAPE?4:2; }
function zooCardRect(i){
  var zg=zooGeom(), n=zooCols(), cw=(zg.w-10)/n;
  var ch=LANDSCAPE?88:104;
  return {x:zg.x+4+(i%n)*(cw+4),y:zg.y+4+Math.floor(i/n)*(ch+6)-zooScroll,w:cw-4,h:ch};
}
function zooTotalHeight(){
  var zg=zooGeom(), n=zooCols(), ch=LANDSCAPE?88:104;
  return Math.ceil(Math.max(1,zoo.length)/n)*(ch+6)+12;
}
function renderZoo(){
  drawSky();
  ctx.fillStyle='rgba(246,240,228,.97)'; ctx.fillRect(0,74,VW,VH-74);
  ctx.fillStyle='#3f2a12'; ctx.font='700 13px system-ui';
  ctx.fillText('🐾 动物 '+zoo.length+' 只 · 上下拖动', 14, 100);
  var zg=zooGeom();
  var total=zooTotalHeight();
  if(zooScroll>Math.max(0,total-zg.h)) zooScroll=Math.max(0,total-zg.h);
  if(zooScroll<0) zooScroll=0;
  ctx.save(); ctx.beginPath(); ctx.rect(0,zg.y,VW,zg.h); ctx.clip();
  for(var i=0;i<zoo.length;i++){
    var r=zooCardRect(i), a=zoo[i], def=ANIMALS[a.sp];
    ctx.fillStyle=zooSel===i?'rgba(255,236,190,.98)':'rgba(255,252,244,.96)';
    rr(r.x,r.y,r.w,r.h,10); ctx.fill();
    ctx.strokeStyle=zooSel===i?'#c99a63':'rgba(160,120,70,.3)';
    ctx.lineWidth=zooSel===i?2.5:1.5; rr(r.x,r.y,r.w,r.h,10); ctx.stroke();
    var aSize=Math.min(58,r.h*0.6);
    drawAnimal2(def,r.x+34,r.y+r.h-12,aSize,0,a.aff);
    ctx.fillStyle='#3f2a12'; ctx.font='600 12px system-ui';
    ctx.fillText(def.n,r.x+68,r.y+22);
    ctx.fillStyle='#7a5220'; ctx.font='10px system-ui';
    ctx.fillText(a.st?'成年':'宝宝 '+(a.gr|0)+'%',r.x+68,r.y+38);
    // 好感度心
    for(var h2=0;h2<9;h2++){
      ctx.fillStyle=h2<a.aff?'#ff6f9c':'rgba(120,100,90,.18)';
      ctx.beginPath(); ctx.arc(r.x+70+h2*8,r.y+52,3,0,6.2832); ctx.fill();
    }
    ctx.fillStyle=(a.pen===-2)?'#a1407a':'#6b4a1e'; ctx.font='10px system-ui';
    ctx.fillText(a.pen===-2?'宠物（在院子里跑）':(a.pen>=0?('畜栏 '+(a.pen+1)):'未安排'),r.x+68,r.y+70);
  }
  ctx.restore();
  if(total>zg.h){
    var barH=Math.max(28,zg.h*zg.h/total);
    var barY=zg.y+(zg.h-barH)*(zooScroll/Math.max(1,total-zg.h));
    ctx.fillStyle='rgba(120,90,50,.22)'; rr(VW-8,zg.y,5,zg.h,3); ctx.fill();
    ctx.fillStyle='rgba(120,90,50,.55)'; rr(VW-8,barY,5,barH,3); ctx.fill();
  }
  // 底部操作区
  if(!zoo.length){
    ctx.fillStyle='rgba(80,60,40,.7)'; ctx.font='12px system-ui'; ctx.textAlign='center';
    ctx.fillText('还没有动物，去 🛒 超市买一只吧', VW/2, VH-140); ctx.textAlign='left';
  } else {
    var sel2=Math.min(zooSel,zoo.length-1), a2=zoo[sel2], def2=ANIMALS[a2.sp];
    var baseY=VH-108;
    ctx.fillStyle='rgba(250,244,230,.97)'; ctx.fillRect(0,baseY,VW,108);
    ctx.fillStyle='#3f2a12'; ctx.font='700 12px system-ui';
    ctx.fillText(def2.n+' · 好感 '+a2.aff+'/9'+(def2.out?(' · 产 '+def2.out):''),12,baseY+20);
    var bw=(VW-24-4*3)/4, bh=32;
    var acts=[
      ['摸一摸',function(){ petAnimal(sel2); }],
      ['喂食',function(){ feedAnimal(sel2); }],
      [a2.pen===-2?'收回':'当宠物',function(){ togglePet(sel2); }],
      [a2.pen>=0?'离开畜栏':'进畜栏',function(){ togglePen(sel2); }]
    ];
    for(var b2=0;b2<acts.length;b2++){
      woodBtn(12+b2*(bw+4),baseY+30,bw,bh,false,acts[b2][0]);
      hitRects.push({id:'zooAct'+b2,x:12+b2*(bw+4),y:baseY+30,w:bw,h:bh});
    }
    var acts2=[
      ['繁殖',function(){ breed(sel2); }],
      ['卖掉',function(){ sellAnimal(sel2); }],
      ['去超市',function(){ scene='market'; }],
      ['回农场',function(){ scene='farm'; }]
    ];
    for(var b3=0;b3<acts2.length;b3++){
      woodBtn(12+b3*(bw+4),baseY+68,bw,bh,false,acts2[b3][0]);
      hitRects.push({id:'zooAct'+(4+b3),x:12+b3*(bw+4),y:baseY+68,w:bw,h:bh});
    }
  }
}
function petAnimal(i){
  var a=zoo[i]; if(!a) return;
  if(a.cd>0){ toast('它刚被摸过，等一下下'); return; }
  a.cd=2.5; a.aff=Math.min(9,a.aff+1); hearts++; stats.p++;
  toast('💗 '+ANIMALS[a.sp].n+' 很喜欢','#a1407a');
  sfx(1250,0.26); push('pet',a.sp); checkAch(); netSend(true);
}
function feedAnimal(i){
  var a=zoo[i]; if(!a) return;
  // 优先用背包里的宠物用品/零食
  var useIdx=-1;
  var og=ownedGoods();
  for(var k=0;k<og.length;k++){
    var g=GOODS[og[k].i];
    if(g.e==='aff'||g.e==='treat'){ useIdx=og[k].i; break; }
  }
  if(useIdx>=0){ useGood(useIdx); }
  else {
    var cost=8+Math.round(ANIMALS[a.sp].cost*0.04);
    if(coins<cost){ toast('金币不够买口粮（'+cost+'金）','#8a2a2a'); return; }
    coins-=cost;
  }
  a.aff=Math.min(9,a.aff+1); stats.f++;
  if(a.st<1){ a.gr=Math.min(99,a.gr+30); if(a.gr>=99){ a.st=1; a.gr=0; toast(ANIMALS[a.sp].n+' 长大了！','#2f6a26'); burst(VW/2,VH/2,'#ffd75e',14); } }
  else if(a.pen>=0) a.prog=Math.min(99,a.prog+18);
  toast('喂饱了 '+ANIMALS[a.sp].n,'#2f6a26'); sfx(760,0.22); checkAch(); netSend(true);
}
function togglePet(i){
  var a=zoo[i]; if(!a) return;
  a.pen=(a.pen===-2?-1:-2); syncPens();
  toast(a.pen===-2?'它会在院子里陪你们溜达':'收回来了'); netSend(true);
}
function togglePen(i){
  var a=zoo[i]; if(!a) return;
  if(a.pen>=0){ a.pen=-1; toast('离开了畜栏'); }
  else {
    var free=-1;
    for(var p=0;p<penCount;p++){
      var used=false;
      for(var z=0;z<zoo.length;z++) if(zoo[z].pen===p) used=true;
      if(!used){ free=p; break; }
    }
    if(free<0){ toast('畜栏满了，去超市扩建'); return; }
    a.pen=free; toast('放进畜栏 '+(free+1));
  }
  syncPens(); netSend(true);
}
function syncPens(){ /* 占位：畜栏归属直接看 zoo[].pen，无需额外同步 */ }
function breed(i){
  var a=zoo[i]; if(!a) return;
  if(!a.st){ toast('宝宝还不能繁殖'); return; }
  if(a.aff<5){ toast('好感要到 5 才能繁殖（摸摸它）','#8a2a2a'); return; }
  var mate=-1;
  for(var k=0;k<zoo.length;k++) if(k!==i&&zoo[k].sp===a.sp&&zoo[k].st===1&&zoo[k].aff>=5){ mate=k; break; }
  if(mate<0){ toast('需要另一只同种成年动物（好感 5+）','#8a2a2a'); return; }
  var cost=Math.round(ANIMALS[a.sp].cost*0.6);
  if(coins<cost){ toast('繁殖要 '+cost+' 金','#8a2a2a'); return; }
  coins-=cost; a.aff=Math.max(0,a.aff-1); zoo[mate].aff=Math.max(0,zoo[mate].aff-1);
  zoo.push({sp:a.sp,st:0,gr:0,aff:3,pen:-1,prog:0,cd:0});
  hearts+=3;
  toast('🐣 生了一只 '+ANIMALS[a.sp].n+' 宝宝！','#a1407a');
  burst(VW/2,VH*0.5,'#ff9ec4',16); sfx(1180,0.3);
  push('breed',a.sp); checkAch(); netSend(true);
}
function sellAnimal(i){
  var a=zoo[i]; if(!a) return;
  var def=ANIMALS[a.sp];
  var price=Math.round(def.sell*(a.st?1:0.6)*(1+a.aff*0.05));
  coins+=price; stats.s++; dayS++;
  zoo.splice(i,1); zooSel=Math.max(0,zooSel-1);
  toast('卖掉了 '+def.n+' +'+price+'金','#8a5a1e'); sfx(1020,0.24); push('sell',a.sp); netSend(true);
}

/* ================= 面板：背包 / 任务 / 种子库 ================= */
function panelGeom(){ var w=Math.min(VW-24,360), h=Math.min(VH-120,480);
  return {x:(VW-w)/2,y:(VH-h)/2,w:w,h:h}; }
function renderPanel(){
  if(!panel) return;
  ctx.fillStyle='rgba(10,16,26,.55)'; ctx.fillRect(0,0,VW,VH);
  var g=panelGeom();
  woodPanel(g.x,g.y,g.w,g.h);
  ctx.fillStyle='#3a2a12'; ctx.font='700 15px system-ui';
  var title=panel==='bag'?'📦 背包':panel==='quest'?'📜 任务与成就':'🌱 种子库';
  ctx.fillText(title,g.x+18,g.y+30);
  woodBtn(g.x+g.w-44,g.y+10,34,30,false,'✕');
  hitRects.push({id:'closePanel',x:g.x+g.w-44,y:g.y+10,w:34,h:30});
  if(panel==='bag') renderBagPanel(g);
  else if(panel==='quest') renderQuestPanel(g);
  else renderSeedPanel(g);
}
function renderBagPanel(g){
  var list=ownedGoods();
  if(!list.length){
    ctx.fillStyle='#6b4a1e'; ctx.font='12px system-ui';
    ctx.fillText('背包是空的，去超市逛逛吧',g.x+18,g.y+70);
  }
  var maxShow=Math.min(list.length,7);
  for(var i=0;i<maxShow;i++){
    var it=list[i], def=GOODS[it.i], ny=g.y+58+i*46;
    ctx.fillStyle='rgba(255,250,236,.6)'; rr(g.x+14,ny,g.w-28,40,9); ctx.fill();
    drawGoodIcon(def,g.x+34,ny+20,26);
    ctx.fillStyle='#3f2a12'; ctx.font='600 12px system-ui';
    ctx.fillText(def.n+' ×'+it.q,g.x+54,ny+18);
    ctx.fillStyle='#7a5220'; ctx.font='10px system-ui';
    ctx.fillText(def.c+' · '+(def.e==='heart'?'送TA加心动':def.e==='aff'?'可喂宠物':'普通'),g.x+54,ny+32);
    if(def.e==='heart'){ woodBtn(g.x+g.w-84,ny+6,66,28,true,'送给TA');
      hitRects.push({id:'gift'+it.i,x:g.x+g.w-84,y:ny+6,w:66,h:28}); }
    else if(def.e==='aff'||def.e==='treat'){ woodBtn(g.x+g.w-84,ny+6,66,28,true,'喂宠物');
      hitRects.push({id:'feed'+it.i,x:g.x+g.w-84,y:ny+6,w:66,h:28}); }
  }
  ctx.fillStyle='#5a3a14'; ctx.font='10px system-ui';
  ctx.fillText('宠物用品在 🐾 里选中动物后点"喂食"也会自动用掉',g.x+16,g.y+g.h-14);
}
function giftGood(idx){
  if(!useGood(idx)) return;
  hearts+=3; var n=GOODS[idx].n;
  toast('🎁 把'+n+'送给了 TA，心动 +3 💗','#a1407a');
  push('gift',idx); sfx(1180,0.3); netSend(true);
}
function renderQuestPanel(g){
  var quests=[
    {n:'收获 5 次作物',need:5,v:dayH,r:60},
    {n:'浇水 5 次',need:5,v:dayW,r:45},
    {n:'卖出 1 次',need:1,v:dayS,r:70},
    {n:'摸摸动物 3 次',need:3,v:stats.p,r:50}
  ];
  ctx.fillStyle='#5a3a14'; ctx.font='600 12px system-ui';
  ctx.fillText('每日任务（0 点刷新）',g.x+18,g.y+54);
  for(var i=0;i<quests.length;i++){
    var q=quests[i], qy=g.y+62+i*44;
    ctx.fillStyle='rgba(255,250,236,.6)'; rr(g.x+14,qy,g.w-28,38,8); ctx.fill();
    ctx.fillStyle='#3f2a12'; ctx.font='600 11px system-ui';
    ctx.fillText(q.n,g.x+24,qy+15);
    var bw=g.w-150;
    ctx.fillStyle='rgba(0,0,0,.16)'; rr(g.x+24,qy+21,bw,7,3.5); ctx.fill();
    ctx.fillStyle=Math.min(q.need,q.v)>=q.need?'#5fb44a':'#e0a93c';
    rr(g.x+24,qy+21,bw*Math.min(1,q.v/q.need),7,3.5); ctx.fill();
    ctx.fillStyle='#7a5220'; ctx.font='10px system-ui';
    ctx.fillText(Math.min(q.v,q.need)+'/'+q.need+' · 奖 '+q.r,g.x+24,qy+34);
  }
  var ay=g.y+62+quests.length*44+6;
  ctx.fillStyle='#5a3a14'; ctx.font='600 12px system-ui';
  ctx.fillText('成就',g.x+18,ay);
  var names=['初次收获','勤快的农夫','果园大亨','浇水达人','撸猫高手','小有积蓄','农场主','装修达人'];
  for(var k=0;k<names.length;k++){
    var got=!!(ach&(1<<k)), y2=ay+8+k*20;
    if(y2>g.y+g.h-30) break;
    ctx.fillStyle=got?'rgba(120,200,120,.45)':'rgba(255,250,236,.5)';
    rr(g.x+14,y2,g.w-28,18,6); ctx.fill();
    ctx.fillStyle=got?'#22521f':'#6b4a1e'; ctx.font='10px system-ui';
    ctx.fillText((got?'✓ ':'· ')+names[k],g.x+24,y2+13);
  }
  ctx.fillStyle='#5a3a14'; ctx.font='10px system-ui';
  ctx.fillText('累计收获 '+stats.h+' · 浇水 '+stats.w+' · 撸宠 '+stats.p+' · 卖货 '+stats.s,
    g.x+18,g.y+g.h-12);
  // 领奖
  for(var q2=0;q2<quests.length;q2++){
    var q3=quests[q2];
    if(q3.v>=q3.need){
      woodBtn(g.x+g.w-92,g.y+66+q2*44,74,26,true,'+'+q3.r);
      hitRects.push({id:'quest'+(10+q2),x:g.x+g.w-92,y:g.y+66+q2*44,w:74,h:26});
    }
  }
}
function claimQuest(i){
  var quests=[
    {need:5,v:function(){return dayH},r:60,tag:'收获'},
    {need:5,v:function(){return dayW},r:45,tag:'浇水'},
    {need:1,v:function(){return dayS},r:70,tag:'卖货'},
    {need:3,v:function(){return stats.p},r:50,tag:'撸宠'}
  ];
  var q=quests[i]; if(!q) return;
  var bit=1<<(20+i);
  if(ach&bit){ toast('今天已经领过了'); return; }
  if(q.v()<q.need){ toast('还没完成'); return; }
  ach|=bit; coins+=q.r; toast('+'+q.r+' 任务奖励','#2f6a26'); sfx(1100,0.28); netSend(true);
}
function renderSeedPanel(g){
  var cols=4, cw=(g.w-28)/cols;
  var perPage=24, pages=Math.max(1,Math.ceil(CROPS.length/perPage));
  if(seedPage>=pages) seedPage=0;
  var start=seedPage*perPage;
  for(var i=start;i<Math.min(CROPS.length,start+perPage);i++){
    var j=i-start;
    var r={x:g.x+14+(j%cols)*cw,y:g.y+56+Math.floor(j/cols)*(cw*1.15),w:cw-4,h:cw*1.05};
    if(r.y+r.h>g.y+g.h-24) break;
    var ok=!!unlocked[i];
    ctx.fillStyle=sel===i?'rgba(255,230,160,.95)':'rgba(255,252,244,.85)';
    rr(r.x,r.y,r.w,r.h,8); ctx.fill();
    ctx.strokeStyle=sel===i?'#c99a63':'rgba(160,120,70,.25)';
    ctx.lineWidth=sel===i?2:1; rr(r.x,r.y,r.w,r.h,8); ctx.stroke();
    if(ok) drawCrop(CROPS[i],r.x+r.w/2,r.y+r.h*0.62,r.w*0.4,true,1);
    else { ctx.fillStyle='rgba(90,70,50,.35)'; ctx.font='16px system-ui'; ctx.textAlign='center';
      ctx.fillText('🔒',r.x+r.w/2,r.y+r.h*0.45); ctx.textAlign='left'; }
    ctx.fillStyle='#3f2a12'; ctx.font='9px system-ui'; ctx.textAlign='center';
    ctx.fillText(CROPS[i].n,r.x+r.w/2,r.y+r.h-6); ctx.textAlign='left';
    hitRects.push({id:'seed'+i,x:r.x,y:r.y,w:r.w,h:r.h});
  }
  woodBtn(g.x+14,g.y+g.h-34,64,24,false,'上一页');
  hitRects.push({id:'seedPrev',x:g.x+14,y:g.y+g.h-34,w:64,h:24});
  woodBtn(g.x+g.w-78,g.y+g.h-34,64,24,false,'下一页');
  hitRects.push({id:'seedNext',x:g.x+g.w-78,y:g.y+g.h-34,w:64,h:24});
  ctx.fillStyle='#5a3a14'; ctx.font='10px system-ui'; ctx.textAlign='center';
  ctx.fillText('第 '+(seedPage+1)+'/'+pages+' 页 · 已解锁 '+Object.keys(unlocked).length+'/'+CROPS.length,
    g.x+g.w/2,g.y+g.h-17);
  ctx.textAlign='left';
}

/* ================= 电视：常驻在小屋里的小屏 + 点击全屏 ================= */
var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null,failed:true,errMsg:'',custom:''};
var hlsLoading=false, hlsCbs=[];
var HLS_CDNS=['https://cdn.bootcdn.net/ajax/libs/hls.js/1.5.13/hls.min.js',
  'https://lib.baomitu.com/hls.js/1.5.13/hls.min.js',
  'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'];
function loadHls(cb){
  if(window.Hls){ cb(); return; }
  hlsCbs.push(cb);
  if(hlsLoading) return;
  hlsLoading=true;
  function done(){
    hlsLoading=false;
    var cbs=hlsCbs.slice(); hlsCbs=[];
    for(var i=0;i<cbs.length;i++){ try{ cbs[i](); }catch(e){} }
  }
  var ci=0;
  function tryNext(){
    if(ci>=HLS_CDNS.length){ done(); return; }
    var el=document.createElement('script');
    el.src=HLS_CDNS[ci++];
    el.onload=function(){ done(); };
    el.onerror=function(){ tryNext(); };
    document.head.appendChild(el);
  }
  tryNext();
}
/** 把 video 元素贴到电视屏幕的位置上（小屋刚进/窗口变化时调用） */
function syncTvRect(){
  if(!TV.video||!TV.mounted) return;
  if(TV.full) return;
  var r=(typeof tvScreenRect==='function')?tvScreenRect():null;
  if(!r) return;
  TV.video.style.left=((r.x+OFFX)*UIZOOM+4)+'px';
  TV.video.style.top=((r.y+SAFE/UIZOOM)*UIZOOM+4)+'px';
  TV.video.style.width=((r.w-8)*UIZOOM)+'px';
  TV.video.style.height=((r.h-8)*UIZOOM)+'px';
  TV.video.style.borderRadius='5px';
  TV.video.style.display=TV.failed?'none':'block';
}
function mountRoomTv(){
  if(TV.mounted) { syncTvRect(); return; }
  var v=document.createElement('video');
  v.id='roomtv';
  v.muted=true; v.autoplay=true; v.playsInline=true; v.controls=false;
  v.style.cssText='position:fixed;z-index:20;object-fit:cover;background:#0d1420;pointer-events:none';
  document.body.appendChild(v);
  v.addEventListener('playing',function(){ TV.failed=false; TV.errMsg=''; setMusicMuted(true); try{ v.style.display='block'; }catch(e){} });
  v.addEventListener('error',function(){ TV.failed=true; TV.errMsg='连不上，换个台'; try{ v.style.display='none'; }catch(e){} });
  TV.video=v; TV.mounted=true;
  syncTvRect();
  loadHls(function(){
    loadChannelList(function(){ playChannel(TV.ch); });
  });
}
function unmountTv(){
  setMusicMuted(false);
  if(!TV.video) return;
  try{ TV.video.pause(); }catch(e){}
  if(TV.video.parentNode) TV.video.parentNode.removeChild(TV.video);
  TV.hls&&TV.hls.destroy&&TV.hls.destroy();
  TV.hls=null; TV.video=null; TV.mounted=false; TV.full=false;
}
var TV_LIST={}, TV_LIST_LOADED=false, TV_TRY=0;
var TV_PLAYLISTS=['https://cdn.jsdelivr.net/gh/iptv-org/iptv@master/streams/cn.m3u',
  'https://iptv-org.github.io/iptv/countries/cn.m3u'];
function loadChannelList(cb){
  if(TV_LIST_LOADED){ cb(); return; }
  var i=0;
  function next(){
    if(i>=TV_PLAYLISTS.length){ TV_LIST_LOADED=true; cb(); return; }
    var url=TV_PLAYLISTS[i++];
    try{
      fetch(url,{cache:'no-store'}).then(function(r){ return r.text(); }).then(function(txt){
        var name='', got=0;
        txt.split('\n').forEach(function(line){
          line=line.trim();
          if(line.indexOf('#EXTINF')===0){
            var m=line.match(/,(.+)$/);
            name=m?m[1].trim():'';
          } else if(line&&line.indexOf('#')!==0&&name){
            var mm=name.match(/CCTV[-\s]?(\d+)/i);
            if(mm){
              var key='cctv'+mm[1];
              if(!TV_LIST[key]){ TV_LIST[key]=[]; }
              if(TV_LIST[key].length<3&&TV_LIST[key].indexOf(line)<0){ TV_LIST[key].push(line); got++; }
            }
            name='';
          }
        });
        if(got>0){ TV_LIST_LOADED=true; cb(); } else next();
      }).catch(function(){ next(); });
    }catch(e){ next(); }
  }
  next();
}
function tvCandidates(k){
  var ch=CHANNELS[k]||CHANNELS[0];
  var out=[];
  if(TV.custom){ out.push(TV.custom); }
  var l=TV_LIST[ch.key]; if(l) l.forEach(function(u){ if(out.indexOf(u)<0) out.push(u); });
  if(ch.u&&out.indexOf(ch.u)<0) out.push(ch.u);
  (ch.alt||[]).forEach(function(u){ if(out.indexOf(u)<0) out.push(u); });
  return out;
}
function playChannel(k,tryIdx){
  TV.ch=k;
  if(!TV.video) return;
  TV_TRY=tryIdx||0;
  var cands=tvCandidates(k);
  var url=cands[TV_TRY];
  if(!url){ TV.failed=true; TV.errMsg='源都连不上'; return; }
  TV.failed=true; TV.errMsg='连接中…';
  if(TV.hls){ try{ TV.hls.destroy(); }catch(e){} TV.hls=null; }
  if(window.Hls&&Hls.isSupported()){
    var hls=new Hls({enableWorker:true,lowLatencyMode:true});
    TV.hls=hls;
    hls.loadSource(url); hls.attachMedia(TV.video);
      hls.on(Hls.Events.MANIFEST_PARSED,function(){
      TV.failed=false; TV.errMsg='';
      setMusicMuted(true);
      try{ TV.video.style.display='block'; }catch(e){}
      TV.video.play().catch(function(){});
    });
    hls.on(Hls.Events.ERROR,function(_e,data){
      if(data&&data.fatal){
        try{ hls.destroy(); }catch(e){}
        TV.hls=null;
        playChannel(k, (TV_TRY||0)+1);
      }
    });
  } else if(TV.video.canPlayType&&TV.video.canPlayType('application/vnd.apple.mpegurl')){
    TV.video.src=url;
    TV.video.onerror=function(){ playChannel(k, (TV_TRY||0)+1); };
    TV.video.play().then(function(){ TV.failed=false; TV.errMsg=''; }).catch(function(){ TV.failed=true; TV.errMsg='点一下开始播放'; });
  } else {
    loadHls(function(){ if(window.Hls) playChannel(k); });
  }
}
/** 点电视：全屏看；不支持全屏就弹一个覆盖层 */
function openTVFull(){
  mountRoomTv();
  var v=TV.video;
  if(!v) return;
  if(v.requestFullscreen){
    TV.full=true;
    v.style.left='0px'; v.style.top='0px';
    v.style.width='100%'; v.style.height='100%';
    v.style.zIndex='999'; v.style.pointerEvents='auto'; v.controls=true;
    var onEnd=function(){
      TV.full=false;
      setMusicMuted(false);
      v.style.zIndex='20'; v.style.pointerEvents='none'; v.controls=false;
      syncTvRect();
      document.removeEventListener('fullscreenchange',onEnd);
    };
    document.addEventListener('fullscreenchange',onEnd);
    v.requestFullscreen().catch(function(){ onEnd(); openTVOverlay(); });
    try{ v.muted=false; v.play().catch(function(){}); }catch(e){}
  } else {
    openTVOverlay();
  }
}
/** 兜底：全屏 API 不可用时用覆盖层 */
function openTVOverlay(){
  if(TV.box) return;
  var d=document.createElement('div');
  d.id='tvbox';
  d.style.cssText='position:fixed;inset:0;background:#000;z-index:990;display:flex;flex-direction:column';
  var v=document.createElement('video');
  v.muted=false; v.autoplay=true; v.playsInline=true; v.controls=true;
  v.style.cssText='flex:1;width:100%;min-height:0;background:#000;object-fit:contain';
  var bar=document.createElement('div');
  bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#111';
  function mk(txt,fn,col){
    var b=document.createElement('button');
    b.textContent=txt;
    b.style.cssText='flex:1 0 auto;min-width:60px;padding:8px;border-radius:8px;border:0;color:#fff;font:600 12px system-ui;background:'+(col||'#2b2b33');
    b.onclick=fn; return b;
  }
  for(var i=0;i<CHANNELS.length;i++){
    (function(k){
      bar.appendChild(mk(CHANNELS[k].n.replace('CCTV-',''),function(){ playIn(v,k); },TV.ch===k?'#c2543a':'#2b2b33'));
    })(i);
  }
  bar.appendChild(mk('关闭',function(){
    if(TV.box&&TV.box.parentNode) TV.box.parentNode.removeChild(TV.box);
    TV.box=null;
    setMusicMuted(false);
  },'#7a2a2a'));
  d.appendChild(v); d.appendChild(bar);
  document.body.appendChild(d);
  TV.box=d;
  playIn(v,TV.ch,0);
  /** 覆盖层里放的也是"当前源"（自定义源优先），并且逐个试候选源 */
  function playIn(el,k,idx){
    var cands=tvCandidates(k);
    var url=cands[idx||0];
    if(!url){ return; }
    function failed(){ playIn(el,k,(idx||0)+1); }
    if(window.Hls&&Hls.isSupported()){
      var hls=new Hls({enableWorker:true});
      hls.loadSource(url); hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED,function(){ el.play().catch(function(){}); });
      hls.on(Hls.Events.ERROR,function(_e,d){ if(d&&d.fatal){ try{ hls.destroy(); }catch(e){} failed(); } });
    } else {
      el.onerror=failed;
      el.src=url; el.play().catch(function(){});
    }
  }
}

/** 换源：手填一个 m3u8（存在存档里，下次还用它） */
function openTvSourceDialog(){
  if(TV.dlg) return;
  var d=document.createElement('div');
  d.id='tvsrc';
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:995;display:flex;'+
    'flex-direction:column;align-items:center;justify-content:center;padding:18px;gap:10px';
  var title=document.createElement('div');
  title.textContent='换直播源（填一个能播的 .m3u8 地址）';
  title.style.cssText='color:#fff;font:600 13px system-ui;text-align:center';
  var inp=document.createElement('input');
  inp.type='text';
  inp.value=TV.custom||'';
  inp.placeholder='https://.../cctv1.m3u8';
  inp.style.cssText='width:100%;max-width:420px;padding:10px;border-radius:8px;border:0;font:13px system-ui';
  var row=document.createElement('div');
  row.style.cssText='display:flex;gap:8px;width:100%;max-width:420px';
  function mk(txt,fn,col){
    var b=document.createElement('button');
    b.textContent=txt;
    b.style.cssText='flex:1;padding:10px;border-radius:8px;border:0;color:#fff;font:600 13px system-ui;background:'+(col||'#2b2b33');
    b.onclick=fn; return b;
  }
  function close(){ if(TV.dlg&&TV.dlg.parentNode) TV.dlg.parentNode.removeChild(TV.dlg); TV.dlg=null; }
  row.appendChild(mk('用这个源',function(){
    var v=(inp.value||'').trim();
    TV.custom=v; close();
    toast(v?'已换成自定义源':'已清空自定义源','#2f6a26');
    netSend(true);
    if(TV.video) playChannel(TV.ch,0);
  },'#2f6a26'));
  row.appendChild(mk('自动挑源',function(){
    TV.custom=''; close(); toast('改回自动挑源'); netSend(true);
    if(TV.video) playChannel(TV.ch,0);
  },'#3a5a8a'));
  row.appendChild(mk('取消',close,'#7a2a2a'));
  d.appendChild(title); d.appendChild(inp); d.appendChild(row);
  document.body.appendChild(d);
  TV.dlg=d;
}

/* ================= 输入 ================= */
var hitRects=[];
function evPos(e){
  var t=e.changedTouches?e.changedTouches[0]:(e.touches?e.touches[0]:e);
  var r=c.getBoundingClientRect();
  return {x:(t.clientX-r.left)/UIZOOM-OFFX, y:(t.clientY-r.top)/UIZOOM-SAFE/UIZOOM};
}
function act(px,py){
  if(TV.open) return;
  // 顶部 chrome 先处理：任何场景都能切场景 / 开面板
  if(!panel){
    var tabs0=sceneTabs();
    for(var i0=0;i0<tabs0.length;i0++){
      var t0=tabs0[i0];
      if(px>=t0.x&&px<=t0.x+t0.w&&py>=t0.y&&py<=t0.y+t0.h){ scene=t0.id; zooScroll=0; marketScroll=0; sfx(700,0.2); return; }
    }
    var r20=hudRow2();
    for(var j0=0;j0<r20.length;j0++){
      var b0=r20[j0];
      if(px>=b0.x&&px<=b0.x+b0.w&&py>=b0.y&&py<=b0.y+b0.h){
        if(b0.id==='view'){
          // 竖屏 ↔ 横屏（强制模式，跟手机方向无关）
          viewMode=LANDSCAPE?'portrait':'landscape';
          layout();
          toast(viewMode==='portrait'?'已切到竖屏布局':'已切到横屏布局','#2b4a2b');
          sfx(700,0.22); netSend(true); return;
        }
        panel=(b0.id==='seeds')?'seeds':b0.id; sfx(700,0.2); return;
      }
    }
  }
  // 面板
  if(panel){
    var hit=false;
    for(var i=0;i<hitRects.length;i++){
      var b=hitRects[i];
      if(px>=b.x&&px<=b.x+b.w&&py>=b.y&&py<=b.y+b.h){
        hit=true;
        if(b.id==='closePanel'){ panel=null; sfx(520,0.2); return; }
        if(b.id==='seedPrev'){ seedPage=Math.max(0,seedPage-1); return; }
        if(b.id==='seedNext'){ seedPage=seedPage+1; return; }
        if(b.id.indexOf('seed')===0){
          var si=+b.id.slice(4);
          if(unlocked[si]){ sel=si; panel=null; toast('换成了 '+CROPS[si].n); sfx(760,0.2); }
          else { toast('这个作物还没解锁，去超市买'); sfx(300,0.2); }
          return;
        }
        if(b.id.indexOf('gift')===0){ giftGood(+b.id.slice(4)); return; }
        if(b.id.indexOf('feed')===0){ useGood(+b.id.slice(4)); toast('喂给宠物的口粮备好了（去🐾喂）'); return; }
        if(b.id.indexOf('quest')===0){ claimQuest(+b.id.slice(5)-10); return; }
      }
    }
    var g=panelGeom();
    if(px<g.x||px>g.x+g.w||py<g.y||py>g.y+g.h) panel=null;
    hitRects=[];
    return;
  }
  // 动物场景的操作按钮
  if(scene==='zoo'){
    for(var z=0;z<hitRects.length;z++){
      var hb=hitRects[z];
      if(px>=hb.x&&px<=hb.x+hb.w&&py>=hb.y&&py<=hb.y+hb.h){
        var id=hb.id;
        if(id.indexOf('zooAct')===0){
          var n=+id.slice(6);
          var a=zoo[Math.min(zooSel,zoo.length-1)];
          if(n===0) petAnimal(Math.min(zooSel,zoo.length-1));
          else if(n===1) feedAnimal(Math.min(zooSel,zoo.length-1));
          else if(n===2) togglePet(Math.min(zooSel,zoo.length-1));
          else if(n===3) togglePen(Math.min(zooSel,zoo.length-1));
          else if(n===4) breed(Math.min(zooSel,zoo.length-1));
          else if(n===5) sellAnimal(Math.min(zooSel,zoo.length-1));
          else if(n===6) scene='market';
          else if(n===7) scene='farm';
        }
        hitRects=[];
        return;
      }
    }
    // 选动物卡
    for(var q=0;q<zoo.length;q++){
      var r=zooCardRect(q);
      if(px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h){ zooSel=q; sfx(700,0.18); hitRects=[]; return; }
    }
    hitRects=[];
    return;
  }
  // 超市
  if(scene==='market'){
    var tw=(VW-24-4*4)/5;
    for(var t=0;t<marketTabs.length;t++){
      var bx=12+(t%5)*(tw+4), by=82+Math.floor(t/5)*27;
      if(px>=bx&&px<=bx+tw&&py>=by&&py<=by+24){
        marketTab=t; marketScroll=0; sfx(700,0.18); return;
      }
    }
    var items=marketItems();
    for(var k=0;k<items.length;k++){
      var cr=marketCardRect(k,marketScroll);
      if(cr.y<marketGeom().y-20||cr.y>marketGeom().y+marketGeom().h) continue;
      if(px>=cr.x+cr.w*0.54&&px<=cr.x+cr.w*0.96&&py>=cr.y+cr.h-30&&py<=cr.y+cr.h-6){
        buyMarket(items[k]); return;
      }
    }
    return;
  }
  // 小屋
  if(scene==='shop'){
    shopAct(px,py);
    return;
  }
  if(scene==='house'){
    roomAct(px,py);
    return;
  }
  if(scene==='house_legacy'){
    var rg=roomGeom();
    if(decorMode){
      var stripY=VH-62;
      var show=ownedDecor.slice(0,6);
      for(var o=0;o<show.length;o++){
        var sbx=10+o*((VW-20)/6);
        if(px>=sbx&&px<=sbx+(VW-20)/6-6&&py>=stripY+22&&py<=stripY+56){
          decorSel=(decorSel===o?-1:o); sfx(700,0.18); return;
        }
      }
      if(px>=VW-92&&px<=VW-10&&py>=stripY+24&&py<=stripY+50){ decorMode=false; decorSel=-1; return; }
      if(py<stripY) placeDecor(px,py);
      return;
    }
    var by2=VH-58;
    if(py>=by2&&py<=by2+32){
      if(px>=12&&px<=122){ decorMode=true; decorSel=-1; loadHls(function(){}); return; }
      if(px>=130&&px<=240){ scene='market'; marketTab=2; marketScroll=0; return; }
    }
    var tr=tvRect();
    if(px>=tr.x-6&&px<=tr.x+tr.w+6&&py>=tr.y-6&&py<=tr.y+tr.h+10){
      toast('打开电视…'); loadHls(function(){ openTV(); }); return;
    }
    // 点已摆放家具 → 拿起（回到未摆状态）
    for(var d=houseItems.length-1;d>=0;d--){
      var it=houseItems[d], def=DECOR[it.i];
      var dw=(def.s===2?rg.w*0.3:def.s===0?rg.w*0.16:rg.w*0.23);
      var isWall=(def.c==='wall'||def.c==='curtain');
      var dh=dw*(isWall?1.0:0.6);
      if(px>=it.x-dw/2&&px<=it.x+dw/2&&py>=it.y-dh/2&&py<=it.y+dh/2){
        ownedDecor.push(it.i); houseItems.splice(d,1);
        toast('收起：'+def.n); netSend(true); return;
      }
    }
    return;
  }
  // 农场：建筑 / 田地
  var hr=houseRect();
  if(px>=hr.x&&px<=hr.x+hr.w&&py>=hr.y&&py<=hr.y+hr.h){ scene='house'; sfx(700,0.2); return; }
  var mr=marketRect();
  if(px>=mr.x&&px<=mr.x+mr.w&&py>=mr.y&&py<=mr.y+mr.h){ scene='market'; sfx(700,0.2); return; }
  // 底部种子条 → 打开种子库
  var sg=shopGeom();
  if(py>=sg.y&&py<=sg.y+sg.h){
    if(px>=sg.x+sg.w-104&&px<=sg.x+sg.w-8){ panel='seeds'; sfx(700,0.2); return; }
    return;
  }
  // 畜栏
  for(var p2=0;p2<penCount;p2++){
    var r=penRect(p2);
    if(px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h){
      for(var z2=0;z2<zoo.length;z2++){
        if(zoo[z2].pen!==p2) continue;
        var a=zoo[z2];
        if(a.st&&a.prog>=99){
          a.prog=0; var val=ANIMALS[a.sp].outVal||20;
          coins+=val; stats.h++; dayH++;
          pops.push({x:r.x+r.w/2,y:r.y+20,t:'+'+val,l:1});
          burst(r.x+r.w/2,r.y+r.h*0.5,'#ffd75e',10);
          toast('收到 '+ANIMALS[a.sp].out+'，+'+val+'金');
          sfx(1020,0.26); checkAch(); netSend(true);
        } else { zooSel=z2; scene='zoo'; }
        return;
      }
      zooSel=0; scene='zoo'; return;
    }
  }
  // 田地
  var pi=plotAt(px,py);
  if(pi>=0){
    var t3=plots[pi];
    if(t3.crop>=0&&!t3.ready&&t3.water<9){
      t3.water=Math.min(9,t3.water+3); t3.grow+=1.2; stats.w++; dayW++;
      pops.push({x:px,y:py,t:'💧 浇水',l:0.9});
      push('w',pi); sfx(820,0.24); netSend(true);
      me.x=(pi%COLS+0.5); me.y=Math.floor(pi/COLS)+0.5;
      return;
    }
    plantAt(pi);
    me.x=(pi%COLS+0.5); me.y=Math.floor(pi/COLS)+0.5;
  }
}
addEventListener('pagehide',function(){ saveLocalNow(); });
addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden') saveLocalNow(); });
c.addEventListener('touchstart',function(e){ downT=performance.now(); dragY=evPos(e).y; dragging=true; },{passive:true});
c.addEventListener('touchmove',function(e){
  if(!dragging) return;
  var y=evPos(e).y, dy=y-dragY;
  if((scene==='market'&&!panel)||(scene==='zoo'&&!panel)){
    if(scene==='market'){
      var items=marketItems(), mg=marketGeom();
      var total=Math.ceil(items.length/mg.cols)*mg.cardH;
      marketScroll=Math.max(0,Math.min(Math.max(0,total-mg.h+10),marketScroll-dy));
    } else {
      var zg2=zooGeom(), tot2=zooTotalHeight();
      zooScroll=Math.max(0,Math.min(Math.max(0,tot2-zg2.h),zooScroll-dy));
    }
    dragY=y;
    if(e.cancelable) e.preventDefault();
  }
},{passive:false});
c.addEventListener('touchend',function(e){
  var dt=performance.now()-downT;
  dragging=false;
  if(dt<450){ lastTouchAct=performance.now(); var p=evPos(e); act(p.x,p.y); }
},{passive:true});
c.addEventListener('click',function(e){
  // 触屏设备上 click 会跟在 touchend 后面，别让一次点击算两次
  if(performance.now()-lastTouchAct<500) return;
  var p=evPos(e); act(p.x,p.y);
});

/* ================= 主循环 ================= */
var last=performance.now(), acc=0, started=false, downT=0, lastTouchAct=-9999;
function step(dt){
  tick++;
  if(tick%120===0 && typeof saveLocalNow==='function') saveLocalNow();  // 两秒存一次本机存档
  checkDay();
  for(var i=0;i<plots.length;i++){
    var t=plots[i];
    if(t.crop>=0&&!t.ready){
      t.grow+=dt*(1+t.water*0.15);
      if(t.grow>=CROPS[t.crop].g){ t.ready=true; t.water=9; sfx(1250,0.14); }
    }
  }
  for(var z=0;z<zoo.length;z++){
    var a=zoo[z];
    if(a.cd>0) a.cd=Math.max(0,a.cd-dt);
    if(a.st&&a.pen>=0&&ANIMALS[a.sp].out&&a.prog<99){
      a.prog=Math.min(99,a.prog+dt/ANIMALS[a.sp].every*100);
    }
    if(!a.st&&a.aff>=9&&a.gr<99){ a.gr=Math.min(99,a.gr+dt*1.5); if(a.gr>=99){ a.st=1; a.gr=0; } }
  }
  for(var pp=parts.length-1;pp>=0;pp--){
    var p4=parts[pp];
    p4.x+=p4.vx*dt; p4.y+=p4.vy*dt; p4.vy+=260*dt; p4.l-=dt;
    if(p4.l<=0) parts.splice(pp,1);
  }
  for(var q2=pops.length-1;q2>=0;q2--){ pops[q2].y-=26*dt; pops[q2].l-=dt*0.9; if(pops[q2].l<=0) pops.splice(q2,1); }
  for(var q3=toasts.length-1;q3>=0;q3--){ toasts[q3].l-=dt; if(toasts[q3].l<=0) toasts.splice(q3,1); }
  if(typeof shopStep==='function') shopStep(dt);
  checkAch();
  netSend(false);
}
function render(){
  hitRects=[];
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#0e141c';
  ctx.fillRect(0,0,c.width|0,c.height|0);
  ctx.setTransform(DPR*UIZOOM,0,0,DPR*UIZOOM,0,0);
  ctx.save(); ctx.translate(OFFX,SAFE/UIZOOM);
  if(!TV.lastScene) TV.lastScene='';
  if(scene!==TV.lastScene){
    if(scene==='house'&&typeof mountRoomTv==='function') mountRoomTv();
    else if(TV.lastScene==='house'&&typeof unmountTv==='function') unmountTv();
    TV.lastScene=scene;
  }
  if(scene==='house'&&typeof syncTvRect==='function') syncTvRect();
  if(scene==='farm') renderFarm();
  else if(scene==='market') renderMarket();
  else if(scene==='house') renderHouse();
  else if(scene==='shop') renderShopScene();
  else renderZoo();
  drawChrome();
  renderPanel();
  ctx.restore();
}
function loop(now){
  var dt=Math.min(0.05,(now-last)/1000); last=now; acc+=dt;
  while(acc>=1/60){ if(started) step(1/60); else tick++; acc-=1/60; }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
document.getElementById('go').addEventListener('click',function(){
  document.getElementById('go').style.display='none';
  started=true; music();
  if(!unlocked[0]) unlocked[0]=1;
  toast('欢迎回来，先解锁几种种子再去种地吧','#2b4a2b');
  netSend(true);
});
`;
