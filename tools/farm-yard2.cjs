const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) {
  if (!t.includes(from)) { console.log('MISS:', tag); return; }
  t = t.replace(from, to); ok.push(tag);
}

// 1) 谷仓门：两扇木门 + X 支撑，别像个瓶子
sub(
  `    // 门
    ctx.fillStyle='#f3e7cd';
    ctx.beginPath(); ctx.moveTo(bx+bw*0.34,by+bh*0.66);
    ctx.lineTo(bx+bw*0.34,by+bh*0.3); ctx.quadraticCurveTo(bx+bw*0.5,by+bh*0.18,bx+bw*0.66,by+bh*0.3);
    ctx.lineTo(bx+bw*0.66,by+bh*0.66); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#8a4a2a'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='rgba(150,90,50,.5)';
    ctx.fillRect(bx+bw*0.49,by+bh*0.34,2,bh*0.3);`,
  `    // 两扇谷仓大门（带 X 支撑）
    var dx=bx+bw*0.3, dw=bw*0.4, dy0=by+bh*0.22, dh=bh*0.44;
    ctx.fillStyle='#f3e7cd'; ctx.fillRect(dx,dy0,dw,dh);
    ctx.strokeStyle='#8a4a2a'; ctx.lineWidth=1.8; ctx.strokeRect(dx,dy0,dw,dh);
    ctx.beginPath(); ctx.moveTo(dx,dy0); ctx.lineTo(dx+dw,dy0+dh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx+dw,dy0); ctx.lineTo(dx,dy0+dh); ctx.stroke();
    ctx.fillStyle='#8a4a2a'; ctx.fillRect(dx+dw/2-1,dy0,2,dh);`,
  '谷仓门'
);

// 2) 稻草人 / 水井 / 花圃 → 新的一组（对齐 + 加大 + 加池塘鸭子 + 干草垛 + 溜达的鸡）
sub(
  `    // 稻草人
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
    }`,
  `    // 稻草人（杆子到脖子，帽子和头对齐）
    var scy=y+h*0.94, sx0=x+w*0.46;
    var stickH=h*0.46;
    ctx.strokeStyle='#8a6a44'; ctx.lineWidth=3.4;
    ctx.beginPath(); ctx.moveTo(sx0,scy); ctx.lineTo(sx0,scy-stickH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx0-13,scy-stickH*0.72); ctx.lineTo(sx0+13,scy-stickH*0.72); ctx.stroke();
    // 稻草把
    ctx.strokeStyle='#e8c977'; ctx.lineWidth=2;
    for(var st2=-1;st2<=1;st2++){
      ctx.beginPath(); ctx.moveTo(sx0+st2*11,scy-stickH*0.72);
      ctx.lineTo(sx0+st2*15,scy-stickH*0.82); ctx.stroke();
    }
    ctx.fillStyle='#f2d08a';
    ctx.beginPath(); ctx.arc(sx0,scy-stickH-4,8,0,6.2832); ctx.fill();
    ctx.fillStyle='#c96a4a';
    ctx.beginPath(); ctx.moveTo(sx0-9,scy-stickH-9); ctx.lineTo(sx0+9,scy-stickH-9);
    ctx.lineTo(sx0,scy-stickH-19); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(60,40,20,.5)';
    ctx.beginPath(); ctx.arc(sx0-2.6,scy-stickH-5,1.4,0,6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(sx0+2.6,scy-stickH-5,1.4,0,6.2832); ctx.fill();

    // 水井（加大，带辘轳和横梁）
    var wy=y+h*0.94, wx=x+w*0.63;
    ctx.fillStyle='#8e979f'; ctx.beginPath(); ctx.ellipse(wx,wy,24,11,0,0,6.2832); ctx.fill();
    ctx.fillStyle='#4f5a62'; ctx.beginPath(); ctx.ellipse(wx,wy-3,17,7.5,0,0,6.2832); ctx.fill();
    ctx.fillStyle='#2f6f8f'; ctx.beginPath(); ctx.ellipse(wx,wy-3,13,5.5,0,0,6.2832); ctx.fill();
    ctx.fillStyle='#b8874f'; ctx.fillRect(wx-21,wy-34,5,26); ctx.fillRect(wx+16,wy-34,5,26);
    ctx.fillStyle='#c96a4a';
    ctx.beginPath(); ctx.moveTo(wx-27,wy-34); ctx.lineTo(wx+27,wy-34); ctx.lineTo(wx,wy-50); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#7a4a26'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(wx-21,wy-28); ctx.lineTo(wx+21,wy-28); ctx.stroke();
    ctx.fillStyle='#8a6a44'; ctx.fillRect(wx-3,wy-27,6,8);

    // 池塘 + 两只鸭子
    var pdx=x+w*0.16, pdy=y+h*0.94;
    var pdg=ctx.createRadialGradient(pdx,pdy,4,pdx,pdy,40);
    pdg.addColorStop(0,'#8fd7f0'); pdg.addColorStop(1,'#4aa8cc');
    ctx.fillStyle='#c8b184'; ctx.beginPath(); ctx.ellipse(pdx,pdy,42,17,0,0,6.2832); ctx.fill();
    ctx.fillStyle=pdg; ctx.beginPath(); ctx.ellipse(pdx,pdy-2,36,13,0,0,6.2832); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.45)';
    ctx.beginPath(); ctx.ellipse(pdx-10,pdy-6,10,3,-0.2,0,6.2832); ctx.fill();
    drawAnimal('duck', pdx-14, pdy-4+Math.sin(tick/40)*1.6, 22);
    drawAnimal('duck', pdx+12, pdy-1+Math.sin(tick/34+1)*1.6, 18);

    // 干草垛
    function hay(hx,hy,s3){
      ctx.fillStyle='#e8c977'; roundRect(hx-s3,hy-s3*0.62,s3*2,s3*1.2,s3*0.28); ctx.fill();
      ctx.strokeStyle='rgba(160,120,50,.5)'; ctx.lineWidth=1.4;
      for(var l=1;l<4;l++){ ctx.beginPath(); ctx.moveTo(hx-s3,hy-s3*0.62+l*s3*0.3);
        ctx.lineTo(hx+s3,hy-s3*0.62+l*s3*0.3); ctx.stroke(); }
      ctx.strokeStyle='#b8874f'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(hx-s3*0.4,hy-s3*0.62); ctx.lineTo(hx-s3*0.4,hy+s3*0.58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx+s3*0.4,hy-s3*0.62); ctx.lineTo(hx+s3*0.4,hy+s3*0.58); ctx.stroke();
    }
    hay(x+w*0.53, y+h*0.95, 13);
    hay(x+w*0.53+30, y+h*0.97, 10);

    // 溜达的小猪 / 小狗（用真实动物图）
    drawAnimal('pig', x+w*0.34+Math.sin(tick/160)*10, y+h*0.97, 26);
    drawAnimal('dog', x+w*0.72+Math.cos(tick/190)*12, y+h*0.99, 24);

    // 花圃
    var petals=['#e86a8f','#f2c86b','#b3a4e0','#7fc8a9','#e8836b'];
    for(var i2=0;i2<7;i2++){
      var fx2=x+w*0.055+i2*15, fy2=y+h*0.99-((i2%2)*5);
      ctx.fillStyle='#4e9e58'; ctx.fillRect(fx2-1,fy2,2,6);
      ctx.fillStyle=petals[i2%5];
      ctx.beginPath(); ctx.arc(fx2,fy2-1,4.2,0,6.2832); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.arc(fx2,fy2-2.4,1.4,0,6.2832); ctx.fill();
    }`,
  '院子道具'
);

