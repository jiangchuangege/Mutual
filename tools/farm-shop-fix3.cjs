const fs = require('node:fs');
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

sub(`  var depth=0.22+row*0.27;
  var p=floorPoint(g,0.20+col*0.30,depth);`,
`  var depth=0.18+row*0.34;
  var p=floorPoint(g,0.20+col*0.30,depth);`, '行距拉开');

sub(`function shopShelfHeight(i){ return (58+Math.floor(i/SHOP_COLS)*4); }`,
    `function shopShelfHeight(i){ return 44+Math.floor(i/SHOP_COLS)*3; }`, '货架更矮');

// 标签放到货架脚下，谁都挡不住谁
sub(`    var tagW=Math.min(46,hh*0.62), tagH=34;
    var tagX=r.x-tagW/2, tagY=r.y-hh*0.62;`,
`    var tagW=Math.min(42,hh*0.9), tagH=24;
    var tagX=r.x-tagW/2, tagY=r.y+2;`, '标签位置');
sub(`      drawGoodIcon(GOODS[slot.g], r.x, tagY+11, 13);
      ctx.fillStyle='#3f2a12'; ctx.font='700 9px system-ui'; ctx.textAlign='center';
      ctx.fillText('×'+slot.q, r.x, tagY+24);
      ctx.fillStyle='#2f6a26'; ctx.font='700 9px system-ui';
      ctx.fillText(slot.p+'金', r.x, tagY+32);
      ctx.textAlign='left';`,
`      drawGoodIcon(GOODS[slot.g], r.x-10, tagY+12, 10);
      ctx.fillStyle='#3f2a12'; ctx.font='700 9px system-ui'; ctx.textAlign='left';
      ctx.fillText('×'+slot.q, r.x-1, tagY+11);
      ctx.fillStyle='#2f6a26'; ctx.font='700 9px system-ui';
      ctx.fillText(slot.p+'金', r.x-1, tagY+21);
      ctx.textAlign='left';`, '标签内容');
sub(`      ctx.fillStyle='#b0a08c'; ctx.font='700 10px system-ui'; ctx.textAlign='center';
      ctx.fillText('空位', r.x, tagY+15);
      ctx.fillStyle='#c8b8a0'; ctx.font='8px system-ui';
      ctx.fillText('点上架', r.x, tagY+27);
      ctx.textAlign='left';`,
`      ctx.fillStyle='#b0a08c'; ctx.font='700 9px system-ui'; ctx.textAlign='center';
      ctx.fillText('空位', r.x, tagY+10);
      ctx.fillStyle='#c8b8a0'; ctx.font='8px system-ui';
      ctx.fillText('点上架', r.x, tagY+20);
      ctx.textAlign='left';`, '空位标签');

// 收银台挪到右侧，别压货架
sub(`  var cp=floorPoint(g,0.5,1.0);`, `  var cp=floorPoint(g,0.88,0.96);`, '收银台位置');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
