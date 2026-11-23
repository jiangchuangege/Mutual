const fs = require('node:fs');

// ============ 1) core/gameRuntime.ts：分层粘贴合成器 ============
const p1 = 'C:/ts/src/core/gameRuntime.ts';
let rt = fs.readFileSync(p1, 'utf8');
if (!rt.includes('assembleLayers')) {
  rt += `

/**
 * 分层粘贴：把 HTML 结构 / CSS / JS 分开粘，合成一个能跑的单文件页面。
 *
 * 用户要的："我可以分好几层去复制粘贴"——AI 常把代码拆成三段给（结构/样式/脚本），
 * 或者你只想改其中一层。这里负责拼装，并且：
 *  - 自动剥掉 AI 喜欢带的 \\\`\\\`\\\`html / \\\`\\\`\\\`css / \\\`\\\`\\\`js 代码块围栏；
 *  - 如果 JS 里已经整段是 HTML 文档（含 <!doctype>），直接用 JS 那层当整页；
 *  - 缺哪层就自动补空壳，保证最终一定是完整文档。
 */
export interface CodeLayers {
  html?: string;
  css?: string;
  js?: string;
}

/** 去掉 markdown 代码围栏 */
export function stripFence(text: string): string {
  const s = String(text ?? '').trim();
  const m = /^\\\`\\\`\\\`[a-zA-Z]*\\s*\\n([\\s\\S]*?)\\n?\\\`\\\`\\\`$/.exec(s);
  return (m ? m[1] : s).trim();
}

export function assembleLayers(layers: CodeLayers): string {
  const htmlRaw = stripFence(layers.html ?? '');
  const css = stripFence(layers.css ?? '');
  const js = stripFence(layers.js ?? '');

  // JS 层本身就是整页 → 直接用，别套壳
  if (isFullHtml(js)) return buildRuntimeHtml(js);

  const body = htmlRaw || '<canvas id="c"></canvas>';
  const page = \`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#0d1117;color:#e6edf3;
  font-family:-apple-system,system-ui,sans-serif;touch-action:none}
canvas{display:block}
\${css}
</style></head>
<body>
\${body}
<script>
\${js}
</script>
</body></html>\`;
  return buildRuntimeHtml(page);
}
`;
  fs.writeFileSync(p1, rt, 'utf8');
}
console.log('assembleLayers 已加');

// ============ 2) games.tsx：分层粘贴 UI ============
const p2 = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p2, 'utf8');
if (!t.includes('分层粘贴')) {
  t = t.replace(
    "import { AI_PROMPT, buildRuntimeHtml, needsNetwork } from '../core/gameRuntime';",
    "import { AI_PROMPT, assembleLayers, buildRuntimeHtml, needsNetwork } from '../core/gameRuntime';"
  );
  // 状态：分层模式 + 三个层
  t = t.replace(
    '  const [modCode, setModCode] = useState(MOD_TEMPLATE);',
    `  const [modCode, setModCode] = useState(MOD_TEMPLATE);
  /** 分层粘贴：结构 / 样式 / 脚本分开贴，合成一个单文件页面 */
  const [layered, setLayered] = useState(false);
  const [layerHtml, setLayerHtml] = useState('');
  const [layerCss, setLayerCss] = useState('');
  const [layerJs, setLayerJs] = useState('');`
  );
  // 在"粘贴游戏代码"标题下加一个切换
  t = t.replace(
    `            <View style={{ height: 10 }} />
            <TextInput
              value={title}`,
    `            <View style={{ height: 8 }} />
            <Btn
              title={layered ? '← 回到一次性粘贴' : '🧱 分层粘贴（结构 / 样式 / 脚本分开贴）'}
              small
              variant="ghost"
              onPress={() => setLayered(!layered)}
            />
            <View style={{ height: 8 }} />
            {layered ? (
              <>
                <TextInput
                  value={layerHtml}
                  onChangeText={setLayerHtml}
                  placeholder="第一层：HTML 结构（<canvas> / <div> …）"
                  placeholderTextColor={color.inkFaint}
                  multiline
                  style={[styles.input, { height: 90, textAlignVertical: 'top', fontSize: 11 }]}
                />
                <View style={{ height: 6 }} />
                <TextInput
                  value={layerCss}
                  onChangeText={setLayerCss}
                  placeholder="第二层：CSS 样式"
                  placeholderTextColor={color.inkFaint}
                  multiline
                  style={[styles.input, { height: 80, textAlignVertical: 'top', fontSize: 11 }]}
                />
                <View style={{ height: 6 }} />
                <TextInput
                  value={layerJs}
                  onChangeText={setLayerJs}
                  placeholder="第三层：JS 逻辑（也放得下整页 HTML）"
                  placeholderTextColor={color.inkFaint}
                  multiline
                  style={[styles.input, { height: 140, textAlignVertical: 'top', fontSize: 11 }]}
                />
                <View style={{ height: 6 }} />
                <Btn
                  title="合成到下面的代码框"
                  small
                  onPress={() => {
                    setCode(assembleLayers({ html: layerHtml, css: layerCss, js: layerJs }));
                    toast.show('已合成：可以点"生成并加入游戏库"了');
                  }}
                />
                <View style={{ height: 8 }} />
              </>
            ) : null}
            <TextInput
              value={title}`
  );
  fs.writeFileSync(p2, t, 'utf8');
}
console.log('分层粘贴 UI:', fs.readFileSync(p2, 'utf8').includes('分层粘贴'));
