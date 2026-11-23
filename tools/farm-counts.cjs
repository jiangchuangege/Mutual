const fs = require('node:fs');

// 标题页文案改成实际数量（用目录长度插值，避免写死）
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(
  '<span>130 种作物 · 24 种动物 · 132 件商品 · 240 件家具</span>',
  '<span>${FARM_CROPS.length} 种作物 · ${FARM_ANIMALS.length} 种动物 · ${MARKET_GOODS.length} 件商品 · ${DECOR_ITEMS.length} 件家具</span>',
);
fs.writeFileSync(p, t, 'utf8');

// 测试里的数量断言
const tp = 'C:/ts/tests/farm-html.test.js';
let tt = fs.readFileSync(tp, 'utf8');
tt = tt.replace("assert.equal(cat.CROP_COUNT, 130);", "assert.ok(cat.CROP_COUNT >= 250, '作物 250+');");
tt = tt.replace("assert.equal(cat.ANIMAL_COUNT, 24);", "assert.ok(cat.ANIMAL_COUNT >= 100, '动物 100+');");
tt = tt.replace("assert.equal(cat.GOOD_COUNT, 132);", "assert.ok(cat.GOOD_COUNT >= 130, '商品 130+');");
tt = tt.replace("assert.equal(cat.DECOR_COUNT, 240);", "assert.ok(cat.DECOR_COUNT >= 350, '装饰 350+');");
fs.writeFileSync(tp, tt, 'utf8');
console.log('updated');
