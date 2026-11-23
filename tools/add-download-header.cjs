const fs = require('node:fs');
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');

// serveUpload 里给游戏/音频加 Content-Disposition（浏览器才会当附件下载、保住 .apk 扩展名）
const anchor = `  res.writeHead(200, {
    'content-type': type,
    'content-length': buf.length,`;
if (!t.includes('content-disposition')) {
  t = t.replace(
    anchor,
    `  res.writeHead(200, {
    'content-type': type,
    'content-length': buf.length,
    // 关键：告诉浏览器"这是附件、文件名是这个"。
    // 不加的话，部分浏览器（尤其国产浏览器/微信内置）会把 .apk 当未知类型处理，
    // 用户点了既不下载也不提示安装（用户实测）。
    'content-disposition': \`attachment; filename="\${safe}"\`,` +
      `\n    'x-content-type-options': 'nosniff',`
  );
  fs.writeFileSync(p, t, 'utf8');
}
console.log('已加 Content-Disposition:', t.includes('content-disposition'));
