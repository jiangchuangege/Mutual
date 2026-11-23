const fs = require('node:fs');

// 1) 目录：24 个物种 × 5 个品种名 = 120 只
const cp = 'C:/ts/src/core/farmCatalog.ts';
let c = fs.readFileSync(cp, 'utf8');
const s1 = c.indexOf('export type AnimalKind');
const e1 = c.indexOf('export type GoodCat');
if (s1 < 0 || e1 < 0) throw new Error('没找到动物段');
const block = `export type AnimalKind =
  | 'chick' | 'cow' | 'pig' | 'hog' | 'bunny' | 'cat' | 'dog' | 'fox' | 'deer' | 'polar'
  | 'koala' | 'panda' | 'lion' | 'tiger' | 'monkey' | 'elephant' | 'giraffe' | 'penguin'
  | 'parrot' | 'fish' | 'crab' | 'beaver' | 'bee' | 'caterpillar';

export interface AnimalDef {
  n: string;
  k: AnimalKind;
  /** 毛色变体 0-4（色相旋转） */
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

/** 24 个物种（Kenney Cube Pets 真实美术），每个 5 个品种/毛色 */
const ANIMAL_SPECIES: { k: AnimalKind; base: number; out?: string; every?: number; names: string[] }[] = [
  { k: 'chick', base: 60, out: '鸡蛋', every: 20, names: ['小鸡', '黄毛鸡仔', '白羽鸡', '花鸡仔', '乌骨鸡'] },
  { k: 'cow', base: 280, out: '牛奶', every: 34, names: ['奶牛', '花牛', '白牛', '黄牛', '水牛'] },
  { k: 'pig', base: 180, out: '松露', every: 38, names: ['小猪', '花猪', '黑猪', '香猪', '粉猪'] },
  { k: 'hog', base: 240, out: '火腿', every: 42, names: ['大猪', '野猪', '卷毛猪', '肥猪', '山猪'] },
  { k: 'bunny', base: 90, out: '兔毛', every: 22, names: ['白兔', '灰兔', '垂耳兔', '侏儒兔', '狮子兔'] },
  { k: 'bee', base: 120, out: '蜂蜜', every: 26, names: ['小蜜蜂', '金蜂', '熊蜂', '采蜜蜂', '花蜂'] },
  { k: 'cat', base: 260, names: ['猫咪', '橘猫', '布偶猫', '黑猫', '奶牛猫'] },
  { k: 'dog', base: 260, names: ['狗狗', '柴犬', '柯基', '哈士奇', '金毛'] },
  { k: 'fox', base: 320, names: ['小狐狸', '赤狐', '银狐', '雪狐', '耳廓狐'] },
  { k: 'deer', base: 360, names: ['小鹿', '梅花鹿', '驯鹿', '白唇鹿', '麋鹿'] },
  { k: 'polar', base: 420, names: ['白熊', '北极熊', '小北极熊', '雪熊', '银熊'] },
  { k: 'koala', base: 380, names: ['考拉', '灰考拉', '小考拉', '树袋熊', '胖考拉'] },
  { k: 'panda', base: 520, names: ['熊猫', '小熊猫', '棕熊猫', '秦岭熊猫', '熊猫宝宝'] },
  { k: 'lion', base: 480, names: ['狮子', '小狮子', '雄狮', '金狮', '白狮'] },
  { k: 'tiger', base: 500, names: ['老虎', '小老虎', '白虎', '东北虎', '金虎'] },
  { k: 'monkey', base: 300, names: ['猴子', '金丝猴', '猕猴', '小猴', '长尾猴'] },
  { k: 'elephant', base: 560, names: ['大象', '小象', '亚洲象', '白象', '非洲象'] },
  { k: 'giraffe', base: 580, names: ['长颈鹿', '小长颈鹿', '白长颈鹿', '斑点长颈鹿', '网纹长颈鹿'] },
  { k: 'penguin', base: 340, names: ['企鹅', '帝企鹅', '小蓝企鹅', '白企鹅', '跳岩企鹅'] },
  { k: 'parrot', base: 300, names: ['鹦鹉', '金刚鹦鹉', '玄凤鹦鹉', '虎皮鹦鹉', '白鹦鹉'] },
  { k: 'fish', base: 80, out: '小鱼干', every: 24, names: ['小鱼', '金鱼', '锦鲤', '小丑鱼', '蝴蝶鱼'] },
  { k: 'crab', base: 140, out: '蟹肉', every: 30, names: ['螃蟹', '小螃蟹', '帝王蟹', '石蟹', '红蟹'] },
  { k: 'beaver', base: 220, names: ['河狸', '小海狸', '灰河狸', '胖河狸', '棕河狸'] },
  { k: 'caterpillar', base: 70, names: ['毛毛虫', '绿毛虫', '小毛虫', '彩毛虫', '胖毛虫'] },
];

export const FARM_ANIMALS: AnimalDef[] = ANIMAL_SPECIES.flatMap((s) =>
  s.names.map((n, i) => ({
    n,
    k: s.k,
    v: i % 5,
    cost: Math.round(s.base * (1 + i * 0.2)),
    sell: Math.round(s.base * 0.6 * (1 + i * 0.2)),
    ...(s.out
      ? { out: i === 0 ? s.out : s.out + '·' + n, outVal: Math.round(12 + i * 9 + s.base * 0.06), every: s.every }
      : {}),
  })),
);

`;
c = c.slice(0, s1) + block + c.slice(e1);
fs.writeFileSync(cp, c, 'utf8');
console.log('目录换成 24 物种 × 5 品种');

