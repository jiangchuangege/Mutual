const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 种子库 260 种 → 分页显示
sub("var marketTab=0, marketScroll=0, dragY=0, dragging=false;",
    "var marketTab=0, marketScroll=0, dragY=0, dragging=false, seedPage=0;", 'seedPage');

sub(
  `function renderSeedPanel(g){
  var cols=4, cw=(g.w-28)/cols;
  var start=0;
  for(var i=0;i<Math.min(CROPS.length,24);i++){`,
  `function renderSeedPanel(g){
  var cols=4, cw=(g.w-28)/cols;
  var perPage=24, pages=Math.max(1,Math.ceil(CROPS.length/perPage));
  if(seedPage>=pages) seedPage=0;
  var start=seedPage*perPage;
  for(var i=start;i<Math.min(CROPS.length,start+perPage);i++){`,
  '分页起点'
);
sub(
  `    var r={x:g.x+14+(i%cols)*cw,y:g.y+56+Math.floor(i/cols)*(cw*1.15),w:cw-4,h:cw*1.05};`,
  `    var j=i-start;
    var r={x:g.x+14+(j%cols)*cw,y:g.y+56+Math.floor(j/cols)*(cw*1.15),w:cw-4,h:cw*1.05};`,
  '分页布局'
);
sub(
  `  ctx.fillStyle='#5a3a14'; ctx.font='10px system-ui';
  ctx.fillText('🔒 的需要在超市「种子」页解锁（已解锁 '+Object.keys(unlocked).length+'/'+CROPS.length+'）',
    g.x+16,g.y+g.h-10);`,
  `  woodBtn(g.x+14,g.y+g.h-34,64,24,false,'上一页');
  hitRects.push({id:'seedPrev',x:g.x+14,y:g.y+g.h-34,w:64,h:24});
  woodBtn(g.x+g.w-78,g.y+g.h-34,64,24,false,'下一页');
  hitRects.push({id:'seedNext',x:g.x+g.w-78,y:g.y+g.h-34,w:64,h:24});
  ctx.fillStyle='#5a3a14'; ctx.font='10px system-ui'; ctx.textAlign='center';
  ctx.fillText('第 '+(seedPage+1)+'/'+pages+' 页 · 已解锁 '+Object.keys(unlocked).length+'/'+CROPS.length,
    g.x+g.w/2,g.y+g.h-17);
  ctx.textAlign='left';`,
  '分页按钮'
);
sub(
  `        if(b.id==='closePanel'){ panel=null; sfx(520,0.2); return; }`,
  `        if(b.id==='closePanel'){ panel=null; sfx(520,0.2); return; }
        if(b.id==='seedPrev'){ seedPage=Math.max(0,seedPage-1); return; }
        if(b.id==='seedNext'){ seedPage=seedPage+1; return; }`,
  '分页响应'
);
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
