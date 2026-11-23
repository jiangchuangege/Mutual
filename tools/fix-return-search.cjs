const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

// 用"从末尾第 N 个 } 之前插入 return"的搜索替换掉原来的粗暴版
const startMark = '    // 补 return 再试：只针对"缺返回值"这一种残局，别乱改真语法错';
const endMark = '    if (!compiled) {\n      const firstError';
const s = t.indexOf(startMark);
const e = t.indexOf(endMark);
if (s < 0 || e < 0) throw new Error('找不到要替换的 return 重试块');

const block = `    // 补 return 再试：把候选返回值插到"从末尾数第 1~4 个 }"之前，逐个试编译。
    // 这样不管是缺在方法里、还是缺在 switch 里，都能找到那个合法的插入点。
    if (!compiled && /missing return statement|illegal start of type|not a statement/i.test(lastErr)) {
      const originals = filesNow.map((f) => fs.readFileSync(f, 'utf8'));
      const putBack = () => filesNow.forEach((f, i) => fs.writeFileSync(f, originals[i]));
      let ok = false;
      for (let fromEnd = 1; fromEnd <= 4 && !ok; fromEnd += 1) {
        for (const cand of RETURN_CANDIDATES) {
          filesNow.forEach((f, i) => fs.writeFileSync(f, insertReturnBefore(originals[i], fromEnd, cand)));
          try {
            sh(path.join(jh, 'bin/javac'), [
              '-nowarn',
              '-classpath', AJAR,
              '-d', path.join(work, 'out/classes'),
              ...filesNow,
            ]);
            ok = true;
            compiled = true;
            repairedBraces += 1;
            break;
          } catch (e2) {
            lastErr = (e2 && typeof e2 === 'object' && 'stderr' in e2 ? String(e2.stderr) : '') || String(e2);
          }
        }
      }
      if (!ok) putBack();
    }

`;

// 插入工具函数
const helper = `/** 在"从末尾数第 n 个 }"之前插入 return 语句（用于修复被截断的方法体） */
function insertReturnBefore(src, n, value) {
  const s = String(src ?? '');
  let idx = -1;
  let count = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    if (s[i] === '}') {
      count += 1;
      if (count === n) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return s;
  return \`\${s.slice(0, idx)}return \${value};\\n\${s.slice(idx)}\`;
}

`;

t = t.slice(0, s) + block + t.slice(e);
t = t.replace('const RETURN_CANDIDATES', helper + 'const RETURN_CANDIDATES');
fs.writeFileSync(p, t, 'utf8');
console.log('return 修复已改为位置搜索:', t.includes('insertReturnBefore'), '| 候选点 1~4:', t.includes('fromEnd <= 4'));
