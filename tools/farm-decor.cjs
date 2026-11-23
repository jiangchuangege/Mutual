const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
if (t.includes('装饰：稻草人')) {
  console.log('已有装饰');
  process.exit(0);
}
const anchor = '    // 玩家标记';
if (!t.includes(anchor)) {
  console.log('锚点缺失');
  process.exit(1);
}

const add = `    // 装饰：稻草人 / 水井 / 花圃
    var dg=geo(); var dY=dg.y0+dg.h+16;
    // 稻草人
    var sx0=dg.x0+26, sy0=dY+12;
    ctx.strokeStyle='#8a6a44'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(sx0,sy0+26); ctx.lineTo(sx0,sy0-6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx0-14,sy0-2); ctx.lineTo(sx0+14,sy0-2); ctx.stroke();
    ctx.fillStyle='#f2d08a'; ctx.beginPath(); ctx.arc(sx0,sy0-10,9,0,6.28); ctx.fill();
    ctx.fillStyle='#c96a4a'; ctx.fillRect(sx0-11,sy0-19,22,7);
    // 水井
    var wx=VW-96, wy=dY+20;
    ctx.fillStyle='#9aa3ab'; ctx.beginPath(); ctx.ellipse(wx,wy,26,12,0,0,6.28); ctx.fill();
    ctx.fillStyle='#5b666e'; ctx.beginPath(); ctx.ellipse(wx,wy-2,19,8,0,0,6.28); ctx.fill();
    ctx.fillStyle='#b8874f'; ctx.fillRect(wx-24,wy-30,5,22); ctx.fillRect(wx+19,wy-30,5,22);
    ctx.fillStyle='#c96a4a';
    ctx.beginPath(); ctx.moveTo(wx-30,wy-30); ctx.lineTo(wx+30,wy-30); ctx.lineTo(wx,wy-48); ctx.closePath(); ctx.fill();
    // 花圃
    var petals=['#e86a8f','#f2c86b','#b3a4e0','#7fc8a9','#e8836b'];
    for(var i2=0;i2<5;i2++){
      var fx2=VW/2-70+i2*34, fy2=dY+18+(i2%2)*6;
      ctx.fillStyle=petals[i2%5];
      ctx.beginPath(); ctx.arc(fx2,fy2,6,0,6.28); ctx.fill();
      ctx.fillStyle='#4e9e58'; ctx.fillRect(fx2-1,fy2+5,2,7);
    }
`;

t = t.split(anchor).join(add + anchor);
fs.writeFileSync(p, t, 'utf8');
console.log('装饰已加:', t.includes('装饰：稻草人'), t.includes('水井'), t.includes('花圃'));
