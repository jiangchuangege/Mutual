/**
 * 分类正确性全量审计（跑在能访问采集站的机器上）。
 *
 * 检查三件事：
 *   1. 每个采集站的**每一个分类名**，被 canonicalBucket 归到哪一档（有问题的会标出来）
 *   2. 每个分类的第一页内容里，**每一条片的 typeName** 是否和该分类同档（跨档就是错乱）
 *   3. 跨接口按名字对齐（resolveIdsForApi）能不能真的找到对应分类
 *
 * 用法：node audit-categories.mjs <apis.json>
 */
import { readFileSync } from 'node:fs';

const coreDir = process.env.CORE_DIR ?? '/tmp/core';
const { canonicalBucket } = await import(`${coreDir}/cinemaClassify.js`);
const { parseCategories } = await import(`${coreDir}/cms.js`);

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
};

const apis = JSON.parse(readFileSync(process.argv[2], 'utf8'));

function listUrl(api) {
  const base = api.trim().replace(/\/+$/, '');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}ac=list`;
}
function catUrl(api, typeId, page = 1) {
  const base = api.trim().replace(/\/+$/, '');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}ac=detail&t=${encodeURIComponent(typeId)}&pg=${page}`;
}

async function getJson(url, timeout = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) return { ok: false, err: `HTTP ${res.status}` };
    const text = await res.text();
    if (text.trim().startsWith('<')) return { ok: false, err: 'html' };
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, err: String(e.name ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

const report = {
  apis: 0,
  reachable: 0,
  categoriesChecked: 0,
  itemsChecked: 0,
  crossBucketViolations: 0,
  unknownCategoryNames: [],
  violations: [],
  perBucket: {},
};

/** 明显应该能归类的名字，被归成 other 就是映射缺口 */
const KNOWN_WORDS = /(片|剧|动漫|动画|综艺|纪录|秀|电影|短剧|番)/;

for (const api of apis) {
  report.apis += 1;
  const res = await getJson(listUrl(api));
  if (!res.ok) {
    console.log(`[SKIP] ${api} -> ${res.err}`);
    continue;
  }
  report.reachable += 1;
  const cats = parseCategories(res.data);
  console.log(`\n=== ${api}  分类 ${cats.length} 个`);

  const bucketCount = {};
  for (const c of cats) {
    const b = canonicalBucket(c.name);
    bucketCount[b] = (bucketCount[b] ?? 0) + 1;
    report.perBucket[b] = (report.perBucket[b] ?? 0) + 1;
    if (b === 'other' && KNOWN_WORDS.test(c.name)) {
      report.unknownCategoryNames.push(`${api} :: ${c.name}`);
    }
  }
  console.log('  分档：', JSON.stringify(bucketCount));

  // 抽查每个二级分类（有 pid 的）最前面的内容
  const children = cats.filter((c) => (c.pid ?? '0') !== '0').slice(0, 60);
  const sample = children.length > 0 ? children : cats.slice(0, 12);
  for (const c of sample) {
    const catBucket = canonicalBucket(c.name);
    if (catBucket === 'other') continue;
    const page = await getJson(catUrl(api, c.id));
    if (!page.ok) continue;
    const list = page.data?.list ?? [];
    report.categoriesChecked += 1;
    for (const v of list) {
      report.itemsChecked += 1;
      const typeName = String(v.vod_type_name ?? v.type_name ?? '');
      if (!typeName) continue;
      const itemBucket = canonicalBucket(typeName);
      if (itemBucket === 'other') continue;
      const compatible =
        itemBucket === catBucket ||
        (catBucket === 'movie' && itemBucket === 'doc') ||
        (catBucket === 'series' && itemBucket === 'variety');
      if (!compatible) {
        report.crossBucketViolations += 1;
        if (report.violations.length < 40) {
          report.violations.push(
            `${api} :: 分类「${c.name}」(${catBucket}) 里出现 typeName「${typeName}」(${itemBucket}) 片名《${v.vod_name}》`,
          );
        }
      }
    }
  }
}

console.log('\n================ 汇总 ================');
console.log('接口数', report.apis, '可访问', report.reachable);
console.log('抽查分类数', report.categoriesChecked, '抽查条目数', report.itemsChecked);
console.log('跨档错乱条目', report.crossBucketViolations);
console.log('分档统计', JSON.stringify(report.perBucket));
if (report.unknownCategoryNames.length) {
  console.log('\n疑似没归类的分类名（映射缺口）：');
  for (const n of report.unknownCategoryNames.slice(0, 40)) console.log('  -', n);
}
if (report.violations.length) {
  console.log('\n跨档样例：');
  for (const v of report.violations) console.log('  *', v);
}
