/**
 * 把 Live2D 的整套文件（模型/贴图/动作/运行时/样式/页面）生成成一个 TS 模块，
 * 运行时按**原始相对路径**写到手机本地目录，然后用 file:// 加载 —— 这样
 * live2d.js 里的相对路径（model.moc、textures/、motions/）全都能正常解析。
 *
 * 来源：https://github.com/galnetwen/Live2D （harem u.com/p/205 那篇里的 tia 模型）
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? 'C:/ts/tmp/live2d/Live2D-master/live2d';
const OUT = process.argv[3] ?? 'C:/ts/src/ui/live2dFiles.ts';

const bin = (p) => readFileSync(join(SRC, p)).toString('base64');
const txt = (p) => readFileSync(join(SRC, p), 'utf8');

const files = {};
// 运行时 + 样式
files['js/live2d.js'] = { text: txt('js/live2d.js') };
files['css/live2d.css'] = { text: txt('css/live2d.css') };
files['js/message.js'] = { text: txt('js/message.js') };
// 模型
files['model/tia/model.json'] = { text: txt('model/tia/model.json') };
files['model/tia/model.moc'] = { b64: bin('model/tia/model.moc') };
for (const t of readdirSync(join(SRC, 'model/tia/textures'))) {
  files[`model/tia/textures/${t}`] = { b64: bin(`model/tia/textures/${t}`) };
}
for (const m of readdirSync(join(SRC, 'model/tia/motions'))) {
  if (!m.endsWith('.mtn')) continue;
  files[`model/tia/motions/${m}`] = { b64: bin(`model/tia/motions/${m}`) };
}

// 页面：完全照原版写法（#landlord + canvas#live2d + loadlive2d），只是贴到左下角并缩放
const page = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="./css/live2d.css"/>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
  #stage{position:fixed;left:0;bottom:0;width:280px;height:250px;transform:scale(0.66);transform-origin:left bottom;}
  #landlord{display:block!important;position:static!important;left:auto!important;bottom:auto!important;width:280px;height:250px;background:transparent!important;}
  #live2d{background:transparent!important;}
  .hide-button{display:none!important;}
  .message{display:none!important;}
</style>
</head><body>
<div id="stage"><div id="landlord"><canvas id="live2d" width="280" height="250"></canvas></div></div>
<script>var message_Path = './live2d/'; var home_Path = './';</script>
<script src="./js/message.js"></script>
<script src="./js/live2d.js"></script>
<script>
(function(){
  function post(m){ try { window.ReactNativeWebView.postMessage(m); } catch(e) {} }
  function boot(){
    if (typeof loadlive2d !== 'function') { post('err:no-runtime'); return; }
    try { loadlive2d('live2d', './model/tia/model.json'); post('ok'); }
    catch(e) { post('err:' + (e && e.message ? e.message : e)); }
  }
  window.__poke = function(){
    try {
      var c = document.getElementById('live2d');
      c.dispatchEvent(new MouseEvent('click', { clientX: 140, clientY: 130, bubbles: true }));
    } catch(e) {}
  };
  window.addEventListener('load', boot);
})();
</script>
</body></html>`;
files['index.html'] = { text: page };

const entries = Object.entries(files)
  .map(([path, v]) => {
    if (v.text !== undefined) return `  ${JSON.stringify(path)}: { text: ${JSON.stringify(v.text)} },`;
    return `  ${JSON.stringify(path)}: { b64: ${JSON.stringify(v.b64)} },`;
  })
  .join('\n');

const ts = `/**
 * Live2D 整套文件（自动生成，别手改）。
 * 来源：https://github.com/galnetwen/Live2D —— 那篇教程里的 tia 模型 + live2d.js 运行时。
 * 生成脚本：tools/gen-live2d-assets.mjs
 */
export type Live2dFile = { text?: string; b64?: string };

export const LIVE2D_FILES: Record<string, Live2dFile> = {
${entries}
};
`;
mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, ts, 'utf8');
console.log('wrote', OUT, (Buffer.byteLength(ts, 'utf8') / 1024 / 1024).toFixed(2), 'MB', Object.keys(files).length, 'files');
