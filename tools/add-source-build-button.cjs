const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 源码弹窗：如果像 Java（有 class ... extends Activity），直接给云编译按钮
const anchor = `            <Btn title="关闭" variant="ghost" onPress={() => setShowSource(null)} />`;
if (!t.includes('看起来是 Java')) {
  t = t.replace(
    anchor,
    `            {/\\bclass\\s+\\w+\\s+extends\\s+[\\w.]*Activity\\b/.test(showSource.code) ? (
              <>
                <Text style={[font.tiny, { marginTop: 8, color: color.primaryInk, lineHeight: 17 }]}>
                  看起来是 Java（有 class ... extends Activity）：可以直接云编译成原生 APK，
                  不用复制回电脑。
                </Text>
                <View style={{ height: 8 }} />
                <Btn
                  title="🛠 直接云编译成原生 APK"
                  onPress={() => {
                    const spec = showSource;
                    setShowSource(null);
                    void store.compileNativeGame(spec.title, spec.code);
                  }}
                />
                <View style={{ height: 8 }} />
              </>
            ) : null}
${anchor}`
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log('已加"源码弹窗内云编译"按钮');
} else {
  console.log('已存在');
}
