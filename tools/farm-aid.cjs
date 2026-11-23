const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const done = [];
function sub(from, to, tag) {
  if (!t.includes(from)) { console.log('MISS:', tag); return; }
  t = t.replace(from, to); done.push(tag);
}

// 1) 记录操作事件（给对面看"TA 帮你干了什么"）
sub(
  "    var full=null; var needFull=force||tick%60===0;",
  "    var full=null; var needFull=force||tick%60===0;",
  'noop'
);
sub(
  "        try{ MQ.c.publish('couple/game/k7q2x9v3',JSON.stringify({d:MQ.c.options.clientId,ts:Date.now(),w:enc()}),{qos:1,retain:true}); }catch(e){}",
  "        try{ MQ.c.publish('couple/game/k7q2x9v3',JSON.stringify({d:MQ.c.options.clientId,ts:Date.now(),w:enc(),o:pendingOps}),{qos:1,retain:true}); }catch(e){}",
  'MQTT 带操作'
);

// 2) 远端操作 → 互助提示
sub(
  "  window.onRemoteState=function(json){",
  `  function applyRemoteOps(ops){
    if(!ops||!ops.length) return;
    for(var i=0;i<ops.length;i++){
      var op=ops[i]||[], ty=op[0], arg=op[1];
      if(ty==='w') toast('💧 TA 给第 '+(arg+1)+' 块地浇了水','#1f5f8a');
      else if(ty==='h') toast('🧺 TA 收获了第 '+(arg+1)+' 块地','#2f6a26');
      else if(ty==='f') toast('🌾 TA 喂了'+((BREEDS[arg]||{}).name||'动物'),'#6b4a1e');
      else if(ty==='s') toast('💰 TA 卖了一批货','#8a5a1e');
      else if(ty==='q') toast('🎉 TA 领了每日任务奖励','#8a5a1e');
    }
  }
  window.onRemoteState=function(json){`,
  '互助提示函数'
);
sub(
  "    if(d.w) dec(d.w); else render();",
  "    if(d.w) dec(d.w); else render();\n    applyRemoteOps(d.o);",
  '宿主通道互助'
);
sub(
  "          if(d.w) dec(d.w);",
  "          if(d.w) dec(d.w);\n          applyRemoteOps(d.o);",
  'MQTT 互助'
);

// 3) 各处操作 push 事件
sub(
  "        coins-=crop.seed; t.crop=sel; t.grow=0; t.water=0; t.ready=false;\n        sfx(660,0.22); netSend(true);",
  "        coins-=crop.seed; t.crop=sel; t.grow=0; t.water=0; t.ready=false;\n        push('seed',sel); sfx(660,0.22); netSend(true);",
  '播种事件'
);
sub(
  "            stats.f++; day.f++; toast('喂了 '+br.name+'（-'+br.food+' 金）');\n            sfx(560,0.22); netSend(true);",
  "            stats.f++; day.f++; push('f',i3); toast('喂了 '+br.name+'（-'+br.food+' 金）');\n            sfx(560,0.22); netSend(true);",
  '喂食事件'
);
sub(
  "          pops.push({x:r.x+r.w*0.5,y:r.y+28,txt:'+'+br.sell,life:1});\n          sfx(980,0.3); checkAch(); netSend(true);",
  "          pops.push({x:r.x+r.w*0.5,y:r.y+28,txt:'+'+br.sell,life:1});\n          push('h',0); sfx(980,0.3); checkAch(); netSend(true);",
  '收蛋事件'
);
sub(
  "      sfx(900,0.3); checkAch(); netSend(true);\n    } else {",
  "      push('h',pi); sfx(900,0.3); checkAch(); netSend(true);\n    } else {",
  '收获事件'
);
sub(
  "        pops.push({x:px,y:py,txt:'💧 浇水',life:0.9});\n        sfx(820,0.24); netSend(true);",
  "        pops.push({x:px,y:py,txt:'💧 浇水',life:0.9});\n        push('w',pi); sfx(820,0.24); netSend(true);",
  '浇水事件'
);
sub(
  "    sfx(1040,0.3); checkAch(); netSend(true);\n    return true;",
  "    push('s',name); sfx(1040,0.3); checkAch(); netSend(true);\n    return true;",
  '单品卖出事件'
);
sub(
  "    sfx(1040,0.32); checkAch(); netSend(true);",
  "    push('s','all'); sfx(1040,0.32); checkAch(); netSend(true);",
  '全部卖出事件'
);
sub(
  "    sfx(1100,0.3); checkAch(); netSend(true);",
  "    push('q',i); sfx(1100,0.3); checkAch(); netSend(true);",
  '领奖事件'
);

fs.writeFileSync(p, t, 'utf8');
console.log('已改:', done.filter((d) => d !== 'noop').join(' / '));
