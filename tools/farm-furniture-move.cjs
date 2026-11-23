const fs = require('node:fs');
const p = 'C:/ts/src/core/farmRoomShop.ts';
let t = fs.readFileSync(p, 'utf8');

const from = `  // 点已摆家具 → 收起
  for(var i=houseItems.length-1;i>=0;i--){
    var it=houseItems[i], def=DECOR[it.i]; if(!def) continue;
    var depth=Math.max(0,Math.min(1,(it.y-g.floorY)/Math.max(1,g.floorH)));
    var hh=(def.big?128:92)*depthScale(depth)*Math.min(1,VH/620);
    var w2=hh*furnAspect(def.f);
    if(px>=it.x-w2/2&&px<=it.x+w2/2&&py>=it.y-hh&&py<=it.y){
      ownedDecor.push(it.i); houseItems.splice(i,1);
      toast('收起：'+def.n); netSend(true); return;
    }
  }`;
const to = `  // 点已摆家具 → 拿起来重新摆（任何一件都能编辑位置）
  for(var i=houseItems.length-1;i>=0;i--){
    var it=houseItems[i], def=DECOR[it.i]; if(!def) continue;
    var depth=Math.max(0,Math.min(1,(it.y-g.floorY)/Math.max(1,g.floorH)));
    var hh=(def.big?128:92)*depthScale(depth)*Math.min(1,VH/620);
    var w2=hh*furnAspect(def.f);
    if(px>=it.x-w2/2&&px<=it.x+w2/2&&py>=it.y-hh&&py<=it.y){
      // 拿出来放到待摆清单最前面，直接进布置模式，点地面就是新位置
      ownedDecor.unshift(it.i);
      houseItems.splice(i,1);
      decorMode=true; decorSel=0;
      toast('移动「'+def.n+'」：点地面放到新位置','#6b4a1e');
      sfx(700,0.2); netSend(true); return;
    }
  }`;
if (!t.includes(from)) throw new Error('找不到收起逻辑');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('家具改成「点一下拿起来，点地面放新位置」');
