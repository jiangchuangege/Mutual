// 把 Cube Pets（Kenney, CC0）的 24 只宠物内联成 TS 模块
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve('tmp/assets/cube-pets/Previews');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const sprites = {};
const sizes = {};
for (const f of files) {
  const key = f.replace('animal-', '').replace('.png', '');
  const buf = fs.readFileSync(path.join(dir, f));
  sprites[key] = 'data:image/png;base64,' + buf.toString('base64');
  sizes[key] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
const total = Object.values(sprites).reduce((a, s) => a + s.length, 0);
console.log('物种:', Object.keys(sprites).join(','));
console.log('总 base64', (total / 1024).toFixed(0) + 'KB', '尺寸', JSON.stringify(sizes).slice(0, 120));

const out = `/**
 * Kenney《Cube Pets》（CC0，可商用/修改）—— 24 只宠物的渲染图，带透明通道。
 *
 * 素材来自 kenney.nl，由 tools/build-sprites3.cjs 内联成 data URI。
 * 毛色变体在运行时用 ctx.filter 色相旋转生成，一只精灵出 5 种毛色。
 */
export const ANIMAL_SPRITES: Record<string, string> = {
${Object.entries(sprites).map(([k, v]) => `  ${k}: '${v}',`).join('\n')}
};

export const ANIMAL_SPRITE_SPECIES = ${JSON.stringify(Object.keys(sprites))} as const;
`;
fs.writeFileSync(path.resolve('src/core/farmSprites.ts'), out, 'utf8');
console.log('写入 src/core/farmSprites.ts', (out.length / 1024).toFixed(0) + 'KB');
