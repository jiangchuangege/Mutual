// 把 Sunnyside 全量素材打包成单文件游戏
const fs = require('node:fs');
const path = require('node:path');

const ROOT = 'C:/Users/Jiao/Downloads/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets';
const OUT_DIR = 'C:/Users/Jiao/Documents/sunnyside';
const GAME_JS = 'C:/ts/tools/sunnyside-game.js';
const uri = (p) => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, p)).toString('base64');

const CROPS = ['carrot', 'radish', 'beetroot', 'potato', 'cabbage', 'kale', 'cauliflower', 'parsnip', 'pumpkin', 'sunflower', 'wheat'];
const ITEMS = ['egg', 'fish', 'milk', 'rock', 'wood', 'crate_base', 'crate_top', 'seeds_generic'];
const ANIMALS = ['chicken_01', 'duck_01', 'cow', 'sheep_01', 'pig_01', 'bird_01'];
const PLANTS = ['tree_01', 'tree_02', 'mushroom_red_01', 'mushroom_blue_01', 'mushroom_blue_02', 'mushroom_blue_03'];
const HUMAN = [
  ['walk', 'WALKING/base_walk_strip8.png'],
  ['idle', 'IDLE/base_idle_strip9.png'],
  ['dig', 'DIG/base_dig_strip13.png'],
  ['water', 'WATERING/base_watering_strip5.png'],
  ['axe', 'AXE/base_axe_strip10.png'],
  ['mine', 'MINING/base_mining_strip10.png'],
  ['cast', 'CASTING/base_casting_strip15.png'],
  ['reel', 'REELING/base_reeling_strip13.png'],
  ['attack', 'ATTACK/base_attack_strip10.png'],
  ['hurt', 'HURT/base_hurt_strip8.png'],
  ['death', 'DEATH/base_death_strip13.png'],
  ['hammer', 'HAMMERING/base_hamering_strip23.png'],
  ['carry', 'CARRY/base_carry_strip8.png'],
  ['wait', 'WAITING/base_waiting_strip9.png'],
];
const UIA = [
  'axe', 'pickaxe', 'shovel', 'water', 'rod', 'sword', 'hammer', 'basket', 'plant',
  'confirm', 'cancel', 'search', 'sandtimer', 'indicator', 'itemdisc_01', 'itemdisc_02',
  'label_left', 'label_middle', 'label_right', 'happiness_01', 'happiness_02', 'happiness_03', 'happiness_04',
  'expression_love', 'expression_stress', 'expression_alerted', 'expression_working', 'expression_attack',
  'greenbar_00', 'greenbar_01', 'greenbar_02', 'greenbar_03', 'greenbar_04', 'greenbar_05', 'greenbar_06',
  'redbar_00', 'redbar_01', 'redbar_02', 'redbar_03', 'redbar_04', 'redbar_05', 'redbar_06',
];

const assets = {};
assets.tiles = uri('Tileset/spr_tileset_sunnysideworld_16px.png');
for (const [k, f] of HUMAN) assets['h_' + k] = uri('Characters/Human/' + f);
const GOB = { walk: 'spr_walk_strip8', idle: 'spr_idle_strip9', attack: 'spr_attack_strip10', death: 'spr_death_strip13', hurt: 'spr_hurt_strip8' };
for (const [k, f] of Object.entries(GOB)) assets['gob_' + k] = uri('Characters/Goblin/PNG/' + f + '.png');
const SKEL = { walk: 'skeleton_walk_strip8', idle: 'skeleton_idle_strip6', attack: 'skeleton_attack_strip7', death: 'skeleton_death_strip10', hurt: 'skeleton_hurt_strip7' };
for (const [k, f] of Object.entries(SKEL)) assets['skel_' + k] = uri('Characters/Skeleton/PNG/' + f + '.png');
for (const c of CROPS) for (let i = 0; i < 6; i += 1) assets[`crop_${c}_${i}`] = uri(`Elements/Crops/${c}_0${i}.png`);
for (const it of ITEMS) assets['item_' + it] = uri(`Elements/Crops/${it}.png`);
for (const s of ['00', '01', '03', '04']) assets['soil_' + s] = uri(`Elements/Crops/soil_${s}.png`);
assets.boat = uri('Elements/Other/spr_deco_coracle_land.png');
assets.animal_blinking = uri('Elements/Animals/spr_deco_blinking_strip12.png');
for (const a of ANIMALS) assets['animal_' + a] = uri(`Elements/Animals/spr_deco_${a}_strip4.png`);
for (const p of PLANTS) assets['plant_' + p] = uri(`Elements/Plants/spr_deco_${p}_strip4.png`);
assets.other_windmill = uri('Elements/Other/spr_deco_windmill_withshadow_strip9.png');
assets.vfx_fire1 = uri('Elements/VFX/Fire/spr_deco_fire_01_strip4.png');
assets.vfx_fire2 = uri('Elements/VFX/Fire/spr_deco_fire_02_strip4.png');
assets.vfx_glint1 = uri('Elements/VFX/Glint/spr_deco_glint_01_strip6.png');
assets.vfx_smoke = uri('Elements/VFX/Chimney Smoke/chimneysmoke_01_strip30.png');
for (const u of UIA) assets['ui_' + u] = uri(`UI/${u}.png`);

