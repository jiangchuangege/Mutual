const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const before = t;

t = t.replace(
  "  h.tap(100, cardBuyY);\n  h.frame(3);\n  let st = parse(h.lastState());\n  assert.ok(st.unlocked.length >= 2",
  "  h.tap(215, cardBuyY);\n  h.frame(3);\n  let st = parse(h.lastState());\n  assert.ok(st.unlocked.length >= 2",
);
t = t.replace('h.tap(12 + 7 * 74, 94); h.frame(3);      // 礼物页', 'h.tap(180, 118); h.frame(3);      // 礼物页');
t = t.replace(
  '  h.tap(195, 180); h.frame(3);\n  const tv',
  '  h.tap(195, 180); h.frame(3);\n  const hlsScript = h.document.head.children.find((n) => n.tagName === "SCRIPT");\n  if (hlsScript && hlsScript.onload) hlsScript.onload();\n  h.frame(3);\n  const tv',
);
if (!t.includes('SCRIPT_TAG')) {
  // 不需要额外常量了
}
fs.writeFileSync(p, t, 'utf8');
console.log('patched:', t !== before);
