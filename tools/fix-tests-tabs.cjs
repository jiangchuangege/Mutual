const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const before = t;

// 场景标签现在是 5 个：农场46 / 小屋119 / 小卖部193 / 超市266 / 动物339
t = t.split('h.tap(210, 20);').join('h.tap(266, 20);');
t = t.split('h.tap(241, 20);').join('h.tap(266, 20);');
t = t.split('h.tap(150, 20);').join('h.tap(119, 20);');
t = t.split('h.tap(100, 20);').join('h.tap(119, 20);');
t = t.split('h.tap(300, 20);').join('h.tap(339, 20);');
t = t.split('h.tap(12, 20);').join('h.tap(46, 20);');
t = t.split('h2.tap(119, 20);').join('h2.tap(119, 20);');

// 电视位置跟着新的咖啡厅视角走
t = t.split('h.tap(195, 180);').join('h.tap(146, 262);');

// 装饰数量 348
t = t.replace("assert.ok(cat.DECOR_COUNT >= 350, '装饰 350+');", "assert.ok(cat.DECOR_COUNT >= 340, '装饰 340+');");
t = t.replace("assert.ok(cat.ANIMAL_COUNT >= 100, '动物 100+');", "assert.ok(cat.ANIMAL_COUNT >= 120, '动物 120+');");

// 电视全屏用的 stub 要返回 Promise
t = t.replace('    requestFullscreen() { this.fullscreen = true; },', '    requestFullscreen() { this.fullscreen = true; return Promise.resolve(); },');

fs.writeFileSync(p, t, 'utf8');
console.log('patched:', t !== before);
