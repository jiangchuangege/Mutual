const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const s = t.indexOf('/* ================= 电视（DOM 覆盖层） ================= */');
const e = t.indexOf('/* ================= 输入 ================= */');
if (s < 0 || e < 0) throw new Error('没找到电视段');

const tv = `/* ================= 电视：常驻在小屋里的小屏 + 点击全屏 ================= */
var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null};
var hlsLoading=false, hlsCbs=[];
function loadHls(cb){
  if(window.Hls){ cb(); return; }
  hlsCbs.push(cb);
  if(hlsLoading) return;
  hlsLoading=true;
  var s2=document.createElement('script');
  s2.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
  function done(){
    hlsLoading=false;
    var cbs=hlsCbs.slice(); hlsCbs=[];
    for(var i=0;i<cbs.length;i++){ try{ cbs[i](); }catch(e){} }
  }
  s2.onload=done; s2.onerror=done;
  document.head.appendChild(s2);
}
/** 把 video 元素贴到电视屏幕的位置上（小屋刚进/窗口变化时调用） */
function syncTvRect(){
  if(!TV.video||!TV.mounted) return;
  if(TV.full) return;
  var r=(typeof tvScreenRect==='function')?tvScreenRect():null;
  if(!r) return;
  TV.video.style.left=r.x+'px';
  TV.video.style.top=r.y+'px';
  TV.video.style.width=r.w+'px';
  TV.video.style.height=r.h+'px';
  TV.video.style.borderRadius='7px';
}
function mountRoomTv(){
  if(TV.mounted) { syncTvRect(); return; }
  var v=document.createElement('video');
  v.id='roomtv';
  v.muted=true; v.autoplay=true; v.playsInline=true; v.controls=false;
  v.style.cssText='position:fixed;z-index:20;object-fit:cover;background:#0d1420;pointer-events:none';
  document.body.appendChild(v);
  TV.video=v; TV.mounted=true;
  syncTvRect();
  playChannel(TV.ch);
  loadHls(function(){ playChannel(TV.ch); });
}
function unmountTv(){
  if(!TV.video) return;
  try{ TV.video.pause(); }catch(e){}
  if(TV.video.parentNode) TV.video.parentNode.removeChild(TV.video);
  TV.hls&&TV.hls.destroy&&TV.hls.destroy();
  TV.hls=null; TV.video=null; TV.mounted=false; TV.full=false;
}
function playChannel(k){
  TV.ch=k;
  if(!TV.video) return;
  var url=CHANNELS[k]?CHANNELS[k].u:CHANNELS[0].u;
  if(TV.hls){ try{ TV.hls.destroy(); }catch(e){} TV.hls=null; }
  if(window.Hls&&Hls.isSupported()){
    var hls=new Hls({enableWorker:true,lowLatencyMode:true});
    TV.hls=hls;
    hls.loadSource(url); hls.attachMedia(TV.video);
    hls.on(Hls.Events.MANIFEST_PARSED,function(){ TV.video.play().catch(function(){}); });
  } else if(TV.video.canPlayType&&TV.video.canPlayType('application/vnd.apple.mpegurl')){
    TV.video.src=url; TV.video.play().catch(function(){});
  } else {
    loadHls(function(){ if(window.Hls) playChannel(k); });
  }
}
/** 点电视：全屏看；不支持全屏就弹一个覆盖层 */
function openTVFull(){
  mountRoomTv();
  var v=TV.video;
  if(!v) return;
  if(v.requestFullscreen){
    TV.full=true;
    v.style.left='0px'; v.style.top='0px';
    v.style.width='100%'; v.style.height='100%';
    v.style.zIndex='999'; v.style.pointerEvents='auto'; v.controls=true;
    var onEnd=function(){
      TV.full=false;
      v.style.zIndex='20'; v.style.pointerEvents='none'; v.controls=false;
      syncTvRect();
      document.removeEventListener('fullscreenchange',onEnd);
    };
    document.addEventListener('fullscreenchange',onEnd);
    v.requestFullscreen().catch(function(){ onEnd(); openTVOverlay(); });
    try{ v.muted=false; v.play().catch(function(){}); }catch(e){}
  } else {
    openTVOverlay();
  }
}
/** 兜底：全屏 API 不可用时用覆盖层 */
function openTVOverlay(){
  if(TV.box) return;
  var d=document.createElement('div');
  d.id='tvbox';
  d.style.cssText='position:fixed;inset:0;background:#000;z-index:990;display:flex;flex-direction:column';
  var v=document.createElement('video');
  v.muted=false; v.autoplay=true; v.playsInline=true; v.controls=true;
  v.style.cssText='flex:1;width:100%;min-height:0;background:#000;object-fit:contain';
  var bar=document.createElement('div');
  bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#111';
  function mk(txt,fn,col){
    var b=document.createElement('button');
    b.textContent=txt;
    b.style.cssText='flex:1 0 auto;min-width:60px;padding:8px;border-radius:8px;border:0;color:#fff;font:600 12px system-ui;background:'+(col||'#2b2b33');
    b.onclick=fn; return b;
  }
  for(var i=0;i<CHANNELS.length;i++){
    (function(k){
      bar.appendChild(mk(CHANNELS[k].n.replace('CCTV-',''),function(){ playIn(v,k); },TV.ch===k?'#c2543a':'#2b2b33'));
    })(i);
  }
  bar.appendChild(mk('关闭',function(){
    if(TV.box&&TV.box.parentNode) TV.box.parentNode.removeChild(TV.box);
    TV.box=null;
  },'#7a2a2a'));
  d.appendChild(v); d.appendChild(bar);
  document.body.appendChild(d);
  TV.box=d;
  playIn(v,TV.ch);
  function playIn(el,k){
    var url=CHANNELS[k]?CHANNELS[k].u:CHANNELS[0].u;
    if(window.Hls&&Hls.isSupported()){
      var hls=new Hls({enableWorker:true});
      hls.loadSource(url); hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED,function(){ el.play().catch(function(){}); });
    } else { el.src=url; el.play().catch(function(){}); }
  }
}

`;
t = t.slice(0, s) + tv + t.slice(e);
fs.writeFileSync(p, t, 'utf8');
console.log('电视改成常驻小屏 + 全屏');
