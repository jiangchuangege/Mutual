// 把 Kenney《Furniture Kit》的等距渲染图（CC0）内联成 TS 模块
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve('tmp/assets/furniture-kit/Isometric');
const available = fs.readdirSync(dir).filter((f) => f.endsWith('_SE.png'));

const WANT = [
  ['bedDouble', '双人床'],
  ['bedSingle', '单人床'],
  ['bedBunk', '上下铺'],
  ['benchCushion', '布艺沙发'],
  ['benchCushionLow', '矮沙发'],
  ['bench', '长条凳'],
  ['chairModernCushion', '现代椅'],
  ['chairRounded', '圆背椅'],
  ['chairDesk', '办公椅'],
  ['chairCushion', '软垫椅'],
  ['table', '餐桌'],
  ['tableCoffee', '茶几'],
  ['tableGlass', '玻璃桌'],
  ['desk', '书桌'],
  ['lampRoundFloor', '落地灯'],
  ['lampRoundTable', '台灯'],
  ['lampSquareFloor', '方灯'],
  ['plantSmall1', '小盆栽'],
  ['plantSmall2', '小绿植'],
  ['plantSmall3', '多肉'],
  ['cactus', '仙人掌'],
  ['bookcaseOpen', '书架'],
  ['bookcaseClosed', '书柜'],
  ['books', '书堆'],
  ['rugRectangle', '方地毯'],
  ['rugRounded', '圆地毯'],
  ['televisionModern', '现代电视'],
  ['televisionVintage', '复古电视'],
  ['cabinetTelevision', '电视柜'],
  ['kitchenBar', '吧台'],
  ['kitchenFridge', '冰箱'],
  ['kitchenStove', '灶台'],
  ['kitchenSink', '水槽'],
  ['kitchenMicrowave', '微波炉'],
  ['kitchenCoffeeMachine', '咖啡机'],
  ['bathtub', '浴缸'],
  ['bathroomSink', '洗手台'],
  ['bear', '毛绒熊'],
  ['coatRackStanding', '衣帽架'],
  ['cardboardBoxClosed', '纸箱'],
  ['computerScreen', '电脑'],
  ['doorway', '门框'],
];

const sprites = {};
const meta = [];
const missing = [];
for (const [key, cn] of WANT) {
  const f = key + '_SE.png';
  if (!available.includes(f)) { missing.push(key); continue; }
  const buf = fs.readFileSync(path.join(dir, f));
  sprites[key] = 'data:image/png;base64,' + buf.toString('base64');
  meta.push({ k: key, n: cn });
}
if (missing.length) console.log('缺的素材:', missing.join(', '), '\n可用里含 table 的:', available.filter((f) => f.startsWith('table')).join(', '));
const total = Object.values(sprites).reduce((a, s) => a + s.length, 0);
console.log('内联家具', meta.length, '件，base64', (total / 1024).toFixed(0) + 'KB');

const out = `/**
 * Kenney《Furniture Kit》等距渲染图（CC0，可商用/修改）。
 *
 * 每件家具一张带透明的 PNG，运行时按"景深"缩放摆在小屋里；
 * 不同配色用 ctx.filter 的色相/明度微调生成。
 * 素材来自 kenney.nl，由 tools/build-furniture.cjs 生成。
 */
export const FURNITURE_SPRITES: Record<string, string> = {
${Object.entries(sprites).map(([k, v]) => `  ${k}: '${v}',`).join('\n')}
};

/** 家具清单（key -> 中文名） */
export const FURNITURE_META: { k: string; n: string }[] = ${JSON.stringify(meta)};
`;
fs.writeFileSync(path.resolve('src/core/farmFurniture.ts'), out, 'utf8');
console.log('写入 src/core/farmFurniture.ts', (out.length / 1024).toFixed(0) + 'KB');
