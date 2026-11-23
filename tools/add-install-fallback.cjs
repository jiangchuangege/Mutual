const fs = require('node:fs');

// ---------- 1) cloudBuild.ts：存到持久目录；Intent 失败返回可读原因 ----------
const p1 = 'C:/ts/src/lib/cloudBuild.ts';
let t = fs.readFileSync(p1, 'utf8');

t = t.replace(
  "  const dir = `${FileSystem.cacheDirectory ?? ''}apk/`;",
  "  // 用 documentDirectory（持久目录）而不是 cache：被系统清缓存后还能重装\n  const dir = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}apk/`;"
);

// 新增：只下载不安装（给兜底路径用）
if (!t.includes('downloadApkOnly')) {
  t = t.replace(
    'export async function installApk(',
    `/** 只把 APK 下载到手机本地，返回本地路径（不调安装器） */
export async function downloadApkOnly(
  server: string,
  assetPath: string,
): Promise<{ ok: boolean; uri?: string; error?: string }> {
  const dir = \`\${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}apk/\`;
  const name = String(assetPath ?? '').split('/').pop() || 'game.apk';
  const target = \`\${dir}\${name.replace(/[^A-Za-z0-9._-]/g, '')}\`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const cached = await FileSystem.getInfoAsync(target);
    if (cached.exists) return { ok: true, uri: target };
    const res = await FileSystem.downloadAsync(\`\${baseOf(server)}\${assetPath}\`, target);
    if (res.status !== 200) return { ok: false, error: \`下载失败（HTTP \${res.status}）\` };
    return { ok: true, uri: res.uri };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 把 APK 的下载地址直接交给系统浏览器（浏览器会自己下载，最兜底的一条路） */
export async function openApkInBrowser(server: string, assetPath: string): Promise<boolean> {
  try {
    await Linking.openURL(\`\${baseOf(server)}\${assetPath}\`);
    return true;
  } catch {
    return false;
  }
}

export async function installApk(`
  );
}
fs.writeFileSync(p1, t, 'utf8');
console.log('cloudBuild 兜底函数:', t.includes('downloadApkOnly'), t.includes('openApkInBrowser'));

// ---------- 2) games.tsx：点 native 卡片 → 可见进度 → Intent → 失败走兜底面板 ----------
const p2 = 'C:/ts/src/app/games.tsx';
let g = fs.readFileSync(p2, 'utf8');

g = g.replace(
  "import { installApk, openInstalledGame } from '../lib/cloudBuild';",
  "import { downloadApkOnly, installApk, openApkInBrowser, openInstalledGame } from '../lib/cloudBuild';"
);

const oldBlock = `                if ((g.kind as string) === 'native') {
                  // 原生游戏：已经装过就直接打开；没装过就下载 APK 交给系统安装器
                  void (async () => {
                    if (await openInstalledGame()) return;
                    const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                    if (!res.ok) toast.show(\`安装失败：\${res.error ?? '未知错误'}\`);
                  })();
                  return;
                }`;
const newBlock = `                if ((g.kind as string) === 'native') {
                  /**
                   * 原生游戏：装过就直接打开，没装过就装。
                   * 每一步都弹提示（以前失败了什么都不显示，看起来像"点不动"）。
                   * 系统 Intent 被 ROM 拦掉时，走"浏览器下载"这条兜底路。
                   */
                  void (async () => {
                    if (await openInstalledGame()) {
                      toast.show('已打开 ' + g.title);
                      return;
                    }
                    toast.show('正在下载 APK…（约几秒）');
                    const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                    if (res.ok) {
                      toast.show('已交给系统安装器，请在弹窗里点"安装"');
                      return;
                    }
                    // 兜底：先保存到本机，再让浏览器去下（任何 ROM 都能用）
                    const dl = await downloadApkOnly(store.gameBaseUrl, g.assetPath ?? '');
                    setInstallHelp({
                      title: g.title,
                      url: \`\${store.gameBaseUrl}\${g.assetPath ?? ''}\`,
                      savedTo: dl.ok ? dl.uri ?? null : null,
                      error: res.error ?? '系统没有弹出安装器',
                    });
                  })();
                  return;
                }`;
if (!g.includes(oldBlock)) throw new Error('native 分支没找到');
g = g.replace(oldBlock, newBlock);

// 新增状态 + 兜底面板
if (!g.includes('installHelp')) {
  g = g.replace(
    '  const [modOpen, setModOpen] = useState(false);',
    `  const [modOpen, setModOpen] = useState(false);
  /** 原生游戏装不上时的兜底提示（给下载地址 / 已保存路径） */
  const [installHelp, setInstallHelp] = useState<
    { title: string; url: string; savedTo: string | null; error: string } | null
  >(null);`
  );

  const panel = `
      {/* 原生游戏装不上：给出下载地址 + 已保存路径 */}
      {installHelp ? (
        <View style={styles.modalRoot}>
          <Card>
            <Text style={font.bodyStrong}>装不上「{installHelp.title}」</Text>
            <Text style={[font.tiny, { marginTop: 6, lineHeight: 17 }]}>
              这台手机的系统把"直接调安装器"拦住了（{installHelp.error}）。
              下面两种办法都能装上：
            </Text>
            <View style={{ height: 10 }} />
            <Text style={[font.tiny, { color: color.inkSoft }]}>① 用浏览器下载后点安装包：</Text>
            <Text style={[font.tiny, { color: color.primaryInk, marginTop: 4 }]} numberOfLines={2}>
              {installHelp.url}
            </Text>
            <View style={{ height: 8 }} />
            <Btn
              title="用浏览器打开这个地址"
              small
              onPress={() => {
                void openApkInBrowser(store.gameBaseUrl, installHelp.url.replace(store.gameBaseUrl, ''))
                  .then((ok) => {
                    if (!ok) toast.show('打不开浏览器，请手动复制上面的地址');
                  });
              }}
            />
            <View style={{ height: 12 }} />
            {installHelp.savedTo ? (
              <>
                <Text style={[font.tiny, { color: color.inkSoft }]}>② 已经保存到手机了，用文件管理器打开：</Text>
                <Text style={[font.tiny, { marginTop: 4 }]} numberOfLines={2}>
                  {installHelp.savedTo}
                </Text>
                <View style={{ height: 8 }} />
              </>
            ) : null}
            <Btn title="知道了" variant="ghost" onPress={() => setInstallHelp(null)} />
          </Card>
        </View>
      ) : null}
`;
  // 插在"源码面板"之前
  g = g.replace('\n      {/* 源码类：只能看/复制', panel + '\n      {/* 源码类：只能看/复制');
}

fs.writeFileSync(p2, g, 'utf8');
console.log('games.tsx 兜底面板:', g.includes('installHelp'), '| 浏览器兜底:', g.includes('openApkInBrowser'));
