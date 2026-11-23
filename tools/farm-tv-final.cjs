const fs = require('node:fs');

// 1) 电视挪到右半边墙，别压窗户；默认先不显示视频（等真的有画面再显示）
const p1 = 'C:/ts/src/core/farmRoomShop.ts';
let t1 = fs.readFileSync(p1, 'utf8');
t1 = t1.replace(
  '  return {x:g.x+g.w*0.5-w/2, y:g.floorY-g.wallH*0.78, w:w, h:w*0.6};',
  '  return {x:g.x+g.w*0.64-w/2, y:g.floorY-g.wallH*0.74, w:w, h:w*0.6};',
);
fs.writeFileSync(p1, t1, 'utf8');
console.log('电视挪到右墙');

const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok.push(tag); }

// 默认当作"没有画面"，只有真的播起来才显示视频
sub2('var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null,failed:false,errMsg:\'\'};',
     'var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null,failed:true,errMsg:\'\'};', '默认无画面');

function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok.push(tag); }

// 视频元素一有画面就显示
sub2(`  TV.video=v; TV.mounted=true;`,
`  v.addEventListener('playing',function(){ TV.failed=false; TV.errMsg=''; try{ v.style.display='block'; }catch(e){} });
  v.addEventListener('error',function(){ TV.failed=true; TV.errMsg='连不上，换个台'; try{ v.style.display='none'; }catch(e){} });
  TV.video=v; TV.mounted=true;`, 'playing 事件');

fs.writeFileSync('C:/ts/src/core/farmEngine2.ts', t2, 'utf8');
console.log('改了:', ok.join(' / '));
