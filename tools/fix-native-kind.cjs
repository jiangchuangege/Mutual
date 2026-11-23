const fs = require('node:fs');

// 1) gameKind.ts：GameKind 增加 native
let g = fs.readFileSync('C:/ts/src/core/gameKind.ts', 'utf8');
g = g.replace("export type GameKind = 'html' | 'link' | 'source';", "export type GameKind = 'html' | 'link' | 'source' | 'native';");
g = g.replace(
  "  if (kind === 'html') return 'HTML 游戏：在 App 里直接打开（可联机）';",
  "  if (kind === 'html') return 'HTML 游戏：在 App 里直接打开（可联机）';\n  if (kind === 'native') return '原生游戏：点卡片下载后交给系统安装（独立 App）';"
);
g = g.replace(
  "  if (kind === 'html') return 'HTML';",
  "  if (kind === 'html') return 'HTML';\n  if (kind === 'native') return '原生';"
);
g = g.replace(
  "export function describeKind(kind: GameKind): string {",
  "export function describeKind(kind: GameKind | 'native'): string {"
);
fs.writeFileSync('C:/ts/src/core/gameKind.ts', g, 'utf8');

// 2) hub.addGameAsset：kind 允许 native
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace(
  "    input: { title: string; assetPath: string; players?: 1 | 2; kind?: 'html' | 'link' | 'source' },",
  "    input: {\n      title: string;\n      assetPath: string;\n      players?: 1 | 2;\n      kind?: 'html' | 'link' | 'source' | 'native';\n    },"
);
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');
console.log('gameKind/hub 已支持 native');
