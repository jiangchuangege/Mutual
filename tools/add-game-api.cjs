const fs = require('node:fs');
const p = 'C:/ts/server/sync-server.mjs';
let t = fs.readFileSync(p, 'utf8');

if (t.includes("'/api/game/add'")) {
  console.log('接口已存在');
  process.exit(0);
}

const anchor = `  if (url.pathname.startsWith('/avatar/') && req.method === 'GET') {`;
if (!t.includes(anchor)) throw new Error('找不到插入点');

const route = `  /**
   * 一键加游戏（给外部脚本/curl 用的接口）。
   *
   * POST /api/game/add
   *   Authorization: Bearer <账号 token>
   *   { "title":"我的游戏", "code":"<!doctype html>..." }            // 直接给代码
   *   { "title":"我的游戏", "data":"<base64>", "ext":"html" }        // 给文件（≤99MB）
   * 可选 players: 1|2（默认 2）。
   * 返回 { ok, value: <GameSpec> }；加了之后两个人手机上都会出现。
   */
  if (url.pathname === '/api/game/add' && req.method === 'POST') {
    const body = await readBody(req);
    if (body && body.__tooBig) {
      json(res, 413, { ok: false, error: '文件太大（上限 99MB）' });
      return;
    }
    const account = requireAccount(req, res, url, body);
    if (!account) return;
    const role = roleOf(account.id);
    const pair = pairOf(account.id);
    if (!role || !pair) {
      json(res, 400, { ok: false, error: '这个账号还没绑定空间' });
      return;
    }
    const hub = hubOf(pair.id);
    const title = String(body.title ?? '').trim().slice(0, 40) || '上传的游戏';
    const players = body.players === 1 ? 1 : 2;
    let result;
    if (body.data) {
      const ext = String(body.ext ?? 'html')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 5) || 'html';
      const up = saveUpload('game', account.id, body.data, ext);
      if (!up.ok) {
        json(res, 400, up);
        return;
      }
      result = hub.addGameAsset(role, {
        title,
        assetPath: up.value.path,
        players,
        kind: ext === 'apk' ? 'native' : 'html',
      });
    } else if (body.code) {
      result = hub.addGame(role, {
        title,
        code: String(body.code),
        players,
        kind: body.kind === 'native' ? 'native' : 'html',
      });
    } else {
      json(res, 400, { ok: false, error: '要带 code（代码）或 data（base64 文件）之一' });
      return;
    }
    json(res, result.ok ? 200 : 400, result);
    return;
  }

`;
t = t.replace(anchor, route + anchor);
fs.writeFileSync(p, t, 'utf8');
console.log('/api/game/add 接口已加入');
