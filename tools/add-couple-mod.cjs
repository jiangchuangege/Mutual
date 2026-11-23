const fs = require('node:fs');
const p = 'C:/ts/src/core/gameVoxel.ts';
let t = fs.readFileSync(p, 'utf8');

// 1) 方块表加"情侣模组"四件套
t = t.replace(
  "  var BLOCK = { 1:'#6b4a2b', 2:'#4e9e58', 3:'#8d939c', 4:'#a97142', 5:'#3a3f47' };\n  var NAME  = { 1:'土', 2:'草', 3:'石', 4:'木', 5:'煤' };",
  `  // 1-5 普通方块；6-9 是「情侣模组」：爱心砖、玫瑰、暖灯、合影墙
  var BLOCK = { 1:'#6b4a2b', 2:'#4e9e58', 3:'#8d939c', 4:'#a97142', 5:'#3a3f47',
                6:'#ff7aa2', 7:'#e2556a', 8:'#ffe9a8', 9:'#d9c3a5' };
  var NAME  = { 1:'土', 2:'草', 3:'石', 4:'木', 5:'煤', 6:'爱心砖', 7:'玫瑰', 8:'暖灯', 9:'合影墙' };
  var MAT_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];`
);

// 2) 出生点旁边生成"情侣小院"（爱心 + 两盏暖灯 + 玫瑰 + 长椅），只在空地生成
t = t.replace(
  `  gen();`,
  `  /** 情侣模组：出生点前的爱心小院（心形爱心砖 + 两盏暖灯 + 一圈玫瑰 + 长椅） */
  function coupleCourtyard(){
    var cx = Math.floor(W / 2), cz = Math.floor(D / 2);
    var groundY = 0;
    for (var y = H - 1; y >= 0; y--) if (get(cx, y, cz)) { groundY = y; break; }
    var base = groundY + 1;
    // 心形爱心砖（平铺在地上）
    var heart = [[0,-1],[0,0],[-1,0],[1,0],[-2,1],[2,1],[-2,2],[2,2],[-1,3],[1,3],[0,4]];
    for (var i = 0; i < heart.length; i++) {
      var hx = cx + heart[i][0], hz = cz + heart[i][1];
      if (inb(hx, base, hz)) world[idx(hx, base, hz)] = 6;
    }
    // 两侧暖灯（杆 + 灯头）
    [[-4, 0], [4, 0]].forEach(function (o) {
      var lx = cx + o[0], lz = cz + o[1];
      if (!inb(lx, base, lz)) return;
      world[idx(lx, base, lz)] = 4;
      if (inb(lx, base + 1, lz)) world[idx(lx, base + 1, lz)] = 8;
    });
    // 玫瑰一小片 + 长椅（合影墙当椅背）
    for (var r = 0; r < 6; r++) {
      var rx = cx - 3 + r, rz = cz + 6;
      if (inb(rx, base, rz) && !get(rx, base, rz)) world[idx(rx, base, rz)] = 7;
    }
    for (var b2 = -1; b2 <= 1; b2++) {
      var bx = cx + b2, bz = cz - 5;
      if (inb(bx, base, bz)) world[idx(bx, base, bz)] = 9;
      if (inb(bx, base + 1, bz)) world[idx(bx, base + 1, bz)] = 9;
    }
  }
  gen();
  coupleCourtyard();`
);

// 3) 切换方块用新的顺序表
t = t.replace(
  `  mMat.onclick = function(){
    var order = [1, 2, 3, 4, 5];
    var i = order.indexOf(material);
    material = order[(i + 1) % order.length];
    mMat.textContent = NAME[material];
  };`,
  `  mMat.onclick = function(){
    var i = MAT_ORDER.indexOf(material);
    material = MAT_ORDER[(i + 1) % MAT_ORDER.length];
    mMat.textContent = NAME[material] || '石';
  };`
);

// 4) HUD 初始方块名 + 提示文案
t = t.replace('<span class="pill" id="mat">石头</span>', '<span class="pill" id="mat">石</span>');
t = t.replace(
  `  document.getElementById('tip').textContent = '同一个世界 · 挖下来的方块两人都看得见';`,
  `  document.getElementById('tip').textContent = '同一个世界 · 有存档 · 6-9 是情侣模组方块';`
);

fs.writeFileSync(p, t, 'utf8');
console.log('情侣模组:', {
  方块: t.includes('爱心砖'),
  小院: t.includes('coupleCourtyard'),
  九种可选: t.includes('MAT_ORDER'),
});
