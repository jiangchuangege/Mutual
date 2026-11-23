const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

if (!t.includes('rewriteCommonMistakes')) {
  // 1) 常见 AI 写法错误的自动纠正
  t = t.replace(
    'export function repairJavaSource(src) {',
    `/**
 * 自动纠正 AI 写 Android 时的几个高频错误（只改确定的、不改语义）：
 *  1. 在 View 子类里重写 \`draw(Canvas)\` —— 必须叫 \`onDraw(Canvas)\`，
 *     否则 javac 报 "cannot override draw(Canvas) in View"；
 *  2. \`super.draw(canvas)\` 出现在 onDraw 里时改成 \`super.onDraw(canvas)\`；
 *  3. \`setContentView(R.layout.xxx)\` 没有布局文件 → 直接注掉并提示（避免整篇编不过）。
 */
export function rewriteCommonMistakes(src) {
  let out = String(src ?? '');
  const notes = [];
  if (/\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/.test(out)) {
    out = out.replace(/\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/g, 'void onDraw(Canvas');
    notes.push('draw(Canvas) → onDraw(Canvas)');
  }
  if (/\\bsuper\\.draw\\s*\\(/.test(out) && /void\\s+onDraw\\s*\\(/.test(out)) {
    out = out.replace(/\\bsuper\\.draw\\s*\\(/g, 'super.onDraw(');
    notes.push('super.draw → super.onDraw');
  }
  if (/setContentView\\s*\\(\\s*R\\.layout\\./.test(out)) {
    out = out.replace(
      /setContentView\\s*\\(\\s*R\\.layout\\.[\\w.]+\\s*\\)\\s*;/g,
      '/* setContentView(R.layout.*) 已移除：云编译没有 XML 布局，请用代码创建 View */'
    );
    notes.push('移除 R.layout 引用');
  }
  return { code: out, notes };
}

export function repairJavaSource(src) {`
  );

  // 2) 在写盘前应用（先纠错，再补括号）
  t = t.replace(
    `    const repaired = javaFiles.map((f) => {
      const r = repairJavaSource(f.content);`,
    `    const fixNotes = [];
    const repaired = javaFiles.map((f) => {
      const fixed = rewriteCommonMistakes(f.content);
      if (fixed.notes.length) fixNotes.push(...fixed.notes);
      const r = repairJavaSource(fixed.code);`
  );

  // 3) 成功时把纠正记录回报
  t = t.replace(
    '      repaired: repairedBraces + repairedParens > 0 ? { braces: repairedBraces, parens: repairedParens } : null,',
    '      repaired: repairedBraces + repairedParens > 0 ? { braces: repairedBraces, parens: repairedParens } : null,\n      fixes: fixNotes.length > 0 ? [...new Set(fixNotes)] : null,'
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('已加入常见错误自动纠正:', t.includes('rewriteCommonMistakes'), '| 回报 fixes:', t.includes('fixes:'));
