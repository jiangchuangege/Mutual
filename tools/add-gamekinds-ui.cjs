const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) imports
if (!t.includes("from 'react-native'")) throw new Error('找不到 react-native import');
if (!t.includes('Linking')) {
  t = t.replace(/import \{([\s\S]*?)\} from 'react-native';/, (m, inner) => {
    const parts = inner.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.includes('Linking')) parts.push('Linking');
    return `import { ${parts.join(', ')} } from 'react-native';`;
  });
}
if (!t.includes("from '../core/gameKind'")) {
  t = t.replace(
    "import { buildVoxelHtml } from '../core/gameVoxel';",
    "import { buildVoxelHtml } from '../core/gameVoxel';\nimport { canPlayInline, describeKind, detectGameKind, kindBadge } from '../core/gameKind';"
  );
}

// 2) 导入时的类型判断 + 说明
t = t.replace(
  `              onPress={() => {
                store.addGame(title, code);
                setImportOpen(false);
                setTitle('');
                setCode('');`,
  `              onPress={() => {
                const kind = detectGameKind(code);
                if (kind === 'source') {
                  // 原生/引擎源码：手机里跑不了，先说明再存
                  toast.show('这不是 HTML，也不是链接：会当"源码"存进库（可以复制出来到电脑上打包），App 里不能直接跑');
                }
                store.addGame(title, code, kind);
                setImportOpen(false);
                setTitle('');
                setCode('');`
);

// 3) 卡片角标 + 点击分流
t = t.replace(
  `              <Text style={styles.tileMeta}>
                {snapshot.gameSession?.gameId === g.id ? '进行中' : g.builtin ? '内置样例' : '一起玩'}
              </Text>`,
  `              <Text style={styles.tileMeta}>
                {g.builtin ? (g.builtin === 'voxel3d' ? '3D 内置' : '内置样例') : kindBadge(g.kind ?? 'html')}
                {snapshot.gameSession?.gameId === g.id ? ' · 进行中' : ''}
              </Text>`
);

// 4) 点卡片：html → 内嵌玩；link → 交系统；source → 只给看/复制
t = t.replace(
  `              onPress={() => {
                if (snapshot.gameSession?.gameId === g.id) {
                  setPlaying(g);
                  lockLandscape(true);
                  return;
                }
                store.startGame(g.id);
                setPlaying(g);
                lockLandscape(true);
              }}`,
  `              onPress={() => {
                const kind = g.builtin === 'voxel3d' ? 'html' : (g.kind ?? 'html');
                if (kind === 'link') {
                  // 链接类（商店 / 网页 / 已装 App）：交给手机自己打开，别塞进 WebView
                  const url = g.code.trim();
                  void Linking.openURL(url).catch(() => toast.show('系统打不开这个链接'));
                  return;
                }
                if (kind === 'source') {
                  setShowSource(g);
                  return;
                }
                if (!canPlayInline(g)) return;
                if (snapshot.gameSession?.gameId === g.id) {
                  setPlaying(g);
                  lockLandscape(true);
                  return;
                }
                store.startGame(g.id);
                setPlaying(g);
                lockLandscape(true);
              }}`
);

// 5) 源码查看弹层（只给复制，不假装能跑）
if (!t.includes('showSource')) {
  t = t.replace(
    '  const [playing, setPlaying] = useState<GameSpec | null>(null);',
    '  const [playing, setPlaying] = useState<GameSpec | null>(null);\n  /** 源码类：只给看和复制，手机上跑不了 */\n  const [showSource, setShowSource] = useState<GameSpec | null>(null);'
  );
  const modal = `
      {/* 源码类：只能看/复制，明确告诉用户手机上跑不了 */}
      {showSource ? (
        <View style={styles.modalRoot}>
          <Card style={{ maxHeight: '86%' }}>
            <Text style={font.bodyStrong}>{showSource.title}</Text>
            <Text style={[font.tiny, { marginTop: 4, lineHeight: 17 }]}>
              这是原生/引擎源码（不是 HTML）。手机里不能直接跑，也不适合塞进 WebView ——
              大型游戏在 WebView 里会卡死。请复制回电脑，用对应工具打包成 APK 再安装。
            </Text>
            <View style={{ height: 10 }} />
            <View style={[styles.input, { height: 180 }]}>
              <ScrollView>
                <Text style={[font.tiny, { color: color.inkSoft }]}>{showSource.code.slice(0, 4000)}</Text>
              </ScrollView>
            </View>
            <View style={{ height: 12 }} />
            <Btn title="关闭" variant="ghost" onPress={() => setShowSource(null)} />
          </Card>
        </View>
      ) : null}
`;
  t = t.replace(/\n      \{\/\* 粘贴代码 \*\/\}/, modal + '\n      {/* 粘贴代码 */}');
}

// 6) 粘贴说明补上"三类输入"
t = t.replace(
  '              直接贴整段 HTML（包含 &lt;script&gt;）。要求：不联网、不跳转，用 canvas 画界面。',
  '              HTML 直接贴（App 里打开、可联机）；应用商店/网页链接也行（交给手机打开）；' +
    '其它源码（Java/Kotlin/C#…）会当源码存着，手机里跑不了。'
);

fs.writeFileSync(p, t, 'utf8');
console.log('games.tsx kind 分流:', {
  Linking: t.includes('Linking.openURL'),
  sourceSheet: t.includes('showSource'),
  badge: t.includes('kindBadge'),
});
