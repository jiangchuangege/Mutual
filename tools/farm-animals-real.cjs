const fs = require('node:fs');
const p = 'C:/ts/src/core/farmCatalog.ts';
let t = fs.readFileSync(p, 'utf8');

const start = t.indexOf('export type AnimalKind');
const end = t.indexOf('export type GoodCat');
if (start < 0 || end < 0) throw new Error('找不到动物段落');

const animals = `export type AnimalKind =
  | 'chicken' | 'chick' | 'cow' | 'pig' | 'rabbit' | 'duck' | 'goat' | 'horse' | 'buffalo'
  | 'dog' | 'panda' | 'moose' | 'bear' | 'elephant' | 'giraffe' | 'gorilla' | 'hippo'
  | 'rhino' | 'zebra' | 'monkey' | 'crocodile' | 'frog' | 'owl' | 'parrot' | 'penguin'
  | 'sloth' | 'snake' | 'walrus' | 'whale' | 'narwhal';

export interface AnimalDef {
  n: string;
  k: AnimalKind;
  /** 毛色变体 0-3（用色相旋转做） */
  v: number;
  cost: number;
  sell: number;
  /** 产出物名字（进畜栏才有） */
  out?: string;
  /** 产出价值 */
  outVal?: number;
  /** 一次产出需要秒数 */
  every?: number;
}

/** 物种表：精灵名 + 中文品种（4 个毛色变体）+ 产出 */
const ANIMAL_SPECIES: { k: AnimalKind; base: number; out?: string; every?: number; names: string[] }[] = [
  { k: 'chicken', base: 60, out: '鸡蛋', every: 20, names: ['小鸡', '芦花鸡', '乌鸡', '白羽鸡'] },
  { k: 'chick', base: 40, out: '鸡蛋', every: 18, names: ['小鸡仔', '黄毛鸡仔', '白鸡仔', '花鸡仔'] },
  { k: 'cow', base: 260, out: '牛奶', every: 34, names: ['奶牛', '黄牛', '花牛', '白牛'] },
  { k: 'buffalo', base: 300, out: '水牛奶', every: 38, names: ['水牛', '黑水牛', '灰水牛', '白水牛'] },
  { k: 'pig', base: 180, out: '松露', every: 40, names: ['小花猪', '黑猪', '香猪', '野猪'] },
  { k: 'rabbit', base: 90, out: '兔毛', every: 22, names: ['白兔', '灰兔', '垂耳兔', '侏儒兔'] },
  { k: 'duck', base: 80, out: '鸭蛋', every: 22, names: ['鸭子', '鸳鸯', '绿头鸭', '柯尔鸭'] },
  { k: 'goat', base: 200, out: '羊奶', every: 30, names: ['山羊', '绵羊', '绒山羊', '黑山羊'] },
  { k: 'horse', base: 460, out: '马毛', every: 46, names: ['小马', '白马', '棕马', '矮马'] },
  { k: 'dog', base: 300, names: ['柴犬', '柯基', '哈士奇', '金毛'] },
  { k: 'panda', base: 900, names: ['熊猫', '小熊猫', '棕熊猫', '秦岭熊猫'] },
  { k: 'moose', base: 520, names: ['麋鹿', '梅花鹿', '驯鹿', '白唇鹿'] },
  { k: 'bear', base: 480, names: ['小熊', '棕熊', '白熊', '黑熊'] },
  { k: 'elephant', base: 780, names: ['大象', '亚洲象', '非洲象', '小象'] },
  { k: 'giraffe', base: 820, names: ['长颈鹿', '小长颈鹿', '斑点长颈鹿', '白长颈鹿'] },
  { k: 'gorilla', base: 700, names: ['大猩猩', '黑猩猩', '银背猩猩', '小猩猩'] },
  { k: 'hippo', base: 660, names: ['河马', '小荷马', '灰河马', '粉河马'] },
  { k: 'rhino', base: 720, names: ['犀牛', '白犀牛', '黑犀牛', '小犀牛'] },
  { k: 'zebra', base: 600, names: ['斑马', '小斑马', '白斑马', '细纹斑马'] },
  { k: 'monkey', base: 380, names: ['猴子', '金丝猴', '猕猴', '小猴'] },
  { k: 'crocodile', base: 560, names: ['鳄鱼', '小鳄鱼', '湾鳄', '短吻鳄'] },
  { k: 'frog', base: 120, names: ['青蛙', '树蛙', '金蛙', '小青蛙'] },
  { k: 'owl', base: 240, names: ['猫头鹰', '雪鸮', '仓鸮', '小鸮'] },
  { k: 'parrot', base: 320, names: ['鹦鹉', '金刚鹦鹉', '玄凤鹦鹉', '虎皮鹦鹉'] },
  { k: 'penguin', base: 420, names: ['企鹅', '帝企鹅', '小蓝企鹅', '跳岩企鹅'] },
  { k: 'sloth', base: 340, names: ['树懒', '小树懒', '褐树懒', '三趾树懒'] },
  { k: 'snake', base: 300, names: ['小蛇', '玉米蛇', '球蟒', '翠青蛇'] },
  { k: 'walrus', base: 880, names: ['海象', '小海象', '白海象', '灰海象'] },
  { k: 'whale', base: 950, names: ['小鲸', '蓝鲸', '虎鲸', '抹香鲸'] },
  { k: 'narwhal', base: 980, names: ['独角鲸', '小白鲸', '斑海豹', '海豚'] },
];

export const FARM_ANIMALS: AnimalDef[] = ANIMAL_SPECIES.flatMap((s) =>
  s.names.map((n, i) => ({
    n,
    k: s.k,
    v: i % 4,
    cost: Math.round(s.base * (1 + i * 0.22)),
    sell: Math.round(s.base * 0.6 * (1 + i * 0.22)),
    ...(s.out
      ? { out: i === 0 ? s.out : s.out + '·' + n, outVal: Math.round(12 + i * 8 + s.base * 0.05), every: s.every }
      : {}),
  })),
);

`;

t = t.slice(0, start) + animals + t.slice(end);
fs.writeFileSync(p, t, 'utf8');
console.log('动物目录已换成 30 种真实精灵 × 4 毛色');
