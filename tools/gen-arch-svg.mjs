/**
 * 生成《Mutual 架构图》SVG（当前逻辑 v3.14.19 · 连线清晰版）。
 *
 * 相比上一版：连线全部走"面板之间的走廊"，6px 粗 + 深色描边 + 大箭头 + 胶囊标签，
 * 右下角补图例与"怎么读这张图"，不会被面板标题压住。
 *
 * 输出：C:/ts/docs/Mutual架构图.svg → headless Edge/Chrome 截图 → PNG（1760×1400）
 * 用法：node tools/gen-arch-svg.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 1760;
const H = 1400;
const F = 'Microsoft YaHei';
const P = [];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rect = (x, y, w, h, fill, stroke, r = 12, sw = 2.2) =>
  P.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
  );

const text = (x, y, s, o = {}) => {
  const { size = 14, fill = '#FFFFFF', weight = 'normal', anchor = 'middle' } = o;
  P.push(
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${F}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`,
  );
};

const PANEL = {
  app: { fill: '#0D1B3E', stroke: '#6D9BE8' },
  ui: { fill: '#12305F', stroke: '#8CBBFF' },
  store: { fill: '#4A2A08', stroke: '#FFB74D' },
  cache: { fill: '#0E3A22', stroke: '#7FD6A0' },
  ext: { fill: '#08302C', stroke: '#78D6CB' },
  sync: { fill: '#4A1F06', stroke: '#FFB74D' },
  cloud: { fill: '#2E1148', stroke: '#C79BF0' },
};

const panel = (x, y, w, h, title, sub, p, ts = 22) => {
  rect(x, y, w, h, p.fill, p.stroke, 14, 2.6);
  text(x + w / 2, y + 34, title, { size: ts, weight: 'bold' });
  if (sub) text(x + w / 2, y + 56, sub, { size: 12.5, fill: '#CBD9F0' });
};

const card = (x, y, w, h, title, lines, p, o = {}) => {
  const { ts = 15, ls = 11.6 } = o;
  rect(x, y, w, h, p.fill, p.stroke, 10, 1.8);
  const cx = x + w / 2;
  text(cx, y + 23, title, { size: ts, weight: 'bold' });
  lines.forEach((l, i) => text(cx, y + 42 + i * 16, l, { size: ls, fill: '#D8E4F6' }));
};

/* ── 背景 / 标题 ── */
P.push(`<rect width="${W}" height="${H}" fill="#070C18"/>`);
P.push(`<rect x="0" y="0" width="${W}" height="100" fill="#0A1324"/>`);
text(W / 2, 46, 'Mutual 双人空间 · 完整原理架构图（当前逻辑 v3.14.19）', { size: 35, weight: 'bold' });
text(W / 2, 80, 'Expo SDK 58 / RN 0.88 · 服务端权威状态 · 缓存优先 · 搜索不扫全库 · 房间状态看 presence', {
  size: 16,
  fill: '#8FA6C8',
});

/* ── 左列：用户 / App ── */
panel(60, 124, 700, 84, '👥 用户 · 两个人', '各一部手机 · 账号 = TW + 6 位 + 6 位 PIN', PANEL.ui, 20);
panel(60, 268, 700, 532, '📱 手机 App（Expo / React Native）', 'Expo SDK 58 / RN 0.88 · Hermes', PANEL.app);

const mods = [
  ['🎬 影院', 'CMS 片库 · 搜索走源站 wd='],
  ['📺 电视直播', 'm3u / txt 多源合并'],
  ['📚 焦焦FM', 'RSS · 集列表照抄源顺序'],
  ['🎧 一起听', '单引擎 · 队列 + 房间状态'],
  ['🍿 一起看', '同步观影房间（状态机）'],
  ['🎮 游戏库', 'WebView + 联机层'],
  ['🌿 生活 / 关怀', '习惯 · 经期 · 期望清单'],
  ['🔒 隐私 / 保险箱', '脱敏 · 通知白名单'],
];
mods.forEach(([t, s], i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  card(84 + col * 336, 330 + row * 68, 320, 60, t, [s], PANEL.ui, { ts: 14.5, ls: 11.2 });

});

