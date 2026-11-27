/* eslint-disable */
/**
 * 一起看（房间）跟随端的进度校准。
 *
 * 复现用户实测现象：「我女朋友加入我房间后，她那边一会儿跟我进度一样、
 * 一会儿又往回缩」。这里把两端用纯数学各跑一遍：
 *  - 主控：播放器按墙钟准点走，每 2 秒心跳一次（hub.heartbeat 的真实算法：
 *    服务端位置按服务器时钟自增，updatedAtServerMs 记成"此刻"）；
 *  - 跟随端：每 2 秒收到一次快照，每 700ms 校准一次；
 *  - 旧实现用「快照那一刻的 serverNow」算目标位置 → 两次心跳之间目标被冻住，
 *    跟随端却在往前走，漂移一路涨到 2 秒，越过对称的 1.5 秒阈值就被往回拖；
 *  - 新实现把 serverNow 按本地流逝时间外推，再用 decideRoomSync 的非对称阈值判定。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTargetPosition, decideRoomSync, ROOM_SYNC_GATE } = require('../dist-core/drift.js');

const LEAD_START = 300;
const TICK = 700;
const BEAT = 2000;
const SNAPSHOT = 2000;
const SERVER_OFFSET = 5000; // 服务器时钟和本机差 5 秒也无所谓
const WARMUP_MS = 10_000;
/** 快照在网络上/主线程上的抖动（毫秒），真机上不可能恰好是 0 */
const DELIVERY_JITTER = [0, 260, 420, 180, 330];

/**
 * @param {'stale-clock'|'fresh-clock'} mode
 */
function simulate(mode, totalMs = 90_000) {
  let t = 0;
  // —— 服务端（hub）侧 ——
  let hubPos = LEAD_START;
  let hubUpdatedAt = t + SERVER_OFFSET;
  let snapshot = null; // { media, genServerNow, genRealNow }
  let pending = null; // 已经生成、还在路上的快照
  let nextBeat = 137;
  let nextSnapshot = 613;
  let jitterIdx = 0;
  // —— 跟随端 ——
  let followerPos = LEAD_START - 4; // 进房间那一刻落后主控 4 秒
  let lastSeekReal = Number.NEGATIVE_INFINITY;
  let seeks = 0;
  let backSeeks = 0;
  let maxBackJump = 0;
  let steadyMaxAbsDrift = 0;

  let lastT = 0;
  while (t <= totalMs) {
    const serverNow = t + SERVER_OFFSET;
    // 主控真实播放位置（它的播放器是准的）
    const leaderRealPos = LEAD_START + t / 1000;

    if (t >= nextBeat) {
      // hub.heartbeat：按服务器时钟把权威位置推到此刻
      hubPos += Math.max(0, (serverNow - hubUpdatedAt) / 1000);
      hubUpdatedAt = serverNow;
      if (Math.abs(hubPos - leaderRealPos) > 3) hubPos = leaderRealPos; // 主控拖动 → 服务端跟随
      nextBeat += BEAT;
    }
    if (t >= nextSnapshot) {
      pending = {
        media: { action: 'play', positionSec: hubPos, rate: 1, updatedAtServerMs: hubUpdatedAt },
        genServerNow: serverNow,
        genRealNow: t,
        arrivesAt: t + DELIVERY_JITTER[jitterIdx++ % DELIVERY_JITTER.length],
      };
      nextSnapshot += SNAPSHOT;
    }
    if (pending && t >= pending.arrivesAt) {
      snapshot = pending;
      pending = null;
    }

    // 跟随端播放器自己往前走（每个 tick 都走，和快照到没到无关）
    followerPos += (t - lastT) / 1000;
    lastT = t;

    if (snapshot) {
      const estimate =
        mode === 'stale-clock'
          ? snapshot.genServerNow // 旧：快照那一刻的服务端时间，之后就不动了
          : snapshot.genServerNow + (t - snapshot.genRealNow); // 新：按本地流逝时间外推
      const target = computeTargetPosition(snapshot.media, estimate);
      const drift = followerPos - target;
      if (t > WARMUP_MS) steadyMaxAbsDrift = Math.max(steadyMaxAbsDrift, Math.abs(drift));

      let seekTo = null;
      if (mode === 'stale-clock') {
        // 旧实现：对称 1.5 秒阈值（drift.ts 的 HARD_SEC）+ 4 秒最小间隔
        if (target >= 1.5 && Math.abs(drift) > 1.5 && t - lastSeekReal > 4000) seekTo = target;
      } else {
        const d = decideRoomSync(followerPos, target, t - lastSeekReal);
        if (d.seek) seekTo = d.targetSec;
      }
      if (seekTo !== null) {
        lastSeekReal = t;
        seeks += 1;
        if (seekTo < followerPos) {
          backSeeks += 1;
          maxBackJump = Math.max(maxBackJump, followerPos - seekTo);
        }
        followerPos = seekTo;
      }
    }
    t += TICK;
  }
  return { seeks, backSeeks, maxBackJump, steadyMaxAbsDrift };
}

