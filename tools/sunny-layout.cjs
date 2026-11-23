const fs = require('node:fs');
const p = 'C:/ts/tools/sunnyside-game.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 地图缩小、把"菜园 + 木箱 + 动物 + 池塘"都摆在初始视野里
sub("  const MW = 34, MH = 22;        // 地图格数", "  const MW = 24, MH = 18;        // 地图格数（小一点，开局视野里就热闹）", '地图尺寸');

sub(`    const ground = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y += 1) {
      for (let x = 0; x < MW; x += 1) {
        let t = G.GRASS;
        // 池塘（右上）
        if (x >= MW - 6 && y >= 1 && y <= 4) t = G.WATER;
        // 主路（中间横向）与竖直小路
        if (y === 11 || x === 6) t = G.PATH;
        ground[y * MW + x] = t;
      }
    }
    // 菜地在路下方，一开始是荒地：留一小块示范，其余自己锄
    for (let y = 13; y <= 14; y += 1) {
      for (let x = 10; x <= 11; x += 1) ground[y * MW + x] = G.SOIL;
    }`,
`    const ground = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y += 1) {
      for (let x = 0; x < MW; x += 1) ground[y * MW + x] = G.GRASS;
    }
    // 池塘（右上角）
    for (let y = 2; y <= 5; y += 1) {
      for (let x = 16; x <= 21; x += 1) ground[y * MW + x] = G.WATER;
    }
    // 小路：菜园门口 → 木箱 → 池塘
    for (let x = 13; x <= 21; x += 1) ground[9 * MW + x] = G.PATH;
    for (let y = 6; y <= 14; y += 1) ground[y * MW + 13] = G.PATH;
    // 菜园里先给 6 块开好的地（示范），其余自己锄
    for (let y = 7; y <= 9; y += 1) {
      for (let x = 5; x <= 7; x += 1) ground[y * MW + x] = G.SOIL;
    }`, '新布局');

// 2) 木箱、动物、装饰按新布局摆
sub(`      crate: { x: 19, y: 11 },`,
`      crate: { x: 14, y: 8 },`, '木箱位置');

sub(`      animals: [
        { k: 'animal_chicken_01', x: 23, y: 8, t: Math.random() * 40, lay: 18, dir: 1 },
        { k: 'animal_chicken_01', x: 25, y: 9, t: Math.random() * 40, lay: 26, dir: -1 },
        { k: 'animal_cow', x: 27, y: 7, t: Math.random() * 40, dir: 1 },
        { k: 'animal_sheep_01', x: 24, y: 15, t: Math.random() * 40, dir: -1 },
        { k: 'animal_pig_01', x: 28, y: 16, t: Math.random() * 40, dir: 1 },
        { k: 'animal_duck_01', x: MW - 4, y: 3, t: Math.random() * 40, dir: 1 },
      ],`,
`      animals: [
        { k: 'animal_chicken_01', x: 9.5, y: 8.5, t: Math.random() * 40, lay: 14, dir: 1 },
        { k: 'animal_chicken_01', x: 10.5, y: 10.5, t: Math.random() * 40, lay: 24, dir: -1 },
        { k: 'animal_cow', x: 16, y: 7, t: Math.random() * 40, dir: 1 },
        { k: 'animal_sheep_01', x: 15, y: 12.5, t: Math.random() * 40, dir: -1 },
        { k: 'animal_pig_01', x: 18, y: 12, t: Math.random() * 40, dir: 1 },
        { k: 'animal_duck_01', x: 17.5, y: 6, t: Math.random() * 40, dir: 1 },
      ],`, '动物布局');

sub(`      decos: [
        { k: 'plant_tree_01', x: 2, y: 2 }, { k: 'plant_tree_02', x: 4, y: 5 },
        { k: 'plant_tree_01', x: 1, y: 9 }, { k: 'plant_tree_02', x: 3, y: 20 },
        { k: 'plant_tree_01', x: 30, y: 19 }, { k: 'plant_tree_02', x: 32, y: 12 },
        { k: 'plant_tree_01', x: 21, y: 20 }, { k: 'plant_tree_02', x: 17, y: 2 },
        { k: 'plant_mushroom_red_01', x: 8, y: 15 }, { k: 'plant_mushroom_blue_01', x: 19, y: 16 },
        { k: 'plant_mushroom_red_01', x: 13, y: 20 }, { k: 'plant_mushroom_blue_01', x: 15, y: 12 },
        { k: 'plant_mushroom_red_01', x: 25, y: 4 }, { k: 'plant_mushroom_blue_01', x: 27, y: 12 },
      ],`,
`      decos: [
        { k: 'plant_tree_01', x: 1, y: 2 }, { k: 'plant_tree_02', x: 3, y: 14 },
        { k: 'plant_tree_01', x: 22, y: 15 }, { k: 'plant_tree_02', x: 19, y: 2 },
        { k: 'plant_tree_01', x: 2, y: 16 }, { k: 'plant_tree_02', x: 21, y: 11 },
        { k: 'plant_mushroom_red_01', x: 4, y: 4 }, { k: 'plant_mushroom_blue_01', x: 11, y: 6 },
        { k: 'plant_mushroom_red_01', x: 12, y: 14 }, { k: 'plant_mushroom_blue_01', x: 8, y: 15 },
        { k: 'plant_mushroom_red_01', x: 17, y: 14 }, { k: 'plant_mushroom_blue_01', x: 20, y: 8 },
      ],`, '装饰布局');

sub("      player: { x: 10.5, y: 11.5, dir: 1, anim: 0, moving: false, act: 0 },",
    "      player: { x: 8.5, y: 10.5, dir: 2, anim: 0, moving: false, act: 0 },", '出生点');

// 3) 栅栏跟着菜园走
sub(`      const x0 = 7, y0 = 12, x1 = 19, y1 = 19;`,
    `      const x0 = 4, y0 = 6, x1 = 12, y1 = 12;`, '栅栏位置');

// 4) 草地细节更密（草丛、小花、石子）
sub(`      const r = rnd(tx, ty, 1);
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
      return;`,
`      const r = rnd(tx, ty, 1);
      const ox = (r * 37) % 30, oy = (r * 71) % 30;
      // 草丛（大部分格子有）
      if (r > 0.35) {
        ctx.fillStyle = '#57b745';
        ctx.fillRect(sx + ox, sy + oy, 7, 3);
        ctx.fillRect(sx + ox + 2, sy + oy + 3, 3, 4);
      }
      if (r < 0.3) {
        ctx.fillStyle = '#7ed967';
        ctx.fillRect(sx + ((r * 200) % 33), sy + ((r * 130) % 33), 3, 7);
      }
      // 小花 / 石子
      if (r > 0.86) {
        ctx.fillStyle = r > 0.94 ? '#f2e17a' : '#e06b8a';
        ctx.fillRect(sx + 18, sy + 14, 6, 6);
        ctx.fillStyle = '#fff6c8';
        ctx.fillRect(sx + 20, sy + 12, 3, 3);
      } else if (r > 0.7) {
        ctx.fillStyle = 'rgba(120,130,120,.35)';
        ctx.fillRect(sx + ((r * 90) % 30), sy + ((r * 40) % 30), 6, 4);
      }
      return;`, '草地细节');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
