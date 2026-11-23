const fs = require('node:fs');
let t = fs.readFileSync('C:/ts/tools/dbg-farm2.cjs', 'utf8');
t = t.replace(
  `frame(3); goHandler(); frame(3);
brief('start');
const baseY = VH - 108, bw = (VW - 24 - 12) / 4;
tap(210, 20); frame(3); brief('market');
tap(100, 94); frame(3); brief('tab animal');
tap(100, 212); frame(3); brief('buy animal');
tap(300, 20); frame(3); brief('zoo scene');
tap(60, 100); frame(3); brief('select card');
tap(12 + bw + 4 + bw / 2, baseY + 46); frame(6); brief('feed');
tap(12 + bw / 2, baseY + 46); frame(40); brief('pet');
tap(100, 20); frame(3); brief('house scene');
tap(60, VH - 58 + 16); frame(3); brief('decor mode');`,
  `frame(3); goHandler(); frame(3);
brief('start');
tap(210, 20); frame(3); brief('market');
console.log('marketTab', sandbox.marketTab, 'scroll', sandbox.marketScroll);
const items = sandbox.marketItems();
console.log('first3', items.slice(0, 3).map((i) => i.n + '/' + i.p + '/locked=' + i.locked).join(' | '));
const cardBuyY = 132 + 10 + 92 - 30 + 12;
console.log('tap', 215, cardBuyY);
tap(215, cardBuyY); frame(3); brief('buy card1');
console.log('unlocked', JSON.stringify(sandbox.unlocked), 'coins', sandbox.coins);
`,
);
fs.writeFileSync('C:/ts/tools/dbg-farm4.cjs', t, 'utf8');
console.log('ok');
