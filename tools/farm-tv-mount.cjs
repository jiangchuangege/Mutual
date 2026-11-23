const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 进小屋自动挂上电视小屏；离开时拆掉（省流量/省电）
sub(`function render(){
  hitRects=[];`,
`function render(){
  hitRects=[];
  if(!TV.lastScene) TV.lastScene='';
  if(scene!==TV.lastScene){
    if(scene==='house'&&typeof mountRoomTv==='function') mountRoomTv();
    else if(TV.lastScene==='house'&&typeof unmountTv==='function') unmountTv();
    TV.lastScene=scene;
  }
  if(scene==='house'&&typeof syncTvRect==='function') syncTvRect();`, '进出小屋挂电视');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
