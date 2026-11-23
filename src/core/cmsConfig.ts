/**
 * 片源接口地址的持久化。
 *
 * 支持**多个**接口：有的片只有 A 有、有的只有 B 有；某个接口挂了也不至于全黑。
 * 存储：
 *   - 新格式：`cms_api_urls` = JSON 数组，如 ["https://a/api.php/provide/vod","https://b/..."]
 *   - 老格式：`cms_api_url` = 单个字符串（继续读取，保证升级后不丢配置）
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_CMS_API } from './cms';

/**
 * 内置片源接口（用户要求："这些接口给我内置，但要能删"）。
 *
 * 这些就是他现在在用的那 20 个采集站 —— 随安装包自带，第一次打开就能直接看片；
 * 删了就是删了（会写进本机配置），不会再被自动加回来；想加回来在接口页手动加。
 */
/**
 * 内置片源接口 —— **故意留空**。
 *
 * 出于版权与合规考虑，安装包不再内置任何第三方采集站地址；
 * 需要看片请自己在「影院 → 接口 → 添加」填一个你有权使用的 CMS 接口地址。
 * 缓存功能不受影响：加进来的源照样会本地永久缓存、秒开。
 */
export const BUILTIN_CMS_APIS: string[] = [];

/** 内置接口是不是已经"发过一次"了（发过之后就以本机列表为准，删了不会回来） */
const BUILTIN_SEEDED_KEY = 'cms_builtin_seeded_v1';

export const CMS_API_KEY = 'cms_api_url';
export const CMS_APIS_KEY = 'cms_api_urls';

/** 去重 + 去空 + 只保留 http(s) */
export function normalizeApiList(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const url = String(raw ?? '').trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    const bare = url.replace(/\/+$/, '');
    if (out.includes(bare)) continue;
    out.push(bare);
  }
  return out;
}

/** 读全部接口；没配置过就给默认那一条 */
export async function getCmsApiList(): Promise<string[]> {
  try {
    const savedList = await AsyncStorage.getItem(CMS_APIS_KEY);
    if (savedList) {
      const parsed: unknown = JSON.parse(savedList);
      if (Array.isArray(parsed)) {
        const list = normalizeApiList(parsed.map((v) => String(v)));
        if (list.length > 0) return list;
      }
    }
    // 老版本的单条配置
    const saved = await AsyncStorage.getItem(CMS_API_KEY);
    if (saved && saved.trim()) return normalizeApiList([saved]);
    /*
     * 从没配置过：把**内置的 20 个接口**写进本机一份（用户要求"随包自带、但可以删"）。
     * 写进去之后就走上面那条"读本机列表"的路径 —— 所以他在接口页删掉就不会再出现。
     */
    // 只发一次：发过之后哪怕他把接口全删了，也绝不自动加回来（用户要求"能删"）
    const seededOnce = await AsyncStorage.getItem(BUILTIN_SEEDED_KEY);
    if (seededOnce === '1') return [DEFAULT_CMS_API];
    const seeded = normalizeApiList(BUILTIN_CMS_APIS);
    if (seeded.length > 0) {
      await AsyncStorage.setItem(CMS_APIS_KEY, JSON.stringify(seeded));
      await AsyncStorage.setItem(CMS_API_KEY, seeded[0]!);
      await AsyncStorage.setItem(BUILTIN_SEEDED_KEY, '1');
      return seeded;
    }
    return [DEFAULT_CMS_API];
  } catch {
    return [DEFAULT_CMS_API];
  }
}

/** 写全部接口；只保留第一条到老键上（兼容还在读单条的旧页面） */
export async function saveCmsApiList(list: string[]): Promise<boolean> {
  try {
    const clean = normalizeApiList(list);
    if (clean.length === 0) {
      await AsyncStorage.removeItem(CMS_APIS_KEY);
      await AsyncStorage.removeItem(CMS_API_KEY);
      return true;
    }
    await AsyncStorage.setItem(CMS_APIS_KEY, JSON.stringify(clean));
    await AsyncStorage.setItem(CMS_API_KEY, clean[0]);
    return true;
  } catch {
    return false;
  }
}

/** 兼容旧调用：拿第一条 */
export async function getCmsApiUrl(): Promise<string> {
  const list = await getCmsApiList();
  return list[0] ?? DEFAULT_CMS_API;
}

/** 兼容旧调用：保存单条（会覆盖成只有这一条） */
export async function saveCmsApiUrl(url: string): Promise<boolean> {
  return saveCmsApiList([url]);
}

export async function clearCmsApiUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CMS_API_KEY);
    await AsyncStorage.removeItem(CMS_APIS_KEY);
  } catch {
    // 忽略
  }
}
