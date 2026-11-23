/**
 * TwoSpace 同步服务器（WebSocket + HTTP /ping），零依赖。
 *
 * 用途有两个：
 *  1) 给你一个"协议对得上"的参考实现——线上那台如果字段名不同，照这个改即可；
 *  2) 本地联调：手机连 http://电脑IP:8790 就能跟 App 长连接对话，不用等公网。
 *
 * 启动：
 *   node server/ws-server.mjs                 # 默认 8790
 *   $env:PORT=8080; node server/ws-server.mjs
 *
 * 协议（与 App 端 src/core/connectionManager.ts + src/store.tsx 对应）
 *   C→S  {v:1,type:'hello', role, rev, profile}
 *   C→S  {v:1,type:'rpc', id, method, args}
 *   C→S  {v:1,type:'resume', rev, room:{id,title,state,leaderRole,playing,positionSec,updatedAt}|null}
 *   C→S  {v:1,type:'ping', t}
 *   S→C  {v:1,type:'welcome', role, spaceId, rev}
 *   S→C  {v:1,type:'state', rev, state}          # state 是按角色裁过的投影
 *   S→C  {v:1,type:'pong', t}
 *   S→C  {v:1,type:'rpc-result', id, result}
 *   S→C  {v:1,type:'error', error}
 */

import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Hub } = require('../dist-core/hub.js');

const PORT = Number(process.env.PORT ?? 8790);
/** 默认 0.0.0.0：Cloudflare 隧道（本机回环）与局域网手机都能连；HOST 可收紧到 127.0.0.1 */
const HOST = process.env.HOST ?? '0.0.0.0';
const startedAt = Date.now();
/** 禁止客户端调用的方法（和 HTTP 版保持同一份黑名单） */
const FORBIDDEN = new Set([
  'serialize',
  'hydrate',
  'subscribe',
  'resetToEmpty',
  'seedDemo',
  'constructor',
  'now',
  'scaled',
  'notify',
  'audit',
  'toDeviceClock',
  'setScaleHint',
  'clockPing',
]);

const hub = new Hub({ scale: 1 });
/** socket 集合；role 反过来当"这台手机是谁" */
const clients = new Set();
let revision = 0;

function snapshotFor(role) {
  try {
    return hub.snapshot(role);
  } catch {
    return null;
  }
}

function broadcastState() {
  revision += 1;
  for (const client of clients) {
    if (!client.role) continue;
    const state = snapshotFor(client.role);
    if (state) sendText(client.socket, JSON.stringify({ v: 1, type: 'state', rev: revision, state }));
  }
}

// ---------------------------------------------------------------------------
// 最小 WebSocket 帧编解码（只做文本帧 + ping/pong/close，够用且可读）
// ---------------------------------------------------------------------------

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, data]);
}

function sendText(socket, text) {
  if (socket.destroyed) return;
  try {
    socket.write(encodeFrame(0x1, text));
  } catch {
    // 对端已断，交给 close 事件清理
  }
}

/**
 * 从缓冲区里尽可能多地解出完整帧。
 * 返回 { messages: [{opcode, payload}], rest: 剩余 Buffer }
 */
function decodeFrames(buffer) {
  const messages = [];
  let rest = buffer;
  for (;;) {
    if (rest.length < 2) break;
    const opcode = rest[0] & 0x0f;
    const masked = (rest[1] & 0x80) !== 0;
    let len = rest[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (rest.length < offset + 2) break;
      len = rest.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (rest.length < offset + 8) break;
      len = Number(rest.readBigUInt64BE(offset));
      offset += 8;
    }
    let mask = null;
    if (masked) {
      if (rest.length < offset + 4) break;
      mask = rest.subarray(offset, offset + 4);
      offset += 4;
    }
    if (rest.length < offset + len) break;
    const payload = Buffer.from(rest.subarray(offset, offset + len));
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    messages.push({ opcode, payload });
    rest = rest.subarray(offset + len);
  }
  return { messages, rest };
}

// ---------------------------------------------------------------------------
// 业务：一条连接一个 role
// ---------------------------------------------------------------------------

