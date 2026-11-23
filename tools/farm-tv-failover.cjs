const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) hls.js 换成国内 CDN 优先
sub("  s.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';",
    "  s.src=(typeof HLS_CDNS!=='undefined'?HLS_CDNS[0]:'https://cdn.bootcdn.net/ajax/libs/hls.js/1.5.13/hls.min.js');", 'hls CDN');
sub(`function loadHls(cb){
  if(window.Hls){ cb(); return; }`,
`var HLS_CDNS=['https://cdn.bootcdn.net/ajax/libs/hls.js/1.5.13/hls.min.js',
  'https://lib.baomitu.com/hls.js/1.5.13/hls.min.js',
  'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'];
function loadHls(cb){
  if(window.Hls){ cb(); return; }`, 'hls 候选 CDN');
sub(`  s.onload=done; s.onerror=done;
  document.head.appendChild(s);`,
`  var ci=0;
  function tryNext(){
    if(ci>=HLS_CDNS.length){ done(); return; }
    var el=document.createElement('script');
    el.src=HLS_CDNS[ci++];
    el.onload=function(){ done(); };
    el.onerror=function(){ tryNext(); };
    document.head.appendChild(el);
  }
  tryNext();`, 'hls 依次尝试');

// 2) 频道候选源：公开播放列表 + 预设备用源 + 自定义源，逐个试
sub(`function playChannel(k){
  TV.ch=k;
  if(!TV.video) return;
  var url=CHANNELS[k]?CHANNELS[k].u:CHANNELS[0].u;`,
`var TV_LIST={}, TV_LIST_LOADED=false, TV_TRY=0;
var TV_PLAYLISTS=['https://cdn.jsdelivr.net/gh/iptv-org/iptv@master/streams/cn.m3u',
  'https://iptv-org.github.io/iptv/countries/cn.m3u'];
function loadChannelList(cb){
  if(TV_LIST_LOADED){ cb(); return; }
  var i=0;
  function next(){
    if(i>=TV_PLAYLISTS.length){ TV_LIST_LOADED=true; cb(); return; }
    var url=TV_PLAYLISTS[i++];
    try{
      fetch(url,{cache:'no-store'}).then(function(r){ return r.text(); }).then(function(txt){
        var name='', got=0;
        txt.split('\\n').forEach(function(line){
          line=line.trim();
          if(line.indexOf('#EXTINF')===0){
            var m=line.match(/,(.+)$/);
            name=m?m[1].trim():'';
          } else if(line&&line.indexOf('#')!==0&&name){
            var mm=name.match(/CCTV[-\\s]?(\\d+)/i);
            if(mm){
              var key='cctv'+mm[1];
              if(!TV_LIST[key]){ TV_LIST[key]=[]; }
              if(TV_LIST[key].length<3&&TV_LIST[key].indexOf(line)<0){ TV_LIST[key].push(line); got++; }
            }
            name='';
          }
        });
        if(got>0){ TV_LIST_LOADED=true; cb(); } else next();
      }).catch(function(){ next(); });
    }catch(e){ next(); }
  }
  next();
}
function tvCandidates(k){
  var ch=CHANNELS[k]||CHANNELS[0];
  var out=[];
  if(TV.custom){ out.push(TV.custom); }
  var l=TV_LIST[ch.key]; if(l) l.forEach(function(u){ if(out.indexOf(u)<0) out.push(u); });
  if(ch.u&&out.indexOf(ch.u)<0) out.push(ch.u);
  (ch.alt||[]).forEach(function(u){ if(out.indexOf(u)<0) out.push(u); });
  return out;
}
function playChannel(k,tryIdx){
  TV.ch=k;
  if(!TV.video) return;
  TV_TRY=tryIdx||0;
  var cands=tvCandidates(k);
  var url=cands[TV_TRY];
  if(!url){ TV.failed=true; TV.errMsg='源都连不上'; return; }
  TV.failed=true; TV.errMsg='连接中…';`, '候选源');

// 3) 单个源失败 → 试下一个
sub(`    hls.on(Hls.Events.ERROR,function(_e,data){
      if(data&&data.fatal){ TV.failed=true; TV.errMsg='连不上，换个台'; try{ TV.video.style.display='none'; }catch(e){} }
    });`,
`    hls.on(Hls.Events.ERROR,function(_e,data){
      if(data&&data.fatal){
        try{ hls.destroy(); }catch(e){}
        TV.hls=null;
        playChannel(k, (TV_TRY||0)+1);
      }
    });`, '失败换源');
sub(`    TV.video.onerror=function(){ TV.failed=true; TV.errMsg='连不上，换个台'; try{ TV.video.style.display='none'; }catch(e){} };`,
    `    TV.video.onerror=function(){ playChannel(k, (TV_TRY||0)+1); };`, '原生失败换源');

// 4) 状态里存自定义源
sub('var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null,failed:true,errMsg:\'\'};',
    'var TV={video:null,ch:0,hls:null,mounted:false,full:false,box:null,failed:true,errMsg:\'\',custom:\'\'};', 'TV.custom');

// 5) 首次挂载时先拉播放列表
sub(`  syncTvRect();
  playChannel(TV.ch);
  loadHls(function(){ playChannel(TV.ch); });`,
`  syncTvRect();
  loadHls(function(){
    loadChannelList(function(){ playChannel(TV.ch); });
  });`, '挂载时拉列表');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
