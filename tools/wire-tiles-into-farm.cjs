const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');

// 1) 引入地块图集
if (!t.includes('FARM_TILES_SHEET')) {
  t = t.replace(
    "import { FARM_ANIMALS, FARM_ANIMAL_SHEET } from './farmArt';",
    "import { FARM_ANIMALS, FARM_ANIMAL_SHEET } from './farmArt';\nimport { FARM_TILES_SHEET, TILE } from './farmTiles';"
  );
}

// 2) 把图集注入到 HTML（在动物图之后）
if (!t.includes('var tiles=new Image()')) {
  t = t.replace(
    "  var sheet=new Image(); sheet.src='${FARM_ANIMAL_SHEET}';",
    "  var sheet=new Image(); sheet.src='${FARM_ANIMAL_SHEET}';\n  var tiles=new Image(); tiles.src='${FARM_TILES_SHEET}';\n  /** 从 Kenney 图集里取一格（col,row 单位 = 64px），失败则回退纯色 */\n  function tilePatch(col,row,x,y,w,h,fallback){\n    if(tiles.complete&&tiles.naturalWidth){\n      ctx.drawImage(tiles,col*${TILE},row*${TILE},${TILE},${TILE},x,y,w,h);\n    }else{ ctx.fillStyle=fallback; ctx.fillRect(x,y,w,h); }\n  }"
  );
}

// 3) 草地：用图集里的草地格平铺（失败回退绿色）
const grassOld = "    ctx.fillStyle='#7ec86a'; ctx.fillRect(0,VH*0.42,VW,VH*0.58);";
const grassNew = `    // 草地：用 Kenney 草地格（右下纯色区）平铺，失败回退绿色
    for(var ty=Math.floor(VH*0.42);ty<VH;ty+=64) for(var tx=0;tx<VW;tx+=64)
      tilePatch(15,3,tx,ty,64,64,'#7ec86a');`;
if (!t.includes(grassOld)) throw new Error('草地绘制行没找到');
t = t.replace(grassOld, grassNew);

// 4) 菜地：用图集泥土格做地表（失败回退泥土渐变）
const soilOld = `      var soil=ctx.createLinearGradient(px,py,px,py+h);
      soil.addColorStop(0,'#9a6b3f'); soil.addColorStop(1,'#7a5230');
      ctx.fillStyle=soil; roundRect(px,py,w,h,12); ctx.fill();`;
const soilNew = `      // 菜地：图集泥土格 + 圆角裁剪（失败回退渐变）
      ctx.save();
      roundRect(px,py,w,h,12); ctx.clip();
      tilePatch(1,0,px,py,w,h,'#8a5f38');
      ctx.restore();
      var soil=ctx.createLinearGradient(px,py,px,py+h);
      soil.addColorStop(0,'rgba(0,0,0,0)'); soil.addColorStop(1,'rgba(0,0,0,.22)');
      ctx.fillStyle=soil; roundRect(px,py,w,h,12); ctx.fill();`;
if (!t.includes(soilOld)) throw new Error('菜地绘制行没找到');
t = t.replace(soilOld, soilNew);

fs.writeFileSync(p, t, 'utf8');
console.log('地块图集已接入渲染:', {
  引入: t.includes('FARM_TILES_SHEET'),
  贴图函数: t.includes('function tilePatch'),
  草地: t.includes("tilePatch(15,3"),
  菜地: t.includes("tilePatch(1,0"),
});
