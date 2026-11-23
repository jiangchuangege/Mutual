// 生成"已经操作过几步"的农场页面，供 CDP 精确视口截图
const fs = require('node:fs');
const path = require('node:path');
const { buildFarmHtml } = require('../dist-core/gameFarm.js');

const mode = process.argv[2] || 'farm';
const out = path.resolve('tmp');
fs.mkdirSync(out, { recursive: true });

const kick = `<script>
(function(){
  var c=document.getElementById('c');
  function tap(x,y){
    c.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
  }
  function seq(list){
    var i=0;
    (function next(){
      if(i>=list.length) return;
      var f=list[i++];
      f();
      setTimeout(next,120);
    })();
  }
  var W=window.innerWidth, H=window.innerHeight;
  var boardTop=(H<640?74:92), bw=Math.min(W-20,382), bx=(W-bw)/2, bh=bw*(H<640?0.68:0.74);
  var shopH=(H<640?64:74), shopY=H-shopH-6, penH=(H<640?80:100), penY=shopY-10-penH;
  var cardBuyY=132+10+92-30+12;
  var steps=[];
  steps.push(function(){ var go=document.getElementById('go'); if(go) go.click(); });
  if('${mode}'==='farm'){
    steps.push(function(){ tap(bx+bw/8, boardTop+bh/6); });
    steps.push(function(){ tap(bx+bw*3/8, boardTop+bh/6); });
    steps.push(function(){ tap(bx+bw*5/8, boardTop+bh/6); });
    steps.push(function(){ tap(bx+bw*7/8, boardTop+bh/6); });
    steps.push(function(){ tap(bx+bw/8, boardTop+bh/2); });
    steps.push(function(){ tap(bx+bw*3/8, boardTop+bh/2); });
  }
  if('${mode}'==='market'){
    steps.push(function(){ tap(241, 20); });
    steps.push(function(){ tap(180, 94); });     // 装饰页
    steps.push(function(){ tap(215, cardBuyY); });
  }
  if('${mode}'==='shop'){
    steps.push(function(){ tap(266, 20); });       // 超市
    steps.push(function(){ tap(12+3*74, 94); });   // 零食页
    for(var s2=0;s2<4;s2++) steps.push(function(){ tap(100, cardBuyY); });
    steps.push(function(){ tap(12+3*74+74, 94); }); // 饮料页
    for(var s3=0;s3<3;s3++) steps.push(function(){ tap(100, cardBuyY); });
    steps.push(function(){ tap(193, 20); });       // 小卖部
    for(var s4=0;s4<5;s4++) steps.push(function(){ tap(10+58, H-50+16); });  // 一键上架
  }
  if('${mode}'==='zoo'){
    steps.push(function(){ tap(241, 20); });
    steps.push(function(){ tap(100, 94); });     // 动物页
    steps.push(function(){ tap(100, cardBuyY); });
    steps.push(function(){ tap(215, cardBuyY); });
    steps.push(function(){ tap(272, cardBuyY); });
    steps.push(function(){ tap(334, 20); });     // 去动物场景
    steps.push(function(){ tap(60, 100); });
  }
  if('${mode}'==='house' || '${mode}'==='tv'){
    steps.push(function(){ tap(241, 20); });
    steps.push(function(){ tap(180, 94); });     // 装饰页
    for(var k=0;k<6;k++) (function(kk){ steps.push(function(){ tap(100+ (kk%3)*119, cardBuyY + Math.floor(kk/3)*92); }); })(k);
    steps.push(function(){ tap(148, 20); });     // 进屋
    steps.push(function(){ tap(60, H-58+16); }); // 布置模式
    var spots=[[W*0.32,430],[W*0.72,430],[W*0.5,560],[W*0.24,620],[W*0.76,620],[W*0.5,H-140]];
    for(var i=0;i<6;i++) (function(ii){
      steps.push(function(){ tap(10+ii*((W-20)/6)+20, H-62+38); });   // 选第 ii 件
      steps.push(function(){ tap(spots[ii][0], spots[ii][1]); });      // 放下
    })(i);
    steps.push(function(){ tap(W-92+40, H-62+37); }); // 完成布置
    if('${mode}'==='tv') steps.push(function(){ tap(195, 180 + (H<640?-10:0)); });
  }
  seq(steps);
})();
</script>`;

let html = buildFarmHtml();
html = html.replace('</body>', kick + '</body>');
const file = path.join(out, 'scene-' + mode + '.html');
fs.writeFileSync(file, html, 'utf8');
console.log(file);
