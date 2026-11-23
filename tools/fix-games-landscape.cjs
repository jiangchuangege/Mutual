const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) imports：屏幕方向 + 尺寸变化
if (!t.includes('expo-screen-orientation')) {
  t = t.replace(
    /import \{ useSafeAreaInsets \} from 'react-native-safe-area-context';/,
    "import * as ScreenOrientation from 'expo-screen-orientation';\nimport { useSafeAreaInsets } from 'react-native-safe-area-context';"
  );
}
t = t.replace(
  /  ScrollView,\n  StyleSheet,/,
  '  ScrollView,\n  StyleSheet,\n  useWindowDimensions,'
);

// 2) 屏幕尺寸用动态的（横竖屏切换要跟着变）
t = t.replace(
  '  const session = snapshot.gameSession;\n  const width = Dimensions.get(\'window\').width;',
  `  const session = snapshot.gameSession;
  // 横竖屏切换时要跟着重算，不能用一次性读到的 Dimensions
  const { width, height } = useWindowDimensions();
  const [landscape, setLandscape] = useState(false);

  /** 游戏大部分是横屏更好玩：进游戏自动横屏，退出时转回竖屏 */
  const lockLandscape = (on: boolean) => {
    setLandscape(on);
    void ScreenOrientation.lockAsync(
      on ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {
      // 有的设备不允许锁方向：不影响玩，只是不转
    });
  };`
);

// 3) 退出游戏时转回竖屏 + 顶部加横竖屏切换
t = t.replace(
  `          <Pressable onPress={() => setPlaying(null)} hitSlop={12} style={{ paddingRight: 10 }}>
            <Text style={styles.back}>‹ 返回</Text>
          </Pressable>`,
  `          <Pressable
            onPress={() => {
              lockLandscape(false);
              setPlaying(null);
            }}
            hitSlop={12}
            style={{ paddingRight: 10 }}
          >
            <Text style={styles.back}>‹ 返回</Text>
          </Pressable>`
);
t = t.replace(
  `          <Btn
            title="结束这局"
            small
            variant="ghost"
            onPress={() => {
              store.endGame();
              setPlaying(null);
            }}
          />`,
  `          <Btn
            title={landscape ? '竖屏' : '横屏'}
            small
            variant="ghost"
            onPress={() => lockLandscape(!landscape)}
          />
          <View style={{ width: 6 }} />
          <Btn
            title="结束这局"
            small
            variant="ghost"
            onPress={() => {
              lockLandscape(false);
              store.endGame();
              setPlaying(null);
            }}
          />`
);

// 4) 开局自动横屏
t = t.replace(
  `                store.startGame(g.id);
                setPlaying(g);`,
  `                store.startGame(g.id);
                setPlaying(g);
                lockLandscape(true);`
);
t = t.replace(
  `                if (snapshot.gameSession?.gameId === g.id) {
                  setPlaying(g);
                  return;
                }`,
  `                if (snapshot.gameSession?.gameId === g.id) {
                  setPlaying(g);
                  lockLandscape(true);
                  return;
                }`
);

// 5) GamePlayer 尺寸：横屏用宽做画布基准，高度按可用高度给
t = t.replace(
  `        <GamePlayer
          game={playing}
          width={width}`,
  `        <GamePlayer
          game={playing}
          width={width}
          availableHeight={height - insets.top - 60}`
);
t = t.replace(
  `function GamePlayer({
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
}) {`,
  `function GamePlayer({
  game,
  width,
  availableHeight,
  stateText,
  seq,
  onState,
}: {
  game: GameSpec;
  width: number;
  availableHeight: number;
  stateText: string;
  seq: number;
  onState: (state: string) => void;
}) {`
);
t = t.replace(
  '  const height = Math.round(width * 1.15);',
  '  // 竖屏时代原来是 width * 1.15；横屏时高度变小，不能把画面顶出屏幕\n  const height = Math.max(240, Math.min(availableHeight, width * 1.15));'
);

// Dimensions 不再使用就删掉 import 项
if (!/Dimensions\./.test(t)) {
  t = t.replace(/  Dimensions,\n/, '');
}

fs.writeFileSync(p, t, 'utf8');
console.log('横屏支持已加入:', {
  方向锁: t.includes('ScreenOrientation.lockAsync'),
  动态尺寸: t.includes('useWindowDimensions'),
  横屏按钮: t.includes("landscape ? '竖屏' : '横屏'"),
  高度自适应: t.includes('availableHeight'),
});
