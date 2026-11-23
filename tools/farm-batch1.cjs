const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const log = [];

// ── 1) MQTT 双通道：没有 TwGame 时自动走 broker.emqx.io（retained） ──
if (!t.includes('mqInit')) {
  t = t.replace(
    '  function push(type,payload){ pendingOps.push([type,payload]); }',
    `  var MQ={c:null,lastTs:0};
  function mqInit(){
    var s=document.createElement('script');
    s.src='https://cdn.bootcdn.net/ajax/libs/mqtt/4.3.7/mqtt.min.js';
    s.onload=function(){
      try{
        MQ.c=mqtt.connect('wss://broker.emqx.io:8084/mqtt',{clientId:'cf'+me,reconnectPeriod:4000,connectTimeout:8000,keepalive:30});
        MQ.c.on('connect',function(){ MQ.c.subscribe('couple/game/k7q2x9v3',{qos:1}); });
        MQ.c.on('message',function(_t,pl){
          var d; try{ d=JSON.parse(pl.toString()) }catch(e){ return }
          if(!d||d.d===me) return;
          if((d.ts||0)<=(MQ.lastTs||0)) return;
          MQ.lastTs=d.ts;
          if(d.w) dec(d.w);
          render();
        });
      }catch(e){}
    };
    document.head.appendChild(s);
  }
  function push(type,payload){ pendingOps.push([type,payload]); }`
  );
  log.push('MQTT通道');
}

// ── 2) netSend 里加 MQTT 分支 ──
t = t.replace(
  `  function netSend(force){
    if(!(window.TwGame&&TwGame.send)) return;`,
  `  function netSend(force){
    if(!(window.TwGame&&TwGame.send)){
      // 没有宿主通道时，走 MQTT retained（同一主题、同一状态串）
      if(MQ.c&&MQ.c.connected&&(force||pendingOps.length||tick%60===0)){
        try{ MQ.c.publish('couple/game/k7q2x9v3',JSON.stringify({d:me,ts:Date.now(),w:enc()}),{qos:1,retain:true}); }catch(e){}
        pendingOps=[];
      }
      return;
    }`
);

// ── 3) 初始化时按是否有宿主通道决定走哪条 ──
t = t.replace(
  "  try{ if(window.TwGame&&TwGame.send) role='A'; }catch(e){}",
  "  try{ if(window.TwGame&&TwGame.send) role='A'; }catch(e){}\n  if(!(window.TwGame&&TwGame.send)) mqInit();   // 没宿主 → 用 MQTT"
);

// ── 4) 底部商店条（3 种种子 + 价格，木牌样式，可点选） ──
if (!t.includes('商店条')) {
  t = t.replace(
    `    // 当前选中种子提示`,
    `    // 商店条：3 种种子（点选）
    var sw=Math.min(VW-24, CROPS.length*132), sx=(VW-sw)/2, sy=VH-42;
    var wood3=ctx.createLinearGradient(0,sy,0,sy+36);
    wood3.addColorStop(0,'#e2b981'); wood3.addColorStop(1,'#b07c46');
    ctx.save(); ctx.shadowColor='rgba(60,35,10,.3)'; ctx.shadowBlur=8; ctx.shadowOffsetY=2;
    ctx.fillStyle=wood3; roundRect(sx,sy,sw,36,10); ctx.fill(); ctx.restore();
    for(var ci=0;ci<CROPS.length;ci++){
      var cw=sw/CROPS.length, cx2=sx+ci*cw;
      if(ci===sel){ ctx.fillStyle='rgba(255,240,170,.55)'; roundRect(cx2+3,sy+3,cw-6,30,8); ctx.fill();
        ctx.strokeStyle='#a06e39'; ctx.lineWidth=2; roundRect(cx2+3,sy+3,cw-6,30,8); ctx.stroke(); }
      ctx.fillStyle='#3f2a12'; ctx.font='600 12px system-ui';
      ctx.fillText(CROPS[ci].name+'  '+CROPS[ci].seed+'金', cx2+10, sy+23);
    }
    ${'// 当前选中种子提示'}`
  );
  log.push('商店条');
}

// ── 5) 点底部商店条 = 换种子（要在田地判定之前） ──
t = t.replace(
  `  function act(px,py){
    // 底部：种子/畜栏`,
  `  function act(px,py){
    // 底部商店条优先
    if(py>VH-46){
      var sw2=Math.min(VW-24, CROPS.length*132), sx2=(VW-sw2)/2;
      if(px>=sx2&&px<=sx2+sw2){
        var k2=Math.floor((px-sx2)/(sw2/CROPS.length));
        if(k2>=0&&k2<CROPS.length){ sel=k2; window.__sfx&&__sfx(760,0.18); }
      }
      return;
    }
    // 底部：种子/畜栏`
);

// ── 6) 田埂栅栏：田区上方画一排木栅栏 ──
if (!t.includes('田埂栅栏')) {
  t = t.replace(
    '    // 田块底',
    `    // 田埂栅栏：田区顶部一排木桩
    var fg=geo();
    for(var fx=fg.x0; fx<fg.x0+fg.w; fx+=34){
      ctx.fillStyle='#b8874f'; ctx.fillRect(fx, fg.y0-20, 6, 18);
      ctx.fillStyle='#a06e39'; ctx.fillRect(fx+1, fg.y0-19, 3, 16);
    }
    ctx.strokeStyle='#c99a63'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(fg.x0, fg.y0-14); ctx.lineTo(fg.x0+fg.w, fg.y0-14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fg.x0, fg.y0-6); ctx.lineTo(fg.x0+fg.w, fg.y0-6); ctx.stroke();
    // 田块底`
  );
  log.push('栅栏');
}

fs.writeFileSync(p, t, 'utf8');
console.log('本轮改动:', log.join(' + ') || '无');
console.log('校验:', {
  mqtt: t.includes('mqInit'),
  商店: t.includes('商店条'),
  栅栏: t.includes('田埂栅栏'),
  点击换种: t.includes('底部商店条优先'),
});
