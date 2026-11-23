const fs = require('node:fs');
const p = 'C:/ts/src/core/farmArtKit2.ts';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf('function keyOutBackdrop(im){');
const end = t.indexOf('function animalSprite(k){');
if (start < 0 || end < 0) throw new Error('找不到 keyOutBackdrop');

const fn = `function keyOutBackdrop(im){
  var w=im.naturalWidth, h=im.naturalHeight;
  if(!w||!h) return null;
  var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  var cc=cv.getContext('2d');
  cc.drawImage(im,0,0);
  try{
    var data=cc.getImageData(0,0,w,h), px=data.data;
    // 1) 取"底框色"：从四条边内侧各取几个点，取出现最多的那个颜色
    var samples=[];
    function pick(x,y){ var i=((y|0)*w+(x|0))*4; samples.push([px[i],px[i+1],px[i+2]]); }
    for(var k=1;k<=6;k++){
      pick(w*k/7, h*0.03); pick(w*k/7, h*0.97);
      pick(w*0.03, h*k/7); pick(w*0.97, h*k/7);
    }
    var best=samples[0], bestN=-1;
    for(var a2=0;a2<samples.length;a2++){
      var n2=0;
      for(var b2=0;b2<samples.length;b2++){
        if(Math.abs(samples[a2][0]-samples[b2][0])<6&&Math.abs(samples[a2][1]-samples[b2][1])<6&&Math.abs(samples[a2][2]-samples[b2][2])<6) n2++;
      }
      if(n2>bestN){ bestN=n2; best=samples[a2]; }
    }
    var fr=best[0], fg=best[1], fb=best[2];
    // 2) 从边缘泛洪，只清掉和底框同色且连通的像素
    var seen=new Uint8Array(w*h), stack=[], cleared=0;
    function look(k){
      if(seen[k]) return;
      seen[k]=1;
      var i=k*4;
      if(Math.abs(px[i]-fr)>7||Math.abs(px[i+1]-fg)>7||Math.abs(px[i+2]-fb)>7) return;
      stack.push(k);
    }
    for(var x=0;x<w;x++){ look(x); look((h-1)*w+x); }
    for(var y=0;y<h;y++){ look(y*w); look(y*w+w-1); }
    while(stack.length){
      var k2=stack.pop(), i2=k2*4;
      px[i2+3]=0; cleared++;
      var xx=k2%w, yy=(k2/w)|0;
      if(xx>0) look(k2-1);
      if(xx<w-1) look(k2+1);
      if(yy>0) look(k2-w);
      if(yy<h-1) look(k2+w);
    }
    // 3) 保险：如果几乎整张都清了，说明抠过头，退回原图
    if(cleared>w*h*0.9) return null;
    cc.putImageData(data,0,0);
    return cv;
  }catch(e){
    return null;
  }
}
`;
t = t.slice(0, start) + fn + t.slice(end);
fs.writeFileSync(p, t, 'utf8');
console.log('底框色泛洪版就位');
