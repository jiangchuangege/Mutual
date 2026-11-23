const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) {
  if (!t.includes(from)) { console.log('MISS:', tag); return; }
  t = t.replace(from, to); ok.push(tag);
}

// 1) 新几何：正方形的田 + 中间一整块"农家院"
sub(
  `  function shopGeom(){ var h=(VH<640?66:78), w=Math.min(VW-16,340);
    return {x:(VW-w)/2,y:VH-h-6,w:w,h:h}; }
  function penGeom(){ var sh=shopGeom(); var h=(VH<640?58:74); var w=(VW-24)/3;
    return {y:sh.y-8-h,h:h,w:w}; }
  function geo(){
    var pg=penGeom(); var top=86; var bottom=pg.y-8;
    var boardH=Math.max(168,bottom-top);
    var w=Math.min(VW-24, boardH*1.65);
    var x0=(VW-w)/2, y0=top;
    return {x0:x0,y0:y0,w:w,h:boardH,pw:w/COLS,ph:boardH/ROWS};
  }`,
  `  function shopGeom(){ var h=(VH<640?64:78), w=Math.min(VW-16,340);
    return {x:(VW-w)/2,y:VH-h-6,w:w,h:h}; }
  function penGeom(){ var sh=shopGeom(); var h=(VH<640?84:106); var w=(VW-24)/3;
    return {y:sh.y-10-h,h:h,w:w}; }
  /** 田只占上面一块（保持接近正方形），下面留给农家院 */
  function yardGeom(){
    var pg=penGeom();
    var top=(VH<640?74:92);
    var w=Math.min(VW-20,382);
    var x0=(VW-w)/2;
    var boardH=w*(VH<640?0.72:0.79);
    var yb=top+boardH;
    var yEnd=pg.y-6;
    return {x0:x0,y0:top,w:w,h:boardH,yb:yb,yardY:yb+4,yardH:Math.max(56,yEnd-yb-6)};
  }
  function geo(){
    var yg=yardGeom();
    return {x0:yg.x0,y0:yg.y0,w:yg.w,h:yg.h,pw:yg.w/COLS,ph:yg.h/ROWS};
  }`,
  '新几何'
);
sub('  function penRect(i){ var pg=penGeom(); return {x:12+i*pg.w,y:pg.y,w:pg.w-8,h:pg.h}; }',
    '  function penRect(i){ var pg=penGeom(); return {x:12+i*pg.w,y:pg.y,w:pg.w-8,h:pg.h}; }', 'penRect 不变');

