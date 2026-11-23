const fs = require('node:fs');

// 1) 横屏虚拟画布用 0.78 的宽高比，尽量占满屏幕
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
t1 = t1.replace(
  '    var vw=Math.min(REALW, Math.round(availH*9/16));',
  '    var vw=Math.min(REALW, Math.round(availH*0.78));',
);
// 2) 标签：窄屏只显示两个字
t1 = t1.replace(
  `function sceneTabs(){
  var names=[['farm','🌾农场'],['house','🏡小屋'],['shop','🏪小卖部'],['market','🛒超市'],['zoo','🐾动物']];
  var w=(VW-24-24)/5, out=[];
  for(var i=0;i<names.length;i++) out.push({id:names[i][0],label:names[i][1],x:12+i*(w+5),y:8,w:w,h:30});
  return out;
}`,
  `function sceneTabs(){
  var narrow=VW<330;
  var names=narrow
    ? [['farm','农场'],['house','小屋'],['shop','小店'],['market','超市'],['zoo','动物']]
    : [['farm','🌾农场'],['house','🏡小屋'],['shop','🏪小卖部'],['market','🛒超市'],['zoo','🐾动物']];
  var w=(VW-24-4*5)/5, out=[];
  for(var i=0;i<names.length;i++) out.push({id:names[i][0],label:names[i][1],x:12+i*(w+5),y:8,w:w,h:30});
  return out;
}`,
);
// 3) 标签字号自适应
t1 = t1.replace(
  `  ctx.fillStyle='#4a3116'; ctx.font='600 12px system-ui'; ctx.textAlign='center';
  ctx.fillText(txt,x+w/2,y+h/2+4); ctx.textAlign='left';`,
  `  ctx.fillStyle='#4a3116'; ctx.font='600 '+(w<52?10:12)+'px system-ui'; ctx.textAlign='center';
  ctx.fillText(txt,x+w/2,y+h/2+4); ctx.textAlign='left';`,
);
fs.writeFileSync(p1, t1, 'utf8');
console.log('横屏比例 + 标签自适应完成');