card(84, 608, 656, 58, '⚙️ 全局 store（门面 Proxy）', [
  '先在本地 Hub 乐观执行 → forwardRpc 发服务器 · serverOnlyCache 保护服务端字段',
], PANEL.store, { ts: 15 });
card(84, 674, 656, 58, '🎨 界面层 AppFrame / Aurora', [
  '统一壁纸 · 玻璃卡片 · 粒子在内容后面 · 首帧不谎报"未绑定"',
], PANEL.ui, { ts: 15 });
card(84, 740, 656, 52, '▶️ 播放器 expo-video / expo-audio', [
  '真实进度 700ms 回写 · FM 进度条可拖动 · audioFocus 同一时刻只一个音源',
], PANEL.ui, { ts: 14, ls: 10.6 });

/* ── 左列下半：本机存储 / 外部依赖 ── */
panel(60, 900, 344, 466, '💾 本机存储', '缓存优先 · 永久', PANEL.cache, 20);
card(78, 962, 308, 92, '📁 文件缓存 cmscache/*.json', [
  'lib:home · cmsApi:<源> · cmsApiDeep:…',
  'mutual_catpage_v1:… · live:catalog',
  'fm:items（FM 条目）',
], PANEL.cache, { ts: 13.5, ls: 10.6 });
card(78, 1062, 308, 88, '🧩 prefs 双写（新）', [
  'AsyncStorage + prefs/*.json',
  '读新不读旧；满了先清可重建缓存再试',
  '（SQLITE_FULL 自愈）',
], PANEL.cache, { ts: 13.5, ls: 10.4 });
card(78, 1158, 308, 72, '🌱 APK 种子缓存 65.97MB', [
  '仓库是 38 字节空壳 + skip-worktree',
  '只读 · 首启就有内容',
], PANEL.cache, { ts: 13.5, ls: 10.4 });
card(78, 1238, 308, 58, '🔒 原子写 .tmp + move', ['断电不坏 · 并发不交叠'], PANEL.cache, {
  ts: 13.5,
  ls: 10.4,
});
card(78, 1304, 308, 52, '🗄 AsyncStorage 小配置', ['会话 · 源列表 · 已删接口名'], PANEL.cache, {
  ts: 13.5,
  ls: 10.4,
});

panel(428, 900, 332, 466, '🌐 外部依赖', 'App 直连，不经中转', PANEL.ext, 20);
card(446, 962, 296, 82, '📡 CMS 采集站 ×19', ['实测 16 可用', '去重后 280,170 部'], PANEL.ext, {
  ts: 13.5,
  ls: 10.4,
});
card(446, 1052, 296, 82, '📺 IPTV 直播源', ['m3u / m3u8 / txt', '地址|UA=… 拆请求头'], PANEL.ext, {
  ts: 13.5,
  ls: 10.4,
});
card(446, 1142, 296, 88, '🎙 播客 / 有声 RSS', ['单源 ≤400 条 · 9 秒硬超时', '扫够就停（不整篇跑正则）'], PANEL.ext, {
  ts: 13.5,
  ls: 10.4,
});
card(446, 1238, 296, 58, '🎧 Agora RTC（可选语音）', ['静音/音量按本人偏好'], PANEL.ext, {
  ts: 13.5,
  ls: 10.4,
});
card(446, 1304, 296, 52, '⚠️ 失效源会被标红', ['只影响它自己，不拖累整页'], PANEL.ext, {
  ts: 13.5,
  ls: 10.4,
});

