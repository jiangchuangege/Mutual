/**
 * 通用游戏运行框架（Game Runtime）。
 *
 * 用户要的形态：**不手搓具体游戏**，只把"容器 + 接口"做出来，
 * 以后任何 AI 生成的、手机能跑的游戏代码，粘进来就跑；需要时就一点点适配。
 *
 * 这一层干三件事：
 *  1. **归一化**：粘进来的是完整 HTML、还是只有一段 JS/CSS 片段，都能拼成能跑的页面；
 *  2. **兼容层（shim）**：不管 AI 怎么写，都给它补上 `TwGame` 桥（send/apply），
 *     并尽量自动接上它已有的写法（postMessage / window.onState / 全局 GAME_STATE）；
 *  3. **联网判定**：AI 写的游戏常用 CDN（three/phaser/unpkg…），检测到就允许联网，
 *     否则维持"完全离线"的最安全策略。
 */

import { injectNetShim, type NetOptions } from './gameNet';

export interface RuntimeOptions {
  /** 是否允许这个游戏联网（检测到 CDN 依赖时自动打开） */
  allowNetwork?: boolean;
}

/** 常见 CDN / 需要联网的特征 */
const NET_HINTS = [
  /https?:\/\/[^\s"'`]*cdn[^\s"'`]*/i,
  /unpkg\.com/i,
  /jsdelivr\.net/i,
  /cdnjs\.cloudflare\.com/i,
  /three(\.min)?\.js/i,
  /phaser/i,
  /babylon/i,
  /pixi/i,
  /socket\.io/i,
  /firebase/i,
  /supabase/i,
  /fetch\(/i,
  /XMLHttpRequest/i,
  /WebSocket/i,
];

export function needsNetwork(code: string): boolean {
  const s = String(code ?? '');
  return NET_HINTS.some((re) => re.test(s));
}

/** 是不是一段完整的 HTML 文档 */
export function isFullHtml(code: string): boolean {
  const s = String(code ?? '').trim();
  return /^<!doctype\s+html/i.test(s) || /<html[\s>]/i.test(s);
}

/**
 * 兼容层：注入到每个游戏的末尾。
 *
 * 约定的桥梁（也是给 AI 的契约）：
 *   - 页面里局面变了  → TwGame.send(jsonString)
 *   - 收到对方的局面 → TwGame.apply(jsonString)（App 会主动调用）
 * 同时还兜底几种常见写法，尽量不改 AI 的代码：
 *   - 它自己 postMessage('TW_STATE:...')  → 直接转发
 *   - 它定义了 window.onRemoteState(json)   → 帮它调
 *   - 它把局面放在 window.GAME_STATE 里     → 定时快照上报（低频，避免刷屏）
 */
/** 兼容层源码（按网址加载的游戏需要单独注入） */
export function buildRuntimeShim(): string {
  return SHIM;
}
const SHIM = `
(function(){
  if (window.__TW_RUNTIME__) return;
  window.__TW_RUNTIME__ = true;
  var RN = window.ReactNativeWebView;
  var lastSent = '';
  function post(text){
    if (!RN || !RN.postMessage) return;
    try { RN.postMessage('TW_STATE:' + text); } catch (e) {}
  }
  var api = {
    /* 页面 → App */
    send: function(state){
      var text = typeof state === 'string' ? state : JSON.stringify(state);
      if (!text || text === lastSent) return;
      lastSent = text;
      post(text);
    },
    /* App → 页面（App 会直接调用 TwGame.apply）；真正的实现见下面 after assign */
    apply: function(state){
      try {
        if (typeof window.onRemoteState === 'function') window.onRemoteState(state);
        window.dispatchEvent(new CustomEvent('twgame-state', { detail: state }));
      } catch (e) {}
    },
    /* 页面可以问"我是不是在 App 里" */
    host: function(){ return RN ? 'app' : 'web'; }
  };
  /*
   * 内置样例（井字棋/沙盒/农场）都在自己的 <script> 里定义了 TwGame.apply，
   * 而本兼容层是注入到 </body> 前（后执行）—— 以前直接 window.TwGame = api
   * 把游戏的实现整个覆盖掉，App 下发对方局面时只找 window.onRemoteState
   * （样例都没有），于是"对方的落子永远收不到，两台手机各玩各的"。
   * 现在先接住原实现，再串起来。
   */
  var prevTwGame = window.TwGame;
  if (prevTwGame && typeof prevTwGame.apply === 'function') {
    (function (prev) {
      api.apply = function(state){
        try { prev.apply(state); } catch (e) {}
        try {
          if (typeof window.onRemoteState === 'function') window.onRemoteState(state);
          window.dispatchEvent(new CustomEvent('twgame-state', { detail: state }));
        } catch (e) {}
      };
    })(prevTwGame);
  }
  window.TwGame = api;

  /* 兼容 1：游戏自己用 postMessage 发消息（很多 AI 代码这么写） */
  var rawPost = RN && RN.postMessage ? RN.postMessage.bind(RN) : null;
  if (RN && rawPost) {
    RN.postMessage = function(data){
      /*
       * 只把"看起来像局面数据"的字符串包上 TW_STATE:，其余原样转发。
       * 以前是无条件包装，于是触屏层发的 TW_ORIENT:portrait 被变成
       * TW_STATE:TW_ORIENT:portrait —— 原生侧既认不出方向消息（自动横竖屏失效），
       * 又把这段非 JSON 当成局面同步给对方，双方这一局直接坏掉。
       */
      if (typeof data === 'string' && data.indexOf('TW_STATE:') !== 0) {
        var looksLikeState = /^\s*[\[{]/.test(data);
        if (looksLikeState) {
          lastSent = data;
          return rawPost('TW_STATE:' + data);
        }
        return rawPost(data);
      }
      return rawPost(data);
    };
  }

  /* 兼容 2：游戏把局面放在全局 GAME_STATE / 暴露 getState()，低频自动快照 */
  var tick = 0;
  setInterval(function(){
    tick += 1;
    if (tick % 4 !== 0) return;               // 约 2 秒一次，别刷屏
    try {
      if (typeof window.getGameState === 'function') return api.send(window.getGameState());
      if (window.GAME_STATE) return api.send(window.GAME_STATE);
    } catch (e) {}
  }, 500);

  /* 兼容 3：有些代码只监听 window 的 message 事件 */
  window.addEventListener('message', function(e){
    if (e && typeof e.data === 'string') api.apply(e.data);
  });
})();
`;

/**
 * 把粘进来的东西拼成一个能跑的页面：
 *  - 完整 HTML → 只在 </body> 前插入兼容层；
 *  - 片段（只有 <script>/<canvas>/CSS/JS）→ 用最小骨架包起来。
 */
export function buildRuntimeHtml(code: string, net?: NetOptions): string {
  const raw = String(code ?? '');
  const shimTag = `<script>${SHIM}</script>`;
  if (isFullHtml(raw)) {
    const page = /<\/body>/i.test(raw) ? raw.replace(/<\/body>/i, `${shimTag}</body>`) : `${raw}\n${shimTag}`;
    return net ? injectNetShim(page, net) : page;
  }
  // 片段：交给浏览器自己解析（HTML 片段 + JS 都能进去）
  const page = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;touch-action:none}
canvas{display:block}</style></head>
<body>
${raw}
${shimTag}
</body></html>`;
  return net ? injectNetShim(page, net) : page;
}

/** 给 AI 的指令模板：用户复制这句去问 AI，粘回来的代码就能直接跑 */
export const AI_PROMPT = `请写一个"单文件 HTML 手机小游戏"，要求：
1. 只用 HTML + CSS + 原生 JS（不要 npm、不要构建步骤），整段代码放在一个文件里；
2. 用 <canvas> 或 DOM 画界面，适配手机竖屏和横屏（用 window.innerWidth/innerHeight 自适应，不要固定 px）；
3. 操作只用手势或屏幕按钮，不用键盘；
4. 画面用深色背景 + 亮色元素，字号不小于 14px；
5. 如果需要 3D / 物理，可以用 CDN 引入 three.js / matter.js（允许联网）；
6. 联机接口（重要）：
   - 游戏状态变化时调用：TwGame.send(JSON.stringify(状态))；
   - 需要接收对方状态时，实现：window.onRemoteState = function(json){ 用 JSON.parse(json) 恢复局面并重绘 }
   - 状态要尽量小（只放棋盘/分数/位置这类必要数据，不要放整个地图）；
   - 双人轮流操作的游戏，状态里必须包含 turn（0 或 1）；
7. 不要使用 alert/confirm/prompt，不要自动播放带声音的媒体；
8. 代码里写清注释，最后把完整代码一次性给我。

如果做不到第 6 条，就说明是单机游戏（不写 TwGame 调用即可）。`;


/**
 * 分层粘贴：把 HTML 结构 / CSS / JS 分开粘，合成一个能跑的单文件页面。
 *
 * 用户要的："我可以分好几层去复制粘贴"——AI 常把代码拆成三段给（结构/样式/脚本），
 * 或者你只想改其中一层。这里负责拼装，并且：
 *  - 自动剥掉 AI 喜欢带的 \`\`\`html / \`\`\`css / \`\`\`js 代码块围栏；
 *  - 如果 JS 里已经整段是 HTML 文档（含 <!doctype>），直接用 JS 那层当整页；
 *  - 缺哪层就自动补空壳，保证最终一定是完整文档。
 */
export interface CodeLayers {
  html?: string;
  css?: string;
  js?: string;
}

/** 去掉 markdown 代码围栏 */
export function stripFence(text: string): string {
  const s = String(text ?? '').trim();
  const m = /^\`\`\`[a-zA-Z]*\s*\n([\s\S]*?)\n?\`\`\`$/.exec(s);
  return (m ? m[1] : s).trim();
}

export function assembleLayers(layers: CodeLayers): string {
  const htmlRaw = stripFence(layers.html ?? '');
  const css = stripFence(layers.css ?? '');
  const js = stripFence(layers.js ?? '');

  // JS 层本身就是整页 → 直接用，别套壳
  if (isFullHtml(js)) return buildRuntimeHtml(js);

  const body = htmlRaw || '<canvas id="c"></canvas>';
  const page = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#0d1117;color:#e6edf3;
  font-family:-apple-system,system-ui,sans-serif;touch-action:none}
canvas{display:block}
${css}
</style></head>
<body>
${body}
<script>
${js}
</script>
</body></html>`;
  return buildRuntimeHtml(page);
}
