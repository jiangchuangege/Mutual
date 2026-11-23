const fs = require('node:fs');
(async () => {
  const r = await fetch('https://kenney.nl/assets/animal-pack-redux', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const h = await r.text();
  fs.writeFileSync('C:/ts/tmp/kenney-page.html', h, 'utf8');
  console.log('len', h.length);
  const zips = h.match(/[^"'\s>]+\.zip/g) || [];
  console.log('zip refs:', zips.slice(0, 6));
  const dl = h.match(/download[^>]{0,200}/gi) || [];
  console.log('download hints:', dl.slice(0, 6));
  const idx = h.toLowerCase().indexOf('.zip');
  console.log('context:', h.slice(Math.max(0, idx - 300), idx + 60));
})();
