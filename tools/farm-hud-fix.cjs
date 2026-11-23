const fs = require('node:fs');

// 1) 截图/离线时可以用 #nomq 关掉 MQTT，避免公共 broker 上的旧 retained 状态干扰
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

sub("if(!hasHost) mqInit();",
    "var noMQ=false; try{ noMQ=/nomq/.test(location.hash||''); }catch(e){}\nif(!hasHost && !noMQ) mqInit();",
    'nomq');

// 2) HUD 金币/心动挪到第二行右侧，别被场景标签压住
sub(`  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='700 13px system-ui';
  ctx.textAlign='right';
  ctx.fillText('💰 '+coins, VW-14, 60);
  ctx.fillStyle='#ffd0e0';
  ctx.fillText('💗 '+hearts, VW-14, 32);
  ctx.textAlign='left';`,
`  ctx.textAlign='right'; ctx.font='700 13px system-ui';
  var coinTxt='💰 '+coins, heartTxt='💗 '+hearts;
  var cw2=ctx.measureText(coinTxt).width+16, hw2=ctx.measureText(heartTxt).width+16;
  ctx.fillStyle='rgba(24,40,30,.34)';
  rr(VW-14-cw2-hw2-8,42,cw2+hw2+8,26,9); ctx.fill();
  ctx.fillStyle='#fff8d8'; ctx.fillText(coinTxt, VW-14, 60);
  ctx.fillStyle='#ffd0e0'; ctx.fillText(heartTxt, VW-14-cw2-10, 60);
  ctx.textAlign='left';`,
    'HUD 金币位置');

fs.writeFileSync(p1, t, 'utf8');

// 3) 超市顶部提示文字会和分类标签重叠，去掉
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }
sub2(`  ctx.fillStyle='rgba(60,40,20,.45)'; ctx.font='10px system-ui';
  ctx.fillText('上下拖动列表 · 共 '+items.length+' 件', 14, 126);`, '', '去掉重叠提示');
fs.writeFileSync(p2, t2, 'utf8');

// 4) 截图脚本改成用 #nomq 打开
const p3 = 'C:/ts/tools/farm-scene.cjs';
let t3 = fs.readFileSync(p3, 'utf8');
t3 = t3.replace("const file = path.join(out, 'scene-' + mode + '.html');",
  "const file = path.join(out, 'scene-' + mode + '.html#nomq');");
fs.writeFileSync(p3, t3, 'utf8');

console.log('改了:', ok.concat(ok2).join(' / '), '| 截图加 #nomq');
