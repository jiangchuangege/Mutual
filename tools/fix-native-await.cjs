const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// onPress 不是 async，包一层 void (async () => { ... })()
const oldBlock = `                if ((g.kind as string) === 'native') {
                  // 原生游戏：下载 APK 交给系统安装；已经装过就直接打开
                  if (await openInstalledGame()) return;
                  const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                  if (!res.ok) toast.show(\`安装失败：\${res.error ?? '未知错误'}\`);
                  return;
                }`;
const newBlock = `                if ((g.kind as string) === 'native') {
                  // 原生游戏：已经装过就直接打开；没装过就下载 APK 交给系统安装器
                  void (async () => {
                    if (await openInstalledGame()) return;
                    const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                    if (!res.ok) toast.show(\`安装失败：\${res.error ?? '未知错误'}\`);
                  })();
                  return;
                }`;
if (!t.includes(oldBlock)) throw new Error('没找到 native 分支原文');
t = t.replace(oldBlock, newBlock);
fs.writeFileSync(p, t, 'utf8');
console.log('已改成 async IIFE');
