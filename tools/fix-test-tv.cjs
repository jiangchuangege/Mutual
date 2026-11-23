const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf('  // 打开电视');
const end = t.indexOf('});', t.indexOf("btnClose.onclick();"));
if (start < 0 || end < 0) throw new Error('没找到电视断言段');
const repl = `  // 电视：进小屋就挂上常驻小屏，点一下请求全屏
  const inlineTv = h.body.children.find((n) => n.id === 'roomtv');
  assert.ok(inlineTv, '小屋里有电视小屏（小屏也能看到在演什么）');
  h.tap(146, 262); h.frame(3);
  assert.equal(inlineTv.fullscreen, true, '点电视会请求全屏');
  h.tap(119, 20); h.frame(3);          // 去小屋以外的地方，小屏要拆掉
  assert.equal(h.body.children.some((n) => n.id === 'roomtv'), false, '离开小屋后拆掉小屏');
`;
t = t.slice(0, start) + repl + t.slice(end);
fs.writeFileSync(p, t, 'utf8');
console.log('电视断言已更新');
