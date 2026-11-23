const fs = require('node:fs');
const path = require('node:path');
const UA = { 'User-Agent': 'Mozilla/5.0' };
const base = 'https://kenney.nl/media/pages/assets/';

async function head(u) {
  try {
    const r = await fetch(u, { headers: UA });
    const len = r.headers.get('content-length');
    return { ok: r.ok, status: r.status, type: r.headers.get('content-type'), len };
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 80) };
  }
}
(async () => {
  const page = fs.readFileSync('C:/ts/tmp/kenney-page.html', 'utf8');
  const media = [...page.matchAll(/https:\/\/kenney\.nl\/media\/pages\/assets\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9_.-]+)/g)]
    .map((m) => ({ slug: m[1], hash: m[2], file: m[3] }));
  console.log('media refs:', media.slice(0, 6));
  const uniq = new Map(media.map((m) => [m.slug + '/' + m.hash, m]));
  for (const m of uniq.values()) {
    const cands = [
      `${base}${m.slug}/${m.hash}/kenney_${m.slug}.zip`,
      `${base}${m.slug}/${m.hash}/${m.slug}.zip`,
      `${base}${m.slug}/${m.hash}/kenney-${m.slug}.zip`,
    ];
    for (const u of cands) {
      const h = await head(u);
      console.log(h.status, h.type, h.len, u.replace(base, ''));
      if (h.ok && String(h.type).includes('zip')) {
        const r = await fetch(u, { headers: UA });
        const buf = Buffer.from(await r.arrayBuffer());
        const out = path.resolve('tmp/assets', m.slug + '.zip');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, buf);
        console.log('  下载成功', (buf.length / 1024).toFixed(0) + 'KB');
      }
    }
  }
})();
