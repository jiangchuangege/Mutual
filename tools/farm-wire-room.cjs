const fs = require('node:fs');

// ---------- 1) 目录：装饰改成 Kenney 家具精灵 ----------
const cp = 'C:/ts/src/core/farmCatalog.ts';
let c = fs.readFileSync(cp, 'utf8');
c = c.replace(
  "export type CropFam =",
  "import { FURNITURE_META } from './farmFurniture';\n\nexport type CropFam =",
);
const s = c.indexOf('export type DecorCat');
const e = c.indexOf('/** 电视频道');
if (s < 0 || e < 0) throw new Error('没找到装饰段');
const decor = `export interface DecorDef {
  n: string;
  /** 家具精灵 key（Kenney Furniture Kit 渲染图） */
  f: string;
  /** 配色档 0-11 */
  t: number;
  /** 大件（床/柜/吧台）摆起来更大 */
  big: boolean;
  price: number;
}

/** 29 件家具 × 12 种配色 = 348 件装饰 */
export const DECOR_ITEMS: DecorDef[] = FURNITURE_META.flatMap((m, mi) =>
  Array.from({ length: 12 }, (_, t) => ({
    n: m.n + (t === 0 ? '' : '·' + (t + 1) + '号色'),
    f: m.k,
    t,
    big: /bed|bench|bookcase|kitchen|bath|desk|coatRack/i.test(m.k),
    price: 60 + mi * 12 + t * 26,
  })),
);

`;
c = c.slice(0, s) + decor + c.slice(e);
fs.writeFileSync(cp, c, 'utf8');
console.log('装饰目录 →', '家具精灵');

// ---------- 2) gameFarm：注入家具精灵 + 房间/小卖部脚本 ----------
const gp = 'C:/ts/src/core/gameFarm.ts';
let g = fs.readFileSync(gp, 'utf8');
if (!g.includes('FURNITURE_SPRITES')) {
  g = g.replace(
    "import { ANIMAL_SPRITES } from './farmSprites';",
    "import { FURNITURE_SPRITES } from './farmFurniture';\nimport { FARM_ROOM_SHOP_JS } from './farmRoomShop';\nimport { ANIMAL_SPRITES } from './farmSprites';",
  );
  g = g.replace(
    "'var ANIMAL_SPRITES=' + JSON.stringify(ANIMAL_SPRITES) + ';';",
    "'var ANIMAL_SPRITES=' + JSON.stringify(ANIMAL_SPRITES) + ';' +\n    'var FURNITURE_SPRITES=' + JSON.stringify(FURNITURE_SPRITES) + ';';",
  );
  g = g.replace(
    '${FARM_ENGINE2_JS}',
    '${FARM_ENGINE2_JS}\n${FARM_ROOM_SHOP_JS}',
  );
  fs.writeFileSync(gp, g, 'utf8');
  console.log('gameFarm 注入家具/房间脚本');
}