/* ── 中列：同步层 / 关键链路 ── */
panel(820, 268, 360, 532, '🔗 同步层（客户端）', '身份 · 长连接 · 写操作 · 投影', PANEL.sync, 21);
const syncs = [
  ['WebSocket 长连接（主）', 'hello 报身份 · RPC · 服务端推送'],
  ['HTTP 长轮询 /api/wait', '长连接不可用时自动降级'],
  ['/api/rpc 写操作', '断线入队 · 重连补发 · 只发一次'],
  ['投影 application', '服务端权威字段不会被本地顶掉'],
  ['重连必须重新 hello', '否则服务端认不出这条新连接'],
  ['presence 心跳 30 秒', '进页面立刻报一次 · 房间状态靠它'],
];
syncs.forEach(([t, s], i) => {
  card(842, 356 + i * 74, 316, 66, t, [s], PANEL.sync, { ts: 14, ls: 10.8 });
});

panel(820, 900, 360, 466, '🧭 四条关键链路', '', PANEL.ui, 21);
const paths = [
  ['① 搜索', ['片库：前 8 个源 wd=（各 6 秒）', '→ 片名过滤 → 最多 40 条', '兜底只用内存列表，不扫全库', '一起听/FM/直播：纯本地过滤']],
  ['② 缓存', ['文件 cmscache → APK 种子 → 网络', 'FM 条目落 fm:items', '小配置走 prefs 双写']],
  ['③ 播放同步', ['一起看：±10s 心跳 + 主控纠正', '一起听：seek 冷却 4s、缓冲中不纠', '一起听：漂了才发心跳', 'FM：一次只留一个播放器']],
  ['④ 房间状态', ['presence：/listen→music · FM→fm', '连上 = 对方在 music 且心跳<150s', '或 3 分钟内动过队列']],
];
let py = 962;
paths.forEach(([t, lines]) => {
  const h = 34 + lines.length * 15 + 8;
  rect(842, py, 316, h, '#0F1E3E', '#4C79BB', 10, 1.6);
  text(842 + 158, py + 21, t, { size: 14.5, weight: 'bold' });
  lines.forEach((l, i) => text(842 + 158, py + 39 + i * 15, l, { size: 10.4, fill: '#C9D8F2' }));
  py += h + 10;
});

/* ── 右列：云服务器 / 图例 ── */
panel(1240, 268, 460, 532, '☁️ 云服务器（自建 Node 同步服务）', 'sync-server.mjs · 零依赖', PANEL.cloud, 21);
const cloud = [
  ['/ping /api/rpc /api/wait /api/upload', ['一条 HTTP 服务兼顾 RPC 与上传']],
  ['Hub = 唯一权威状态 SpaceState', ['校验 → notify → revision+1 → 持久化']],
  ['data/space.json', ['账号 / 空间 / 会话']],
  ['文件存储', ['头像 · 背景 · 照片 · 音频']],
  ['每个写操作都有 [rpc] 日志', ['账号=… 方法=… ok/fail rev=…']],
  ['共享配置：一人管理 · 两人共用', ['setCmsApis / setLiveSourceUrls / fmSources']],
];
cloud.forEach(([t, s], i) => {
  card(1262, 356 + i * 74, 416, 66, t, s, PANEL.cloud, { ts: 14.5, ls: 10.8 });
});

panel(1240, 900, 460, 466, '📖 怎么读这张图', '', PANEL.ui, 21);
const legend = [
  ['#7FD6A0', '手机内部：读写缓存 / 落盘 / 打开页面'],
  ['#FFB74D', 'App ⇄ 同步层 ⇄ 云服务器（长连接 + RPC + 推送）'],
  ['#78D6CB', 'App 直连外部依赖（采集站 / 直播源 / RSS）'],
  ['#C79BF0', '服务端内部：状态持久化与文件存储'],
];
let ly = 962;
legend.forEach(([color, label]) => {
  P.push(
    `<line x1="1268" y1="${ly}" x2="1328" y2="${ly}" stroke="#04060C" stroke-width="12" stroke-linecap="round"/>`,
    `<line x1="1268" y1="${ly}" x2="1328" y2="${ly}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`,
    `<polygon points="1328,${ly - 9} 1346,${ly} 1328,${ly + 9}" fill="${color}" stroke="#04060C" stroke-width="1.6"/>`,
  );
  text(1358, ly + 5, label, { size: 12.2, fill: '#DCE6F5', anchor: 'start' });
  ly += 50;
});

