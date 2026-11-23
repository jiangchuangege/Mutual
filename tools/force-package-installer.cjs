const fs = require('node:fs');
const p = 'C:/ts/src/lib/cloudBuild.ts';
let t = fs.readFileSync(p, 'utf8');

const oldCall = `    const contentUri = await FileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
    return { ok: true, uri: contentUri };`;

const newCall = `    const contentUri = await FileSystem.getContentUriAsync(uri);
    /**
     * 依次尝试唤起安装器。
     *
     * 为什么要指定包名：一旦用户在某次"打开方式"里手滑选了文件管理器并点了"始终"，
     * 系统就把 application/vnd.android.package-archive 这个类型永久交给了它，
     * 之后不管哪里发起安装都会被它接走（表现就是"打不开/装不了"）。
     * 指定 packageName 就是"只准这个安装器来处理"，能绕开那个默认。
     */
    const attempts: Array<{ packageName?: string; action: string }> = [
      { packageName: 'com.android.packageinstaller', action: 'android.intent.action.VIEW' },
      { packageName: 'com.google.android.packageinstaller', action: 'android.intent.action.VIEW' },
      { action: 'android.intent.action.INSTALL_PACKAGE' },
      { action: 'android.intent.action.VIEW' },
    ];
    let lastErr = '';
    for (const a of attempts) {
      try {
        await IntentLauncher.startActivityAsync(a.action, {
          data: contentUri,
          type: 'application/vnd.android.package-archive',
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          ...(a.packageName ? { packageName: a.packageName } : {}),
        });
        return { ok: true, uri: contentUri };
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    return {
      ok: false,
      error: \`系统安装器无法唤起（\${lastErr.slice(0, 80)}）。可能是"默认打开方式"被文件管理器占用，请在 设置 → 应用 → 文件管理器 → 默认打开 → 清除默认值\`,
    };`;

if (!t.includes(oldCall)) throw new Error('安装调用块没找到');
t = t.replace(oldCall, newCall);
fs.writeFileSync(p, t, 'utf8');
console.log('已改为按包名强制唤起安装器:', t.includes('com.android.packageinstaller'), '| 多路回退:', t.includes('INSTALL_PACKAGE'));
