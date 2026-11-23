const fs = require('node:fs');
const p = 'C:/ts/tools/server-cloudbuild-deploy.sh';
let t = fs.readFileSync(p, 'utf8');
if (!t.includes('mkdir -p out/classes out/dex')) {
  t = t.replace('cd "$W"\n', 'cd "$W"\nmkdir -p out/classes out/dex\n');
  fs.writeFileSync(p, t, 'utf8');
  console.log('已补 mkdir');
} else {
  console.log('已有 mkdir');
}
