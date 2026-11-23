const fs = require('node:fs');
const p = 'C:/ts/src/core/gameSamples.ts';
let t = fs.readFileSync(p, 'utf8');
t = t.replace("import { VOXEL_GAME } from './gameVoxel';\n", '');
t = t.replace('  VOXEL_GAME,\n', '');
fs.writeFileSync(p, t, 'utf8');
console.log('3D 沙盒已移除:', !t.includes('VOXEL_GAME'));
console.log(t.slice(0, 220));
