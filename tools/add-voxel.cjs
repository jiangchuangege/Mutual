const fs = require('node:fs');

// 1) types：builtin 允许字符串（内置 3D 体素用 'voxel3d' 标记，代码运行时再拼）
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
t = t.replace('  builtin?: boolean;', '  /** true = 普通内置样例；"voxel3d" = 代码在运行时拼（含内联 three.js） */\n  builtin?: boolean | string;');
fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');

// 2) gameSamples：库里有三个样例
let s = fs.readFileSync('C:/ts/src/core/gameSamples.ts', 'utf8');
if (!s.includes('VOXEL_GAME')) {
  s = s.replace("import { SANDBOX_GAME } from './gameSandbox';", "import { SANDBOX_GAME } from './gameSandbox';\nimport { VOXEL_GAME } from './gameVoxel';");
  s = s.replace('export const SAMPLE_GAMES: GameSpec[] = [', 'export const SAMPLE_GAMES: GameSpec[] = [\n  VOXEL_GAME,');
  fs.writeFileSync('C:/ts/src/core/gameSamples.ts', s, 'utf8');
}

// 3) games.tsx：渲染时对 voxel3d 现场拼 HTML（WebView 复用同一路径）
let g = fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8');
if (!g.includes('buildVoxelHtml')) {
  g = g.replace(
    "import { SAMPLE_GAMES } from '../core/gameSamples';",
    "import { SAMPLE_GAMES } from '../core/gameSamples';\nimport { buildVoxelHtml } from '../core/gameVoxel';"
  );
  // GamePlayer 里取 HTML：内置 3D 体素的 code 是空的，改成现场构建
  g = g.replace(
    '        source={{ html: game.code }}',
    "        source={{ html: game.builtin === 'voxel3d' ? buildVoxelHtml() : game.code }}"
  );
  fs.writeFileSync('C:/ts/src/app/games.tsx', g, 'utf8');
  console.log('games.tsx 已接 voxel3d');
}

// 4) 卡片标记
let g2 = fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8');
g2 = g2.replace(
  "<Text style={styles.tileEmoji}>{g.builtin ? '🎮' : '🧩'}</Text>",
  "<Text style={styles.tileEmoji}>{g.builtin === 'voxel3d' ? '🌍' : g.builtin ? '🎮' : '🧩'}</Text>"
);
fs.writeFileSync('C:/ts/src/app/games.tsx', g2, 'utf8');

console.log('done:', {
  types: fs.readFileSync('C:/ts/src/core/types.ts', 'utf8').includes("builtin?: boolean | string"),
  samples: fs.readFileSync('C:/ts/src/core/gameSamples.ts', 'utf8').includes('VOXEL_GAME'),
  html: fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8').includes('buildVoxelHtml()'),
});
