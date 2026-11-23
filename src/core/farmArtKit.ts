/**
 * 农场美术工具箱（纯 canvas 绘制，运行在 WebView 里）。
 *
 * 这里是"源码字符串"，最后整段拼进游戏 HTML。
 * 之所以放在 .ts 里而不是独立 .js：构建流程只有 TS → dist-core，
 * 而它本身不含逻辑，tsc 只当作模板字符串检查，安全。
 */

export const FARM_ART_JS = String.raw`
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
`;