// 带 cookie + referer 走一遍 kenney.nl 的下载流程
const fs = require('node:fs');
const path = require('node:path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const hex = (s) => Buffer.from(s, 'utf8').toString('hex');

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
}
function absorb(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function get(url, extra) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookieHeader(), ...extra } });
  absorb(r);
  return r;
}

(async () => {
  const slugs = process.argv.slice(2);
  fs.mkdirSync(path.resolve('tmp/assets'), { recursive: true });
  for (const slug of slugs) {
    try {
      await get('https://kenney.nl/assets/' + slug);
      const id = hex('assets/' + slug);
      const r = await get('https://kenney.nl/download-link/' + id, {
        Referer: 'https://kenney.nl/assets/' + slug,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      });
      const text = await r.text();
      let j = {};
      try { j = JSON.parse(text); } catch { /* 非 json */ }
      console.log(slug, r.status, j.url ? 'URL OK' : text.slice(0, 60));
      if (!j.url) continue;
      const rz = await fetch(j.url, { headers: { 'User-Agent': UA, Referer: 'https://kenney.nl/' } });
      const buf = Buffer.from(await rz.arrayBuffer());
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        fs.writeFileSync(path.resolve('tmp/assets', slug + '.zip'), buf);
        console.log('   saved', (buf.length / 1024).toFixed(0) + 'KB');
      } else {
        console.log('   不是 zip:', rz.status, buf.toString('utf8').replace(/\s+/g, ' ').slice(0, 80));
      }
    } catch (e) {
      console.log(slug, 'ERR', String(e).slice(0, 100));
    }
  }
})();
