const H = { 'User-Agent': 'twospace-probe', Accept: 'application/vnd.github+json' };
async function j(url) {
  const r = await fetch(url, { headers: H });
  if (!r.ok) return { err: r.status };
  return r.json();
}
(async () => {
  const qs = [
    'kenney+farming+crops',
    'kenney+crops+sprite',
    'farm+crops+tileset+kenney',
    'kenney+plant+crops',
  ];
  for (const q of qs) {
    const d = await j(`https://api.github.com/search/repositories?q=${q}&per_page=6&sort=stars`);
    console.log('\n== ' + q + ' ==', d.err || '');
    for (const r of d.items || []) {
      console.log(`${r.full_name} ★${r.stargazers_count} lic=${r.license ? r.license.spdx_id : 'none'}`);
    }
  }
})();
