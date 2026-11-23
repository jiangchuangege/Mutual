const fs = require('node:fs');

// 1) hub：代码上限 400KB → 8MB（真正的大图/大代码走上传通道，这里只是防呆）
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace(
  "    if (code.length > 400_000) return fail('代码太长了（上限 400KB）');",
  "    // 上限只是防呆：真要更大就走 /api/upload 上传成文件（那条路能到 60MB）\n    if (code.length > 8_000_000) return fail('代码超过 8MB，请改用「上传成文件」方式');"
);

// 2) hub：局面上限 200KB → 2MB（农场类的世界存档会比 200KB 大）
h = h.replace(
  "    if (text.length > 200_000) return fail('局面数据太大了');",
  "    // 农场/沙盒类的世界存档：放宽到 2MB\n    if (text.length > 2_000_000) return fail('局面数据太大了（上限 2MB）');"
);
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');

// 3) 客户端：超过 2MB 才转上传（原来 300KB 就转，导致农场这种大代码老被踢去上传）
let g = fs.readFileSync('C:/ts/src/app/games.tsx', 'utf8');
g = g.replace(
  'if (code.length > 300_000) {',
  'if (code.length > 2_000_000) {'
);
fs.writeFileSync('C:/ts/src/app/games.tsx', g, 'utf8');

console.log('上限已放开:', {
  hub代码: h.includes('8_000_000'),
  hub局面: h.includes('2_000_000'),
  客户端阈值: g.includes('> 2_000_000'),
});
