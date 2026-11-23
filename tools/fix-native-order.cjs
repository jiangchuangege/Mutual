const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 把 native 分支提到 canPlayInline 检查之前（否则永远 return 不到）
const canLine = '                if (!canPlayInline(g)) return;';
const nativeStart = t.indexOf("                if ((g.kind as string) === 'native') {");
if (nativeStart < 0) throw new Error('找不到 native 分支');
const canIdx = t.indexOf(canLine);
if (canIdx < 0) throw new Error('找不到 canPlayInline 检查');

if (nativeStart > canIdx) {
  // 截出 native 整块（到对应的 "return;\n                }" 结束）
  const marker = '                  return;\n                }\n';
  const nativeEnd = t.indexOf(marker, nativeStart);
  if (nativeEnd < 0) throw new Error('找不到 native 分支结尾');
  const block = t.slice(nativeStart, nativeEnd + marker.length);
  // 先删除原块
  let after = t.slice(0, nativeStart) + t.slice(nativeEnd + marker.length);
  // 再插到 canPlayInline 之前
  const insertAt = after.indexOf(canLine);
  after = after.slice(0, insertAt) + block + after.slice(insertAt);
  fs.writeFileSync(p, after, 'utf8');
  console.log('已把 native 分支移到 canPlayInline 之前');
} else {
  console.log('顺序已经是正确的');
}
const idx1 = fs.readFileSync(p, 'utf8').indexOf("(g.kind as string) === 'native'");
const idx2 = fs.readFileSync(p, 'utf8').indexOf('if (!canPlayInline(g)) return;');
console.log('native 在前?', idx1 > 0 && idx1 < idx2, `(native@${idx1}, canPlay@${idx2})`);
