const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) StatusBar 隐藏状态栏
if (!t.includes("from 'expo-status-bar'")) {
  t = t.replace(
    "import * as ScreenOrientation from 'expo-screen-orientation';",
    "import * as ScreenOrientation from 'expo-screen-orientation';\nimport { StatusBar } from 'expo-status-bar';"
  );
}

// 2) 把 playing 分支整体换成沉浸式全屏（不要顶部那条"返回/霓虹乒乓/竖屏/结束这局"）
const start = t.indexOf('  if (playing) {');
const end = t.indexOf('  return (\n    <View style={styles.root}>');
if (start < 0 || end < 0) throw new Error('playing 分支定位失败');

const immersive = `  if (playing) {
    /**
     * 沉浸式全屏。
     *
     * 用户反馈：「要全屏不要出现上面那个」——之前游戏上方还留着我自己的标题栏
     * （返回 / 游戏名 / 竖屏 / 结束这局），横屏玩起来很挤。
     * 现在游戏铺满整块屏幕、连状态栏都隐藏，只留几个半透明的悬浮按钮。
     */
    return (
      <View style={styles.immersiveRoot}>
        <StatusBar hidden />
        <GamePlayer
          game={playing}
          width={width}
          availableHeight={height}
          stateText={session?.gameId === playing.id ? session.state : ''}
          seq={session?.gameId === playing.id ? session.seq : 0}
          onState={(state) => {
            let turn = session?.turn ?? 0;
            try {
              const parsed = JSON.parse(state) as { turn?: number };
              if (typeof parsed.turn === 'number') turn = Math.max(0, Math.min(1, parsed.turn));
            } catch {
              // 局面不是 JSON 就沿用服务端的回合
            }
            store.pushGameState(state, turn);
          }}
        />
        {/* 悬浮控制：半透明，不挡游戏 */}
        <View
          style={[
            styles.floatBar,
            { top: Math.max(insets.top, 8) + 6, left: Math.max(insets.left, 0) + 10 },
          ]}
        >
          <Pressable
            onPress={() => {
              lockLandscape(false);
              setPlaying(null);
            }}
            style={styles.floatBtn}
          >
            <Text style={styles.floatText}>✕ 退出</Text>
          </Pressable>
          <Pressable onPress={() => lockLandscape(!landscape)} style={styles.floatBtn}>
            <Text style={styles.floatText}>{landscape ? '竖屏' : '横屏'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              lockLandscape(false);
              store.endGame();
              setPlaying(null);
            }}
            style={styles.floatBtn}
          >
            <Text style={styles.floatText}>结束这局</Text>
          </Pressable>
        </View>
      </View>
    );
  }

`;

t = t.slice(0, start) + immersive + t.slice(end);

// 3) 样式
if (!t.includes('immersiveRoot:')) {
  t = t.replace(
    'const styles = StyleSheet.create({',
    `const styles = StyleSheet.create({
  immersiveRoot: { flex: 1, backgroundColor: '#000000' },
  floatBar: { position: 'absolute', flexDirection: 'row', gap: 8, opacity: 0.82 },
  floatBtn: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.pill ?? 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  floatText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },`
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('沉浸式全屏:', {
  状态栏隐藏: t.includes('<StatusBar hidden />'),
  悬浮按钮: t.includes('floatBar'),
  标题栏已移除: !t.includes("title={landscape ? '竖屏' : '横屏'}"),
});
