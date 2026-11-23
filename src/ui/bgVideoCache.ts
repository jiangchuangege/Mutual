/**
 * 背景 MP4 的本地缓存。
 *
 * 用户诉求：背景视频别每次都从服务器拉（7MB 一支，白占带宽），本地存一份就好。
 *
 * 做法：
 *   - 以 `customBackground.updatedAt` 当版本号，存到 `documentDirectory/bg-wallpaper-<version>.mp4`；
 *   - 版本没变 + 文件还在 → 直接用本地文件（不走网络）；
 *   - 换了背景（版本变了）→ 删掉旧文件，重新下一次；
 *   - 下载失败就退回远程地址，绝不因为缓存把背景弄没。
 */
import * as FileSystemLegacy from 'expo-file-system/legacy';

const DIR = FileSystemLegacy.documentDirectory ?? FileSystemLegacy.cacheDirectory ?? '';
const PREFIX = 'bg-wallpaper-';

/**
 * 版本 -> 已经确认可用的本地文件。
 * 有了它，切页面时能**同步**拿到本地路径，不用先退回远程地址再换回来
 * （那一次来回就是用户说的"影库/接口页背景加载很慢"）。
 */
const KNOWN = new Map<string, string>();

/** 同步查：这个版本的背景有没有已经下好的本地文件 */
export function peekBackgroundVideo(version: string): string | null {
  return KNOWN.get(version) ?? null;
}

function pathFor(version: string): string {
  const safe = version.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return `${DIR}${PREFIX}${safe || 'v0'}.mp4`;
}

/** 清掉所有旧版本的背景缓存（只保留当前这版） */
async function cleanup(keep: string): Promise<void> {
  try {
    const names = await FileSystemLegacy.readDirectoryAsync(DIR);
    for (const name of names) {
      if (!name.startsWith(PREFIX)) continue;
      const full = `${DIR}${name}`;
      if (full === keep) continue;
      void FileSystemLegacy.deleteAsync(full, { idempotent: true }).catch(() => undefined);
    }
  } catch {
    /* 目录读不到就算了 */
  }
}

/**
 * 返回"应该播放的地址"：优先本地缓存文件，没有就下载后再返回本地文件；
 * 失败则回退远程 URL（保证一定能播）。
 */export async function resolveBackgroundVideo(
  remoteUrl: string,
  version: string,
): Promise<string> {
  if (!remoteUrl) return remoteUrl;
  if (!DIR) return remoteUrl;
  const local = pathFor(version);
  try {
    const info = await FileSystemLegacy.getInfoAsync(local);
    if (info.exists && typeof info.size === 'number' && info.size > 64 * 1024) {
      KNOWN.set(version, local);
      void cleanup(local);
      return local;
    }
  } catch {
    /* 忽略，走下载 */
  }
  try {
    void cleanup(local);
    const res = await FileSystemLegacy.downloadAsync(remoteUrl, local);
    if (res?.uri) {
      // 小文件（下载残缺）就认为失败
      const info = await FileSystemLegacy.getInfoAsync(res.uri);
      if (info.exists && typeof info.size === 'number' && info.size > 64 * 1024) {
        KNOWN.set(version, res.uri);
        return res.uri;
      }
    }
    return remoteUrl;
  } catch {
    return remoteUrl;
  }
}

/**
 * 丢掉所有本地背景缓存（缓存文件疑似损坏时用）。
 * 下一次 resolveBackgroundVideo 会重新下载一份干净的。
 */
export async function dropBackgroundVideo(): Promise<void> {
  await cleanup('');
}
