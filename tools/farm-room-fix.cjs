const fs = require('node:fs');

// 1) 房间/商店先铺满背景，避免上一帧残留
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

sub(`function renderRoomScene(){
  var g=roomGeom2();`,
`function renderRoomScene(){
  var g=roomGeom2();
  ctx.fillStyle='#e9dcc6'; ctx.fillRect(0,0,VW,VH);`, '房间铺底');
sub(`function renderShopScene(){
  var g=roomGeom2();
  // 地板（商店用瓷砖）
  ctx.fillStyle='#e8dcc6'; ctx.fillRect(g.x,g.y,g.w,g.h);`,
`function renderShopScene(){
  var g=roomGeom2();
  ctx.fillStyle='#dfe6ea'; ctx.fillRect(0,0,VW,VH);
  ctx.fillStyle='#e8dcc6'; ctx.fillRect(g.x,g.y,g.w,g.h);`, '商店铺底');

// 2) 自带家具摆得更满、更大
sub(`  var bi=[
    ['bedDouble',0,0.30,0.22,86],
    ['bookcaseClosed',0,0.72,0.20,80],
    ['kitchenBar',0,0.10,0.60,78],
    ['benchCushion',0,0.52,0.66,64],
    ['lampRoundFloor',0,0.88,0.74,74],
    ['bear',0,0.44,0.50,34],
    ['coatRackStanding',0,0.62,0.42,72]
  ];`,
`  var bi=[
    ['bedDouble',0,0.26,0.26,120],
    ['bookcaseClosed',0,0.74,0.24,112],
    ['kitchenBar',0,0.09,0.56,100],
    ['benchCushion',0,0.50,0.62,86],
    ['lampRoundFloor',0,0.90,0.70,104],
    ['bear',0,0.42,0.44,44],
    ['coatRackStanding',0,0.64,0.38,96],
    ['chairRounded',0,0.30,0.74,74],
    ['cardboardBoxClosed',0,0.70,0.62,44]
  ];`, '自带家具放大');

// 3) 已摆家具也放大一点
sub("    var hh=(def.big?96:70)*depthScale(depth);", "    var hh=(def.big?128:92)*depthScale(depth);", '已摆家具放大');
sub("    var hh=(def.big?96:70)*depthScale(depth);\n    var w2=hh*furnAspect(def.f);", "    var hh=(def.big?128:92)*depthScale(depth);\n    var w2=hh*furnAspect(def.f);", '点选判定同步');

// 4) 电视旁边标出当前频道
sub(`  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='600 9px system-ui'; ctx.textAlign='center';
  ctx.fillText('点电视 = 全屏',tr.x+tr.w/2,tr.y+tr.h+14); ctx.textAlign='left';`,
`  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='600 9px system-ui'; ctx.textAlign='center';
  ctx.fillText((typeof TV!=='undefined'&&CHANNELS[TV.ch]?CHANNELS[TV.ch].n:'CCTV-1')+' · 点电视全屏',
    tr.x+tr.w/2,tr.y+tr.h+14); ctx.textAlign='left';`, '电视频道标注');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));

// 5) 截图脚本加 shop 模式
const sp = 'C:/ts/tools/farm-scene.cjs';
let s = fs.readFileSync(sp, 'utf8');
if (!s.includes("'shop'")) {
  s = s.replace(
    "  if('${mode}'==='zoo'){",
    `  if('\${mode}'==='shop'){
    steps.push(function(){ tap(266, 20); });       // 超市
    steps.push(function(){ tap(12+3*74, 94); });   // 零食页
    for(var s2=0;s2<4;s2++) steps.push(function(){ tap(100, cardBuyY); });
    steps.push(function(){ tap(12+3*74+74, 94); }); // 饮料页
    for(var s3=0;s3<3;s3++) steps.push(function(){ tap(100, cardBuyY); });
    steps.push(function(){ tap(193, 20); });       // 小卖部
    for(var s4=0;s4<5;s4++) steps.push(function(){ tap(10+58, H-50+16); });  // 一键上架
  }
  if('\${mode}'==='zoo'){`,
  );
  fs.writeFileSync(sp, s, 'utf8');
  console.log('截图脚本支持 shop');
}
