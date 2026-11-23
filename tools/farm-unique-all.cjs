const fs = require('node:fs');

/* ============ 1) 目录 ============ */
const cp = 'C:/ts/src/core/farmCatalog.ts';
let c = `import { CROP_DEFS, GOOD_DEFS } from './farmArtData';
import { FURNITURE_META } from './farmFurniture';

/**
 * 农场内容目录：作物 / 动物 / 超市商品 / 装饰。
 *
 * 原则：**每一条都有自己的美术**，不共用、不靠换色凑数。
 *  - 作物 28 种：来自 Kenney《Food Kit》的 28 张不同渲染图
 *  - 动物 24 种：来自 Kenney《Cube Pets》的 24 只不同宠物
 *  - 商品 63 件：来自 Kenney《Food Kit》的 63 张不同渲染图
 *  - 家具 63 件：来自 Kenney《Furniture Kit》的 63 张不同家具渲染图
 */

export interface CropDef {
  n: string;
  /** 精灵 key */
  s: string;
  seed: number;
  sell: number;
  g: number;
}

export const FARM_CROPS: CropDef[] = CROP_DEFS.map((d) => ({ n: d.n, s: d.s, seed: d.seed, sell: d.sell, g: d.g }));

export type AnimalKind =
  | 'chick' | 'cow' | 'pig' | 'hog' | 'bunny' | 'cat' | 'dog' | 'fox' | 'deer' | 'polar'
  | 'koala' | 'panda' | 'lion' | 'tiger' | 'monkey' | 'elephant' | 'giraffe' | 'penguin'
  | 'parrot' | 'fish' | 'crab' | 'beaver' | 'bee' | 'caterpillar';

export interface AnimalDef {
  n: string;
  k: AnimalKind;
  cost: number;
  sell: number;
  out?: string;
  outVal?: number;
  every?: number;
}

/** 24 只宠物，一只一图 */
const ANIMAL_SPECIES: { k: AnimalKind; n: string; base: number; out?: string; every?: number }[] = [
  { k: 'chick', n: '小鸡', base: 60, out: '鸡蛋', every: 20 },
  { k: 'cow', n: '奶牛', base: 280, out: '牛奶', every: 34 },
  { k: 'pig', n: '小猪', base: 180, out: '松露', every: 38 },
  { k: 'hog', n: '大猪', base: 240, out: '火腿', every: 42 },
  { k: 'bunny', n: '兔子', base: 90, out: '兔毛', every: 22 },
  { k: 'bee', n: '小蜜蜂', base: 120, out: '蜂蜜', every: 26 },
  { k: 'cat', n: '猫咪', base: 260 },
  { k: 'dog', n: '狗狗', base: 260 },
  { k: 'fox', n: '小狐狸', base: 320 },
  { k: 'deer', n: '小鹿', base: 360 },
  { k: 'polar', n: '白熊', base: 420 },
  { k: 'koala', n: '考拉', base: 380 },
  { k: 'panda', n: '熊猫', base: 520 },
  { k: 'lion', n: '狮子', base: 480 },
  { k: 'tiger', n: '老虎', base: 500 },
  { k: 'monkey', n: '猴子', base: 300 },
  { k: 'elephant', n: '大象', base: 560 },
  { k: 'giraffe', n: '长颈鹿', base: 580 },
  { k: 'penguin', n: '企鹅', base: 340 },
  { k: 'parrot', n: '鹦鹉', base: 300 },
  { k: 'crab', n: '螃蟹', base: 140, out: '蟹肉', every: 30 },
  { k: 'beaver', n: '河狸', base: 220 },
  { k: 'caterpillar', n: '毛毛虫', base: 70 },
  { k: 'fish', n: '小鱼', base: 80, out: '小鱼干', every: 24 },
];

export const FARM_ANIMALS: AnimalDef[] = ANIMAL_SPECIES.map((s) => ({
  n: s.n,
  k: s.k,
  cost: s.base,
  sell: Math.round(s.base * 0.6),
  ...(s.out ? { out: s.out, outVal: Math.round(12 + s.base * 0.08), every: s.every } : {}),
}));

export type GoodCat = string;

export interface GoodDef {
  n: string;
  /** 精灵 key */
  s: string;
  c: GoodCat;
  price: number;
  /** 效果：heart=加心动 aff=宠物好感 treat=口粮 */
  e: 'heart' | 'aff' | 'treat' | 'none';
}

export const MARKET_GOODS: GoodDef[] = GOOD_DEFS.map((d) => ({
  n: d.n,
  s: d.s,
  c: d.c,
  price: d.price,
  e: d.c === '礼物' ? 'heart' : d.c === '宠物' ? 'aff' : d.c === '零食' ? 'treat' : 'none',
}));

export interface DecorDef {
  n: string;
  /** 家具精灵 key */
  f: string;
  big: boolean;
  price: number;
}

/** 63 件家具，一件一图 */
export const DECOR_ITEMS: DecorDef[] = FURNITURE_META.map((m, i) => ({
  n: m.n,
  f: m.k,
  big: m.big,
  price: 120 + i * 40,
}));

/** 电视频道（公开 HLS 源，播放失败会提示可换源） */
export const TV_CHANNELS: { n: string; u: string }[] = [
  { n: 'CCTV-1 综合', u: 'https://ivi.bupt.edu.cn/hls/cctv1hd.m3u8' },
  { n: 'CCTV-2 财经', u: 'https://ivi.bupt.edu.cn/hls/cctv2hd.m3u8' },
  { n: 'CCTV-3 综艺', u: 'https://ivi.bupt.edu.cn/hls/cctv3hd.m3u8' },
  { n: 'CCTV-5 体育', u: 'https://ivi.bupt.edu.cn/hls/cctv5hd.m3u8' },
  { n: 'CCTV-6 电影', u: 'https://ivi.bupt.edu.cn/hls/cctv6hd.m3u8' },
  { n: 'CCTV-13 新闻', u: 'https://ivi.bupt.edu.cn/hls/cctv13hd.m3u8' },
  { n: 'CCTV-14 少儿', u: 'https://ivi.bupt.edu.cn/hls/cctv14hd.m3u8' },
];

export const CROP_COUNT = FARM_CROPS.length;
export const ANIMAL_COUNT = FARM_ANIMALS.length;
export const GOOD_COUNT = MARKET_GOODS.length;
export const DECOR_COUNT = DECOR_ITEMS.length;
`;
fs.writeFileSync(cp, c, 'utf8');
console.log('目录重写完成');

