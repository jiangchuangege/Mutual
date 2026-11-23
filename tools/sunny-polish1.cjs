const fs = require('node:fs');
const p = 'C:/ts/tools/sunnyside-game.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 地面改成程序化绘制：草地/小路/菜地/水，避免图集拼接的格子缝和砖块感
sub(`  function drawTile(kind, tx, ty, sx, sy) {
    const g = TILE_OF[kind] || TILE_OF[G.GRASS];
    const pick = g[(tx * 7 + ty * 13) % g.length];
    ctx.drawImage(SHEET(), pick[0] * TS, pick[1] * TS, TS, TS, sx, sy, TS * ZOOM, TS * ZOOM);
  }`,
`  /** 稳定的伪随机（同一格永远同一个值，纹路不抖） */
  function rnd(x, y, n) {
    let h = (x * 374761393 + y * 668265263 + n * 69069) | 0;
    h = (h ^ (h >> 13)) * 1274126177 + 2000000;
    return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
  }

  /** 程序化地面：草地 / 小路 / 菜地 / 水（比图集拼块干净，不会有接缝感） */
  function drawTile(kind, tx, ty, sx, sy) {
    const S = TS * ZOOM;
    if (kind === G.GRASS) {
      ctx.fillStyle = '#63c74d';
      ctx.fillRect(sx, sy, S, S);
      const r = rnd(tx, ty, 1);
      if (r > 0.72) {
        ctx.fillStyle = '#57b745';
        ctx.fillRect(sx + (r * 40 % 30), sy + ((r * 90) % 30), 6, 3);
      }
      if (r < 0.12) {
        ctx.fillStyle = '#8be06f';
        ctx.fillRect(sx + ((r * 200) % 36), sy + ((r * 130) % 30), 3, 6);
      }
      if (r > 0.94) {
        ctx.fillStyle = '#f2e17a';
        ctx.fillRect(sx + 24, sy + 20, 6, 6);
        ctx.fillStyle = '#e06b8a';
        ctx.fillRect(sx + 27, sy + 17, 3, 3);
      }
      return;
    }
    if (kind === G.PATH) {
      ctx.fillStyle = '#e0b27a';
      ctx.fillRect(sx, sy, S, S);
      const r = rnd(tx, ty, 2);
      ctx.fillStyle = 'rgba(150,105,60,.25)';
      ctx.fillRect(sx + (r * 60 % 36), sy + (r * 110 % 36), 9, 6);
      ctx.fillRect(sx + (r * 20 % 30), sy + 42, 6, 6);
      return;
    }
    if (kind === G.SOIL) {
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(sx, sy, S, S);
      // 垄沟
      ctx.fillStyle = 'rgba(60,35,20,.28)';
      ctx.fillRect(sx, sy + 6, S, 6);
      ctx.fillRect(sx, sy + 26, S, 6);
      ctx.fillRect(sx, sy + 40, S, 4);
      ctx.fillStyle = 'rgba(255,220,180,.10)';
      ctx.fillRect(sx, sy + 2, S, 3);
      const r = rnd(tx, ty, 3);
      ctx.fillStyle = 'rgba(40,22,12,.25)';
      ctx.fillRect(sx + (r * 70 % 40), sy + (r * 50 % 40), 4, 3);
      return;
    }
    // 水
    ctx.fillStyle = '#2f8fd8';
    ctx.fillRect(sx, sy, S, S);
    ctx.fillStyle = 'rgba(120,210,245,.55)';
    const wob = Math.sin(performance.now() / 700 + tx * 0.7 + ty) * 4;
    ctx.fillRect(sx + 4 + wob, sy + 12, 18, 4);
    ctx.fillRect(sx + 22 - wob, sy + 34, 14, 4);
  }`, '程序化地面');

// 2) 角色脚下位置修正（帧是 96x64，实际人只有 11x15，脚在 y=38）
sub(`          const feet = 38;
          ctx.save();
          ctx.translate(p.x * TS, p.y * TS + TS - feet + 6);`,
`          const feet = 38;
          ctx.save();
          ctx.translate(p.x * TS, p.y * TS + TS - 2);`, '角色落脚');

// 3) 角色放大一点点，别太小
sub(`          if (p.dir === 3) ctx.scale(-1, 1);
          ctx.drawImage(im, Math.max(0, frame) * fw, 0, fw, im.height, -fw / 2, 0, fw, im.height);`,
`          var cs = 1.35;                       // 人物放大 1.35 倍，看着更清楚
          if (p.dir === 3) ctx.scale(-1, 1);
          ctx.drawImage(im, Math.max(0, frame) * fw, 0, fw, im.height,
            -fw * cs / 2, -feet * cs, fw * cs, im.height * cs);`, '角色放大');

// 4) 动物也稍微放大
sub(`        ctx.drawImage(im, frame * fw, 0, fw, im.height, -fw / 2, 0, fw, im.height);
        ctx.restore();`,
`        var as = 1.25;
        ctx.drawImage(im, frame * fw, 0, fw, im.height, -fw * as / 2, 0, fw * as, im.height * as);
        ctx.restore();`, '动物放大');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
