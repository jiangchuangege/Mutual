const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) 状态：一行"诊断文字"，直接显示在游戏库顶部
if (!t.includes('debugLine')) {
  t = t.replace(
    "  const [installHelp, setInstallHelp] = useState<",
    `  /** 安装流程的实时诊断（每步都写一行，配合截图就能定位卡在哪） */
  const [debugLine, setDebugLine] = useState<string>('');
  const [installHelp, setInstallHelp] = useState<`
  );
}

// 2) native 分支：每一步写诊断，并且整体 try/catch
const oldBlock = `                  void (async () => {
                    if (await openInstalledGame()) {
                      toast.show('已打开 ' + g.title);
                      return;
                    }
                    toast.show('正在下载 APK…（约几秒）');
                    const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                    if (res.ok) {
                      toast.show('已交给系统安装器，请在弹窗里点"安装"');
                      return;
                    }`;
const newBlock = `                  void (async () => {
                    try {
                      setDebugLine(\`① 点击「\${g.title}」 kind=\${g.kind} path=\${g.assetPath ?? '空'}\`);
                      const opened = await openInstalledGame();
                      setDebugLine(\`② 尝试打开已安装：\${opened ? '成功' : '未安装'}\`);
                      if (opened) return;
                      toast.show('正在下载 APK…（约几秒）');
                      const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                      setDebugLine(
                        \`③ 安装器调用：\${res.ok ? '已弹出' : '失败'} \${res.error ?? ''}\`,
                      );
                      if (res.ok) {
                        toast.show('已交给系统安装器，请在弹窗里点"安装"');
                        return;
                      }`;
if (!t.includes(oldBlock)) throw new Error('native 分支（新）没找到');
t = t.replace(oldBlock, newBlock);

// 3) 收尾：兜底时写诊断 + 捕获异常
const oldTail = `                    const dl = await downloadApkOnly(store.gameBaseUrl, g.assetPath ?? '');
                    setInstallHelp({
                      title: g.title,
                      url: \`\${store.gameBaseUrl}\${g.assetPath ?? ''}\`,
                      savedTo: dl.ok ? dl.uri ?? null : null,
                      error: res.error ?? '系统没有弹出安装器',
                    });
                  })();`;
const newTail = `                      const dl = await downloadApkOnly(store.gameBaseUrl, g.assetPath ?? '');
                      setDebugLine(
                        \`④ 已下载到本地：\${dl.ok ? dl.uri : '失败 ' + (dl.error ?? '')}\`,
                      );
                      setInstallHelp({
                        title: g.title,
                        url: \`\${store.gameBaseUrl}\${g.assetPath ?? ''}\`,
                        savedTo: dl.ok ? dl.uri ?? null : null,
                        error: res.error ?? '系统没有弹出安装器',
                      });
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setDebugLine(\`✖ 异常：\${msg}\`);
                      toast.show(\`安装异常：\${msg}\`);
                    }
                  })();`;
if (!t.includes(oldTail)) throw new Error('native 收尾没找到');
t = t.replace(oldTail, newTail);

// 4) 页面顶部显示诊断行
if (!t.includes('{debugLine ? (')) {
  t = t.replace(
    `        <Card tone={color.surfaceAlt}>
          <Text style={font.bodyStrong}>粘贴 AI 写的游戏，一键进库</Text>`,
    `        {debugLine ? (
          <Card tone={color.butterSoft}>
            <Text style={[font.tiny, { color: color.careInk }]}>{debugLine}</Text>
          </Card>
        ) : null}
        <Card tone={color.surfaceAlt}>
          <Text style={font.bodyStrong}>粘贴 AI 写的游戏，一键进库</Text>`
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('已加诊断行:', t.includes('debugLine'), '| 步骤标记:', t.includes('① 点击'));
