const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
if (t.includes('昼夜：随时间')) {
  console.log('已有昼夜');
  process.exit(0);
}
const anchor = "    sky.addColorStop(0,'#8fd0f0'); sky.addColorStop(0.55,'#bfe8ff'); sky.addColorStop(1,'#e7f6d8');";
if (!t.includes(anchor)) {
  console.log('锚点缺失');
  process.exit(1);
}
const add = anchor + `
    // 昼夜：随时间缓慢变化的天光（夜里整体压暗偏蓝 + 星星）
    var dayT=(tick/3600)%1;
    var night=Math.max(0,Math.sin(dayT*6.2832));
    if(night>0.05){
      ctx.fillStyle='rgba(20,26,60,'+(night*0.45)+')';
      ctx.fillRect(0,0,VW,VH);
      for(var si=0;si<18;si++){
        var ssx=(si*137)%VW, ssy=(si*61)%(VH*0.42);
        ctx.fillStyle='rgba(255,255,230,'+(night*(0.3+0.35*Math.sin(tick/20+si)))+')';
        ctx.fillRect(ssx,ssy,2,2);
      }
    }`;
t = t.replace(anchor, add);
fs.writeFileSync(p, t, 'utf8');
console.log('昼夜已加:', t.includes('昼夜：随时间'));
