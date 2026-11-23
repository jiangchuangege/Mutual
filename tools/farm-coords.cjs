const fs = require('node:fs');

// 1) 截图脚本里的点击坐标跟着新几何走
const sp = 'C:/ts/tools/farm-shot.cjs';
let s = fs.readFileSync(sp, 'utf8');
s = s.replace(
  `  var boardTop=60, boardBottom=H-6-78-8-74-8;
  var bw=Math.min(W-24,(boardBottom-boardTop)*1.65), bx=(W-bw)/2;`,
  `  var boardTop=(H<640?74:92), bw=Math.min(W-20,382), bx=(W-bw)/2;
  var bh=bw*(H<640?0.72:0.79);
  var shopH=(H<640?64:78), shopY=H-shopH-6;
  var penH=(H<640?84:106), penY=shopY-10-penH;
  var cellH=(shopH-20)/2;`
);
s = s.replace(
  `    for(var i=0;i<12;i++){
      var sel=Math.floor(i/2);
      var sx=25+ (sel%3)*(340/3) +20, sy=(sel<3? H-72 : H-36);
      tap(sx,sy);
      var px=bx+(bw/4)*((i%4)+0.5), py=boardTop+((boardBottom-boardTop)/3)*(Math.floor(i/4)+0.5);
      tap(px,py);
    }
    /* 前 3 块浇透水 */
    for(var w2=0;w2<3;w2++){
      var px2=bx+(bw/4)*(w2+0.5), py2=boardTop+((boardBottom-boardTop)/3)*0.5;
      tap(px2,py2); tap(px2,py2); tap(px2,py2);
    }
    /* 喂鸡 */
    tap(60, boardBottom+8+40);
    tap(W/2, boardBottom+8+40);
    tap(W-60, boardBottom+8+40);`,
  `    for(var i=0;i<12;i++){
      var sel=Math.floor(i/2);
      var sx=25+ (sel%3)*(340/3) +20, sy=(sel<3? shopY+18+cellH*0.5 : shopY+18+cellH*1.5);
      tap(sx,sy);
      var px=bx+(bw/4)*((i%4)+0.5), py=boardTop+(bh/3)*(Math.floor(i/4)+0.5);
      tap(px,py);
    }
    /* 前 3 块浇水 */
    for(var w2=0;w2<3;w2++){
      var px2=bx+(bw/4)*(w2+0.5), py2=boardTop+(bh/3)*0.5;
      tap(px2,py2); tap(px2,py2);
    }
    /* 喂三只动物 */
    tap(60, penY+penH*0.6);
    tap(W/2, penY+penH*0.6);
    tap(W-60, penY+penH*0.6);`
);
fs.writeFileSync(sp, s, 'utf8');

// 2) 测试里的坐标
const tp = 'C:/ts/tests/farm-html.test.js';
let tt = fs.readFileSync(tp, 'utf8');
tt = tt.replace("const BOARD_TOP = 86;", "const BOARD_TOP = 92;\n// 田板宽度 = min(VW-20, 382)，高度 = 宽度 * 0.79\nconst BOARD_W = Math.min(VW - 20, 382);\nconst BOARD_H = BOARD_W * 0.79;");
tt = tt.replace(
  "  h.click(81, VH - 74);             // 商店第一格：选草莓（生长 14 秒）\n  const boardBottom = VH - 6 - 78 - 8 - 74 - 8;\n  const plotY = BOARD_TOP + (boardBottom - BOARD_TOP) * 0.2;",
  "  h.click(81, VH - 78 + 14 + 14);   // 商店第一格：选草莓（生长 14 秒）\n  const plotY = BOARD_TOP + BOARD_H * 0.16;"
);
tt = tt.replace(
  "  const penY = VH - 6 - 78 - 8 - 74 + 40;",
  "  const penY = VH - 6 - 78 - 10 - 106 + 64;"
);
tt = tt.replace(
  "  const boardBottom = VH - 6 - 78 - 8 - 74 - 8;\n  const plotY = BOARD_TOP + (boardBottom - BOARD_TOP) * 0.2;",
  "  const plotY = BOARD_TOP + BOARD_H * 0.16;"
);
fs.writeFileSync(tp, tt, 'utf8');
console.log('坐标已更新');
