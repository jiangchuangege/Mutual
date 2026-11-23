/**
 * 最小 WebSocket 传输层（零依赖），给同步服务器复用。
 *
 * 只做四件事，业务全部通过回调交出去：
 *   1) 完成 HTTP Upgrade 握手（RFC 6455 的 Sec-WebSocket-Accept）
 *   2) 文本帧编解码 + ping/pong/close 控制帧
 *   3) 维护连接集合，并在业务数据变化时 broadcast
 *   4) 把 JSON 消息转成回调（onHello / onRpc / onResume / onPing）
 *
 * 协议见 README §6.10。
 */

import crypto from 'node:crypto';

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
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

/** 从缓冲区尽量多地解出完整帧；返回剩余未成帧的字节 */
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
    if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    messages.push({ opcode, payload });
    rest = rest.subarray(offset + len);
  }
  return { messages, rest };
}

/**
 * 把 WS 层挂到一个 http.Server 上。
 *
 * @param {{
 *   takeRole: (client) => 'A'|'B',
 *   onHello?: (client, msg) => void,
 *   onRpc: (client, method, args) => {ok:boolean,value?:unknown,error?:string},
 *   onResume?: (client, msg) => void,
 *   stateFor: (client) => object|null,
 *   revision: () => number,
 * }} hooks
 */
export function createWebSocketLayer(hooks) {
  const clients = new Set();

  function send(client, payload) {
    if (!client.socket.destroyed) {
      try {
        client.socket.write(encodeFrame(0x1, JSON.stringify(payload)));
      } catch {
        // 对端已断，交给 close 事件清理
      }
    }
  }

  function pushState(client) {
    // 每次推送都问一次"我现在是哪一格"，而不是用连接建立时缓存的 role。
    // 绑定/解绑会改变账号在空间里的槽位（自己的个人空间是 A，被绑进去后变成 B），
    // 缓存的那个 role 会一直停在旧值 —— 客户端就会把对方的名字当成自己
    //（真实事故：绑定后 B 端一直是 A 格，两台手机都显示"我=对方"）。
    const fresh = hooks.roleFor?.(client);
    if (fresh === 'A' || fresh === 'B') client.role = fresh;
    if (!client.role) return;
    const state = hooks.stateFor(client);
    if (!state) return;

    // **内容没变就不推**。
    // 以前服务端每秒 tick 一次、每次都广播整份快照（一份几 KB），
    // 公网/移动网络下这就是持续流量，也更容易把连接"喂"到抖动。
    // 注意把 `serverNowMs` 从指纹里剔掉：它是"当前服务器时间"，
    // 每次都变，留着等于永远判断为"有变化"，去重就白做了。
    // serverNowMs（服务器当前时间）和 revision（hub 内部计数器）每次都会变，
    // 留着它们等于永远判定为"有变化"，去重就白做了。
    const { serverNowMs, revision: innerRev, ...stable } = state;
    void serverNowMs;
    void innerRev;
    const fingerprint = `${client.role}\n${JSON.stringify(stable)}`;
    if (client.lastFingerprint === fingerprint) return;
    client.lastFingerprint = fingerprint;
    send(client, { v: 1, type: 'state', rev: hooks.revision(), role: client.role, state });
  }

  /** 关掉一条连接（认证失败时用） */
  function socket_close(client) {
    try {
      client.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
    } catch {
      client.socket.destroy?.();
    }
  }

  /** 业务数据变化后调用：给所有已报身份的连接推一份新投影 */
  function broadcast() {
    for (const client of clients) pushState(client);
  }

  function handleMessage(client, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      send(client, { v: 1, type: 'error', error: '不是合法 JSON' });
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'hello': {
        if (typeof msg.clientId === 'string' && msg.clientId) client.clientId = msg.clientId;
        // 第一次 hello 才认身份；断线重连时保持原来的 role。
        // 把 msg 传进去，让上层按 token / clientId 认人（而不是"第几个连上来"）。
        if (!client.role || hooks.refreshRole) {
          const role = hooks.takeRole(client, msg);
          if (role !== 'A' && role !== 'B') {
            // 认不出身份（token 失效、账号被删）：明确告诉客户端，别让它干等
            send(client, {
              v: 1,
              type: 'error',
              code: 'auth',
              error: client.authError ?? '认证失败，请重新登录',
            });
            try {
              socket_close(client);
            } catch {
              // 关不掉也没关系，客户端收到 error 会自己重来
            }
            return;
          }
          client.role = role;
        }
        hooks.onHello?.(client, msg);
        send(client, {
          v: 1,
          type: 'welcome',
          role: client.role,
          rev: hooks.revision(),
        });
        pushState(client);
        return;
      }
      case 'ping': {
        send(client, { v: 1, type: 'pong', t: msg.t ?? null });
        return;
      }
      case 'resume': {
        if (!client.role) return;
        client.lastResume = msg.room ?? null;
        hooks.onResume?.(client, msg);
        pushState(client);
        return;
      }
      case 'rpc': {
        // 一条 rpc 可能比 hello 先到（重连时客户端会把断线期间排队的操作立刻补发）。
        // 以前这里直接回「先发 hello 再发 rpc」，用户看到的就是这条红字，
        // 而且那次操作直接丢了（真实事故：重连期间加/删安排报这个错）。
        // 现在只要消息里带着 token，就当场认一次身份再执行——顺序不再是前提。
        if (!client.role) {
          if (typeof msg.token === 'string' && msg.token) {
            const lateRole = hooks.takeRole(client, msg);
            if (lateRole === 'A' || lateRole === 'B') client.role = lateRole;
          }
        }
        // 每次执行前都刷新一次槽位：绑定之后这个连接属于哪一格会变
        const freshRpcRole = hooks.roleFor?.(client);
        if (freshRpcRole === 'A' || freshRpcRole === 'B') client.role = freshRpcRole;
        if (!client.role) {
          send(client, {
            v: 1,
            type: 'rpc-result',
            id: msg.id ?? -1,
            result: { ok: false, code: 'retry', error: '还没完成身份认证，请稍后重试（会自动重连）' },
          });
          return;
        }
        const id = msg.id ?? -1;
        const method = String(msg.method ?? '');
        const args = Array.isArray(msg.args) ? msg.args : [];
        // hello 里带的设备 ID 才是这台机器的身份（角色可能和别人撞）
        if (typeof msg.clientId === 'string' && msg.clientId) client.clientId = msg.clientId;
        let result;
        try {
          result = hooks.onRpc(client, method, args, client.clientId) ?? { ok: true, value: null };
        } catch (err) {
          result = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        send(client, { v: 1, type: 'rpc-result', id, result });
        return;
      }
      default:
        return; // 未知类型忽略：协议向前兼容
    }
  }

  function attach(server) {
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
      socket.setNoDelay?.(true);

      const client = { socket, role: null, clientId: '', buffer: Buffer.alloc(0), lastResume: null };
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
            socket.write(encodeFrame(0xa, frame.payload));
          } else if (frame.opcode === 0x1) {
            handleMessage(client, frame.payload.toString('utf8'));
          }
        }
      });

      const cleanup = () => clients.delete(client);
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    });
  }

  return {
    attach,
    broadcast,
    send,
    pushState,
    get size() {
      return clients.size;
    },
    get roles() {
      return [...clients].map((c) => c.role);
    },
  };
}
