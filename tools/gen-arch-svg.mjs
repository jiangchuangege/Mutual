/**
 * 生成《Mutual 架构图》SVG（当前逻辑版）。
 * 输出：C:/ts/docs/Mutual架构图.svg（再由 headless Edge/Chrome 转 PNG）
 *
 * 用法：node tools/gen-arch-svg.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 1760;
const H = 1360;
const F = 'Microsoft YaHei';

/** 矩形 + 两行文字的小工具 */
const parts = [];
const rect = (x, y, w, h, fill, stroke, r = 10, sw = 1.6) =>
  parts.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
  );
const text = (x, y, s, { size = 14, fill = '#FFFFFF', weight = 'normal', anchor = 'middle' } = {}) =>
  parts.push(
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${F}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`,
  );
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 卡片：标题 + 若干行副标题 */
const card = (x, y, w, title, lines, color, { h = 62, fill, titleSize = 15.5, lineSize = 12 } = {}) => {
  const height = h;
  rect(x, y, w, height, fill ?? color.fill, color.stroke, 10, 1.6);
  const cx = x + w / 2;
  text(cx, y + 24, title, { size: titleSize, weight: 'bold' });
  lines.forEach((l, i) => text(cx, y + 44 + i * 17, l, { size: lineSize, fill: '#DCE6F5' }));
  return y + height;
};

const PANEL = {
  app: { fill: '#0D1B3E', stroke: '#5C8CE0' },
  ui: { fill: '#12305F', stroke: '#7FB3FF' },
  store: { fill: '#4A2A08', stroke: '#FFB74D' },
  cache: { fill: '#0E3A22', stroke: '#7FD6A0' },
  sync: { fill: '#4A1F06', stroke: '#FFB74D' },
  cloud: { fill: '#2E1148', stroke: '#C79BF0' },
  ext: { fill: '#08302C', stroke: '#78D6CB' },
};

const box = (x, y, w, h, title, sub, panel, { titleSize = 17, subSize = 12.5 } = {}) => {
  rect(x, y, w, h, panel.fill, panel.stroke, 12, 2.2);
  text(x + w / 2, y + 30, title, { size: titleSize, weight: 'bold' });
  if (sub) text(x + w / 2, y + 52, sub, { size: subSize, fill: '#D7E3F6' });
};

/* ───────────── 背景与标题 ───────────── */
parts.push(`<rect width="${W}" height="${H}" fill="#080D1A"/>`);
parts.push(
  `<rect x="0" y="0" width="${W}" height="96" fill="#0B1428"/>`,
);
text(W / 2, 46, 'Mutual 双人空间 · 完整原理架构图（当前逻辑 v3.14.19）', {
  size: 34,
  weight: 'bold',
});
text(W / 2, 78, 'Expo SDK 58 / RN 0.88 · 服务端权威状态 · 缓存优先 · 搜索不扫全库 · 房间状态看 presence', {
  size: 16,
  fill: '#8FA6C8',
});

/* ───────────── ① 用户 ───────────── */
box(60, 120, 380, 74, '👥 用户 · 两个人', '各一部手机 · 账号 = TW + 6 位 + 6 位 PIN', PANEL.ui);

/* ───────────── ② 手机 App ───────────── */
box(60, 220, 700, 620, '📱 手机 App（Expo / React Native）', '', PANEL.app, { titleSize: 22 });
const mods = [
  ['🎬 影院', 'CMS 片库 · 搜索走源站 wd='],
  ['📺 电视直播', 'm3u / txt 多源合并'],
  ['📚 焦焦FM', '听书 RSS · 集列表照抄源顺序'],
  ['🎧 一起听', '单引擎 · 队列 + 房间状态'],
  ['🍿 一起看', '同步观影房间（状态机）'],
  ['🎮 游戏库', 'WebView + 联机层'],
  ['🌿 生活 / 关怀', '习惯 · 经期 · 期望清单'],
  ['🔒 隐私 / 保险箱', '脱敏 · 通知白名单'],
];
mods.forEach(([t, s], i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  card(88 + col * 336, 268 + row * 78, 320, t, [s], PANEL.ui, { h: 66 });
});
card(88, 588, 656, '⚙️ 全局 store（门面 Proxy）', ['先在本地 Hub 乐观执行 → forwardRpc 发服务器', 'serverOnlyCache：服务端字段不被本地投影顶掉'], PANEL.store, { h: 74 });
card(88, 672, 656, '🎨 界面层 AppFrame / Aurora', ['统一壁纸（视频/图片） · 玻璃卡片 · 粒子在后面', '首帧不谎报：没拿到服务端快照前显示"正在连接"'], PANEL.ui, { h: 74 });
card(88, 756, 656, '▶️ 播放器：expo-video / expo-audio', ['真实进度每 700ms 回写 store；FM 进度条可拖动', '同一时刻只允许一个音源（audioFocus 登记表）'], PANEL.ui, { h: 62 });

/* ───────────── ③ 本机存储 ───────────── */
box(60, 880, 700, 440, '💾 本机存储（缓存优先 · 永久）', '', PANEL.cache, { titleSize: 22 });
card(88, 928, 644, '📁 文件缓存 cmscache/*.json（无上限）', ['lib:home · cmsApi:<源> · cmsApiDeep:p:<源>:<页>', 'mutual_catpage_v1:… · live:catalog · fm:items（FM 条目）'], PANEL.cache, { h: 66 });
card(88, 1004, 644, '🧩 prefs 双写（新）', ['AsyncStorage + documentDirectory/prefs/*.json', '读新不读旧；满了先清可重建缓存再重试（SQLITE_FULL）'], PANEL.cache, { h: 66 });
card(88, 1080, 644, '🌱 APK 内置种子缓存（当前 65.97MB）', ['仓库里是 38 字节空壳 + skip-worktree，数据只在出包时生成', '首启有内容 · 只读'], PANEL.cache, { h: 66 });
card(88, 1156, 644, '🔒 原子写 .tmp + move', ['断电不坏 · 并发不交叠 · 按页分片'], PANEL.cache, { h: 58 });
card(88, 1224, 644, '🗄 AsyncStorage 小配置', ['账号会话 · 源列表 · 已删接口名单 · 搜索历史'], PANEL.cache, { h: 58 });

/* ───────────── ④ 同步层 ───────────── */
box(800, 220, 400, 620, '🔗 同步层（客户端）', '', PANEL.sync, { titleSize: 22 });
const syncs = [
  ['WebSocket 长连接（主）', 'hello 报身份 · RPC · 服务端推送'],
  ['HTTP 长轮询 /api/wait', '长连接不可用时自动降级'],
  ['/api/rpc 写操作', '断线入队 · 重连补发 · 只发一次'],
  ['投影 application', '服务端权威字段不会被本地顶掉'],
  ['重连必须重新 hello', '否则服务端认不出这条新连接'],
  ['presence 心跳（30 秒）', '进页面立刻报一次 · 房间状态靠它'],
];
syncs.forEach(([t, s], i) => {
  card(824, 268 + i * 90, 352, t, [s], PANEL.sync, { h: 66, titleSize: 15 });
});

/* ───────────── ⑤ 云服务器 ───────────── */
box(1240, 220, 460, 620, '☁️ 云服务器（自建 Node 同步服务）', '', PANEL.cloud, { titleSize: 21 });
const cloud = [
  ['sync-server.mjs（Node · 零依赖）', '/ping /api/rpc /api/wait /api/upload'],
  ['Hub = 唯一权威状态 SpaceState', '校验 → notify → revision+1 → 持久化'],
  ['data/space.json', '账号 / 空间 / 会话'],
  ['文件存储', '头像 · 背景 · 照片 · 音频'],
  ['每个写操作都有 [rpc] 日志', '账号=… 方法=… ok/fail rev=…'],
  ['共享配置：一人管理 · 两人共用', 'setCmsApis / setLiveSourceUrls / fmSources'],
];
cloud.forEach(([t, s], i) => {
  card(1264, 268 + i * 90, 412, t, [s], PANEL.cloud, { h: 66, titleSize: 15 });
});

/* ───────────── ⑥ 外部依赖 ───────────── */
box(1240, 880, 460, 440, '🌐 外部依赖', '', PANEL.ext, { titleSize: 22 });
const ext = [
  ['📡 CMS 采集站 ×19', '实测 16 可用 · 去重后 280,170 部'],
  ['📺 IPTV 直播源（m3u / txt）', '地址|User-Agent=… 拆成 headers'],
  ['🎙 播客 / 有声 RSS（FM）', '单源最多解析 400 条 · 9 秒硬超时'],
  ['🎧 Agora RTC（可选语音）', '静音/音量按本人偏好'],
];
ext.forEach(([t, s], i) => {
  card(1264, 928 + i * 96, 412, t, [s], PANEL.ext, { h: 72, titleSize: 15 });
});

/* ───────────── 关键链路（右侧下半、左侧下方留白处） ───────────── */
box(800, 880, 400, 440, '🧭 四条关键链路', '', PANEL.ui, { titleSize: 21 });
const paths = [
  ['① 搜索', '片库：只问前 8 个源 wd=（各 6 秒）\n→ 片名过滤 → 最多 40 条\n兜底只用内存里的列表，不翻页、不扫全库\n一起听/FM/直播：纯本地过滤'],
  ['② 缓存', '文件优先（cmscache/*.json）→ APK 种子 → 网络\nFM 条目也落文件缓存；小配置走 prefs 双写'],
  ['③ 播放同步', '一起看：±10s 心跳 + 主控纠正\n一起听：seek 冷却 4s · 缓冲中不纠\n一起听：漂了才发心跳（不再每 5 秒）\nFM：一次只留一个播放器'],
  ['④ 房间状态', 'presence：/listen→music · FM→fm\n连上 = 对方在 music 且心跳新鲜（150s）\n或对方 3 分钟内动过队列'],
];
let py = 936;
paths.forEach(([t, s]) => {
  rect(824, py, 352, 96, '#101F42', '#3F6AA8', 10, 1.4);
  text(844, py + 24, t, { size: 15, weight: 'bold', anchor: 'start' });
  s.split('\n').forEach((line, i) => text(838, py + 44 + i * 15, line, { size: 10.2, fill: '#C9D8F2', anchor: 'start' }));
  py += 104;
});

/* ───────────── 连线 ───────────── */
const arrow = (x1, y1, x2, y2, color, label) => {
  parts.push(
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3.2" marker-end="url(#a${color.replace('#', '')})"/>`,
  );
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const w = label.length * 13 + 16;
    parts.push(
      `<rect x="${mx - w / 2}" y="${my - 15}" width="${w}" height="24" rx="6" fill="#0B1428" opacity="0.92"/>`,
    );
    text(mx, my + 2, label, { size: 13, fill: color });
  }
};
const defs = ['#7FB3FF', '#7FD6A0', '#FFB74D', '#C79BF0', '#78D6CB']
  .map(
    (c) =>
      `<marker id="a${c.replace('#', '')}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`,
  )
  .join('');
parts.unshift(`<defs>${defs}</defs>`);

arrow(250, 194, 250, 216, '#7FB3FF', '手指');
arrow(760, 560, 796, 480, '#FFB74D', 'RPC + WS');
arrow(1200, 480, 1236, 480, '#C79BF0', 'WS / HTTP');
parts.push(
  `<line x1="410" y1="842" x2="410" y2="876" stroke="#7FD6A0" stroke-width="3.2" marker-end="url(#a7FD6A0)"/>`,
);
arrow(1240, 1000, 1204, 700, '#78D6CB', '拉片库/台单/RSS');

const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>\n`;

mkdirSync('C:/ts/docs', { recursive: true });
writeFileSync('C:/ts/docs/Mutual架构图.svg', svg, 'utf8');
console.log('wrote docs/Mutual架构图.svg', (Buffer.byteLength(svg) / 1024).toFixed(1), 'KB');
