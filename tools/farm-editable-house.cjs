const fs = require('node:fs');

/* ---------- 1) 状态里加"是否已经摆过初始家具" ---------- */
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1("var houseItems=[];           // 已摆放：{i,x,y}",
     "var houseItems=[];           // 已摆放：{i,x,y}\nvar houseSeeded=false;       // 初始家具是否已经转成可编辑物件", 'housesSeeded 变量');
sub1("    (typeof TV!=='undefined'&&TV.custom)?encodeURIComponent(TV.custom):'',viewMode].join('|');",
     "    (typeof TV!=='undefined'&&TV.custom)?encodeURIComponent(TV.custom):'',viewMode,\n    houseSeeded?'1':'0'].join('|');", '存 houseSeeded');
sub1("    if(seg[15]==='portrait'||seg[15]==='landscape'){ viewMode=seg[15]; layout(); }",
     "    if(seg[15]==='portrait'||seg[15]==='landscape'){ viewMode=seg[15]; layout(); }\n    houseSeeded=(seg[16]==='1');", '读 houseSeeded');
fs.writeFileSync(p1, t1, 'utf8');

/* ---------- 2) 初始家具转成真正的可编辑物件 ---------- */
const p2 = 'C:/ts/src/core/farmRoomShop.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

// 2a) 删掉"写死的自带家具"，改成状态里的物件
const bs = t2.indexOf('  var S=Math.min(1, VH/620);\n  var bi=[');
if (bs < 0) throw new Error('找不到内置家具块');
const be = t2.indexOf('  var drawList=[];');
t2 = t2.slice(0, bs) + '  var S=Math.min(1, VH/620);\n' + t2.slice(be);
ok2.push('去掉写死的自带家具');

// 2b) 首次进入时把一套家具放成可编辑物件
sub2(`/** 小屋点击 */`,
`/** 按素材名找一件装饰的下标 */
function decorIndexByKey(k){
  for(var i=0;i<DECOR.length;i++) if(DECOR[i].f===k) return i;
  return -1;
}
/** 第一次进小屋：把初始家具变成真正可编辑的物件（之后随便拖动/收起） */
function seedHouseIfNeeded(){
  if(houseSeeded) return;
  houseSeeded=true;
  if(houseItems.length) return;
  var g=roomGeom2();
  var starters=[
    ['bedDouble',0.26,0.30],['bookcaseClosed',0.74,0.26],['kitchenBar',0.10,0.58],
    ['benchCushion',0.50,0.64],['lampRoundFloor',0.90,0.70],['bear',0.42,0.46],
    ['coatRackStanding',0.64,0.40],['chairRounded',0.30,0.72],['cardboardBoxClosed',0.70,0.60]
  ];
  for(var s=0;s<starters.length;s++){
    var idx=decorIndexByKey(starters[s][0]);
    if(idx<0) continue;
    var p=floorPoint(g,starters[s][1],starters[s][2]);
    houseItems.push({i:idx,x:Math.round(p.x),y:Math.round(p.y)});
  }
  netSend(true);
}

/** 小屋点击 */`, '初始家具播种');

// 2c) 渲染小屋时确保已播种
sub2(`function renderRoomScene(){
  var g=roomGeom2();`,
`function renderRoomScene(){
  if(typeof seedHouseIfNeeded==='function') seedHouseIfNeeded();
  var g=roomGeom2();`, '渲染时播种');
fs.writeFileSync(p2, t2, 'utf8');

console.log('改了:', ok.concat(ok2).join(' / '));
