const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 素材工具
sub('/* ================= 农场场景：绘制 ================= */',
`/* ================= 外景素材 ================= */
var sceImgs={};
function sceImg(k){
  if(sceImgs[k]!==undefined) return sceImgs[k];
  var src=(typeof SCENERY_SPRITES!=='undefined')?SCENERY_SPRITES[k]:null;
  if(!src){ sceImgs[k]=null; return null; }
  var im=new Image(); im.src=src; sceImgs[k]=im;
  return im;
}
/** 画一件外景（x=中心, baseY=底边, h=高度） */
function drawSce(k,x,baseY,h,flip){
  var im=sceImg(k);
  if(im&&im.complete&&im.naturalWidth){
    var W=h*(im.naturalWidth/im.naturalHeight);
    ctx.save();
    if(flip){ ctx.translate(x,0); ctx.scale(-1,1); ctx.translate(-x,0); }
    ctx.drawImage(im,x-W/2,baseY-h,W,h);
    ctx.restore();
    return W;
  }
  return 0;
}

/* ================= 农场场景：绘制 ================= */`, '外景素材工具');

// 2) 小屋外观：用真实素材拼（墙 + 屋顶 + 门 + 窗 + 烟囱）
const hs = t.indexOf('function drawHouseExterior(){');
const he = t.indexOf('/** 超市摊位（点进超市） */');
if (hs < 0 || he < 0) throw new Error('没找到小屋外观段');
t = t.slice(0, hs) + `function drawHouseExterior(){
  var r=houseRect(), w=r.w, h=r.h, x=r.x, y=r.y;
  softShadow(x+w/2,y+h,w*0.5,h*0.08,0.2);
  var wallH=h*0.5, wallY=y+h-wallH;
  // 墙
  var ww=h*1.25;
  drawSce('wall-wood', x+w/2, y+h, wallH*1.02);
  // 屋顶
  drawSce('roof-gable', x+w/2, wallY+h*0.06, h*0.5);
  // 门 + 窗
  drawSce('wall-wood-door', x+w*0.5, y+h, h*0.34);
  drawSce('wall-wood-window-shutters', x+w*0.2, wallY+wallH*0.5, h*0.2);
  drawSce('wall-wood-window-shutters', x+w*0.8, wallY+wallH*0.5, h*0.2);
  // 烟囱
  drawSce('chimney', x+w*0.78, wallY+h*0.02, h*0.26);
  ctx.fillStyle='rgba(255,255,255,.55)';
  for(var s=0;s<3;s++){
    var sy=wallY-h*0.06-s*9-(tick%40)/12;
    ctx.beginPath(); ctx.arc(x+w*0.78+Math.sin(tick/40+s)*3,sy,3+s*0.6,0,6.2832); ctx.fill();
  }
  // 门牌
  ctx.fillStyle='rgba(255,252,240,.95)'; rr(x+w*0.5-24,y+h-wallH*0.62,48,16,5); ctx.fill();
  ctx.strokeStyle='rgba(120,80,40,.5)'; ctx.lineWidth=1.2; rr(x+w*0.5-24,y+h-wallH*0.62,48,16,5); ctx.stroke();
  ctx.fillStyle='#8a4a2a'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
  ctx.fillText('我们的小窝',x+w*0.5,y+h-wallH*0.62+12); ctx.textAlign='left';
}
` + t.slice(he);
ok.push('小屋外观用素材');

// 3) 超市摊位：用真实摊位图
const ms = t.indexOf('function drawMarketStall(){');
const me = t.indexOf('/** 农家院装饰 */');
if (ms < 0 || me < 0) throw new Error('没找到摊位段');
t = t.slice(0, ms) + `function drawMarketStall(){
  var r=marketRect(), x=r.x, y=r.y, w=r.w, h=r.h;
  softShadow(x+w/2,y+h,w*0.44,h*0.1,0.18);
  drawSce('stall-red', x+w/2, y+h, h*1.05);
  ctx.fillStyle='rgba(255,252,240,.95)'; rr(x+w*0.28,y+h*0.62,w*0.44,16,5); ctx.fill();
  ctx.fillStyle='#a1407a'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
  ctx.fillText('超 市',x+w*0.5,y+h*0.62+12); ctx.textAlign='left';
}
` + t.slice(me);
ok.push('摊位用素材');

