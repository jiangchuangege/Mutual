// 找出“干净”的草地块（颜色种类少=没有杂草装饰），并量测 soil 精灵
const path = require('node:path');
const { decodePngFile } = require('./png-reader.cjs');

const ROOT = 'C:/Users/Jiao/Downloads/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets';
const sheet = decodePngFile(path.join(ROOT, 'Tileset/spr_tileset_sunnysideworld_16px.png'));

function stats(cx, cy) {
  const set = new Set();
  let n = 0;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const d = ((cy * 16 + y) * sheet.w + (cx * 16 + x)) * 4;
      if (sheet.data[d + 3] < 40) continue;
      n += 1;
      set.add(sheet.data[d] + ',' + sheet.data[d + 1] + ',' + sheet.data[d + 2]);
    }
  }
  return { colors: set.size, cover: n / 256 };
}

const greens = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [13, 4], [14, 4],
  [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [13, 5], [14, 5],
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [13, 6], [14, 6]];
console.log('草地块（颜色种类 少=干净）:');
const ok = [];
for (const [cx, cy] of greens) {
  const s = stats(cx, cy);
  const tag = s.colors <= 3 ? '★干净' : s.colors <= 6 ? '有点' : '花哨';
  console.log('(' + cx + ',' + cy + ') 颜色' + s.colors + ' 覆盖' + s.cover.toFixed(2) + ' ' + tag);
  if (s.colors <= 5 && s.cover > 0.99) ok.push('(' + cx + ',' + cy + ')');
}
console.log('可用于纯草地: ' + ok.join(' '));

for (const f of ['soil_00', 'soil_01', 'soil_03', 'soil_04', 'rock', 'wood', 'seeds_generic', 'egg', 'milk', 'fish', 'crate_base', 'crate_top']) {
  const p = decodePngFile(path.join(ROOT, 'Elements/Crops/' + f + '.png'));
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) {
    if (p.data[(y * p.w + x) * 4 + 3] < 40) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  console.log(f.padEnd(14), p.w + 'x' + p.h, 'bbox', x0 + '..' + x1, y0 + '..' + y1);
}
for (const f of ['Other/spr_deco_coracle_land.png', 'Other/spr_deco_coracle_strip4.png', 'Animals/spr_deco_blinking_strip12.png']) {
  const p = decodePngFile(path.join(ROOT, 'Elements/' + f));
  console.log(f, p.w + 'x' + p.h);
}
