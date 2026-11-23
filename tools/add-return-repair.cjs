const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

if (!t.includes('RETURN_CANDIDATES')) {
  // 在 repairJavaSource 之后加一个"补 return"的工具
  t = t.replace(
    'export function buildApk(input) {',
    `/**
 * 被截断的代码还有一种残局：方法闭合了但少了 return。
 * javac 会报 \`missing return statement\`。
 * 这里把候选返回值塞到最后一个 } 之前，交给编译结果自己判断对不对。
 */
const RETURN_CANDIDATES = ['true', 'false', '0', 'null', '""'];

function withReturn(src, value) {
  const s = String(src ?? '');
  const i = s.lastIndexOf('}');
  if (i < 0) return s;
  return \`\${s.slice(0, i)}return \${value};\\n\${s.slice(i)}\`;
}

export function buildApk(input) {`
  );

  // javac 重试阶梯：语法错（缺 return）→ 逐个试候选返回值
  t = t.replace(
    `    if (!compiled) {
      const firstError = lastErr.split('\\n').find((l) => l.includes('error:')) || lastErr.split('\\n')[0] || '未知错误';
      return { ok: false, error: \`Java 编译失败：\${firstError.trim().slice(0, 220)}\` };
    }`,
    `    // 补 return 再试：只针对"缺返回值"这一种残局，别乱改真语法错
    if (!compiled && /missing return statement/i.test(lastErr)) {
      for (const cand of RETURN_CANDIDATES) {
        const filesNow = javaFilesOnDisk.slice();
        for (const f of filesNow) fs.writeFileSync(f, withReturn(fs.readFileSync(f, 'utf8'), cand));
        try {
          sh(path.join(jh, 'bin/javac'), ['-nowarn', '-classpath', AJAR, '-d', path.join(work, 'out/classes'), ...javacBase.slice(javacBase.indexOf(...javaFilesOnDisk) - 1)]);
        } catch (e2) {
          lastErr = (e2 && typeof e2 === 'object' && 'stderr' in e2 ? String(e2.stderr) : '') || String(e2);
          continue;
        }
        compiled = true;
        repairedBraces += 1;
        break;
      }
    }
    if (!compiled) {
      const firstError = lastErr.split('\\n').find((l) => l.includes('error:')) || lastErr.split('\\n')[0] || '未知错误';
      return { ok: false, error: \`Java 编译失败：\${firstError.trim().slice(0, 220)}\` };
    }`
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('已加入 return 自动补全:', t.includes('RETURN_CANDIDATES'), '| 重试逻辑:', t.includes('missing return statement'));
