/** 引擎上篇：状态 / 布局 / 农场场景 / 存档 / 联机 */
export const FARM_ENGINE1_JS = String.raw`
/* ================= 画布 ================= */
var c=document.getElementById('c'), ctx=c.getContext('2d');
var DPR=Math.min(window.devicePixelRatio||1,2), VW=0, VH=0;
/* 横屏/刘海屏适配：竖屏虚拟画布 + 顶部安全区，横屏时两侧留黑边居中 */
var OFFX=0, SAFE=26, LANDSCAPE=false, REALW=0, REALH=0;
/* 手动视口：''=跟随手机方向，'portrait'=强制竖屏布局，'landscape'=强制横屏布局 */
var viewMode='';
/* 全局 UI 放大系数：所有布局都用"虚拟像素"，画的时候整体放大，字和图都变大 */
var UIZOOM=1.18;
function layout(){
  REALW=window.innerWidth; REALH=window.innerHeight;
  var availH=(REALH-SAFE)/UIZOOM;
  REALW=Math.round(REALW/UIZOOM);
  var deviceLand=REALW>REALH*1.05;
  if(viewMode==='portrait'){
    // 竖屏布局；如果手机是横着的，就居中留边（还是竖屏的样子）
    var vw=Math.min(REALW, Math.round(availH*0.56));
    VW=vw; VH=availH; OFFX=Math.round((REALW-vw)/2); LANDSCAPE=false;
  } else if(viewMode==='landscape'){
    VW=REALW; VH=availH; OFFX=0; LANDSCAPE=true;
  } else {
    VW=REALW; VH=availH; OFFX=0; LANDSCAPE=deviceLand;
  }
  var realW=window.innerWidth, realH=window.innerHeight;
  c.width=realW*DPR|0; c.height=realH*DPR|0;
  c.style.width=realW+'px'; c.style.height=realH+'px';
  ctx.setTransform(DPR*UIZOOM,0,0,DPR*UIZOOM,0,0);
}
layout(); addEventListener('resize',layout);

/* ================= 存档 / 世界状态 ================= */
var COLS=4, ROWS=3;
var plots=[]; for(var i0=0;i0<COLS*ROWS;i0++) plots.push({crop:-1,grow:0,water:0,ready:false});
var zoo=[];                  // 动物：{sp,st,gr,aff,pen,prog,cd}
var penCount=3;              // 畜栏数量（最多 6）
var unlocked={};             // 已解锁作物下标
var ownedDecor=[];           // 已买未摆的装饰下标
var houseItems=[];           // 已摆放：{i,x,y}
var houseSeeded=false;       // 初始家具是否已经转成可编辑物件
var bag={};                  // 消耗品：商品下标 -> 数量
var coins=520, hearts=0, tick=0, sel=0, dayH=0, dayW=0, dayS=0, dayKey=0;
var stats={h:0,w:0,f:0,p:0,s:0,days:0};
var ach=0;
var scene='farm', panel=null, decorMode=false, decorSel=-1;
var me={x:0,y:0}, partner={x:-1,y:-1}, latency=0, pendingOps=[];
var pops=[], toasts=[], parts=[];
var today=function(){ var d=new Date(); return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(); };
dayKey=today();
/* 先把本机存档读回来（比等服务器/等对方快，也避免"退出重进回默认值"） */
var __localSave=loadLocalSave();
if(__localSave){ try{ dec(__localSave.w); restoredOnce=true; }catch(e){} }

function toast(txt,col){ toasts.push({t:txt,l:2.4,c:col||'#2b4a2b'}); if(toasts.length>4) toasts.shift(); }
function sfx(f,v){ if(window.__sfx) window.__sfx(f,v); }
function burst(x,y,col,n){
  for(var i=0;i<(n||10);i++){
    var a=Math.random()*6.2832, sp=40+Math.random()*95;
    parts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-70,l:0.7+Math.random()*0.5,c:(i%3===0?'#ffe08a':col)});
  }
}
function pad2(n){ n=Math.max(0,Math.min(99,n|0)); return n<10?'0'+n:''+n; }
function b36(n){ return Math.max(0,n|0).toString(36); }
function pad36(n){ var s=b36(n); return s.length<2?('0'+s):s; }
function un36(s){ return parseInt(s,36)||0; }
function priceOfCrop(i){ return CROPS[i]?CROPS[i].sell:10; }
function productPrice(name){
  for(var i=0;i<CROPS.length;i++) if(CROPS[i].n===name) return CROPS[i].sell;
  for(var j=0;j<ANIMALS.length;j++) if(ANIMALS[j].out===name) return ANIMALS[j].outVal||20;
  return 20;
}

/* ================= 存档编解码（v4） ================= */
function enc(){
  var p=plots.map(function(t){
    return (t.crop<0?'zz':pad36(t.crop))+pad2(t.grow)+((t.ready)?'1':'0')+(t.water|0);
  }).join('');
  var z=zoo.map(function(a){
    return pad36(a.sp)+a.st+pad2(a.gr)+(a.aff|0)+(a.pen+2)+pad2(a.prog);
  }).join('');
  var u=Object.keys(unlocked).filter(function(k){return unlocked[k]}).map(function(k){return b36(+k)}).join('.');
  var b=Object.keys(bag).filter(function(k){return bag[k]>0}).map(function(k){return b36(+k)+':'+bag[k]}).join('.');
  var d=ownedDecor.map(function(i){return b36(i)}).join('.');
  var h=houseItems.map(function(o){return b36(o.i)+':'+b36(o.x)+':'+b36(o.y)}).join('.');
  var st=[stats.h,stats.w,stats.f,stats.p,stats.s,stats.days].join(',');
  var dy=[dayKey,dayH,dayW,dayS].join(':');
  return ['v4',p,z,penCount,coins,hearts,u,b,d,h,st,dy,ach,sel,
    (typeof TV!=='undefined'&&TV.custom)?encodeURIComponent(TV.custom):'',viewMode,
    houseSeeded?'1':'0'].join('|');
}
function dec(s){
  if(!s) return;
  var seg=s.split('|');
  if(seg[0]==='v4'){
    var p=seg[1]||'';
    for(var i=0;i<plots.length;i++){
      var t=p.substr(i*6,6); if(t.length<6) break;
      plots[i].crop=(t.substr(0,2)==='zz'?-1:un36(t.substr(0,2)));
      plots[i].grow=+t.substr(2,2)||0; plots[i].ready=t[4]==='1'; plots[i].water=+t[5]||0;
    }
    var zs=seg[2]||'';
    zoo=[];
    for(var q=0;q+7<=zs.length;q+=7){
      var u2=zs.substr(q,7);
      zoo.push({sp:un36(u2.substr(0,2)),st:+u2[2]||0,gr:+u2.substr(3,2)||0,
        aff:+u2[5]||0,pen:(+u2[6]||0)-2,prog:+u2.substr(7,2)||0,cd:0});
    }
    penCount=Math.max(3,Math.min(6,+seg[3]||3));
    coins=+seg[4]||coins; hearts=+seg[5]||0;
    unlocked={}; if(seg[6]) seg[6].split('.').forEach(function(k){ if(k) unlocked[un36(k)]=1; });
    bag={}; if(seg[7]) seg[7].split('.').forEach(function(kv){ var a=kv.split(':'); if(a.length===2) bag[un36(a[0])]=+a[1]||0; });
    ownedDecor=[]; if(seg[8]) seg[8].split('.').forEach(function(k){ if(k) ownedDecor.push(un36(k)); });
    houseItems=[]; if(seg[9]) seg[9].split('.').forEach(function(kv){
      var a=kv.split(':'); if(a.length===3) houseItems.push({i:un36(a[0]),x:un36(a[1]),y:un36(a[2])});
    });
    if(seg[10]){ var a10=seg[10].split(','); stats.h=+a10[0]||0; stats.w=+a10[1]||0; stats.f=+a10[2]||0;
      stats.p=+a10[3]||0; stats.s=+a10[4]||0; stats.days=+a10[5]||0; }
    if(seg[11]){ var a11=seg[11].split(':'); dayKey=+a11[0]||today(); dayH=+a11[1]||0; dayW=+a11[2]||0; dayS=+a11[3]||0; }
    ach=+seg[12]||0; sel=+seg[13]||0;
    if(seg[14]&&typeof TV!=='undefined'){ try{ TV.custom=decodeURIComponent(seg[14]); }catch(e){} }
    if(seg[15]==='portrait'||seg[15]==='landscape'){ viewMode=seg[15]; layout(); }
    houseSeeded=(seg[16]==='1');
    return;
  }
  // v3 旧档：只接金币和 12 块田，别让老存档直接清零
  if(seg.length>=3){
    var str=seg[0];
    if(str.length>=36){
      for(var j=0;j<plots.length;j++){
        var t3=str.substr(j*3,3); if(t3.length<3) break;
        plots[j].crop=(t3[0]==='-'?-1:+t3[0]); plots[j].grow=+t3.substr(1,2)||0; plots[j].ready=t3[2]==='1';
      }
      coins=+seg[2]||coins;
    }
  }
}

/* ================= 联机 ================= */
var hasHost=false;
try{ hasHost=!!(window.TwGame&&TwGame.send&&(!TwGame.host||TwGame.host()==='app')); }catch(e){ hasHost=false; }
var MQ={c:null,lastTs:0,cid:''};
function mqInit(){
  var s=document.createElement('script');
  s.src='https://cdn.bootcdn.net/ajax/libs/mqtt/4.3.7/mqtt.min.js';
  s.onload=function(){
    try{
      MQ.cid='cf'+Math.random().toString(36).slice(2,9);
      MQ.c=mqtt.connect('wss://broker.emqx.io:8084/mqtt',
        {clientId:MQ.cid,reconnectPeriod:4000,connectTimeout:8000,keepalive:30});
      MQ.c.on('connect',function(){ MQ.c.subscribe('couple/game/k7q2x9v3',{qos:1}); });
      MQ.c.on('message',function(_t,pl){
        var d; try{ d=JSON.parse(pl.toString()) }catch(e){ return }
        if(!d||d.d===MQ.cid) return;
        if((d.ts||0)<=(MQ.lastTs||0)) return;
        MQ.lastTs=d.ts;
        if(d.w){
          var fA=(d.from==='A')||(typeof d.from==='undefined');
          if(fA||d.chg){
            dec(d.w); restoredOnce=true;
            if((typeof MYROLE==='undefined')||MYROLE==='A'){ setTimeout(function(){ netSend(true); },60); }
          }
        }
        applyRemoteOps(d.o);
      });
    }catch(e){}
  };
  document.head.appendChild(s);
}
var noMQ=false; try{ noMQ=/nomq/.test(location.hash||''); }catch(e){}
if(!hasHost && !noMQ) mqInit();
function push(t,arg){ pendingOps.push([t,arg]); }
/**
 * 同步策略（关键）：
 *  - A 是唯一写入者：只有 A 会周期性广播世界状态；
 *  - B 只在自己"真的改了东西"（force）时才发整包，平时只发心跳/位置；
 *  - A 收到 B 的整包 → 采纳（B 是改动发起方）→ 立刻把合并后的状态广播回去；
 *  - 这样不会出现"两边互相覆盖，谁最后发谁赢"导致钱数对不上。
 */
var restoredOnce=false;   // 有没有收到过对方的世界（决定"这次改动要不要广播"）
/* 本机存档：WebView 的 localStorage（baseUrl 是 https，所以可用）。退出重进先读它。 */
var LS_KEY='mutual_farm_v1';
function saveLocalNow(){
  try{ localStorage.setItem('mutual_farm_v1', JSON.stringify({ts:Date.now(),w:enc()})); }catch(e){}
}
function loadLocalSave(){
  try{
    var raw=localStorage.getItem('mutual_farm_v1');
    if(!raw) return null;
    var o=JSON.parse(raw);
    return (o&&o.w&&String(o.w).indexOf('v4')===0)?o:null;
  }catch(e){ return null; }
}
function netSend(force){
  var isA = (typeof MYROLE==='undefined') || MYROLE==='A';
  /*
   * 关键：每个包都必须带完整状态 w。
   * 因为 App 侧的存档就是"最后一次 send 的整段 JSON"，w 为空就等于把存档清了 →
   * 退出重进就会回到初始金币（之前 520 复活就是这么来的）。
   * 但"要不要采纳对方的状态"另说：chg 表示这条是本地真的改了东西。
   */
  var w=enc();
  var chg=(force && (isA || restoredOnce)) ? 1 : 0;
  if(!hasHost){
    if(MQ.c&&MQ.c.connected&&(chg||pendingOps.length||tick%60===0)){
      try{ MQ.c.publish('couple/game/k7q2x9v3',
        JSON.stringify({d:MQ.cid,ts:Date.now(),w:w,o:pendingOps,x:me.x,y:me.y,from:MYROLE,chg:chg}),
        {qos:1,retain:true}); }catch(e){}
      pendingOps=[];
    }
    return;
  }
  if(!pendingOps.length && !chg && tick%60!==0) return;
  try{ TwGame.send(JSON.stringify({t:tick,w:w,o:pendingOps,x:me.x,y:me.y,from:MYROLE,chg:chg})); }catch(e){}
  pendingOps=[];
}
function applyRemoteOps(ops){
  if(!ops||!ops.length) return;
  for(var i=0;i<ops.length;i++){
    var op=ops[i]||[], ty=op[0], arg=op[1];
    if(ty==='w') toast('💧 TA 给作物浇了水','#1f5f8a');
    else if(ty==='h') toast('🧺 TA 收获了一份作物','#2f6a26');
    else if(ty==='pet') toast('💗 TA 摸了摸'+((ANIMALS[arg]||{}).n||'小动物'),'#a1407a');
    else if(ty==='gift') toast('🎁 TA 送了你一个'+((GOODS[arg]||{}).n||'礼物'),'#8a5a1e');
    else if(ty==='buy') toast('🛒 TA 在超市买了东西','#2b4a2b');
    else if(ty==='decor') toast('🛋 TA 布置了小窝','#6b4a1e');
    else if(ty==='breed') toast('🐣 TA 让动物生了宝宝','#a1407a');
    else if(ty==='sell') toast('💰 TA 卖了农产品','#8a5a1e');
  }
}
window.onRemoteState=function(json){
  var d; try{ d=JSON.parse(json); }catch(e){ return; }
  if(!d) return;
  var isA = (typeof MYROLE==='undefined') || MYROLE==='A';
  if(d.w){
    var fromA = (d.from === 'A') || (typeof d.from==='undefined');
    // A 的世界一律采纳；B 发来的只有"真的改了东西"才采纳，避免它把 A 的进度冲回旧值
    if(fromA || d.chg){
      dec(d.w);
      restoredOnce=true;
      if(isA){
        // A 是写入者：合并完立刻回广播，让两边收敛到同一份
        setTimeout(function(){ netSend(true); }, 60);
      }
    } else {
      // 只是心跳：状态不采纳，但至少说明对方在线
      if(!restoredOnce && fromA) restoredOnce=true;
    }
  }
  applyRemoteOps(d.o);
  if(typeof d.x==='number'){ partner.x=d.x; partner.y=d.y; }
  if(typeof d.t==='number') latency=Math.max(0,Math.min(999,Math.abs(tick-d.t)/60*1000|0));
};

/* ================= 音乐 / 音效 ================= */
var AC=null, musicGain=null;
/** 电视在放的时候把游戏音乐压掉，别和电视抢声音 */
function setMusicMuted(m){
  try{ if(musicGain) musicGain.gain.value = m ? 0 : 0.12; }catch(e){}
  try{ if(typeof TV!=='undefined') TV.musicMuted=!!m; }catch(e){}
}
function music(){
  if(AC) return; var C=window.AudioContext||window.webkitAudioContext; if(!C) return;
  AC=new C(); var master=AC.createGain(); master.gain.value=0; master.connect(AC.destination); musicGain=master;
  master.gain.linearRampToValueAtTime(0.12,AC.currentTime+3);
  var pent=[392.0,440.0,523.25,587.33,659.25,783.99];
  var step=0;
  function tone(t,f,d,ty,v){
    var o=AC.createOscillator(),g=AC.createGain(); o.type=ty||'triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(0,AC.currentTime+t); g.gain.linearRampToValueAtTime(v||0.3,AC.currentTime+t+0.03);
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+t+d);
    o.connect(g); g.connect(master); o.start(AC.currentTime+t); o.stop(AC.currentTime+t+d+0.05);
  }
  function bar(){
    var t=0;
    for(var k=0;k<8;k++){
      tone(t,pent[(step+k)%pent.length],1.4,'triangle',0.14);
      if(k%4===0) tone(t,pent[(step+k)%pent.length]/2,2.6,'sine',0.09);
      t+=0.5;
    }
    step=(step+2)%pent.length; setTimeout(bar,4000);
  }
  bar();
  window.__sfx=function(f,v){ try{ if(typeof TV!=='undefined'&&TV.musicMuted) return; tone(0,f,0.22,'sine',v||0.3); }catch(e){} };
}

/* ================= 几何 ================= */
function shopGeom(){ var h=(VH<640?64:74), w=Math.min(VW-16,340); return {x:(VW-w)/2,y:VH-h-6,w:w,h:h}; }
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
function geo(){ var b=layoutFarm().board; return {x0:b.x,y0:b.y,w:b.w,h:b.h,pw:b.w/COLS,ph:b.h/ROWS}; }
function plotAt(px,py){
  var g=geo(); if(px<g.x0||py<g.y0||px>g.x0+g.w||py>g.y0+g.h) return -1;
  var cx=Math.floor((px-g.x0)/g.pw), cy=Math.floor((py-g.y0)/g.ph);
  if(cx<0||cx>=COLS||cy<0||cy>=ROWS) return -1;
  return cy*COLS+cx;
}
function penRect(i){ var pg=penGeom(); return {x:pg.x0+i*pg.w+2,y:pg.y,w:pg.w-8,h:pg.h}; }
/* 顶部 chrome：两个按钮行 */
function sceneTabs(){
  var narrow=VW<330;
  var names=narrow
    ? [['farm','农场'],['house','小屋'],['shop','小店'],['market','超市'],['zoo','动物']]
    : [['farm','🌾农场'],['house','🏡小屋'],['shop','🏪小卖部'],['market','🛒超市'],['zoo','🐾动物']];
  var w=(VW-24-4*5)/5, out=[];
  for(var i=0;i<names.length;i++) out.push({id:names[i][0],label:names[i][1],x:12+i*(w+5),y:8,w:w,h:30});
  return out;
}
function hudRow2(){
  return [
    {id:'bag',label:'📦',x:12,y:42,w:34,h:26},
    {id:'quest',label:'📜',x:50,y:42,w:34,h:26},
    {id:'seeds',label:'🌱种子库',x:88,y:42,w:78,h:26},
    {id:'view',label:LANDSCAPE?'📱竖屏':'🖥横屏',x:Math.max(172,VW-96),y:42,w:84,h:26}
  ];
}
/* 农家院里的两栋建筑（可点） */
function houseRect(){ var yg=yardGeom(); var w=Math.min(yg.w*0.4,140);
  return {x:yg.x0+yg.w-w-6,y:yg.yardY+8,w:w,h:Math.max(70,yg.yardH*0.62)}; }
function marketRect(){ var yg=yardGeom(); var w=Math.min(yg.w*0.34,120);
  return {x:yg.x0+6,y:yg.yardY+Math.max(6,yg.yardH*0.3),w:w,h:Math.max(56,yg.yardH*0.42)}; }

/* ================= 外景素材 ================= */
var sceImgs={};
function sceImg(k){
  if(sceImgs[k]!==undefined) return sceImgs[k];
  var src=(typeof SCENERY_SPRITES!=='undefined')?SCENERY_SPRITES[k]:null;
  if(!src){ sceImgs[k]=null; return null; }
  var im=new Image(); im.src=src; sceImgs[k]=im;
  return im;
}
/** 按目标宽度画（宽度对齐用） */
function drawSceW(k,x,baseY,targetW){
  var im=sceImg(k);
  if(im&&im.complete&&im.naturalWidth){
    var H=targetW*(im.naturalHeight/im.naturalWidth);
    ctx.drawImage(im,x-targetW/2,baseY-H,targetW,H);
    return H;
  }
  return 0;
}
/** 画一件外景（x=中心, baseY=底边, h=高度） */
function drawSce(k,x,baseY,h,flip){
  var im=sceImg(k);
  if(im&&im.complete&&im.naturalWidth){
    var W=h*(im.naturalWidth/im.naturalHeight);
    ctx.save();
    if(flip){ ctx.translate(x,0); ctx.scale(-1,1); ctx.translate(-x,0); }
    ctx.drawImage(im,x-W/2,baseY-h,W,h);
    ctx.restore();
    return W;
  }
  return 0;
}

/* ================= 农场场景：绘制 ================= */
function drawSky(){
  var sky=ctx.createLinearGradient(0,0,0,VH);
  sky.addColorStop(0,'#8fd0f0'); sky.addColorStop(0.5,'#bfe8ff'); sky.addColorStop(1,'#e7f6d8');
  ctx.fillStyle=sky; ctx.fillRect(0,0,VW,VH);
  var night=Math.max(0,Math.sin(((tick/4200)%1)*6.2832))*0.5;
  if(night>0.04){
    ctx.fillStyle='rgba(24,30,60,'+night*0.4+')'; ctx.fillRect(0,0,VW,VH);
    for(var i=0;i<20;i++){
      ctx.fillStyle='rgba(255,255,235,'+(night*(0.3+0.4*Math.abs(Math.sin(tick/22+i))))+')';
      ctx.fillRect((i*137)%VW,(i*61)%(VH*0.4),2,2);
    }
  }
  ctx.fillStyle='rgba(255,246,200,.95)';
  ctx.beginPath(); ctx.arc(VW-64,64,30,0,6.2832); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.8)';
  for(var b=0;b<4;b++){
    var bx=((tick*0.25+b*160)%(VW+120))-60, by=60+b*22;
    ctx.beginPath(); ctx.ellipse(bx,by,22,9,0,0,6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bx+18,by+3,15,7,0,0,6.2832); ctx.fill();
  }
}
function drawGrass(){
  var top=Math.floor(VH*0.4);
  var gg=ctx.createLinearGradient(0,top,0,VH);
  gg.addColorStop(0,'#93d97e'); gg.addColorStop(0.45,'#7cc76a'); gg.addColorStop(1,'#5da551');
  ctx.fillStyle=gg; ctx.fillRect(0,top,VW,VH-top);
  ctx.lineCap='round';
  for(var gy=top;gy<VH;gy+=16){
    for(var gx=(Math.floor(gy/16)%2)*17;gx<VW;gx+=34){
      ctx.strokeStyle='rgba(170,232,150,.6)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(gx,gy+7); ctx.lineTo(gx-3,gy+1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx+3,gy+7); ctx.lineTo(gx+4,gy); ctx.stroke();
      ctx.strokeStyle='rgba(66,132,58,.3)';
      ctx.beginPath(); ctx.moveTo(gx+10,gy+11); ctx.lineTo(gx+12,gy+5); ctx.stroke();
    }
  }
  for(var fi=0;fi<12;fi++){
    var fx=(fi*97+31)%VW, fy=top+22+((fi*61)%Math.max(1,(VH-top-40)));
    ctx.fillStyle=['#ffe9a8','#ffc9dd','#e2d8ff'][fi%3];
    for(var p2=0;p2<4;p2++){
      var a2=p2*1.5708+fi;
      ctx.beginPath(); ctx.arc(fx+Math.cos(a2)*2.4,fy+Math.sin(a2)*2.4,1.9,0,6.2832); ctx.fill();
    }
  }
}
function drawSoil(x,y,w,h){
  ctx.save(); rr(x,y,w,h,12); ctx.clip();
  var sg=ctx.createLinearGradient(x,y,x,y+h);
  sg.addColorStop(0,'#9d6f42'); sg.addColorStop(0.45,'#83562f'); sg.addColorStop(1,'#67421f');
  ctx.fillStyle=sg; ctx.fillRect(x,y,w,h);
  ctx.lineCap='round';
  for(var r=1;r<4;r++){
    var yy=y+h*r/4;
    ctx.strokeStyle='rgba(48,28,12,.32)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x+6,yy+2); ctx.quadraticCurveTo(x+w/2,yy+7,x+w-6,yy+2); ctx.stroke();
    ctx.strokeStyle='rgba(214,175,126,.2)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+6,yy-3); ctx.quadraticCurveTo(x+w/2,yy+2,x+w-6,yy-3); ctx.stroke();
  }
  for(var s2=0;s2<7;s2++){
    var px2=x+6+((s2*37+13)%Math.max(4,(w-16))), py2=y+6+((s2*53+21)%Math.max(4,(h-16)));
    ctx.fillStyle='rgba(34,20,10,.18)';
    ctx.beginPath(); ctx.ellipse(px2,py2,3.2,2.1,0,0,6.2832); ctx.fill();
  }
  var vg=ctx.createRadialGradient(x+w/2,y+h/2,Math.min(w,h)*0.22,x+w/2,y+h/2,Math.max(w,h)*0.78);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.3)');
  ctx.fillStyle=vg; ctx.fillRect(x,y,w,h);
  ctx.restore();
}
/** 小屋外观（点门进屋） */
function drawHouseExterior(){
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
/** 超市摊位（点进超市） */
function drawMarketStall(){
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
/** 农家院装饰 */
function drawYard(){
  var yg=yardGeom();
  var x=yg.x0, y=yg.yardY, w=yg.w, h=yg.yardH;
  if(h<40) return;
  // 小路
  ctx.fillStyle='rgba(200,168,118,.38)';
  ctx.beginPath();
  ctx.moveTo(x-6,y+h*0.82); ctx.quadraticCurveTo(x+w*0.5,y+h*0.76,x+w+6,y+h*0.84);
  ctx.lineTo(x+w+6,y+h*0.96); ctx.quadraticCurveTo(x+w*0.5,y+h*0.88,x-6,y+h*0.96);
  ctx.closePath(); ctx.fill();
  var groundY=y+h*0.96;
  var R=Math.min(h*0.85,120);
  // 树（大小错落）
  drawSce('tree_oak', x+w*0.82, groundY, R*0.62);
  drawSce('tree_pineTallA', x+w*0.96, groundY, R*0.5);
  drawSce('tree_small', x+w*0.05, groundY, R*0.34);
  // 灌木 / 石头 / 木头
  drawSce('plant_bushLarge', x+w*0.70, groundY, R*0.16);
  drawSce('plant_bush', x+w*0.30, groundY, R*0.12);
  drawSce('rock_largeA', x+w*0.46, groundY, R*0.14);
  drawSce('rock_smallA', x+w*0.56, groundY, R*0.08);
  drawSce('log', x+w*0.22, groundY, R*0.09);
  // 花
  drawSce('flower_redA', x+w*0.13, groundY, R*0.08);
  drawSce('flower_yellowA', x+w*0.19, groundY, R*0.07);
  drawSce('flower_purpleA', x+w*0.52, groundY, R*0.08);
  // 风车（右下角点缀）
  drawSce('windmill', x+w*0.90, groundY-R*0.06, R*0.34);
  // 木牌
  drawSce('sign', x+w*0.38, groundY, R*0.13);
  // 栅栏一排
  for(var fx=x+4;fx<x+w;fx+=Math.max(24,w*0.085)){
    drawSce('fence_simple', fx, groundY+R*0.09, R*0.1);
  }
  // 蝴蝶
  var bfs=[[0.2,0.24,'#ffe08a'],[0.36,0.14,'#ffb0c8'],[0.58,0.2,'#c9b8ff']];
  for(var bf=0;bf<bfs.length;bf++){
    var bfx=x+w*bfs[bf][0]+Math.sin(tick/50+bf)*10, bfy=y+h*bfs[bf][1]+Math.cos(tick/70+bf)*7;
    var flap=Math.abs(Math.sin(tick/9+bf))*3;
    ctx.fillStyle=bfs[bf][2];
    ctx.beginPath(); ctx.ellipse(bfx-3,bfy,3.2,flap+1.3,-0.5,0,6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bfx+3,bfy,3.2,flap+1.3,0.5,0,6.2832); ctx.fill();
  }
}
/** 宠物在院子里溜达 */
function drawPets(){
  var yg=yardGeom(), n=0;
  for(var i=0;i<zoo.length&&n<3;i++){
    var a=zoo[i];
    if(a.pen!==-2) continue;
    var bx=yg.x0+yg.w*(0.14+n*0.24)+Math.sin(tick/90+n*2)*yg.w*0.1;
    var by=yg.yardY+yg.yardH*0.72+Math.cos(tick/70+n)*4;
    drawAnimal2(ANIMALS[a.sp],bx,by,Math.min(34,yg.yardH*0.3),Math.abs(Math.sin(tick/16+n))*2,a.aff);
    n++;
  }
}
function renderFarm(){
  drawSky(); drawGrass();
  drawYard(); drawHouseExterior(); drawMarketStall(); drawPets();
  // 田板
  var g=geo();
  for(var fx=g.x0;fx<g.x0+g.w;fx+=34){ ctx.fillStyle='#b8874f'; ctx.fillRect(fx,g.y0-18,6,16); }
  ctx.strokeStyle='#c99a63'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(g.x0,g.y0-12); ctx.lineTo(g.x0+g.w,g.y0-12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.x0,g.y0-5); ctx.lineTo(g.x0+g.w,g.y0-5); ctx.stroke();
  ctx.save(); ctx.shadowColor='rgba(60,40,20,.25)'; ctx.shadowBlur=18; ctx.shadowOffsetY=8;
  ctx.fillStyle='#f3e3c3'; rr(g.x0-10,g.y0-10,g.w+20,g.h+20,18); ctx.fill(); ctx.restore();
  for(var i=0;i<plots.length;i++){
    var px=g.x0+(i%COLS)*g.pw+7, py=g.y0+Math.floor(i/COLS)*g.ph+7, w=g.pw-14, h=g.ph-14;
    var t=plots[i];
    drawSoil(px,py,w,h);
    var inner=Math.min(w,h);
    if(t.crop<0){
      ctx.strokeStyle='rgba(255,255,255,.32)'; ctx.lineWidth=2; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.arc(px+w/2,py+h*0.6,inner*0.15,0,6.2832); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='11px system-ui'; ctx.textAlign='center';
      ctx.fillText('+',px+w/2,py+h*0.6+4); ctx.textAlign='left';
    } else if(!t.ready){
      var cr=CROPS[t.crop];
      drawCrop(cr,px+w/2,py+h-12,inner*0.8,false,Math.min(1,t.grow/cr.g));
      var bw=w*0.56, bx=px+(w-bw)/2, by=py+h-8;
      ctx.fillStyle='rgba(0,0,0,.22)'; rr(bx,by,bw,5,2.5); ctx.fill();
      ctx.fillStyle='#3fa8dc'; rr(bx,by,bw*Math.max(0.06,t.water/9),5,2.5); ctx.fill();
    } else {
      var cr2=CROPS[t.crop];
      var pulse=1+Math.sin(tick/18)*0.035;
      ctx.save(); ctx.translate(px+w/2,py+h*0.6); ctx.scale(pulse,pulse); ctx.translate(-(px+w/2),-(py+h*0.6));
      var gg=ctx.createRadialGradient(px+w/2,py+h/2,4,px+w/2,py+h/2,w*0.68);
      gg.addColorStop(0,'rgba(255,250,200,.55)'); gg.addColorStop(1,'rgba(255,250,200,0)');
      ctx.fillStyle=gg; ctx.fillRect(px,py,w,h);
      drawCrop(cr2,px+w/2,py+h-10,inner*0.98,true,1);
      ctx.restore();
      ctx.strokeStyle='rgba(255,225,130,'+(0.45+0.25*Math.sin(tick/16))+')'; ctx.lineWidth=3;
      rr(px+2,py+2,w-4,h-4,10); ctx.stroke();
    }
  }
  // 玩家标记
  if(me.x>0){
    var mx=g.x0+me.x*g.pw+g.pw/2-13, my=g.y0+me.y*g.ph+g.ph/2-13;
    ctx.fillStyle='rgba(255,120,170,.85)'; ctx.beginPath(); ctx.arc(mx,my,5,0,6.2832); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=1.6; ctx.stroke();
  }
  // 畜栏
  var pg=penGeom();
  for(var p3=0;p3<penCount;p3++){
    var r=penRect(p3);
    var aIdx=-1;
    for(var q2=0;q2<zoo.length;q2++) if(zoo[q2].pen===p3){ aIdx=q2; break; }
    ctx.save(); ctx.shadowColor='rgba(60,40,20,.2)'; ctx.shadowBlur=12; ctx.shadowOffsetY=5;
    ctx.fillStyle='#f7efd9'; rr(r.x,r.y,r.w,r.h,14); ctx.fill(); ctx.restore();
    if(aIdx<0){
      ctx.fillStyle='rgba(120,95,70,.5)'; ctx.font='11px system-ui'; ctx.textAlign='center';
      ctx.fillText('空畜栏',r.x+r.w/2,r.y+r.h/2);
      ctx.fillText('在🐾里放进来',r.x+r.w/2,r.y+r.h/2+15); ctx.textAlign='left';
      continue;
    }
    var a=zoo[aIdx], def=ANIMALS[a.sp];
    var bob=Math.sin(tick/24+p3*2)*2.5;
    drawAnimal2(def,r.x+r.w*0.5,r.y+r.h-14+bob,Math.min(52,r.h*(a.st?0.52:0.4)),0,a.aff);
    ctx.fillStyle='#4d3a2a'; ctx.font='600 11px system-ui'; ctx.textAlign='center';
    ctx.fillText(def.n+(a.st?'':'·宝宝'),r.x+r.w/2,r.y+15);
    ctx.textAlign='left';
    if(a.st&&def.out){
      if(a.prog>=99){
        ctx.fillStyle='#2f8f4a'; ctx.textAlign='center';
        ctx.fillText('收 '+def.out,r.x+r.w/2,r.y+29); ctx.textAlign='left';
        ctx.strokeStyle='rgba(255,215,90,'+(0.5+0.3*Math.sin(tick/14))+')'; ctx.lineWidth=3;
        rr(r.x+2,r.y+2,r.w-4,r.h-4,12); ctx.stroke();
      } else {
        ctx.fillStyle='rgba(80,60,40,.65)'; ctx.textAlign='center';
        ctx.fillText('产出中 '+(a.prog|0)+'%',r.x+r.w/2,r.y+29); ctx.textAlign='left';
        ctx.fillStyle='rgba(0,0,0,.16)'; rr(r.x+8,r.y+r.h-8,r.w-16,5,2.5); ctx.fill();
        ctx.fillStyle='#5fb44a'; rr(r.x+8,r.y+r.h-8,(r.w-16)*(a.prog/100),5,2.5); ctx.fill();
      }
    }
  }
  // 底部：当前种子条
  var sg=shopGeom();
  woodPanel(sg.x,sg.y,sg.w,sg.h);
  var cur=CROPS[sel]||CROPS[0];
  ctx.save(); ctx.translate(sg.x+24,sg.y+sg.h*0.62); ctx.scale(0.5,0.5);
  drawCrop(cur,0,6,26,true,1); ctx.restore();
  ctx.fillStyle='#3f2a12'; ctx.font='600 12px system-ui';
  ctx.fillText(cur.n,sg.x+44,sg.y+24);
  ctx.fillStyle='#7a5220'; ctx.font='10px system-ui';
  ctx.fillText('种子 '+cur.seed+'金 · 卖 '+cur.sell+'金 · '+cur.g+'秒',sg.x+44,sg.y+40);
  woodBtn(sg.x+sg.w-104,sg.y+sg.h/2-14,96,28,true,'换种子 / 种子库');
}

/* ================= 通用面板画法 ================= */
function woodPanel(x,y,w,h){
  var g2=ctx.createLinearGradient(0,y,0,y+h);
  g2.addColorStop(0,'#e0b57c'); g2.addColorStop(.5,'#c9945c'); g2.addColorStop(1,'#a97844');
  ctx.save(); ctx.shadowColor='rgba(60,35,10,.4)'; ctx.shadowBlur=14; ctx.shadowOffsetY=5;
  ctx.fillStyle=g2; rr(x,y,w,h,14); ctx.fill(); ctx.restore();
  ctx.strokeStyle='rgba(90,55,20,.55)'; ctx.lineWidth=2; rr(x,y,w,h,14); ctx.stroke();
  ctx.strokeStyle='rgba(255,240,200,.26)'; ctx.lineWidth=1; rr(x+5,y+5,w-10,h-10,10); ctx.stroke();
}
function woodBtn(x,y,w,h,active,txt){
  var g2=ctx.createLinearGradient(0,y,0,y+h);
  if(active){ g2.addColorStop(0,'#ffe6a0'); g2.addColorStop(1,'#e5b457'); }
  else { g2.addColorStop(0,'#f0d3a5'); g2.addColorStop(1,'#c99a63'); }
  ctx.fillStyle=g2; rr(x,y,w,h,9); ctx.fill();
  ctx.strokeStyle='rgba(90,55,20,.45)'; ctx.lineWidth=1.5; rr(x,y,w,h,9); ctx.stroke();
  ctx.fillStyle='#4a3116'; ctx.font='600 '+(w<52?10:12)+'px system-ui'; ctx.textAlign='center';
  ctx.fillText(txt,x+w/2,y+h/2+4); ctx.textAlign='left';
}
function drawChrome(){
  // 顶部渐变条
  ctx.fillStyle='rgba(24,40,30,.30)'; ctx.fillRect(0,0,VW,74);
  var tabs=sceneTabs();
  for(var i=0;i<tabs.length;i++){
    var t=tabs[i];
    woodBtn(t.x,t.y,t.w,t.h,scene===t.id,t.label);
  }
  var r2=hudRow2();
  for(var j=0;j<r2.length;j++){
    var b=r2[j];
    woodBtn(b.x,b.y,b.w,b.h,panel===b.id,b.label);
  }
  ctx.textAlign='right'; ctx.font='700 13px system-ui';
  var coinTxt='💰 '+coins, heartTxt='💗 '+hearts;
  var cw2=ctx.measureText(coinTxt).width+16, hw2=ctx.measureText(heartTxt).width+16;
  ctx.fillStyle='rgba(24,40,30,.34)';
  rr(VW-14-cw2-hw2-8,42,cw2+hw2+8,26,9); ctx.fill();
  ctx.fillStyle='#fff8d8'; ctx.fillText(coinTxt, VW-14, 60);
  ctx.fillStyle='#ffd0e0'; ctx.fillText(heartTxt, VW-14-cw2-10, 60);
  ctx.textAlign='left';
  // 提示
  for(var k=0;k<toasts.length;k++){
    var tt=toasts[k], a=Math.min(1,tt.l);
    ctx.globalAlpha=a; ctx.font='600 12px system-ui';
    var tw=ctx.measureText(tt.t).width+22;
    ctx.fillStyle='rgba(255,252,238,.94)';
    rr((VW-tw)/2,80+k*25,tw,21,10); ctx.fill();
    ctx.strokeStyle='rgba(150,110,60,.45)'; ctx.lineWidth=1;
    rr((VW-tw)/2,80+k*25,tw,21,10); ctx.stroke();
    ctx.fillStyle=tt.c; ctx.textAlign='center';
    ctx.fillText(tt.t,VW/2,95+k*25); ctx.textAlign='left';
    ctx.globalAlpha=1;
  }
  // 飘字 / 粒子
  for(var p4=0;p4<parts.length;p4++){
    var pt=parts[p4];
    ctx.globalAlpha=Math.max(0,Math.min(1,pt.l*1.6));
    ctx.fillStyle=pt.c; ctx.beginPath(); ctx.arc(pt.x,pt.y,2.8,0,6.2832); ctx.fill();
    ctx.globalAlpha=1;
  }
  for(var p5=0;p5<pops.length;p5++){
    ctx.globalAlpha=Math.max(0,Math.min(1,pops[p5].l));
    ctx.fillStyle='#2f8f4a'; ctx.font='700 14px system-ui'; ctx.textAlign='center';
    ctx.fillText(pops[p5].t,pops[p5].x,pops[p5].y); ctx.textAlign='left';
    ctx.globalAlpha=1;
  }
}
/* ================= 经济动作 ================= */
function checkDay(){
  var t=today();
  if(dayKey!==t){ dayKey=t; dayH=0; dayW=0; dayS=0; toast('☀️ 新的一天，任务刷新了','#2b4a2b'); }
}
function checkAch(){
  var list=[
    {n:'初次收获',need:1,v:function(){return stats.h},r:20},
    {n:'勤快的农夫',need:25,v:function(){return stats.h},r:120},
    {n:'果园大亨',need:150,v:function(){return stats.h},r:400},
    {n:'浇水达人',need:60,v:function(){return stats.w},r:150},
    {n:'撸猫高手',need:30,v:function(){return stats.p},r:180},
    {n:'小有积蓄',need:1500,v:function(){return coins},r:200},
    {n:'农场主',need:12,v:function(){return zoo.length},r:260},
    {n:'装修达人',need:20,v:function(){return houseItems.length},r:300}
  ];
  for(var i=0;i<list.length;i++){
    var bit=1<<i; if(ach&bit) continue;
    if(list[i].v()>=list[i].need){
      ach|=bit; coins+=list[i].r;
      toast('🏆 成就：'+list[i].n+' +'+list[i].r,'#8a5a1e'); sfx(1180,0.34);
    }
  }
}
function plantAt(pi){
  var t=plots[pi];
  var cr=CROPS[sel];
  if(t.crop>=0&&!t.ready) return;
  if(t.crop<0){
    if(coins<cr.seed){ toast('金币不够买种子','#8a2a2a'); sfx(300,0.2); return; }
    coins-=cr.seed; t.crop=sel; t.grow=0; t.water=0; t.ready=false;
    sfx(660,0.22); netSend(true); return;
  }
  if(t.ready){
    var gain=Math.round(cr.sell*(t.water>=6?1.15:1));
    coins+=gain; stats.h++; dayH++;
    var g2=geo();
    pops.push({x:g2.x0+(pi%COLS+0.5)*g2.pw,y:g2.y0+Math.floor(pi/COLS)*g2.ph+20,
      t:'+'+gain+(t.water>=6?' 水润':''),l:1.2});
    burst(g2.x0+(pi%COLS+0.5)*g2.pw,g2.y0+Math.floor(pi/COLS)*g2.ph+g2.ph*0.5,'#e8465f',12);
    t.crop=-1; t.grow=0; t.water=0; t.ready=false;
    push('h',pi); sfx(900,0.3); checkAch(); netSend(true); return;
  }
}
`;
