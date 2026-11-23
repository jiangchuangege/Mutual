const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) import
if (!t.includes('buildRuntimeHtml')) {
  t = t.replace(
    "import { MOD_TEMPLATE } from '../core/voxelMod';",
    "import { MOD_TEMPLATE } from '../core/voxelMod';\nimport { AI_PROMPT, buildRuntimeHtml, needsNetwork } from '../core/gameRuntime';"
  );
}

// 2) 渲染：非体素的 HTML 游戏统一走运行时（自动拼页面 + 注入兼容层）
t = t.replace(
  "        source={{ html: game.builtin === 'voxel3d' ? buildVoxelHtml() : game.code }}",
  "        source={{\n          html:\n            game.builtin === 'voxel3d'\n              ? buildVoxelHtml()\n              : buildRuntimeHtml(game.code),\n        }}"
);

// 3) 联网策略：检测到 CDN/网络请求就放开白名单，否则保持离线沙箱
t = t.replace(
  "        originWhitelist={['about:blank', 'data:*']}",
  "        originWhitelist={\n          game.builtin === 'voxel3d' || !needsNetwork(game.code)\n            ? ['about:blank', 'data:*']\n            : ['*']\n        }\n        mixedContentMode=\"compatibility\""
);

// 4) 粘贴面板：加"复制 AI 指令模板"
if (!t.includes('复制给 AI 的指令')) {
  t = t.replace(
    '            <Text style={font.bodyStrong}>粘贴游戏代码</Text>',
    '            <Text style={font.bodyStrong}>粘贴游戏代码</Text>\n            <Text style={[font.tiny, { marginTop: 6, color: color.inkSoft, lineHeight: 17 }]}>\n              {`框架会自动把这些都跑起来：完整 HTML、只有一段 JS/HTML 片段、需要 CDN 的 3D 游戏。\n联机接口是 TwGame.send(状态) / window.onRemoteState(状态)。`}\n            </Text>'
  );
  // 在"生成并加入游戏库"按钮下面加复制模板
  t = t.replace(
    `            <View style={{ height: 8 }} />
            <Btn title="取消" variant="ghost" onPress={() => setImportOpen(false)} />`,
    `            <View style={{ height: 8 }} />
            <Btn
              title="📋 复制给 AI 的指令模板"
              small
              variant="ghost"
              onPress={() => {
                void Clipboard.setStringAsync(AI_PROMPT)
                  .then(() => toast.show('已复制：去问 AI 要游戏代码吧'))
                  .catch(() => toast.show('复制失败，长按输入框手动粘贴'));
                setCode(AI_PROMPT);
              }}
            />
            <View style={{ height: 8 }} />
            <Btn title="取消" variant="ghost" onPress={() => setImportOpen(false)} />`
  );
}

// 5) Clipboard import
if (!t.includes('expo-clipboard')) {
  t = t.replace(
    "import { StatusBar } from 'expo-status-bar';",
    "import { StatusBar } from 'expo-status-bar';\nimport * as Clipboard from 'expo-clipboard';"
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('运行时接入:', {
  统一入口: t.includes('buildRuntimeHtml(game.code)'),
  联网判定: t.includes('needsNetwork(game.code)'),
  指令模板: t.includes('复制给 AI 的指令模板'),
});