/* ============ 2) 作物美术：直接用精灵 ============ */
const ap = 'C:/ts/src/core/farmArtKit.ts';
let a = fs.readFileSync(ap, 'utf8');
a = a.replace(
  /export const FARM_ART_JS = String\.raw`[\s\S]*$/,
  `export const FARM_ART_JS = String.raw\`
/* ================= 基础工具 ================= */
function rr(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
function softShadow(x,y,rx,ry,a){ ctx.fillStyle='rgba(30,22,12,'+(a===undefined?0.2:a)+')';
  ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,6.2832); ctx.fill(); }
function leafAt(x,y,len,wid,rot,c1,c2){
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot||0);
  var g=ctx.createLinearGradient(0,-wid,0,wid);
  g.addColorStop(0,c1); g.addColorStop(1,c2);
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(0,0);
  ctx.bezierCurveTo(len*0.42,-wid,len*0.86,-wid*0.5,len,0);
  ctx.bezierCurveTo(len*0.86,wid*0.5,len*0.42,wid,0,0);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ================= 作物：一件一条图（Kenney Food Kit） ================= */
var cropImgs={};
function cropImg(k){
  if(cropImgs[k]!==undefined) return cropImgs[k];
  var src=(typeof CROP_SPRITES!=='undefined')?CROP_SPRITES[k]:null;
  if(!src){ cropImgs[k]=null; return null; }
  var im=new Image(); im.src=src; cropImgs[k]=im;
  return im;
}
/** 幼苗：两片叶子（还没结果的时候用） */
function drawSprout(cx,baseY,s,t){
  var h=s*(0.34+0.62*t);
  ctx.strokeStyle='#4e8f45'; ctx.lineWidth=Math.max(2,s*0.05);
  ctx.beginPath(); ctx.moveTo(cx,baseY); ctx.lineTo(cx,baseY-h); ctx.stroke();
  var lw=s*0.26*(0.55+t*0.6);
  leafAt(cx,baseY-h*0.7,lw,lw*0.42,-0.55,'#8fdc78','#3c7d36');
  leafAt(cx,baseY-h*0.5,lw,lw*0.42,0.6,'#8fdc78','#3c7d36');
}
/** 画作物：没熟＝幼苗+小果子；熟了＝整张图 */
function drawCrop(def,cx,baseY,s,mature,t){
  var im=cropImg(def.s);
  if(!mature){
    drawSprout(cx,baseY,s*0.9,t===undefined?1:t);
    if(im&&im.complete&&im.naturalWidth&&t>0.5){
      var k=s*(0.2+0.42*t), ar=im.naturalWidth/im.naturalHeight;
      ctx.save(); ctx.globalAlpha=0.55+0.45*t;
      ctx.drawImage(im, cx-(k*ar)/2, baseY-k*0.85, k*ar, k);
      ctx.restore();
    }
    return;
  }
  if(im&&im.complete&&im.naturalWidth){
    var H=s, W=H*(im.naturalWidth/im.naturalHeight);
    ctx.drawImage(im, cx-W/2, baseY-H, W, H);
  } else {
    ctx.fillStyle='#8a6a44';
    ctx.beginPath(); ctx.arc(cx,baseY-s*0.35,s*0.28,0,6.2832); ctx.fill();
  }
}
\`;`,
);
fs.writeFileSync(ap, a, 'utf8');
console.log('作物美术改成精灵');

