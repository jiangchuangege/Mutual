/* 用 GitHub Git Data API 推送（api.github.com 可达，git 协议被墙）
 * 空仓库先用 Contents API 建一个 README 打底，再走 blob→tree→commit→ref。 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = 'C:/ts';
const OWNER = 'jiangchuangege';
const REPO = 'Mutual';
const BRANCH = 'main';

const token = (() => {
  const out = execFileSync('git', ['credential', 'fill'], {
    cwd: ROOT,
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const m = /^password=(.+)$/m.exec(out);
  if (!m) throw new Error('拿不到 token');
  return m[1].trim();
})();

const api = async (method, url, body) => {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      authorization: `token ${token}`,
      'user-agent': 'dsh',
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 200)}`);
  return data;
};

(async () => {
  // 0) 空仓库先打底（Contents API 在空仓库上可用）
  let headSha = null;
  try {
    const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    headSha = ref.object.sha;
    console.log('已有分支，head =', headSha.slice(0, 7));
  } catch {
    console.log('仓库为空，先用 README 打底…');
    const seed = await api('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
      message: 'init',
      content: Buffer.from('# Mutual\n\n初始化仓库，随后导入源码。\n', 'utf8').toString('base64'),
      branch: BRANCH,
    });
    headSha = seed.commit.sha;
    console.log('打底 commit =', headSha.slice(0, 7));
  }

  const baseTree = (
    await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${headSha}`)
  ).tree.sha;

  // 1) 待提交文件
  const list = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const files = [];
  for (const rel of list) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > 40 * 1024 * 1024) continue;
    files.push({ rel: rel.split(path.sep).join('/'), abs, size: st.size });
  }
  console.log(`文件 ${files.length} 个，合计 ${(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)} MB`);

  // 2) blob（并发 6）
  const entries = [];
  let done = 0;
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
        content: fs.readFileSync(f.abs).toString('base64'),
        encoding: 'base64',
      });
      entries.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
      done += 1;
      if (done % 25 === 0 || done === files.length) console.log(`  blob ${done}/${files.length}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  // 3) tree + commit + ref
  console.log('创建 tree…');
  const tree = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: baseTree, tree: entries });
  console.log('创建 commit…');
  const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'Mutual v2.0.9: couples app (cinema sync / listen together / game library / cloud build)',
    tree: tree.sha,
    parents: [headSha],
  });
  console.log('更新 ref…');
  await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
  console.log('✅ 已推送 commit', commit.sha.slice(0, 7));
  console.log(`https://github.com/${OWNER}/${REPO}`);
})().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
