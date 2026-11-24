/**
 * 小配置项的**双写**存储（AsyncStorage + 本机文件），并带一点自愈。
 *
 * ── 为什么需要它（真实 bug，不是防御性编程）──
 * Android 的 AsyncStorage 是一个 SQLite 库，自带容量上限（默认 6MB）。
 * 这台模拟器上它已经写满了，`setItem` 直接抛
 *   `database or disk is full (code 13 SQLITE_FULL)`
 * 而我们过去所有的写入都是 `void save(...).catch(()=>undefined)`，
 * 于是表现为一串"设置永远记不住"的怪现象：
 *   - 点「知道了」收起「TA 的动态」提示框 → 下次打开又弹出来（用户反馈"点了好几次"）；
 *   - 搜索历史、静音开关、上次听的音频……改了等于没改。
 *
 * ── 这一版的做法 ──
 *   1. **双写**：AsyncStorage 一份 + documentDirectory/prefs/ 一份 JSON 文件；
 *   2. **读新不读旧**：两边都带写入时间，谁新用谁（老数据没有时间戳，按 0 处理），
 *      这样即使 AsyncStorage 里躺着很早以前的旧值，也不会把新的覆盖掉；
 *   3. **自愈**：写入失败时，先把已知的"大块缓存"（焦焦FM 的曲库清单，可重新拉）
 *      删掉腾出页，再重试一次 —— 免得整库一直卡在满的状态。
 *
 * 只给**小配置**用（几 KB 以内）。片库这种大缓存走 ui/cmsCache 的独立文件缓存。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';

const DIR = `${FileSystemLegacy.documentDirectory ?? FileSystemLegacy.cacheDirectory ?? ''}prefs/`;

/**
 * 这些键是"能重新拉回来的大块缓存"，只在写入已经失败（说明库满了）时才删，
 * 用来给真正要紧的小配置腾地方。
 *
 * ⚠️ 只能放**可重建的缓存**：`jfm_items_v1` 是焦焦FM 抓下来的条目，下次打开会重新抓；
 * `jfm_sources_v1` 是用户自己加的收听源（配置，删了就没了）——绝对不能放进来。
 */
const PRUNABLE_KEYS = ['jfm_items_v1', 'twospace::space-state'];

type Envelope = { v: string; at: number };

let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  dirReady = true;
  try {
    await FileSystemLegacy.makeDirectoryAsync(DIR, { intermediates: true });
  } catch {
    /* 目录已存在 */
  }
}

/** key → 安全文件名（保留可读前缀 + 短哈希防撞） */
function fileNameFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60);
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) | 0;
  return `${DIR}${safe}__${(hash >>> 0).toString(36)}.json`;
}

function parseEnvelope(raw: string | null): Envelope | null {
  if (raw === null) return null;
  try {
    const box = JSON.parse(raw) as Partial<Envelope>;
    if (box && typeof box.v === 'string' && typeof box.at === 'number') {
      return { v: box.v, at: box.at };
    }
  } catch {
    /* 不是信封格式 */
  }
  // 老格式（直接存的字符串）：当成"很久以前写的"，让新的一份赢
  return { v: raw, at: 0 };
}

async function readFileEnvelope(key: string): Promise<Envelope | null> {
  try {
    const file = fileNameFor(key);
    const info = await FileSystemLegacy.getInfoAsync(file);
    if (!info.exists) return null;
    return parseEnvelope(await FileSystemLegacy.readAsStringAsync(file));
  } catch {
    return null;
  }
}

async function freeSpaceForRetry(): Promise<void> {
  for (const key of PRUNABLE_KEYS) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* 删不动就算了 */
    }
  }
}

async function writeAsyncStorage(key: string, payload: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, payload);
    return true;
  } catch {
    // 库满了：先腾地方再试一次（见文件头第 3 条）
    await freeSpaceForRetry();
    try {
      await AsyncStorage.setItem(key, payload);
      return true;
    } catch {
      return false;
    }
  }
}

export async function prefGet(key: string): Promise<string | null> {
  let fromAsync: Envelope | null = null;
  try {
    fromAsync = parseEnvelope(await AsyncStorage.getItem(key));
  } catch {
    fromAsync = null;
  }
  const fromFile = await readFileEnvelope(key);
  if (fromAsync && fromFile) return fromFile.at > fromAsync.at ? fromFile.v : fromAsync.v;
  if (fromAsync) return fromAsync.v;
  if (fromFile) return fromFile.v;
  return null;
}

export async function prefSet(key: string, value: string): Promise<void> {
  const payload = JSON.stringify({ v: value, at: Date.now() } satisfies Envelope);
  await writeAsyncStorage(key, payload);
  try {
    await ensureDir();
    const file = fileNameFor(key);
    const tmp = `${file}.tmp`;
    await FileSystemLegacy.writeAsStringAsync(tmp, payload);
    await FileSystemLegacy.moveAsync({ from: tmp, to: file });
  } catch {
    /* 文件也写不上就算了，最坏情况是下次多提醒一次 */
  }
}

/** 数字型配置的读写（省掉调用方到处写 Number/String） */
export async function prefGetNumber(key: string): Promise<number> {
  const raw = await prefGet(key);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function prefSetNumber(key: string, value: number): Promise<void> {
  await prefSet(key, String(Math.max(0, Math.floor(value))));
}

/** 删掉一个配置（两边一起删，避免"清空了但文件里还留着"） */
export async function prefRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* 见文件头注释 */
  }
  try {
    const file = fileNameFor(key);
    const info = await FileSystemLegacy.getInfoAsync(file);
    if (info.exists) await FileSystemLegacy.deleteAsync(file, { idempotent: true });
  } catch {
    /* 删不掉也不影响：下次读到旧值最多是多一条历史 */
  }
}

/**
 * 启动时调一次：如果 AsyncStorage 已经写不进去了（SQLITE_FULL），
 * 主动删掉可重建的大缓存把库腾空 —— 不然整个 App 的设置都会一直"记不住"。
 */
export async function repairStorageOnce(): Promise<void> {
  const probe = 'twospace::storage-probe';
  try {
    await AsyncStorage.setItem(probe, '1');
    await AsyncStorage.removeItem(probe);
    return;
  } catch {
    /* 满了，往下走 */
  }
  await freeSpaceForRetry();
}
