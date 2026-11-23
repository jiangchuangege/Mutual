const H = { 'User-Agent': 'twospace-assets', Accept: 'application/vnd.github+json' };
async function api(url) {
  const r = await fetch(url, { headers: H });
  return { status: r.status, json: r.ok ? await r.json() : null };
}
(async () => {
  const q = [
    'animal-pack-redux',
    'kenney animal sprite sheet png',
    'furniture 2d sprites cc0',
    'interior tileset cc0 png',
  ];
  for (const s of q) {
    const d = await api(`https://api.github.com/search/repositories?q=${encodeURIComponent(s)}&per_page=8&sort=stars`);
    console.log('\n== repo:', s, d.status);
    for (const r of d.json?.items || []) {
      console.log(` ${r.full_name} ★${r.stargazers_count} lic=${r.license?.spdx_id || 'none'}`);
    }
  }
  for (const s of ['animal-pack-redux in:path', 'kenney furniture in:path']) {
    const d = await api(`https://api.github.com/search/code?q=${encodeURIComponent(s)}&per_page=5`);
    console.log('\n== code:', s, d.status, (d.json?.items || []).map((i) => i.repository.full_name + ':' + i.path).join(' | '));
  }
})();
