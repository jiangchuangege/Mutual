const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) {
  if (!t.includes(from)) { console.log('MISS:', tag); return; }
  t = t.replace(from, to); ok.push(tag);
}

// 谷仓更大
sub('    var bw=Math.min(w*0.38,132), bh=Math.min(h*0.78,108);',
    '    var bw=Math.min(w*0.36,126), bh=Math.min(h*0.86,124);', '谷仓加大');

// 院子内容整体上移，别都堆在栅栏线上
sub(`    function hay(hx,hy,s3){`, `    function hay(hx,hy,s3){`, 'noop');

// 加蝴蝶 + 草丛石头，填补院子中部空白
sub(
  `    // 花圃
    var petals=['#e86a8f','#f2c86b','#b3a4e0','#7fc8a9','#e8836b'];`,
  `    // 蝴蝶
    var bfs=[[0.28,0.30,'#ffe08a'],[0.52,0.22,'#ffb0c8'],[0.86,0.34,'#c9b8ff']];
    for(var bf=0;bf<bfs.length;bf++){
      var bfx=x+w*bfs[bf][0]+Math.sin(tick/50+bf)*10, bfy=y+h*bfs[bf][1]+Math.cos(tick/70+bf)*7;
      var flap=Math.abs(Math.sin(tick/9+bf))*3.2;
      ctx.fillStyle=bfs[bf][2];
      ctx.beginPath(); ctx.ellipse(bfx-3,bfy,3.4,flap+1.4,-0.5,0,6.2832); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bfx+3,bfy,3.4,flap+1.4,0.5,0,6.2832); ctx.fill();
      ctx.fillStyle='rgba(60,40,20,.65)';
      ctx.fillRect(bfx-0.7,bfy-2,1.4,4);
    }
    // 草丛 / 石头点缀
    for(var tu=0;tu<5;tu++){
      var tx2=x+w*(0.1+tu*0.19), ty2=y+h*(0.42+((tu%2)*0.12));
      ctx.strokeStyle='rgba(72,150,62,.55)'; ctx.lineWidth=2;
      for(var bl2=-1;bl2<=1;bl2++){
        ctx.beginPath(); ctx.moveTo(tx2+bl2*3,ty2);
        ctx.lineTo(tx2+bl2*5,ty2-8-Math.abs(bl2)*2); ctx.stroke();
      }
    }
    ctx.fillStyle='#a9b0a0';
    ctx.beginPath(); ctx.ellipse(x+w*0.62,y+h*0.5,7,5,0,0,6.2832); ctx.fill();
    ctx.fillStyle='#8d9488';
    ctx.beginPath(); ctx.ellipse(x+w*0.62+6,y+h*0.52,4.5,3.2,0,0,6.2832); ctx.fill();

    // 花圃
    var petals=['#e86a8f','#f2c86b','#b3a4e0','#7fc8a9','#e8836b'];`,
  '蝴蝶草丛'
);

// 花圃挪到右侧空位（原来被池塘压住）
sub(`      var fx2=x+w*0.055+i2*15, fy2=y+h*0.99-((i2%2)*5);`,
    `      var fx2=x+w*0.83+i2*6, fy2=y+h*0.99-((i2%2)*5);`, '花圃挪位');

fs.writeFileSync(p, t, 'utf8');
console.log('已改:', ok.filter((x) => x !== 'noop').join(' / '));