// 2) 美术：Cube Pets 自带透明，去掉抠图逻辑，改成 5 档色相
const ap = 'C:/ts/src/core/farmArtKit2.ts';
let a = fs.readFileSync(ap, 'utf8');
const s2 = a.indexOf('/* ================= 动物：Kenney 真实精灵 ================= */');
const e2 = a.indexOf('/* ================= 商品图标 ================= */');
if (s2 < 0 || e2 < 0) throw new Error('没找到美术段');
const art = `/* ================= 动物：Kenney Cube Pets 真实美术 ================= */
var animCache={};
/* 5 档毛色：原色 / 偏暖 / 偏冷 / 偏暗 / 褪色 */
var ANIMAL_TINT=['','hue-rotate(24deg) saturate(1.2)','hue-rotate(190deg) saturate(1.1)','brightness(.82) saturate(1.15)','grayscale(.45) brightness(1.18)'];
function animalSprite(k){
  var c=animCache[k];
  if(c!==undefined) return c;
  var src=(typeof ANIMAL_SPRITES!=='undefined')?ANIMAL_SPRITES[k]:null;
  if(!src){ animCache[k]=null; return null; }
  var im=new Image();
  im.src=src;
  animCache[k]=im;
  return im;
}
/** 画一只动物：cx=中心, baseY=脚底, s=高度 */
function drawAnimal2(def,cx,baseY,s,bob,aff){
  if(!def) return;
  var im=animalSprite(def.k);
  var H=Math.max(8,s);
  var w0=(im&&(im.naturalWidth||im.width))||1, h0=(im&&(im.naturalHeight||im.height))||1;
  var W=H*(w0/h0);
  var y=baseY-(bob||0);
  ctx.fillStyle='rgba(30,22,12,.16)';
  ctx.beginPath(); ctx.ellipse(cx,baseY+1,W*0.34,H*0.07,0,0,6.2832); ctx.fill();
  if(im&&(im.naturalWidth||im.width)){
    var f=ANIMAL_TINT[def.v%5]||'';
    ctx.save();
    if(f){ try{ ctx.filter=f; }catch(e){} }
    ctx.drawImage(im, cx-W/2, y-H, W, H);
    ctx.restore();
  } else {
    ctx.fillStyle='rgba(200,180,150,.55)';
    ctx.beginPath(); ctx.ellipse(cx,y-H*0.5,W*0.38,H*0.42,0,0,6.2832); ctx.fill();
  }
  if((aff||0)>=8){
    var ay=y-H-6+Math.sin(tick/26)*2.5;
    ctx.fillStyle='rgba(255,110,150,.95)';
    ctx.beginPath();
    ctx.moveTo(cx,ay+4);
    ctx.bezierCurveTo(cx-7,ay-2,cx-3,ay-7,cx,ay-2.5);
    ctx.bezierCurveTo(cx+3,ay-7,cx+7,ay-2,cx,ay+4);
    ctx.closePath(); ctx.fill();
  }
}

`;
a = a.slice(0, s2) + art + a.slice(e2);
fs.writeFileSync(ap, a, 'utf8');
console.log('美术改用 Cube Pets');
