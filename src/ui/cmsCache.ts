/**
 * 影院（CMS）/ 直播台单 / 分类页的本地缓存 —— **永久、文件级、不设上限**。
 *
 * 为什么改成文件而不是 AsyncStorage：
 *   AsyncStorage 在 Android 上默认数据库上限只有 **6MB**，装不下"整库缓存"。
 *   现在每一项都写成 documentDirectory 下的独立 JSON 文件，容量只受手机空间限制
 *   （用户明确说"手机两百多G，大点没事"）。
 *
 * 读取优先级：
 *   1) 本机文件缓存（运行期写入，永久保留）
 *   2) APK 里打包的**种子缓存** assets/seed/cache-v1.json（装完首启就有内容）
 *   3) 没有 → 调用方去联网拉
 */
import * as FileSystemLegacy from 'expo-file-system/legacy';

import seedJson from '../../assets/seed/cache-v1.json';
import { ensureDeletedApisLoaded, isApiDeletedSync } from './deletedSources';

const DIR = `${FileSystemLegacy.documentDirectory ?? FileSystemLegacy.cacheDirectory ?? ''}cmscache/`;

export type CachedValue<T> = { value: T; at: number };

type SeedShape = { version: number; savedAt: number; entries: Record<string, CachedValue<unknown>> };
const seed = seedJson as unknown as SeedShape;

/** 兼容旧调用：现在缓存永不过期（保留常量名，值就是"永久"） */
export const CMS_TTL_MS = Number.POSITIVE_INFINITY;

let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  dirReady = true;
  try {
    await FileSystemLegacy.makeDirectoryAsync(DIR, { intermediates: true });
  } catch {
    /* 已存在 */
  }
}

/** 把任意 key 变成一个安全的文件名（保留可读性 + 唯一性） */
function fileNameFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80);
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) | 0;
  return `${safe}__${(hash >>> 0).toString(36)}.json`;
}

/** 这个缓存键是不是属于某个"已被删除的接口"（比如 cmsApi:<url> / mutual_catpage_v1:<url>|…） */
function belongsToDeletedApi(key: string): boolean {
  const m = key.match(/(https?:\/\/[^|]+)/);
  if (!m) return false;
  return isApiDeletedSync(m[1]);
}

/**
 * 合并类缓存（`lib:home`）里混着**所有接口**的片子，键名里没有接口地址，
 * 所以只靠 belongsToDeletedApi 拦不住它 —— 删掉一个接口之后，
 * 首页这份缓存里还留着那个站的片，进片库照样能看到（真实问题："删了还不同步"）。
 *
 * 好在每个条目都带 `fromApi`（抓取时写进去的），这里就按它过一遍：
 * 属于已删接口的条目直接扔掉。文件缓存和种子缓存走同一条路。
 */
function stripDeletedItems<T>(key: string, value: T): T {
  if (key !== 'lib:home') return value;
  const box = value as { items?: Array<{ fromApi?: string }> };
  if (!Array.isArray(box?.items)) return value;
  const kept = box.items.filter((it) => !(it?.fromApi && isApiDeletedSync(it.fromApi)));
  if (kept.length === box.items.length) return value;
  return { ...(box as unknown as object), items: kept, total: kept.length } as T;
}

export async function readCmsCache<T>(key: string): Promise<CachedValue<T> | null> {
  // 先确保"已删除接口"名单在内存里：否则下面所有同步判断都会误判成"没删过"
  await ensureDeletedApisLoaded();
  // 已删除接口的缓存：文件删掉了，种子里的也当没有
  if (belongsToDeletedApi(key)) return null;
  await ensureDir();
  try {
    const path = DIR + fileNameFor(key);
    const info = await FileSystemLegacy.getInfoAsync(path);
    if (info.exists) {
      const raw = await FileSystemLegacy.readAsStringAsync(path);
      const parsed = JSON.parse(raw) as CachedValue<T>;
      if (parsed && typeof parsed.at === 'number') {
        return { value: stripDeletedItems(key, parsed.value), at: parsed.at };
      }
    }
  } catch {
    /* 落到种子缓存 */
  }
  // 种子缓存（打包在 APK 里的那份）
  if (belongsToDeletedApi(key)) return null;
  const seeded = seed?.entries?.[key];
  if (seeded && seeded.value !== undefined) {
    return {
      value: stripDeletedItems(key, seeded.value as T),
      at: seeded.at ?? seed.savedAt ?? Date.now(),
    };
  }
  return null;
}

export async function writeCmsCache<T>(key: string, value: T): Promise<void> {
  await ensureDir();
  const finalPath = DIR + fileNameFor(key);
  const tmpPath = `${finalPath}.tmp`;
  try {
    /*
     * ATOMIC_WRITE：先写 .tmp 再原子替换。
     *
     * 真实风险：以前直接往最终文件写，App 在写一半时被杀 / 断电 / 进程被系统回收，
     * 就会留下一个**半截 JSON** —— 之后每次读都 JSON.parse 失败，
     * 这个 key 的缓存等于永久坏掉（要清数据才能恢复）。
     * 现在：整份写进 .tmp 成功后 move 覆盖，读到的永远要么是旧的完整文件、要么是新的完整文件。
     * 顺带也解决了"两个页面同时回填同一部片"的并发问题：谁最后 move 谁生效，绝不会写出交叉内容。
     */
    await FileSystemLegacy.writeAsStringAsync(tmpPath, JSON.stringify({ value, at: Date.now() }));
    await FileSystemLegacy.moveAsync({ from: tmpPath, to: finalPath });
  } catch {
    /* 写不进去就算了，下次再存；临时文件留着也无害（下次会被覆盖） */
    try {
      await FileSystemLegacy.deleteAsync(tmpPath, { idempotent: true });
    } catch {
      /* 忽略 */
    }
  }
}

/** 永久缓存：永远算"新鲜"。要不要刷新由页面自己决定（现在是"先显示，再静默刷新"） */
export function isFresh(_at: number, _ttl = CMS_TTL_MS): boolean {
  return true;
}

/** 只清某一个 key（删源时用），其余缓存永久保留 */
export async function dropCmsCache(key: string): Promise<void> {
  try {
    await FileSystemLegacy.deleteAsync(DIR + fileNameFor(key), { idempotent: true });
  } catch {
    /* 忽略 */
  }
}

/** 诊断用：缓存目录 */
export function cmsCacheDir(): string {
  return DIR;
}
