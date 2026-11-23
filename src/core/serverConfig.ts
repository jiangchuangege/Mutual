/**
 * 同步服务器地址的持久化（AsyncStorage）。
 *
 * 规格第 5 条：地址存起来，下次打开 App 自动读取并连接。
 * 这里只做"存取"，解析/校验/协议推导都在 serverUrl.ts 里（那部分能单测）。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SERVER_URL, checkServerUrl, normalizeServerUrl } from './serverUrl';

/** 存的是用户填的原始地址（http(s)），WS 地址由它推导，不单独存 */
export const SERVER_URL_KEY = 'twospace::server-url';
/** 备用地址：主地址在某条链路上被拦时自动改用它 */
export const SERVER_BACKUP_KEY = 'twospace::server-url-backup';

/** 是否允许启动时自动连接（用户主动断开后不要再自动连） */
export const SERVER_AUTO_KEY = 'twospace::server-auto-connect';

export interface SavedServer {
  url: string;
  /** 备用地址（可为空字符串） */
  backupUrl: string;
  /** 是否曾经成功连过；有值才值得开机自动连 */
  autoConnect: boolean;
}

export async function loadServerSettings(): Promise<SavedServer> {
  try {
    const [url, backup, auto] = await Promise.all([
      AsyncStorage.getItem(SERVER_URL_KEY),
      AsyncStorage.getItem(SERVER_BACKUP_KEY),
      AsyncStorage.getItem(SERVER_AUTO_KEY),
    ]);
    return {
      url: normalizeServerUrl(url ?? ''),
      backupUrl: backup && backup.trim() ? normalizeServerUrl(backup) : '',
      autoConnect: auto === '1',
    };
  } catch {
    return { url: DEFAULT_SERVER_URL, backupUrl: '', autoConnect: false };
  }
}

export async function saveServerUrl(url: string, backupUrl?: string | null): Promise<boolean> {
  try {
    const normalized = normalizeServerUrl(url);
    const check = checkServerUrl(normalized);
    if (!check.ok) return false;
    const writes: Array<[string, string]> = [[SERVER_URL_KEY, normalized]];
    if (backupUrl !== undefined) {
      const cleanBackup = (backupUrl ?? '').trim();
      if (!cleanBackup) {
        // 清空备用地址
        writes.push([SERVER_BACKUP_KEY, '']);
      } else {
        const backupCheck = checkServerUrl(cleanBackup);
        if (backupCheck.ok) writes.push([SERVER_BACKUP_KEY, backupCheck.url]);
      }
    }
    await AsyncStorage.multiSet(writes);
    return true;
  } catch {
    return false;
  }
}

export async function setAutoConnect(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SERVER_AUTO_KEY, enabled ? '1' : '0');
  } catch {
    // 存不进去也不影响本次使用
  }
}

export async function clearServerSettings(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([SERVER_URL_KEY, SERVER_AUTO_KEY]);
  } catch {
    // 忽略
  }
}
