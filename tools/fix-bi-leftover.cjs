const fs = require('node:fs');
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');
const from = `  // 自带家具
  var S=Math.min(1, VH/620);
  var drawList=[];
  for(var b=0;b<bi.length;b++){
    var p=floorPoint(g,bi[b][2],bi[b][3]);
    drawList.push({k:bi[b][0],t:0,x:p.x,y:p.y,h:bi[b][4]*depthScale(bi[b][3])*S,d:p.y});
  }`;
const to = `  var S=Math.min(1, VH/620);
  var drawList=[];`;
if (!t.includes(from)) throw new Error('找不到残留块');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('清掉 bi 残留');
