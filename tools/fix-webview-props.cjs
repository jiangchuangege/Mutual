const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');
// 去掉我这次重复加的两行（前面 689/690 已经有）
const dup = `        // 游戏要用 localStorage 存自己的世界存档，必须打开
        domStorageEnabled
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs`;
const fix = `        // 游戏要用 localStorage 存自己的世界存档，必须打开
        domStorageEnabled`;
if (!t.includes(dup)) throw new Error('找不到重复块');
t = t.replace(dup, fix);
fs.writeFileSync(p, t, 'utf8');
console.log('去掉重复的 WebView 属性');

// 现在补 baseUrl（源串和我预想的不同，用真实片段替换）
const from = `            : {
                html:
                  game.builtin === 'voxel3d'
                    ? buildVoxelHtml()
                    : game.builtin === 'farm'
                      ? buildFarmHtml(role)
                      : buildRuntimeHtml(game.code),
              }`;
if (t.includes(from)) {
  t = t.replace(
    from,
    `            : {
                html:
                  game.builtin === 'voxel3d'
                    ? buildVoxelHtml()
                    : game.builtin === 'farm'
                      ? buildFarmHtml(role)
                      : buildRuntimeHtml(game.code),
                // 假 https 来源：localStorage 才能用（游戏自己存世界存档），跨域也更宽松
                baseUrl: 'https://game.mutual.local/',
              }`,
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log('baseUrl 已加');
} else {
  console.log('baseUrl 位置没匹配到，稍后手动看');
}
