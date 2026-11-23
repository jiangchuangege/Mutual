const H = { 'user-agent': 'dsh', accept: 'application/vnd.github+json' };
const api = async (url) => {
  const r = await fetch('https://api.github.com' + url, { headers: H });
  if (!r.ok) return null;
  return r.json();
};

(async () => {
  const q = 'farm game in:name language:JavaScript';
  const s = await api(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=10`);
  if (!s || !s.items) { console.log('搜索失败'); return; }
  for (const it of s.items.slice(0, 8)) {
    const lic = it.license ? it.license.spdx_id : 'none';
    const tree = await api(`/repos/${it.full_name}/git/trees/${it.default_branch}?recursive=1`);
    let png = 0, pngMB = 0, code = 0;
    if (tree && tree.tree) {
      for (const f of tree.tree) {
        if (/\.(png|jpg|webp)$/i.test(f.path)) { png += 1; pngMB += f.size || 0; }
        if (/\.(js|html)$/i.test(f.path)) code += 1;
      }
    }
    console.log(
      `${it.full_name}  ★${it.stargazers_count}  lic=${lic}  图${png}张/${(pngMB / 1048576).toFixed(1)}MB  代码${code}个  ${(it.description || '').slice(0, 50)}`,
    );
  }
})();
