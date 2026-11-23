// 把 Kenney 动物图集内联成 TS 模块（CC0）
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve('tmp/assets/animal-pack-remastered/Spritesheet');
const png = fs.readFileSync(path.join(dir, 'square.png'));
const xml = fs.readFileSync(path.join(dir, 'square.xml'), 'utf8');

const rects = {};
for (const m of xml.matchAll(/<SubTexture name="([a-z]+)\.png" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)) {
  rects[m[1]] = [+m[2], +m[3], +m[4], +m[5]];
}
const names = Object.keys(rects);
console.log('图集里的动物:', names.join(', '));

const b64 = png.toString('base64');
const out = `/**
 * Kenney《Animal Pack Remastered》图集（CC0，可商用/修改）。
 *
 * 30 种动物，单一 128px 级别的方形精灵，运行时按品种色相旋转出不同毛色。
 * 素材来自 kenney.nl，构建前用 tools/build-sprites.cjs 内联成 data URI。
 */
export const ANIMAL_SHEET = 'data:image/png;base64,${b64}';

/** name -> [x, y, w, h] */
export const ANIMAL_RECTS: Record<string, [number, number, number, number]> = ${JSON.stringify(rects, null, 2)};

export const ANIMAL_SPECIES = ${JSON.stringify(names)} as const;
`;
const target = path.resolve('src/core/farmSprites.ts');
fs.writeFileSync(target, out, 'utf8');
console.log('写入', target, (out.length / 1024).toFixed(0) + 'KB');
