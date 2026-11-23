const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) {
  if (!t.includes(from)) { console.log('MISS:', tag); return; }
  t = t.replace(from, to); ok.push(tag);
}

// 1) 顶部留出 HUD + 任务条的位置
sub('    var pg=penGeom(); var top=60; var bottom=pg.y-8;', '    var pg=penGeom(); var top=86; var bottom=pg.y-8;', '顶部留白');

// 2) 新美术函数：草地 / 泥土
sub(
  '  function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }',
  `  function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }

  /** 草地：渐变 + 草簇 + 野花，比平铺图集更像手绘农场 */
  function drawGrass(){
    var top=Math.floor(VH*0.42);
    var gg=ctx.createLinearGradient(0,top,0,VH);
    gg.addColorStop(0,'#93d97e'); gg.addColorStop(0.45,'#7cc76a'); gg.addColorStop(1,'#5da551');
    ctx.fillStyle=gg; ctx.fillRect(0,top,VW,VH-top);
    ctx.lineCap='round';
    for(var gy=top;gy<VH;gy+=16){
      var off=(Math.floor(gy/16)%2)*17;
      for(var gx2=off;gx2<VW;gx2+=34){
        ctx.strokeStyle='rgba(170,232,150,.6)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(gx2,gy+7); ctx.lineTo(gx2-3,gy+1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx2+3,gy+7); ctx.lineTo(gx2+4,gy); ctx.stroke();
        ctx.strokeStyle='rgba(66,132,58,.32)';
        ctx.beginPath(); ctx.moveTo(gx2+10,gy+11); ctx.lineTo(gx2+12,gy+5); ctx.stroke();
      }
    }
    for(var fi=0;fi<16;fi++){
      var fx=(fi*97+31)%VW, fy=top+22+((fi*61)%Math.max(1,(VH-top-40)));
      ctx.fillStyle=['#ffe9a8','#ffc9dd','#e2d8ff'][fi%3];
      for(var pt3=0;pt3<4;pt3++){
        var aa2=pt3*1.5708+fi;
        ctx.beginPath(); ctx.arc(fx+Math.cos(aa2)*2.4,fy+Math.sin(aa2)*2.4,1.9,0,6.2832); ctx.fill();
      }
      ctx.fillStyle='#ffe08a'; ctx.beginPath(); ctx.arc(fx,fy,1.3,0,6.2832); ctx.fill();
    }
  }

  /** 菜地：泥土渐变 + 犁沟 + 石子 + 内阴影（取代图集里的绿边方块） */
  function drawSoil(x,y,w,h){
    ctx.save(); roundRect(x,y,w,h,12); ctx.clip();
    var sg2=ctx.createLinearGradient(x,y,x,y+h);
    sg2.addColorStop(0,'#9d6f42'); sg2.addColorStop(0.45,'#83562f'); sg2.addColorStop(1,'#67421f');
    ctx.fillStyle=sg2; ctx.fillRect(x,y,w,h);
    ctx.lineCap='round';
    for(var r2=1;r2<4;r2++){
      var yy=y+h*r2/4;
      ctx.strokeStyle='rgba(48,28,12,.34)'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(x+6,yy+2); ctx.quadraticCurveTo(x+w/2,yy+7,x+w-6,yy+2); ctx.stroke();
      ctx.strokeStyle='rgba(214,175,126,.20)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x+6,yy-3); ctx.quadraticCurveTo(x+w/2,yy+2,x+w-6,yy-3); ctx.stroke();
    }
    for(var s2=0;s2<8;s2++){
      var px2=x+6+((s2*37+13)%Math.max(4,(w-16))), py2=y+6+((s2*53+21)%Math.max(4,(h-16)));
      ctx.fillStyle='rgba(34,20,10,.20)';
      ctx.beginPath(); ctx.ellipse(px2,py2,3.2,2.1,0,0,6.2832); ctx.fill();
      ctx.fillStyle='rgba(232,204,166,.30)';
      ctx.beginPath(); ctx.ellipse(px2-0.8,py2-0.8,2,1.2,0,0,6.2832); ctx.fill();
    }
    var vg=ctx.createRadialGradient(x+w/2,y+h/2,Math.min(w,h)*0.22,x+w/2,y+h/2,Math.max(w,h)*0.78);
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.30)');
    ctx.fillStyle=vg; ctx.fillRect(x,y,w,h);
    ctx.restore();
  }`,
  '草地/泥土绘制'
);

