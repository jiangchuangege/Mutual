const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const anchor = `  assert.equal(st.house.length, 0, '收起后房间空了');
  assert.equal(st.ownedDecor.length, 1, '回到待摆清单');`;
const repl = `  assert.equal(st.house.length, 0, '点一下就拿起来了（房间空了）');
  assert.equal(st.ownedDecor.length, 1, '回到待摆清单，可以直接放新位置');
  // 拿起后处于布置模式：先结束布置，再点电视
  h.tap(340, VH - 62 + 34); h.frame(3);`;
if (!t.includes(anchor)) throw new Error('找不到断言');
t = t.replace(anchor, repl);
fs.writeFileSync(p, t, 'utf8');
console.log('测试已适配"点家具=拿起来移动"');
