// 量测精灵条：帧尺寸 + 第 0 帧不透明包围盒（用于对脚/缩放）
const path = require('node:path');
const { decodePngFile } = require('./png-reader.cjs');

const ROOT = 'C:/Users/Jiao/Downloads/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets';
const list = [
  ['h_walk', 'Characters/Human/WALKING/base_walk_strip8.png', 8],
  ['h_idle', 'Characters/Human/IDLE/base_idle_strip9.png', 9],
  ['h_dig', 'Characters/Human/DIG/base_dig_strip13.png', 13],
  ['h_axe', 'Characters/Human/AXE/base_axe_strip10.png', 10],
  ['gob_walk', 'Characters/Goblin/PNG/spr_walk_strip8.png', 8],
  ['skel_walk', 'Characters/Skeleton/PNG/skeleton_walk_strip8.png', 8],
  ['animal_cow', 'Elements/Animals/spr_deco_cow_strip4.png', 4],
  ['animal_chicken_01', 'Elements/Animals/spr_deco_chicken_01_strip4.png', 4],
  ['plant_tree_01', 'Elements/Plants/spr_deco_tree_01_strip4.png', 4],
  ['crop_carrot_5', 'Elements/Crops/carrot_05.png', 1],
  ['crop_pumpkin_5', 'Elements/Crops/pumpkin_05.png', 1],
  ['vfx_glint1', 'Elements/VFX/Glint/spr_deco_glint_01_strip6.png', 6],
  ['other_windmill', 'Elements/Other/spr_deco_windmill_strip9.png', 9],
  ['vfx_smoke', 'Elements/VFX/Chimney Smoke/chimneysmoke_01_strip30.png', 30],
];

for (const [key, rel, frames] of list) {
  const png = decodePngFile(path.join(ROOT, rel));
  const fw = Math.round(png.w / frames);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < png.h; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      const d = (y * png.w + x) * 4;
      if (png.data[d + 3] < 40) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  console.log(key.padEnd(20), 'sheet ' + png.w + 'x' + png.h, 'frame ' + fw + 'x' + png.h,
    'bbox x' + x0 + '..' + x1 + ' y' + y0 + '..' + y1,
    '内容 ' + (x1 - x0 + 1) + 'x' + (y1 - y0 + 1), '脚底距底 ' + (png.h - 1 - y1));
}
