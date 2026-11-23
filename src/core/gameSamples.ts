import { FARM_GAME } from './gameFarm';
import { SANDBOX_GAME } from './gameSandbox';
import type { GameSpec } from './types';

/**
 * 内置样例：一个能真的双人玩的井字棋（纯 canvas，不联网）。
 *
 * 它同时是"粘贴格式的样板"：AI 生成的游戏只要照这个形状写就能跑 ——
 *  - 整段单文件 HTML
 *  - 自己画界面（canvas）
 *  - 局面变化时调用 `TwGame.send(JSON.stringify(局面))`
 *  - 提供 `TwGame.apply(局面)` 让对方的局面落到本地
 * App 侧只负责把局面字符串在两端之间搬运。
 */
const TIC_TAC_TOE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;height:100%;background:#141110;color:#F3EAE3;
    font-family:-apple-system,system-ui,sans-serif;display:flex;flex-direction:column;
    align-items:center;justify-content:center;-webkit-user-select:none}
  canvas{background:#1E1A18;border-radius:18px;touch-action:manipulation}
  #tip{margin-top:14px;font-size:15px;color:#A2928A}
        #me{margin-bottom:10px;font-size:13px;color:#E8836B}</style></head>
<body>
<div id="me">双人井字棋</div>
<canvas id="c" width="300" height="300"></canvas>
<div id="tip">你的回合</div>
<script>
(function(){
  var N=3, S=100, board=[], turn=0, over=false;
  var c=document.getElementById('c'), ctx=c.getContext('2d');
  for(var i=0;i<N*N;i++) board.push('');
  function send(){
    if(window.ReactNativeWebView && window.ReactNativeWebView.postMessage){
      window.ReactNativeWebView.postMessage('TW_STATE:'+JSON.stringify({board:board,turn:turn,over:over}));
    }
  }
  function win(b){
    var lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for(var i=0;i<lines.length;i++){var a=lines[i];
      if(b[a[0]]&&b[a[0]]===b[a[1]]&&b[a[1]]===b[a[2]]) return b[a[0]];
    }
    return b.indexOf('')<0 ? 'draw' : '';
  }
  function draw(){
    ctx.clearRect(0,0,300,300);
    ctx.strokeStyle='#3A322E'; ctx.lineWidth=3;
    for(var i=1;i<N;i++){
      ctx.beginPath(); ctx.moveTo(i*S,0); ctx.lineTo(i*S,300); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,i*S); ctx.lineTo(300,i*S); ctx.stroke();
    }
    for(var k=0;k<board.length;k++){
      if(!board[k]) continue;
      var x=(k%N)*S+S/2, y=Math.floor(k/N)*S+S/2;
      ctx.strokeStyle = board[k]==='X' ? '#E8836B' : '#7FC8A9';
      ctx.lineWidth=10; ctx.beginPath();
      if(board[k]==='X'){ ctx.moveTo(x-30,y-30); ctx.lineTo(x+30,y+30); ctx.moveTo(x+30,y-30); ctx.lineTo(x-30,y+30); }
      else { ctx.arc(x,y,30,0,Math.PI*2); }
      ctx.stroke();
    }
    var w=win(board);
    document.getElementById('tip').textContent = w ? (w==='draw' ? '平局' : w+' 赢了') : (turn===0?'你的回合（X）':'对方回合（O）');
    if(w) over=true;
  }
  function play(i){
    if(over || board[i]) return;
    board[i] = turn===0 ? 'X' : 'O';
    turn = 1-turn;
    over = !!win(board);
    draw(); send();
  }
  c.addEventListener('click', function(e){
    var r=c.getBoundingClientRect();
    var x=Math.floor((e.clientX-r.left)/(r.width/N)), y=Math.floor((e.clientY-r.top)/(r.height/N));
    if(x<0||y<0||x>=N||y>=N) return;
    play(y*N+x);
  });
  window.TwGame = {
    send: send,
    apply: function(json){
      try{ var s=JSON.parse(json); if(!s||!s.board) return;
        board=s.board.slice(0,N*N); turn=s.turn|0; over=!!s.over; draw();
      }catch(e){}
    }
  };
  draw();
})();
</script></body></html>`;

export const SAMPLE_GAMES: GameSpec[] = [
  FARM_GAME,
  SANDBOX_GAME,
  {
    id: 'sample-tic-tac-toe',
    title: '双人井字棋（内置样例）',
    code: TIC_TAC_TOE,
    players: 2,
    createdBy: 'A',
    createdAt: 0,
    builtin: true,
  },
];
