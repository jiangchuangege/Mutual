const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

if (!t.includes('repairJavaSource')) {
  // 1) 加一个"括号补全"修复器
  t = t.replace(
    'export function buildApk(input) {',
    `/**
 * 修被截断的 Java 源码。
 *
 * 常见情况：AI 的长回答被聊天框截断，粘贴过来就是"少了最后几个 }"，
 * javac 报 \`reached end of file while parsing\`。这里做最小修复：
 * 扫描（跳过字符串/字符/注释）统计未闭合的 { 和 (，在末尾补上对应的 } 和 )。
 * 只会补括号，绝不改动代码语义；补了几个会回报给用户。
 */
export function repairJavaSource(src) {
  const s = String(src ?? '');
  let braces = 0;
  let parens = 0;
  let inStr = false;
  let inChar = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const n = s[i + 1];
    if (inLine) {
      if (c === '\\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inStr) {
      if (c === '\\\\') i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (inChar) {
      if (c === '\\\\') i += 1;
      else if (c === "'") inChar = false;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "'") {
      inChar = true;
      continue;
    }
    if (c === '{') braces += 1;
    else if (c === '}') braces -= 1;
    else if (c === '(') parens += 1;
    else if (c === ')') parens -= 1;
  }
  const addClose = Math.max(0, braces);
  const addParen = Math.max(0, parens);
  if (addClose === 0 && addParen === 0) return { code: s, addedBraces: 0, addedParens: 0 };
  const filler = ')'.repeat(addParen) + '}'.repeat(addClose);
  return { code: \`\${s.replace(/\\s*$/, '')}\\n\${filler}\\n\`, addedBraces: addClose, addedParens: addParen };
}

export function buildApk(input) {`
  );

  // 2) 写源码前先修复，并记录补了几个括号
  t = t.replace(
    "    // 写源码：文件名叫什么不重要，但 package 要和路径对上\n    for (const f of javaFiles) {",
    `    // 写源码前先修被截断的括号（AI 长回答常被截断）
    let repairedBraces = 0;
    let repairedParens = 0;
    const repaired = javaFiles.map((f) => {
      const r = repairJavaSource(f.content);
      repairedBraces += r.addedBraces;
      repairedParens += r.addedParens;
      return { ...f, content: r.code };
    });
    javaFiles.length = 0;
    javaFiles.push(...repaired);

    // 写源码：文件名叫什么不重要，但 package 要和路径对上
    for (const f of javaFiles) {`
  );

  // 3) 成功时把"补了几个括号"带回去
  t = t.replace(
    '    return { ok: true, apk: outApk, bytes, title };',
    '    return {\n      ok: true,\n      apk: outApk,\n      bytes,\n      title,\n      repaired: repairedBraces + repairedParens > 0 ? { braces: repairedBraces, parens: repairedParens } : null,\n    };'
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('已加入括号自动补全:', t.includes('repairJavaSource'), '| 回报字段:', t.includes('repaired:'));
