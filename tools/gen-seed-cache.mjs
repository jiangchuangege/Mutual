/**
 * 生成"种子缓存"：把现在这批片源接口的首页/分类第一页抓下来，
 * 打包进 APK（assets/seed/cache-v1.json）。首启时导入本机永久缓存，
 * 装完就有内容、不用等第一次联网。
 *
 * 用法：node tools/gen-seed-cache.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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

const PAGES_PER_API = 8;
const CATS_FOR_SEED = 20; // 只给前 N 个接口抓分类第一页，控制体积/耗时
const SUBS_PER_API = 24;

const entries = {};
let okApis = 0;
const mergedAll = [];

for (let i = 0; i < BUILTIN_CMS_APIS.length; i += 1) {
  const api = BUILTIN_CMS_APIS[i];
  const pages = [];
  for (let p = 1; p <= PAGES_PER_API; p += 1) {
    const res = await fetchCmsPage(api, p).catch(() => null);
    if (!res || !res.ok) break;
    if (res.page.list.length > 0) pages.push(res.page.list);
    if (p >= res.page.pageCount) break;
  }
  const list = pickLatestVods(mergeVods(pages), 1600);
  if (list.length === 0) {
    console.log('skip(fail/empty):', api);
    continue;
  }
  okApis += 1;
  mergedAll.push(list);
  entries[`cmsApi:${api}`] = { value: { list, pageCount: pages.length || 1 }, at: Date.now() };
  console.log('ok', api, list.length);

  if (i < CATS_FOR_SEED) {
    const cats = await fetchCmsCategories(api).catch(() => []);
    const subs = cats.filter((c) => (c.pid ?? '0') !== '0').slice(0, SUBS_PER_API);
    for (const c of subs) {
      const page = await fetchCmsCategoryPage(api, c.id, 1).catch(() => null);
      if (!page || !page.ok || page.page.list.length === 0) continue;
      entries[`mutual_catpage_v1:${api}|${c.id}|`] = {
        value: page.page.list.slice(0, 120),
        at: Date.now(),
      };
    }
    console.log('  cats seeded:', subs.length);
  }
}

if (mergedAll.length > 0) {
  const first = BUILTIN_CMS_APIS[0];
  const cats = await fetchCmsCategories(first).catch(() => []);
  const latest = await fetchCmsLatest(first).catch(() => null);
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
  console.log('lib:home', merged.length);
}

const seed = { version: 1, savedAt: Date.now(), entries };
mkdirSync('C:/ts/assets/seed', { recursive: true });
const json = JSON.stringify(seed);
writeFileSync('C:/ts/assets/seed/cache-v1.json', json, 'utf8');
console.log(
  'wrote assets/seed/cache-v1.json',
  (Buffer.byteLength(json) / 1024 / 1024).toFixed(2),
  'MB | apis ok:',
  okApis,
  '| keys:',
  Object.keys(entries).length,
);
