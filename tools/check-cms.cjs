const m = require('../dist-core/cmsServer.js');

console.log('shortKey 稳定性:', m.shortKey('流浪地球', '2019'), m.shortKey(' 流浪地球 ', '2019'));
console.log('appendQuery:', m.appendQuery('https://a/api.php/provide/vod', { ac: 'detail', pg: 2 }));

const lines = m.parsePlayUrls(
  '线路1$$$线路2',
  '第1集$https://a/1.m3u8#第2集$https://a/2.m3u8$$$第1集$https://b/1.mp4#第2集$https://b/2.mp4',
);
console.log('线路数:', lines.length, '线路1集数:', lines[0].episodes.length, '首集:', lines[0].episodes[0]);

const weird = m.parsePlayUrls('', 'https://a/x.mp4#第2集$#第3集$ftp://no.mp4');
console.log('脏数据解析:', JSON.stringify(weird));

const items = m.normalizeList(
  [
    { vod_id: 1, vod_name: '流浪地球', vod_year: '2019', vod_pic: 'p.jpg' },
    { vod_id: 2, vod_name: '流浪地球', vod_year: '2019', vod_remarks: 'HD' },
    { vod_id: 3, vod_name: '无年份片' },
    { vod_id: 4 },
  ],
  'https://a/api.php/provide/vod',
);
console.log('归一化条数:', items.length, '合并后备注:', items[0].remarks);
