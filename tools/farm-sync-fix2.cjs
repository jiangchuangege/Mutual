const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 每个包都带上完整状态（否则 App 存的"局面"是空的，退出重进就回默认值）
sub(`function netSend(force){
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
}`,
`var restoredOnce=false;   // 有没有收到过对方的世界（决定"这次改动要不要广播"）
function netSend(force){
  var isA = (typeof MYROLE==='undefined') || MYROLE==='A';
  /*
   * 关键：每个包都必须带完整状态 w。
   * 因为 App 侧的存档就是"最后一次 send 的整段 JSON"，w 为空就等于把存档清了 →
   * 退出重进就会回到初始金币（之前 520 复活就是这么来的）。
   * 但"要不要采纳对方的状态"另说：chg 表示这条是本地真的改了东西。
   */
  var w=enc();
  var chg=(force && (isA || restoredOnce)) ? 1 : 0;
  if(!hasHost){
    if(MQ.c&&MQ.c.connected&&(chg||pendingOps.length||tick%60===0)){
      try{ MQ.c.publish('couple/game/k7q2x9v3',
        JSON.stringify({d:MQ.cid,ts:Date.now(),w:w,o:pendingOps,x:me.x,y:me.y,from:MYROLE,chg:chg}),
        {qos:1,retain:true}); }catch(e){}
      pendingOps=[];
    }
    return;
  }
  if(!pendingOps.length && !chg && tick%60!==0) return;
  try{ TwGame.send(JSON.stringify({t:tick,w:w,o:pendingOps,x:me.x,y:me.y,from:MYROLE,chg:chg})); }catch(e){}
  pendingOps=[];
}`, '每包带全量状态');

// 2) 收包：A 的状态一律采纳；B 只有 chg=1 才采纳（否则会把 A 的进度冲掉）
sub(`  var isA = (typeof MYROLE==='undefined') || MYROLE==='A';
  if(d.w){
    // 对方的整包：采纳（改动是对方做的，以对方为准）
    dec(d.w);
    if(isA){
      // A 是写入者：合并完立刻广播回去，让两边都收敛到同一份状态
      setTimeout(function(){ netSend(true); }, 60);
    }
  }
  applyRemoteOps(d.o);`,
`  var isA = (typeof MYROLE==='undefined') || MYROLE==='A';
  if(d.w){
    var fromA = (d.from === 'A') || (typeof d.from==='undefined');
    // A 的世界一律采纳；B 发来的只有"真的改了东西"才采纳，避免它把 A 的进度冲回旧值
    if(fromA || d.chg){
      dec(d.w);
      restoredOnce=true;
      if(isA){
        // A 是写入者：合并完立刻回广播，让两边收敛到同一份
        setTimeout(function(){ netSend(true); }, 60);
      }
    } else {
      // 只是心跳：状态不采纳，但至少说明对方在线
      if(!restoredOnce && fromA) restoredOnce=true;
    }
  }
  applyRemoteOps(d.o);`, '收包采纳规则');

// 3) MQTT 分支同样规则
sub(`          if(d.w){ dec(d.w); if((typeof MYROLE==='undefined')||MYROLE==='A'){ setTimeout(function(){ netSend(true); },60); } }
          applyRemoteOps(d.o);`,
`          if(d.w){
            var fA=(d.from==='A')||(typeof d.from==='undefined');
            if(fA||d.chg){
              dec(d.w); restoredOnce=true;
              if((typeof MYROLE==='undefined')||MYROLE==='A'){ setTimeout(function(){ netSend(true); },60); }
            }
          }
          applyRemoteOps(d.o);`, 'MQTT 采纳规则');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
