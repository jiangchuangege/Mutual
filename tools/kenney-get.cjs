// 从 kenney.nl 抓下载链接并下载 CC0 素材包
const fs = require('node:fs');
const path = require('node:path');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

async function pageHtml(slug) {
  const r = await fetch(`https://kenney.nl/assets/${slug}`, { headers: UA });
  if (!r.ok) throw new Error('page ' + r.status + ' ' + slug);
  return r.text();
}
function findZip(html) {
  const m = html.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"'\s]+\.zip/);
  return m ? m[0] : null;
}
(async () => {
  const slugs = process.argv.slice(2);
  const outDir = path.resolve('tmp/assets');
  fs.mkdirSync(outDir, { recursive: true });
  for (const slug of slugs) {
    try {
      const html = await pageHtml(slug);
      const zip = findZip(html);
      console.log(slug, '→', zip || 'NO ZIP');
      if (!zip) continue;
      const r = await fetch(zip, { headers: UA });
      const buf = Buffer.from(await r.arrayBuffer());
      const f = path.join(outDir, slug + '.zip');
      fs.writeFileSync(f, buf);
      console.log('   下载', (buf.length / 1024).toFixed(0) + 'KB', '->', f);
    } catch (e) {
      console.log(slug, 'ERR', String(e).slice(0, 120));
    }
  }
})();
