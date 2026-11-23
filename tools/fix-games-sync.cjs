const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

const start = t.indexOf('function GamePlayer({');
const end = t.indexOf('const styles = StyleSheet.create({');
if (start < 0 || end < 0) throw new Error('找不到 GamePlayer 区块');

const player = `function GamePlayer({
  game,
  width,
  stateText,
  seq,
  onState,
}: {
  game: GameSpec;
  width: number;
  stateText: string;
  seq: number;
  onState: (state: string) => void;
}) {
  const webRef = useRef<WebView>(null);
  const height = Math.round(width * 1.15);
  /**
   * 正在应用"对方传来的局面"。
   *
   * 应用完后有些游戏会顺手再 send 一次（我们内置样例不会），
   * 那就会两端互相推来推去。所以在 apply 之后短暂屏蔽 600ms 的上报。
   */
  const applying = useRef(false);
  const lastSeq = useRef(0);

  const applyRemote = (text: string) => {
    if (!text) return;
    applying.current = true;
    const js =
      '(function(){try{var s=' +
      JSON.stringify(text) +
      ';if(window.TwGame&&window.TwGame.apply){window.TwGame.apply(s);}}catch(e){}})();true;';
    webRef.current?.injectJavaScript(js);
    setTimeout(() => {
      applying.current = false;
    }, 600);
  };

  // 关键：局面变了就把新局面 inject 进 WebView。
  // 以前只靠 injectedJavaScript（只在页面加载时执行一次），
  // 所以对方落子后我这边的 WebView 永远收不到 —— 表现就是"只能在我一个手机上操作"。
  useEffect(() => {
    if (seq === lastSeq.current) return;
    lastSeq.current = seq;
    applyRemote(stateText);
  }, [seq, stateText]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0E0C0B' }}>
      <WebView
        ref={webRef}
        // key 只跟游戏走：不要因为 seq 变化重建 WebView（重建会丢局面和动画）
        key={game.id}
        originWhitelist={['about:blank', 'data:*']}
        source={{ html: game.code }}
        style={{ flex: 1, height }}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        onLoadEnd={() => {
          // 中途加入对局：页面加载完先把当前局面灌进去
          if (stateText) applyRemote(stateText);
        }}
        onMessage={(event) => {
          const raw = event.nativeEvent.data;
          if (!raw) return;
          if (!raw.startsWith('TW_STATE:')) return;
          if (applying.current) return; // 是"应用对方局面"引起的回声，不要再广播
          onState(raw.slice('TW_STATE:'.length));
        }}
      />
    </View>
  );
}

`;

t = t.slice(0, start) + player + t.slice(end);

// 补 useRef / useEffect 的 import
if (!/import React, \{ useMemo, useState \};/.test(t)) {
  t = t.replace(/import React, \{[^}]*\} from 'react';/, "import React, { useEffect, useMemo, useRef, useState } from 'react';");
}
if (!t.includes('useEffect, useMemo, useRef, useState')) throw new Error('React import 未更新');

// 局面同步的 turn 从局面 JSON 里取（游戏自己知道轮到谁），取不到就沿用服务端的
t = t.replace(
  'onState={(state) => store.pushGameState(state, session?.turn ?? 0)}',
  `onState={(state) => {
            let turn = session?.turn ?? 0;
            try {
              const parsed = JSON.parse(state) as { turn?: number };
              if (typeof parsed.turn === 'number') turn = Math.max(0, Math.min(1, parsed.turn));
            } catch {
              // 局面不是 JSON 就沿用服务端的回合
            }
            store.pushGameState(state, turn);
          }}`
);
if (!t.includes('JSON.parse(state)')) throw new Error('onState 未更新');

fs.writeFileSync(p, t, 'utf8');
console.log('games.tsx 已更新：inject + 回声屏蔽 + 中途加入追局');