text(1470, 1176, '一张图看懂的四件事', { size: 16, weight: 'bold' });
[
  '① 界面永远"缓存先出"，网络在后面补',
  '② 写操作先在本地乐观执行，再由服务端定稿',
  '③ 两台手机不直接通信：一切经 Hub 投影',
  '④ 房间/在听/在看靠 presence 心跳判断',
].forEach((s, i) => text(1270, 1214 + i * 30, s, { size: 12.8, fill: '#C9D8F2', anchor: 'start' }));

/* ── 连线：走廊 + 深色描边 + 大箭头 + 胶囊标签 ── */
const COLORS = { data: '#7FD6A0', sync: '#FFB74D', ext: '#78D6CB', cloud: '#C79BF0' };
const defs = Object.entries(COLORS)
  .map(
    ([k, c]) =>
      `<marker id="ar-${k}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto"><path d="M1,1 L11,6 L1,11 z" fill="${c}" stroke="#04060C" stroke-width="1.6"/></marker>`,
  )
  .join('');
P.unshift(`<defs>${defs}</defs>`);

const link = (x1, y1, x2, y2, kind, label) => {
  const c = COLORS[kind];
  P.push(
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#04060C" stroke-width="12" stroke-linecap="round"/>`,
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="6" stroke-linecap="round" marker-end="url(#ar-${kind})"/>`,
  );
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const w = label.length * 12.5 + 22;
    P.push(
      `<rect x="${mx - w / 2}" y="${my - 17}" width="${w}" height="28" rx="9" fill="#04060C" stroke="${c}" stroke-width="1.8"/>`,
    );
    text(mx, my + 2, label, { size: 13, fill: c, weight: 'bold' });
  }
};

/* 用户 → App（走廊 y 224..268） */
link(410, 210, 410, 264, 'data', '打开 App 使用');
/* App → 本机存储（走廊 y 824..862） */
link(232, 806, 232, 894, 'data', '读写缓存 · 缓存先出');
/* App → 外部依赖（走廊 y 824..862） */
link(594, 806, 594, 894, 'ext', '直连源站（CMS/IPTV/RSS）');
/* App → 同步层（走廊 x 760..820） */
link(764, 540, 814, 540, 'sync', 'RPC + WS');
/* 同步层 → 云服务器（走廊 x 1180..1240） */
link(1184, 540, 1234, 540, 'sync', 'WS / HTTP');
/* 同步层 → 关键链路（同列，表示这四条链路都用它） */
P.push(
  `<line x1="1000" y1="806" x2="1000" y2="894" stroke="#04060C" stroke-width="12" stroke-linecap="round"/>`,
  `<line x1="1000" y1="806" x2="1000" y2="894" stroke="${COLORS.sync}" stroke-width="6" stroke-linecap="round" marker-end="url(#ar-sync)"/>`,
);
/* 云服务器 → 内部持久化（同列示意） */
P.push(
  `<line x1="1600" y1="806" x2="1600" y2="894" stroke="#04060C" stroke-width="12" stroke-linecap="round"/>`,
  `<line x1="1600" y1="806" x2="1600" y2="894" stroke="${COLORS.cloud}" stroke-width="6" stroke-linecap="round" marker-end="url(#ar-cloud)"/>`,
);

const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${P.join('')}</svg>\n`;
mkdirSync('C:/ts/docs', { recursive: true });
writeFileSync('C:/ts/docs/Mutual架构图.svg', svg, 'utf8');
console.log('wrote docs/Mutual架构图.svg', (Buffer.byteLength(svg) / 1024).toFixed(1), 'KB');
