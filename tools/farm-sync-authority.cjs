const fs = require('node:fs');

/* ---------- 1) 把"谁是权威"传进游戏 ---------- */
const p0 = 'C:/ts/src/core/gameFarm.ts';
let t0 = fs.readFileSync(p0, 'utf8');
if (!t0.includes('MYROLE')) {
  t0 = t0.replace(
    'export function buildFarmHtml(): string {',
    `/**
 * @param role 当前账号在这个空间里的角色（'A' 创建者 / 'B' 另一方）。
 *   A 是世界的唯一写入者：B 的改动以"整包状态"发给 A，A 合并后再广播，
 *   这样两边不会互相覆盖（之前就是双方都在广播，谁最后发谁赢 → 钱数打架）。
 */
export function buildFarmHtml(role: 'A' | 'B' = 'A'): string {`,
  );
  t0 = t0.replace(
    "'var ANIMAL_SPRITES=' + JSON.stringify(ANIMAL_SPRITES) + ';';",
    "'var ANIMAL_SPRITES=' + JSON.stringify(ANIMAL_SPRITES) + ';' +\n    'var MYROLE=' + JSON.stringify(role === 'B' ? 'B' : 'A') + ';';",
  );
  fs.writeFileSync(p0, t0, 'utf8');
  console.log('buildFarmHtml(role) 已加');
}

/* ---------- 2) 引擎：单写者 + 合并 ---------- */
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1(`function netSend(force){
  if(!hasHost){
    if(MQ.c&&MQ.c.connected&&(force||pendingOps.length||tick%60===0)){
      try{ MQ.c.publish('couple/game/k7q2x9v3',JSON.stringify({d:MQ.cid,ts:Date.now(),w:enc(),o:pendingOps}),{qos:1,retain:true}); }catch(e){}
      pendingOps=[];
    }
    return;
  }
  var full=null; var needFull=force||tick%60===0;
  if(needFull) full=enc();
  if(!pendingOps.length&&!full) return;
  try{ TwGame.send(JSON.stringify({t:tick,w:full,o:pendingOps,x:me.x,y:me.y})); }catch(e){}
  pendingOps=[];
}`,
`/**
 * 同步策略（关键）：
 *  - A 是唯一写入者：只有 A 会周期性广播世界状态；
 *  - B 只在自己"真的改了东西"（force）时才发整包，平时只发心跳/位置；
 *  - A 收到 B 的整包 → 采纳（B 是改动发起方）→ 立刻把合并后的状态广播回去；
 *  - 这样不会出现"两边互相覆盖，谁最后发谁赢"导致钱数对不上。
 */
function netSend(force){
  var isA = (typeof MYROLE==='undefined') || MYROLE==='A';
  var needFull = force || (isA && tick%60===0);
  if(!hasHost){
    if(MQ.c&&MQ.c.connected&&(needFull||pendingOps.length)){
      try{ MQ.c.publish('couple/game/k7q2x9v3',
        JSON.stringify({d:MQ.cid,ts:Date.now(),w:needFull?enc():null,o:pendingOps,x:me.x,y:me.y}),
        {qos:1,retain:true}); }catch(e){}
      pendingOps=[];
    }
    return;
  }
  var full=needFull?enc():null;
  if(!pendingOps.length&&!full) return;
  try{ TwGame.send(JSON.stringify({t:tick,w:full,o:pendingOps,x:me.x,y:me.y})); }catch(e){}
  pendingOps=[];
}`, '单写者同步');

sub1(`window.onRemoteState=function(json){
  var d; try{ d=JSON.parse(json); }catch(e){ return; }
  if(!d) return;
  if(d.w) dec(d.w);
  applyRemoteOps(d.o);`,
`window.onRemoteState=function(json){
  var d; try{ d=JSON.parse(json); }catch(e){ return; }
  if(!d) return;
  var isA = (typeof MYROLE==='undefined') || MYROLE==='A';
  if(d.w){
    // 对方的整包：采纳（改动是对方做的，以对方为准）
    dec(d.w);
    if(isA){
      // A 是写入者：合并完立刻广播回去，让两边都收敛到同一份状态
      setTimeout(function(){ netSend(true); }, 60);
    }
  }
  applyRemoteOps(d.o);`, '合并并回广播');
fs.writeFileSync(p1, t1, 'utf8');

/* ---------- 3) MQTT 收到的包也可能不带 w ---------- */
const p2 = 'C:/ts/src/core/farmEngine1.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }
sub2(`          if(d.w) dec(d.w);
          applyRemoteOps(d.o);`,
`          if(d.w){ dec(d.w); if((typeof MYROLE==='undefined')||MYROLE==='A'){ setTimeout(function(){ netSend(true); },60); } }
          applyRemoteOps(d.o);`, 'MQTT 合并回广播');
fs.writeFileSync(p2, t2, 'utf8');

/* ---------- 4) games.tsx：把 role 传进去 ---------- */
const p3 = 'C:/ts/src/app/games.tsx';
let t3 = fs.readFileSync(p3, 'utf8');
if (!t3.includes('buildFarmHtml(store.role)') && !t3.includes('buildFarmHtml(role')) {
  t3 = t3.replace('buildFarmHtml()', "buildFarmHtml(((store as unknown as { role?: 'A' | 'B' }).role ?? 'A'))");
  fs.writeFileSync(p3, t3, 'utf8');
  console.log('games.tsx 传入 role');
}
console.log('改了:', ok.concat(ok2).join(' / '));
