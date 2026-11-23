const fs = require('node:fs');

/* ---------- 1) 自定义直播源：持久化 + 弹窗输入 ---------- */
const p1 = 'C:/ts/src/core/farmEngine1.ts';
let t1 = fs.readFileSync(p1, 'utf8');
const ok = [];
function sub1(from, to, tag) { if (!t1.includes(from)) { console.log('MISS', tag); return; } t1 = t1.replace(from, to); ok.push(tag); }

sub1("  return ['v4',p,z,penCount,coins,hearts,u,b,d,h,st,dy,ach,sel].join('|');",
     "  return ['v4',p,z,penCount,coins,hearts,u,b,d,h,st,dy,ach,sel,\n    (typeof TV!=='undefined'&&TV.custom)?encodeURIComponent(TV.custom):''].join('|');", '存自定义源');
sub1("    ach=+seg[12]||0; sel=+seg[13]||0;\n    return;",
     "    ach=+seg[12]||0; sel=+seg[13]||0;\n    if(seg[14]&&typeof TV!=='undefined'){ try{ TV.custom=decodeURIComponent(seg[14]); }catch(e){} }\n    return;", '读自定义源');
fs.writeFileSync(p1, t1, 'utf8');

/* ---------- 2) 换源弹窗 + 小屋按钮 ---------- */
const p2 = 'C:/ts/src/core/farmEngine2.ts';
let t2 = fs.readFileSync(p2, 'utf8');
const ok2 = [];
function sub2(from, to, tag) { if (!t2.includes(from)) { console.log('MISS', tag); return; } t2 = t2.replace(from, to); ok2.push(tag); }

sub2("/* ================= 输入 ================= */",
`/** 换源：手填一个 m3u8（存在存档里，下次还用它） */
function openTvSourceDialog(){
  if(TV.dlg) return;
  var d=document.createElement('div');
  d.id='tvsrc';
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:995;display:flex;'+
    'flex-direction:column;align-items:center;justify-content:center;padding:18px;gap:10px';
  var title=document.createElement('div');
  title.textContent='换直播源（填一个能播的 .m3u8 地址）';
  title.style.cssText='color:#fff;font:600 13px system-ui;text-align:center';
  var inp=document.createElement('input');
  inp.type='text';
  inp.value=TV.custom||'';
  inp.placeholder='https://.../cctv1.m3u8';
  inp.style.cssText='width:100%;max-width:420px;padding:10px;border-radius:8px;border:0;font:13px system-ui';
  var row=document.createElement('div');
  row.style.cssText='display:flex;gap:8px;width:100%;max-width:420px';
  function mk(txt,fn,col){
    var b=document.createElement('button');
    b.textContent=txt;
    b.style.cssText='flex:1;padding:10px;border-radius:8px;border:0;color:#fff;font:600 13px system-ui;background:'+(col||'#2b2b33');
    b.onclick=fn; return b;
  }
  function close(){ if(TV.dlg&&TV.dlg.parentNode) TV.dlg.parentNode.removeChild(TV.dlg); TV.dlg=null; }
  row.appendChild(mk('用这个源',function(){
    var v=(inp.value||'').trim();
    TV.custom=v; close();
    toast(v?'已换成自定义源':'已清空自定义源','#2f6a26');
    netSend(true);
    if(TV.video) playChannel(TV.ch,0);
  },'#2f6a26'));
  row.appendChild(mk('自动挑源',function(){
    TV.custom=''; close(); toast('改回自动挑源'); netSend(true);
    if(TV.video) playChannel(TV.ch,0);
  },'#3a5a8a'));
  row.appendChild(mk('取消',close,'#7a2a2a'));
  d.appendChild(title); d.appendChild(inp); d.appendChild(row);
  document.body.appendChild(d);
  TV.dlg=d;
}

/* ================= 输入 ================= */`, '换源弹窗');

// 小屋底部加"换源"按钮
sub2(`  woodBtn(244,by3,VW-254,32,false,houseItems.length?('已摆 '+houseItems.length+' 件'):'还没有装饰');`,
`  var bw3=(VW-24-12)/3;
  woodBtn(244,by3,Math.max(80,VW-254),32,false,houseItems.length?('已摆 '+houseItems.length+' 件'):'还没有装饰');`, 'noop');
fs.writeFileSync(p2, t2, 'utf8');

/* ---------- 3) 房间底部按钮：布置 / 买装饰 / 换源 ---------- */
const p3 = 'C:/ts/src/core/farmRoomShop.ts';
let t3 = fs.readFileSync(p3, 'utf8');
const ok3 = [];
function sub3(from, to, tag) { if (!t3.includes(from)) { console.log('MISS', tag); return; } t3 = t3.replace(from, to); ok3.push(tag); }
sub3(`  var by3=VH-50;
  woodBtn(10,by3,118,32,false,'🛋 布置小窝');
  woodBtn(134,by3,104,32,false,'🛒 买装饰');
  var bw3=(VW-24-12)/3;
  woodBtn(244,by3,Math.max(80,VW-254),32,false,houseItems.length?('已摆 '+houseItems.length+' 件'):'还没有装饰');`,
`  var by3=VH-50;
  var bw3=(VW-24-8*2)/3;
  woodBtn(10,by3,bw3,32,false,'🛋 布置小窝');
  woodBtn(10+bw3+8,by3,bw3,32,false,'🛒 买装饰');
  woodBtn(10+(bw3+8)*2,by3,bw3,32,false,'📺 换源');`, '三个按钮');

sub3(`  var by3=VH-50;
  if(py>=by3&&py<=by3+32){
    if(px>=10&&px<=128){ decorMode=true; decorSel=-1; return; }
    if(px>=134&&px<=238){ scene='market'; marketTab=2; marketScroll=0; return; }
  }`,
`  var by3=VH-50;
  var bw3=(VW-24-16)/3;
  if(py>=by3&&py<=by3+32){
    if(px>=10&&px<=10+bw3){ decorMode=true; decorSel=-1; return; }
    if(px>=10+bw3+8&&px<=10+(bw3+8)*2){ scene='market'; marketTab=2; marketScroll=0; return; }
    if(px>=10+(bw3+8)*2&&px<=10+(bw3+8)*2+bw3){ openTvSourceDialog(); return; }
  }`, '按钮点击');
fs.writeFileSync(p3, t3, 'utf8');
console.log('改了:', ok.concat(ok2).concat(ok3).filter((x) => x !== 'noop').join(' / '));
