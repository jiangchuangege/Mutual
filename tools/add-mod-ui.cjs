const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) import 模板
if (!t.includes('MOD_TEMPLATE')) {
  t = t.replace(
    "import { canPlayInline, describeKind, detectGameKind, kindBadge } from '../core/gameKind';",
    "import { canPlayInline, describeKind, detectGameKind, kindBadge } from '../core/gameKind';\nimport { MOD_TEMPLATE } from '../core/voxelMod';"
  );
}

// 2) 状态
if (!t.includes('modOpen')) {
  t = t.replace(
    '  const [showSource, setShowSource] = useState<GameSpec | null>(null);',
    '  const [showSource, setShowSource] = useState<GameSpec | null>(null);\n  /** 粘贴模组 */\n  const [modOpen, setModOpen] = useState(false);\n  const [modCode, setModCode] = useState(MOD_TEMPLATE);'
  );
}

// 3) 页面顶部加"粘贴模组"入口（只在有 3D 沙盒时才有意义，但一直显示更好找）
if (!t.includes('＋ 粘贴模组')) {
  t = t.replace(
    '          <Btn title="＋ 粘贴代码生成游戏" onPress={() => setImportOpen(true)} />',
    `          <Btn title="＋ 粘贴代码生成游戏" onPress={() => setImportOpen(true)} />
          <View style={{ height: 8 }} />
          <Btn title="🧩 粘贴模组（直接生成到 3D 存档）" variant="ghost" onPress={() => setModOpen(true)} />`
  );
}

// 4) 模组弹层
if (!t.includes('粘贴模组 JSON')) {
  t = t.replace(
    /\n      \{\/\* 粘贴代码 \*\/\}/,
    `
      {/* 粘贴模组 JSON：直接写进 3D 世界存档 */}
      {modOpen ? (
        <View style={styles.modalRoot}>
          <Card style={{ maxHeight: '88%' }}>
            <Text style={font.bodyStrong}>粘贴模组 JSON</Text>
            <Text style={[font.tiny, { marginTop: 4, lineHeight: 17 }]}>
              形状支持 box / line / circle / heart / star / sphere / spiral / plaza；
              自定义方块 id 从 20 起，1-9 是内置的（6 爱心砖、7 玫瑰、8 暖灯、9 合影墙）。
              应用后直接写进存档，两人都能看到，下次打开还在。
            </Text>
            <View style={{ height: 8 }} />
            <TextInput
              value={modCode}
              onChangeText={setModCode}
              multiline
              style={[styles.input, { height: 220, textAlignVertical: 'top', fontSize: 11 }]}
            />
            <View style={{ height: 10 }} />
            <Btn
              title="生成到存档"
              onPress={() => {
                if (store.applyVoxelMod(modCode)) setModOpen(false);
              }}
            />
            <View style={{ height: 8 }} />
            <Btn title="恢复示例模板" small variant="ghost" onPress={() => setModCode(MOD_TEMPLATE)} />
            <View style={{ height: 6 }} />
            <Btn title="取消" variant="ghost" onPress={() => setModOpen(false)} />
          </Card>
        </View>
      ) : null}

      {/* 粘贴代码 */}`
  );
}

// 5) 模组列表展示（在库里空的提示下面）
if (!t.includes('已应用的模组')) {
  t = t.replace(
    '        {session ? (',
    `        {(snapshot.voxelMods ?? []).length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <Text style={[font.tiny, { color: color.inkSoft, marginBottom: 6 }]}>已应用的模组</Text>
            {(snapshot.voxelMods ?? []).map((m) => (
              <View key={m.id} style={[styles.input, { marginBottom: 6, flexDirection: 'row' }]}>
                <Text style={[font.tiny, { flex: 1 }]}>
                  {m.name}
                  {m.blocks.length ? \`（\${m.blocks.length} 种自定义方块）\` : ''}
                </Text>
                <Pressable onPress={() => store.removeVoxelMod(m.id)} hitSlop={8}>
                  <Text style={[font.tiny, { color: color.danger }]}>移除</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {session ? (`
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('games.tsx 模组入口:', {
  粘贴模组按钮: t.includes('粘贴模组（直接生成到 3D 存档）'),
  弹层: t.includes('生成到存档'),
  列表: t.includes('已应用的模组'),
});
