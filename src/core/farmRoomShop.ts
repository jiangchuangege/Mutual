/**
 * 小屋（等距/咖啡厅视角）+ 小卖部经营场景。
 *
 * 家具全部用 Kenney《Furniture Kit》的真实渲染图（CC0），按景深缩放摆放；
 * 小卖部里用同一批素材当货架，顾客就是农场里那些动物（Cube Pets）。
 */
export const FARM_ROOM_SHOP_JS = String.raw`
/* ================= 家具精灵 ================= */
var furnImgs={};
function furnImg(k){
  if(furnImgs[k]!==undefined) return furnImgs[k];
  var src=(typeof FURNITURE_SPRITES!=='undefined')?FURNITURE_SPRITES[k]:null;
  if(!src){ furnImgs[k]=null; return null; }
  var im=new Image(); im.src=src; furnImgs[k]=im;
  return im;
}
/** 按"景深"缩放画一件家具：y 越靠前越大 */
function drawFurniture(k,tint,x,y,h){
  var im=furnImg(k);
  if(!im||!im.complete||!im.naturalWidth){
    ctx.fillStyle='rgba(180,150,120,.35)';
    ctx.beginPath(); ctx.ellipse(x,y,h*0.3,h*0.1,0,0,6.2832); ctx.fill();
    return;
  }
  var ar=im.naturalWidth/im.naturalHeight, W=h*ar;
  ctx.save();
  ctx.drawImage(im, x-W/2, y-h, W, h);
  ctx.restore();
  return {w:W,h:h};
}
function furnAspect(k){
  var im=furnImg(k);
  if(im&&im.naturalWidth) return im.naturalWidth/im.naturalHeight;
  return 1;
}

/* ================= 小屋：咖啡厅视角 ================= */
function roomGeom2(){
  var top=82, bottom=VH-56;
  var wallH=(bottom-top)*0.44;
  return {x:6,y:top,w:VW-12,h:bottom-top,wallH:wallH,floorY:top+wallH,floorH:(bottom-top)-wallH};
}
/** 地面上的点 (depth 0..1 表示由远到近) */
function floorPoint(g,u,depth){
  // 梯形地面：远端窄，近端宽
  var farHalf=(g.w*0.30), nearHalf=(g.w*0.52);
  var half=farHalf+(nearHalf-farHalf)*depth;
  var cx=g.x+g.w*0.5;
  var x=cx+(u-0.5)*2*half;
  var y=g.floorY+depth*g.floorH;
  return {x:x,y:y,depth:depth};
}
function depthScale(depth){ return 0.55+depth*0.75; }
function tvScreenRect(){
  var g=roomGeom2();
  var wallH=g.wallH;
  // 挂小一点、挂高一点：只占墙面，不压家具区
  var w=Math.min(g.w*0.18, Math.min(120, wallH*1.15));
  var h=w*0.60;
  var y=g.y+wallH*0.18;
  if(y+h>g.floorY-6) y=Math.max(g.y+8, g.floorY-h-6);
  return {x:g.x+g.w*0.70-w/2, y:y, w:w, h:h};
}
function renderRoomScene(){
  if(typeof seedHouseIfNeeded==='function') seedHouseIfNeeded();
  var g=roomGeom2();
  ctx.fillStyle='#e9dcc6'; ctx.fillRect(0,0,VW,VH);
  // 墙
  var wg=ctx.createLinearGradient(0,g.y,0,g.floorY);
  wg.addColorStop(0,'#f8ead6'); wg.addColorStop(1,'#eed9bd');
  ctx.fillStyle=wg; ctx.fillRect(g.x,g.y,g.w,g.wallH);
  ctx.fillStyle='rgba(226,190,150,.35)';
  for(var i=0;i<g.w;i+=24) ctx.fillRect(g.x+i,g.y,9,g.wallH);
  // 地板（透视梯形 + 木地板横纹）
  var p1=floorPoint(g,0,0), p2=floorPoint(g,1,0), p3=floorPoint(g,1,1), p4=floorPoint(g,0,1);
  var fg=ctx.createLinearGradient(0,g.floorY,0,g.floorY+g.floorH);
  fg.addColorStop(0,'#c08a53'); fg.addColorStop(1,'#a4713f');
  ctx.fillStyle=fg;
  ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y);
  ctx.lineTo(p3.x,p3.y); ctx.lineTo(p4.x,p4.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(120,80,40,.3)'; ctx.lineWidth=1.5;
  for(var d=0.18;d<1;d+=0.18){
    var a=floorPoint(g,0,d), b=floorPoint(g,1,d);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  }
  for(var u=0.25;u<1;u+=0.25){
    var t1=floorPoint(g,u,0), t2=floorPoint(g,u,1);
    ctx.strokeStyle='rgba(120,80,40,.18)';
    ctx.beginPath(); ctx.moveTo(t1.x,t1.y); ctx.lineTo(t2.x,t2.y); ctx.stroke();
  }
  // 踢脚线
  ctx.fillStyle='#8a5f38'; ctx.fillRect(g.x,g.floorY-5,g.w,5);
  // 窗户
  var wx=g.x+g.w*0.06, wy=g.y+g.wallH*0.14, ww=g.w*0.26, wh=g.wallH*0.5;
  ctx.fillStyle='#bfe4f0'; rr(wx,wy,ww,wh,6); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(wx+ww*0.66,wy+wh*0.3,ww*0.16,wh*0.12,0,0,6.2832); ctx.fill();
  ctx.strokeStyle='#fdf6e6'; ctx.lineWidth=4; rr(wx,wy,ww,wh,6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(wx+ww/2,wy); ctx.lineTo(wx+ww/2,wy+wh); ctx.stroke();
  // 门
  ctx.fillStyle='#8a5f38'; rr(g.x+g.w*0.80,g.floorY-72,g.w*0.16,72,6); ctx.fill();
  ctx.fillStyle='#ffd75e';
  ctx.beginPath(); ctx.arc(g.x+g.w*0.80+g.w*0.12,g.floorY-36,2.8,0,6.2832); ctx.fill();
  // 电视：柜子 + 屏幕（视频元素另有 DOM 覆盖层常驻显示）
  var tr=tvScreenRect();
  // 电视柜
  ctx.fillStyle='rgba(138,95,56,.9)';
  rr(tr.x-6,tr.y+tr.h+4,tr.w+12,5,2); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.18)';
  rr(tr.x+2,tr.y+tr.h+9,tr.w-4,3,1.5); ctx.fill();
  // 机框
  ctx.fillStyle='rgba(90,70,50,.35)'; rr(tr.x+tr.w*0.2,g.floorY-g.wallH*0.12,tr.w*0.6,6,3); ctx.fill();
  ctx.fillStyle='#241f27'; rr(tr.x-5,tr.y-5,tr.w+10,tr.h+10,9); ctx.fill();
  // 屏幕（视频元素盖在上面；没画面时这里显示提示）
  ctx.fillStyle='#0d1420'; rr(tr.x,tr.y,tr.w,tr.h,6); ctx.fill();
  var noSignal=(typeof TV!=='undefined')&&(TV.failed||!TV.mounted);
  ctx.fillStyle='rgba(160,220,255,'+(noSignal?0.9:0.18)+')';
  rr(tr.x+3,tr.y+3,tr.w-6,tr.h-6,5); ctx.fill();
  if(noSignal){
    ctx.fillStyle='#0d1420'; ctx.font='600 10px system-ui'; ctx.textAlign='center';
    ctx.fillText('📺 点我开电视',tr.x+tr.w/2,tr.y+tr.h/2-2);
    ctx.fillStyle='rgba(20,40,60,.75)'; ctx.font='9px system-ui';
    ctx.fillText(typeof TV!=='undefined'&&TV.errMsg?TV.errMsg:'CCTV 直播',tr.x+tr.w/2,tr.y+tr.h/2+12);
    ctx.textAlign='left';
  }
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='600 9px system-ui'; ctx.textAlign='center';
  ctx.fillText((typeof TV!=='undefined'&&CHANNELS[TV.ch]?CHANNELS[TV.ch].n:'CCTV-1')+' · 点电视全屏',
    tr.x+tr.w/2,tr.y+tr.h+16); ctx.textAlign='left';
  var S=Math.min(1, VH/620);
  var drawList=[];
  for(var h=0;h<houseItems.length;h++){
    var it=houseItems[h], def=DECOR[it.i]; if(!def) continue;
    var depth=Math.max(0,Math.min(1,(it.y-g.floorY)/Math.max(1,g.floorH)));
    var hh=(def.big?128:92)*depthScale(depth)*S;
    drawList.push({k:def.f,t:0,x:it.x,y:it.y,h:hh,d:it.y,idx:h});
  }
  drawList.sort(function(a,b2){ return a.d-b2.d; });
  for(var d2=0;d2<drawList.length;d2++){
    var o=drawList[d2];
    var r=drawFurniture(o.k,o.t,o.x,o.y,o.h);
    if(decorMode&&o.idx!==undefined&&decorSel===o.idx){
      ctx.strokeStyle='rgba(255,120,170,.95)'; ctx.lineWidth=2.5;
      var w2=(r?r.w:o.h);
      rr(o.x-w2/2-3,o.y-o.h-3,w2+6,o.h+6,7); ctx.stroke();
    }
  }
  // 地毯（自带，多边形铺在地上）
  var r1=floorPoint(g,0.14,0.62), r2=floorPoint(g,0.86,0.62), r3=floorPoint(g,0.86,0.92), r4=floorPoint(g,0.14,0.92);
  ctx.fillStyle='rgba(232,180,140,.55)';
  ctx.beginPath(); ctx.moveTo(r1.x,r1.y); ctx.lineTo(r2.x,r2.y); ctx.lineTo(r3.x,r3.y); ctx.lineTo(r4.x,r4.y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(255,230,200,.5)'; ctx.lineWidth=2; ctx.stroke();

  if(decorMode){
    // 底部家具条
    var stripY=VH-58;
    ctx.fillStyle='rgba(250,244,230,.97)'; ctx.fillRect(0,stripY,VW,58);
    ctx.fillStyle='#3f2a12'; ctx.font='700 10px system-ui';
    ctx.fillText('点一件选中 → 再点房间地面摆放（越靠下越大）',10,stripY+14);
    var show=ownedDecor.slice(0,6);
    var cw2=(VW-20)/6;
    for(var o2=0;o2<show.length;o2++){
      var bx=8+o2*cw2, by=stripY+20;
      ctx.fillStyle=decorSel===o2?'rgba(255,230,160,.95)':'rgba(255,255,255,.9)';
      rr(bx,by,cw2-6,32,6); ctx.fill();
      var dd=DECOR[show[o2]];
      if(dd) drawFurniture(dd.f,0,bx+(cw2-6)/2,by+30,26);
    }
    woodBtn(VW-88,stripY+20,78,28,true,'完成布置');
    return;
  }
  var by3=VH-50;
  var bw3=(VW-16-16)/3;
  woodBtn(10,by3,bw3,32,false,'🛋 布置小窝');
  woodBtn(10+bw3+8,by3,bw3,32,false,'🛒 买装饰');
  woodBtn(10+(bw3+8)*2,by3,bw3,32,false,'📺 换源');
}
/** 按素材名找一件装饰的下标 */
function decorIndexByKey(k){
  for(var i=0;i<DECOR.length;i++) if(DECOR[i].f===k) return i;
  return -1;
}
/** 第一次进小屋：把初始家具变成真正可编辑的物件（之后随便拖动/收起） */
function seedHouseIfNeeded(){
  if(houseSeeded) return;
  houseSeeded=true;
  if(houseItems.length) return;
  var g=roomGeom2();
  var starters=[
    ['bedDouble',0.24,0.24],['bookcaseClosed',0.80,0.22],['kitchenBar',0.10,0.52],
    ['benchCushion',0.52,0.52],['lampRoundFloor',0.92,0.62],['bear',0.36,0.40],
    ['coatRackStanding',0.68,0.34],['chairRounded',0.30,0.76],['cardboardBoxClosed',0.74,0.74]
  ];
  for(var s=0;s<starters.length;s++){
    var idx=decorIndexByKey(starters[s][0]);
    if(idx<0) continue;
    var p=floorPoint(g,starters[s][1],starters[s][2]);
    houseItems.push({i:idx,x:Math.round(p.x),y:Math.round(p.y)});
  }
  netSend(true);
}

/** 小屋点击 */
function roomAct(px,py){
  var g=roomGeom2();
  if(decorMode){
    var stripY=VH-58;
    var cw2=(VW-20)/6;
    for(var o=0;o<Math.min(6,ownedDecor.length);o++){
      var bx=8+o*cw2;
      if(px>=bx&&px<=bx+cw2-6&&py>=stripY+20&&py<=stripY+52){ decorSel=(decorSel===o?-1:o); sfx(700,0.18); return; }
    }
    if(px>=VW-88&&px<=VW-10&&py>=stripY+20&&py<=stripY+48){ decorMode=false; decorSel=-1; return; }
    if(py<stripY){ placeDecorAt(px,py); }
    return;
  }
  var by3=VH-50;
  var bw3=(VW-24-16)/3;
  if(py>=by3&&py<=by3+32){
    if(px>=10&&px<=10+bw3){ decorMode=true; decorSel=-1; return; }
    if(px>=10+bw3+8&&px<=10+(bw3+8)*2){ scene='market'; marketTab=2; marketScroll=0; return; }
    if(px>=10+(bw3+8)*2&&px<=10+(bw3+8)*2+bw3){ openTvSourceDialog(); return; }
  }
  var tr=tvScreenRect();
  if(px>=tr.x-8&&px<=tr.x+tr.w+8&&py>=tr.y-8&&py<=tr.y+tr.h+22){
    openTVFull(); return;
  }
  // 点已摆家具 → 拿起来重新摆（任何一件都能编辑位置）
  for(var i=houseItems.length-1;i>=0;i--){
    var it=houseItems[i], def=DECOR[it.i]; if(!def) continue;
    var depth=Math.max(0,Math.min(1,(it.y-g.floorY)/Math.max(1,g.floorH)));
    var hh=(def.big?128:92)*depthScale(depth)*Math.min(1,VH/620);
    var w2=hh*furnAspect(def.f);
    if(px>=it.x-w2/2&&px<=it.x+w2/2&&py>=it.y-hh&&py<=it.y){
      // 拿出来放到待摆清单最前面，直接进布置模式，点地面就是新位置
      ownedDecor.unshift(it.i);
      houseItems.splice(i,1);
      decorMode=true; decorSel=0;
      toast('移动「'+def.n+'」：点地面放到新位置','#6b4a1e');
      sfx(700,0.2); netSend(true); return;
    }
  }
}
/** 在咖啡厅视角里摆放：把点击位置换算成"地面上的点" */
function placeDecorAt(px,py){
  if(decorSel<0){ toast('先在下面选一件家具'); return; }
  var idx=ownedDecor[decorSel]; if(idx===undefined) return;
  var def=DECOR[idx], g=roomGeom2();
  if(py<g.floorY+6) py=g.floorY+16;
  if(py>g.floorY+g.floorH-4) py=g.floorY+g.floorH-4;
  var depth=(py-g.floorY)/Math.max(1,g.floorH);
  var cx=g.x+g.w*0.5;
  var half=(g.w*0.30)+((g.w*0.52)-(g.w*0.30))*depth;
  var u=((px-cx)/half+1)/2;
  if(u<0.04) u=0.04; if(u>0.96) u=0.96;
  var p=floorPoint(g,u,depth);
  for(var i=houseItems.length-1;i>=0;i--) if(houseItems[i].i===idx) houseItems.splice(i,1);
  houseItems.push({i:idx,x:Math.round(p.x),y:Math.round(p.y)});
  ownedDecor.splice(decorSel,1); decorSel=-1;
  push('decor',idx); sfx(880,0.24); checkAch(); netSend(true);
  toast('摆好了：'+def.n,'#6b4a1e'); burst(p.x,p.y,'#ffd75e',10);
}

/* ================= 小卖部 ================= */
var SHOP_COLS=3, SHOP_ROWS=3;
var shopSlots=[]; for(var ss=0;ss<SHOP_COLS*SHOP_ROWS;ss++) shopSlots.push({g:-1,q:0,p:0});
var shopCrowd=[], shopNext=4, shopIncome=0;
function shopSlotRect(i){
  var g=roomGeom2();
  var col=i%SHOP_COLS, row=Math.floor(i/SHOP_COLS);
  var depth=0.18+row*0.34;
  var p=floorPoint(g,0.20+col*0.30,depth);
  return {x:p.x,y:p.y,depth:depth};
}
function shopShelfHeight(i){ return 44+Math.floor(i/SHOP_COLS)*3; }
function renderShopScene(){
  var g=roomGeom2();
  ctx.fillStyle='#dfe6ea'; ctx.fillRect(0,0,VW,VH);
  ctx.fillStyle='#e8dcc6'; ctx.fillRect(g.x,g.y,g.w,g.h);
  var p1=floorPoint(g,0,0), p2=floorPoint(g,1,0), p3=floorPoint(g,1,1), p4=floorPoint(g,0,1);
  ctx.fillStyle='#cfd8dc';
  ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.lineTo(p4.x,p4.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(120,140,150,.35)'; ctx.lineWidth=1.2;
  for(var d=0.15;d<1;d+=0.15){
    var a=floorPoint(g,0,d), b=floorPoint(g,1,d);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  }
  for(var u=0.2;u<1;u+=0.2){
    var t1=floorPoint(g,u,0), t2=floorPoint(g,u,1);
    ctx.beginPath(); ctx.moveTo(t1.x,t1.y); ctx.lineTo(t2.x,t2.y); ctx.stroke();
  }
  // 墙面装饰
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
  ctx.fillStyle='#c2543a'; rr(g.x+g.w*0.2,g.y+6,g.w*0.6,30,8); ctx.fill();
  ctx.fillStyle='#fff8e8'; ctx.font='700 15px system-ui'; ctx.textAlign='center';
  ctx.fillText('我们的·小卖部',g.x+g.w*0.5,g.y+27); ctx.textAlign='left';
  ctx.fillStyle='rgba(40,60,50,.85)'; ctx.font='600 11px system-ui';
  ctx.fillText('今日进账 '+shopIncome+' 金 · 顾客 '+shopCrowd.length+' 位', g.x+14, g.y+g.wallH+16);
  // 货架
  for(var i=0;i<shopSlots.length;i++){
    var r=shopSlotRect(i), hh=shopShelfHeight(i)*depthScale(r.depth);
    drawFurniture('bookcaseClosed',0,r.x,r.y,hh);
    var slot=shopSlots[i];
    var topY=r.y-hh;
    // 标签贴在架子正面
    var tagW=Math.min(42,hh*0.9), tagH=24;
    var tagX=r.x-tagW/2, tagY=r.y+2;
    ctx.fillStyle='rgba(255,255,255,.94)';
    rr(tagX,tagY,tagW,tagH,6); ctx.fill();
    ctx.strokeStyle='rgba(150,110,70,.35)'; ctx.lineWidth=1; rr(tagX,tagY,tagW,tagH,6); ctx.stroke();
    if(slot.g>=0&&slot.q>0){
      drawGoodIcon(GOODS[slot.g], r.x-10, tagY+12, 10);
      ctx.fillStyle='#3f2a12'; ctx.font='700 9px system-ui'; ctx.textAlign='left';
      ctx.fillText('×'+slot.q, r.x-1, tagY+11);
      ctx.fillStyle='#2f6a26'; ctx.font='700 9px system-ui';
      ctx.fillText(slot.p+'金', r.x-1, tagY+21);
      ctx.textAlign='left';
    } else {
      ctx.fillStyle='#b0a08c'; ctx.font='700 9px system-ui'; ctx.textAlign='center';
      ctx.fillText('空位', r.x, tagY+10);
      ctx.fillStyle='#c8b8a0'; ctx.font='8px system-ui';
      ctx.fillText('点上架', r.x, tagY+20);
      ctx.textAlign='left';
    }
  }
  // 收银台
  var cp=floorPoint(g,0.88,0.96);
  drawFurniture('kitchenBar',0,cp.x,cp.y,58*depthScale(1.0));
  ctx.fillStyle='rgba(0,0,0,.32)'; rr(cp.x-40,cp.y-60,80,18,7); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
  ctx.fillText('💰 '+coins,cp.x,cp.y-47); ctx.textAlign='left';
  // 顾客
  for(var c2=0;c2<shopCrowd.length;c2++){
    var cu=shopCrowd[c2];
    var pos=floorPoint(g,cu.u,0.78);
    drawAnimal2(ANIMALS[cu.sp], pos.x, pos.y, 46*depthScale(0.78), Math.abs(Math.sin(tick/8+c2))*2, 3);
    if(cu.want>=0&&cu.phase==='waiting'){
      var wr=shopSlotRect(cu.want);
      var hy=wr.y-shopShelfHeight(cu.want)*depthScale(wr.depth)-24;
      ctx.fillStyle='#ff6f9c';
      ctx.beginPath(); ctx.arc(wr.x,hy,6,0,6.2832); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='700 8px system-ui'; ctx.textAlign='center';
      ctx.fillText('!',wr.x,hy+3); ctx.textAlign='left';
    }
  }
  // 底部按钮
  var by4=VH-50;
  woodBtn(10,by4,116,32,false,'📦 上架（用背包）');
  woodBtn(132,by4,110,32,false,'回农场');
  woodBtn(248,by4,VW-258,32,false,'清空货架');
}
function shopAct(px,py){
  var g=roomGeom2();
  // 货架
  for(var i=0;i<shopSlots.length;i++){
    var r=shopSlotRect(i), hh=shopShelfHeight(i)*depthScale(r.depth);
    if(px>=r.x-26&&px<=r.x+26&&py>=r.y-hh-24&&py<=r.y){
      var slot=shopSlots[i];
      if(slot.g>=0&&slot.q>0){ unstockSlot(i); }
      else { openStockPicker(i); }
      return;
    }
  }
  var by4=VH-50;
  if(py>=by4&&py<=by4+32){
    if(px>=10&&px<=126){ openStockPicker(-1); return; }
    if(px>=132&&px<=242){ scene='farm'; return; }
    if(px>=248){ for(var k=0;k<shopSlots.length;k++) unstockSlot(k); return; }
  }
}
/* 上架：把背包里的商品放到货架 */
var stockTarget=-1;
function openStockPicker(slotIdx){
  var list=ownedGoods();
  if(!list.length){ toast('背包空了，先去 🛒 超市进货','#8a2a2a'); return; }
  stockTarget=slotIdx;
  var it=list[0];
  var idx=it.i;
  if(slotIdx<0){
    for(var i=0;i<shopSlots.length;i++) if(shopSlots[i].g<0){ slotIdx=i; break; }
    if(slotIdx<0){ toast('货架满了，先下架一些'); return; }
  }
  useGood(idx);
  var price=Math.round(GOODS[idx].price*1.9);
  var slot=shopSlots[slotIdx];
  if(slot.g===idx) slot.q++;
  else { slot.g=idx; slot.q=1; slot.p=price; }
  toast('上架 '+GOODS[idx].n+' ×'+slot.q+'（'+slot.p+'金）','#2f6a26');
  sfx(880,0.22); netSend(true);
}
function unstockSlot(i){
  var slot=shopSlots[i];
  if(slot.g<0||slot.q<=0){ toast('这格是空的'); return; }
  addGood(slot.g,slot.q);
  toast('下架 '+GOODS[slot.g].n+' ×'+slot.q,'#8a5a1e');
  slot.g=-1; slot.q=0; slot.p=0;
  sfx(520,0.2); netSend(true);
}
function shopStep(dt){
  if(scene!=='shop'){ return; }
  shopNext-=dt;
  var stock=0;
  for(var i=0;i<shopSlots.length;i++) if(shopSlots[i].g>=0&&shopSlots[i].q>0) stock++;
  if(shopNext<=0){
    shopNext=Math.max(2.5,8-stock*0.6);
    if(stock>0&&shopCrowd.length<4){
      var want=-1, pool=[];
      for(var s=0;s<shopSlots.length;s++) if(shopSlots[s].g>=0&&shopSlots[s].q>0) pool.push(s);
      want=pool[Math.floor(Math.random()*pool.length)];
      shopCrowd.push({sp:Math.floor(Math.random()*ANIMALS.length),u:0.04,phase:'walking',want:want,t:0});
    }
  }
  for(var c=shopCrowd.length-1;c>=0;c--){
    var cu=shopCrowd[c];
    cu.t+=dt;
    if(cu.phase==='walking'){
      cu.u=Math.min(1,cu.u+dt*0.35);
      if(cu.u>=1){ cu.phase='waiting'; cu.t=0; }
    } else if(cu.phase==='waiting'){
      if(cu.t>1.2){
        var slot=shopSlots[cu.want];
        if(slot&&slot.g>=0&&slot.q>0){
          slot.q--;
          coins+=slot.p; shopIncome+=slot.p;
          addGood(slot.g,1);              // 顾客买走的货，玩家能补回来
          pops.push({x:W2(),y:VH*0.5,t:'+'+slot.p,l:1});
          toast('顾客买走 '+GOODS[slot.g].n+' +'+slot.p+'金','#2f6a26');
          sfx(1020,0.24);
          if(slot.q<=0){ slot.g=-1; slot.p=0; }
        }
        cu.phase='leaving'; cu.t=0;
      }
    } else {
      cu.u=Math.max(-0.2,cu.u-dt*0.4);
      if(cu.u<=-0.15) shopCrowd.splice(c,1);
    }
  }
}
function W2(){ return VW/2; }
`;
