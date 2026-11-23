const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) {
  if (!t.includes(from)) { console.log('MISS:', tag); return; }
  t = t.replace(from, to); ok.push(tag);
}

// 动物图集的白底抠掉（一次性离屏处理，只抠 rgb≥238 的近白，动物身上的白毛保留）
sub(
  `  var sheet=new Image(); sheet.src='\${FARM_ANIMAL_SHEET}';`,
  `  var sheetRaw=new Image(); sheetRaw.src='\${FARM_ANIMAL_SHEET}';
  var sheet=document.createElement('canvas'), sheetOk=false;
  sheetRaw.onload=function(){
    try{
      sheet.width=sheetRaw.naturalWidth||sheetRaw.width;
      sheet.height=sheetRaw.naturalHeight||sheetRaw.height;
      var sc=sheet.getContext('2d');
      sc.drawImage(sheetRaw,0,0);
      var dd=sc.getImageData(0,0,sheet.width,sheet.height), pxs=dd.data;
      for(var i=0;i<pxs.length;i+=4){
        if(pxs[i]>=238&&pxs[i+1]>=238&&pxs[i+2]>=238) pxs[i+3]=0;
      }
      sc.putImageData(dd,0,0);
      sheetOk=true;
    }catch(e){ sheetOk=false; }
  };`,
  '抠白底'
);
sub(
  `  function drawAnimal(name,x,y,size){
    var a=ANIMALS[name]; if(!a||!sheet.complete) return;
    var ar=a[3]/a[2], h=size, w=h/ar;
    ctx.drawImage(sheet,a[0],a[1],a[2],a[3],x-w/2,y-h,w,h);
  }`,
  `  function drawAnimal(name,x,y,size){
    var a=ANIMALS[name]; if(!a) return;
    var img=sheetOk?sheet:(sheetRaw.complete&&sheetRaw.naturalWidth?sheetRaw:null);
    if(!img) return;
    var ar=a[3]/a[2], h=size, w=h/ar;
    ctx.drawImage(img,a[0],a[1],a[2],a[3],x-w/2,y-h,w,h);
  }`,
  'drawAnimal'
);

fs.writeFileSync(p, t, 'utf8');
console.log('已改:', ok.join(' / '));
