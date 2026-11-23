const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const from = `  // 进屋
  h.tap(119, 20); h.frame(3);
  // 布置模式
  h.tap(60, VH - 58 + 16); h.frame(3);
  // 选第一件
  h.tap(30, VH - 62 + 38); h.frame(3);
  // 放到房间中间
  h.tap(200, 560); h.frame(3);
  let st = parse(h.lastState());
  assert.equal(st.house.length, 1, '摆了一件家具');
  assert.equal(st.ownedDecor.length, 0, '已摆的不在待摆清单');
  // 完成布置
  h.tap(VW - 92 + 40, VH - 62 + 37); h.frame(3);
  // 点家具收起
  h.tap(200, 560); h.frame(3);
  st = parse(h.lastState());
  assert.equal(st.house.length, 0, '点一下就拿起来了（房间空了）');
  assert.equal(st.ownedDecor.length, 1, '回到待摆清单，可以直接放新位置');`;
const to = `  // 进屋（一进来就有初始家具，它们也是可编辑的物件）
  h.tap(119, 20); h.frame(3);
  const baseCount = parse(h.lastState()).house.length;
  assert.ok(baseCount >= 5, '进屋自带一套家具，且都算可编辑物件');
  // 布置模式
  h.tap(60, VH - 58 + 16); h.frame(3);
  // 选第一件
  h.tap(30, VH - 62 + 38); h.frame(3);
  // 放到房间中间
  h.tap(200, 560); h.frame(3);
  let st = parse(h.lastState());
  assert.equal(st.house.length, baseCount + 1, '多摆了一件家具');
  assert.equal(st.ownedDecor.length, 0, '已摆的不在待摆清单');
  // 完成布置
  h.tap(VW - 92 + 40, VH - 62 + 37); h.frame(3);
  // 点家具拿起来（移动位置）
  h.tap(200, 560); h.frame(3);
  st = parse(h.lastState());
  assert.equal(st.house.length, baseCount, '点一下就拿起来了');
  assert.equal(st.ownedDecor.length, 1, '回到待摆清单，可以直接放新位置');`;
if (!t.includes(from)) throw new Error('找不到小屋测试段');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('小屋测试适配"自带家具也是物件"');
