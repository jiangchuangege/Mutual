const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const seen = [];
function sub(from, to, tag) {
  if (!t.includes(from)) { console.log('MISS:', tag); return; }
  t = t.replace(from, to); seen.push(tag);
}

// 粒子容器 + 爆发函数
sub(
  "  var pops=[];                  // 飘字",
  `  var pops=[];                  // 飘字
  var parts=[];                 // 收获粒子（叶子/金币碎屑）
  function burst(x,y,col){
    for(var bi2=0;bi2<12;bi2++){
      var aa=Math.random()*6.2832, sp=40+Math.random()*95;
      parts.push({x:x,y:y,vx:Math.cos(aa)*sp,vy:Math.sin(aa)*sp-70,
        life:0.7+Math.random()*0.5,col:(bi2%3===0?'#ffe08a':col)});
    }
  }`,
  '粒子容器'
);

// 收获时炸一下
sub(
  "      push('h',pi); sfx(900,0.3); checkAch(); netSend(true);",
  "      burst(g2.x0+(pi%COLS+0.5)*g2.pw, g2.y0+Math.floor(pi/COLS)*g2.ph+g2.ph*0.5, cr.color);\n      push('h',pi); sfx(900,0.3); checkAch(); netSend(true);",
  '收获粒子'
);

// 成熟提示音
sub(
  "        if(t.grow>=CROPS[t.crop].grow){ t.ready=true; t.water=9; }",
  "        if(t.grow>=CROPS[t.crop].grow){ t.ready=true; t.water=9; sfx(1250,0.16); }",
  '成熟音效'
);

// 粒子物理
sub(
  "    for(var ti=toasts.length-1;ti>=0;ti--){ toasts[ti].life-=dt; if(toasts[ti].life<=0) toasts.splice(ti,1); }",
  `    for(var pa=parts.length-1;pa>=0;pa--){ var pt=parts[pa];
      pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.vy+=260*dt; pt.life-=dt;
      if(pt.life<=0) parts.splice(pa,1); }
    for(var ti=toasts.length-1;ti>=0;ti--){ toasts[ti].life-=dt; if(toasts[ti].life<=0) toasts.splice(ti,1); }`,
  '粒子物理'
);

// 粒子绘制（飘字之前）
sub(
  "    // 收益飘字\n    for(var pp=0;pp<pops.length;pp++){",
  `    // 收获粒子
    for(var pj=0;pj<parts.length;pj++){ var pt2=parts[pj];
      ctx.globalAlpha=Math.max(0,Math.min(1,pt2.life*1.6));
      ctx.fillStyle=pt2.col;
      ctx.beginPath(); ctx.arc(pt2.x,pt2.y,2.8,0,6.2832); ctx.fill();
      ctx.globalAlpha=1; }
    // 收益飘字
    for(var pp=0;pp<pops.length;pp++){`,
  '粒子绘制'
);

fs.writeFileSync(p, t, 'utf8');
console.log('已改:', seen.join(' / '));
