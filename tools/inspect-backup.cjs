const fs = require('node:fs');
const p = 'C:/ts/tmp/backup-current.sh';
const t = fs.readFileSync(p, 'utf8');
console.log('长度:', t.length, '行数:', t.split('\n').length);
const keep = t.split('\n').filter((l) =>
  /tar czf|for need|PHOTOS=|AVATARS=|BGS=|内容：|KEEP=|校验 2/.test(l),
);
console.log('--- 关键行 ---');
console.log(keep.join('\n'));
