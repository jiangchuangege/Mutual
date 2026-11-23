const fs = require('node:fs');
const p = 'C:/ts/tools/sunnyside-game.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 每块地有独立边框，别连成一个大方块
sub(`    if (kind === G.SOIL) {
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(sx, sy, S, S);`,
`    if (kind === G.SOIL) {
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(sx, sy, S, S);
      ctx.fillStyle = 'rgba(50,28,14,.45)';
      ctx.fillRect(sx, sy, S, 2);
      ctx.fillRect(sx, sy, 2, S);
      ctx.fillStyle = 'rgba(255,225,190,.10)';
      ctx.fillRect(sx + 2, sy + 2, S - 2, 2);`, '地块独立边框');

// 2) 木箱搬到视野里（菜园右下角外侧）
sub("      crate: { x: 14, y: 8 },", "      crate: { x: 12.2, y: 11.2 },", '木箱进画面');
sub(`    ctx.drawImage(img.crate, crate.x * TS, crate.y * TS, TS, TS);
    ctx.drawImage(img.crateTop, crate.x * TS, crate.y * TS - 4, TS, TS * 0.6);`,
`    ctx.drawImage(img.crate, crate.x * TS, crate.y * TS, TS * 1.4, TS * 1.4);
    ctx.drawImage(img.crateTop, crate.x * TS, crate.y * TS - 5, TS * 1.4, TS * 0.8);
    ctx.fillStyle = 'rgba(20,14,8,.55)';
    ctx.fillRect(crate.x * TS, crate.y * TS + TS * 1.4 + 2, TS * 1.4, 8);
    ctx.fillStyle = '#ffe9b8';
    ctx.font = '6px monospace';
    ctx.fillText('卖货箱', crate.x * TS + 2, crate.y * TS + TS * 1.4 + 9);`, '木箱绘制');

// 3) 菜园里两只鸡别跑出去（限制活动范围）
sub(`      const nx = a.x + a.dir * dt * 0.6;
      const tx = Math.floor(nx), ty = Math.floor(a.y);
      if (tx > 1 && tx < MW - 2 && ty > 1 && ty < MH - 2 && tileAt(tx, ty) !== G.WATER) a.x = nx;
      else a.dir *= -1;`,
`      const nx = a.x + a.dir * dt * 0.6;
      const tx = Math.floor(nx), ty = Math.floor(a.y);
      const isChicken = a.k === 'animal_chicken_01';
      const inPen = !isChicken || (tx >= 4 && tx <= 12 && ty >= 6 && ty <= 12);
      if (inPen && tx > 1 && tx < MW - 2 && ty > 1 && ty < MH - 2 && tileAt(tx, ty) !== G.WATER) a.x = nx;
      else a.dir *= -1;`, '鸡待在园子里');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
