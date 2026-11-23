// 单个动物 PNG → 检查有没有 tRNS（透明），顺便生成逐个小图的 TS 模块
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve('tmp/assets/animal-pack-remastered/PNG/Square');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && f !== 'Thumbs.db').sort();

function chunks(buf) {
  let off = 8;
  const out = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    out.push({ type, len });
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

const report = [];
const sprites = {};
for (const f of files) {
  const key = f.replace('.png', '');
  const buf = fs.readFileSync(path.join(dir, f));
  const cs = chunks(buf);
  const hasAlpha = cs.some((c) => c.type === 'tRNS') || buf[25] === 6 || buf[25] === 4;
  report.push(key + (hasAlpha ? ' ✓alpha' : ' ✗无透明'));
  sprites[key] = 'data:image/png;base64,' + buf.toString('base64');
}
console.log(report.join('  '));
console.log('总大小', (Object.values(sprites).reduce((a, s) => a + s.length, 0) / 1024).toFixed(0) + 'KB (base64)');

const out = `/**
 * Kenney《Animal Pack Remastered》单个精灵（CC0，可商用/修改）。
 *
 * 每只动物一张带透明通道的 PNG，内联成 data URI；不同毛色用 ctx.filter 色相旋转。
 * 由 tools/build-sprites2.cjs 生成。
 */
export const ANIMAL_SPRITES: Record<string, string> = {
${Object.entries(sprites).map(([k, v]) => `  ${k}: '${v}',`).join('\n')}
};

export const ANIMAL_SPECIES = ${JSON.stringify(Object.keys(sprites))} as const;
`;
fs.writeFileSync(path.resolve('src/core/farmSprites.ts'), out, 'utf8');
console.log('写入 src/core/farmSprites.ts', (out.length / 1024).toFixed(0) + 'KB');
