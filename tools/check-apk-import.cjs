// 验证：APK 传进游戏库后，服务端能解析出包名（手机才能"点卡片直接打开"）
const BASE = 'http://127.0.0.1:8799';

function crc32() {
  return 0; // 我们的解析只读中央目录，不校验 CRC
}

/** 造一个最小的 AXML：<manifest package="com.demo.game"> */
function buildAxml(pkg) {
  const strings = ['manifest\0', 'package\0', pkg + '\0'];
  const utf16 = [];
  for (const s of strings) {
    utf16.push(s.length - 1);
    for (const ch of s) utf16.push(ch.charCodeAt(0));
  }
  const strData = Buffer.from(new Uint16Array(utf16).buffer);
  const strCount = strings.length;
  const strOffsets = Buffer.alloc(strCount * 4);
  let acc = 0;
  for (let i = 0; i < strCount; i += 1) {
    strOffsets.writeUInt32LE(acc, i * 4);
    acc += (strings[i].length + 1) * 2;
  }
  const poolHeader = 28;
  const poolSize = poolHeader + strOffsets.length + strData.length;
  const pool = Buffer.alloc(poolSize);
  pool.writeUInt16LE(0x0001, 0);
  pool.writeUInt16LE(poolHeader, 2);
  pool.writeUInt32LE(poolSize, 4);
  pool.writeUInt32LE(strCount, 8);
  pool.writeUInt32LE(0, 16);
  pool.writeUInt32LE(poolHeader + strOffsets.length, 20);
  strOffsets.copy(pool, poolHeader);
  strData.copy(pool, poolHeader + strOffsets.length);

  const attrStart = 20;
  const elSize = 8 + attrStart + 20;
  const el = Buffer.alloc(elSize);
  el.writeUInt16LE(0x0102, 0);
  el.writeUInt16LE(8, 2);
  el.writeUInt32LE(elSize, 4);
  el.writeUInt32LE(0xffffffff, 8);
  el.writeUInt32LE(0, 12);
  el.writeUInt16LE(attrStart, 16);
  el.writeUInt16LE(20, 18);
  el.writeUInt16LE(1, 20);
  const at = 8 + attrStart;
  el.writeUInt32LE(0xffffffff, at);
  el.writeUInt32LE(1, at + 4);
  el.writeUInt32LE(2, at + 8);
  el.writeUInt8(0x03, at + 15);
  el.writeUInt32LE(2, at + 16);

  const total = 8 + poolSize + elSize;
  const out = Buffer.alloc(total);
  out.writeUInt16LE(0x0003, 0);
  out.writeUInt16LE(8, 2);
  out.writeUInt32LE(total, 4);
  pool.copy(out, 8);
  el.copy(out, 8 + poolSize);
  return out;
}

/** 造一个"只存不压"的最小 zip（够我们解析用） */
function buildZip(name, payload) {
  const nameBuf = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6); // 不压缩
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc32(), 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc32(), 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(payload.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 30); // localOffset 先占位，下面回填
  const cdOffset = local.length + nameBuf.length + payload.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, payload, central, nameBuf, eocd]);
}

async function post(p, body, token) {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  const a = await post('/api/account/create', { name: '甲', gender: 'female', birthDate: '1998-05-20', pin: '111111' });
  const b = await post('/api/account/create', { name: '乙', gender: 'male', birthDate: '1997-02-14', pin: '222222' });
  const ta = a.json.value.token;
  const tb = b.json.value.token;
  await post('/api/pair/request', { targetId: b.json.value.accountId }, ta);
  await post('/api/pair/accept', {}, tb);

  const axml = buildAxml('com.demo.game');
  const apk = buildZip('AndroidManifest.xml', axml);
  const data = apk.toString('base64');
  const added = await post('/api/game/add', { title: '测试安卓游戏', data, ext: 'apk' }, ta);
  const spec = added.json?.value ?? {};
  console.log('game/add:', added.status, 'kind=' + spec.kind, 'assetPath=' + spec.assetPath,
    'packageName=' + spec.packageName);
  console.log('包名解析成功？', spec.packageName === 'com.demo.game');

  // 对方的视角：包名也要同步过去（B 点卡片才知道要打开哪个 App）
  const seen = await new Promise((resolve) => {
    const ws = new WebSocket(BASE.replace('http', 'ws'));
    const timer = setTimeout(() => resolve(null), 6000);
    ws.onopen = () => ws.send(JSON.stringify({ v: 1, type: 'hello', token: tb, rev: 0 }));
    ws.onmessage = (ev) => {
      let msg = null;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg && msg.type === 'state' && msg.state) {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* 忽略 */
        }
        resolve(msg.state);
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
  });
  const g = (seen?.games ?? []).find((x) => x.title === '测试安卓游戏');
  console.log('B 看到的这个游戏：', g ? `${g.kind} ${g.assetPath} pkg=${g.packageName}` : '没看到');
})().catch((e) => console.error('FAIL', e.message));
