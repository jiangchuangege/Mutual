// 把 Kenney food-kit / furniture-kit / cube-pets 的渲染图按"一个一个不重样"的方式内联
const fs = require('node:fs');
const path = require('node:path');

const FOOD = path.resolve('tmp/assets/food-kit/Previews');
const FURN = path.resolve('tmp/assets/furniture-kit/Isometric');
const dataUri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const has = (dir, f) => fs.existsSync(path.join(dir, f));

/* ---------- 作物：每一条都有自己的图 ---------- */
const CROPS = [
  ['strawberry', '草莓', 12], ['apple', '苹果', 16], ['banana', '香蕉', 14], ['avocado', '牛油果', 20],
  ['beet', '甜菜', 18], ['broccoli', '西兰花', 22], ['cabbage', '白菜', 24], ['carrot', '胡萝卜', 12],
  ['cauliflower', '花椰菜', 24], ['celery-stick', '芹菜', 16], ['cherries', '樱桃', 26], ['coconut', '椰子', 28],
  ['corn', '玉米', 26], ['eggplant', '茄子', 20], ['grapes', '葡萄', 30], ['leek', '大葱', 18],
  ['lemon', '柠檬', 16], ['mushroom', '蘑菇', 22], ['onion', '洋葱', 16], ['orange', '橙子', 20],
  ['paprika', '彩椒', 22], ['pear', '梨', 18], ['pepper', '辣椒', 14], ['pineapple', '菠萝', 34],
  ['pumpkin', '南瓜', 30], ['radish', '萝卜', 12], ['tomato', '番茄', 18], ['watermelon', '西瓜', 36],
];
const cropSprites = {};
const cropDefs = CROPS.filter(([k]) => has(FOOD, k + '.png')).map(([k, cn, g], i) => {
  cropSprites[k] = dataUri(path.join(FOOD, k + '.png'));
  return { n: cn, s: k, seed: 8 + i * 3, sell: 20 + i * 6, g };
});

/* ---------- 超市商品：每条也各有自己的图 ---------- */
const GOODS = [
  ['donut', '甜甜圈', '零食'], ['cookie', '曲奇饼', '零食'], ['cookie-chocolate', '巧克力曲奇', '零食'],
  ['chocolate', '巧克力', '零食'], ['candy-bar', '巧克力棒', '零食'], ['muffin', '玛芬', '零食'],
  ['cupcake', '纸杯蛋糕', '零食'], ['croissant', '可颂', '零食'], ['ginger-bread', '姜饼', '零食'],
  ['lollypop', '棒棒糖', '零食'], ['pudding', '布丁', '零食'], ['waffle', '华夫饼', '零食'],
  ['ice-cream', '冰淇淋', '零食'], ['ice-cream-cup', '桶装冰淇淋', '零食'], ['popsicle', '冰棒', '零食'],
  ['soda', '汽水', '饮料'], ['soda-can', '易拉罐', '饮料'], ['soda-glass', '汽水杯', '饮料'],
  ['cup-coffee', '咖啡', '饮料'], ['cup-tea', '奶茶', '饮料'], ['frappe', '星冰乐', '饮料'],
  ['cocktail', '鸡尾酒', '饮料'], ['glass-wine', '葡萄酒', '饮料'], ['bottle-oil', '食用油', '生鲜'],
  ['honey', '蜂蜜', '生鲜'], ['peanut-butter', '花生酱', '生鲜'], ['cheese', '奶酪', '生鲜'],
  ['bacon', '培根', '生鲜'], ['meat-raw', '生牛排', '生鲜'], ['meat-cooked', '熟肉', '生鲜'],
  ['sausage', '香肠', '生鲜'], ['whole-ham', '整只火腿', '生鲜'], ['bread', '面包', '生鲜'],
  ['loaf-baguette', '法棍', '生鲜'], ['rice-ball', '饭团', '生鲜'], ['salad', '沙拉', '生鲜'],
  ['burger', '汉堡', '生鲜'], ['sandwich', '三明治', '生鲜'], ['pizza', '披萨', '生鲜'],
  ['fries', '薯条', '生鲜'], ['taco', '塔可', '生鲜'], ['sushi-salmon', '三文鱼寿司', '生鲜'],
  ['maki-roe', '鱼籽卷', '生鲜'], ['pan', '平底锅', '日用'], ['pot', '汤锅', '日用'],
  ['frying-pan', '深煎锅', '日用'], ['cutting-board', '砧板', '日用'], ['cooking-knife', '厨刀', '日用'],
  ['rollingPin', '擀面杖', '日用'], ['whisk', '打蛋器', '日用'], ['utensil-fork', '餐叉', '日用'],
  ['cake-birthday', '生日蛋糕', '礼物'], ['cake', '奶油蛋糕', '礼物'], ['chocolate-wrapper', '心形巧克力', '礼物'],
  ['wine-red', '红酒', '礼物'], ['wine-white', '白葡萄酒', '礼物'], ['cup-saucer', '精致茶杯', '礼物'],
  ['bowl', '小碗', '宠物'], ['bag-flat', '零食袋', '宠物'], ['plate', '宠物餐盘', '宠物'],
  ['mug', '小杯子', '宠物'], ['can-small', '宠物罐头', '宠物'], ['bottle-ketchup', '酱料瓶', '宠物'],
];
const goodSprites = {};
const goodDefs = GOODS.filter(([k]) => has(FOOD, k + '.png')).map(([k, cn, cat], i) => {
  goodSprites[k] = dataUri(path.join(FOOD, k + '.png'));
  return { n: cn, s: k, c: cat, price: 8 + i * 3 + (cat === '礼物' ? 40 : 0) };
});

