const fs = require('node:fs');

// 1) farmArtKit2：改成逐只精灵
const p = 'C:/ts/src/core/farmArtKit2.ts';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf('/* ================= 动物：Kenney 真实精灵 ================= */');
const end = t.indexOf('/* ================= 商品图标 ================= */');
if (start < 0 || end < 0) throw new Error('找不到动物段落');
const art = `/* ================= 动物：Kenney 真实精灵（逐只 PNG，带透明） ================= */
var animImgs={};
var ANIMAL_TINT=['','hue-rotate(26deg) saturate(1.15)','hue-rotate(188deg) brightness(.82) saturate(.9)','grayscale(.45) brightness(1.15)'];
function animalImg(k){
  if(animImgs[k]!==undefined) return animImgs[k];
  var src=(typeof ANIMAL_SPRITES!=='undefined')?ANIMAL_SPRITES[k]:null;
  if(!src){ animImgs[k]=null; return null; }
  var im=new Image();
  im.src=src;
  animImgs[k]=im;
  return im;
}
/** 画一只动物：cx=中心, baseY=脚底, s=高度 */
function drawAnimal2(def,cx,baseY,s,bob,aff){
  if(!def) return;
  var im=animalImg(def.k);
  var H=Math.max(8,s);
  var ar=(im&&im.naturalWidth)?(im.naturalWidth/im.naturalHeight):1;
  var W=H*ar;
  var y=baseY-(bob||0);
  ctx.fillStyle='rgba(30,22,12,.16)';
  ctx.beginPath(); ctx.ellipse(cx,baseY+1,W*0.36,H*0.07,0,0,6.2832); ctx.fill();
  if(im&&im.complete&&im.naturalWidth){
    var f=ANIMAL_TINT[def.v%4]||'';
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
t = t.slice(0, start) + art + t.slice(end);
fs.writeFileSync(p, t, 'utf8');
console.log('美术改成逐只精灵');

// 2) gameFarm：注入 ANIMAL_SPRITES
const gp = 'C:/ts/src/core/gameFarm.ts';
let g = fs.readFileSync(gp, 'utf8');
g = g.replace(
  "import { ANIMAL_RECTS, ANIMAL_SHEET } from './farmSprites';",
  "import { ANIMAL_SPRITES } from './farmSprites';",
);
g = g.replace(
  "'var ANIMAL_SHEET=' + JSON.stringify(ANIMAL_SHEET) + ';' +\n    'var ANIMAL_RECTS=' + JSON.stringify(ANIMAL_RECTS) + ';';",
  "'var ANIMAL_SPRITES=' + JSON.stringify(ANIMAL_SPRITES) + ';';",
);
fs.writeFileSync(gp, g, 'utf8');
console.log('gameFarm 注入完成:', g.includes('ANIMAL_SPRITES'), g.includes('ANIMAL_SHEET'));
