const fs = require('node:fs');

// 1) 注册到内置样例（游戏库里自动出现）
let s = fs.readFileSync('C:/ts/src/core/gameSamples.ts', 'utf8');
if (!s.includes('FARM_GAME')) {
  s = s.replace("import { SANDBOX_GAME } from './gameSandbox';", "import { FARM_GAME } from './gameFarm';\nimport { SANDBOX_GAME } from './gameSandbox';");
  s = s.replace('export const SAMPLE_GAMES: GameSpec[] = [', 'export const SAMPLE_GAMES: GameSpec[] = [\n  FARM_GAME,');
  fs.writeFileSync('C:/ts/src/core/gameSamples.ts', s, 'utf8');
}

// 2) games.tsx：builtin === 'farm' 时用 buildFarmHtml() 现场拼（含 99KB 内联美术）
let g = fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8');
if (!g.includes('buildFarmHtml')) {
  g = g.replace(
    "import { buildVoxelHtml } from '../core/gameVoxel';",
    "import { buildFarmHtml } from '../core/gameFarm';\nimport { buildVoxelHtml } from '../core/gameVoxel';"
  );
  g = g.replace(
    `        source={
          game.assetPath
            ? localUri`,
    `        source={
          game.assetPath
            ? localUri`
  );
  // WebView 的 html 来源：farm 也要走这里
  g = g.replace(
    "                  game.builtin === 'voxel3d'\n                    ? buildVoxelHtml()\n                    : buildRuntimeHtml(game.code),",
    "                  game.builtin === 'voxel3d'\n                    ? buildVoxelHtml()\n                    : game.builtin === 'farm'\n                      ? buildFarmHtml()\n                      : buildRuntimeHtml(game.code),"
  );
  fs.writeFileSync('C:/ts/src/app/games.tsx', g, 'utf8');
}

// 3) 卡片图标
let g2 = fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8');
g2 = g2.replace(
  "<Text style={styles.tileEmoji}>{g.builtin === 'voxel3d' ? '🌍' : g.builtin ? '🎮' : '🧩'}</Text>",
  "<Text style={styles.tileEmoji}>{g.builtin === 'farm' ? '🌾' : g.builtin === 'voxel3d' ? '🌍' : g.builtin ? '🎮' : '🧩'}</Text>"
);
fs.writeFileSync('C:/ts/src/app/games.tsx', g2, 'utf8');

console.log('农场已注册:', {
  样例: fs.readFileSync('C:/ts/src/core/gameSamples.ts', 'utf8').includes('FARM_GAME'),
  渲染: fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8').includes('buildFarmHtml()'),
  图标: fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8').includes("'🌾'"),
});
