const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');
const before = "game.assetPath || game.builtin === 'voxel3d' || !needsNetwork(game.code)";
const after = "game.assetPath || game.builtin === 'voxel3d' || game.builtin === 'farm' || !needsNetwork(game.code)";
if (t.includes(before)) {
  t = t.replace(before, after);
  fs.writeFileSync(p, t, 'utf8');
  console.log('农场已允许联网（MQTT / wss 需要）');
} else {
  console.log('未找到原文，当前白名单行:', t.split('\n').filter((l) => l.includes('originWhitelist')).join(' | '));
}
