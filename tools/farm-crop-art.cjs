const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');

// 作物画得更"有质感"：叶片带渐变、成熟时果实高光 + 呼吸缩放 + 光晕环
const old = `        } else {       // 成熟：果子 + 光晕
          var gg=ctx.createRadialGradient(px+w/2,py+h/2,4,px+w/2,py+h/2,w*0.6);
          gg.addColorStop(0,'rgba(255,255,200,.55)'); gg.addColorStop(1,'rgba(255,255,200,0)');
          ctx.fillStyle=gg; ctx.fillRect(px,py,w,h);
          ctx.fillStyle=cr.color;
          for(var f=0;f<5;f++){
            var ax=px+w*0.28+(f%3)*w*0.22, ay=py+h*0.35+Math.floor(f/3)*h*0.3;
            ctx.beginPath(); ctx.arc(ax,ay,w*0.09,0,6.28); ctx.fill();
          }
          ctx.strokeStyle=cr.leaf; ctx.lineWidth=3;
          ctx.beginPath(); ctx.moveTo(px+w/2,py+h-6); ctx.lineTo(px+w/2,py+h*0.45); ctx.stroke();
        }`;

const neu = `        } else {       // 成熟：呼吸缩放 + 光晕环 + 带高光的果子
          var pulse=1+Math.sin(tick/18)*0.04;
          ctx.save();
          ctx.translate(px+w/2,py+h/2); ctx.scale(pulse,pulse); ctx.translate(-(px+w/2),-(py+h/2));
          // 光晕
          var gg=ctx.createRadialGradient(px+w/2,py+h/2,4,px+w/2,py+h/2,w*0.62);
          gg.addColorStop(0,'rgba(255,250,200,.6)'); gg.addColorStop(1,'rgba(255,250,200,0)');
          ctx.fillStyle=gg; ctx.fillRect(px,py,w,h);
          // 茎与叶
          ctx.strokeStyle=cr.leaf; ctx.lineWidth=3;
          ctx.beginPath(); ctx.moveTo(px+w/2,py+h-6); ctx.lineTo(px+w/2,py+h*0.42); ctx.stroke();
          var lf=ctx.createLinearGradient(px,py,px,py+h);
          lf.addColorStop(0,'#6fce7a'); lf.addColorStop(1,cr.leaf);
          ctx.fillStyle=lf;
          ctx.beginPath(); ctx.ellipse(px+w*0.34,py+h*0.66,w*0.2,h*0.12,-0.5,0,6.28); ctx.fill();
          ctx.beginPath(); ctx.ellipse(px+w*0.68,py+h*0.58,w*0.19,h*0.11,0.5,0,6.28); ctx.fill();
          // 果子（带高光）
          for(var f=0;f<4;f++){
            var ax=px+w*0.3+(f%2)*w*0.38, ay=py+h*0.3+Math.floor(f/2)*h*0.26;
            var fr=w*0.1;
            var fg=ctx.createRadialGradient(ax-fr*0.35,ay-fr*0.35,fr*0.2,ax,ay,fr);
            fg.addColorStop(0,'#fff'); fg.addColorStop(.35,cr.color); fg.addColorStop(1,cr.color);
            ctx.fillStyle=fg;
            ctx.beginPath(); ctx.arc(ax,ay,fr,0,6.28); ctx.fill();
          }
          ctx.restore();
          // 成熟标记环
          ctx.strokeStyle='rgba(255,225,130,'+(0.45+0.25*Math.sin(tick/16))+')'; ctx.lineWidth=3;
          roundRect(px+2,py+2,w-4,h-4,10); ctx.stroke();
        }`;

if (!t.includes(old)) throw new Error('成熟作物绘制段未找到');
t = t.replace(old, neu);
fs.writeFileSync(p, t, 'utf8');
console.log('作物升级:', { 呼吸: t.includes('pulse=1+Math.sin'), 高光果: t.includes('fg.addColorStop(0,\'#fff\')'), 标记环: t.includes('成熟标记环') });