// 2) 农家院：谷仓 + 栅栏 + 两棵树 + 稻草人 + 水井 + 花圃 + 小路
sub(
  '  function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }',
  `  function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }

  /** 农家院：田下面的一整块场景，让画面不像"只有一堆土块" */
  function drawYard(){
    var yg=yardGeom();
    var x=yg.x0, y=yg.yardY, w=yg.w, h=yg.yardH;
    if(h<40) return;
    // 小路（土色带）
    ctx.fillStyle='rgba(196,160,110,.55)';
    ctx.beginPath();
    ctx.moveTo(x-6,y+h*0.62);
    ctx.quadraticCurveTo(x+w*0.5,y+h*0.5,x+w+6,y+h*0.66);
    ctx.lineTo(x+w+6,y+h*0.86);
    ctx.quadraticCurveTo(x+w*0.5,y+h*0.72,x-6,y+h*0.86);
    ctx.closePath(); ctx.fill();

    // 谷仓（红色，带屋顶、门、阁楼窗）
    var bw=Math.min(w*0.38,132), bh=Math.min(h*0.78,108);
    var bx=x+bw*0.18, by=y+h-bh;
    // 屋顶
    ctx.fillStyle='#b8462f';
    ctx.beginPath(); ctx.moveTo(bx-bw*0.12,by);
    ctx.lineTo(bx+bw/2,by-bh*0.42); ctx.lineTo(bx+bw*1.12,by);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(bx-bw*0.12,by);
    ctx.lineTo(bx+bw/2,by-bh*0.42); ctx.lineTo(bx+bw/2,by); ctx.closePath(); ctx.fill();
    // 仓体
    var bg2=ctx.createLinearGradient(bx,by,bx+bw,by);
    bg2.addColorStop(0,'#e05b3e'); bg2.addColorStop(0.5,'#c94a30'); bg2.addColorStop(1,'#a83a24');
    ctx.fillStyle=bg2;
    ctx.fillRect(bx,by,bw,bh*0.66);
    // 木板纹
    ctx.strokeStyle='rgba(120,40,26,.45)'; ctx.lineWidth=1.5;
    for(var bl=1;bl<6;bl++){ ctx.beginPath(); ctx.moveTo(bx+bw*bl/6,by); ctx.lineTo(bx+bw*bl/6,by+bh*0.66); ctx.stroke(); }
    // 门
    ctx.fillStyle='#f3e7cd';
    ctx.beginPath(); ctx.moveTo(bx+bw*0.34,by+bh*0.66);
    ctx.lineTo(bx+bw*0.34,by+bh*0.3); ctx.quadraticCurveTo(bx+bw*0.5,by+bh*0.18,bx+bw*0.66,by+bh*0.3);
    ctx.lineTo(bx+bw*0.66,by+bh*0.66); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#8a4a2a'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='rgba(150,90,50,.5)';
    ctx.fillRect(bx+bw*0.49,by+bh*0.34,2,bh*0.3);
    // 阁楼窗
    ctx.fillStyle='#f7edd6';
    ctx.beginPath(); ctx.arc(bx+bw*0.5,by+bh*0.12,bw*0.09,0,6.2832); ctx.fill();
    ctx.strokeStyle='#8a4a2a'; ctx.lineWidth=1.5; ctx.stroke();

    // 两棵树
    function tree(tx,ty,s){
      ctx.fillStyle='#8a5f38';
      ctx.fillRect(tx-s*0.07,ty-s*0.5,s*0.14,s*0.5);
      var tl=ctx.createRadialGradient(tx-s*0.2,ty-s*1.05,s*0.1,tx,ty-s*0.9,s*0.62);
      tl.addColorStop(0,'#a8e08a'); tl.addColorStop(0.6,'#63b356'); tl.addColorStop(1,'#3d8a3c');
      ctx.fillStyle=tl;
      ctx.beginPath(); ctx.arc(tx,ty-s*0.9,s*0.5,0,6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(tx-s*0.34,ty-s*0.66,s*0.34,0,6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(tx+s*0.34,ty-s*0.7,s*0.32,0,6.2832); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.arc(tx-s*0.16,ty-s*1.06,s*0.16,0,6.2832); ctx.fill();
    }
    var ts=Math.min(h*0.9,86);
    tree(x+w*0.78, y+h*0.9, ts);
    tree(x+w*0.93, y+h*0.94, ts*0.72);

    // 稻草人
    var sx0=x+w*0.46, sy0=y+h*0.92;
    ctx.strokeStyle='#8a6a44'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(sx0,sy0); ctx.lineTo(sx0,sy0-h*0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx0-10,sy0-h*0.32); ctx.lineTo(sx0+10,sy0-h*0.32); ctx.stroke();
    ctx.fillStyle='#f2d08a'; ctx.beginPath(); ctx.arc(sx0,sy0-h*0.5,7,0,6.2832); ctx.fill();
    ctx.fillStyle='#c96a4a';
    ctx.beginPath(); ctx.moveTo(sx0-9,sy0-h*0.55); ctx.lineTo(sx0+9,sy0-h*0.55);
    ctx.lineTo(sx0,sy0-h*0.64); ctx.closePath(); ctx.fill();

    // 水井
    var wx=x+w*0.62, wy=y+h*0.9;
    ctx.fillStyle='#9aa3ab'; ctx.beginPath(); ctx.ellipse(wx,wy,18,8,0,0,6.2832); ctx.fill();
    ctx.fillStyle='#5b666e'; ctx.beginPath(); ctx.ellipse(wx,wy-2,13,6,0,0,6.2832); ctx.fill();
    ctx.fillStyle='#b8874f'; ctx.fillRect(wx-16,wy-24,4,16); ctx.fillRect(wx+12,wy-24,4,16);
    ctx.fillStyle='#c96a4a';
    ctx.beginPath(); ctx.moveTo(wx-20,wy-24); ctx.lineTo(wx+20,wy-24); ctx.lineTo(wx,wy-38); ctx.closePath(); ctx.fill();

    // 花圃
    var petals=['#e86a8f','#f2c86b','#b3a4e0','#7fc8a9','#e8836b'];
    for(var i2=0;i2<7;i2++){
      var fx2=x+w*0.06+i2*17, fy2=y+h*0.9+((i2%2)*5);
      ctx.fillStyle=petals[i2%5];
      ctx.beginPath(); ctx.arc(fx2,fy2,4.4,0,6.2832); ctx.fill();
      ctx.fillStyle='#4e9e58'; ctx.fillRect(fx2-1,fy2+4,2,5);
    }

    // 底部栅栏
    ctx.strokeStyle='#c9a06a'; ctx.lineWidth=3;
    for(var fxx=x-4;fxx<x+w+4;fxx+=22){
      ctx.fillStyle='#b8874f'; ctx.fillRect(fxx,y+h-12,5,12);
      ctx.strokeStyle='rgba(160,120,70,.85)'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(fxx,y+h-9); ctx.lineTo(fxx+18,y+h-9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fxx,y+h-4); ctx.lineTo(fxx+18,y+h-4); ctx.stroke();
    }
  }`,
  '农家院'
);

// 3) 画农家院（草地之后、田板之前）
sub("    drawGrass();", "    drawGrass();\n    drawYard();", '调用农家院');

