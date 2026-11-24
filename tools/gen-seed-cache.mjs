/**
 * 生成「种子缓存」：把当前这批片源接口的首屏/分类第一页抓下来，
 * 打包进 APK（assets/seed/cache-v1.json）。首启时导入本机永久缓存，
 * 装完就有内容、不用等第一次联网。
 *
 * 用法：
 *   node tools/gen-seed-cache.mjs                              # 用 core 里的 BUILTIN_CMS_APIS
 *   node tools/gen-seed-cache.mjs --apis-file tmp/apis.json    # 用指定的接口列表（JSON 数组）
 *
 * 注意：
 *   · 填充版**不入库**。仓库里那份是空壳；正式安装包构建前跑一遍这个脚本即可
 *     （本机已设 `git update-index --skip-worktree assets/seed/cache-v1.json`，
 *      跑完 git status 依然是干净的）。
 *   · 每个请求都有**硬超时**（默认 8 秒）并把结果降级成"这一项没有"，
 *     所以某几个源站抽风也只是少抓一点，不会把整轮生成卡死（真被卡过）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const core = pathToFileURL('C:/ts/dist-core').href;
const cms = await import(`${core}/cms.js`);
const { groupCategories } = await import(`${core}/cinemaClassify.js`);
const { BUILTIN_CMS_APIS } = await import(`${core}/cmsConfig.js`);

const {
  fetchCmsPage,
  fetchCmsCategories,
  fetchCmsLatest,
  fetchCmsCategoryPage,
  mergeVods,
  pickLatestVods,
} = cms;

const argApisFile = (() => {
  const i = process.argv.indexOf('--apis-file');
  return i > 0 ? process.argv[i + 1] : null;
})();

const APIS = (() => {
  if (argApisFile) {
    const raw = JSON.parse(readFileSync(argApisFile, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.apis ?? []);
    if (list.length === 0) throw new Error('apis file is empty');
    return list.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
  }
  return BUILTIN_CMS_APIS;
})();

const HARD_TIMEOUT_MS = 8000;
/** 命令行覆盖：--pages 8 --apis-cats 20 --subs 24（数字越大种子越肥） */
function argNum(flag, def) {
  const i = process.argv.indexOf(flag);
  const v = i > 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : def;
}

const PAGES_PER_API = argNum('--pages', 8);
const CATS_FOR_SEED = argNum('--apis-cats', 20);
const SUBS_PER_API = argNum('--subs', 24);
const CAT_CONCURRENCY = 4;

/** 任何请求都不许超过 HARD_TIMEOUT_MS，超时就当"没有" */
function withTimeout(promise, ms = HARD_TIMEOUT_MS, fallback = null) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function mapLimit(items, n, fn) {
  const out = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i).catch(() => null);
    }
  });
  await Promise.all(workers);
  return out;
}

const t0 = Date.now();
const entries = {};
let okApis = 0;
const mergedAll = [];
const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(0)}s]`;

for (let i = 0; i < APIS.length; i += 1) {
  const api = APIS[i];
  const pages = [];
  for (let p = 1; p <= PAGES_PER_API; p += 1) {
    const res = await withTimeout(fetchCmsPage(api, p));
    if (!res || !res.ok) break;
    if (res.page.list.length > 0) pages.push(res.page.list);
    if (p >= res.page.pageCount) break;
  }
  const list = pickLatestVods(mergeVods(pages), 1600);
  if (list.length === 0) {
    console.log(stamp(), 'skip(fail/empty):', api);
    continue;
  }
  okApis += 1;
  mergedAll.push(list);
  entries[`cmsApi:${api}`] = { value: { list, pageCount: pages.length || 1 }, at: Date.now() };
  console.log(stamp(), 'ok', api, list.length, '页数', pages.length);

  if (i < CATS_FOR_SEED) {
    const cats = (await withTimeout(fetchCmsCategories(api), HARD_TIMEOUT_MS, [])) || [];
    const subs = cats.filter((c) => (c.pid ?? '0') !== '0').slice(0, SUBS_PER_API);
    const catPages = await mapLimit(subs, CAT_CONCURRENCY, async (c) => {
      const page = await withTimeout(fetchCmsCategoryPage(api, c.id, 1));
      if (!page || !page.ok || page.page.list.length === 0) return null;
      return { c, list: page.page.list.slice(0, 120) };
    });
    let seeded = 0;
    for (const item of catPages) {
      if (!item) continue;
      entries[`mutual_catpage_v1:${api}|${item.c.id}|`] = { value: item.list, at: Date.now() };
      seeded += 1;
    }
    console.log(stamp(), '  cats seeded:', seeded, '/', subs.length);
  }
}

if (mergedAll.length > 0) {
  const first = APIS.find((api) => entries[`cmsApi:${api}`]) ?? APIS[0];
  const cats = (await withTimeout(fetchCmsCategories(first), HARD_TIMEOUT_MS, [])) || [];
  const latest = await withTimeout(fetchCmsLatest(first));
  const merged = pickLatestVods(mergeVods(mergedAll), 6000);
  entries['lib:home'] = {
    value: {
      items: merged,
      total: merged.length,
      pageCount: 1,
      groups: groupCategories(cats),
      latest: latest && latest.ok ? latest.page.list.slice(0, 12) : merged.slice(0, 12),
    },
    at: Date.now(),
  };
  console.log(stamp(), 'lib:home', merged.length);
}

const seed = { version: 1, savedAt: Date.now(), entries };
mkdirSync('C:/ts/assets/seed', { recursive: true });
const json = JSON.stringify(seed);
writeFileSync('C:/ts/assets/seed/cache-v1.json', json, 'utf8');
console.log(
  stamp(),
  'wrote assets/seed/cache-v1.json',
  (Buffer.byteLength(json) / 1024 / 1024).toFixed(2),
  'MB | apis ok:',
  okApis,
  '| keys:',
  Object.keys(entries).length,
);
