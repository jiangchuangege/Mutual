const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 关键：读存档发生在文件很靠前的位置，那时 LS_KEY 还没赋值（var 只提升声明不提升值）
sub(`var LS_KEY='mutual_farm_v1';
function saveLocalNow(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify({ts:Date.now(),w:enc()})); }catch(e){}
}
function loadLocalSave(){
  try{
    var raw=localStorage.getItem(LS_KEY);`,
`var LS_KEY='mutual_farm_v1';
function saveLocalNow(){
  try{ localStorage.setItem('mutual_farm_v1', JSON.stringify({ts:Date.now(),w:enc()})); }catch(e){}
}
function loadLocalSave(){
  try{
    var raw=localStorage.getItem('mutual_farm_v1');`, '用字面量取存档键');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
