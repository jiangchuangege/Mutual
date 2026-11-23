const fs = require('node:fs');

// ---------- 1) 服务端：把"游戏文件"当成一种上传类型（体积上限 64MB） ----------
let s = fs.readFileSync('C:/ts/server/sync-server.mjs', 'utf8');
if (!s.includes("game: { dir: 'games'")) {
  s = s.replace(
    "  // 本地音乐：用户在自己手机上选的文件，传到服务器后对方也能\"一起听\"\n  audio: { dir: 'audio', prefix: '/audio/' },",
    `  // 本地音乐：用户在自己手机上选的文件，传到服务器后对方也能"一起听"
  audio: { dir: 'audio', prefix: '/audio/' },
  // 大型游戏（单文件 HTML 或任意网页资源）：存成文件，客户端按网址加载，
  // 这样游戏体积不再受"同步状态大小"限制（用户要求：再大都能支持）
  game: { dir: 'games', prefix: '/game/' },`
  );
  s = s.replace(
    "const AUDIO_MAX_B64 = 24 * 1024 * 1024;",
    "const AUDIO_MAX_B64 = 24 * 1024 * 1024;\n/** 一个游戏文件的上限：64MB base64（≈47MB 原文件，Unity WebGL 也能塞） */\nconst GAME_MAX_B64 = 64 * 1024 * 1024;\nconst GAME_EXT = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', wasm: 'application/wasm', data: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', ogg: 'audio/ogg', json: 'application/json' };"
  );
  s = s.replace(
    "  const isAudio = kind === 'audio';\n  const maxB64 = isAudio ? AUDIO_MAX_B64 : UPLOAD_MAX_B64;",
    "  const isAudio = kind === 'audio';\n  const isGame = kind === 'game';\n  const maxB64 = isGame ? GAME_MAX_B64 : isAudio ? AUDIO_MAX_B64 : UPLOAD_MAX_B64;"
  );
  s = s.replace(
    "  const clean = isAudio\n    ? data.replace(/^data:audio\\/[a-z0-9.+-]+;base64,/i, '').replace(/\\s/g, '')\n    : data.replace(/^data:image\\/[a-z]+;base64,/i, '').replace(/\\s/g, '');",
    "  const clean = isGame || isAudio\n    ? data.replace(/^data:[a-z0-9.+-]+\\/[a-z0-9.+-]+;base64,/i, '').replace(/\\s/g, '')\n    : data.replace(/^data:image\\/[a-z]+;base64,/i, '').replace(/\\s/g, '');"
  );
  s = s.replace(
    "  const table = isAudio ? AUDIO_EXT : IMAGE_EXT;\n  const fallback = isAudio ? 'mp3' : 'jpg';",
    "  const table = isGame ? GAME_EXT : isAudio ? AUDIO_EXT : IMAGE_EXT;\n  const fallback = isGame ? 'html' : isAudio ? 'mp3' : 'jpg';"
  );
  s = s.replace(
    "    if (kind !== 'photo' && !isAudio) for (const old of fs.readdirSync(dir)) {",
    "    if (kind !== 'photo' && !isAudio && !isGame) for (const old of fs.readdirSync(dir)) {"
  );
  s = s.replace(
    "  const type = kind === 'audio' ? AUDIO_EXT[ext] : IMAGE_EXT[ext];",
    "  const type = kind === 'game' ? GAME_EXT[ext] : kind === 'audio' ? AUDIO_EXT[ext] : IMAGE_EXT[ext];"
  );
  s = s.replace(
    "  // 本地音乐：对方的播放器直接从这里取\n  if (url.pathname.startsWith('/audio/') && req.method === 'GET') {\n    serveUpload('audio', url.pathname.slice('/audio/'.length), res);\n    return;\n  }",
    "  // 本地音乐：对方的播放器直接从这里取\n  if (url.pathname.startsWith('/audio/') && req.method === 'GET') {\n    serveUpload('audio', url.pathname.slice('/audio/'.length), res);\n    return;\n  }\n\n  // 大型游戏资源：WebView 直接从这里加载（体积不受同步状态限制）\n  if (url.pathname.startsWith('/game/') && req.method === 'GET') {\n    serveUpload('game', url.pathname.slice('/game/'.length), res);\n    return;\n  }"
  );
  fs.writeFileSync('C:/ts/server/sync-server.mjs', s, 'utf8');
}
console.log('server: game 上传类型', s.includes("game: { dir: 'games'"), '| /game/ 路由', s.includes("'/game/'"));
