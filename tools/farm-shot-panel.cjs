const fs = require('node:fs');
const p = 'C:/ts/tools/farm-shot.cjs';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('PANEL')) {
  s = s.replace(
    "html = html.replace('</body>', kick + '</body>');",
    `html = html.replace('</body>', kick + '</body>');
if (process.env.PANEL) {
  const extra = \`<script>setTimeout(function(){
    var W=\${W}, H=\${H};
    var c=document.getElementById('c');
    function tap(x,y){ c.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true})); }
    var boardTop=(H<640?74:92), bw=Math.min(W-20,382), bx=(W-bw)/2, bh=bw*(H<640?0.72:0.79);
    for(var r=0;r<3;r++) for(var q=0;q<4;q++) tap(bx+(bw/4)*(q+0.5), boardTop+(bh/3)*(r+0.5));
    var shopH=(H<640?64:78), shopY=H-shopH-6, penH=(H<640?84:106), penY=shopY-10-penH;
    tap(60, penY+penH*0.6); tap(W/2, penY+penH*0.6); tap(W-60, penY+penH*0.6);
    setTimeout(function(){
      tap(W-(\${process.env.PANEL === 'bag' ? 104 : 56})+20, 32);
    }, 500);
  },1600);</script>\`;
  html = html.replace('</body>', extra + '</body>');
}`
  );
  fs.writeFileSync(p, s, 'utf8');
  console.log('farm-shot 支持 PANEL');
} else {
  console.log('已支持');
}
