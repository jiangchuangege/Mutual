const fs = require('node:fs');
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');

// 上传容量：单文件按 99MB 设计（base64 ≈ 132MB），请求体上限放到 200MB
t = t.replace(/const GAME_MAX_B64 = \d+ \* 1024 \* 1024;/, 'const GAME_MAX_B64 = 140 * 1024 * 1024; // ≈99MB 原文件（base64 后 132MB）');
t = t.replace(/const AUDIO_MAX_B64 = \d+ \* 1024 \* 1024;/, 'const AUDIO_MAX_B64 = 40 * 1024 * 1024; // ≈30MB 音频');
t = t.replace(/if \(raw\.length > \d+ \* 1024 \* 1024\) \{/, 'if (raw.length > 200 * 1024 * 1024) {');
t = t.replace("error: '这个文件太大了（上限约 60MB）'", "error: '这个文件太大了（上限 99MB）'");
t = t.replace("error: '这首歌太大了（上限约 18MB），换一首小一点的'", "error: '这首歌太大了（上限约 30MB），换一首小一点的'");

fs.writeFileSync(p, t, 'utf8');
const g = /const GAME_MAX_B64 = (\d+)/.exec(t);
const r = /raw\.length > (\d+)/.exec(t);
console.log('游戏上限 base64:', g ? Math.round(+g[1] / 1024 / 1024) + 'MB' : '未改',
  '| 请求体上限:', r ? Math.round(+r[1] / 1024 / 1024) + 'MB' : '未改',
  '| 99MB 文案:', t.includes('上限 99MB'));
