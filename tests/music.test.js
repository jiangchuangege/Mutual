/* eslint-disable */
/**
 * 一起听：同步音乐的信令、队列与索引逻辑。
 * 重点验证：URL 校验、seq 单调、末位操作者（防自己的回声）、循环/随机、播完切歌。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hub } = require('../dist-core/hub.js');

const T0 = Date.UTC(2026, 2, 20, 10, 0, 0);

function makeHub() {
  const clock = { t: T0 };
  const hub = new Hub({ now: () => clock.t, latencyMs: 120, scale: 1, clockSkew: { A: 0, B: 700 } });
  const inv = hub.createInvite('A');
  hub.joinWithCode('B', inv.value.code);
  return { hub, clock };
}

const MP3 = 'https://cdn.example.com/song.mp3';
const M4A = 'https://cdn.example.com/song.m4a?token=1';

test('一起听：只接受音频直链（mp3/m4a/aac/wav/ogg/flac）', () => {
  const { hub } = makeHub();
  assert.equal(hub.addMusicTrack('A', { title: '歌一', artist: 'x', url: MP3 }).ok, true);
  assert.equal(hub.addMusicTrack('B', { title: '歌二', artist: 'y', url: M4A }).ok, true);
  const bad = [
    'https://cdn.example.com/page.html',
    'https://cdn.example.com/song.m3u8',
    'ftp://cdn.example.com/song.mp3',
    'not-a-url.mp3',
    'https://cdn.example.com/video.mp4',
  ];
  for (const url of bad) {
    const r = hub.addMusicTrack('A', { title: 'x', artist: '', url });
    assert.equal(r.ok, false, url);
  }
  assert.equal(hub.snapshot('A').music.queue.length, 2);
});

test('一起听：歌名必填；未绑定不能加', () => {
  const { hub } = makeHub();
  assert.equal(hub.addMusicTrack('A', { title: '  ', artist: '', url: MP3 }).ok, false);
  const clock = { t: T0 };
  const solo = new Hub({ now: () => clock.t, latencyMs: 120, scale: 1, clockSkew: { A: 0, B: 700 } });
  assert.equal(solo.addMusicTrack('A', { title: 'x', artist: '', url: MP3 }).ok, false);
});

test('一起听：play/pause/seek 都会推进 seq 并记录操作者', () => {
  const { hub, clock } = makeHub();
  hub.addMusicTrack('A', { title: '歌一', artist: '', url: MP3 });
  const seq0 = hub.snapshot('A').music.seq;

  clock.t += 1000;
  hub.musicAction('A', 'play');
  // snapshot 返回的是活引用，这里只取标量做比较，避免别名干扰
  const seq1 = hub.snapshot('B').music.seq;
  assert.equal(hub.snapshot('B').music.action, 'play');
  assert.equal(hub.snapshot('B').music.updatedBy, 'A');
  assert.ok(seq1 > seq0, `play 应推进 seq：${seq0} -> ${seq1}`);

  clock.t += 1000;
  hub.musicAction('B', 'seek', { positionSec: 42.5 });
  const seq2 = hub.snapshot('A').music.seq;
  assert.equal(hub.snapshot('A').music.positionSec, 42.5);
  assert.equal(hub.snapshot('A').music.updatedBy, 'B');
  assert.ok(seq2 > seq1, `seek 应推进 seq：${seq1} -> ${seq2}`);

  clock.t += 1000;
  hub.musicAction('A', 'pause', { positionSec: 43 });
  assert.equal(hub.snapshot('A').music.action, 'pause');
  assert.equal(hub.snapshot('A').music.positionSec, 43);
});

test('一起听：切歌重置进度并自动播放；越界索引被夹紧', () => {
  const { hub } = makeHub();
  hub.addMusicTrack('A', { title: '歌一', artist: '', url: MP3 });
  hub.addMusicTrack('B', { title: '歌二', artist: '', url: M4A });
  hub.musicAction('A', 'seek', { positionSec: 30 });
  hub.musicAction('A', 'change_track', { index: 1 });
  const m = hub.snapshot('A').music;
  assert.equal(m.index, 1);
  assert.equal(m.positionSec, 0);
  assert.equal(m.action, 'play');

  hub.musicAction('A', 'change_track', { index: 99 });
  assert.equal(hub.snapshot('A').music.index, 1, '越界夹到最后一首');
  hub.musicAction('A', 'change_track', { index: -5 });
  assert.equal(hub.snapshot('A').music.index, 0, '负数夹到第一首');
});

test('一起听：空队列时信令被拒', () => {
  const { hub } = makeHub();
  assert.equal(hub.musicAction('A', 'play').ok, false);
});

test('一起听：tick 在播放时推进进度，暂停时不推进', () => {
  const { hub, clock } = makeHub();
  hub.addMusicTrack('A', { title: '歌一', artist: '', url: MP3 });
  hub.musicAction('A', 'play');
  clock.t += 5000;
  hub.tick();
  const playing = hub.snapshot('A').music.positionSec;
  assert.ok(playing >= 4 && playing <= 6, `播放 5 秒后进度应约 5，实际 ${playing}`);

  hub.musicAction('A', 'pause');
  const before = hub.snapshot('A').music.positionSec;
  clock.t += 5000;
  hub.tick();
  assert.equal(hub.snapshot('A').music.positionSec, before, '暂停后不推进');
});

test('一起听：循环与随机开关', () => {
  const { hub } = makeHub();
  for (let i = 0; i < 3; i += 1) {
    hub.addMusicTrack('A', { title: `歌${i}`, artist: '', url: MP3 });
  }
  hub.musicAction('A', 'setting', { loop: true, shuffle: false });
  assert.equal(hub.snapshot('A').music.loop, true);
  // 不循环：最后一首的下一首还是最后一首
  hub.musicAction('A', 'setting', { loop: false });
  assert.equal(hub.nextMusicIndex(2, 1), 2);
  // 循环：最后一首的下一首回到 0
  hub.musicAction('A', 'setting', { loop: true });
  assert.equal(hub.nextMusicIndex(2, 1), 0);
  // 上一首在 0 时循环到末尾
  assert.equal(hub.nextMusicIndex(0, -1), 2);
});

test('一起听：随机模式不会原地打转', () => {
  const { hub } = makeHub();
  for (let i = 0; i < 5; i += 1) {
    hub.addMusicTrack('A', { title: `歌${i}`, artist: '', url: MP3 });
  }
  hub.musicAction('A', 'setting', { shuffle: true });
  for (let i = 0; i < 20; i += 1) {
    const next = hub.nextMusicIndex(2, 1);
    assert.notEqual(next, 2);
    assert.ok(next >= 0 && next < 5);
  }
});

test('一起听：删除当前歌时索引被夹紧', () => {
  const { hub } = makeHub();
  hub.addMusicTrack('A', { title: '歌一', artist: '', url: MP3 });
  hub.addMusicTrack('B', { title: '歌二', artist: '', url: M4A });
  hub.musicAction('A', 'change_track', { index: 1 });
  const queue = hub.snapshot('A').music.queue;
  hub.removeMusicTrack('A', queue[1].id);
  const m = hub.snapshot('A').music;
  assert.equal(m.queue.length, 1);
  assert.equal(m.index, 0);
});

test('一起听：双方看到同一份队列与状态', () => {
  const { hub, clock } = makeHub();
  hub.addMusicTrack('B', { title: '共享的歌', artist: 'Z', url: MP3 });
  clock.t += 1000;
  hub.musicAction('B', 'play');
  const a = hub.snapshot('A').music;
  const b = hub.snapshot('B').music;
  assert.equal(a.queue.length, b.queue.length);
  assert.equal(a.action, b.action);
  assert.equal(a.updatedBy, b.updatedBy);
  assert.equal(a.seq, b.seq);
});

test('一起听：解绑删除会清空队列', () => {
  const { hub } = makeHub();
  hub.addMusicTrack('A', { title: '歌', artist: '', url: MP3 });
  hub.requestUnbind('A', 'delete');
  hub.fastForwardCooling();
  hub.confirmUnbind('A');
  hub.confirmUnbind('B');
  assert.equal(hub.snapshot('A').music.queue.length, 0);
});
