/**
 * 游戏文件本地缓存。
 *
 * 用户的意思（对）：**游戏文件就该存在手机本地**，对方想要就自己下载一次，
 * 之后双方都从本地跑 —— 而不是每次打开都去服务器拉一遍。
 *
 * 所以流程是：
 *   1. 进库时只有一条元数据（/game/xxx.html，几十字节，两台手机同步）；
 *   2. 第一次点开：下载到手机私有目录 → 变成 file:// 本地文件；
 *   3. 之后（以及离线）都直接从本地加载，秒开、不耗流量；
 *   4. 对方点开时走同一条路：他自己下载、存自己手机。
 */

import * as FileSystem from 'expo-file-system/legacy';

const DIR = `${FileSystem.documentDirectory ?? ''}games/`;

/** 把 /game/x.html 变成一个稳定的本地文件名 */
export function localNameOf(assetPath: string): string {
  const base = String(assetPath ?? '').split('/').pop() ?? 'game.html';
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '');
  return safe || 'game.html';
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  } catch {
    // 目录建不了就退回远端加载
  }
}

/** 本地是否已经有这个游戏 */
export async function findLocalGame(assetPath: string): Promise<string | null> {
  const path = `${DIR}${localNameOf(assetPath)}`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) return path;
  } catch {
    // 忽略
  }
  return null;
}

/**
 * 确保本地有这个游戏：
 *  - 已有 → 直接返回本地路径（秒开、离线也能玩）；
 *  - 没有 → 从服务器下载一次，存本地，再返回本地路径。
 */
export async function ensureLocalGame(
  baseUrl: string,
  assetPath: string,
): Promise<{ uri: string | null; downloaded: boolean; error?: string }> {
  const existing = await findLocalGame(assetPath);
  if (existing) return { uri: existing, downloaded: false };
  const url = `${baseUrl.replace(/\/+$/, '')}${assetPath}`;
  await ensureDir();
  const target = `${DIR}${localNameOf(assetPath)}`;
  try {
    const res = await FileSystem.downloadAsync(url, target);
    if (res.status === 200 && res.uri) return { uri: res.uri, downloaded: true };
    return { uri: null, downloaded: false, error: `下载失败（HTTP ${res.status}）` };
  } catch (err) {
    return {
      uri: null,
      downloaded: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 删掉本地缓存（清空间用） */
export async function clearLocalGames(): Promise<void> {
  try {
    await FileSystem.deleteAsync(DIR, { idempotent: true });
  } catch {
    // 忽略
  }
}

/** 本地缓存占用（给"我们 → 存储"显示） */
export async function localGamesSize(): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists || info.isDirectory !== true) return 0;
    const names = await FileSystem.readDirectoryAsync(DIR);
    let total = 0;
    for (const n of names) {
      const f = await FileSystem.getInfoAsync(`${DIR}${n}`);
      if (f.exists && !f.isDirectory && typeof f.size === 'number') total += f.size;
    }
    return total;
  } catch {
    return 0;
  }
}
