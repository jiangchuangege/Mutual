const fs = require('node:fs');
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p2, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) "locked" 语义反了：改成 done（已经拥有）
sub("out.push({kind:'seed',i:i,n:CROPS[i].n,p:CROPS[i].seed*4,sub:CROPS[i].g+'秒 · 卖'+CROPS[i].sell,locked:!unlocked[i]});",
    "out.push({kind:'seed',i:i,n:CROPS[i].n,p:CROPS[i].seed*4,sub:CROPS[i].g+'秒 · 卖'+CROPS[i].sell,done:!!unlocked[i]});",
    '种子 done');
sub("out.push({kind:'pen',i:0,n:'扩建畜栏',p:600*Math.max(1,penCount-2),sub:'现在 '+penCount+' 个（最多 6）',locked:penCount>=6});",
    "out.push({kind:'pen',i:0,n:'扩建畜栏',p:600*Math.max(1,penCount-2),sub:'现在 '+penCount+' 个（最多 6）',done:penCount>=6});",
    '畜栏 done');
sub("  if(it.locked){ toast('这个不需要再买了'); sfx(300,0.2); return; }",
    "  if(it.done){ toast(it.kind==='pen'?'畜栏已经满了':'这个已经解锁了'); sfx(300,0.2); return; }",
    'buyMarket done');
sub("    var canBuy=!it.locked&&coins>=it.p;",
    "    var canBuy=!it.done&&coins>=it.p;",
    '按钮状态');
sub("      it.locked?(it.kind==='seed'?'已解锁':'上限'):(it.p+'金'));",
    "      it.done?(it.kind==='seed'?'已解锁':'上限'):(it.p+'金'));",
    '按钮文字');

// 2) HLS 只加载一次，多个回调排队
sub(
  `function loadHls(cb){
  if(window.Hls){ cb(); return; }
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
  s.onload=function(){ cb(); };
  s.onerror=function(){ cb(); };
  document.head.appendChild(s);
}`,
  `var hlsLoading=false, hlsCbs=[];
function loadHls(cb){
  if(window.Hls){ cb(); return; }
  hlsCbs.push(cb);
  if(hlsLoading) return;
  hlsLoading=true;
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
  function done(){
    hlsLoading=false;
    var cbs=hlsCbs.slice(); hlsCbs=[];
    for(var i=0;i<cbs.length;i++){ try{ cbs[i](); }catch(e){} }
  }
  s.onload=done; s.onerror=done;
  document.head.appendChild(s);
}`,
  'HLS 排队'
);
fs.writeFileSync(p2, t, 'utf8');
console.log('改了:', ok.join(' / '));
