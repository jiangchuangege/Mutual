const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) imports
if (!t.includes('compileNativeGame')) {
  t = t.replace(
    "import { ensureLocalGame } from '../lib/gameCache';",
    "import { ensureLocalGame } from '../lib/gameCache';\nimport { installApk, openInstalledGame } from '../lib/cloudBuild';"
  );
}

// 2) 粘贴面板：加"云编译成原生 APK"
if (!t.includes('云编译成原生')) {
  t = t.replace(
    `            <View style={{ height: 8 }} />
            <Btn
              title="📋 复制给 AI 的指令模板"`,
    `            <View style={{ height: 8 }} />
            <Btn
              title="🛠 云编译成原生 APK（Java 源码用这个）"
              variant="soft"
              onPress={() => {
                void store.compileNativeGame(title || 'Mutual 小游戏', code).then((ok) => {
                  if (!ok) return;
                  setImportOpen(false);
                  setTitle('');
                  setCode('');
                });
              }}
            />
            <View style={{ height: 8 }} />
            <Btn
              title="📋 复制给 AI 的指令模板"`
  );
}

// 3) 点卡片：native → 下载安装 / 打开
if (!t.includes('installApk(')) {
  t = t.replace(
    `                const isVoxel = g.builtin === 'voxel3d';`,
    `                if ((g.kind as string) === 'native') {
                  // 原生游戏：下载 APK 交给系统安装；已经装过就直接打开
                  if (await openInstalledGame()) return;
                  const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                  if (!res.ok) toast.show(\`安装失败：\${res.error ?? '未知错误'}\`);
                  return;
                }
                const isVoxel = g.builtin === 'voxel3d';`
  );
}

// 4) 卡片角标显示"原生"，并给安装/打开两个按钮
t = t.replace(
  `                    : g.assetPath
                      ? '文件'
                      : kindBadge(g.kind ?? 'html')}`,
  `                    : (g.kind as string) === 'native'
                      ? '原生 · 点卡片安装'
                      : g.assetPath
                        ? '文件'
                        : kindBadge(g.kind ?? 'html')}`
);

fs.writeFileSync(p, t, 'utf8');
console.log('UI 接线:', {
  云编译按钮: t.includes('云编译成原生 APK'),
  安装: t.includes('installApk('),
  角标: t.includes('原生 · 点卡片安装'),
});
