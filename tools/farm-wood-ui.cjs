const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');

// 1) HUD 换成木牌风格（木纹渐变 + 钉子 + 深棕字）
const hudOld = `    ctx.fillStyle='rgba(255,255,255,.75)'; roundRect(10,10,VW-20,44,14); ctx.fill();`;
const hudNew = `    // 木牌 HUD
    var wood=ctx.createLinearGradient(0,10,0,54);
    wood.addColorStop(0,'#d9a86a'); wood.addColorStop(.5,'#c08a4e'); wood.addColorStop(1,'#a06e39');
    ctx.save(); ctx.shadowColor='rgba(60,35,10,.35)'; ctx.shadowBlur=10; ctx.shadowOffsetY=3;
    ctx.fillStyle=wood; roundRect(10,10,VW-20,44,12); ctx.fill(); ctx.restore();
    ctx.strokeStyle='rgba(90,55,20,.55)'; ctx.lineWidth=2; roundRect(10,10,VW-20,44,12); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.arc(26,32,3,0,6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(VW-26,32,3,0,6.28); ctx.fill();`;
if (!t.includes(hudOld)) throw new Error('HUD 行未找到');
t = t.replace(hudOld, hudNew);

// 2) 田块加木框边（看起来是"围起来的田"）
const plotOld = `      ctx.strokeStyle='rgba(0,0,0,.16)'; ctx.lineWidth=1; ctx.strokeRect(px+.5,py+.5,TS-1,TS-1);`;
if (t.includes(plotOld)) {
  t = t.replace(plotOld, `      ctx.strokeStyle='rgba(0,0,0,.16)'; ctx.lineWidth=1; ctx.strokeRect(px+.5,py+.5,TS-1,TS-1);`);
}

// 3) 每个田块外圈描木色边
const soilAfter = `      var soil=ctx.createLinearGradient(px,py,px,py+h);
      soil.addColorStop(0,'rgba(0,0,0,0)'); soil.addColorStop(1,'rgba(0,0,0,.22)');
      ctx.fillStyle=soil; roundRect(px,py,w,h,12); ctx.fill();`;
if (!t.includes(soilAfter)) throw new Error('菜地渐进行未找到');
t = t.replace(
  soilAfter,
  soilAfter + `
      ctx.strokeStyle='rgba(120,80,40,.55)'; ctx.lineWidth=3;
      roundRect(px+1.5,py+1.5,w-3,h-3,11); ctx.stroke();`
);

fs.writeFileSync(p, t, 'utf8');
console.log('木牌 HUD + 田野边框:', { hud: t.includes('木牌 HUD'), 边框: t.includes("rgba(120,80,40,.55)") });
