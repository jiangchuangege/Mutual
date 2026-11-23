const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p, 'utf8');
const from = `        if(d.w) dec(d.w);
        applyRemoteOps(d.o);`;
const to = `        if(d.w){
          var fA=(d.from==='A')||(typeof d.from==='undefined');
          if(fA||d.chg){
            dec(d.w); restoredOnce=true;
            if((typeof MYROLE==='undefined')||MYROLE==='A'){ setTimeout(function(){ netSend(true); },60); }
          }
        }
        applyRemoteOps(d.o);`;
if (!t.includes(from)) throw new Error('找不到 MQTT 分支');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('MQTT 分支采纳规则已补');
