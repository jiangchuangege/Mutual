const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

// 1) 源码体积上限：从 400KB 提到 8MB（真正的边界是请求体与编译时间，不是这个数字）
t = t.replace(
  "  if (total > 400_000) return { ok: false, error: '源码太大了（上限约 400KB）' };",
  "  // 软上限：只是防呆（一次 JSON 请求里塞太多会很慢）。真要更大就走分片/资产分开传。\n  if (total > 8_000_000) return { ok: false, error: '源码超过 8MB，请把资源（图片/音频）作为 assets 单独传' };"
);

// 2) 支持 assets/ 资源随包打进 APK（aapt2 用 -A 指定资源目录）
t = t.replace(
  "  const javaFiles = files.filter((f) => /\\.java$/i.test(f?.name ?? '') && typeof f.content === 'string');",
  `  const javaFiles = files.filter((f) => /\\.java$/i.test(f?.name ?? '') && typeof f.content === 'string');
  // 除 java 之外的都当资源：路径里带 assets/ 或任意文件名 → 打进 APK 的 assets/
  const assetFiles = files.filter(
    (f) => typeof f?.content === 'string' && !/\\.java$/i.test(f?.name ?? ''),
  );`
);
t = t.replace(
  "    mkdirSync(path.join(work, 'out/classes'), { recursive: true });",
  "    mkdirSync(path.join(work, 'out/classes'), { recursive: true });"
);
t = t.replace(
  "    fs.mkdirSync(path.join(work, 'out/dex'), { recursive: true });",
  `    fs.mkdirSync(path.join(work, 'out/dex'), { recursive: true });
    // 资源目录：content 为 base64 的二进制（图片/音频），或纯文本
    const assetsDir = path.join(work, 'assets');
    if (assetFiles.length > 0) fs.mkdirSync(assetsDir, { recursive: true });
    for (const a of assetFiles) {
      const rel = String(a.name).replace(/^assets\\//, '').replace(/[^\\w./-]/g, '');
      if (!rel) continue;
      const dest = path.join(assetsDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const b64 = String(a.content).startsWith('base64:') ? String(a.content).slice(7) : null;
      if (b64) fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
      else fs.writeFileSync(dest, a.content);
    }`
);
t = t.replace(
  "      '--manifest', path.join(work, 'AndroidManifest.xml'), path.join(work, 'out/res.zip'),",
  "      '--manifest', path.join(work, 'AndroidManifest.xml'), path.join(work, 'out/res.zip'),\n      ...(assetFiles.length > 0 ? ['-A', path.join(work, 'assets')] : []),"
);

// 3) minSdk 可配（默认 24；传 21 就覆盖 Android 5.0+）
t = t.replace(
  "export function buildApk(input) {",
  "export function buildApk(input) {\n  const minSdk = Math.max(21, Math.min(34, Number(input?.minSdk) || 24));"
);
t = t.replace(/--min-sdk-version', '24'/g, "--min-sdk-version', String(minSdk)");
t = t.replace(/<uses-sdk android:minSdkVersion="24"/g, '<uses-sdk android:minSdkVersion="${minSdk}"');
t = t.replace(
  "sh(path.join(BT, 'd8'), ['--lib', AJAR, '--min-api', '24', '--output', path.join(work, 'out/dex'), ...classes]);",
  "sh(path.join(BT, 'd8'), ['--lib', AJAR, '--min-api', String(minSdk), '--output', path.join(work, 'out/dex'), ...classes]);"
);

fs.writeFileSync(p, t, 'utf8');
console.log('buildApk 已更新:', {
  源码上限: t.includes('8_000_000'),
  assets支持: t.includes("assetsDir"),
  minSdk可配: t.includes('const minSdk = Math.max(21'),
});
