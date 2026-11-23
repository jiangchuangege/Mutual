// 用本机 Chrome 无头渲染农场，截图用于人工验画面
// headless Chrome 的最小窗口是 500x749，所以用脚本把 innerWidth/innerHeight 覆盖成手机尺寸
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildFarmHtml } = require('../dist-core/gameFarm.js');

const mode = process.argv[2] || 'ready';
const W = Number(process.argv[3] || 390);
const H = Number(process.argv[4] || 844);
const out = path.resolve('tmp');
fs.mkdirSync(out, { recursive: true });

const viewport = `<script>
(function(){
  var W=${W}, H=${H};
  Object.defineProperty(window,'innerWidth',{get:function(){return W},configurable:true});
  Object.defineProperty(window,'innerHeight',{get:function(){return H},configurable:true});
  Object.defineProperty(window,'devicePixelRatio',{get:function(){return 2},configurable:true});
})();
</script>`;

const warp = `<script>
(function(){
  var raf=window.requestAnimationFrame, t0=null, boost=${mode === 'ready' ? 3 : 1};
  window.requestAnimationFrame=function(cb){
    return raf(function(ts){ if(t0===null) t0=ts; cb(t0+(ts-t0)*boost); });
  };
})();
</script>`;

const kick = `<script>
(function(){
  var W=${W}, H=${H};
  var go=document.getElementById('go');
  function tap(x,y){
    var c=document.getElementById('c');
    c.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
  }
  var boardTop=(H<640?74:92), bw=Math.min(W-20,382), bx=(W-bw)/2;
  var bh=bw*(H<640?0.72:0.79);
  var shopH=(H<640?64:78), shopY=H-shopH-6;
  var penH=(H<640?84:106), penY=shopY-10-penH;
  var cellH=(shopH-20)/2;
  setTimeout(function(){
    if(go) go.click();
    /* 播种：每种作物播 2 块 */
    for(var i=0;i<12;i++){
      var sel=Math.floor(i/2);
      var sx=25+ (sel%3)*(340/3) +20, sy=(sel<3? shopY+18+cellH*0.5 : shopY+18+cellH*1.5);
      tap(sx,sy);
      var px=bx+(bw/4)*((i%4)+0.5), py=boardTop+(bh/3)*(Math.floor(i/4)+0.5);
      tap(px,py);
    }
    /* 前 3 块浇水 */
    for(var w2=0;w2<3;w2++){
      var px2=bx+(bw/4)*(w2+0.5), py2=boardTop+(bh/3)*0.5;
      tap(px2,py2); tap(px2,py2);
    }
    /* 喂三只动物 */
    tap(60, penY+penH*0.6);
    tap(W/2, penY+penH*0.6);
    tap(W-60, penY+penH*0.6);
  },150);
})();
</script>`;

let html = buildFarmHtml();
html = html.replace('<style>', viewport + warp + '<style>');
html = html.replace('</body>', kick + '</body>');
if (process.env.PANEL) {
  const extra = `<script>setTimeout(function(){
    var W=${W}, H=${H};
    var c=document.getElementById('c');
    function tap(x,y){ c.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true})); }
    var boardTop=(H<640?74:92), bw=Math.min(W-20,382), bx=(W-bw)/2, bh=bw*(H<640?0.72:0.79);
    for(var r=0;r<3;r++) for(var q=0;q<4;q++) tap(bx+(bw/4)*(q+0.5), boardTop+(bh/3)*(r+0.5));
    var shopH=(H<640?64:78), shopY=H-shopH-6, penH=(H<640?84:106), penY=shopY-10-penH;
    tap(60, penY+penH*0.6); tap(W/2, penY+penH*0.6); tap(W-60, penY+penH*0.6);
    setTimeout(function(){
      tap(W-(${process.env.PANEL === 'bag' ? 104 : 56})+20, 32);
    }, 500);
  },1600);</script>`;
  html = html.replace('</body>', extra + '</body>');
}

const file = path.join(out, 'farm-' + mode + '.html');
fs.writeFileSync(file, html, 'utf8');

const shot = path.join(out, 'farm-' + mode + '.png');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--window-size=' + Math.max(500, W + 20) + ',' + Math.max(749, H + 20),
  '--virtual-time-budget=8000',
  '--screenshot=' + shot, 'file:///' + file.replace(/\\/g, '/'),
], { stdio: 'ignore' });
console.log('截图:', shot, fs.statSync(shot).size, 'bytes');
