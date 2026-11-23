const fs = require('node:fs');

// 1) 音乐增益可控（放电视时静音）
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1(`var AC=null;
function music(){`,
`var AC=null, musicGain=null;
/** 电视在放的时候把游戏音乐压掉，别和电视抢声音 */
function setMusicMuted(m){
  try{ if(musicGain) musicGain.gain.value = m ? 0 : 0.12; }catch(e){}
  try{ if(typeof TV!=='undefined') TV.musicMuted=!!m; }catch(e){}
}
function music(){`, '音乐增益');
sub1(`  AC=new C(); var master=AC.createGain(); master.gain.value=0; master.connect(AC.destination);`,
     `  AC=new C(); var master=AC.createGain(); master.gain.value=0; master.connect(AC.destination); musicGain=master;`, '保存增益');
sub1(`  window.__sfx=function(f,v){ try{ tone(0,f,0.22,'sine',v||0.3); }catch(e){} };`,
     `  window.__sfx=function(f,v){ try{ if(typeof TV!=='undefined'&&TV.musicMuted) return; tone(0,f,0.22,'sine',v||0.3); }catch(e){} };`, '音效也让位');
fs.writeFileSync(p1, t1, 'utf8');

// 2) 电视真正有画面时静音音乐；关掉/离开时恢复
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2(`    hls.on(Hls.Events.MANIFEST_PARSED,function(){
      TV.failed=false; TV.errMsg='';`,
`    hls.on(Hls.Events.MANIFEST_PARSED,function(){
      TV.failed=false; TV.errMsg='';
      setMusicMuted(true);`, 'HLS 就绪静音');

sub2(`  v.addEventListener('playing',function(){ TV.failed=false; TV.errMsg=''; try{ v.style.display='block'; }catch(e){} });`,
     `  v.addEventListener('playing',function(){ TV.failed=false; TV.errMsg=''; setMusicMuted(true); try{ v.style.display='block'; }catch(e){} });`, 'playing 静音');

sub2(`function unmountTv(){
  if(!TV.video) return;`,
`function unmountTv(){
  setMusicMuted(false);
  if(!TV.video) return;`, '卸载恢复音乐');

sub2(`  bar.appendChild(mk('关闭',function(){
    if(TV.box&&TV.box.parentNode) TV.box.parentNode.removeChild(TV.box);
    TV.box=null;
  },'#7a2a2a'));`,
`  bar.appendChild(mk('关闭',function(){
    if(TV.box&&TV.box.parentNode) TV.box.parentNode.removeChild(TV.box);
    TV.box=null;
    setMusicMuted(false);
  },'#7a2a2a'));`, '关闭恢复音乐');

sub2(`    var onEnd=function(){
      TV.full=false;`,
`    var onEnd=function(){
      TV.full=false;
      setMusicMuted(false);`, '退出全屏恢复');
fs.writeFileSync(p2, t2, 'utf8');
console.log('改了:', ok.concat(ok2).join(' / '));
