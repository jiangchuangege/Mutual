const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 超市卡片的装饰缩略图 → 家具精灵
sub("      drawDecorItem(DECOR[it.i],r.x+r.w*0.3,r.y+r.h*0.56,r.w*0.44,r.h*0.4);",
    "      drawFurniture(DECOR[it.i].f,DECOR[it.i].t,r.x+r.w*0.3,r.y+r.h*0.62,r.h*0.42);",
    '市场家具缩略');

// 2) 小屋渲染整体交给新模块
const hs = t.indexOf('function renderHouse(){');
const he = t.indexOf('/* 布置模式：点房间放家具 */');
if (hs < 0 || he < 0) throw new Error('没找到 renderHouse 段');
t = t.slice(0, hs) + `function renderHouse(){ renderRoomScene(); }
` + t.slice(he);
ok.push('renderHouse 委托');

// 3) 小屋/小卖部点击委托
sub(`  if(scene==='house'){`, `  if(scene==='shop'){
    shopAct(px,py);
    return;
  }
  if(scene==='house'){
    roomAct(px,py);
    return;
  }
  if(scene==='house_legacy'){`, '点击委托');
ok.push('小卖部点击');

// 4) 渲染/循环里加小卖部
sub("  else if(scene==='house') renderHouse();",
    "  else if(scene==='house') renderHouse();\n  else if(scene==='shop') renderShopScene();",
    '渲染小卖部');
sub("  checkAch();\n  netSend(false);",
    "  if(typeof shopStep==='function') shopStep(dt);\n  checkAch();\n  netSend(false);",
    '循环里跑顾客');

// 5) 顶部标签加"小卖部"
sub(`function sceneTabs(){
  var w=(VW-24-18)/4, out=[];
  var names=[['farm','🌾农场'],['house','🏡小屋'],['market','🛒超市'],['zoo','🐾动物']];
  for(var i=0;i<4;i++) out.push({id:names[i][0],label:names[i][1],x:12+i*(w+6),y:8,w:w,h:30});
  return out;
}`,
`function sceneTabs(){
  var names=[['farm','🌾农场'],['house','🏡小屋'],['shop','🏪小卖部'],['market','🛒超市'],['zoo','🐾动物']];
  var w=(VW-24-24)/5, out=[];
  for(var i=0;i<names.length;i++) out.push({id:names[i][0],label:names[i][1],x:12+i*(w+5),y:8,w:w,h:30});
  return out;
}`, '五个场景标签');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
