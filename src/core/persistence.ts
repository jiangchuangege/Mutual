/**
 * 本地持久化：把服务端权威状态（SpaceState）落到设备存储。
 *
 * - 写入是 JSON 快照（含版本号），读取时做基本校验；
 * - 版本不匹配或解析失败 → 返回 null 并清掉脏数据（不让 App 起不来）；
 * - 只存"服务端状态"，不存 UI 状态。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SpaceState } from './types';

const STORAGE_KEY = 'twospace::space-state';
const SCHEMA_VERSION = 1;

interface Envelope {
  version: number;
  savedAt: number;
  state: SpaceState;
}

export interface LoadResult {
  state: SpaceState | null;
  savedAt: number | null;
  reason?: string;
}

function isUsableState(value: unknown): value is SpaceState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<SpaceState>;
  return (
    typeof s.spaceId === 'string' &&
    typeof s.members === 'object' &&
    Array.isArray(s.todos) &&
    Array.isArray(s.events) &&
    typeof s.period === 'object'
  );
}

export async function loadState(): Promise<LoadResult> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: null, savedAt: null, reason: 'empty' };
    const env = JSON.parse(raw) as Envelope;
    if (!env || env.version !== SCHEMA_VERSION) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return { state: null, savedAt: null, reason: `schema ${env?.version ?? 'unknown'}` };
    }
    if (!isUsableState(env.state)) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return { state: null, savedAt: null, reason: 'malformed' };
    }
    return { state: env.state, savedAt: env.savedAt ?? null };
  } catch (err) {
    return {
      state: null,
      savedAt: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function saveState(state: SpaceState): Promise<boolean> {
  try {
    const env: Envelope = { version: SCHEMA_VERSION, savedAt: Date.now(), state };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(env));
    return true;
  } catch {
    return false;
  }
}

export async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // 清除失败不阻塞 UI
  }
}

export async function storageInfo(): Promise<{ bytes: number | null; savedAt: number | null }> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { bytes: 0, savedAt: null };
    const env = JSON.parse(raw) as Envelope;
    return { bytes: raw.length, savedAt: env.savedAt ?? null };
  } catch {
    return { bytes: null, savedAt: null };
  }
}