/* ============ 3) 商品图标：直接用精灵 ============ */
const gp = 'C:/ts/src/core/farmArtKit2.ts';
let g2 = fs.readFileSync(gp, 'utf8');
const s3 = g2.indexOf('function drawGoodIcon(g,x,y,s){');
const e3 = g2.indexOf('/* ================= 装饰家具 ================= */');
if (s3 > 0 && e3 > 0) {
  g2 = g2.slice(0, s3) + `var goodImgs={};
function goodImg(k){
  if(goodImgs[k]!==undefined) return goodImgs[k];
  var src=(typeof GOOD_SPRITES!=='undefined')?GOOD_SPRITES[k]:null;
  if(!src){ goodImgs[k]=null; return null; }
  var im=new Image(); im.src=src; goodImgs[k]=im;
  return im;
}
/** 商品图标：一件商品一张图 */
function drawGoodIcon(g,x,y,s){
  var im=goodImg(g&&g.s);
  if(im&&im.complete&&im.naturalWidth){
    var H=s*1.5, W=H*(im.naturalWidth/im.naturalHeight);
    ctx.drawImage(im, x-W/2, y-H/2, W, H);
  } else {
    ctx.fillStyle='#d9c8ac'; ctx.beginPath(); ctx.arc(x,y,s*0.4,0,6.2832); ctx.fill();
  }
}

` + g2.slice(e3);
  // 去掉旧的花哨家具绘制（已由精灵替代）
  const s4 = g2.indexOf('/* ================= 装饰家具 ================= */');
  if (s4 > 0) g2 = g2.slice(0, s4);
  fs.writeFileSync(gp, g2, 'utf8');
  console.log('商品图标改成精灵，旧家具绘制已移除');
}

/* ============ 4) 房间/小卖部：去掉色相档位参数 ============ */
const rp = 'C:/ts/src/core/farmRoomShop.ts';
let r = fs.readFileSync(rp, 'utf8');
r = r.replace(/var FURNITURE_TINT=\[[\s\S]*?\];\n/, '');
r = r.replace(/function drawFurniture\(k,tint,x,y,h\)\{/, 'function drawFurniture(k,tint,x,y,h){');
r = r.replace(/  var f=FURNITURE_TINT\[\(tint\|\|0\)%12\]\|\|'';\n  if\(f\)\{ try\{ ctx\.filter=f; \}catch\(e\)\{\} \}\n/, '');
r = r.replace(/drawFurniture\(dd\.f,dd\.t,/g, 'drawFurniture(dd.f,0,');
r = r.replace(/drawFurniture\(def\.f,def\.t,/g, 'drawFurniture(def.f,0,');
r = r.replace(/k:bi\[b\]\[0\],t:bi\[b\]\[1\],/g, 'k:bi[b][0],t:0,');
r = r.replace(/k:def\.f,t:def\.t,/g, 'k:def.f,t:0,');
r = r.replace(/drawFurniture\('bookcaseClosed',0,/g, "drawFurniture('bookcaseClosed',0,");
fs.writeFileSync(rp, r, 'utf8');
console.log('房间去掉色相档位');

/* ============ 5) gameFarm：注入作物/商品精灵 ============ */
const gg = 'C:/ts/src/core/gameFarm.ts';
let q = fs.readFileSync(gg, 'utf8');
if (!q.includes('CROP_SPRITES')) {
  q = q.replace(
    "import { FURNITURE_SPRITES } from './farmFurniture';",
    "import { CROP_SPRITES } from './farmCropSprites';\nimport { FURNITURE_SPRITES } from './farmFurniture';\nimport { GOOD_SPRITES } from './farmGoodSprites';",
  );
  q = q.replace(
    "'var FURNITURE_SPRITES=' + JSON.stringify(FURNITURE_SPRITES) + ';';",
    "'var FURNITURE_SPRITES=' + JSON.stringify(FURNITURE_SPRITES) + ';' +\n    'var CROP_SPRITES=' + JSON.stringify(CROP_SPRITES) + ';' +\n    'var GOOD_SPRITES=' + JSON.stringify(GOOD_SPRITES) + ';';",
  );
  fs.writeFileSync(gg, q, 'utf8');
  console.log('gameFarm 注入作物/商品精灵');
}