/* ---------- 家具：所有不重复的家具渲染 ---------- */
const EXTRA_CN = {
  bathroomCabinet: '浴室柜', bathroomCabinetDrawer: '浴室抽屉柜', bathroomMirror: '浴室镜',
  bathroomSink: '洗手台', bathroomSinkSquare: '方形洗手台', bathtub: '浴缸',
  bedBunk: '上下铺', bedDouble: '双人床', bedSingle: '单人床',
  bench: '长凳', benchCushion: '布艺沙发', benchCushionLow: '矮沙发',
  bookcaseClosed: '书柜', bookcaseClosedDoors: '带门书柜', bookcaseClosedWide: '宽书柜',
  bookcaseOpen: '开放书架', bookcaseOpenLow: '矮书架', books: '书堆', bear: '毛绒熊',
  cabinetBed: '床柜', cabinetBedDrawer: '床抽柜', cabinetBedDrawerTable: '床桌柜',
  cabinetTelevision: '电视柜', cabinetTelevisionDoors: '带门电视柜',
  cardboardBoxClosed: '纸箱', cardboardBoxOpen: '开口纸箱', ceilingFan: '吊扇',
  chair: '木椅', chairCushion: '软垫椅', chairDesk: '办公椅', chairModernCushion: '现代椅',
  chairModernFrameCushion: '框式现代椅', chairRounded: '圆背椅', coatRack: '挂衣架',
  coatRackStanding: '落地衣帽架', computerKeyboard: '键盘', computerScreen: '显示器',
  desk: '书桌', deskCorner: '转角桌', dryer: '烘干机', hoodLarge: '大抽油烟机', hoodModern: '现代油烟机',
  kitchenBar: '吧台', kitchenBarEnd: '吧台端柜', kitchenBlender: '榨汁机', kitchenCabinet: '橱柜',
  kitchenCabinetCornerInner: '内角橱柜', kitchenCabinetCornerRound: '圆角橱柜', kitchenCabinetDrawer: '抽屉橱柜',
  kitchenCabinetUpper: '吊柜', kitchenCabinetUpperCorner: '角吊柜', kitchenCabinetUpperDouble: '双门吊柜',
  kitchenCabinetUpperLow: '矮吊柜', kitchenCoffeeMachine: '咖啡机', kitchenFridge: '冰箱',
  kitchenFridgeBuiltIn: '嵌入式冰箱', kitchenFridgeLarge: '大冰箱', kitchenFridgeSmall: '小冰箱',
  kitchenMicrowave: '微波炉', kitchenSink: '水槽', kitchenStove: '灶台', kitchenStoveElectric: '电灶',
  lampRoundFloor: '落地灯', stoolBar: '吧椅', table: '餐桌', tableCloth: '铺布餐桌',
  televisionModern: '现代电视', televisionVintage: '复古电视', trashcan: '垃圾桶',
  wall: '墙面装饰', window: '窗户',
};
const furnSprites = {};
const furnDefs = [];
const seen = new Set();
for (const f of fs.readdirSync(FURN).filter((x) => x.endsWith('_SE.png'))) {
  const key = f.replace('_SE.png', '');
  if (seen.has(key)) continue;
  seen.add(key);
  if (/^floor|^doorway|^wall$|^window$/.test(key)) continue;
  const cn = EXTRA_CN[key];
  if (!cn) continue;
  furnSprites[key] = dataUri(path.join(FURN, f));
  furnDefs.push({ k: key, n: cn, big: /bed|bench|bookcase|kitchen|bath|cabinet|desk|coatRack|television|hood|stove/i.test(key) });
}

