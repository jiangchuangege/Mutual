const m = require('../dist-core/gameFarm.js');
const a = m.buildFarmHtml('A');
const b = m.buildFarmHtml('B');
console.log('A 包里有 MYROLE=A :', a.includes('var MYROLE="A"') || a.includes("var MYROLE='A'") || a.includes('var MYROLE="A"'));
console.log('B 包里有 MYROLE=B :', b.includes('var MYROLE="B"'));
const idx = b.indexOf('var MYROLE=');
console.log('片段:', idx >= 0 ? b.slice(idx, idx + 30) : '没找到');

// 简单模拟：B 只在改动时发整包，A 收到后回广播
const A = a.slice(a.indexOf('var MYROLE='), a.indexOf('var MYROLE=') + 24);
const B = b.slice(b.indexOf('var MYROLE='), b.indexOf('var MYROLE=') + 24);
console.log('A:', A, '| B:', B);
