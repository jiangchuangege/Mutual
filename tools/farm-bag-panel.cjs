const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');

// 背包面板：把仓库里的产物显示出来（以前只加不显示）
const anchor = '    // 当前选中种子提示';
if (!t.includes('仓库')) {
  t = t.replace(
    anchor,
    `    // 仓库（背包）木牌：显示已收获的产物
    var bagKeys=Object.keys(bag).filter(function(k){return bag[k]>0});
    if(bagKeys.length){
      var bw=Math.min(VW-24, 60+bagKeys.length*64), bx=(VW-bw)/2, by=VH-70;
      var wood2=ctx.createLinearGradient(0,by,0,by+34);
      wood2.addColorStop(0,'#e0b57c'); wood2.addColorStop(1,'#b98450');
      ctx.save(); ctx.shadowColor='rgba(60,35,10,.3)'; ctx.shadowBlur=8; ctx.shadowOffsetY=2;
      ctx.fillStyle=wood2; roundRect(bx,by,bw,34,10); ctx.fill(); ctx.restore();
      ctx.fillStyle='#4a3116'; ctx.font='600 12px system-ui';
      ctx.fillText('仓库', bx+10, by+22);
      for(var bi=0;bi<bagKeys.length;bi++){
        ctx.fillStyle='#3f2a12';
        ctx.fillText(bagKeys[bi]+'×'+bag[bagKeys[bi]], bx+52+bi*64, by+22);
      }
    }
    ${anchor}`
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('仓库面板:', t.includes('仓库（背包）木牌'));
