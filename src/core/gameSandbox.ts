import type { GameSpec } from './types';

/**
 * 内置样例 2：像素沙盒（"我的世界"那类玩法的 2D 版）。
 *
 * 为什么先给 2D：3D 体素要在 WebView 里内联 Three.js（禁网环境库必须整段塞进去，
 * 600KB+），再加区块加载、性能与联机同步，是独立一档的工程量。2D 网格沙盒
 * 能把"同一个世界、两人同时挖和建、地图留下来"这套最核心的体验先跑通，
 * 数据与联机约定（TwGame.send/apply）完全一致，之后换 3D 渲染层即可。
 *
 * 玩法：点有方块的格子 = 挖掉；点空格子 = 放下手里选的方块。
 * 每次改动都把整个世界发给对方（网格很小，JSON 只有几 KB）。
 */
const SANDBOX = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  html,body{margin:0;height:100%;background:#0d1117;color:#e6edf3;overflow:hidden;
    font-family:-apple-system,system-ui,sans-serif;-webkit-user-select:none;touch-action:none}
  #bar{display:flex;gap:8px;align-items:center;padding:8px 10px;background:#161b22;
    border-bottom:1px solid #232b36;font-size:12px}
  #bar b{font-size:13px;color:#7ee787;margin-right:4px}
  .mat{padding:5px 10px;border-radius:999px;border:1px solid #2b3441;background:#0d1117;color:#9aa7b4;font-size:12px}
  .mat.on{border-color:#7ee787;color:#7ee787;background:#12261a}
  #tip{margin-left:auto;color:#6b7684}
  canvas{display:block;touch-action:none}
</style></head>
<body>
<div id="bar">
  <b>像素沙盒</b>
  <button class="mat on" data-m="1">土</button>
  <button class="mat" data-m="2">草</button>
  <button class="mat" data-m="3">石</button>
  <button class="mat" data-m="4">木</button>
  <span id="tip">两人同一个世界</span>
</div>
<canvas id="c"></canvas>
<script>
(function(){
  var COLS = 28, ROWS = 16;            // 网格尺寸：小一点，同步快、手机够用
  var COLORS = { 1:'#8b5a2b', 2:'#4e9e58', 3:'#8d939c', 4:'#a97142' };
  var NAMES  = { 1:'土', 2:'草', 3:'石', 4:'木' };
  var cells = [], material = 1, CW = 0, CH = 0, sending = false;
  var c = document.getElementById('c'), ctx = c.getContext('2d');

  function blank(){
    var g = [];
    for (var y = 0; y < ROWS; y++) {
      var row = [];
      for (var x = 0; x < COLS; x++) {
        // 生成一片"地面 + 几堆石头和树"，两个人看到的是同一张初始地图
        if (y >= ROWS - 4) row.push(y === ROWS - 4 ? 2 : 1);
        else if ((x * 7 + y * 13) % 23 === 0 && y > ROWS - 10) row.push(3);
        else if ((x === 5 || x === 18) && y >= ROWS - 8 && y < ROWS - 4) row.push(4);
        else row.push(0);
      }
      g.push(row);
    }
    return g;
  }

  function resize(){
    var w = window.innerWidth;
    var h = window.innerHeight - document.getElementById('bar').offsetHeight;
    CW = Math.floor(w / COLS);
    CH = Math.floor(h / ROWS);
    c.width = CW * COLS;
    c.height = CH * ROWS;
    draw();
  }

  function draw(){
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, c.width, c.height);
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var v = cells[y] && cells[y][x];
        if (!v) continue;
        ctx.fillStyle = COLORS[v] || '#888';
        ctx.fillRect(x * CW + 1, y * CH + 1, CW - 2, CH - 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.strokeRect(x * CW + 0.5, y * CH + 0.5, CW - 1, CH - 1);
      }
    }
    document.getElementById('tip').textContent = '手里：' + (NAMES[material] || '土');
  }

  function send(){
    if (sending) return;
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        sending = true;
        window.ReactNativeWebView.postMessage('TW_STATE:' + JSON.stringify({ cells: cells, material: material }));
        setTimeout(function(){ sending = false; }, 60);
      }
    } catch (e) { sending = false; }
  }

  function tap(ev){
    var r = c.getBoundingClientRect();
    var px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    var py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    var x = Math.floor(px / CW), y = Math.floor(py / CH);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    var v = cells[y][x];
    cells[y][x] = v ? 0 : material;   // 有方块的格子=挖掉；空格子=放手里的方块
    draw();
    send();
  }

  var buttons = document.querySelectorAll('.mat');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function(e){
      e.preventDefault();
      material = parseInt(this.getAttribute('data-m'), 10);
      for (var k = 0; k < buttons.length; k++) buttons[k].className = 'mat';
      this.className = 'mat on';
      draw();
    });
  }

  c.addEventListener('click', tap);
  window.addEventListener('resize', resize);

  window.TwGame = {
    send: send,
    apply: function(json){
      try {
        var s = JSON.parse(json);
        if (!s || !s.cells) return;
        cells = s.cells;
        if (typeof s.material === 'number' && NAMES[s.material]) material = s.material;
        draw();
      } catch (e) {}
    }
  };

  cells = blank();
  resize();
})();
</script></body></html>`;

export const SANDBOX_GAME: GameSpec = {
  id: 'sample-voxel-sandbox',
  title: '像素沙盒（2D 我的世界玩法）',
  code: SANDBOX,
  players: 2,
  createdBy: 'A',
  createdAt: 0,
  builtin: true,
};
