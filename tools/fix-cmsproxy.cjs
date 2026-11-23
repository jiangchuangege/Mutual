const fs = require('node:fs');
const p = 'C:/ts/server/cmsProxy.mjs';
let t = fs.readFileSync(p, 'utf8');

// 1) 干掉混进来的 TS 语法
t = t.replace(
  `function pickTotal(payload) {
  const raw = (payload ?? {}) asRecord();
  const page = Number(raw.page ?? raw.pg ?? 1) || 1;
  const pageCount =
    Number(raw.pagecount ?? raw.total_page ?? raw.page_count ?? raw.pages ?? 0) || 0;
  const total = Number(raw.total ?? raw.recordcount ?? raw.total_count ?? 0) || 0;
  return { page, pageCount, total };
}

function asRecord() {
  return {};
}`,
  `function pickTotal(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const page = Number(raw.page ?? raw.pg ?? 1) || 1;
  const pageCount = Number(raw.pagecount ?? raw.total_page ?? raw.page_count ?? raw.pages ?? 0) || 0;
  const total = Number(raw.total ?? raw.recordcount ?? raw.total_count ?? 0) || 0;
  return { page, pageCount, total };
}`,
);

t = t.replace('const { page, pageCount, total } = pickTotal(payload as never);',
              'const { page, pageCount, total } = pickTotal(payload);');

t = t.replace(`        list.find((it) => String((it as Record<string, unknown>).vod_id ?? '') === id) ??
        list.find((it) => {
          const r = it as Record<string, unknown>;
          const n = String(r.vod_name ?? '').trim();
          const y = String(r.vod_year ?? '').trim().slice(0, 4);
          return name && n === name && (!year || y === year);
        }) ??
        (id ? null : list[0]);`,
`        list.find((it) => String((it && it.vod_id) ?? '') === id) ??
        list.find((it) => {
          const n = String((it && it.vod_name) ?? '').trim();
          const y = String((it && it.vod_year) ?? '').trim().slice(0, 4);
          return Boolean(name) && n === name && (!year || y === year);
        }) ??
        (id ? null : list[0]);`);

t = t.replace('      const rec = target as Record<string, unknown>;', '      const rec = target || {};');

fs.writeFileSync(p, t, 'utf8');
console.log('TS 语法清理完成');
