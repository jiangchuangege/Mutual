const fs = require('node:fs');

// 起始金币给足（东西都变贵了）
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p1, 'utf8');
t = t.replace('var coins=180, hearts=0', 'var coins=520, hearts=0');
fs.writeFileSync(p1, t, 'utf8');

// 测试里的数量断言
const p2 = 'C:/ts/tests/farm-html.test.js';
let tt = fs.readFileSync(p2, 'utf8');
tt = tt.replace("assert.ok(cat.CROP_COUNT >= 250, '作物 250+');", "assert.equal(cat.CROP_COUNT, 28, '28 种作物');");
tt = tt.replace("assert.ok(cat.ANIMAL_COUNT >= 120, '动物 120+');", "assert.equal(cat.ANIMAL_COUNT, 24, '24 只宠物');");
tt = tt.replace("assert.ok(cat.GOOD_COUNT >= 130, '商品 130+');", "assert.equal(cat.GOOD_COUNT, 63, '63 件商品');");
tt = tt.replace("assert.ok(cat.DECOR_COUNT >= 340, '装饰 340+');", "assert.equal(cat.DECOR_COUNT, 63, '63 件家具');");
// 每种都有自己的美术：key 不能重复
tt = tt.replace(
  "  assert.ok(cat.TV_CHANNELS.length >= 5, '电视频道');",
  `  const cropKeys = new Set(cat.FARM_CROPS.map((c) => c.s));
  assert.equal(cropKeys.size, cat.CROP_COUNT, '每种作物都有自己的图');
  const animalKeys = new Set(cat.FARM_ANIMALS.map((a) => a.k));
  assert.equal(animalKeys.size, cat.ANIMAL_COUNT, '每只动物都有自己的图');
  const goodKeys = new Set(cat.MARKET_GOODS.map((g) => g.s));
  assert.equal(goodKeys.size, cat.GOOD_COUNT, '每件商品都有自己的图');
  const furnKeys = new Set(cat.DECOR_ITEMS.map((d) => d.f));
  assert.equal(furnKeys.size, cat.DECOR_COUNT, '每件家具都有自己的图');
  assert.ok(cat.TV_CHANNELS.length >= 5, '电视频道');`,
);
fs.writeFileSync(p2, tt, 'utf8');
console.log('已更新金币与断言');
