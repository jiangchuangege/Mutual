const fs = require('node:fs');
const p = 'C:/ts/src/lib/cloudBuild.ts';
let t = fs.readFileSync(p, 'utf8');

const oldAttempts = `    const attempts: Array<{ packageName?: string; action: string }> = [
      { packageName: 'com.android.packageinstaller', action: 'android.intent.action.VIEW' },
      { packageName: 'com.google.android.packageinstaller', action: 'android.intent.action.VIEW' },
      { action: 'android.intent.action.INSTALL_PACKAGE' },
      { action: 'android.intent.action.VIEW' },
    ];`;

const newAttempts = `    const attempts: Array<{ packageName?: string; action: string }> = [
      // ① INSTALL_PACKAGE 是"安装"专用动作，只有安装器会注册它（文件管理器不会），
      //    所以放在最前面最可靠。
      { action: 'android.intent.action.INSTALL_PACKAGE' },
      // ② 再按各家 ROM 的安装器包名点名（ColorOS/realme/OPPO、Google、AOSP）
      { packageName: 'com.android.packageinstaller', action: 'android.intent.action.VIEW' },
      { packageName: 'com.google.android.packageinstaller', action: 'android.intent.action.VIEW' },
      { packageName: 'com.oplus.packageinstaller', action: 'android.intent.action.VIEW' },
      { packageName: 'com.coloros.packageinstaller', action: 'android.intent.action.VIEW' },
      { packageName: 'com.oppo.packageinstaller', action: 'android.intent.action.VIEW' },
      { packageName: 'com.miui.packageinstaller', action: 'android.intent.action.VIEW' },
      // ③ 最后才是不指定包名的通用动作
      { action: 'android.intent.action.VIEW' },
    ];`;

if (!t.includes(oldAttempts)) throw new Error('attempts 数组没找到');
t = t.replace(oldAttempts, newAttempts);
fs.writeFileSync(p, t, 'utf8');
console.log('安装尝试顺序已改为 INSTALL_PACKAGE 优先 + 国产 ROM 包名:', t.includes('com.oplus.packageinstaller'));