// 3) 小路放到更下面、更淡，别横穿画面中间
sub(
  `    ctx.fillStyle='rgba(196,160,110,.55)';
    ctx.beginPath();
    ctx.moveTo(x-6,y+h*0.62);
    ctx.quadraticCurveTo(x+w*0.5,y+h*0.5,x+w+6,y+h*0.66);
    ctx.lineTo(x+w+6,y+h*0.86);
    ctx.quadraticCurveTo(x+w*0.5,y+h*0.72,x-6,y+h*0.86);
    ctx.closePath(); ctx.fill();`,
  `    ctx.fillStyle='rgba(200,168,118,.42)';
    ctx.beginPath();
    ctx.moveTo(x-6,y+h*0.80);
    ctx.quadraticCurveTo(x+w*0.5,y+h*0.74,x+w+6,y+h*0.82);
    ctx.lineTo(x+w+6,y+h*0.94);
    ctx.quadraticCurveTo(x+w*0.5,y+h*0.86,x-6,y+h*0.94);
    ctx.closePath(); ctx.fill();`,
  '小路'
);

// 4) 畜栏：名字居中不压脸，动物小一点、往下挪
sub(
  `      var bob=Math.sin(tick/24+k*2)*3;
      drawAnimal(br.animal, r.x+r.w*0.5, r.y+r.h-24+bob, Math.min(66, r.h*(k===1?0.56:0.62)));
      ctx.fillStyle='#4d3a2a'; ctx.font='600 12px system-ui'; ctx.textAlign='center';
      ctx.fillText(br.name, r.x+r.w/2, r.y+16);
      ctx.textAlign='left';
      ctx.fillStyle=pn.ready?'#2f8f4a':'rgba(80,60,40,.65)';
      ctx.font='11px system-ui';
      ctx.fillText(pn.ready?('收 '+br.out):(pn.on?'生长中…':('喂 '+br.food+'金')), r.x+8, r.y+30);`,
  `      var bob=Math.sin(tick/24+k*2)*3;
      drawAnimal(br.animal, r.x+r.w*0.5, r.y+r.h-16+bob, Math.min(56, r.h*(k===1?0.48:0.54)));
      ctx.fillStyle='#4d3a2a'; ctx.font='600 12px system-ui'; ctx.textAlign='center';
      ctx.fillText(br.name, r.x+r.w/2, r.y+18);
      ctx.textAlign='left';
      ctx.fillStyle=pn.ready?'#2f8f4a':'rgba(80,60,40,.65)';
      ctx.font='11px system-ui'; ctx.textAlign='center';
      ctx.fillText(pn.ready?('收 '+br.out):(pn.on?'生长中…':('喂 '+br.food+'金')), r.x+r.w/2, r.y+32);
      ctx.textAlign='left';`,
  '畜栏文字'
);

fs.writeFileSync(p, t, 'utf8');
console.log('已改:', ok.join(' / '));
