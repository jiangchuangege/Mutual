const fs = require('node:fs');
const p = 'C:/ts/tools/server-cloudbuild-deploy.sh';
let t = fs.readFileSync(p, 'utf8');
const before = '(cd out && zip -q app.apk classes.dex)';
const after = '# classes.dex 必须以"根目录"的形式进 APK，所以进 dex 目录里压\n(cd out/dex && zip -q ../app.apk classes.dex)';
if (t.includes(before)) {
  t = t.replace(before, after);
  fs.writeFileSync(p, t, 'utf8');
  console.log('已修正 zip 路径');
} else if (t.includes(after)) {
  console.log('已是修正后的版本');
} else {
  console.log('没找到 zip 行，请检查脚本');
}
