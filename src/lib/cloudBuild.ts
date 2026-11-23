/**
 * 云编译 + 原生安装。
 *
 * 流程：把 Java 源码 POST 给我们的服务器 → 服务器用 javac/d8/aapt2/apksigner 编出 APK
 * → 手机把 APK 下载到本地缓存 → 调系统安装器安装 → 装好后可以"打开"那个独立 App。
 *
 * 为什么它是独立 App：原生程序没法嵌进 Mutual 的一页（Android 沙箱限制），
 * 所以云编译产物一定是以"另一个图标"的形式存在，这点必须让用户预期一致。
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

export interface BuildFile {
  name: string;
  content: string;
}

export interface BuildEnvStatus {
  ok: boolean;
  missing: string[];
  javaHome?: string | null;
}

const baseOf = (server: string) => String(server ?? '').replace(/\/+$/, '');

/** 服务器能不能编译（缺什么会列出来） */
export async function checkBuildEnv(
  server: string,
  token: string,
): Promise<{ ok: boolean; value?: BuildEnvStatus; error?: string }> {
  try {
    const res = await fetch(`${baseOf(server)}/api/build/env`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { ok?: boolean; value?: BuildEnvStatus; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return { ok: true, value: data.value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 提交源码 → 服务器编译 → 返回 /game/xxx.apk 相对路径 */
export async function buildNativeGame(
  server: string,
  token: string,
  title: string,
  files: BuildFile[],
): Promise<{ ok: boolean; path?: string; bytes?: number; error?: string }> {
  try {
    const res = await fetch(`${baseOf(server)}/api/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, files }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      value?: { path?: string; bytes?: number };
      error?: string;
    };
    if (!res.ok || !data.ok || !data.value?.path) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, path: data.value.path, bytes: data.value.bytes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 下载 APK 到手机本地并唤起系统安装器。
 *
 * 返回 { uri } 表示已经交给系统（用户会在系统界面里点"安装"），
 * 这个 App 会出现在桌面上，和 Mutual 是并列关系。
 */
/** 只把 APK 下载到手机本地，返回本地路径（不调安装器） */
export async function downloadApkOnly(
  server: string,
  assetPath: string,
): Promise<{ ok: boolean; uri?: string; shared?: boolean; error?: string }> {
  const dir = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}apk/`;
  const name = String(assetPath ?? '').split('/').pop() || 'game.apk';
  const target = `${dir}${name.replace(/[^A-Za-z0-9._-]/g, '')}`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const cached = await FileSystem.getInfoAsync(target);
    if (cached.exists) return { ok: true, uri: target };
    const res = await FileSystem.downloadAsync(`${baseOf(server)}${assetPath}`, target);
    if (res.status !== 200) return { ok: false, error: `下载失败（HTTP ${res.status}）` };
    return { ok: true, uri: res.uri };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 把 APK 的下载地址直接交给系统浏览器（浏览器会自己下载，最兜底的一条路） */
export async function openApkInBrowser(server: string, assetPath: string): Promise<boolean> {
  try {
    await Linking.openURL(`${baseOf(server)}${assetPath}`);
    return true;
  } catch {
    return false;
  }
}

export async function installApk(
  server: string,
  assetPath: string,
): Promise<{ ok: boolean; uri?: string; shared?: boolean; error?: string }> {
  // 用 documentDirectory（持久目录）而不是 cache：被系统清缓存后还能重装
  const dir = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}apk/`;
  const name = String(assetPath ?? '').split('/').pop() || 'game.apk';
  const target = `${dir}${name.replace(/[^A-Za-z0-9._-]/g, '')}`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    let uri = target;
    const cached = await FileSystem.getInfoAsync(target);
    if (!cached.exists) {
      const res = await FileSystem.downloadAsync(`${baseOf(server)}${assetPath}`, target);
      if (res.status !== 200) return { ok: false, error: `下载失败（HTTP ${res.status}）` };
      uri = res.uri;
    }
    // 用 content:// 交给系统安装器（Android 7+ 不许直接暴露 file://）。
    // 关键：必须显式指定 APK 的 MIME 类型 + 授权读权限，否则系统不知道要用安装器打开，
    // 表现就是"点了没反应"（用户实测）。
    const contentUri = await FileSystem.getContentUriAsync(uri);
    /**
     * 依次尝试唤起安装器。
     *
     * 为什么要指定包名：一旦用户在某次"打开方式"里手滑选了文件管理器并点了"始终"，
     * 系统就把 application/vnd.android.package-archive 这个类型永久交给了它，
     * 之后不管哪里发起安装都会被它接走（表现就是"打不开/装不了"）。
     * 指定 packageName 就是"只准这个安装器来处理"，能绕开那个默认。
     */
    const attempts: Array<{ packageName?: string; action: string }> = [
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
    /**
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
      error: `系统安装器无法唤起（${lastErr.slice(0, 80)}）。可以在这台手机的"设置 → 存储 → 下载"里找到刚下载的 APK 手动安装`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 装完之后用包名拉起它（云编译产物固定用这个包名；导入的 APK 用服务端解析出来的包名） */
export const GENERATED_PACKAGE = 'com.mutual.generated';

/**
 * 拉起一个已安装的游戏。
 *
 * 以前写死 com.mutual.generated —— 于是用户自己传进来的第三方 APK
 * 装上了却打不开（点卡片只会再弹一次安装器）。
 * 现在把包名传进来：先试显式 Intent（LAUNCHER），失败再退回 package: scheme。
 */
export async function openInstalledGame(packageName?: string | null): Promise<boolean> {
  const pkg = (packageName ?? '').trim() || GENERATED_PACKAGE;
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
      category: 'android.intent.category.LAUNCHER',
      packageName: pkg,
    });
    return true;
  } catch {
    try {
      await Linking.openURL(`package:${pkg}`);
      return true;
    } catch {
      return false;
    }
  }
}
