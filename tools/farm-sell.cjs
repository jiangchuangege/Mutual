const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const log = [];

// 1) 仓库面板上移，避免与底部商店条重叠
if (t.includes('by=VH-70')) {
  t = t.replace('by=VH-70', 'by=VH-108');
  log.push('仓库上移');
}

// 2) 点仓库面板 = 一键卖出（金币 + 飘字 + 清空仓库）
if (!t.includes('一键卖出')) {
  t = t.replace(
    '    // 底部商店条优先',
    `    // 仓库一键卖出（点在仓库木牌上）
    if(py>VH-112&&py<VH-72&&Object.keys(bag).some(function(k){return bag[k]>0})){
      var income=0;
      for(var bk in bag){
        if(!bag[bk]) continue;
        income += bag[bk]*(PRODUCT_PRICE[bk]||12);
      }
      if(income>0){
        coins+=income; bag={};
        pops.push({x:VW/2,y:VH-120,txt:'+'+income+' 卖光了',life:1.4});
        window.__sfx&&__sfx(1040,0.3);
        netSend(true);
      }
      return;
    }
    // 底部商店条优先`
  );
  // 产物单价表
  t = t.replace(
    '  var pops=[];',
    `  var PRODUCT_PRICE={'草莓':26,'胡萝卜':20,'向日葵':34,'鸡蛋':18,'牛奶':40,'萝卜':24};
  var pops=[];`
  );
  log.push('一键卖出');
}

fs.writeFileSync(p, t, 'utf8');
console.log('本轮:', log.join(' + ') || '无', '| 校验:', {
  上移: t.includes('by=VH-108'),
  卖出: t.includes('一键卖出'),
  价表: t.includes('PRODUCT_PRICE'),
});
