const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 定长 base36（不足两位补 0），否则存档串会错位
sub("function b36(n){ return Math.max(0,n|0).toString(36); }",
    "function b36(n){ return Math.max(0,n|0).toString(36); }\nfunction pad36(n){ var s=b36(n); return s.length<2?('0'+s):s; }",
    'pad36');
sub("return (t.crop<0?'zz':b36(t.crop))+pad2(t.grow)+((t.ready)?'1':'0')+(t.water|0);",
    "return (t.crop<0?'zz':pad36(t.crop))+pad2(t.grow)+((t.ready)?'1':'0')+(t.water|0);",
    '地块定长');
sub("return b36(a.sp)+a.st+pad2(a.gr)+(a.aff|0)+(a.pen+2)+pad2(a.prog);",
    "return pad36(a.sp)+a.st+pad2(a.gr)+(a.aff|0)+(a.pen+2)+pad2(a.prog);",
    '动物定长');
sub("var u=Object.keys(unlocked).filter(function(k){return unlocked[k]}).map(function(k){return b36(+k)}).join('.');",
    "var u=Object.keys(unlocked).filter(function(k){return unlocked[k]}).map(function(k){return b36(+k)}).join('.');",
    'noop');
sub("var b=Object.keys(bag).filter(function(k){return bag[k]>0}).map(function(k){return b36(+k)+':'+bag[k]}).join('.');",
    "var b=Object.keys(bag).filter(function(k){return bag[k]>0}).map(function(k){return b36(+k)+':'+bag[k]}).join('.');",
    'noop2');
sub("var h=houseItems.map(function(o){return b36(o.i)+':'+b36(o.x)+':'+b36(o.y)}).join('.');",
    "var h=houseItems.map(function(o){return b36(o.i)+':'+b36(o.x)+':'+b36(o.y)}).join('.');",
    'noop3');
// 解析也按定长
sub("plots[i].crop=(t.substr(0,2)==='zz'?-1:un36(t.substr(0,2)));",
    "plots[i].crop=(t.substr(0,2)==='zz'?-1:un36(t.substr(0,2)));",
    'noop4');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.filter((x) => x !== 'noop' && x !== 'noop2' && x !== 'noop3' && x !== 'noop4').join(' / '));
