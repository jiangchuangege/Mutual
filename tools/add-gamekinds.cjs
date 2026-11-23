const fs = require('node:fs');

// ---------- 1) core/gameKind.ts：怎么"跑"一段粘贴进来的东西 ----------
fs.writeFileSync(
  'C:/ts/src/core/gameKind.ts',
  `import type { GameSpec } from './types';

/**
 * 粘贴进来的东西到底是哪一类，决定"怎么跑"。
 *
 * 用户的要求：\`不止有 HTML……如果是手机的直接用手机打开而非 html；
 * 如果是 html 则 html 就能打开……大型点的类似王者荣耀肯定会卡死\`。
 *
 * 于是分三类：
 *  - html   → 沙箱 WebView 里跑（内置桥 TwGame 可以联机）；
 *  - link   → 交给手机系统打开（浏览器 / 应用商店 / 已装的 App），App 不掺和；
 *  - source → 是原生/引擎源码（Java/Kotlin/Swift/C#/RN…），手机里跑不了，
 *             只能存着 + 复制出来，在自己电脑上打包成 APK 再装。
 */
export type GameKind = 'html' | 'link' | 'source';

export function detectGameKind(text: string): GameKind {
  const raw = String(text ?? '');
  const s = raw.trim();
  if (!s) return 'source';
  // 一眼是网页：DOCTYPE / <html / 常见容器标签 / 内联脚本
  if (
    /^<!doctype\\s+html/i.test(s) ||
    /<html[\\s>]/i.test(s) ||
    /<(canvas|body|script|div|svg|iframe)[\\s>]/i.test(s)
  ) {
    return 'html';
  }
  // 单个链接：交给系统打开（浏览器 / 商店 / 已装 App）
  if (/^(https?:\\/\\/|intent:\\/\\/|market:\\/\\/|snssdk\\d+:\\/\\/)\\S+$/i.test(s) && !/\\s/.test(s)) {
    return 'link';
  }
  return 'source';
}

/** 给粘贴者看的一句话说明 */
export function describeKind(kind: GameKind): string {
  if (kind === 'html') return 'HTML 游戏：在 App 里直接打开（可联机）';
  if (kind === 'link') return '链接：交给手机系统打开（商店 / 浏览器 / 已装的 App）';
  return '源码：手机里跑不了，会存进库里，可以复制出来到电脑上打包';
}

/** 卡片的角标 */
export function kindBadge(kind: GameKind): string {
  if (kind === 'html') return 'HTML';
  if (kind === 'link') return '链接';
  return '源码';
}

/** 这个游戏能不能在 App 里"一起玩"（只有 HTML 有桥接） */
export function canPlayInline(spec: Pick<GameSpec, 'kind' | 'builtin'>): boolean {
  if (spec.builtin === 'voxel3d') return true;
  return (spec.kind ?? 'html') === 'html';
}
`,
  'utf8'
);

// ---------- 2) types：GameSpec 加 kind ----------
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
if (!t.includes("kind?: 'html' | 'link' | 'source';")) {
  t = t.replace(
    '  /** 玩家人数，1 或 2（我们只做 2 人联机） */',
    "  /** 怎么跑：html=WebView / link=交给手机打开 / source=源码跑不了（默认 html） */\n  kind?: 'html' | 'link' | 'source';\n  /** 玩家人数，1 或 2（我们只做 2 人联机） */"
  );
  fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');
}

// ---------- 3) hub.addGame 接受 kind ----------
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace(
  "  addGame(byRole: Role, input: { title: string; code: string; players?: 1 | 2 }): Result<GameSpec> {",
  "  addGame(\n    byRole: Role,\n    input: { title: string; code: string; players?: 1 | 2; kind?: 'html' | 'link' | 'source' },\n  ): Result<GameSpec> {"
);
h = h.replace(
  "    if (code.trim().length < 30) return fail('代码太短了，看起来不是完整的游戏');",
  "    if (code.trim().length < 8) return fail('内容太短了，看起来不是完整的游戏');"
);
h = h.replace(
  "      players: input.players === 1 ? 1 : 2,",
  "      players: input.players === 1 ? 1 : 2,\n      kind: input.kind ?? 'html',"
);
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');

// ---------- 4) store.addGame 透传 kind ----------
let st = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
if (st.includes('addGame(title: string, code: string)')) {
  st = st.replace(
    `  addGame(title: string, code: string): boolean {
    return this.handle(this.hub.addGame(this.role, { title, code }), '已加入游戏库');
  }`,
    `  addGame(title: string, code: string, kind: 'html' | 'link' | 'source' = 'html'): boolean {
    return this.handle(this.hub.addGame(this.role, { title, code, kind }), '已加入游戏库');
  }`
  );
  fs.writeFileSync('C:/ts/src/store.tsx', st, 'utf8');
}

console.log('core/hub/store ok');