// 4) 删掉旧的装饰块（稻草人/水井/花圃）
sub(
  `    // 装饰：稻草人 / 水井 / 花圃
    var dg=geo(); var dY=dg.y0+dg.h+14;
    var sx0=dg.x0+26, sy0=dY+12;
    ctx.strokeStyle='#8a6a44'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(sx0,sy0+26); ctx.lineTo(sx0,sy0-6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx0-14,sy0-2); ctx.lineTo(sx0+14,sy0-2); ctx.stroke();
    ctx.fillStyle='#f2d08a'; ctx.beginPath(); ctx.arc(sx0,sy0-10,9,0,6.28); ctx.fill();
    ctx.fillStyle='#c96a4a'; ctx.fillRect(sx0-11,sy0-19,22,7);
    var wx=VW-96, wy=dY+20;
    ctx.fillStyle='#9aa3ab'; ctx.beginPath(); ctx.ellipse(wx,wy,26,12,0,0,6.28); ctx.fill();
    ctx.fillStyle='#5b666e'; ctx.beginPath(); ctx.ellipse(wx,wy-2,19,8,0,0,6.28); ctx.fill();
    ctx.fillStyle='#b8874f'; ctx.fillRect(wx-24,wy-30,5,22); ctx.fillRect(wx+19,wy-30,5,22);
    ctx.fillStyle='#c96a4a';
    ctx.beginPath(); ctx.moveTo(wx-30,wy-30); ctx.lineTo(wx+30,wy-30); ctx.lineTo(wx,wy-48); ctx.closePath(); ctx.fill();
    var petals=['#e86a8f','#f2c86b','#b3a4e0','#7fc8a9','#e8836b'];
    for(var i2=0;i2<5;i2++){
      var fx2=VW/2-70+i2*34, fy2=dY+18+(i2%2)*6;
      ctx.fillStyle=petals[i2%5];
      ctx.beginPath(); ctx.arc(fx2,fy2,6,0,6.28); ctx.fill();
      ctx.fillStyle='#4e9e58'; ctx.fillRect(fx2-1,fy2+5,2,7);
    }`,
  '',
  '删旧装饰'
);

// 5) 畜栏布局适配更高的卡片
sub(
  `      var bob=Math.sin(tick/24+k*2)*3;
      drawAnimal(br.animal, r.x+r.w*0.34, r.y+r.h-10+bob, Math.min(46, r.h*(k===1?0.50:0.58)));
      ctx.fillStyle='#4d3a2a'; ctx.font='600 11px system-ui';
      ctx.fillText(br.name, r.x+8, r.y+14);
      ctx.fillStyle=pn.ready?'#2f8f4a':'rgba(80,60,40,.6)';
      ctx.font='11px system-ui';
      ctx.fillText(pn.ready?('收 '+br.out):(pn.on?'生长中…':('喂 '+br.food+'金')), r.x+8, r.y+28);
      if(pn.on&&!pn.ready){
        var pbw=r.w-16;
        ctx.fillStyle='rgba(0,0,0,.18)'; roundRect(r.x+8,r.y+r.h-8,pbw,5,2.5); ctx.fill();
        ctx.fillStyle='#5fb44a'; roundRect(r.x+8,r.y+r.h-8,pbw*Math.min(1,pn.prog),5,2.5); ctx.fill();
      }`,
  `      var bob=Math.sin(tick/24+k*2)*3;
      drawAnimal(br.animal, r.x+r.w*0.5, r.y+r.h-24+bob, Math.min(66, r.h*(k===1?0.56:0.62)));
      ctx.fillStyle='#4d3a2a'; ctx.font='600 12px system-ui'; ctx.textAlign='center';
      ctx.fillText(br.name, r.x+r.w/2, r.y+16);
      ctx.textAlign='left';
      ctx.fillStyle=pn.ready?'#2f8f4a':'rgba(80,60,40,.65)';
      ctx.font='11px system-ui';
      ctx.fillText(pn.ready?('收 '+br.out):(pn.on?'生长中…':('喂 '+br.food+'金')), r.x+8, r.y+30);
      if(pn.on&&!pn.ready){
        var pbw=r.w-16;
        ctx.fillStyle='rgba(0,0,0,.18)'; roundRect(r.x+8,r.y+r.h-9,pbw,5,2.5); ctx.fill();
        ctx.fillStyle='#5fb44a'; roundRect(r.x+8,r.y+r.h-9,pbw*Math.min(1,pn.prog),5,2.5); ctx.fill();
      }`,
  '畜栏卡片'
);

// 6) 任务条位置微调（别压在栅栏木桩上）
sub("    ctx.fillStyle='rgba(20,40,20,.32)'; roundRect(14,58,150,18,9); ctx.fill();",
    "    ctx.fillStyle='rgba(20,40,20,.32)'; roundRect(12,54,168,18,9); ctx.fill();", '任务条底板');
sub("    ctx.fillText('今日任务 '+qDone+'/'+QUESTS.length+' · 收获'+day.h+' 浇水'+day.w, 22, 71);",
    "    ctx.fillText('今日任务 '+qDone+'/'+QUESTS.length+' · 收获'+day.h+' 浇水'+day.w, 20, 67);", '任务条文字');
sub("    ctx.fillText('延迟'+latency+'ms', VW-16, 71); ctx.textAlign='left';",
    "    ctx.fillText('延迟'+latency+'ms', VW-16, 67); ctx.textAlign='left';", '延迟文字');

fs.writeFileSync(p, t, 'utf8');
console.log('已改:', ok.join(' / '));
