/**
 * 把 Live2D 看板娘打包成一个**完全自包含的 HTML**（所有模型/贴图/动作都内联成 data URI）。
 *
 * 来源：https://github.com/galnetwen/Live2D （作者整理的 tia 模型 + live2d.js 运行时，
 *      文章：https://haremu.com/p/205）
 *
 * 为什么要内联：RN 的 APK 里资源会被改名压平，WebView 里没法按相对路径加载
 * model.moc / textures / motions。内联之后 WebView 只要吃一个 html 就能跑，
 * 不联网、不依赖任何外部文件。
 *
 * 产物：assets/live2d/widget.html
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? 'C:/ts/tmp/live2d/Live2D-master/live2d';
const OUT = process.argv[3] ?? 'C:/ts/assets/live2d/widget.html';

const read = (p) => readFileSync(join(SRC, p));
const b64 = (p, mime) => `data:${mime};base64,${read(p).toString('base64')}`;

// ---- 1. 模型配置：把所有相对路径换掉 ----
const model = JSON.parse(read('model/tia/model.json').toString('utf8'));
model.model = b64('model/tia/model.moc', 'application/octet-stream');
model.textures = (model.textures ?? []).map((t) => b64(join('model/tia', t), 'image/png'));
const motionDir = 'model/tia/motions';
const motionFiles = readdirSync(join(SRC, motionDir)).filter((f) => f.endsWith('.mtn'));
model.motions = Object.fromEntries(
  Object.keys(model.motions ?? { '(none)': [] }).map((k) => [
    k,
    (model.motions[k] ?? [])
      .filter((m) => motionFiles.includes(m.file))
      .map((m) => ({ ...m, file: b64(join(motionDir, m.file), 'application/octet-stream') })),
  ]),
);
// 兜底：如果 model.json 里的 motions 结构和文件名对不上，就把所有动作都塞进 "tap_body"
if (Object.values(model.motions).every((arr) => arr.length === 0)) {
  model.motions = {
    idle: motionFiles.filter((f) => f.startsWith('Breath')).map((f, i) => ({
      file: b64(join(motionDir, f), 'application/octet-stream'),
      fade_in: i === 0 ? 500 : 0,
      fade_out: i === 0 ? 500 : 0,
    })),
    tap_body: motionFiles
      .filter((f) => f.startsWith('Touch') || f.startsWith('Success'))
      .map((f) => ({ file: b64(join(motionDir, f), 'application/octet-stream'), fade_in: 200, fade_out: 300 })),
  };
}

const runtime = read('js/live2d.js').toString('utf8');
const modelJson = JSON.stringify(model);

// ---- 2. 生成 HTML ----
// 原版样式也内联进来：live2d.js 依赖它给画布定位/尺寸
const css = read('css/live2d.css').toString('utf8');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
  /* 原版样式（#live2d 的绝对定位、尺寸都在里面） */
  ${css}
  /* 把原版 280x250 的画布整体缩到我们这块小地方，保持比例 */
  #wrap{position:fixed;left:0;bottom:0;width:280px;height:250px;transform:scale(0.52);transform-origin:left bottom;background:transparent;}
  #landlord{position:static!important;left:auto!important;bottom:auto!important;width:280px;height:250px;background:transparent!important;}
  #live2d{background:transparent!important;}
  .message{display:none!important;}
</style>
</head>
<body>
<div id="wrap">
  <div id="landlord"><canvas id="live2d" width="280" height="250"></canvas></div>
</div>
<script>${runtime}</script>
<script>
(function(){
  var MODEL = ${modelJson};
  function post(m){ try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  function boot(){
    if (typeof loadlive2d !== 'function') { post('err:no-runtime'); return; }
    try { loadlive2d('live2d', MODEL); post('ok'); }
    catch (e) { post('err:' + (e && e.message ? e.message : e)); }
  }
  window.__poke = function(){
    try {
      var c = document.getElementById('live2d');
      c.dispatchEvent(new MouseEvent('click', { clientX: 140, clientY: 120, bubbles: true }));
    } catch (e) {}
  };
  window.addEventListener('load', boot);
})();
</script>
</body>
</html>`;

mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, html, 'utf8');
console.log('wrote', OUT, (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0) + ' KB', 'motions:', Object.values(model.motions).flat().length);