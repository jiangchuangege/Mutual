const fs = require('node:fs');

// 1) 读取已下载的 Kenney 动物图集 + 坐标表，生成 TS 常量
const png = fs.readFileSync('C:/ts/tmp/art/animals.png').toString('base64');
const xml = fs.readFileSync('C:/ts/tmp/art/animals.xml', 'utf8');
const rects = {};
const re = /<SubTexture name="([^"]+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g;
let m;
while ((m = re.exec(xml))) {
  rects[m[1].replace('.png', '')] = [+m[2], +m[3], +m[4], +m[5]];
}
const keep = ['chicken', 'cow', 'pig', 'sheep', 'bee', 'cat', 'dog', 'duck', 'rabbit'];
const atlas = {};
for (const k of keep) if (rects[k]) atlas[k] = rects[k];
console.log('可用动物:', Object.keys(atlas).join(', ') || '(无)');

const ts = `/**
 * 农场素材（真实美术，CC0 授权）。
 *
 * 来源：Kenney《Animal Pack Redux》——CC0（公共领域），可自由商用/修改。
 * 通过 api.github.com 取回（raw.githubusercontent.com 在本机被墙），
 * 拼成 data URI 内联，保证"单文件 HTML 粘进游戏库就能跑"，不依赖任何外部地址。
 */
export const FARM_ANIMAL_SHEET =
  'data:image/png;base64,${png}';

/** 图集坐标：name -> [x, y, w, h] */
export const FARM_ANIMALS: Record<string, [number, number, number, number]> = ${JSON.stringify(atlas)};
`;
fs.writeFileSync('C:/ts/src/core/farmArt.ts', ts, 'utf8');
console.log('farmArt.ts 已生成:', Math.round(fs.statSync('C:/ts/src/core/farmArt.ts').size / 1024), 'KB');
