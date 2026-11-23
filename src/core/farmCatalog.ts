import { CROP_DEFS, GOOD_DEFS } from './farmArtData';
import { FURNITURE_META } from './farmFurniture';

/**
 * 农场内容目录：作物 / 动物 / 超市商品 / 装饰。
 *
 * 原则：**每一条都有自己的美术**，不共用、不靠换色凑数。
 *  - 作物 28 种：来自 Kenney《Food Kit》的 28 张不同渲染图
 *  - 动物 24 种：来自 Kenney《Cube Pets》的 24 只不同宠物
 *  - 商品 63 件：来自 Kenney《Food Kit》的 63 张不同渲染图
 *  - 家具 63 件：来自 Kenney《Furniture Kit》的 63 张不同家具渲染图
 */

export interface CropDef {
  n: string;
  /** 精灵 key */
  s: string;
  seed: number;
  sell: number;
  g: number;
}

export const FARM_CROPS: CropDef[] = CROP_DEFS.map((d) => ({ n: d.n, s: d.s, seed: d.seed, sell: d.sell, g: d.g }));

export type AnimalKind =
  | 'chick' | 'cow' | 'pig' | 'hog' | 'bunny' | 'cat' | 'dog' | 'fox' | 'deer' | 'polar'
  | 'koala' | 'panda' | 'lion' | 'tiger' | 'monkey' | 'elephant' | 'giraffe' | 'penguin'
  | 'parrot' | 'fish' | 'crab' | 'beaver' | 'bee' | 'caterpillar';

export interface AnimalDef {
  n: string;
  k: AnimalKind;
  cost: number;
  sell: number;
  out?: string;
  outVal?: number;
  every?: number;
}

/** 24 只宠物，一只一图 */
const ANIMAL_SPECIES: { k: AnimalKind; n: string; base: number; out?: string; every?: number }[] = [
  { k: 'chick', n: '小鸡', base: 60, out: '鸡蛋', every: 20 },
  { k: 'cow', n: '奶牛', base: 280, out: '牛奶', every: 34 },
  { k: 'pig', n: '小猪', base: 180, out: '松露', every: 38 },
  { k: 'hog', n: '大猪', base: 240, out: '火腿', every: 42 },
  { k: 'bunny', n: '兔子', base: 90, out: '兔毛', every: 22 },
  { k: 'bee', n: '小蜜蜂', base: 120, out: '蜂蜜', every: 26 },
  { k: 'cat', n: '猫咪', base: 260 },
  { k: 'dog', n: '狗狗', base: 260 },
  { k: 'fox', n: '小狐狸', base: 320 },
  { k: 'deer', n: '小鹿', base: 360 },
  { k: 'polar', n: '白熊', base: 420 },
  { k: 'koala', n: '考拉', base: 380 },
  { k: 'panda', n: '熊猫', base: 520 },
  { k: 'lion', n: '狮子', base: 480 },
  { k: 'tiger', n: '老虎', base: 500 },
  { k: 'monkey', n: '猴子', base: 300 },
  { k: 'elephant', n: '大象', base: 560 },
  { k: 'giraffe', n: '长颈鹿', base: 580 },
  { k: 'penguin', n: '企鹅', base: 340 },
  { k: 'parrot', n: '鹦鹉', base: 300 },
  { k: 'crab', n: '螃蟹', base: 140, out: '蟹肉', every: 30 },
  { k: 'beaver', n: '河狸', base: 220 },
  { k: 'caterpillar', n: '毛毛虫', base: 70 },
  { k: 'fish', n: '小鱼', base: 80, out: '小鱼干', every: 24 },
];

export const FARM_ANIMALS: AnimalDef[] = ANIMAL_SPECIES.map((s) => ({
  n: s.n,
  k: s.k,
  cost: s.base,
  sell: Math.round(s.base * 0.6),
  ...(s.out ? { out: s.out, outVal: Math.round(12 + s.base * 0.08), every: s.every } : {}),
}));

export type GoodCat = string;

