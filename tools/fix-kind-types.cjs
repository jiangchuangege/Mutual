const fs = require('node:fs');

// 1) store.addGame 的 kind 类型放宽到 4 种（native 不会走这条路，但类型要一致）
let st = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
st = st.replace(
  "addGame(title: string, code: string, kind: 'html' | 'link' | 'source' = 'html'): boolean {",
  "addGame(title: string, code: string, kind: 'html' | 'link' | 'source' | 'native' = 'html'): boolean {"
);
fs.writeFileSync('C:/ts/src/store.tsx', st, 'utf8');

// 2) hub.addGame 的 input.kind 同步放宽
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace(
  "    input: { title: string; code: string; players?: 1 | 2; kind?: 'html' | 'link' | 'source' },",
  "    input: {\n      title: string;\n      code: string;\n      players?: 1 | 2;\n      kind?: 'html' | 'link' | 'source' | 'native';\n    },"
);
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');
console.log('kind 类型统一为 4 种');
