const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) 干掉全屏时那排悬浮按钮（用户：非常影响游戏，都要去掉）
const start = t.indexOf('        {/* 悬浮控制：半透明，不挡游戏 */}');
const end = t.indexOf('      </View>\n    );\n  }\n\n  return (\n    <View style={styles.root}>');
if (start < 0) throw new Error('悬浮控制块没找到');
if (end < 0) throw new Error('悬浮控制块结尾没找到');
t = t.slice(0, start) + t.slice(end);

// 2) 硬件返回键 = 退出游戏（不用屏幕上再放按钮）
if (!t.includes('BackHandler')) {
  t = t.replace(/import \{\n  Dimensions,/, 'import {\n  BackHandler,');
  if (!t.includes('BackHandler')) {
    t = t.replace(/import \{([\s\S]*?)\} from 'react-native';/, (m, inner) => {
      const parts = inner.split(',').map((x) => x.trim()).filter(Boolean);
      if (!parts.includes('BackHandler')) parts.push('BackHandler');
      return `import { ${parts.join(', ')} } from 'react-native';`;
    });
  }
  // 在 playing 分支前插入副作用
  const anchor = '  if (playing) {';
  t = t.replace(
    anchor,
    `  // 全屏时屏幕上不放任何按钮（太挡游戏）；用手机的返回键退出
  useEffect(() => {
    if (!playing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      lockLandscape(false);
      setPlaying(null);
      return true;
    });
    return () => sub.remove();
  }, [playing]);

  if (playing) {`
  );
}

// 3) 把"结束这局 / 竖屏横屏"挪到游戏库页面（那里不挡游戏）
t = t.replace(
  `        {session ? (
          <Text style={[font.tiny, { marginTop: 12 }]}>
            当前这一局：{session.title} · 局面已同步 {session.seq} 次
          </Text>
        ) : null}`,
  `        {session ? (
          <View style={{ marginTop: 12 }}>
            <Text style={[font.tiny]}>
              当前这一局：{session.title} · 局面已同步 {session.seq} 次
            </Text>
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn
                title={landscape ? '下次竖屏玩' : '下次横屏玩'}
                small
                variant="ghost"
                onPress={() => lockLandscape(!landscape)}
              />
              <Btn
                title="结束这局"
                small
                variant="ghost"
                onPress={() => {
                  lockLandscape(false);
                  store.endGame();
                }}
              />
            </View>
          </View>
        ) : null}`
);

// 4) 进游戏时按库里的偏好决定方向（默认横屏）
t = t.replace('    setLandscape(on);', '    setLandscape(on);');

fs.writeFileSync(p, t, 'utf8');
console.log('去掉悬浮按钮:', {
  悬浮块已删: !t.includes('悬浮控制'),
  返回键退出: t.includes('hardwareBackPress'),
  库里有结束按钮: t.includes('结束这局'),
});
