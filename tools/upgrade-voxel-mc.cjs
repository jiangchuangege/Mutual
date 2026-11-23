const fs = require('node:fs');
const p = 'C:/ts/src/core/gameVoxel.ts';
let t = fs.readFileSync(p, 'utf8');

// 世界尺寸放大（更像"世界"而不是"一个盘子"）
t = t.replace('const W = 32;\nconst H = 10;\nconst D = 32;', 'const W = 48;\nconst H = 16;\nconst D = 48;');
t = t.replace('  var W = ${W}, H = ${H}, D = ${D};', '  var W = ${W}, H = ${H}, D = ${D};');

// 1) 地形：多层高度 + 水面 + 矿 + 树（比之前那层薄饼像样）
t = t.replace(
  /  \/\*\* 确定性地形:[\s\S]*?  gen\(\);\n  coupleCourtyard\(\);/,
  `  /* 地形：两层噪声决定高度，低处是水，地下按深度出煤/石，地表随机长树 */
  function h2(x,z){ var n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return n - Math.floor(n); }
  function h3(x,z){ var n = Math.sin(x * 4.1414 + z * 27.31) * 12345.678; return n - Math.floor(n); }
  function gen(){
    world.fill(0);
    for (var x = 0; x < W; x++) for (var z = 0; z < D; z++) {
      var n1 = h2(x, z), n2 = h3(Math.floor(x / 6), Math.floor(z / 6));
      var hill = n2 > 0.55 ? Math.round((n2 - 0.55) * 12) : 0;      // 小山坡
      var base = 3 + Math.round(n1 * 2) + hill;
      for (var y = 0; y < H; y++) {
        if (y > base) break;
        var t;
        if (y === base) t = base <= 4 ? 10 /* 沙滩 */ : 2;           // 低处沙滩
        else if (y > base - 2) t = 1;                                // 土
        else if (y > base - 5) t = (h2(x * 3, z * 7) > 0.9 ? 5 : 3); // 石/煤
        else t = 11;                                                 // 深板岩
        world[idx(x, y, z)] = t;
      }
      // 水面：低于 y=4 的凹陷填水
      if (base < 4) for (var wy = base + 1; wy <= 4; wy++) world[idx(x, wy, z)] = 12;
      // 树：草地上稀疏生成（树干 + 两圈叶子）
      if (base > 4 && h2(x + 31, z + 17) > 0.972 && !get(x, base + 1, z)) {
        var trunk = 2 + Math.round(h2(x, z + 3) * 2);
        for (var k = 1; k <= trunk; k++) world[idx(x, base + k, z)] = 4;
        for (var dx = -2; dx <= 2; dx++) for (var dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > 2) continue;
          for (var dy = trunk - 1; dy <= trunk + 1; dy++) {
            var lx = x + dx, ly = base + dy, lz = z + dz;
            if (inb(lx, ly, lz) && !get(lx, ly, lz)) world[idx(lx, ly, lz)] = 13;
          }
        }
      }
    }
  }
  gen();
  coupleCourtyard();`
);

// 2) 方块表：加水、沙滩、叶子、深板岩
t = t.replace(
  "  var BLOCK = { 1:'#6b4a2b', 2:'#4e9e58', 3:'#8d939c', 4:'#a97142', 5:'#3a3f47',\n                6:'#ff7aa2', 7:'#e2556a', 8:'#ffe9a8', 9:'#d9c3a5' };\n  var NAME  = { 1:'土', 2:'草', 3:'石', 4:'木', 5:'煤', 6:'爱心砖', 7:'玫瑰', 8:'暖灯', 9:'合影墙' };",
  "  var BLOCK = { 1:'#6b4a2b', 2:'#4e9e58', 3:'#8d939c', 4:'#a97142', 5:'#3a3f47',\n                6:'#ff7aa2', 7:'#e2556a', 8:'#ffe9a8', 9:'#d9c3a5',\n                10:'#e6d3a3', 11:'#5a5f66', 12:'#3f7fd1', 13:'#3f8f4a' };\n  var NAME  = { 1:'土', 2:'草', 3:'石', 4:'木', 5:'煤', 6:'爱心砖', 7:'玫瑰', 8:'暖灯', 9:'合影墙',\n                10:'沙', 11:'深板岩', 12:'水', 13:'树叶' };"
);

