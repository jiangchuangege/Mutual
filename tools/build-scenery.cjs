// 外景素材：Kenney《Nature Kit》侧视渲染 + 《Fantasy Town Kit》建筑/摊位（都是 CC0）
const fs = require('node:fs');
const path = require('node:path');

const NAT = path.resolve('tmp/assets/nature-kit/Side');
const TOWN = path.resolve('tmp/assets/fantasy-town-kit/Previews');
const uri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

const PICK = [
  // 树
  ['tree_oak', NAT, '橡树'], ['tree_default', NAT, '大树'], ['tree_pineTallA', NAT, '松树'],
  ['tree_small', NAT, '小树'], ['tree_thin', NAT, '细树'], ['tree_palmDetailedTall', NAT, '棕榈'],
  ['tree_cone', NAT, '锥形树'], ['tree_blocks', NAT, '方块树'],
  // 灌木 / 草
  ['plant_bush', NAT, '灌木'], ['plant_bushLarge', NAT, '大灌木'], ['plant_flatShort', NAT, '矮草丛'],
  ['grass', NAT, '草簇'], ['grass_large', NAT, '大草簇'], ['grass_leafsLarge', NAT, '长草丛'],
  // 石头 / 木
  ['rock_largeA', NAT, '大石头'], ['rock_smallA', NAT, '小石头'], ['rock_tallA', NAT, '立石'],
  ['stone_largeA', NAT, '石块'], ['log', NAT, '木头'], ['stump_round', NAT, '树墩'], ['sign', NAT, '木牌'],
  // 花
  ['flower_redA', NAT, '红花'], ['flower_yellowA', NAT, '黄花'], ['flower_purpleA', NAT, '紫花'],
  // 栅栏
  ['fence_simple', NAT, '木栅栏'], ['fence_planks', NAT, '板栅栏'], ['fence_simpleHigh', NAT, '高栅栏'],
  // 建筑（小屋 = 墙 + 屋顶 + 门 + 窗 拼出来）
  ['wall-wood', TOWN, '木墙'], ['roof-gable', TOWN, '人字屋顶'], ['wall-wood-door', TOWN, '木门'],
  ['wall-wood-window-shutters', TOWN, '百叶窗'], ['chimney', TOWN, '烟囱'],
  // 摊位 / 小卖部
  ['stall-red', TOWN, '红棚摊位'], ['stall', TOWN, '木摊位'],
  // 点缀
  ['windmill', TOWN, '风车'], ['lantern', TOWN, '路灯'], ['fountain-round', TOWN, '喷泉'],
  ['cart', TOWN, '手推车'], ['banner-red', TOWN, '红横幅'], ['hedge-large', TOWN, '绿篱'],
];

const sprites = {};
const meta = [];
const missing = [];
for (const [key, dir, cn] of PICK) {
  const f = path.join(dir, key + '.png');
  if (!fs.existsSync(f)) { missing.push(key); continue; }
  sprites[key] = uri(f);
  meta.push({ k: key, n: cn });
}
if (missing.length) console.log('缺:', missing.join(', '));
console.log('外景素材', meta.length, '张，base64', (Object.values(sprites).reduce((a, v) => a + v.length, 0) / 1024).toFixed(0) + 'KB');

const out = `/**
 * 农场外景素材：Kenney《Nature Kit》侧视渲染 + 《Fantasy Town Kit》建筑/摊位
 * （CC0，可商用/修改）。来源 kenney.nl，由 tools/build-scenery.cjs 生成。
 */
export const SCENERY_SPRITES: Record<string, string> = {
${Object.entries(sprites).map(([k, v]) => `  ${JSON.stringify(k)}: '${v}',`).join('\n')}
};
`;
fs.writeFileSync(path.resolve('src/core/farmScenery.ts'), out, 'utf8');
console.log('写入 src/core/farmScenery.ts', (out.length / 1024).toFixed(0) + 'KB');
