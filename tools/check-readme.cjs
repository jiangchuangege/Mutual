const fs = require('node:fs');
const t = fs.readFileSync('C:/ts/README.md', 'utf8');
const FENCE = /^\s*```/;
let open = false;
let n = 0;
t.split('\n').forEach((l) => {
  if (FENCE.test(l)) {
    n += 1;
    open = !open;
  }
});
console.log('README chars:', t.length, ' fence 行:', n, ' 未闭合:', open);
console.log('U+3000:', (t.match(/\u3000/g) || []).length, ' U+FFFD:', (t.match(/\uFFFD/g) || []).length);
console.log('## 章节:', (t.match(/^## /gm) || []).length);