export interface GoodDef {
  n: string;
  /** 精灵 key */
  s: string;
  c: GoodCat;
  price: number;
  /** 效果：heart=加心动 aff=宠物好感 treat=口粮 */
  e: 'heart' | 'aff' | 'treat' | 'none';
}

export const MARKET_GOODS: GoodDef[] = GOOD_DEFS.map((d) => ({
  n: d.n,
  s: d.s,
  c: d.c,
  price: d.price,
  e: d.c === '礼物' ? 'heart' : d.c === '宠物' ? 'aff' : d.c === '零食' ? 'treat' : 'none',
}));

export interface DecorDef {
  n: string;
  /** 家具精灵 key */
  f: string;
  big: boolean;
  price: number;
}

/** 63 件家具，一件一图 */
export const DECOR_ITEMS: DecorDef[] = FURNITURE_META.map((m, i) => ({
  n: m.n,
  f: m.k,
  big: m.big,
  price: 120 + i * 40,
}));

/**
 * 电视频道。u 是主源，alt 是备用源（主源挂了自动往下试）。
 * 另外运行时还会去公开的 IPTV 播放列表里按名字找 CCTV 源（见 farmEngine2 的 loadChannelList），
 * 也可以在小屋里用"换源"手填一个 m3u8。
 */
export interface TvChannel { n: string; key: string; u: string; alt: string[] }

const CCTV_ALT: Record<string, string[]> = {
  'cctv1': [
    'https://ivi.bupt.edu.cn/hls/cctv1hd.m3u8',
    'https://live.stars2046.com/live/cctv1.m3u8',
    'https://cdn.163189.xyz/cctv1.m3u8',
    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  ],
  'cctv2': [
    'https://ivi.bupt.edu.cn/hls/cctv2hd.m3u8',
    'https://live.stars2046.com/live/cctv2.m3u8',
    'https://cdn.163189.xyz/cctv2.m3u8',
  ],
  'cctv3': [
    'https://ivi.bupt.edu.cn/hls/cctv3hd.m3u8',
    'https://live.stars2046.com/live/cctv3.m3u8',
    'https://cdn.163189.xyz/cctv3.m3u8',
  ],
  'cctv5': [
    'https://ivi.bupt.edu.cn/hls/cctv5hd.m3u8',
    'https://live.stars2046.com/live/cctv5.m3u8',
    'https://cdn.163189.xyz/cctv5.m3u8',
  ],
  'cctv6': [
    'https://ivi.bupt.edu.cn/hls/cctv6hd.m3u8',
    'https://live.stars2046.com/live/cctv6.m3u8',
    'https://cdn.163189.xyz/cctv6.m3u8',
  ],
  'cctv13': [
    'https://ivi.bupt.edu.cn/hls/cctv13hd.m3u8',
    'https://live.stars2046.com/live/cctv13.m3u8',
    'https://cdn.163189.xyz/cctv13.m3u8',
  ],
  'cctv14': [
    'https://ivi.bupt.edu.cn/hls/cctv14hd.m3u8',
    'https://live.stars2046.com/live/cctv14.m3u8',
    'https://cdn.163189.xyz/cctv14.m3u8',
  ],
};

const CH_LIST: { n: string; key: string }[] = [
  { n: 'CCTV-1 综合', key: 'cctv1' },
  { n: 'CCTV-2 财经', key: 'cctv2' },
  { n: 'CCTV-3 综艺', key: 'cctv3' },
  { n: 'CCTV-5 体育', key: 'cctv5' },
  { n: 'CCTV-6 电影', key: 'cctv6' },
  { n: 'CCTV-13 新闻', key: 'cctv13' },
  { n: 'CCTV-14 少儿', key: 'cctv14' },
];

export const TV_CHANNELS: TvChannel[] = CH_LIST.map((ch) => ({
  n: ch.n,
  key: ch.key,
  u: CCTV_ALT[ch.key][0],
  alt: CCTV_ALT[ch.key].slice(1),
}));

export const CROP_COUNT = FARM_CROPS.length;
export const ANIMAL_COUNT = FARM_ANIMALS.length;
export const GOOD_COUNT = MARKET_GOODS.length;
export const DECOR_COUNT = DECOR_ITEMS.length;
