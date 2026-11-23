const fs = require('node:fs');
const p = 'C:/ts/android/app/src/main/AndroidManifest.xml';
let t = fs.readFileSync(p, 'utf8');
if (!t.includes('REQUEST_INSTALL_PACKAGES')) {
  // 插在第一个 uses-permission 之前（或 manifest 开头之后）
  const anchor = '<uses-permission';
  const idx = t.indexOf(anchor);
  const perm = '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n';
  if (idx >= 0) {
    t = t.slice(0, idx) + perm + t.slice(idx);
  } else {
    t = t.replace(/<manifest([^>]*)>/, `<manifest$1>\n${perm}`);
  }
  fs.writeFileSync(p, t, 'utf8');
  console.log('已写入 REQUEST_INSTALL_PACKAGES');
} else {
  console.log('已有该权限');
}
const lines = t.split('\n').filter((l) => l.includes('uses-permission') || l.includes('<manifest'));
console.log(lines.slice(0, 6).join('\n'));
