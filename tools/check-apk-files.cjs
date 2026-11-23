// 看这两个 APK 的包名/大小，判断能不能进库（服务端上限约 99MB 原文件）
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { packageNameOfApk, looksLikeApk } = require('../dist-core/apkInfo.js');

const dir = 'C:/Users/Jiao/Downloads';
const files = fs.readdirSync(dir).filter((f) => /\.apk$/i.test(f));
for (const f of files) {
  const full = path.join(dir, f);
  const stat = fs.statSync(full);
  const bytes = new Uint8Array(fs.readFileSync(full));
  const pkg = packageNameOfApk(bytes, (b) => zlib.inflateRawSync(b));
  console.log(
    f,
    '|', (stat.size / 1024 / 1024).toFixed(1) + 'MB',
    '| 是APK:', looksLikeApk(bytes),
    '| 包名:', pkg ?? '解析失败',
    '| base64 约', (Math.ceil(stat.size / 3) * 4 / 1024 / 1024).toFixed(1) + 'MB',
  );
}
