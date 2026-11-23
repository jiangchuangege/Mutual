const fs = require('node:fs');

/* ---------- 1) 频道表：每个台给多个候选源 ---------- */
const cp = 'C:/ts/src/core/farmCatalog.ts';
let c = fs.readFileSync(cp, 'utf8');
const s = c.indexOf('/** 电视频道');
const e = c.indexOf('export const CROP_COUNT = 28;');
const endIdx = e > 0 ? e : c.indexOf('export const CROP_COUNT = FARM_CROPS.length;');
const tvBlock = `/**
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

`;
c = c.slice(0, s) + tvBlock + c.slice(e > 0 ? e : endIdx);
fs.writeFileSync(cp, c, 'utf8');
console.log('频道表已加备用源');
