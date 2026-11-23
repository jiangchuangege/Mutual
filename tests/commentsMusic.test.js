/* eslint-disable */
/** 评论区隔离 + 本地音乐标签识别 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');
const { commentsOf, commentKeyOf, commentCount } = require('../dist-core/comments.js');
const { parseId3, metaFromFilename, mergeMeta, base64ToBytes } = require('../dist-core/musicMeta.js');

function boundHub() {
  const clock = { t: Date.UTC(2026, 10, 8, 10, 0, 0) };
  const hub = new Hub({ now: () => clock.t, latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  return { hub, clock };
}

test('评论按对象隔离：两部片的评论互不串', () => {
  const { hub } = boundHub();
  hub.addComment('A', 'movie', 'vod-1', '这部好看');
  hub.addComment('B', 'movie', 'vod-1', '我也觉得');
  hub.addComment('A', 'movie', 'vod-2', '这部一般');

  const one = hub.listComments('movie', 'vod-1');
  const two = hub.listComments('movie', 'vod-2');
  assert.equal(one.length, 2);
  assert.equal(two.length, 1);
  assert.equal(two[0].text, '这部一般');
  assert.ok(!one.some((c) => c.text === '这部一般'));
});

test('影视评论和点滴评论也不串（同一个 id 也不行）', () => {
  const { hub } = boundHub();
  hub.addComment('A', 'movie', 'x1', '给影视写的');
  hub.addComment('B', 'moment', 'x1', '给点滴写的');
  assert.deepEqual(
    hub.listComments('movie', 'x1').map((c) => c.text),
    ['给影视写的'],
  );
  assert.deepEqual(
    hub.listComments('moment', 'x1').map((c) => c.text),
    ['给点滴写的'],
  );
});

test('评论能删，但只能删自己写的；空评论不收', () => {
  const { hub } = boundHub();
  const mine = hub.addComment('A', 'movie', 'vod-9', '我说一句');
  assert.equal(mine.ok, true);
  const other = hub.listComments('movie', 'vod-9')[0];
  assert.equal(hub.removeComment('B', 'movie', 'vod-9', other.id).ok, false, '不能删别人的');
  assert.equal(hub.removeComment('A', 'movie', 'vod-9', other.id).ok, true);
  assert.equal(hub.listComments('movie', 'vod-9').length, 0);
  assert.equal(hub.addComment('A', 'movie', 'vod-9', '   ').ok, false, '空评论要拒');
});

test('老存档没有 comments 字段也能读（不丢数据、不崩）', () => {
  const { hub } = boundHub();
  hub.addTodo('A', { title: '别丢', assignee: 'either', dueDate: null });
  const raw = hub.serialize();
  delete raw.comments;
  const fresh = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  fresh.hydrate(raw);
  assert.deepEqual(fresh.snapshot('A').comments, {});
  assert.equal(fresh.snapshot('A').todos.some((t) => t.title === '别丢'), true);
});

test('commentsOf 只按 key 取，脏数据被挡掉', () => {
  const map = {
    [commentKeyOf('movie', 'v1')]: [
      { id: 'a', byRole: 'A', text: '好的', at: 2 },
      { id: 'b', byRole: 'B', text: '   ', at: 3 },
      null,
    ],
  };
  assert.equal(commentsOf(map, 'movie', 'v1').length, 1);
  assert.equal(commentsOf(map, 'movie', 'v2').length, 0);
  assert.equal(commentsOf(null, 'movie', 'v1').length, 0);
  assert.equal(commentCount(map, 'movie', 'v1'), 1);
});

// ---- 本地音乐：ID3 标签 ----
function id3v23(title, artist, encoding = 3) {
  const textFrame = (id, text) => {
    const body =
      encoding === 3
        ? Buffer.concat([Buffer.from([3]), Buffer.from(text, 'utf8')])
        : Buffer.concat([Buffer.from([1]), Buffer.from('\ufeff' + text, 'utf16le')]);
    const head = Buffer.alloc(10);
    head.write(id, 0, 'ascii');
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const frames = Buffer.concat([textFrame('TIT2', title), textFrame('TPE1', artist)]);
  const head = Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.from([3, 0, 0]), Buffer.alloc(4)]);
  // 同步安全整数：帧大小字段本身在 header 里，这里 body 总长按 7 位编码
  const size = frames.length;
  head[6] = (size >> 21) & 0x7f;
  head[7] = (size >> 14) & 0x7f;
  head[8] = (size >> 7) & 0x7f;
  head[9] = size & 0x7f;
  return Buffer.concat([head, frames]);
}

test('ID3v2.3 能读出歌名和歌手（UTF-8）', () => {
  const meta = parseId3(id3v23('晴天', '周杰伦', 3));
  assert.equal(meta.title, '晴天');
  assert.equal(meta.artist, '周杰伦');
});

test('ID3v2.3 能读出歌名和歌手（UTF-16 带 BOM）', () => {
  const meta = parseId3(id3v23('小情歌', '苏打绿', 1));
  assert.equal(meta.title, '小情歌');
  assert.equal(meta.artist, '苏打绿');
});

test('没有 ID3 标签时按文件名猜，标签优先', () => {
  assert.deepEqual(metaFromFilename('周杰伦 - 晴天.mp3'), { title: '晴天', artist: '周杰伦', album: null });
  assert.deepEqual(metaFromFilename('晴天.mp3'), { title: '晴天', artist: null, album: null });
  assert.deepEqual(parseId3(Buffer.from('not an mp3 at all', 'ascii')), {
    title: null,
    artist: null,
    album: null,
  });
  const merged = mergeMeta({ title: '标签歌名', artist: null, album: null }, metaFromFilename('A - B.mp3'));
  assert.equal(merged.title, '标签歌名');
  assert.equal(merged.artist, 'A');
});

test('base64 解码可用于读标签（RN 侧传 base64 过来）', () => {
  const bytes = Buffer.from('ID3', 'ascii');
  assert.deepEqual(Array.from(base64ToBytes(bytes.toString('base64'))), [0x49, 0x44, 0x33]);
});
