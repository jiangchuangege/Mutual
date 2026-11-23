const fs = require('node:fs');
const p = 'C:/ts/src/lib/cloudBuild.ts';
let t = fs.readFileSync(p, 'utf8');

// 1) 引入 intent launcher
if (!t.includes('expo-intent-launcher')) {
  t = t.replace(
    "import * as FileSystem from 'expo-file-system/legacy';",
    "import * as FileSystem from 'expo-file-system/legacy';\nimport * as IntentLauncher from 'expo-intent-launcher';"
  );
}

// 2) 安装：必须用显式 Intent + APK 的 MIME，Linking 打开 content:// 不会弹安装器
const oldBlock = `    // 用 content:// 交给系统安装器（Android 7+ 不许直接暴露 file://）
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await Linking.openURL(contentUri);
    return { ok: true, uri: contentUri };`;
const newBlock = `    // 用 content:// 交给系统安装器（Android 7+ 不许直接暴露 file://）。
    // 关键：必须显式指定 APK 的 MIME 类型 + 授权读权限，否则系统不知道要用安装器打开，
    // 表现就是"点了没反应"（用户实测）。
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
    return { ok: true, uri: contentUri };`;
if (!t.includes(oldBlock)) throw new Error('安装块没找到');
t = t.replace(oldBlock, newBlock);

// 3) 打开已安装的游戏：也用显式 Intent（package: 在 Android 11+ 常被拦）
const oldOpen = `export async function openInstalledGame(): Promise<boolean> {
  try {
    await Linking.openURL(\`package:\${GENERATED_PACKAGE}\`);
    return true;
  } catch {
    return false;
  }
}`;
const newOpen = `export async function openInstalledGame(): Promise<boolean> {
  // 先试显式 Intent（LAUNCHER），失败再退回 package: scheme
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
      category: 'android.intent.category.LAUNCHER',
      packageName: GENERATED_PACKAGE,
    });
    return true;
  } catch {
    try {
      await Linking.openURL(\`package:\${GENERATED_PACKAGE}\`);
      return true;
    } catch {
      return false;
    }
  }
}`;
if (!t.includes(oldOpen)) throw new Error('打开块没找到');
t = t.replace(oldOpen, newOpen);

fs.writeFileSync(p, t, 'utf8');
console.log('安装/打开改为显式 Intent:', {
  MIME: t.includes('application/vnd.android.package-archive'),
  IntentLauncher: t.includes('IntentLauncher.startActivityAsync'),
});