test('旧实现（快照时刻的 serverNow）会周期性把跟随端往回拖 —— 复现"一会一样一会往回缩"', () => {
  const r = simulate('stale-clock');
  assert.ok(r.backSeeks >= 8, `往回 seek 次数 = ${r.backSeeks}，期望 >= 8`);
  assert.ok(r.maxBackJump > 1.5, `最大回跳 = ${r.maxBackJump.toFixed(2)}s，期望 > 1.5s`);
});

test('新实现：外推 serverNow + 非对称阈值，全程没有一次往回跳', () => {
  const r = simulate('fresh-clock');
  assert.equal(r.backSeeks, 0, `不该有往回 seek，实际 ${r.backSeeks} 次`);
  assert.ok(r.steadyMaxAbsDrift < 1, `稳态最大漂移 = ${r.steadyMaxAbsDrift.toFixed(2)}s，期望 < 1s`);
});

test('跟随端落后 4 秒时会被追平（不是不管）', () => {
  const d = decideRoomSync(100, 103.5, Number.POSITIVE_INFINITY);
  assert.equal(d.seek, true);
  assert.equal(d.reason, 'lag');
  assert.ok(d.targetSec > 100);
});

test('超前 3 秒不往回拉，超前 7 秒才拉', () => {
  const small = decideRoomSync(103, 100, Number.POSITIVE_INFINITY);
  assert.equal(small.seek, false);
  assert.equal(small.reason, 'in-sync');
  const big = decideRoomSync(107, 100, Number.POSITIVE_INFINITY);
  assert.equal(big.seek, true);
  assert.equal(big.reason, 'lead');
});

test('主控还没真正开播（目标 < 1.5 秒）时绝不 seek，避免被拽回 0:00', () => {
  const d = decideRoomSync(45, 0.4, Number.POSITIVE_INFINITY);
  assert.equal(d.seek, false);
  assert.equal(d.reason, 'no-target');
});

test('两次 seek 至少隔 6 秒，防止来回抖', () => {
  const d = decideRoomSync(100, 104, 3000);
  assert.equal(d.seek, false);
  assert.equal(d.reason, 'too-soon');
  const ok = decideRoomSync(100, 104, ROOM_SYNC_GATE.MIN_GAP_MS + 1);
  assert.equal(ok.seek, true);
});

test('暂停状态下目标位置就是主控上报的位置，不会随预演时间漂移', () => {
  const media = { action: 'pause', positionSec: 812, rate: 1, updatedAtServerMs: 1000 };
  assert.equal(computeTargetPosition(media, 1000), 812);
  assert.equal(computeTargetPosition(media, 999_999), 812);
});

/* =========================================================================
 * SYNC_BACKOFF：真实事故「她点同步后 20 分钟 ↔ 开头 无限循环」的回归测试
 *
 * 边下边播的源 seek 会丢缓冲、位置读回 0；如果每次都继续拽，用户看到的就是
 * 无限循环。规则：位置没靠近就记一次失败，连续 4 次就停手并提示。
 * ========================================================================= */
const { countSeekFailure, SYNC_GIVE_UP_FAILS } = require('../dist-core/drift.js');

function runStubbornPlayer(ticks = 40) {
  let pos = 0;
  let fails = 0;
  let askedTarget = null;
  let askedAt = 0;
  const target = 1200; // 主控在 20:00
  let seeks = 0;
  for (let i = 0; i < ticks; i += 1) {
    const now = i * 700;
    fails = countSeekFailure({ fails, askedTarget, askedAt, posSec: pos, now });
    if (fails >= SYNC_GIVE_UP_FAILS) break; // 停手
    const decision = decideRoomSync(pos, target, askedTarget === null ? Number.POSITIVE_INFINITY : now - askedAt);
    if (decision.seek) {
      seeks += 1;
      askedTarget = target;
      askedAt = now;
      pos = 0; // 关键：跳过去又弹回开头
    }
  }
  return { seeks, fails };
}

test('源不支持跳转时不会无限循环：最多试 4 次就停手', () => {
  const r = runStubbornPlayer();
  assert.ok(r.seeks <= SYNC_GIVE_UP_FAILS, `seek 次数 = ${r.seeks}，应该 <= ${SYNC_GIVE_UP_FAILS}`);
  assert.equal(r.fails, SYNC_GIVE_UP_FAILS);
});

test('跳转生效（位置真的靠近目标）时失败计数清零，不会被误判成"跳不过去"', () => {
  let fails = countSeekFailure({ fails: 0, askedTarget: 1200, askedAt: 0, posSec: 1201, now: 5000 });
  assert.equal(fails, 0);
  fails = countSeekFailure({ fails: 3, askedTarget: 1200, askedAt: 0, posSec: 1200.4, now: 9000 });
  assert.equal(fails, 0, '一次成功就要清零，别让历史失败把人锁死');
});

test('超过 15 秒才回看的那次不算失败（播放器可能还在缓冲，别冤枉它）', () => {
  const fails = countSeekFailure({ fails: 1, askedTarget: 1200, askedAt: 0, posSec: 0, now: 20_000 });
  assert.equal(fails, 1, '窗口外不计数');
});