// 4) 院子：树/灌木/石头/花/栅栏/风车 都用素材
const ys = t.indexOf('function drawYard(){');
const ye = t.indexOf('/** 宠物在院子里溜达 */');
if (ys < 0 || ye < 0) throw new Error('没找到院子段');
t = t.slice(0, ys) + `function drawYard(){
  var yg=yardGeom();
  var x=yg.x0, y=yg.yardY, w=yg.w, h=yg.yardH;
  if(h<40) return;
  // 小路
  ctx.fillStyle='rgba(200,168,118,.38)';
  ctx.beginPath();
  ctx.moveTo(x-6,y+h*0.82); ctx.quadraticCurveTo(x+w*0.5,y+h*0.76,x+w+6,y+h*0.84);
  ctx.lineTo(x+w+6,y+h*0.96); ctx.quadraticCurveTo(x+w*0.5,y+h*0.88,x-6,y+h*0.96);
  ctx.closePath(); ctx.fill();
  var groundY=y+h*0.98;
  // 树（大小错落）
  drawSce('tree_oak', x+w*0.80, groundY, h*0.92);
  drawSce('tree_pineTallA', x+w*0.94, groundY, h*0.80);
  drawSce('tree_small', x+w*0.06, groundY-h*0.02, h*0.52);
  // 灌木 / 石头 / 木头
  drawSce('plant_bushLarge', x+w*0.68, groundY-h*0.01, h*0.24);
  drawSce('plant_bush', x+w*0.32, groundY, h*0.18);
  drawSce('rock_largeA', x+w*0.46, groundY, h*0.2);
  drawSce('rock_smallA', x+w*0.56, groundY-h*0.01, h*0.11);
  drawSce('log', x+w*0.24, groundY, h*0.13);
  // 花
  drawSce('flower_redA', x+w*0.12, groundY-h*0.02, h*0.12);
  drawSce('flower_yellowA', x+w*0.18, groundY-h*0.01, h*0.11);
  drawSce('flower_purpleA', x+w*0.5, groundY-h*0.02, h*0.12);
  // 风车（右下角点缀）
  drawSce('windmill', x+w*0.88, groundY-h*0.12, h*0.5);
  // 木牌
  drawSce('sign', x+w*0.40, groundY-h*0.02, h*0.2);
  // 栅栏一排
  for(var fx=x-6;fx<x+w+6;fx+=Math.max(26,w*0.09)){
    drawSce('fence_simple', fx, groundY-h*0.005, h*0.15);
  }
  // 蝴蝶
  var bfs=[[0.2,0.24,'#ffe08a'],[0.36,0.14,'#ffb0c8'],[0.58,0.2,'#c9b8ff']];
  for(var bf=0;bf<bfs.length;bf++){
    var bfx=x+w*bfs[bf][0]+Math.sin(tick/50+bf)*10, bfy=y+h*bfs[bf][1]+Math.cos(tick/70+bf)*7;
    var flap=Math.abs(Math.sin(tick/9+bf))*3;
    ctx.fillStyle=bfs[bf][2];
    ctx.beginPath(); ctx.ellipse(bfx-3,bfy,3.2,flap+1.3,-0.5,0,6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bfx+3,bfy,3.2,flap+1.3,0.5,0,6.2832); ctx.fill();
  }
}
` + t.slice(ye);
ok.push('院子用素材');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));

// 5) gameFarm 注入外景素材
const gp = 'C:/ts/src/core/gameFarm.ts';
let g = fs.readFileSync(gp, 'utf8');
if (!g.includes('SCENERY_SPRITES')) {
  g = g.replace("import { ANIMAL_SPRITES } from './farmSprites';", "import { SCENERY_SPRITES } from './farmScenery';\nimport { ANIMAL_SPRITES } from './farmSprites';");
  g = g.replace("'var GOOD_SPRITES=' + JSON.stringify(GOOD_SPRITES) + ';';", "'var GOOD_SPRITES=' + JSON.stringify(GOOD_SPRITES) + ';' +\n    'var SCENERY_SPRITES=' + JSON.stringify(SCENERY_SPRITES) + ';';");
  fs.writeFileSync(gp, g, 'utf8');
  console.log('gameFarm 注入外景素材');
}
