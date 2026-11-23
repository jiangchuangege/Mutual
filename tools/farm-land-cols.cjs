const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 超市：横屏铺 5 列
sub(`function marketGeom(){
  return {x:8,y:132,w:VW-16,h:VH-140,cardH:92,cols:3};
}`,
`function marketGeom(){
  var cols=LANDSCAPE?5:3;
  return {x:8,y:132,w:VW-16,h:VH-140,cardH:LANDSCAPE?76:92,cols:cols};
}`, '超市列数');

// 动物：横屏铺 4 列
sub(`function zooCardRect(i){
  var zg=zooGeom(), cw=(zg.w-10)/2;
  return {x:zg.x+4+(i%2)*(cw+4),y:zg.y+4+Math.floor(i/2)*104,w:cw-4,h:98};
}`,
`function zooCols(){ return LANDSCAPE?4:2; }
function zooCardRect(i){
  var zg=zooGeom(), n=zooCols(), cw=(zg.w-10)/n;
  var ch=LANDSCAPE?88:98;
  return {x:zg.x+4+(i%n)*(cw+4),y:zg.y+4+Math.floor(i/n)*(ch+6),w:cw-4,h:ch};
}`, '动物列数');

// 动物卡里的图标尺寸跟着卡片走
sub(`    drawAnimal2(def,r.x+36,r.y+r.h-14,58,0,a.aff);`,
    `    var aSize=Math.min(58,r.h*0.6);
    drawAnimal2(def,r.x+34,r.y+r.h-12,aSize,0,a.aff);`, '动物图标尺寸');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
