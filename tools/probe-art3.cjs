const H = { 'User-Agent': 'twospace-assets', Accept: 'application/vnd.github+json' };
async function api(url) {
  const r = await fetch(url, { headers: H });
  if (!r.ok) return { status: r.status, json: null };
  return { status: r.status, json: await r.json() };
}
(async () => {
  const repo = 'nonamecat660/animal-pack-redux';
  const info = await api(`https://api.github.com/repos/${repo}`);
  console.log('repo', info.status, info.json?.default_branch, info.json?.license?.spdx_id, info.json?.size);
  const tree = await api(`https://api.github.com/repos/${repo}/git/trees/${info.json?.default_branch}?recursive=1`);
  console.log('tree', tree.status);
  const files = (tree.json?.tree || []).filter((n) => n.type === 'blob');
  console.log('文件数', files.length);
  for (const f of files.slice(0, 60)) console.log(' ', f.path, f.size);
  // 顺便测一下 kenney.nl / opengameart 通不通
  for (const u of ['https://kenney.nl/assets/animal-pack-redux', 'https://opengameart.org/', 'https://cdn.jsdelivr.net/gh/nonamecat660/animal-pack-redux@main/']) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log('reach', r.status, u);
    } catch (e) {
      console.log('reach ERR', u, String(e).slice(0, 60));
    }
  }
})();
