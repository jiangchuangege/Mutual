const fs = require('node:fs');
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 房间里的家具按屏幕高度缩放（横屏高度小的时候不至于挤成一团）
sub(`  var bi=[`, `  var S=Math.min(1, VH/620);
  var bi=[`, '房间缩放系数');
sub(`    drawList.push({k:bi[b][0],t:0,x:p.x,y:p.y,h:bi[b][4]*depthScale(bi[b][3]),d:p.y});`,
    `    drawList.push({k:bi[b][0],t:0,x:p.x,y:p.y,h:bi[b][4]*depthScale(bi[b][3])*S,d:p.y});`, '自带家具缩放');
sub(`    var hh=(def.big?128:92)*depthScale(depth);`,
    `    var hh=(def.big?128:92)*depthScale(depth)*S;`, '已摆家具缩放');
sub(`    var hh=(def.big?128:92)*depthScale(depth);
    var w2=hh*furnAspect(def.f);`,
    `    var hh=(def.big?128:92)*depthScale(depth)*Math.min(1,VH/620);
    var w2=hh*furnAspect(def.f);`, '点选判定缩放');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
