const fs = require('node:fs');

/* ============ 1) games.tsx：html 游戏给一个 baseUrl（localStorage 可用）+ 打开 storage ============ */
const p1 = 'C:/ts/src/app/games.tsx';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1(`            : {
                html:
                  game.builtin === 'voxel3d'
                    ? buildVoxelHtml()
                    : game.builtin === 'farm'
                      ? buildFarmHtml(role)
                      : buildRuntimeHtml(game.assetPath ? '' : game.code),
              }`,
`            : {
                html:
                  game.builtin === 'voxel3d'
                    ? buildVoxelHtml()
                    : game.builtin === 'farm'
                      ? buildFarmHtml(role)
                      : buildRuntimeHtml(game.code),
                /*
                 * 给一个假的 https 来源：这样 page 的 origin 不是 about:blank/不透明来源，
                 * localStorage 才能用（游戏自己存世界存档用），跨域也更宽松。
                 * 游戏都是单文件、CDN 全写绝对地址，所以不受相对路径影响。
                 */
                baseUrl: 'https://game.mutual.local/',
              }`, 'baseUrl');

sub1(`        javaScriptEnabled
        domStorageEnabled={false}`,
`        javaScriptEnabled
        // 游戏要用 localStorage 存自己的世界存档，必须打开
        domStorageEnabled
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs`, 'domStorage');
fs.writeFileSync(p1, t1, 'utf8');

/* ============ 2) 引擎：本地存档（localStorage）+ 只上报"真改动" ============ */
const p2 = 'C:/ts/src/core/farmEngine1.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2(`var restoredOnce=false;   // 有没有收到过对方的世界（决定"这次改动要不要广播）"）`,
     `var restoredOnce=false;   // 有没有收到过对方的世界（决定"这次改动要不要广播"）`, 'noop');

sub2(`var restoredOnce=false;   // 有没有收到过对方的世界（决定"这次改动要不要广播"）`,
`var restoredOnce=false;   // 有没有收到过对方的世界（决定"这次改动要不要广播"）
/* 本机存档：WebView 的 localStorage（baseUrl 是 https，所以可用）。退出重进先读它。 */
var LS_KEY='mutual_farm_v1';
function saveLocalNow(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify({ts:Date.now(),w:enc()})); }catch(e){}
}
function loadLocalSave(){
  try{
    var raw=localStorage.getItem(LS_KEY);
    if(!raw) return null;
    var o=JSON.parse(raw);
    return (o&&o.w&&String(o.w).indexOf('v4')===0)?o:null;
  }catch(e){ return null; }
}`, '本地存档函数');

// 启动时先读本机存档
sub2(`dayKey=today();`,
`dayKey=today();
/* 先把本机存档读回来（比等服务器/等对方快，也避免"退出重进回默认值"） */
var __localSave=loadLocalSave();
if(__localSave){ try{ dec(__localSave.w); restoredOnce=true; }catch(e){} }`, '启动读本机存档');

// 每隔两秒写一次本机存档
sub2(`    tick++;
    checkDay();`,
`    tick++;
    if(tick%120===0) saveLocalNow();
    checkDay();`, '定时写本机存档');
fs.writeFileSync(p2, t2, 'utf8');

// 离开页面/切后台时立刻存一次
const p3 = 'C:/ts/src/core/farmEngine2.ts';
let t3 = fs.readFileSync(p3, 'utf8');
const ok3 = [];
function sub3(from, to, tag) { if (!t3.includes(from)) { console.log('MISS', tag); return; } t3 = t3.replace(from, to); ok3.push(tag); }
sub3(`c.addEventListener('touchstart',function(e){ downT=performance.now();`,
`addEventListener('pagehide',function(){ saveLocalNow(); });
addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden') saveLocalNow(); });
c.addEventListener('touchstart',function(e){ downT=performance.now();`, '页面隐藏时存档');
fs.writeFileSync(p3, t3, 'utf8');

console.log('改了:', ok.concat(ok2).concat(ok3).filter((x) => x !== 'noop').join(' / '));
