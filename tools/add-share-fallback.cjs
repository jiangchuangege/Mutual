const fs = require('node:fs');
const p = 'C:/ts/src/lib/cloudBuild.ts';
let t = fs.readFileSync(p, 'utf8');

// 1) 引入 expo-sharing（已在依赖里，不需要新装）
if (!t.includes("from 'expo-sharing'")) {
  t = t.replace(
    "import * as IntentLauncher from 'expo-intent-launcher';",
    "import * as IntentLauncher from 'expo-intent-launcher';\nimport * as Sharing from 'expo-sharing';"
  );
}

// 2) Intent 全部失败后，改用系统分享面板（App 内完成，不用浏览器）
const oldTail = `    return {
      ok: false,
      error: \`系统安装器无法唤起（\${lastErr.slice(0, 80)}）。可能是"默认打开方式"被文件管理器占用，请在 设置 → 应用 → 文件管理器 → 默认打开 → 清除默认值\`,
    };`;
const newTail = `    /**
     * 兜底：系统分享面板。
     *
     * 有些 ROM（实测 ColorOS 系）的系统安装器根本没注册 ACTION_VIEW/INSTALL_PACKAGE，
     * 直接调永远是"选择要使用的应用"且列表里没有安装器。分享面板是系统级 UI，
     * 列的是"能接收 APK 的应用"，用户在里面点"文件管理/安装程序"就能装上 ——
     * 全程在 App 内完成，不需要去浏览器。
     */
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.android.package-archive',
          dialogTitle: '安装这个游戏',
          UTI: 'com.android.package-archive',
        });
        return { ok: true, uri, shared: true };
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    return {
      ok: false,
      error: \`系统安装器无法唤起（\${lastErr.slice(0, 80)}）。可以在这台手机的"设置 → 存储 → 下载"里找到刚下载的 APK 手动安装\`,
    };`;
if (!t.includes(oldTail)) throw new Error('兜底返回块没找到');
t = t.replace(oldTail, newTail);

// 3) 返回类型加 shared 字段
t = t.replace(
  '): Promise<{ ok: boolean; uri?: string; error?: string }> {\n  const dir = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? \'\'}apk/`;\n  const name = String(assetPath ?? \'\').split(\'/\').pop() || \'game.apk\';',
  '): Promise<{ ok: boolean; uri?: string; shared?: boolean; error?: string }> {\n  const dir = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? \'\'}apk/`;\n  const name = String(assetPath ?? \'\').split(\'/\').pop() || \'game.apk\';'
);

fs.writeFileSync(p, t, 'utf8');
console.log('分享面板兜底:', t.includes('Sharing.shareAsync'), '| shared 字段:', t.includes('shared?: boolean'));
