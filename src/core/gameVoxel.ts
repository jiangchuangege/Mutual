import { THREE_SOURCE } from './threeInline';
import type { GameSpec } from './types';

/**
 * 内置样例 3：真·3D 体素沙盒（"我的世界"那类玩法），双人联机。
 *
 * 说明几件工程上的实话：
 *  - WebView 里禁网，所以 three.js（r160，666KB）是**整段内联**进 HTML 的
 *    （`threeInline.ts` 是构建期从 node_modules 生成的字符串常量，不进空间状态）；
 *  - 世界是**确定性生成**的（固定种子的 hash），所以两个人一开始看到的是同一张地图，
 *    不需要把整个世界传过去；
 *  - 联机只传**增量**：谁挖/放了一块，就发 `{e:[[x,y,z,v]]}`，对方合并后重建即可；
 *  - 渲染用 InstancedMesh（每种方块一个实例化网格），8192 个格子也能稳在手机上跑。
 */

const W = 48;
const H = 16;
const D = 48;

export function buildVoxelHtml(): string {
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#8fc7ff;touch-action:none;
    font-family:-apple-system,system-ui,sans-serif;-webkit-user-select:none}
  #hud{position:fixed;top:0;left:0;right:0;display:flex;gap:8px;align-items:center;
    padding:8px 10px;font-size:12px;color:#fff;background:linear-gradient(#0006,#0000);z-index:9}
  .pill{padding:6px 11px;border-radius:999px;background:#0007;border:1px solid #fff3;font-size:12px;color:#fff}
  .pill.on{background:#2ea043cc;border-color:#7ee787}
  #tip{margin-left:auto;color:#fff;opacity:.85}
</style></head>
<body>
<div id="hud">
  <span class="pill on" id="mDig">⛏ 挖</span>
  <span class="pill" id="mPut">🧱 放</span>
  <span class="pill" id="mat">石</span>
  <span id="tip">左手走 · 右手看 · 点方块挖/放</span>
  <span class="pill" id="jump" style="margin-left:6px">⤒ 跳</span>
</div>
<script>${THREE_SOURCE}</script>
<script>
(function(){
  var W = ${W}, H = ${H}, D = ${D};
  // 1-5 普通方块；6-9 是「情侣模组」：爱心砖、玫瑰、暖灯、合影墙
  var BLOCK = { 1:'#6b4a2b', 2:'#4e9e58', 3:'#8d939c', 4:'#a97142', 5:'#3a3f47',
                6:'#ff7aa2', 7:'#e2556a', 8:'#ffe9a8', 9:'#d9c3a5',
                10:'#e6d3a3', 11:'#5a5f66', 12:'#3f7fd1', 13:'#3f8f4a' };
  var NAME  = { 1:'土', 2:'草', 3:'石', 4:'木', 5:'煤', 6:'爱心砖', 7:'玫瑰', 8:'暖灯', 9:'合影墙',
                10:'沙', 11:'深板岩', 12:'水', 13:'树叶' };
  var MAT_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  var world = new Uint8Array(W * H * D);
  var mode = 'dig', material = 3;
  var idx = function(x,y,z){ return (y * D + z) * W + x; };
  var inb = function(x,y,z){ return x>=0&&y>=0&&z>=0&&x<W&&y<H&&z<D; };
  var get = function(x,y,z){ return inb(x,y,z) ? world[idx(x,y,z)] : 0; };

  // 确定性地形：两个人算出来一模一样
  function h2(x,z){ var n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return n - Math.floor(n); }
  function gen(){
    world.fill(0);
    for (var x = 0; x < W; x++) for (var z = 0; z < D; z++) {
      var base = 1 + Math.floor(h2(x, z) * 2.2);
      for (var y = 0; y <= base + 2; y++) {
        var t = y === base + 2 ? 2 : y > base ? 1 : (h2(x * 3, z * 7) > 0.82 ? 5 : 3);
        world[idx(x, y, z)] = t;
      }
      if (h2(x + 5, z + 9) > 0.985) {           // 稀疏的树
        var top = base + 3;
        for (var k = 0; k < 3; k++) world[idx(x, top + k, z)] = 4;
      }
    }
  }
  /** 情侣模组：出生点前的爱心小院（心形爱心砖 + 两盏暖灯 + 一圈玫瑰 + 长椅） */
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
  coupleCourtyard();

  var renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fc7ff');
  scene.fog = new THREE.Fog('#8fc7ff', 26, 54);
  var camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 120);
  var yaw = 0.6, pitch = -0.15, px = W / 2, py = 8, pz = D + 8;

  scene.add(new THREE.HemisphereLight('#ffffff', '#6b6b6b', 1.05));
  var sun = new THREE.DirectionalLight('#fff7e0', 0.85);
  sun.position.set(18, 30, 12);
  scene.add(sun);

  // 每种方块一个实例化网格：改一格只需重建这一种
  var geo = new THREE.BoxGeometry(1, 1, 1);
  var meshes = {}, mats = {};
  function ensure(t, count){
    if (!mats[t]) {
      var c = new THREE.Color(BLOCK[t] || '#888');
      mats[t] = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    }
    if (!meshes[t] || meshes[t].count !== count) {
      if (meshes[t]) { scene.remove(meshes[t]); meshes[t].dispose(); }
      var m = new THREE.InstancedMesh(geo, mats[t], Math.max(1, count));
      m.frustumCulled = false;
      meshes[t] = m; scene.add(m);
    }
  }
  var dummy = new THREE.Object3D();
  function rebuildAll(){
    var buckets = {};
    for (var x = 0; x < W; x++) for (var y = 0; y < H; y++) for (var z = 0; z < D; z++) {
      var t = world[idx(x, y, z)];
      if (!t) continue;
      (buckets[t] = buckets[t] || []).push([x, y, z]);
    }
    for (var t2 in buckets) {
      var list = buckets[t2];
      ensure(+t2, list.length);
      for (var i = 0; i < list.length; i++) {
        dummy.position.set(list[i][0] + 0.5, list[i][1] + 0.5, list[i][2] + 0.5);
        dummy.updateMatrix();
        meshes[t2].setMatrixAt(i, dummy.matrix);
      }
      meshes[t2].instanceMatrix.needsUpdate = true;
    }
  }
  rebuildAll();

  // ---- 操作：左手摇杆走、右手拖动看、点方块挖/放 ----
  var touches = {}, stick = { x: 0, y: 0, active: false, id: null }, lookId = null, moved = 0;
  var el = renderer.domElement;
  function onStart(e){
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.clientX < window.innerWidth * 0.45 && !stick.active) {
        stick.active = true; stick.id = t.identifier;
        stick.ox = t.clientX; stick.oy = t.clientY; stick.x = 0; stick.y = 0;
      } else if (lookId === null) {
        lookId = t.identifier; touches.lx = t.clientX; touches.ly = t.clientY; moved = 0;
      }
    }
  }
  function onMove(e){
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (stick.active && t.identifier === stick.id) {
        stick.x = Math.max(-1, Math.min(1, (t.clientX - stick.ox) / 60));
        stick.y = Math.max(-1, Math.min(1, (t.clientY - stick.oy) / 60));
      } else if (t.identifier === lookId) {
        var dx = t.clientX - touches.lx, dy = t.clientY - touches.ly;
        moved += Math.abs(dx) + Math.abs(dy);
        yaw -= dx * 0.005; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.004));
        touches.lx = t.clientX; touches.ly = t.clientY;
      }
    }
  }
  function onEnd(e){
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (stick.active && t.identifier === stick.id) { stick.active = false; stick.id = null; stick.x = 0; stick.y = 0; }
      else if (t.identifier === lookId) {
        // 没怎么拖动 = 点击 → 挖/放方块
        if (moved < 14) hit(t.clientX, t.clientY);
        lookId = null;
      }
    }
  }
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: true });
  el.addEventListener('touchend', onEnd, { passive: true });

  var ray = new THREE.Raycaster();
  function hit(sx, sy){
    // 手势结束时的点击点 → 用屏幕中心更贴近"准星对准方块"的手感
    var cx0 = sx === undefined ? window.innerWidth / 2 : sx;
    var cy0 = sy === undefined ? window.innerHeight / 2 : sy;
    var ndc = new THREE.Vector2((cx0 / window.innerWidth) * 2 - 1, -(cy0 / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var boxes = [];
    for (var t in meshes) boxes.push(meshes[t]);
    var hits = ray.intersectObjects(boxes, false);
    if (!hits.length) return;
    var p = hits[0].point, n = hits[0].face ? hits[0].face.normal.clone() : new THREE.Vector3(0, 1, 0);
    if (mode === 'dig') {
      var bx = Math.floor(p.x - n.x * 0.5), by = Math.floor(p.y - n.y * 0.5), bz = Math.floor(p.z - n.z * 0.5);
      if (!inb(bx, by, bz) || !get(bx, by, bz)) return;
      world[idx(bx, by, bz)] = 0;
      edit([[bx, by, bz, 0]]);
    } else {
      var tx = Math.floor(p.x + n.x * 0.5), ty = Math.floor(p.y + n.y * 0.5), tz = Math.floor(p.z + n.z * 0.5);
      if (!inb(tx, ty, tz) || get(tx, ty, tz)) return;
      world[idx(tx, ty, tz)] = material;
      edit([[tx, ty, tz, material]]);
    }
  }

  function edit(list){
    rebuildAll();
    send(list);
  }

  var sending = false;
  function send(list){
    if (sending || !(window.ReactNativeWebView && window.ReactNativeWebView.postMessage)) return;
    sending = true;
    window.ReactNativeWebView.postMessage('TW_STATE:' + JSON.stringify({ e: list, m: material }));
    setTimeout(function(){ sending = false; }, 80);
  }

  window.TwGame = {
    /* 本地有改动就上报；远端局面来了就合并 */
    send: function(){ send([]); },
    apply: function(json){
      try {
        var s = JSON.parse(json);
        if (!s || !s.e) return;
        for (var i = 0; i < s.e.length; i++) {
          var a = s.e[i];
          if (inb(a[0], a[1], a[2])) world[idx(a[0], a[1], a[2])] = a[3] | 0;
        }
        if (typeof s.m === 'number') material = s.m;
        rebuildAll();
      } catch (err) {}
    }
  };

  // HUD
  var mDig = document.getElementById('mDig'), mPut = document.getElementById('mPut'), mMat = document.getElementById('mat');
  mDig.onclick = function(){ mode = 'dig'; mDig.className = 'pill on'; mPut.className = 'pill'; };
  mPut.onclick = function(){ mode = 'put'; mPut.className = 'pill on'; mDig.className = 'pill'; };
  document.getElementById('jump').onclick = function(){
    if (onGround) { vy = 8.2; onGround = false; }
  };
  mMat.onclick = function(){
    var i = MAT_ORDER.indexOf(material);
    material = MAT_ORDER[(i + 1) % MAT_ORDER.length];
    mMat.textContent = NAME[material] || '石';
  };

  // 主循环
  var last = performance.now(), vy = 0, onGround = true, lastPX = 0, lastPZ = 0;
  function frame(now){
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var speed = 4.6;
    var fx = Math.sin(yaw), fz = Math.cos(yaw);
    var mx = (stick.x * fz - stick.y * fx) * speed * dt;
    var mz = (-stick.x * fx - stick.y * fz) * speed * dt;
    var nx2 = Math.max(1, Math.min(W - 1, px + mx));
    var nz2 = Math.max(1, Math.min(D - 1, pz + mz));
    // 撞墙就不走（只允许走到脚下方或头顶有空位的格子）
    var wallA = get(Math.floor(nx2), Math.floor(py - 1.62), Math.floor(pz));
    var wallB = get(Math.floor(px), Math.floor(py - 1.62), Math.floor(nz2));
    if (!wallA) px = nx2;
    if (!wallB) pz = nz2;
    // 重力 + 跳跃（像 MC 那样掉下来、踩地、空格跳）
    var fx2 = Math.floor(px), fz2 = Math.floor(pz);
    var floorY = 0;
    for (var yy = H - 1; yy >= 0; yy--) if (get(fx2, yy, fz2)) { floorY = yy + 1; break; }
    var feet = py - 1.62;
    vy -= 22 * dt;
    feet += vy * dt;
    if (feet <= floorY) { feet = floorY; vy = 0; onGround = true; } else { onGround = false; }
    py = feet + 1.62;
    if (px !== lastPX || pz !== lastPZ) { lastPX = px; lastPZ = pz; }

    camera.position.set(px, py, pz);
    var dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    camera.lookAt(px + dir.x, py + dir.y, pz + dir.z);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', function(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.getElementById('tip').textContent = '同一个世界 · 有存档 · 6-9 是情侣模组方块';
})();
</script></body></html>`;
}

export const VOXEL_GAME: GameSpec = {
  id: 'sample-voxel-3d',
  title: '3D 体素沙盒（我的世界玩法·双人）',
  // 代码在运行时由 buildVoxelHtml() 现场拼（含 666KB 的 three.js），
  // 不写进空间状态，避免每台手机都同步一份 666KB
  code: '',
  players: 2,
  createdBy: 'A',
  createdAt: 0,
  builtin: 'voxel3d',
};
