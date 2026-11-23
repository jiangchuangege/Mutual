const fs = require('node:fs');

/* ---------- 1) 电视：贴到后墙上，小一点，不放中间 ---------- */
const p1 = 'C:/ts/src/core/farmRoomShop.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub(`function tvScreenRect(){
  var g=roomGeom2();
  var p=floorPoint(g,0.30,0.10);
  return {x:p.x-g.w*0.13,y:g.floorY-g.wallH*0.52,w:g.w*0.26,h:g.w*0.16};
}`,
`function tvScreenRect(){
  var g=roomGeom2();
  var w=Math.min(g.w*0.30,150);
  return {x:g.x+g.w*0.5-w/2, y:g.floorY-g.wallH*0.78, w:w, h:w*0.6};
}`, '电视位置');

sub(`  var tr=tvScreenRect();
  drawFurniture('cabinetTelevision',0,tr.x+tr.w/2,tr.y+tr.h+18,tr.h*0.55);
  ctx.fillStyle='#241f27'; rr(tr.x-5,tr.y-5,tr.w+10,tr.h+10,10); ctx.fill();
  ctx.fillStyle='#0d1420'; rr(tr.x,tr.y,tr.w,tr.h,7); ctx.fill();
  ctx.fillStyle='rgba(140,220,255,.20)'; rr(tr.x+4,tr.y+4,tr.w-8,tr.h-8,5); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='600 9px system-ui'; ctx.textAlign='center';
  ctx.fillText((typeof TV!=='undefined'&&CHANNELS[TV.ch]?CHANNELS[TV.ch].n:'CCTV-1')+' · 点电视全屏',
    tr.x+tr.w/2,tr.y+tr.h+14); ctx.textAlign='left';`,
`  var tr=tvScreenRect();
  // 电视柜
  drawFurniture('cabinetTelevision',0,tr.x+tr.w/2,tr.y+tr.h+22,tr.h*0.5);
  // 机框
  ctx.fillStyle='#241f27'; rr(tr.x-5,tr.y-5,tr.w+10,tr.h+10,9); ctx.fill();
  // 屏幕（视频元素盖在上面；没画面时这里显示提示）
  ctx.fillStyle='#0d1420'; rr(tr.x,tr.y,tr.w,tr.h,6); ctx.fill();
  var noSignal=(typeof TV!=='undefined')&&(TV.failed||!TV.mounted);
  ctx.fillStyle='rgba(160,220,255,'+(noSignal?0.9:0.18)+')';
  rr(tr.x+3,tr.y+3,tr.w-6,tr.h-6,5); ctx.fill();
  if(noSignal){
    ctx.fillStyle='#0d1420'; ctx.font='600 10px system-ui'; ctx.textAlign='center';
    ctx.fillText('📺 点我开电视',tr.x+tr.w/2,tr.y+tr.h/2-2);
    ctx.fillStyle='rgba(20,40,60,.75)'; ctx.font='9px system-ui';
    ctx.fillText(typeof TV!=='undefined'&&TV.errMsg?TV.errMsg:'CCTV 直播',tr.x+tr.w/2,tr.y+tr.h/2+12);
    ctx.textAlign='left';
  }
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='600 9px system-ui'; ctx.textAlign='center';
  ctx.fillText((typeof TV!=='undefined'&&CHANNELS[TV.ch]?CHANNELS[TV.ch].n:'CCTV-1')+' · 点电视全屏',
    tr.x+tr.w/2,tr.y+tr.h+40); ctx.textAlign='left';`, '电视画法');
fs.writeFileSync(p1, t1, 'utf8');

/* ---------- 2) 电视播放状态：失败就藏掉视频，露出提示 ---------- */
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2(`var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null};`,
     `var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null,failed:false,errMsg:''};`, '电视状态');

sub2(`  TV.video.style.left=(r.x+OFFX)+'px';
  TV.video.style.top=(r.y+SAFE)+'px';
  TV.video.style.width=r.w+'px';
  TV.video.style.height=r.h+'px';
  TV.video.style.borderRadius='7px';`,
`  TV.video.style.left=(r.x+OFFX+4)+'px';
  TV.video.style.top=(r.y+SAFE+4)+'px';
  TV.video.style.width=(r.w-8)+'px';
  TV.video.style.height=(r.h-8)+'px';
  TV.video.style.borderRadius='5px';
  TV.video.style.display=TV.failed?'none':'block';`, '电视尺寸');

sub2(`  hls.on(Hls.Events.MANIFEST_PARSED,function(){ TV.video.play().catch(function(){}); });`,
`    hls.on(Hls.Events.MANIFEST_PARSED,function(){
      TV.failed=false; TV.errMsg='';
      try{ TV.video.style.display='block'; }catch(e){}
      TV.video.play().catch(function(){});
    });
    hls.on(Hls.Events.ERROR,function(_e,data){
      if(data&&data.fatal){ TV.failed=true; TV.errMsg='连不上，换个台'; try{ TV.video.style.display='none'; }catch(e){} }
    });`, 'HLS 错误处理');

sub2(`    TV.video.src=url; TV.video.play().catch(function(){});`,
`    TV.video.src=url;
    TV.video.onerror=function(){ TV.failed=true; TV.errMsg='连不上，换个台'; try{ TV.video.style.display='none'; }catch(e){} };
    TV.video.play().then(function(){ TV.failed=false; TV.errMsg=''; }).catch(function(){ TV.failed=true; TV.errMsg='点一下开始播放'; });`, '原生播放兜底');
fs.writeFileSync(p2, t2, 'utf8');

/* ---------- 3) 超市动物卡片：把动物框进卡片 ---------- */
const p3 = 'C:/ts/src/core/farmEngine2.ts';
let t3 = fs.readFileSync(p3, 'utf8');
const from3 = `    } else if(it.kind==='animal'){
      drawAnimal2(ANIMALS[it.i],r.x+r.w*0.3,r.y+r.h*0.66,r.w*0.42,0,4);`;
const to3 = `    } else if(it.kind==='animal'){
      ctx.save();
      rr(r.x+2,r.y+2,r.w-4,r.h-4,9); ctx.clip();
      drawAnimal2(ANIMALS[it.i], r.x+r.w*0.28, r.y+r.h*0.86, r.h*0.5, 0, 4);
      ctx.restore();`;
if (t3.includes(from3)) { t3 = t3.replace(from3, to3); fs.writeFileSync(p3, t3, 'utf8'); console.log('动物卡片已裁剪'); }
else console.log('MISS 动物卡片');

console.log('改了:', ok.concat(ok2).join(' / '));
