/* Sunnyside 小农场 · 用素材包全量素材重做
   农作(11种) / 放牧(5种) / 砍树采矿 / 钓鱼 / 烹饪食谱 / 建造修理 / 夜间战斗 */
(function () {
  const TS = 16, ZOOM = 2.2, MW = 34, MH = 26;
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ============ 素材 ============ */
  const img = {};
  let loaded = 0;
  const total = Object.keys(A).length;
  for (const k of Object.keys(A)) {
    const im = new Image();
    im.onload = () => { loaded += 1; };
    im.onerror = () => { loaded += 1; };
    im.src = A[k];
    img[k] = im;
  }
  const ic = (k) => A[k] || A.ui_itemdisc_01 || '';

  /* 图集地面块（16px 网格，坐标为图集列/行，已按像素色值核对） */
  const T = {
    grass: [[2, 3], [3, 3], [1, 3], [2, 4], [1, 4], [5, 3], [7, 3]],
    path: [[1, 7], [9, 7], [10, 8], [3, 1]],
    sand: [[7, 1], [8, 1], [9, 1]],
    water: [[4, 1]],
    soil: [[2, 9], [3, 9], [4, 9]],
  };
  function pick(kind, x, y) {
    const arr = T[kind] || T.grass;
    let h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1274126177 + 2000000) | 0;
    const i = Math.abs(h ^ (h >> 16)) % arr.length;
    return arr[i];
  }
  function tile(kind, x, y) {
    const im = img.tiles;
    if (!im || !im.width) return;
    const c = pick(kind, x, y);
    ctx.drawImage(im, c[0] * TS, c[1] * TS, TS, TS, x * TS, y * TS, TS, TS);
  }
  function soilTile(x, y, wet) {
    tile('grass', x, y);
    ctx.fillStyle = wet ? '#8f5c40' : '#a66f58';
    ctx.fillRect(x * TS, y * TS, TS, TS);
    const im = img[wet ? 'soil_04' : 'soil_00'];
    if (im && im.width) ctx.drawImage(im, x * TS, y * TS + TS - im.height, im.width, im.height);
  }

  /* ============ 数据 ============ */
  const CROPS = {
    radish:      { name: '小萝卜',   seed: 6,  sell: 16, time: 26 },
    carrot:      { name: '胡萝卜',   seed: 8,  sell: 22, time: 32 },
    beetroot:    { name: '甜菜',     seed: 10, sell: 28, time: 38 },
    potato:      { name: '土豆',     seed: 12, sell: 34, time: 44 },
    cabbage:     { name: '卷心菜',   seed: 14, sell: 40, time: 50 },
    kale:        { name: '羽衣甘蓝', seed: 16, sell: 46, time: 56 },
    cauliflower: { name: '花椰菜',   seed: 18, sell: 52, time: 62 },
    parsnip:     { name: '欧防风',   seed: 22, sell: 64, time: 70 },
    pumpkin:     { name: '南瓜',     seed: 26, sell: 78, time: 80 },
    sunflower:   { name: '向日葵',   seed: 30, sell: 90, time: 88 },
    wheat:       { name: '小麦',     seed: 20, sell: 58, time: 66 },
  };
  const CROP_KEYS = Object.keys(CROPS);
  const ITEM_ICON = {
    '鸡蛋': 'item_egg', '鸭蛋': 'item_egg', '牛奶': 'item_milk', '羊毛': 'item_rock',
    '松露': 'item_rock', '鱼': 'item_fish', '木头': 'item_wood', '石头': 'item_rock',
  };
  const ITEM_PRICE = { '鸡蛋': 18, '鸭蛋': 24, '牛奶': 46, '羊毛': 62, '松露': 92, '鱼': 36, '木头': 12, '石头': 14 };
  const RECIPES = [
    { name: '田园沙拉', need: { '胡萝卜': 1, '卷心菜': 1 }, energy: 30, food: '沙拉' },
    { name: '蔬菜浓汤', need: { '土豆': 1, '甜菜': 1, '胡萝卜': 1 }, energy: 46, food: '浓汤' },
    { name: '香烤鱼',   need: { '鱼': 1 },                   energy: 40, food: '烤鱼' },
    { name: '南瓜派',   need: { '南瓜': 1, '小麦': 1 },       energy: 70, food: '南瓜派' },
    { name: '葵花籽茶', need: { '向日葵': 1 },               energy: 26, food: '花茶' },
  ];
  const G = { GRASS: 0, PATH: 1, SOIL: 2, WATER: 3, SAND: 4 };
  const TOOLS = [
    { id: 'hoe',    name: '锄头', icon: 'ui_shovel',  cost: 4 },
    { id: 'water',  name: '水壶', icon: 'ui_water',   cost: 2 },
    { id: 'seed',   name: '种子', icon: 'ui_plant',   cost: 1 },
    { id: 'basket', name: '篮子', icon: 'ui_basket',  cost: 0 },
    { id: 'axe',    name: '斧头', icon: 'ui_axe',     cost: 6 },
    { id: 'pick',   name: '镐子', icon: 'ui_pickaxe', cost: 6 },
    { id: 'rod',    name: '钓竿', icon: 'ui_rod',     cost: 5 },
    { id: 'sword',  name: '短剑', icon: 'ui_sword',   cost: 3 },
    { id: 'hammer', name: '锤子', icon: 'ui_hammer',  cost: 5 },
  ];

  /* ============ 世界 ============ */
  const SAVE_KEY = 'sunnyfarm_v3';
  function newWorld() {
    const g = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y += 1) for (let x = 0; x < MW; x += 1) g[y * MW + x] = G.GRASS;
    for (let y = 0; y < MH; y += 1) {                 // 右边沙滩 + 海
      for (let x = 27; x <= 30; x += 1) g[y * MW + x] = G.SAND;
      for (let x = 31; x < MW; x += 1) g[y * MW + x] = G.WATER;
    }
    for (let y = 18; y <= 22; y += 1) for (let x = 2; x <= 7; x += 1) g[y * MW + x] = G.WATER;   // 池塘
    for (let x = 8; x <= 27; x += 1) g[13 * MW + x] = G.PATH;                                     // 主路
    for (let y = 6; y <= 21; y += 1) g[y * MW + 13] = G.PATH;
    for (let y = 15; y <= 17; y += 1) for (let x = 10; x <= 14; x += 1) g[y * MW + x] = G.SOIL;   // 示范田
    return {
      ground: Array.from(g),
      crops: { '10,15': { k: 'radish', t: 26, water: 0 }, '11,15': { k: 'carrot', t: 20, water: 1 }, '12,15': { k: 'pumpkin', t: 40, water: 1 }, '13,16': { k: 'cabbage', t: 8, water: 0 } }, bag: { seed_radish: 6, seed_carrot: 4 }, foods: {},
      coins: 90, energy: 100, hp: 100, day: 1, time: 7,
      sel: 0, seedSel: 0, idle: 0,
      cottage: { x: 3, y: 5 }, crate: { x: 12, y: 14 }, dock: { x: 29, y: 13 },
      campfire: { x: 10, y: 12 }, windmill: { x: 22, y: 5 },
      pen: { x: 17, y: 18, w: 6, h: 4, fence: 3 },
      trees: [{ x: 1, y: 10, hp: 3 }, { x: 6, y: 15, hp: 3 }, { x: 21, y: 10, hp: 3 }, { x: 9, y: 4, hp: 3 }, { x: 25, y: 22, hp: 3 }, { x: 15, y: 22, hp: 3 }],
      rocks: [{ x: 5, y: 12, hp: 3 }, { x: 20, y: 21, hp: 3 }, { x: 11, y: 21, hp: 3 }, { x: 24, y: 16, hp: 3 }],
      animals: [
        { k: 'animal_chicken_01', label: '鸡', prod: '鸡蛋', x: 18, y: 19, t: 0, every: 20, ready: 6, dir: 1 },
        { k: 'animal_duck_01',    label: '鸭', prod: '鸭蛋', x: 20, y: 20.5, t: 0, every: 26, ready: 6, dir: -1 },
        { k: 'animal_cow',        label: '牛', prod: '牛奶', x: 21.5, y: 19, t: 0, every: 34, ready: 6, dir: 1 },
        { k: 'animal_sheep_01',   label: '羊', prod: '羊毛', x: 18.5, y: 21, t: 0, every: 40, ready: 6, dir: -1 },
        { k: 'animal_pig_01',     label: '猪', prod: '松露', x: 21.5, y: 21, t: 0, every: 46, ready: 6, dir: 1 },
      ],
      birds: [{ x: 8, y: 8, t: 0 }, { x: 19, y: 12, t: 3 }],
      boat: { x: 3, y: 17 },
      critters: [],
      decos: [
        { k: 'plant_tree_01', x: 8, y: 6 }, { k: 'plant_tree_02', x: 11, y: 9 },
        { k: 'plant_mushroom_red_01', x: 4, y: 16 }, { k: 'plant_mushroom_blue_01', x: 14, y: 7 },
        { k: 'plant_mushroom_blue_02', x: 16, y: 22 }, { k: 'plant_mushroom_blue_03', x: 26, y: 7 },
        { k: 'plant_mushroom_red_01', x: 19, y: 10 }, { k: 'plant_mushroom_blue_01', x: 2, y: 23 },
      ],
      drops: [], monsters: [], spawnT: 0,
      player: { x: 9.5, y: 13.5, dir: 2, anim: 0, moving: false, act: 0, actKind: '', face: 0 },
      stats: { planted: 0, harvest: 0, sold: 0, fished: 0, killed: 0, chopped: 0, cooked: 0, built: 0 },
      fishing: null,
    };
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(world)); } catch (e) {} }
  function load() {
    try {
      const w = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!w || !w.ground || w.ground.length !== MW * MH || !w.player) return null;
      return w;
    } catch (e) { return null; }
  }
  let world = load() || newWorld();
  if (!world.boat) world.boat = { x: 3, y: 17 };
  if (!world.critters) world.critters = [];

  /* ============ 提示 + 音效 ============ */
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(t) {
    toastEl.textContent = t;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1600);
  }
  let AC = null;
  function beep(f, d, type) {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), gn = AC.createGain();
      o.type = type || 'square'; o.frequency.value = f;
      gn.gain.setValueAtTime(0.05, AC.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.0006, AC.currentTime + (d || 0.09));
      o.connect(gn); gn.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + (d || 0.09) + 0.02);
    } catch (e) {}
  }

  /* ============ 画布尺寸 ============ */
  let VW = 0, VH = 0;
  function resize() {
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = (VW * DPR) | 0; cv.height = (VH * DPR) | 0;
    cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
    ctx.imageSmoothingEnabled = false;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ============ 输入 ============ */
  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (e.key >= '1' && e.key <= '9') { world.sel = Math.min(TOOLS.length - 1, Number(e.key) - 1); syncBar(); }
    if (k === ' ') { e.preventDefault(); action(); }
    if (k === 'e') interact();
    if (k === 'q') { world.seedSel = (world.seedSel + 1) % CROP_KEYS.length; toast('种子：' + CROPS[CROP_KEYS[world.seedSel]].name); }
    if (k === 'f') sleep();
    if (k === 'b') openPanel('bag');
    if (k === 'c') openPanel('cook');
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  const joyEl = document.getElementById('joy');
  const knob = joyEl.querySelector('i');
  const joy = { on: false, x: 0, y: 0, cx: 0, cy: 0 };
  function joyStart(e) {
    const t = e.touches ? e.touches[0] : e;
    const r = joyEl.getBoundingClientRect();
    joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; joy.on = true; joyMove(e);
  }
  function joyMove(e) {
    if (!joy.on) return;
    const t = e.touches ? e.touches[0] : e;
    let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
    const len = Math.hypot(dx, dy) || 1, cap = 32;
    if (len > cap) { dx = dx / len * cap; dy = dy / len * cap; }
    knob.style.left = (33 + dx) + 'px'; knob.style.top = (33 + dy) + 'px';
    joy.x = dx / cap; joy.y = dy / cap;
    if (e.preventDefault) e.preventDefault();
  }
  function joyEnd() { joy.on = false; joy.x = 0; joy.y = 0; knob.style.left = '33px'; knob.style.top = '33px'; }
  joyEl.addEventListener('touchstart', joyStart, { passive: false });
  joyEl.addEventListener('touchmove', joyMove, { passive: false });
  joyEl.addEventListener('touchend', joyEnd);
  joyEl.addEventListener('mousedown', joyStart);
  window.addEventListener('mousemove', (e) => { if (joy.on) joyMove(e); });
  window.addEventListener('mouseup', joyEnd);

  document.getElementById('btnUse').onclick = () => action();
  document.getElementById('btnInter').onclick = () => interact();
  document.getElementById('btnSwitch').onclick = () => {
    world.sel = (world.sel + 1) % TOOLS.length;
    syncBar(); toast('工具：' + TOOLS[world.sel].name);
  };
  document.getElementById('btnBag').onclick = () => openPanel('bag');

  /* ============ 工具栏 ============ */
  const bar = document.getElementById('bar');
  const barBtns = [];
  TOOLS.forEach((t, i) => {
    const b = document.createElement('button');
    b.innerHTML = '<img alt="" src="' + ic(t.icon) + '"><b>' + t.name + '</b>';
    b.onclick = () => { world.sel = i; syncBar(); };
    bar.appendChild(b);
    barBtns.push(b);
  });

  /* ============ 面板 ============ */
  const panel = document.getElementById('panel');
  const pBody = document.getElementById('pBody');
  const pTabs = document.getElementById('pTabs');
  const pTitle = document.getElementById('pTitle');
  document.getElementById('pClose').onclick = () => panel.classList.remove('on');
  let pTab = 'bag';

  function openPanel(tab) {
    pTab = tab || pTab;
    pTitle.textContent = { bag: '背包', food: '食物', cook: '烹饪 · 食谱' }[pTab];
    pTabs.innerHTML = '';
    [['bag', '物品 / 种子'], ['food', '食物'], ['cook', '食谱']].forEach(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = pTab === id ? 'on' : '';
      b.onclick = () => openPanel(id);
      pTabs.appendChild(b);
    });
    pBody.innerHTML = '';
    const line = (html) => {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = html;
      pBody.appendChild(r);
      return r;
    };

    if (pTab === 'bag') {
      line('<span style="opacity:.8">用「种子」工具播种，按 Q 换种类。种子可以直接买。</span>');
      CROP_KEYS.forEach((k) => {
        const n = world.bag['seed_' + k] || 0;
        const r = line('<span class="grow"><img src="' + ic('crop_' + k + '_5') + '">' +
          CROPS[k].name + '种子 × ' + n + '</span><small class="dim">' + CROPS[k].seed + '金/颗 · 熟后卖 ' + CROPS[k].sell + '</small>');
        const b = document.createElement('button');
        b.className = 'ok';
        b.innerHTML = '<img class="mini" src="' + ic('ui_confirm') + '">买3';
        b.onclick = () => {
          const cost = CROPS[k].seed * 3;
          if (world.coins < cost) { toast('金币不够'); return; }
          world.coins -= cost;
          world.bag['seed_' + k] = (world.bag['seed_' + k] || 0) + 3;
          beep(780, 0.07); save(); updateHud(); openPanel('bag');
        };
        r.appendChild(b);
      });
      const owned = Object.keys(world.bag).filter((k) => k.indexOf('seed_') !== 0 && world.bag[k] > 0);
      if (owned.length) line('<span style="opacity:.6;margin-top:6px">仓库里现有的东西</span>');
      owned.forEach((k) => {
        line('<span class="grow"><img src="' + ic(ITEM_ICON[k] || 'item_seeds_generic') + '">' + k + ' × ' + world.bag[k] +
          '</span><small class="dim">' + (ITEM_PRICE[k] || 10) + ' 金/个</small>');
      });
    } else if (pTab === 'food') {
      const names = Object.keys(world.foods).filter((k) => world.foods[k] > 0);
      if (!names.length) line('<span style="opacity:.8">还没有做好的食物，去「食谱」做一份。</span>');
      names.forEach((k) => {
        const rec = RECIPES.find((x) => x.food === k);
        const r = line('<span class="grow"><img src="' + ic('ui_itemdisc_02') + '">' + k + ' × ' + world.foods[k] +
          '</span><small class="dim">吃一个 +' + (rec ? rec.energy : 20) + ' 体力</small>');
        const b = document.createElement('button');
        b.className = 'ok';
        b.textContent = '吃掉';
        b.onclick = () => {
          if (!world.foods[k]) return;
          world.foods[k] -= 1;
          world.energy = Math.min(100, world.energy + (rec ? rec.energy : 20));
          beep(880, 0.09); toast('吃了' + k + '，体力 +' + (rec ? rec.energy : 20));
          save(); updateHud(); openPanel('food');
        };
        r.appendChild(b);
      });
    } else {
      RECIPES.forEach((rec) => {
        const needText = Object.keys(rec.need).map((n) => n + '×' + rec.need[n]).join(' + ');
        const r = line('<span class="grow"><img src="' + ic('ui_itemdisc_02') + '">' + rec.name +
          '<br><small class="dim">' + needText + ' · +' + rec.energy + ' 体力</small></span>');
        const b = document.createElement('button');
        b.className = 'ok';
        b.textContent = '做一份';
        b.onclick = () => {
          for (const n of Object.keys(rec.need)) {
            if ((world.bag[n] || 0) < rec.need[n]) { toast('缺少 ' + n); beep(180, 0.12); return; }
          }
          for (const n of Object.keys(rec.need)) world.bag[n] -= rec.need[n];
          world.foods[rec.food] = (world.foods[rec.food] || 0) + 1;
          world.stats.cooked += 1;
          beep(920, 0.1); toast('做好了：' + rec.food);
          save(); updateHud(); openPanel('cook');
        };
        r.appendChild(b);
      });
    }
    panel.classList.add('on');
  }

  /* ============ 基础 ============ */
  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return -1;
    return world.ground[y * MW + x];
  }
  function setTile(x, y, t) { if (x >= 0 && y >= 0 && x < MW && y < MH) world.ground[y * MW + x] = t; }
  function front() {
    const p = world.player;
    const fx = Math.round(Math.sin(p.dir * Math.PI / 2));
    const fy = -Math.round(Math.cos(p.dir * Math.PI / 2));
    return { x: Math.floor(p.x + fx * 0.9), y: Math.floor(p.y + fy * 0.9) };
  }
  function nearWater() {
    const p = world.player;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (tileAt(Math.floor(p.x) + dx, Math.floor(p.y) + dy) === G.WATER) return true;
    }
    return false;
  }
  function spend(n) {
    if (world.energy < n) { toast('体力不够，回去睡一觉或吃点东西'); world.player.face = 3; beep(160, 0.12); return false; }
    world.energy -= n;
    return true;
  }
  function setAct(kind, dur, anim) { world.player.act = dur; world.player.actDur = dur; world.player.actKind = kind; world.player.actAnim = anim || 0; }

  /* ============ 动作 ============ */
  function action() {
    const tool = TOOLS[world.sel].id;
    const p = world.player;
    if (p.act > 0) return;
    if (tool === 'basket') {
      const f = front();
      const c = world.crops[f.x + ',' + f.y];
      if (c && stageOf(c) >= 5) {
        const def = CROPS[c.k];
        delete world.crops[f.x + ',' + f.y];
        world.bag[def.name] = (world.bag[def.name] || 0) + 1;
        world.stats.harvest += 1;
        setAct('harvest', 0.35, 2); beep(880, 0.09);
        pop(f.x * TS + 8, f.y * TS, '+1 ' + def.name);
        save(); updateHud(); return;
      }
      if (!sellAll()) interact();
      return;
    }
    if (tool === 'rod') { fish(); return; }
    if (tool === 'sword') { swing(); return; }
    if (tool === 'hammer') { build(); return; }

    const f = front();
    const t = tileAt(f.x, f.y);
    const key = f.x + ',' + f.y;

    if (tool === 'hoe') {
      if (t === G.SOIL) { toast('这块已经开好了'); return; }
      if (t !== G.GRASS) { toast('这里开不了地'); return; }
      if (!spend(4)) return;
      setTile(f.x, f.y, G.SOIL); setAct('dig', 0.65, 3); beep(300, 0.08); save(); return;
    }
    if (tool === 'water') {
      const c = world.crops[key];
      if (!c) { toast('这里没有作物'); return; }
      if (!spend(2)) return;
      c.water = 1; setAct('water', 0.55, 4); beep(520, 0.1); save(); return;
    }
    if (tool === 'seed') {
      if (t !== G.SOIL) { toast('先用锄头在草地上开一块地'); return; }
      if (world.crops[key]) { toast('这块地已经种了'); return; }
      const kind = CROP_KEYS[world.seedSel];
      const have = world.bag['seed_' + kind] || 0;
      if (have <= 0) { toast('没有' + CROPS[kind].name + '种子（背包里可买）'); return; }
      if (!spend(1)) return;
      world.bag['seed_' + kind] = have - 1;
      world.crops[key] = { k: kind, t: 0, water: 0 };
      world.stats.planted += 1;
      setAct('dig', 0.4, 3); beep(660, 0.07); save(); return;
    }
    if (tool === 'axe') {
      const tree = world.trees.find((o) => Math.abs(o.x - f.x) <= 1 && Math.abs(o.y - f.y) <= 1);
      if (!tree) { toast('附近没有树'); return; }
      if (!spend(6)) return;
      tree.hp -= 1; setAct('axe', 0.6, 5); beep(240, 0.1); glint(f.x * TS + 8, f.y * TS);
      if (tree.hp <= 0) {
        world.trees = world.trees.filter((o) => o !== tree);
        world.bag['木头'] = (world.bag['木头'] || 0) + 3;
        world.stats.chopped += 1;
        pop(f.x * TS + 8, f.y * TS, '+3 木头'); toast('砍到 3 个木头');
      }
      save(); updateHud(); return;
    }
    if (tool === 'pick') {
      const rock = world.rocks.find((o) => Math.abs(o.x - f.x) <= 1 && Math.abs(o.y - f.y) <= 1);
      if (!rock) { toast('附近没有石头'); return; }
      if (!spend(6)) return;
      rock.hp -= 1; setAct('mine', 0.6, 6); beep(200, 0.1); glint(f.x * TS + 8, f.y * TS);
      if (rock.hp <= 0) {
        world.rocks = world.rocks.filter((o) => o !== rock);
        world.bag['石头'] = (world.bag['石头'] || 0) + 3;
        pop(f.x * TS + 8, f.y * TS, '+3 石头'); toast('挖到 3 个石头');
      }
      save(); updateHud(); return;
    }
  }

  function fish() {
    const p = world.player;
    if (world.fishing) {
      if (world.fishing.phase === 'reel') return;
      world.fishing.ready = world.fishing.phase === 'ready';
      world.fishing.phase = 'reel';
      world.fishing.done = 0.5;
      setAct('reel', 0.9, 7); beep(300, 0.08);
      return;
    }
    if (!nearWater()) { toast('要站在水边才能钓鱼'); return; }
    if (!spend(5)) return;
    setAct('cast', 1.0, 8);
    world.fishing = { phase: 'wait', t: 0, done: 0, ready: false };
    toast('抛竿了，绿光闪的时候再按「用」收竿');
    beep(420, 0.1);
  }
  function finishFish() {
    const p = world.player;
    const ok = Math.random() < (world.fishing && world.fishing.ready ? 0.85 : 0.45);
    world.fishing = null;
    setAct('reel', 0.9, 7);
    if (ok) {
      world.bag['鱼'] = (world.bag['鱼'] || 0) + 1;
      world.stats.fished += 1;
      pop(p.x * TS, p.y * TS - 4, '+1 鱼');
      toast('钓到一条鱼！');
      beep(900, 0.1); setTimeout(() => beep(1240, 0.1), 90);
    } else { toast('鱼跑了…再抛一次'); beep(220, 0.14); }
    save(); updateHud();
  }

  function swing() {
    if (!spend(3)) return;
    setAct('attack', 0.4, 9); beep(520, 0.07);
    const p = world.player;
    let hit = false;
    for (const m of world.monsters) {
      if (m.dead !== undefined) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) < 1.9) {
        m.hp -= 1; m.hurt = 0.28; hit = true;
        if (m.hp <= 0) {
          m.dead = 0.7;
          world.coins += m.coin;
          world.stats.killed += 1;
          pop(m.x * TS, m.y * TS, '+' + m.coin);
          toast('打倒一只' + m.label + ' +' + m.coin + ' 金');
          save(); updateHud();
        }
      }
    }
    if (hit) beep(300, 0.12);
  }

  function build() {
    const p = world.player, pen = world.pen;
    const near = Math.abs(p.x - (pen.x + pen.w / 2)) < pen.w / 2 + 2 && Math.abs(p.y - (pen.y + pen.h / 2)) < pen.h / 2 + 2;
    if (!near) { toast('走到牲畜围栏旁边才能修'); return; }
    if (pen.fence >= 3) { toast('围栏是好的（耐久 ' + pen.fence + '/3）'); return; }
    if ((world.bag['木头'] || 0) < 2) { toast('修围栏需要 2 个木头'); return; }
    if (!spend(5)) return;
    world.bag['木头'] -= 2;
    pen.fence = Math.min(3, pen.fence + 1);
    world.stats.built += 1;
    setAct('hammer', 0.9, 10); beep(360, 0.1); setTimeout(() => beep(300, 0.1), 120);
    toast('修好了围栏 ' + pen.fence + '/3');
    save(); updateHud();
  }

  function interact() {
    const p = world.player;
    for (let i = world.drops.length - 1; i >= 0; i -= 1) {
      const d = world.drops[i];
      if (Math.hypot(d.x - p.x, d.y - p.y) < 1.6) {
        world.drops.splice(i, 1);
        world.bag[d.name] = (world.bag[d.name] || 0) + 1;
        beep(900, 0.08); toast('捡到 1 个' + d.name);
        pop(d.x * TS, d.y * TS, '+1 ' + d.name);
        save(); updateHud(); return;
      }
    }
    const c = world.crate;
    if (Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y) < 2.2) { sellAll(); return; }
    const cot = world.cottage;
    if (Math.hypot(cot.x + 1.5 - p.x, cot.y + 3 - p.y) < 2.8) { sleep(); return; }
    if (nearWater() && !world.fishing) { toast('选「钓竿」后按「用」抛竿'); return; }
    toast('附近没有能互动的东西');
  }

  function sellAll() {
    const p = world.player, c = world.crate;
    if (Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y) > 2.3) return false;
    let income = 0, count = 0;
    for (const k of Object.keys(world.bag)) {
      if (k.indexOf('seed_') === 0) continue;
      const n = world.bag[k];
      if (!n) continue;
      let price = ITEM_PRICE[k] || 10;
      for (const ck of CROP_KEYS) if (CROPS[ck].name === k) price = CROPS[ck].sell;
      income += price * n; count += n;
      delete world.bag[k];
    }
    if (!count) { toast('走到木箱旁（右下角）才能卖，现在没东西可卖'); return false; }
    world.coins += income;
    world.stats.sold += count;
    setAct('carry', 0.6, 11);
    pop(c.x * TS + 8, c.y * TS, '+' + income);
    toast('卖了 ' + count + ' 件 +' + income + ' 金');
    beep(1040, 0.1); setTimeout(() => beep(1320, 0.09), 90);
    save(); updateHud();
    return true;
  }

  function sleep() {
    const p = world.player, c = world.cottage;
    if (Math.hypot(c.x + 1.5 - p.x, c.y + 3 - p.y) > 3) { toast('走到小屋门口才能睡觉'); return; }
    world.day += 1; world.time = 6;
    world.energy = 100; world.hp = Math.min(100, world.hp + 40);
    world.monsters = []; world.fishing = null; world.pen.fence = 3;
    beep(600, 0.16); setTimeout(() => beep(420, 0.2), 150);
    toast('睡了一觉，第 ' + world.day + ' 天');
    save(); updateHud();
  }

  /* ============ 粒子 ============ */
  const pops = [], glints = [];
  function pop(x, y, text) { pops.push({ x, y, text, life: 1 }); }
  function glint(x, y) { glints.push({ x, y, t: 0 }); }
  function stageOf(c) {
    const def = CROPS[c.k];
    const sp = c.water ? 1.45 : 1;
    return Math.min(5, Math.floor(Math.min(1, (c.t * sp) / def.time) * 5.999));
  }

  /* ============ 更新 ============ */
  function update(dt) {
    const p = world.player;
    let mx = 0, my = 0;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (joy.x || joy.y) { mx = joy.x; my = joy.y; }
    const len = Math.hypot(mx, my);
    if (len > 0.15 && p.act <= 0 && world.fishing === null) {
      const nx = mx / len, ny = my / len, sp = 4;
      if (walkable(p.x + nx * sp * dt, p.y)) p.x += nx * sp * dt;
      if (walkable(p.x, p.y + ny * sp * dt)) p.y += ny * sp * dt;
      p.dir = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 1 : 3) : (ny > 0 ? 2 : 0);
      p.moving = true; world.idle = 0;
    } else { p.moving = false; world.idle += dt; }
    p.anim += dt * (p.moving ? 10 : 5);
    if (p.act > 0) p.act = Math.max(0, p.act - dt);
    world.energy = Math.min(100, world.energy + dt * 0.3);
    if (p.face > 0) p.face = Math.max(0, p.face - dt);

    for (const k of Object.keys(world.crops)) {
      const c = world.crops[k]; c.t += dt;
      if (c.water) c.water = Math.max(0, c.water - dt * 0.014);
    }
    for (const a of world.animals) {
      a.t += dt;
      if (Math.sin(a.t * 0.6) > 0.985) a.dir = Math.random() < 0.5 ? -1 : 1;
      const nx = a.x + a.dir * dt * 0.5;
      const tx = Math.floor(nx), ty = Math.floor(a.y), pen = world.pen;
      if (tx > pen.x && tx < pen.x + pen.w && ty >= pen.y && ty <= pen.y + pen.h && tileAt(tx, ty) !== G.WATER) a.x = nx;
      else a.dir *= -1;
      if (a.prod) {
        a.ready = (a.ready || 0) + dt;
        if (a.ready >= a.every) {
          a.ready = 0;
          world.drops.push({ name: a.prod, x: Math.round(a.x), y: Math.round(a.y), t: 0 });
        }
      }
    }
    for (const b of world.birds) b.t += dt;
    for (const cr of world.critters) {
      cr.t += dt;
      if (Math.sin(cr.t * 0.8) > 0.99) cr.dir *= -1;
      const nx = cr.x + cr.dir * dt * 0.8;
      if (walkable(nx, cr.y)) cr.x = nx; else cr.dir *= -1;
    }
    for (const d of world.drops) d.t += dt;

    if (world.fishing) {
      world.fishing.t += dt;
      if (world.fishing.phase === 'wait' && world.fishing.t > 1.2) world.fishing.phase = 'ready';
      if (world.fishing.phase === 'reel') {
        world.fishing.done -= dt;
        if (world.fishing.done <= 0) finishFish();
      }
      if (world.fishing && world.fishing.t > 8) { world.fishing = null; toast('鱼跑掉了'); }
    }

    world.time += dt * 3 / 60;
    if (world.time >= 24) { world.day += 1; world.time = 6; world.monsters = []; toast('第 ' + world.day + ' 天'); }
    const night = world.time >= 19 || world.time < 6;
    if (night && world.monsters.length < 4) {
      world.spawnT += dt;
      if (world.spawnT > 6) {
        world.spawnT = 0;
        const gob = Math.random() < 0.6;
        world.monsters.push({
          kind: gob ? 'goblin' : 'skeleton', label: gob ? '哥布林' : '骷髅',
          x: 2 + Math.random() * (MW - 4), y: 2 + Math.random() * (MH - 4),
          hp: gob ? 3 : 2, maxHp: gob ? 3 : 2, coin: gob ? 18 : 26,
          t: 0, dir: 1, hurt: 0, atk: 0, atkCd: 0,
        });
      }
    }
    for (const m of world.monsters) {
      m.t += dt;
      if (m.dead !== undefined) { m.dead -= dt; continue; }
      if (m.hurt > 0) m.hurt = Math.max(0, m.hurt - dt);
      if (m.atk > 0) m.atk = Math.max(0, m.atk - dt);
      const dx = p.x - m.x, dy = p.y - m.y, dist = Math.hypot(dx, dy);
      if (dist < 7 && dist > 0.8) { m.x += dx / dist * dt * 1.5; m.y += dy / dist * dt * 1.5; m.dir = dx > 0 ? 1 : -1; }
      m.atkCd = Math.max(0, m.atkCd - dt);
      if (dist < 1.2 && m.atkCd <= 0) {
        m.atkCd = 1.3; m.atk = 0.4;
        world.hp -= 9;
        p.face = 3; beep(180, 0.16); pop(p.x * TS, p.y * TS - 6, '-9');
        if (world.hp <= 0) {
          world.hp = 50; world.coins = Math.max(0, world.coins - 20);
          p.act = 1.1; p.actDur = 1.1; p.actKind = 'ko'; p.actAnim = 12;
          p.x = world.cottage.x + 2; p.y = world.cottage.y + 4;
          world.fishing = null;
          toast('被打晕了…回到小屋，掉了 20 金');
          beep(120, 0.3); save(); updateHud();
        }
      }
    }
    world.monsters = world.monsters.filter((m) => m.dead === undefined || m.dead > 0);

    for (let i = pops.length - 1; i >= 0; i -= 1) { pops[i].y -= dt * 16; pops[i].life -= dt * 0.95; if (pops[i].life <= 0) pops.splice(i, 1); }
    for (let i = glints.length - 1; i >= 0; i -= 1) { glints[i].t += dt; if (glints[i].t > 0.45) glints.splice(i, 1); }
  }
  function walkable(x, y) { const t = tileAt(Math.floor(x), Math.floor(y)); return t >= 0 && t !== G.WATER; }

  /* ============ 绘制 ============ */
  const cam = { x: 0, y: 0 };
  function drawStrip(key, frames, x, y, o) {
    const im = img[key];
    if (!im || !im.width) return;
    const opt = o || {};
    const fw = im.width / frames;
    const fr = Math.max(0, Math.min(frames - 1, Math.floor((opt.t || 0) * (opt.fps || 6)) % frames));
    const sc = opt.scale || 1;
    ctx.save();
    ctx.translate(x, y);
    if (opt.flip) ctx.scale(-1, 1);
    ctx.drawImage(im, fr * fw, 0, fw, im.height, -fw * sc / 2, -(opt.feet || 0) * sc, fw * sc, im.height * sc);
    ctx.restore();
  }
  const ANIM = {
    walk: ['h_walk', 8], idle: ['h_idle', 9], wait: ['h_wait', 9], dig: ['h_dig', 13], water: ['h_water', 5],
    axe: ['h_axe', 10], mine: ['h_mine', 10], cast: ['h_cast', 15], reel: ['h_reel', 13],
    attack: ['h_attack', 10], hurt: ['h_hurt', 8], death: ['h_death', 13],
    hammer: ['h_hammer', 23], carry: ['h_carry', 8],
  };

  function render() {
    const p = world.player;
    const viewW = VW / ZOOM, viewH = VH / ZOOM;
    cam.x = Math.max(0, Math.min(MW * TS - viewW, p.x * TS - viewW / 2));
    cam.y = Math.max(0, Math.min(MH * TS - viewH, p.y * TS - viewH / 2));

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#2f8fd8'; ctx.fillRect(0, 0, VW, VH);
    ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, -cam.x * DPR * ZOOM, -cam.y * DPR * ZOOM);

    const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS));
    const x1 = Math.min(MW - 1, x0 + Math.ceil(viewW / TS) + 1);
    const y1 = Math.min(MH - 1, y0 + Math.ceil(viewH / TS) + 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const g = world.ground[y * MW + x];
        if (g === G.SOIL) {
          const cw = world.crops[x + ',' + y];
          soilTile(x, y, !!(cw && cw.water > 0.2));
        }
        else if (g === G.PATH) tile('path', x, y);
        else if (g === G.WATER) tile('water', x, y);
        else if (g === G.SAND) tile('sand', x, y);
        else tile('grass', x, y);
      }
    }
    // 水岸泡沫 + 暗边
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (world.ground[y * MW + x] !== G.WATER) continue;
        const up = tileAt(x, y - 1) !== G.WATER, dn = tileAt(x, y + 1) !== G.WATER;
        const lf = tileAt(x - 1, y) !== G.WATER, rt = tileAt(x + 1, y) !== G.WATER;
        if (up) { ctx.fillStyle = 'rgba(205,240,255,.85)'; ctx.fillRect(x * TS, y * TS, TS, 2.2); }
        if (lf) { ctx.fillStyle = 'rgba(205,240,255,.7)'; ctx.fillRect(x * TS, y * TS, 2.2, TS); }
        if (dn) { ctx.fillStyle = 'rgba(8,52,96,.55)'; ctx.fillRect(x * TS, y * TS + TS - 2.4, TS, 2.4); }
        if (rt) { ctx.fillStyle = 'rgba(8,52,96,.45)'; ctx.fillRect(x * TS + TS - 2.4, y * TS, 2.4, TS); }
      }
    }
    // 水波
    const wt = performance.now() / 700;
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#bfe9ff';
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      if (world.ground[y * MW + x] !== G.WATER) continue;
      const off = Math.sin(wt + x * 0.7 + y * 0.4) * 2;
      ctx.fillRect(x * TS + 3, y * TS + 8 + off, 9, 1);
    }
    ctx.globalAlpha = 1;

    const pen = world.pen;
    ctx.fillStyle = pen.fence >= 3 ? '#c9a06a' : '#9a7a50';
    for (let x = pen.x; x <= pen.x + pen.w; x += 1) {
      ctx.fillRect(x * TS + 5, pen.y * TS - 6, 4, 12);
      ctx.fillRect(x * TS + 5, (pen.y + pen.h) * TS + 2, 4, 12);
    }
    ctx.fillStyle = '#e0b27a';
    ctx.fillRect(pen.x * TS, pen.y * TS - 2, (pen.w + 1) * TS, 3);
    ctx.fillRect(pen.x * TS, (pen.y + pen.h) * TS + 6, (pen.w + 1) * TS, 3);

    /* 小屋 */
    const cot = world.cottage;
    ctx.fillStyle = '#b8874f'; ctx.fillRect(cot.x * TS, cot.y * TS + 10, TS * 3, TS * 2);
    ctx.fillStyle = '#8a5f38'; ctx.fillRect(cot.x * TS + 2, cot.y * TS + 24, TS * 3 - 4, 10);
    ctx.fillStyle = '#c2543a';
    ctx.beginPath();
    ctx.moveTo(cot.x * TS - 3, cot.y * TS + 12);
    ctx.lineTo(cot.x * TS + TS * 1.5, cot.y * TS - 8);
    ctx.lineTo(cot.x * TS + TS * 3 + 3, cot.y * TS + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2d08a'; ctx.fillRect(cot.x * TS + 20, cot.y * TS + 22, 10, 14);
    drawStrip('vfx_smoke', 30, cot.x * TS + TS * 2.4, cot.y * TS - 6, { t: performance.now() / 1000, fps: 12, scale: 0.7, feet: 0 });
    ctx.fillStyle = 'rgba(255,240,200,.95)'; ctx.font = '6px monospace';
    ctx.fillText('小屋·睡觉', cot.x * TS + 1, cot.y * TS + 44);

    // 小艇（池塘边）
    if (world.boat && img.boat.width) ctx.drawImage(img.boat, world.boat.x * TS, world.boat.y * TS + TS - 30, 32, 30);

    drawStrip('other_windmill', 9, world.windmill.x * TS, world.windmill.y * TS + TS, { t: performance.now() / 1000, fps: 6, scale: 1, feet: 104 });

    const dock = world.dock;
    ctx.fillStyle = '#b8874f'; ctx.fillRect(dock.x * TS, dock.y * TS, TS * 2.2, TS * 1.2);
    ctx.fillStyle = '#8a5f38';
    for (let i = 0; i < 3; i += 1) ctx.fillRect(dock.x * TS + i * 12, dock.y * TS, 3, TS * 1.2);

    const crate = world.crate;
    if (img.item_crate_base.width) ctx.drawImage(img.item_crate_base, crate.x * TS - 4, crate.y * TS, TS * 1.4, TS * 1.4);
    if (img.item_crate_top.width) ctx.drawImage(img.item_crate_top, crate.x * TS - 4, crate.y * TS - 6, TS * 1.4, TS * 0.7);
    ctx.fillStyle = '#ffe9b8'; ctx.font = '6px monospace';
    ctx.fillText('卖货', crate.x * TS + 1, crate.y * TS + TS * 1.4 + 10);

    /* 作物 */
    for (const key of Object.keys(world.crops)) {
      const sp = key.split(','), cx = Number(sp[0]), cy = Number(sp[1]);
      const c = world.crops[key], st = stageOf(c);
      const im = img['crop_' + c.k + '_' + st];
      if (im && im.width) ctx.drawImage(im, cx * TS + TS / 2 - im.width / 2, cy * TS + TS - im.height - 1, im.width, im.height);
      if (st === 5) {
        const g = img.vfx_glint1;
        if (g && g.width) {
          const f = Math.floor(performance.now() / 110) % 6, fw = g.width / 6;
          ctx.drawImage(g, f * fw, 0, fw, g.height, cx * TS + 3, cy * TS - 3, TS, TS);
        }
      }
      if (c.water > 0.2) { ctx.fillStyle = 'rgba(90,150,220,.4)'; ctx.fillRect(cx * TS, cy * TS + TS - 3, TS, 3); }
    }
    for (const d of world.drops) {
      const bob = Math.sin(d.t * 4) * 1.5;
      const im = img[ITEM_ICON[d.name] || 'item_egg'];
      if (im && im.width) ctx.drawImage(im, d.x * TS + 3, d.y * TS + 5 + bob, TS - 6, TS - 6);
      ctx.fillStyle = '#ffe9b8'; ctx.font = '6px monospace';
      ctx.fillText(d.name, d.x * TS - 2, d.y * TS + 2 + bob);
    }

    const night = world.time >= 19 || world.time < 6;
    if (night) {
      drawStrip('vfx_fire1', 4, world.campfire.x * TS, world.campfire.y * TS + 10, { t: performance.now() / 1000, fps: 8, scale: 1.2, feet: 0 });
      drawStrip('vfx_fire2', 4, world.campfire.x * TS + 6, world.campfire.y * TS + 11, { t: performance.now() / 1000 + 0.3, fps: 9, scale: 0.9, feet: 0 });
    }

    const list = [];
    for (const d of world.decos) list.push({ y: d.y * TS + TS, t: 'deco', o: d });
    for (const r of world.rocks) list.push({ y: r.y * TS + TS, t: 'rock', o: r });
    for (const t of world.trees) list.push({ y: t.y * TS + TS, t: 'tree', o: t });
    for (const a of world.animals) list.push({ y: a.y * TS + TS, t: 'animal', o: a });
    for (const b of world.birds) list.push({ y: b.y * TS + TS, t: 'bird', o: b });
    for (const cr of world.critters) list.push({ y: cr.y * TS + TS, t: 'critter', o: cr });
    for (const m of world.monsters) list.push({ y: m.y * TS + TS, t: 'monster', o: m });
    list.push({ y: p.y * TS + TS, t: 'player' });
    list.sort((a, b) => a.y - b.y);

    for (const it of list) {
      if (it.t === 'deco') {
        const d = it.o, im = img[d.k];
        if (!im || !im.width) continue;
        const fw = im.width / 4, f = Math.floor((performance.now() / 280) % 4);
        const feet = d.k.indexOf('tree') >= 0 ? 34 : 30;
        ctx.drawImage(im, f * fw, 0, fw, im.height, d.x * TS - 8, d.y * TS + TS - feet, fw, im.height);
      } else if (it.t === 'rock') {
        const r = it.o;
        if (img.item_rock.width) ctx.drawImage(img.item_rock, r.x * TS + 1, r.y * TS + 3, TS - 2, TS - 4);
      } else if (it.t === 'tree') {
        const t = it.o, im = img.plant_tree_01;
        if (im.width) {
          const fw = im.width / 4, f = Math.floor((performance.now() / 340) % 4);
          ctx.drawImage(im, f * fw, 0, fw, im.height, t.x * TS - 8, t.y * TS + TS - 34, fw, im.height);
        }
        for (let i = 0; i < t.hp; i += 1) { ctx.fillStyle = '#7ce07c'; ctx.fillRect(t.x * TS + 2 + i * 4, t.y * TS + TS + 1, 3, 2); }
      } else if (it.t === 'animal') {
        const a = it.o;
        const feet = a.k.indexOf('chicken') >= 0 || a.k.indexOf('duck') >= 0 ? 25 : 28;
        drawStrip(a.k, 4, a.x * TS, a.y * TS + TS, { t: a.t, fps: 6, flip: a.dir < 0, scale: 1.15, feet: feet });
        if (a.prod && a.ready > a.every * 0.86) {
          ctx.fillStyle = '#fff8c8'; ctx.font = '8px monospace';
          ctx.fillText('!', a.x * TS, a.y * TS - 2);
        }
      } else if (it.t === 'bird') {
        const b = it.o;
        drawStrip('animal_bird_01', 4, b.x * TS, b.y * TS + TS + Math.sin(b.t * 2) * 3, { t: b.t, fps: 8, scale: 1, feet: 25 });
      } else if (it.t === 'critter') {
        const cr = it.o;
        drawStrip('animal_blinking', 12, cr.x * TS, cr.y * TS + TS, { t: cr.t, fps: 7, flip: cr.dir < 0, scale: 1.1, feet: 16 });
      } else if (it.t === 'monster') {
        const m = it.o;
        const pre = m.kind === 'goblin' ? 'gob' : 'skel';
        let key = pre + '_walk', frames = 8;
        if (m.dead !== undefined) { key = pre + '_death'; frames = m.kind === 'goblin' ? 13 : 10; }
        else if (m.hurt > 0) { key = pre + '_hurt'; frames = m.kind === 'goblin' ? 8 : 7; }
        else if (m.atk > 0) { key = pre + '_attack'; frames = m.kind === 'goblin' ? 10 : 7; }
        drawStrip(key, frames, m.x * TS, m.y * TS + TS, { t: m.t, fps: 10, flip: m.dir < 0, scale: 1.2, feet: m.kind === 'goblin' ? 38 : 39 });
        if (m.dead === undefined) {
          ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(m.x * TS - 8, m.y * TS - 9, 16, 3);
          ctx.fillStyle = '#ff6b6b'; ctx.fillRect(m.x * TS - 8, m.y * TS - 9, 16 * Math.max(0, m.hp / m.maxHp), 3);
        }
      } else {
        let key = 'h_walk', frames = 8, t = p.anim, fps = 9;
        if (p.act > 0) {
          const a = ANIM[p.actKind === 'harvest' ? 'dig' : p.actKind === 'ko' ? 'death' : p.actKind] || ANIM.walk;
          key = a[0]; frames = a[1]; fps = 16;
          t = p.actDur ? (p.actDur - p.act) : 0;
        } else if (!p.moving) { const a = world.idle > 4 ? ANIM.wait : ANIM.idle; key = a[0]; frames = a[1]; t = p.anim; fps = 7; }
        drawStrip(key, frames, p.x * TS, p.y * TS + TS, { t: t, fps: fps, flip: p.dir === 3, scale: 1.25, feet: 38 });
        const faceKey = { 1: 'ui_expression_love', 2: 'ui_expression_working', 3: 'ui_expression_stress' }[p.face > 0 ? Math.round(p.face) : 0];
        if (faceKey && img[faceKey].width) ctx.drawImage(img[faceKey], p.x * TS + 4, p.y * TS - 16, 14, 14);
        if (world.fishing && world.fishing.phase === 'ready') {
          const g = img.vfx_glint1;
          if (g && g.width) {
            const f = Math.floor(performance.now() / 90) % 6, fw = g.width / 6;
            const fx = p.x * TS + (p.dir === 1 ? 22 : p.dir === 3 ? -22 : 0);
            ctx.drawImage(g, f * fw, 0, fw, g.height, fx - 8, p.y * TS + 4, TS, TS);
          }
        }
        if (world.fishing && world.fishing.phase === 'wait') {
          ctx.fillStyle = '#ffe9b8'; ctx.font = '6px monospace';
          ctx.fillText('等鱼…', p.x * TS - 6, p.y * TS - 24);
        }
      }
    }

    ctx.font = '7px monospace';
    for (const q of pops) {
      ctx.globalAlpha = Math.max(0, Math.min(1, q.life));
      ctx.fillStyle = '#fff8c8';
      ctx.fillText(q.text, q.x - q.text.length * 2, q.y);
      ctx.globalAlpha = 1;
    }
    for (const g of glints) {
      const im = img.vfx_glint1;
      if (!im || !im.width) break;
      const f = Math.min(5, Math.floor(g.t * 14));
      ctx.drawImage(im, f * (im.width / 6), 0, im.width / 6, im.height, g.x - 8, g.y - 8, TS, TS);
    }

    let dark = 0;
    if (world.time >= 18.5) dark = Math.min(0.55, (world.time - 18.5) * 0.14);
    else if (world.time < 6) dark = 0.5;
    if (dark > 0.02) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = 'rgba(18,26,58,' + dark + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  /* ============ HUD ============ */
  const eBarImg = document.getElementById('eBar');
  const hBarImg = document.getElementById('hBar');
  const moodImg = document.getElementById('icMood');
  function barName(pre, pct) {
    const i = Math.max(0, Math.min(6, Math.round(pct * 6)));
    return pre + (i < 10 ? '0' + i : String(i));
  }
  function moodIndex() {
    const s = world.stats;
    const n = s.planted + s.harvest + s.sold + s.fished + s.killed + s.chopped + s.cooked;
    if (n > 40) return 4; if (n > 16) return 3; if (n > 6) return 2; return 1;
  }
  function updateHud() {
    const seeds = Object.keys(world.bag).filter((k) => k.indexOf('seed_') === 0).reduce((a, k) => a + world.bag[k], 0);
    const bagN = Object.keys(world.bag).filter((k) => k.indexOf('seed_') !== 0).reduce((a, k) => a + world.bag[k], 0);
    const foods = Object.keys(world.foods).reduce((a, k) => a + world.foods[k], 0);
    document.getElementById('hLeft').textContent = '💰' + Math.round(world.coins) + ' 🌱' + seeds + ' 🧺' + bagN + ' 🍲' + foods;
    const h = Math.floor(world.time), m = Math.floor((world.time - h) * 60);
    document.getElementById('hRight').textContent =
      '第' + world.day + '天 ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') +
      (world.time >= 19 || world.time < 6 ? ' 🌙怪物出没' : ' ☀') +
      ' · ' + TOOLS[world.sel].name + (world.sel === 2 ? '(' + CROPS[CROP_KEYS[world.seedSel]].name + ')' : '');
    if (eBarImg) eBarImg.src = ic(barName('ui_greenbar_', world.energy / 100));
    if (hBarImg) hBarImg.src = ic(barName('ui_redbar_', world.hp / 100));
    if (moodImg) moodImg.src = ic('ui_happiness_0' + moodIndex());
    const tip = document.getElementById('tip');
    if (!tip) return;
    let t;
    if (world.stats.planted === 0) t = '①「锄头」开地 ②「种子」播种 ③「水壶」浇水';
    else if (world.stats.harvest === 0) t = '作物成熟后，选「篮子」对着它按「用」收';
    else if (world.stats.sold === 0) t = '走到木箱（路中间）旁，按「互动」卖货';
    else if (world.stats.cooked === 0) t = '点「背包」→ 食谱，用作物做菜补体力';
    else if (world.stats.fished === 0) t = '去池塘/海边，选「钓竿」→「用」抛竿';
    else t = '19:00 后怪物出没，选「短剑」→「用」反击';
    tip.textContent = t;
  }
  function syncBar() {
    barBtns.forEach((b, i) => b.classList.toggle('on', i === world.sel));
    updateHud();
  }

  /* ============ 主循环 ============ */
  let last = performance.now(), hudT = 0, saveT = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (loaded >= total) update(dt);
    render();
    hudT += dt; saveT += dt;
    if (hudT > 0.25) { hudT = 0; updateHud(); }
    if (saveT > 6) { saveT = 0; save(); }
    requestAnimationFrame(loop);
  }
  syncBar();
  updateHud();
  requestAnimationFrame(loop);
  setTimeout(() => toast('先锄地 → 播种 → 浇水；成熟后收，去木箱卖钱'), 500);
  window.__sunny = {
    world: world, save: save,
    reset: function () { localStorage.removeItem(SAVE_KEY); location.reload(); },
    action: action, interact: interact, fish: fish, swing: swing,
    build: build, sleep: sleep, sellAll: sellAll, openPanel: openPanel,
    tick: function (n) { for (let i = 0; i < (n || 1); i += 1) update(0.05); },
  };
})();
