#!/usr/bin/env node
/**
 * 往 Mutual 的游戏库里加游戏的命令行小工具（用的是服务器上的 /api/game/add 接口）。
 *
 * 用法：
 *   node tools/add-game.mjs --server https://你的域名 --token <账号token> --file ./game.html
 *   node tools/add-game.mjs --server https://你的域名 --token <账号token> --file ./game.apk --title "我的小游戏"
 *   node tools/add-game.mjs --server https://你的域名 --token <账号token> --code ./game.html  # 当代码加（≤8MB，进同步状态）
 *
 * 说明：
 *   --file  走上传（≤99MB，服务器 /game/ 目录，两个人点卡片都能下载着玩）
 *   --code  直接塞进状态（小文件快，但会占同步体积）
 *   token 可以在 App 的「设置 → 我的账号」里看到登录令牌，或用 server 的 /api/login 拿。
 */
const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const server = (arg('server', process.env.MUTUAL_SERVER) || '').replace(/\/+$/, '');
const token = arg('token', process.env.MUTUAL_TOKEN) || '';
const file = arg('file', '');
const codeFile = arg('code', '');
const title = arg('title', '');

if (!server || !token || (!file && !codeFile)) {
  console.log(
    [
      '用法：',
      '  node tools/add-game.mjs --server https://your.host --token <token> --file ./game.html [--title 名字]',
      '  node tools/add-game.mjs --server https://your.host --token <token> --code ./game.html [--title 名字]',
      '',
      '也可以先用环境变量：MUTUAL_SERVER / MUTUAL_TOKEN',
    ].join('\n'),
  );
  process.exit(1);
}

const target = file || codeFile;
if (!fs.existsSync(target)) {
  console.error('文件不存在：' + target);
  process.exit(1);
}
const buf = fs.readFileSync(target);
const ext = (path.extname(target).replace('.', '') || 'html').toLowerCase();
const name = title || path.basename(target).replace(/\.[^.]+$/, '');

(async () => {
  const body = codeFile
    ? { title: name, code: buf.toString('utf8') }
    : { title: name, data: buf.toString('base64'), ext };
  const url = server + '/api/game/add';
  console.log(`→ POST ${url}（${file ? '上传文件' : '上传代码'}，${(buf.length / 1024).toFixed(0)}KB）`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok || !data.ok) {
    console.error('失败：', res.status, JSON.stringify(data).slice(0, 400));
    process.exit(2);
  }
  const spec = data.value || {};
  console.log('✔ 已加入游戏库：');
  console.log('  标题：' + (spec.title ?? name));
  console.log('  id  ：' + (spec.id ?? '?'));
  console.log('  地址：' + (spec.assetPath ?? '(代码已进状态)'));
  console.log('两个人打开 App 的「游戏」页就能看到它。');
})();
