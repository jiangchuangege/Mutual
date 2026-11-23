const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

if (!t.includes('removeMethodBySignature')) {
  // 1) 加"整段删除某个方法"的工具（按括号配对，含前面的 @Override）
  t = t.replace(
    'export function rewriteCommonMistakes(src) {',
    `/** 删除源码里某个方法（按大括号配对），连它前面的 @Override 一起删 */
export function removeMethodBySignature(src, signatureRe) {
  const s = String(src ?? '');
  const m = signatureRe.exec(s);
  if (!m) return s;
  // 往前找到 @Override 行（如果紧邻）
  let start = m.index;
  const before = s.slice(0, start);
  const lines = before.split('\\n');
  if (lines.length >= 1 && /^\\s*@Override\\s*$/.test(lines[lines.length - 1] ?? '')) {
    start -= lines[lines.length - 1].length + 1;
  }
  // 从签名起找到方法体的第一个 {
  let i = m.index;
  while (i < s.length && s[i] !== '{') i += 1;
  if (i >= s.length) return s;
  let depth = 0;
  let end = i;
  for (; end < s.length; end += 1) {
    if (s[end] === '{') depth += 1;
    else if (s[end] === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return s.slice(0, start) + '/* 云编译：删除与 onDraw 冲突的重复方法 */\\n' + s.slice(end);
}

export function rewriteCommonMistakes(src) {`
  );

  // 2) 两个方法都在时：删掉 draw，而不是改名
  t = t.replace(
    `  if (/\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/.test(out)) {
    out = out.replace(/\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/g, 'void onDraw(Canvas');
    notes.push('draw(Canvas) → onDraw(Canvas)');
  }`,
    `  const hasDraw = /\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/.test(out);
  const hasOnDraw = /\\bvoid\\s+onDraw\\s*\\(\\s*Canvas\\b/.test(out);
  if (hasDraw && hasOnDraw) {
    // 两个都有 → 删掉多余的 draw，保留开发者写的 onDraw（改名会撞名）
    out = removeMethodBySignature(out, /\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/);
    notes.push('删除重复的 draw(Canvas)（已存在 onDraw）');
  } else if (hasDraw) {
    out = out.replace(/\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/g, 'void onDraw(Canvas');
    notes.push('draw(Canvas) → onDraw(Canvas)');
  }`
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('已加入"重复方法删除":', t.includes('removeMethodBySignature'), '| 双存在分支:', t.includes('两个都有'));
