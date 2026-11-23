import { FARM_ART_JS } from './farmArtKit';
import { FARM_ART2_JS } from './farmArtKit2';
import { DECOR_ITEMS, FARM_ANIMALS, FARM_CROPS, MARKET_GOODS, TV_CHANNELS } from './farmCatalog';
import { CROP_SPRITES } from './farmCropSprites';
import { FURNITURE_SPRITES } from './farmFurniture';
import { GOOD_SPRITES } from './farmGoodSprites';
import { FARM_ROOM_SHOP_JS } from './farmRoomShop';
import { SCENERY_SPRITES } from './farmScenery';
import { ANIMAL_SPRITES } from './farmSprites';
import { FARM_ENGINE1_JS } from './farmEngine1';
import { FARM_ENGINE2_JS } from './farmEngine2';
import { buildRuntimeShim } from './gameRuntime';
import type { GameSpec } from './types';

/**
 * 「我们的小窝」——双人联机农场 + 超市 + 小屋。
 *
 * 内容规模（全部数据驱动 + 程序化美术）：
 *  - 作物 28 种（Kenney Food Kit，一条一张图）
 *  - 动物 24 只（Kenney Cube Pets，一只一张图，可喂/撸/繁殖/买卖/当宠物）
 *  - 超市 63 件商品（Kenney Food Kit，一件一张图）
 *  - 小屋 63 件家具（Kenney Furniture Kit，一件一张图），可自由摆放
 *  - 小屋电视接公开 CCTV HLS 直播源，可全屏
 *
 * 联机：有宿主走 TwGame 通道，纯浏览器退回 MQTT retained。
 */
/**
 * @param role 当前账号在这个空间里的角色（'A' 创建者 / 'B' 另一方）。
 *   A 是世界的唯一写入者：B 的改动以"整包状态"发给 A，A 合并后再广播，
 *   这样两边不会互相覆盖（之前就是双方都在广播，谁最后发谁赢 → 钱数打架）。
 */
export function buildFarmHtml(role: 'A' | 'B' = 'A'): string {
  const shim = buildRuntimeShim();
  const data =
    'var CROPS=' + JSON.stringify(FARM_CROPS) + ';' +
    'var ANIMALS=' + JSON.stringify(FARM_ANIMALS) + ';' +
    'var GOODS=' + JSON.stringify(MARKET_GOODS) + ';' +
    'var DECOR=' + JSON.stringify(DECOR_ITEMS) + ';' +
    'var CHANNELS=' + JSON.stringify(TV_CHANNELS) + ';' +
    'var ANIMAL_SPRITES=' + JSON.stringify(ANIMAL_SPRITES) + ';' +
    'var FURNITURE_SPRITES=' + JSON.stringify(FURNITURE_SPRITES) + ';' +
    'var CROP_SPRITES=' + JSON.stringify(CROP_SPRITES) + ';' +
    'var GOOD_SPRITES=' + JSON.stringify(GOOD_SPRITES) + ';' +
    'var SCENERY_SPRITES=' + JSON.stringify(SCENERY_SPRITES) + ';' +
    'var MYROLE=' + JSON.stringify(role === 'B' ? 'B' : 'A') + ';';
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#8fd0f0;touch-action:none;
font-family:-apple-system,"PingFang SC",system-ui,sans-serif;-webkit-user-select:none}canvas{display:block}
#go{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
background:radial-gradient(circle at 50% 38%,#cdeeff,#5fb4e0);color:#17384a;z-index:9;font-size:13px;text-align:center;padding:0 24px}
#go b{font-size:23px}#go span{opacity:.78;font-size:12.5px;line-height:1.7}</style></head>
<body>
<script>${shim}</script>
<div id="go"><b>🌾 我们的小窝</b>
<span>轻触开始（会播放音乐）</span>
<span>种地 · 养动物 · 逛超市 · 布置小屋 · 一起看电视</span>
<span>${FARM_CROPS.length} 种作物 · ${FARM_ANIMALS.length} 种动物 · ${MARKET_GOODS.length} 件商品 · ${DECOR_ITEMS.length} 件家具</span></div>
<canvas id="c"></canvas>
<script>
${data}
${FARM_ART_JS}
${FARM_ART2_JS}
${FARM_ENGINE1_JS}
${FARM_ENGINE2_JS}
${FARM_ROOM_SHOP_JS}
</script></body></html>`;
}

export const FARM_GAME: GameSpec = {
  id: 'sample-farm',
  title: '我们的小窝（双人·农场+超市+小屋）',
  code: '',
  players: 2,
  createdBy: 'A',
  createdAt: 0,
  builtin: 'farm',
};
