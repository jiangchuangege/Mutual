const fs = require('node:fs');
const p = 'C:/ts/src/core/farmArtKit2.ts';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf('/* ================= 动物：Kenney 真实精灵（逐只 PNG，带透明） ================= */');
const end = t.indexOf('/* ================= 商品图标 ================= */');
if (start < 0 || end < 0) throw new Error('找不到动物段落');

const art = `/* ================= 动物：Kenney 真实精灵 ================= */
/* 图包里的精灵带一个圆形/方形底框，这里一次性抠掉：
   从画布边缘做同类色泛洪，只清掉和边框连通的底色，动物身上被描边包住的白毛不会被误伤。 */
var animImgs={}, animReady={}, ANIMAL_TINT=['','hue-rotate(26deg) saturate(1.15)','hue-rotate(188deg) brightness(.82) saturate(.9)','grayscale(.45) brightness(1.15)'];
function keyOutBackdrop(im){
  var w=im.naturalWidth, h=im.naturalHeight;
  if(!w||!h) return null;
  var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  var cc=cv.getContext('2d');
  cc.drawImage(im,0,0);
  try{
    var data=cc.getImageData(0,0,w,h), px=data.data;
    var bi=(2*w+2)*4, r0=px[bi], g0=px[bi+1], b0=px[bi+2];
    var tol=24;
    var seen=new Uint8Array(w*h), stack=[];
    function look(k){
      if(seen[k]) return;
      seen[k]=1;
      var i=k*4;
      if(Math.abs(px[i]-r0)>tol||Math.abs(px[i+1]-g0)>tol||Math.abs(px[i+2]-b0)>tol) return;
      stack.push(k);
    }
    for(var x=0;x<w;x+=2){ look(x); look((h-1)*w+x); }
    for(var y=0;y<h;y+=2){ look(y*w); look(y*w+w-1); }
    while(stack.length){
      var k2=stack.pop(), i2=k2*4;
      px[i2+3]=0;
      var xx=k2%w, yy=(k2/w)|0;
      if(xx>0) look(k2-1);
      if(xx<w-1) look(k2+1);
      if(yy>0) look(k2-w);
      if(yy<h-1) look(k2+w);
    }
    cc.putImageData(data,0,0);
    return cv;
  }catch(e){
    return cv;
  }
}
function animalSprite(k){
  if(animReady[k]!==undefined) return animReady[k];
  var src=(typeof ANIMAL_SPRITES!=='undefined')?ANIMAL_SPRITES[k]:null;
  if(!src){ animReady[k]=null; return null; }
  var im=new Image();
  im.onload=function(){
    animReady[k]=null;         // 先置空，下一帧再抠
    animImgs[k]=keyOutBackdrop(im);
    animReady[k]=animImgs[k];
  };
  im.src=src;
  animImgs[k]=im;
  animReady[k]=im.complete&&im.naturalWidth?keyOutBackdrop(im):null;
  return animReady[k]||im;
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
console.log('已加入底色泛洪抠图');