console.log('作物', cropDefs.length, '商品', goodDefs.length, '家具', furnDefs.length);
const kb = (o) => (Object.values(o).reduce((a, v) => a + v.length, 0) / 1024).toFixed(0) + 'KB';
console.log('base64 体积 作物', kb(cropSprites), '商品', kb(goodSprites), '家具', kb(furnSprites));

const write = (file, body) => {
  fs.writeFileSync(path.resolve('src/core/' + file), body, 'utf8');
  console.log('写入', file, (body.length / 1024).toFixed(0) + 'KB');
};

write('farmCropSprites.ts', `/**
 * 作物精灵：Kenney《Food Kit》渲染图（CC0，可商用/修改），一条作物一张图，不重样。
 * 由 tools/build-art.cjs 生成。
 */
export const CROP_SPRITES: Record<string, string> = {
${Object.entries(cropSprites).map(([k, v]) => `  ${JSON.stringify(k)}: '${v}',`).join('\n')}
};
`);

write('farmGoodSprites.ts', `/**
 * 超市商品精灵：Kenney《Food Kit》渲染图（CC0），一件商品一张图。
 * 由 tools/build-art.cjs 生成。
 */
export const GOOD_SPRITES: Record<string, string> = {
${Object.entries(goodSprites).map(([k, v]) => `  ${JSON.stringify(k)}: '${v}',`).join('\n')}
};
`);

write('farmFurniture.ts', `/**
 * 家具精灵：Kenney《Furniture Kit》等距渲染图（CC0），一件家具一张图。
 * 由 tools/build-art.cjs 生成。
 */
export const FURNITURE_SPRITES: Record<string, string> = {
${Object.entries(furnSprites).map(([k, v]) => `  ${JSON.stringify(k)}: '${v}',`).join('\n')}
};

/** 家具清单（key -> 中文名 / 是否大件） */
export const FURNITURE_META: { k: string; n: string; big: boolean }[] = ${JSON.stringify(furnDefs)};
`);

// 数据清单（给 catalog 用）
write('farmArtData.ts', `/** 由 tools/build-art.cjs 生成：作物 / 商品 / 家具 的清单（美术一一对应） */
export interface CropArtDef { n: string; s: string; seed: number; sell: number; g: number }
export interface GoodArtDef { n: string; s: string; c: string; price: number }
export interface FurnArtDef { k: string; n: string; big: boolean }

export const CROP_DEFS: CropArtDef[] = ${JSON.stringify(cropDefs)};
export const GOOD_DEFS: GoodArtDef[] = ${JSON.stringify(goodDefs)};
`);
