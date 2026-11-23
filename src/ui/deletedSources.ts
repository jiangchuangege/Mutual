/**
 * "已删除的片源接口"名单。
 *
 * 用户要求：删掉某个失效接口时，它的缓存也要跟着清掉，不能一直占着。
 * 难点在于**种子缓存（打包在 APK 里）是只读的**，删不掉；
 * 所以做法是：把删掉的接口记到本机名单里，读取缓存时凡是属于这些接口的键一律跳过
 * （等于"看不见"），同时把本机那份缓存文件删掉、并把片库首页重建成"只剩还活着的源"。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cms_deleted_apis_v1';

let cache: Set<string> | null = null;

function norm(url: string): string {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    cache = new Set(Array.isArray(list) ? list.map(norm) : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

export async function isApiDeleted(url: string): Promise<boolean> {
  const set = await load();
  return set.has(norm(url));
}

export async function addDeletedApi(url: string): Promise<void> {
  const set = await load();
  set.add(norm(url));
  await AsyncStorage.setItem(KEY, JSON.stringify([...set])).catch(() => undefined);
}

export async function removeDeletedApi(url: string): Promise<void> {
  const set = await load();
  set.delete(norm(url));
  await AsyncStorage.setItem(KEY, JSON.stringify([...set])).catch(() => undefined);
}

/** 同步版本（缓存已加载时可用），给 readCmsCache 快速判断 */
export function isApiDeletedSync(url: string): boolean {
  if (!cache) return false;
  return cache.has(norm(url));
}

/**
 * 等这份名单加载完（幂等、只读一次）。
 *
 * 缓存层用的是同步判断，名单没加载完之前它会一律返回 false ——
 * 谁在启动早期读缓存，就会把"已经删掉的接口"的数据读出来。
 * 所以读缓存之前先 await 一次这个函数（load() 内部有缓存，只有第一次真的读盘）。
 */
export async function ensureDeletedApisLoaded(): Promise<void> {
  await load();
}

export async function loadDeletedApis(): Promise<void> {
  await load();
}
