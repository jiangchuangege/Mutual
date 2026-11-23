const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const from = `  var s2=document.createElement('script');
  s2.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
  function done(){
    hlsLoading=false;
    var cbs=hlsCbs.slice(); hlsCbs=[];
    for(var i=0;i<cbs.length;i++){ try{ cbs[i](); }catch(e){} }
  }
  s2.onload=done; s2.onerror=done;
  document.head.appendChild(s2);`;
const to = `  function done(){
    hlsLoading=false;
    var cbs=hlsCbs.slice(); hlsCbs=[];
    for(var i=0;i<cbs.length;i++){ try{ cbs[i](); }catch(e){} }
  }
  var ci=0;
  function tryNext(){
    if(ci>=HLS_CDNS.length){ done(); return; }
    var el=document.createElement('script');
    el.src=HLS_CDNS[ci++];
    el.onload=function(){ done(); };
    el.onerror=function(){ tryNext(); };
    document.head.appendChild(el);
  }
  tryNext();`;
if (!t.includes(from)) throw new Error('没找到 hls 加载段');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('hls.js 三个 CDN 依次尝试');