function handleMessage(client, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendText(client.socket, JSON.stringify({ v: 1, type: 'error', error: '不是合法 JSON' }));
    return;
  }
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'hello': {
      // 先到的是 A，后到的是 B；同一台手机断线重连时保持原来的 role
      if (!client.role) {
        const takenA = [...clients].some((c) => c !== client && c.role === 'A');
        client.role = takenA ? 'B' : 'A';
      }
      const profile = msg.profile ?? {};
      const me = hub.serialize().members[client.role];
      if (typeof profile.nickname === 'string' && profile.nickname && !me.profileCompleted) {
        hub.updateMyProfile(client.role, {
          name: profile.nickname,
          birthDate: typeof profile.birthDate === 'string' ? profile.birthDate : '2000-01-01',
          gender:
            profile.gender === 'male' || profile.gender === 'female' ? profile.gender : 'other',
        });
      }
      sendText(
        client.socket,
        JSON.stringify({
          v: 1,
          type: 'welcome',
          role: client.role,
          spaceId: hub.snapshot(client.role).spaceId,
          rev: revision,
        }),
      );
      const helloState = snapshotFor(client.role);
      if (helloState) {
        sendText(
          client.socket,
          JSON.stringify({ v: 1, type: 'state', rev: revision, state: helloState }),
        );
      }
      return;
    }

    case 'ping': {
      sendText(client.socket, JSON.stringify({ v: 1, type: 'pong', t: msg.t ?? null }));
      return;
    }

    case 'resume': {
      if (!client.role) return;
      // 客户端重连后把当前房间/播放进度补上来：这里只记录并广播，具体校准由 hub 负责
      if (msg.room && typeof msg.room.id === 'string') {
        client.lastRoom = msg.room;
      }
      const state = snapshotFor(client.role);
      if (state) sendText(client.socket, JSON.stringify({ v: 1, type: 'state', rev: revision, state }));
      broadcastState();
      return;
    }

    case 'rpc': {
      if (!client.role) {
        sendText(
          client.socket,
          JSON.stringify({ v: 1, type: 'error', error: '先发 hello 再发 rpc' }),
        );
        return;
      }
      const id = msg.id ?? -1;
      const method = String(msg.method ?? '');
      const args = Array.isArray(msg.args) ? msg.args : [];
      if (!method || FORBIDDEN.has(method) || typeof hub[method] !== 'function') {
        sendText(
          client.socket,
          JSON.stringify({
            v: 1,
            type: 'rpc-result',
            id,
            result: { ok: false, error: `不允许的方法：${method}` },
          }),
        );
        return;
      }
      let result;
      try {
        result = hub[method](client.role, ...args) ?? { ok: true, value: null };
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      sendText(client.socket, JSON.stringify({ v: 1, type: 'rpc-result', id, result }));
      if (result.ok !== false) broadcastState();
      return;
    }

    default:
      // 未知类型忽略：协议要能向前兼容
      return;
  }
}

// ---------------------------------------------------------------------------
// HTTP：/ping 探测 + upgrade
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const sendJson = (code, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-max-age': '86400',
    });
    res.end(body);
  };

  // CORS 预检：浏览器/WebView 里跨域打 /ping 时先到这里
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-max-age': '86400',
    });
    res.end();
    return;
  }

  if (url.pathname === '/ping') {
    sendJson(200, {
      ok: true,
      pong: true,
      service: 'twospace-ws',
      version: 1,
      rev: revision,
      clients: clients.size,
      startedAtIso: new Date(startedAt).toISOString(),
      ts: Date.now(),
    });
    return;
  }
  if (url.pathname === '/health') {
    const snap = hub.snapshot('A');
    sendJson(200, {
      ok: true,
      rev: revision,
      bound: snap.boundAt !== null,
      members: [
        { role: 'A', name: snap.members.A.name, completed: snap.members.A.profileCompleted },
        { role: 'B', name: snap.members.B.name, completed: snap.members.B.profileCompleted },
      ],
    });
    return;
  }
  sendJson(404, { ok: false, error: 'not found' });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      '',
      '',
    ].join('\r\n'),
  );

  // role 在收到 hello 之前是 null：没报身份之前不发任何数据
  const client = { socket, role: null, buffer: Buffer.alloc(0), lastRoom: null };
  clients.add(client);

  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    const { messages, rest } = decodeFrames(client.buffer);
    client.buffer = rest;
    for (const frame of messages) {
      if (frame.opcode === 0x8) {
        socket.end(encodeFrame(0x8, Buffer.alloc(0)));
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(encodeFrame(0xa, frame.payload)); // ping → pong
        return;
      }
      if (frame.opcode === 0x1) handleMessage(client, frame.payload.toString('utf8'));
    }
  });

  const cleanup = () => {
    clients.delete(client);
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

// 服务端自己推进时间（房间倒计时 / 邀请过期 / 每日一问轮换 / 掉线超时）
const tickTimer = setInterval(() => {
  try {
    hub.tick();
    broadcastState();
  } catch {
    // 忽略
  }
}, 1000);
tickTimer.unref?.();

server.listen(PORT, HOST, () => {
  const lanIps = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
    .map((n) => n.address);

  console.log(`[twospace] WS 同步服务器已启动：ws://${HOST}:${PORT}`);
  console.log(`[twospace] 探测： curl "http://localhost:${PORT}/ping"`);
  if (HOST === `0.0.0.0` && lanIps.length > 0) {
    console.log('[twospace] 手机端「我们 → 同步服务器」填（手机与电脑同一 Wi-Fi）：');
    for (const ip of lanIps) console.log(`           http://${ip}:${PORT}`);
  }
});
