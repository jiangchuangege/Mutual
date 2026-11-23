const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) 粘贴面板：超过 300KB 自动走"上传文件"路线（体积不再受限）
t = t.replace(
  `              onPress={() => {
                const kind = detectGameKind(code);
                if (kind === 'source') {`,
  `              onPress={() => {
                // 体积大就上传成文件（只存地址），彻底绕开同步状态的大小限制
                if (code.length > 300_000) {
                  void store.importLargeGame(title || '大体积游戏', code).then((ok) => {
                    if (!ok) return;
                    setImportOpen(false);
                    setTitle('');
                    setCode('');
                  });
                  return;
                }
                const kind = detectGameKind(code);
                if (kind === 'source') {`
);

// 2) 卡片提示：大游戏标注"文件"
t = t.replace(
  `                {g.builtin === 'voxel3d'
                  ? \`3D · 存档 \${store.voxelEdits.length} 块\`
                  : g.builtin
                    ? '内置样例'
                    : kindBadge(g.kind ?? 'html')}`,
  `                {g.builtin === 'voxel3d'
                  ? \`3D · 存档 \${store.voxelEdits.length} 块\`
                  : g.builtin
                    ? '内置样例'
                    : g.assetPath
                      ? '文件'
                      : kindBadge(g.kind ?? 'html')}`
);

// 3) 渲染：有 assetPath 的按网址加载（并注入同一套兼容层）
t = t.replace(
  `        source={{
          html:
            game.builtin === 'voxel3d'
              ? buildVoxelHtml()
              : buildRuntimeHtml(game.code),
        }}`,
  `        source={
          game.assetPath
            ? { uri: \`\${(store.remoteServer || '').replace(/\\/+$/, '')}\${game.assetPath}\` }
            : {
                html:
                  game.builtin === 'voxel3d'
                    ? buildVoxelHtml()
                    : buildRuntimeHtml(game.code),
              }
        }`
);

// 4) 联网白名单：按网址加载的必然要放行
t = t.replace(
  `        originWhitelist={
          game.builtin === 'voxel3d' || !needsNetwork(game.code)
            ? ['about:blank', 'data:*']
            : ['*']
        }`,
  `        originWhitelist={
          game.assetPath || game.builtin === 'voxel3d' || !needsNetwork(game.code)
            ? ['*']
            : ['about:blank', 'data:*']
        }`
);

// 5) 大游戏也要有桥：加载后注入兼容层
if (!t.includes('injectedJavaScriptBeforeContentLoaded')) {
  t = t.replace(
    '        onLoadEnd={() => {',
    `        // 按网址加载的大游戏：页面一加载就把兼容层塞进去（html 路径已经内联注入过）
        injectedJavaScriptBeforeContentLoaded={
          game.assetPath ? buildRuntimeShim() : undefined
        }
        onLoadEnd={() => {`
  );
  t = t.replace(
    "import { AI_PROMPT, assembleLayers, buildRuntimeHtml, needsNetwork } from '../core/gameRuntime';",
    "import { AI_PROMPT, assembleLayers, buildRuntimeHtml, buildRuntimeShim, needsNetwork } from '../core/gameRuntime';"
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('大游戏接入:', {
  自动上传: t.includes('importLargeGame'),
  网址加载: t.includes('game.assetPath'),
  注入兼容层: t.includes('buildRuntimeShim'),
});
