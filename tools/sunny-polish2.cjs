const fs = require('node:fs');
const p = 'C:/ts/tools/sunnyside-game.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 一开始整片是草地，要自己锄（更有"开荒"的感觉）；只留一小块示范地
sub(`    // 农田（路下方一大块）
    for (let y = 13; y <= 18; y += 1) {
      for (let x = 8; x <= 17; x += 1) ground[y * MW + x] = G.SOIL;
    }`,
`    // 菜地在路下方，一开始是荒地：留一小块示范，其余自己锄
    for (let y = 13; y <= 14; y += 1) {
      for (let x = 10; x <= 11; x += 1) ground[y * MW + x] = G.SOIL;
    }`, '荒草地');

// 2) 装饰更多：树、石头、花，绕着菜地和池塘
sub(`      decos: [
        { k: 'plant_tree_01', x: 2, y: 2 }, { k: 'plant_tree_02', x: 4, y: 5 },
        { k: 'plant_tree_01', x: 30, y: 18 }, { k: 'plant_tree_02', x: 3, y: 18 },
        { k: 'plant_mushroom_red_01', x: 9, y: 6 }, { k: 'plant_mushroom_blue_01', x: 12, y: 9 },
        { k: 'plant_mushroom_red_01', x: 20, y: 17 },
      ],`,
`      decos: [
        { k: 'plant_tree_01', x: 2, y: 2 }, { k: 'plant_tree_02', x: 4, y: 5 },
        { k: 'plant_tree_01', x: 1, y: 9 }, { k: 'plant_tree_02', x: 3, y: 20 },
        { k: 'plant_tree_01', x: 30, y: 19 }, { k: 'plant_tree_02', x: 32, y: 12 },
        { k: 'plant_tree_01', x: 21, y: 20 }, { k: 'plant_tree_02', x: 17, y: 2 },
        { k: 'plant_mushroom_red_01', x: 8, y: 15 }, { k: 'plant_mushroom_blue_01', x: 19, y: 16 },
        { k: 'plant_mushroom_red_01', x: 13, y: 20 }, { k: 'plant_mushroom_blue_01', x: 15, y: 12 },
        { k: 'plant_mushroom_red_01', x: 25, y: 4 }, { k: 'plant_mushroom_blue_01', x: 27, y: 12 },
      ],`, '更多装饰');

// 3) 菜地围一圈栅栏（程序化绘制，纯装饰）
sub(`    // 木箱
    const crate = world.crate;`,
`    // 菜地栅栏（纯装饰，围出"自家园子"的感觉）
    (function drawFences() {
      const x0 = 7, y0 = 12, x1 = 19, y1 = 19;
      ctx.fillStyle = '#c99a63';
      for (let x = x0; x <= x1; x += 1) {
        ctx.fillRect(x * TS + 2, y0 * TS - 6, 3, 8);
        ctx.fillRect(x * TS + 2, y1 * TS + 6, 3, 8);
      }
      for (let y = y0; y <= y1; y += 1) {
        ctx.fillRect(x0 * TS - 6, y * TS + 2, 3, 8);
        ctx.fillRect(x1 * TS + 6, y * TS + 2, 3, 8);
      }
      ctx.fillStyle = '#e0b27a';
      ctx.fillRect(x0 * TS - 4, y0 * TS - 4, (x1 - x0) * TS + 12, 3);
      ctx.fillRect(x0 * TS - 4, y1 * TS + 8, (x1 - x0) * TS + 12, 3);
      ctx.fillRect(x0 * TS - 4, y0 * TS - 4, 3, (y1 - y0) * TS + 16);
      ctx.fillRect(x1 * TS + 8, y0 * TS - 4, 3, (y1 - y0) * TS + 16);
    })();

    // 木箱
    const crate = world.crate;`, '栅栏');

// 4) 目标提示（右下角）
sub(`  function updateHud() {`,
`  let objective = '先锄 4 块地，种下种子，再走到木箱旁边卖货';
  function updateHud() {`, '目标变量');

sub(`    document.getElementById('hRight').textContent =
      '第 ' + world.day + ' 天 ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') +
      ' · ' + TOOLS[world.sel].name + (world.sel === 2 ? '(' + CROPS[CROP_KEYS[world.seedSel]].name + ')' : '');`,
`    document.getElementById('hRight').textContent =
      '第 ' + world.day + ' 天 ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') +
      ' · ' + TOOLS[world.sel].name + (world.sel === 2 ? '(' + CROPS[CROP_KEYS[world.seedSel]].name + ')' : '');
    const tip = document.getElementById('tip');
    if (tip) tip.textContent = objective;
    if (world.stats.harvested === 0 && world.stats.planted === 0) objective = '① 选锄头开地 → ② 换种子播种 → ③ 水壶浇水';
    else if (world.stats.harvested === 0) objective = '等作物长大（浇水会更快），成熟后换"收获"摘下来';
    else if (world.stats.sold === 0) objective = '把作物拿到木箱旁边，选"篮子"卖掉换金币';
    else objective = '赚了 ' + world.stats.sold + ' 件货 · 点"商店"买更值钱的种子';`, '目标提示');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));

// 5) 页面加目标提示元素
const b = 'C:/ts/tools/build-sunnyside.cjs';
let bt = fs.readFileSync(b, 'utf8');
if (!bt.includes('id="tip"')) {
  bt = bt.replace('<div id="toast"></div>', '<div id="toast"></div>\n<div id="tip">先锄 4 块地，种下种子，再走到木箱旁边卖货</div>');
  bt = bt.replace('  #toast{position:fixed;',
    '  #tip{position:fixed;right:10px;top:56px;max-width:190px;text-align:right;color:#eaf6e4;\n    font-size:12px;line-height:1.5;text-shadow:0 1px 2px #000a;pointer-events:none;opacity:.9}\n  #toast{position:fixed;');
  fs.writeFileSync(b, bt, 'utf8');
  console.log('已加目标提示元素');
}
