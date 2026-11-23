const fs = require('node:fs');
const p = 'C:/ts/src/core/farmArtKit2.ts';
let t = fs.readFileSync(p, 'utf8');

const start = t.indexOf('/* ================= 动物：统一 chibi 风格 ================= */');
const end = t.indexOf('/* ================= 商品图标 ================= */');
if (start < 0 || end < 0) throw new Error('找不到动物美术段落');

const art = `/* ================= 动物：Kenney 真实精灵 ================= */
var animSheet=new Image(); animSheet.src=ANIMAL_SHEET;
/* 用色相旋转做毛色变体，一只精灵出 4 种毛色 */
var ANIMAL_TINT=['','hue-rotate(26deg) saturate(1.15)','hue-rotate(188deg) brightness(.82) saturate(.9)','grayscale(.5) brightness(1.12)'];
function animalReady(){ return animSheet.complete&&animSheet.naturalWidth>0; }
/** 画一只动物：cx=中心, baseY=脚底, s=高度 */
function drawAnimal2(def,cx,baseY,s,bob,aff){
  if(!def) return;
  var r=ANIMAL_RECTS&&ANIMAL_RECTS[def.k];
  if(!r) return;
  var H=Math.max(8,s), W=H*r[2]/r[3];
  var y=baseY-(bob||0);
  ctx.fillStyle='rgba(30,22,12,.16)';
  ctx.beginPath(); ctx.ellipse(cx,baseY+1,W*0.38,H*0.07,0,0,6.2832); ctx.fill();
  if(animalReady()){
    var f=ANIMAL_TINT[def.v%4]||'';
    ctx.save();
    if(f){ try{ ctx.filter=f; }catch(e){} }
    ctx.drawImage(animSheet, r[0],r[1],r[2],r[3], cx-W/2, y-H, W, H);
    ctx.restore();
  } else {
    // 图还没解码完：先画个占位色块，别让位置空着
    ctx.fillStyle='rgba(200,180,150,.6)';
    ctx.beginPath(); ctx.ellipse(cx,y-H*0.5,W*0.4,H*0.45,0,0,6.2832); ctx.fill();
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
t = t.slice(0, start) + art + t.slice(end);
fs.writeFileSync(p, t, 'utf8');
console.log('动物美术换成真实精灵');

// gameFarm：把图集数据塞进页面
const gp = 'C:/ts/src/core/gameFarm.ts';
let g = fs.readFileSync(gp, 'utf8');
if (!g.includes('ANIMAL_SHEET')) {
  g = g.replace(
    "import { DECOR_ITEMS, FARM_ANIMALS, FARM_CROPS, MARKET_GOODS, TV_CHANNELS } from './farmCatalog';",
    "import { DECOR_ITEMS, FARM_ANIMALS, FARM_CROPS, MARKET_GOODS, TV_CHANNELS } from './farmCatalog';\nimport { ANIMAL_RECTS, ANIMAL_SHEET } from './farmSprites';",
  );
  g = g.replace(
    "'var CHANNELS=' + JSON.stringify(TV_CHANNELS) + ';';",
    "'var CHANNELS=' + JSON.stringify(TV_CHANNELS) + ';' +\n    'var ANIMAL_SHEET=' + JSON.stringify(ANIMAL_SHEET) + ';' +\n    'var ANIMAL_RECTS=' + JSON.stringify(ANIMAL_RECTS) + ';';",
  );
  fs.writeFileSync(gp, g, 'utf8');
  console.log('gameFarm 已注入图集');
} else {
  console.log('gameFarm 已有图集引用');
}
