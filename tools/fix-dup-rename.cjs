const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

// 换成"改名 + 去掉 @Override"的稳妥做法
const oldBlock = `  if (hasDraw && hasOnDraw) {
    // 两个都有 → 删掉多余的 draw，保留开发者写的 onDraw（改名会撞名）
    out = removeMethodBySignature(out, /\\bvoid\\s+draw\\s*\\(\\s*Canvas\\b/);
    notes.push('删除重复的 draw(Canvas)（已存在 onDraw）');
  } else if (hasDraw) {`;
const newBlock = `  if (hasDraw && hasOnDraw) {
    // 两个都有 → 把多余的 draw 改名并去掉 @Override。
    // 用改名而不是删除：不碰大括号配对，绝不会切坏别的代码。
    out = out.replace(
      /@Override\\s*((?:protected|public|private)\\s+)?void\\s+draw\\s*\\(\\s*Canvas/g,
      (_m, mod) => \`\${mod ?? ''}void drawUnusedByCloudBuild(Canvas\`
    );
    out = out.replace(
      /((?:protected|public|private)\\s+)?void\\s+draw\\s*\\(\\s*Canvas/g,
      (_m, mod) => \`\${mod ?? ''}void drawUnusedByCloudBuild(Canvas\`
    );
    notes.push('多余的 draw(Canvas) 已改名（保留你写的 onDraw）');
  } else if (hasDraw) {`;
if (!t.includes(oldBlock)) throw new Error('双存在分支没找到');
t = t.replace(oldBlock, newBlock);
fs.writeFileSync(p, t, 'utf8');
console.log('改为改名策略:', t.includes('drawUnusedByCloudBuild'));
