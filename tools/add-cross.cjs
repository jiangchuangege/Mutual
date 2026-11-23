const fs = require('node:fs');
const p = 'C:/ts/src/core/gameVoxel.ts';
let t = fs.readFileSync(p, 'utf8');
if (!t.includes('id="cross"')) {
  const cross =
    '<canvas id="c"></canvas>\n' +
    '<div id="cross" style="position:fixed;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none;opacity:.75">' +
    '<div style="position:absolute;left:8px;top:0;width:2px;height:18px;background:#fff"></div>' +
    '<div style="position:absolute;top:8px;left:0;height:2px;width:18px;background:#fff"></div></div>';
  t = t.replace('<canvas id="c"></canvas>', cross);
  fs.writeFileSync(p, t, 'utf8');
  console.log('准星已加');
} else {
  console.log('已有准星');
}
