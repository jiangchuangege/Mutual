const fs = require('node:fs');
const p = 'C:/ts/src/core/farmArtKit2.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 支持直接指定色相（自带家具用暖色系，别随机成荧光绿）
sub("function drawDecorItem(d,x,y,w,h){\n  var P=palOf(hueOf(d.p*7+d.c.length,40));",
    "function drawDecorItem(d,x,y,w,h){\n  var P=palOf(d.h!==undefined?d.h:hueOf(d.p*7+d.c.length,40));",
    '色相覆盖');
fs.writeFileSync(p, t, 'utf8');

const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2(`  drawDecorItem({c:'rug',p:3,s:2,n:'地毯'}, r.x+r.w*0.5, fy-96, r.w*0.62, r.w*0.3);
  drawDecorItem({c:'bed',p:5,s:2,n:'床'}, r.x+r.w*0.24, fy-128, r.w*0.38, r.w*0.24);
  drawDecorItem({c:'kitchen',p:1,s:2,n:'厨房'}, r.x+r.w*0.82, fy-104, r.w*0.34, r.w*0.2);
  drawDecorItem({c:'plant',p:6,s:1,n:'盆栽'}, r.x+r.w*0.1, fy-60, r.w*0.14, r.w*0.13);
  drawDecorItem({c:'wall',p:7,s:1,n:'墙画'}, r.x+r.w*0.3, r.y+r.wallH*0.34, r.w*0.16, r.w*0.14);
  drawDecorItem({c:'lamp',p:2,s:1,n:'落地灯'}, r.x+r.w*0.62, fy-70, r.w*0.13, r.w*0.2);`,
`  drawDecorItem({c:'rug',p:0,s:2,h:28,n:'地毯'}, r.x+r.w*0.52, fy-104, r.w*0.66, r.w*0.32);
  drawDecorItem({c:'bed',p:0,s:2,h:208,n:'床'}, r.x+r.w*0.22, fy-136, r.w*0.4, r.w*0.26);
  drawDecorItem({c:'kitchen',p:0,s:2,h:32,n:'厨房'}, r.x+r.w*0.83, fy-112, r.w*0.32, r.w*0.2);
  drawDecorItem({c:'plant',p:0,s:1,h:120,n:'盆栽'}, r.x+r.w*0.08, fy-62, r.w*0.15, r.w*0.14);
  drawDecorItem({c:'wall',p:0,s:1,h:342,n:'墙画'}, r.x+r.w*0.24, r.y+r.wallH*0.3, r.w*0.17, r.w*0.15);
  drawDecorItem({c:'lamp',p:0,s:1,h:44,n:'落地灯'}, r.x+r.w*0.62, fy-64, r.w*0.13, r.w*0.2);`,
    '自带家具配色');
fs.writeFileSync(p2, t2, 'utf8');
console.log('改了:', ok.concat(ok2).join(' / '));
