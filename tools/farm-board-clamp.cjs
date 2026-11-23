const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const from = `  var boardH=w*(VH<640?0.56:0.60);`;
const to = `  var boardH=w*(VH<640?0.56:0.60);
  // 横屏时高度不够：田板压到畜栏上方，别被盖住
  var maxBoard=pg.y-10-top;
  if(boardH>maxBoard) boardH=Math.max(120,maxBoard);`;
if (!t.includes(from)) { console.log('MISS'); } else {
  t = t.replace(from, to);
  fs.writeFileSync(p, t, 'utf8');
  console.log('田板高度加了上限');
}
