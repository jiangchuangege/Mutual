const fs = require('node:fs');

/* ---------- 1) 视口：支持手动"竖屏/横屏" ---------- */
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1(`var OFFX=0, SAFE=26, LANDSCAPE=false, REALW=0, REALH=0;
function layout(){
  REALW=window.innerWidth; REALH=window.innerHeight;
  LANDSCAPE=REALW>REALH*1.05;
  var availH=REALH-SAFE;
  VW=REALW; VH=availH; OFFX=0;
  c.width=REALW*DPR|0; c.height=REALH*DPR|0;
  c.style.width=REALW+'px'; c.style.height=REALH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}`,
`var OFFX=0, SAFE=26, LANDSCAPE=false, REALW=0, REALH=0;
/* 手动视口：''=跟随手机方向，'portrait'=强制竖屏布局，'landscape'=强制横屏布局 */
var viewMode='';
function layout(){
  REALW=window.innerWidth; REALH=window.innerHeight;
  var availH=REALH-SAFE;
  var deviceLand=REALW>REALH*1.05;
  if(viewMode==='portrait'){
    // 竖屏布局；如果手机是横着的，就居中留边（还是竖屏的样子）
    var vw=Math.min(REALW, Math.round(availH*0.56));
    VW=vw; VH=availH; OFFX=Math.round((REALW-vw)/2); LANDSCAPE=false;
  } else if(viewMode==='landscape'){
    VW=REALW; VH=availH; OFFX=0; LANDSCAPE=true;
  } else {
    VW=REALW; VH=availH; OFFX=0; LANDSCAPE=deviceLand;
  }
  c.width=REALW*DPR|0; c.height=REALH*DPR|0;
  c.style.width=REALW+'px'; c.style.height=REALH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}`, '视口模式');

// 存档里带上视口模式
sub1("    (typeof TV!=='undefined'&&TV.custom)?encodeURIComponent(TV.custom):''].join('|');",
     "    (typeof TV!=='undefined'&&TV.custom)?encodeURIComponent(TV.custom):'',viewMode].join('|');", '存视口模式');
sub1("    if(seg[14]&&typeof TV!=='undefined'){ try{ TV.custom=decodeURIComponent(seg[14]); }catch(e){} }",
     "    if(seg[14]&&typeof TV!=='undefined'){ try{ TV.custom=decodeURIComponent(seg[14]); }catch(e){} }\n    if(seg[15]==='portrait'||seg[15]==='landscape'){ viewMode=seg[15]; layout(); }", '读视口模式');

// 顶部加一个"竖屏/横屏"切换按钮
sub1(`function hudRow2(){
  return [
    {id:'bag',label:'📦',x:12,y:42,w:34,h:26},
    {id:'quest',label:'📜',x:50,y:42,w:34,h:26},
    {id:'seeds',label:'🌱种子库',x:88,y:42,w:78,h:26}
  ];
}`,
`function hudRow2(){
  return [
    {id:'bag',label:'📦',x:12,y:42,w:34,h:26},
    {id:'quest',label:'📜',x:50,y:42,w:34,h:26},
    {id:'seeds',label:'🌱种子库',x:88,y:42,w:78,h:26},
    {id:'view',label:LANDSCAPE?'🖥横屏':'📱竖屏',x:Math.max(172,VW-96),y:42,w:84,h:26}
  ];
}`, '视口按钮');
fs.writeFileSync(p1, t1, 'utf8');

/* ---------- 2) 点击处理：切换视口 ---------- */
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2(`    var r20=hudRow2();
    for(var j0=0;j0<r20.length;j0++){
      var b0=r20[j0];
      if(px>=b0.x&&px<=b0.x+b0.w&&py>=b0.y&&py<=b0.y+b0.h){
        panel=(b0.id==='seeds')?'seeds':b0.id; sfx(700,0.2); return;
      }
    }`,
`    var r20=hudRow2();
    for(var j0=0;j0<r20.length;j0++){
      var b0=r20[j0];
      if(px>=b0.x&&px<=b0.x+b0.w&&py>=b0.y&&py<=b0.y+b0.h){
        if(b0.id==='view'){
          // 竖屏 ↔ 横屏（强制模式，跟手机方向无关）
          viewMode=LANDSCAPE?'portrait':'landscape';
          layout();
          toast(viewMode==='portrait'?'已切到竖屏布局':'已切到横屏布局','#2b4a2b');
          sfx(700,0.22); netSend(true); return;
        }
        panel=(b0.id==='seeds')?'seeds':b0.id; sfx(700,0.2); return;
      }
    }`, '视口点击');
fs.writeFileSync(p2, t2, 'utf8');
console.log('改了:', ok.concat(ok2).join(' / '));