// 3) 用新绘制替换图集平铺
sub(
  `    for(var ty=Math.floor(VH*0.42);ty<VH;ty+=64) for(var tx=0;tx<VW;tx+=64)
      tilePatch(15,3,tx,ty,64,64,'#7ec86a');
    ctx.fillStyle='rgba(90,170,80,.35)';
    for(var gx=0;gx<VW;gx+=26) ctx.fillRect(gx,VH*0.42+((gx*7)%18),14,5);`,
  '    drawGrass();',
  '草地'
);
sub(
  `      ctx.save(); roundRect(px,py,w,h,12); ctx.clip();
      tilePatch(1,0,px,py,w,h,'#8a5f38');
      ctx.restore();
      var soil=ctx.createLinearGradient(px,py,px,py+h);
      soil.addColorStop(0,'rgba(0,0,0,0)'); soil.addColorStop(1,'rgba(0,0,0,.22)');
      ctx.fillStyle=soil; roundRect(px,py,w,h,12); ctx.fill();`,
  '      drawSoil(px,py,w,h);',
  '菜地'
);

// 4) 作物画大一点、贴着泥土底部
sub('drawCropArt(t.crop,px+w/2,py+h-10,Math.min(w,h)*0.82,false,st);',
    'drawCropArt(t.crop,px+w/2,py+h-12,Math.min(w,h)*0.78,false,st);', '幼苗尺寸');
sub('drawCropArt(t.crop,px+w/2,py+h-8,Math.min(w,h)*0.95,true,1);',
    'drawCropArt(t.crop,px+w/2,py+h-10,Math.min(w,h)*1.02,true,1);', '成熟尺寸');

// 5) 玩家标记缩小、挪到角落，别盖住作物
sub(
  `    if(me.x>0){ var mx=g.x0+me.x*g.pw, my=g.y0+me.y*g.ph;
      ctx.fillStyle='rgba(255,120,170,.9)'; ctx.beginPath(); ctx.arc(mx,my,10,0,6.28); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); }`,
  `    if(me.x>0){ var mx=g.x0+me.x*g.pw+g.pw/2-14, my=g.y0+me.y*g.ph+g.ph/2-14;
      ctx.fillStyle='rgba(255,120,170,.85)'; ctx.beginPath(); ctx.arc(mx,my,5,0,6.28); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=1.6; ctx.stroke(); }`,
  '玩家标记'
);

// 6) 动物按品种给不同体量，别顶满卡片
sub('drawAnimal(br.animal, r.x+r.w*0.34, r.y+r.h-8+bob, Math.min(52,r.h*0.72));',
    'drawAnimal(br.animal, r.x+r.w*0.34, r.y+r.h-10+bob, Math.min(46, r.h*(k===1?0.50:0.58)));', '动物体量');

// 7) 去掉底部提示条，延迟挪到任务条右侧
sub(
  `    // 底部提示
    ctx.fillStyle='rgba(0,0,0,.34)'; roundRect(10,sg.y-20,VW-20,16,7); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='10px system-ui';
    ctx.fillText('点空田播种 · 点生长中的田浇水', 16, sg.y-8);
    ctx.textAlign='right'; ctx.fillText('延迟'+latency+'ms', VW-16, sg.y-8); ctx.textAlign='left';`,
  '',
  '去掉底部提示'
);
sub(
  "    ctx.fillText('今日任务 '+qDone+'/'+QUESTS.length+' · 收获'+day.h+' 浇水'+day.w, 22, 71);",
  `    ctx.fillText('今日任务 '+qDone+'/'+QUESTS.length+' · 收获'+day.h+' 浇水'+day.w, 22, 71);
    ctx.textAlign='right'; ctx.fillStyle='rgba(40,60,30,.75)';
    ctx.fillText('延迟'+latency+'ms', VW-16, 71); ctx.textAlign='left';`,
  '延迟挪位'
);

// 8) 商店缩略图放大
sub(
  "      ctx.save(); ctx.translate(cxx+16,cyy+cellH*0.5); ctx.scale(0.42,0.42);\n      drawCropArt(ci,0,8,16,true,1);\n      ctx.restore();",
  "      ctx.save(); ctx.translate(cxx+19,cyy+cellH*0.66); ctx.scale(0.62,0.62);\n      drawCropArt(ci,0,6,26,true,1);\n      ctx.restore();",
  '商店缩略图'
);

fs.writeFileSync(p, t, 'utf8');
console.log('已改:', ok.join(' / '));
