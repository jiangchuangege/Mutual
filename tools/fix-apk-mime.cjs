const fs = require('node:fs');
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');

if (!t.includes('apk:')) {
  // GAME_EXT 里补 apk（否则 /game/xxx.apk 会 404，App 下载失败=点卡片没反应）
  t = t.replace(
    /const GAME_EXT = \{[^}]*\};/,
    "const GAME_EXT = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', wasm: 'application/wasm', data: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', ogg: 'audio/ogg', json: 'application/json', apk: 'application/vnd.android.package-archive' };"
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log('GAME_EXT 已加 apk:', t.includes("apk: 'application/vnd.android.package-archive'"));
} else {
  console.log('已有 apk MIME');
}
