const fs = require('node:fs');
let t = fs.readFileSync('C:/ts/tools/dbg-farm2.cjs', 'utf8');
t = t.replace(
  `tap(100, 20); frame(3); brief('house scene');
tap(60, VH - 58 + 16); frame(3); brief('decor mode');`,
  `tap(150, 20); frame(3); brief('house scene');
tap(60, VH - 58 + 16); frame(3); brief('decor mode');
tap(VW - 92 + 40, VH - 62 + 37); frame(3); brief('decor done');
tap(195, 180); frame(3); brief('tap TV');
console.log('head scripts', (head.children || []).length, 'body kids', body.children.map((n) => n.id || n.tagName).join(','));
const scr = (head.children || []).find((n) => n.tagName === 'SCRIPT');
if (scr && scr.onload) { scr.onload(); frame(3); }
console.log('after hls onload body kids', body.children.map((n) => n.id || n.tagName).join(','));
// 超市解锁
tap(241, 20); frame(3); brief('market again');
const cardBuyY = 132 + 10 + 92 - 30 + 12;
console.log('trying buy card1 at (215,' + cardBuyY + ')');
tap(215, cardBuyY); frame(3); brief('buy seed card1');
console.log('unlocked keys', Object.keys(sandbox.unlocked || {}));
console.log('marketTab', sandbox.marketTab, 'coins', sandbox.coins);
const items = sandbox.marketItems ? sandbox.marketItems() : [];
console.log('items0..2', items.slice(0, 3).map((i) => i.n + '/' + i.p + '/' + i.locked).join(' | '));
`,
);
fs.writeFileSync('C:/ts/tools/dbg-farm3.cjs', t, 'utf8');
console.log('ok');
