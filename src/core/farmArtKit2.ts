/** 动物 / 商品 / 装饰的美术（同样整段拼进游戏 HTML） */
export const FARM_ART2_JS = String.raw`
/* ================= 动物：Kenney Cube Pets 真实美术 ================= */
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

/* ================= 商品图标 ================= */
var goodImgs={};
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
`;
