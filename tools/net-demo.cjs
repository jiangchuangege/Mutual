// 生成"双人联机"浏览器验证页：两个 iframe 各跑一份游戏，包在两个 iframe 之间互转。
// 用来验证：① 我的按键会镜像给对方 ② 两边 Math.random 一致 ③ 两边局面完全相同。
const fs = require('node:fs');
const path = require('node:path');
const { buildNetShim, seedOf } = require('../dist-core/gameNet.js');

const SEED = seedOf('verify:game');
const GAME = `
window.S = { x: 0, hits: 0, rolls: [], keys: [] };
function render(){
  var el = document.getElementById('out');
  if (el) el.textContent = JSON.stringify({ x: S.x, hits: S.hits, r: S.rolls.join(',') });
}
document.addEventListener('keydown', function(e){
  if (e.key === 'ArrowRight') S.x += 1;
  if (e.key === 'ArrowLeft') S.x -= 1;
  if (e.key === 'd') S.x -= 1;
  if (e.key === 'a') S.x += 1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'd' || e.key === 'a') {
    S.hits += 1;
    S.rolls.push(Math.round(Math.random() * 1e6));
    S.keys.push(e.key);
    render();
  }
});
render();
`;

function frame(role) {
  return `<!doctype html><html><head><meta charset="utf-8">
<script>
window.__ROLE = '${role}';
window.ReactNativeWebView = { postMessage: function(m){ parent.postMessage({ r: window.__ROLE, m: String(m) }, '*'); } };
</script>
<script>${buildNetShim({ role, seed: SEED, throttleMs: 40 })}</script>
<style>body{margin:0;background:#111;color:#0f0;font:12px monospace}#out{white-space:pre-wrap}</style>
</head><body><div id="out"></div><script>${GAME}</script></body></html>`;
}

const page = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}iframe{width:50%;height:40vh;border:0}</style>
</head><body>
<iframe id="fa" srcdoc="${frame('A').replace(/"/g, '&quot;')}"></iframe>
<iframe id="fb" srcdoc="${frame('B').replace(/"/g, '&quot;')}"></iframe>
<script>
// 父页面充当"App + 服务端"：把一端的 TW_NET 包转发给另一端
window.__log = [];
window.addEventListener('message', function(ev){
  var d = ev.data || {};
  if (!d.m || d.m.indexOf('TW_NET:') !== 0) return;
  var other = d.r === 'A' ? 'B' : 'A';
  var fr = document.getElementById(other === 'A' ? 'fa' : 'fb');
  try {
    fr.contentWindow.TwNet.applyRemote(d.m.slice('TW_NET:'.length));
    window.__log.push(d.r + '>' + other);
  } catch (e) { window.__log.push('ERR ' + e.message); }
});

/* 测试辅助：往某个 iframe 里真的按一下键 */
window.__press = function(role, key){
  var fr = document.getElementById(role === 'A' ? 'fa' : 'fb');
  var doc = fr.contentDocument;
  ['keydown', 'keyup'].forEach(function(type){
    var e = new doc.defaultView.KeyboardEvent(type, { key: key, bubbles: true });
    doc.body.dispatchEvent(e);
  });
};
window.__state = function(role){
  var fr = document.getElementById(role === 'A' ? 'fa' : 'fb');
  return fr.contentWindow.S;
};
</script>
</body></html>`;

const out = path.resolve('tmp/net-demo.html');
fs.writeFileSync(out, page, 'utf8');
console.log(out);
