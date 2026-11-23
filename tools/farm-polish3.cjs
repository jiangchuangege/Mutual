const fs = require('node:fs');

// 1) 初始家具摆得散一点
const p1 = 'C:/ts/src/core/farmRoomShop.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const from1 = `  var starters=[
    ['bedDouble',0.26,0.30],['bookcaseClosed',0.74,0.26],['kitchenBar',0.10,0.58],
    ['benchCushion',0.50,0.64],['lampRoundFloor',0.90,0.70],['bear',0.42,0.46],
    ['coatRackStanding',0.64,0.40],['chairRounded',0.30,0.72],['cardboardBoxClosed',0.70,0.60]
  ];`;
const to1 = `  var starters=[
    ['bedDouble',0.24,0.24],['bookcaseClosed',0.80,0.22],['kitchenBar',0.10,0.52],
    ['benchCushion',0.52,0.52],['lampRoundFloor',0.92,0.62],['bear',0.36,0.40],
    ['coatRackStanding',0.68,0.34],['chairRounded',0.30,0.76],['cardboardBoxClosed',0.74,0.74]
  ];`;
if (!t1.includes(from1)) throw new Error('找不到初始家具表');
t1 = t1.replace(from1, to1);
fs.writeFileSync(p1, t1, 'utf8');
console.log('初始家具位置拉开了');

// 2) 动物列表标题缩短，别和金币重叠
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const from2 = `  ctx.fillText('🐾 我们的动物 · 共 '+zoo.length+' 只（上下拖动看全部）', 14, 100);`;
const to2 = `  ctx.fillText('🐾 动物 '+zoo.length+' 只 · 上下拖动', 14, 100);`;
if (!t2.includes(from2)) throw new Error('找不到标题');
t2 = t2.replace(from2, to2);
fs.writeFileSync(p2, t2, 'utf8');
console.log('动物标题缩短');
