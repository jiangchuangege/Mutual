const fs = require('node:fs');

/* ---------- 1) WebView：文件型游戏放开 file:// 的网络访问 ---------- */
const p1 = 'C:/ts/src/app/games.tsx';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1(`        mixedContentMode="compatibility"
        allowFileAccess`,
`        mixedContentMode="compatibility"
        allowFileAccess
        /*
         * 文件型游戏（从手机选文件上传的那种）是从 file:// 加载的，Chromium 把这种页面
         * 当成"不透明来源"，默认禁止跨域请求 —— 连 WebSocket 都发不出去（一直卡在连接中）。
         * 这两个开关放开 file:// 页面的跨域能力，网络才恢复。
         *
         * 安全性：allowUniversalAccessFromFileURLs 等于对该页面放开同源策略，只在这种情况下
         * 可以接受 —— 页面内容是用户自己导入的单个 HTML 文件，且运行在独立 WebView 里，
         * 碰不到 App 的 JS 上下文。改完记得别用它加载任何远程/第三方页面。
         */
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs`, 'WebView 放开 file:// 跨域');
fs.writeFileSync(p1, t1, 'utf8');

/* ---------- 2) 电视：全屏/覆盖层也要用"当前源"（含自定义源） ---------- */
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2(`  playIn(v,TV.ch);
  function playIn(el,k){
    var url=CHANNELS[k]?CHANNELS[k].u:CHANNELS[0].u;
    if(window.Hls&&Hls.isSupported()){
      var hls=new Hls({enableWorker:true});
      hls.loadSource(url); hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED,function(){ el.play().catch(function(){}); });
    } else { el.src=url; el.play().catch(function(){}); }
  }`,
`  playIn(v,TV.ch,0);
  /** 覆盖层里放的也是"当前源"（自定义源优先），并且逐个试候选源 */
  function playIn(el,k,idx){
    var cands=tvCandidates(k);
    var url=cands[idx||0];
    if(!url){ return; }
    function failed(){ playIn(el,k,(idx||0)+1); }
    if(window.Hls&&Hls.isSupported()){
      var hls=new Hls({enableWorker:true});
      hls.loadSource(url); hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED,function(){ el.play().catch(function(){}); });
      hls.on(Hls.Events.ERROR,function(_e,d){ if(d&&d.fatal){ try{ hls.destroy(); }catch(e){} failed(); } });
    } else {
      el.onerror=failed;
      el.src=url; el.play().catch(function(){});
    }
  }`, '覆盖层用当前源');
fs.writeFileSync(p2, t2, 'utf8');

/* ---------- 3) 电视更小、挂高一点，不占家具区 ---------- */
const p3 = 'C:/ts/src/core/farmRoomShop.ts';
let t3 = fs.readFileSync(p3, 'utf8');
const ok3 = [];
function sub3(from, to, tag) { if (!t3.includes(from)) { console.log('MISS', tag); return; } t3 = t3.replace(from, to); ok3.push(tag); }

sub3(`function tvScreenRect(){
  var g=roomGeom2();
  var wallH=g.wallH;
  var w=Math.min(g.w*0.26, Math.min(170, wallH*1.65));
  var h=w*0.60;
  var y=g.floorY-h-wallH*0.12;
  if(y<g.y+10) y=g.y+10;
  return {x:g.x+g.w*0.62-w/2, y:y, w:w, h:h};
}`,
`function tvScreenRect(){
  var g=roomGeom2();
  var wallH=g.wallH;
  // 挂小一点、挂高一点：只占墙面，不压家具区
  var w=Math.min(g.w*0.18, Math.min(120, wallH*1.15));
  var h=w*0.60;
  var y=g.y+wallH*0.18;
  if(y+h>g.floorY-6) y=Math.max(g.y+8, g.floorY-h-6);
  return {x:g.x+g.w*0.70-w/2, y:y, w:w, h:h};
}`, '电视更小挂高');

// 电视柜改成小搁板（不再在墙脚占家具位置）
sub3(`  drawFurniture('cabinetTelevision',0,tr.x+tr.w/2,g.floorY+8,Math.max(34,tr.h*0.42));`,
`  ctx.fillStyle='rgba(138,95,56,.9)';
  rr(tr.x-6,tr.y+tr.h+4,tr.w+12,5,2); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.18)';
  rr(tr.x+2,tr.y+tr.h+9,tr.w-4,3,1.5); ctx.fill();`, '电视只留搁板');

fs.writeFileSync(p3, t3, 'utf8');
console.log('改了:', ok.concat(ok2).concat(ok3).join(' / '));
