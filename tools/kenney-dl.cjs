// 通过 kenney.nl 的 download-link 接口拿签名地址并下载
const fs = require('node:fs');
const path = require('node:path');
const UA = { 'User-Agent': 'Mozilla/5.0' };
const hex = (s) => Buffer.from(s, 'utf8').toString('hex');

(async () => {
  const slugs = process.argv.slice(2);
  fs.mkdirSync(path.resolve('tmp/assets'), { recursive: true });
  for (const slug of slugs) {
    try {
      const id = hex('assets/' + slug);
      const r = await fetch('https://kenney.nl/download-link/' + id, { headers: UA });
      const j = await r.json();
      console.log(slug, '→', j.url ? j.url.slice(0, 90) + '…' : JSON.stringify(j).slice(0, 80));
      if (!j.url) continue;
      const rz = await fetch(j.url, { headers: UA });
      const buf = Buffer.from(await rz.arrayBuffer());
      console.log('   ', rz.status, (buf.length / 1024).toFixed(0) + 'KB', rz.headers.get('content-type'));
      if (buf.length > 2000 && buf[0] === 0x50 && buf[1] === 0x4b) {
        fs.writeFileSync(path.resolve('tmp/assets', slug + '.zip'), buf);
        console.log('    saved');
      }
    } catch (e) {
      console.log(slug, 'ERR', String(e).slice(0, 120));
    }
  }
})();