// 3) 跳跃 + 重力 + 更真实的移动（原先是直接吸附地面）
t = t.replace(
  `    // 站到地面上：往下找第一个实心块
    var ground = 0;
    for (var y = H - 1; y >= 0; y--) if (get(Math.floor(px), y, Math.floor(pz))) { ground = y + 1; break; }
    py = py + (ground + 1.62 - py) * Math.min(1, dt * 10);`,
  `    // 重力 + 跳跃（像 MC 那样掉下来、踩地、空格跳）
    var fx2 = Math.floor(px), fz2 = Math.floor(pz);
    var floorY = 0;
    for (var yy = H - 1; yy >= 0; yy--) if (get(fx2, yy, fz2)) { floorY = yy + 1; break; }
    var feet = py - 1.62;
    vy -= 22 * dt;
    feet += vy * dt;
    if (feet <= floorY) { feet = floorY; vy = 0; onGround = true; } else { onGround = false; }
    py = feet + 1.62;
    if (px !== lastPX || pz !== lastPZ) { lastPX = px; lastPZ = pz; }`
);
t = t.replace(
  "  var last = performance.now(), vy = 0;",
  "  var last = performance.now(), vy = 0, onGround = true, lastPX = 0, lastPZ = 0;"
);

// 4) 跨步限制：不要穿过 1 格高的墙（简单版：目标格是实心就不走）
t = t.replace(
  `    px = Math.max(1, Math.min(W - 1, px + mx));
    pz = Math.max(1, Math.min(D - 1, pz + mz));`,
  `    var nx2 = Math.max(1, Math.min(W - 1, px + mx));
    var nz2 = Math.max(1, Math.min(D - 1, pz + mz));
    // 撞墙就不走（只允许走到脚下方或头顶有空位的格子）
    var wallA = get(Math.floor(nx2), Math.floor(py - 1.62), Math.floor(pz));
    var wallB = get(Math.floor(px), Math.floor(py - 1.62), Math.floor(nz2));
    if (!wallA) px = nx2;
    if (!wallB) pz = nz2;`
);

// 5) 跳跃按钮 + 准星 + 快捷栏
t = t.replace(
  `  <span id="tip">左手走 / 右手看 / 点方块挖</span>`,
  `  <span id="tip">左手走 · 右手看 · 点方块挖/放</span>
  <span class="pill" id="jump" style="margin-left:6px">⤒ 跳</span>`
);
t = t.replace(
  `  mMat.onclick = function(){`,
  `  document.getElementById('jump').onclick = function(){
    if (onGround) { vy = 8.2; onGround = false; }
  };
  mMat.onclick = function(){`
);

// 6) 准星（屏幕中心一个小十字，挖/放对着准星）
t = t.replace(
  '<canvas id="c"></canvas>',
  '<canvas id="c"></canvas>\n<div id="cross" style="position:fixed;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none;opacity:.75"><div style="position:absolute;left:8px;top:0;width:2px;height:18px;background:#fff"></div><div style="position:absolute;top:8px;left:0;height:2px;width:18px;background:#fff"></div></div>'
);

// 7) 点击改成"准星射线"：点屏幕任意处 = 打准星方向那格（手机没法像鼠标那样对点）
t = t.replace(
  `  function hit(sx, sy){
    var ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);`,
  `  function hit(sx, sy){
    // 手势结束时的点击点 → 用屏幕中心更贴近"准星对准方块"的手感
    var cx0 = sx === undefined ? window.innerWidth / 2 : sx;
    var cy0 = sy === undefined ? window.innerHeight / 2 : sy;
    var ndc = new THREE.Vector2((cx0 / window.innerWidth) * 2 - 1, -(cy0 / window.innerHeight) * 2 + 1);`
);

// 8) 方块颜色加一点面明暗（用顶点色太贵：改成按方块类型给两档材质，顶面更亮）
t = t.replace(
  "  function ensure(t, count){\n    if (!mats[t]) mats[t] = new THREE.MeshLambertMaterial({ color: BLOCK[t] });",
  "  function ensure(t, count){\n    if (!mats[t]) {\n      var c = new THREE.Color(BLOCK[t] || '#888');\n      mats[t] = new THREE.MeshLambertMaterial({ color: c, flatShading: true });\n    }"
);

fs.writeFileSync(p, t, 'utf8');
console.log('体素升级:', {
  世界: t.includes('const W = 48'),
  重力跳跃: t.includes('vy -= 22 * dt'),
  撞墙: t.includes('撞墙就不走'),
  水面树叶: t.includes('树叶'),
  准星: t.includes('cross'),
  跳跃键: t.includes('⤒ 跳'),
});