const gameJs = fs.readFileSync(GAME_JS, 'utf8');
const sizeKb = (Object.values(assets).reduce((a, v) => a + v.length, 0) / 1024).toFixed(0);

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Sunnyside 小农场</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#20301f;touch-action:none;
    font-family:-apple-system,"PingFang SC",system-ui,sans-serif;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
  canvas{display:block;image-rendering:pixelated}
  #hud{position:fixed;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;
    padding:8px 10px;pointer-events:none;font-size:13px;color:#fff;text-shadow:0 1px 2px #000a}
  #hud .pill{background:#1d2a20d0;border:2px solid #0d1710;border-radius:10px;padding:4px 9px;font-weight:700}
  #bar{position:fixed;left:50%;transform:translateX(-50%);bottom:8px;display:flex;gap:3px;padding:4px;
    background:#1d2a20e6;border:2px solid #0d1710;border-radius:12px;max-width:calc(100vw - 12px);overflow-x:auto}
  #bar button{width:37px;height:46px;border-radius:8px;border:2px solid #2c3d2f;background:#243326;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0;overflow:hidden;flex:0 0 auto}
  #bar button img{width:21px;height:21px;image-rendering:pixelated}
  #bar button b{font-size:8px;color:#d8ead0;font-weight:700;line-height:1}
  #bar button.on{background:#3c5a3f;border-color:#9fd98a;box-shadow:0 0 0 2px #9fd98a55}
  #bars{position:fixed;left:10px;top:44px;display:flex;flex-direction:column;gap:4px;pointer-events:none}
  #bars img{height:11px;image-rendering:pixelated;filter:drop-shadow(0 1px 1px #0009)}
  #hud .pill img{height:14px;vertical-align:-2px;image-rendering:pixelated}
  #joy{position:fixed;left:14px;bottom:76px;width:104px;height:104px;border-radius:50%;
    background:#1d2a2099;border:2px solid #0d171055}
  #joy i{position:absolute;left:33px;top:33px;width:38px;height:38px;border-radius:50%;background:#cfe6c7cc}
  #act{position:fixed;right:12px;bottom:76px;display:flex;flex-direction:column;gap:8px}
  #act button{width:60px;height:60px;border-radius:50%;border:3px solid #0d1710;background:#7bb96b;
    color:#10230f;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0}
  #act button img{width:30px;height:30px;image-rendering:pixelated}
  #act button.alt{background:#e0c76a}
  #act button.mini{width:48px;height:48px;background:#9fd0e8;font-size:13px}
  #panel{position:fixed;inset:0;background:#0b1410e0;display:none;align-items:center;justify-content:center;padding:12px;z-index:20}
  #panel.on{display:flex}
  #panel .card{background:#20301f;border:3px solid #0d1710;border-radius:14px;padding:12px;width:100%;max-width:380px;
    color:#e6f2df;max-height:84vh;overflow:auto}
  #panel h3{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between;align-items:center}
  #pTabs{display:flex;gap:6px;margin-bottom:8px}
  #pTabs button{flex:1;border-radius:8px;border:2px solid #2c3d2f;background:#243326;color:#cfe0c6;font-size:12px;font-weight:700;padding:6px 0}
  #pTabs button.on{background:#8fce78;border-color:#5c8f4c;color:#12220f}
  #panel .row{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:7px 0;border-top:1px solid #2c3d2f;font-size:12.5px}
  #panel .row .grow{display:flex;align-items:center;gap:7px;flex:1;min-width:0}
  #panel .row img{width:24px;height:24px;image-rendering:pixelated;flex:0 0 auto}
  #panel .row img.mini{width:13px;height:13px}
  #panel .dim{opacity:.72;font-size:11px;white-space:nowrap}
  #panel button{border-radius:8px;border:2px solid #2c3d2f;background:#2f4a33;color:#fff;font-size:12px;font-weight:700;padding:6px 9px;display:flex;align-items:center;gap:4px}
  #panel button.ok{background:#5b8f4c;border-color:#3d6a30}
  #panel button.close{width:100%;margin-top:10px;background:#5a3a3a;border-color:#3a2222}
  #toast{position:fixed;left:50%;top:60px;transform:translateX(-50%);background:#14201599;border-radius:10px;
    padding:6px 12px;color:#eaf6e4;font-size:13px;opacity:0;transition:opacity .22s;pointer-events:none;z-index:30;max-width:80vw;text-align:center}
  #toast.on{opacity:1}
  #tip{position:fixed;right:10px;top:44px;max-width:190px;text-align:right;color:#eaf6e4;font-size:11.5px;
    line-height:1.5;text-shadow:0 1px 2px #000a;pointer-events:none;opacity:.92}
</style></head><body>
<canvas id="c"></canvas>
<div id="hud"><div class="pill"><img id="icMood" alt=""><span id="hLeft">💰 0</span></div><div class="pill" id="hRight">第 1 天 06:00</div></div>
<div id="bars"><img id="eBar" alt=""><img id="hBar" alt=""></div>
<div id="tip"></div>
<div id="toast"></div>
<div id="bar"></div>
<div id="joy"><i></i></div>
<div id="act">
  <button id="btnBag" class="mini">背包</button>
  <button id="btnInter" class="alt">互动</button>
  <button id="btnSwitch" class="alt">换</button>
  <button id="btnUse">用</button>
</div>
<div id="panel"><div class="card"><h3><span id="pTitle">背包</span><button id="pClose">✕</button></h3><div id="pTabs"></div><div id="pBody"></div></div></div>
<script>
const A = ${JSON.stringify(assets)};
${gameJs}
</script></body></html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'SunnysideFarm.html'), html, 'utf8');
console.log('生成', path.join(OUT_DIR, 'SunnysideFarm.html'), '素材', Object.keys(assets).length, '张 · base64', sizeKb + 'KB · HTML', (html.length / 1024).toFixed(0) + 'KB');
