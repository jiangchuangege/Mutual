const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');
const from = `          onState={(state) => {
            let turn = session?.turn ?? 0;
            try {
              const parsed = JSON.parse(state) as {
                turn?: number;
                e?: number[][];
              };`;
const to = `          onState={(state) => {
            let turn = session?.turn ?? 0;
            try {
              const parsed = JSON.parse(state) as {
                turn?: number;
                e?: number[][];
                chg?: number;
                w?: string | null;
              };
              /*
               * 农场这类"世界存档"游戏会周期性发心跳；心跳包里 chg!==1 表示"我没改东西"。
               * 这种包不能覆盖服务端存的局面，否则对方刚改的进度会被冲掉、
               * 退出重进也会读到一份旧的/空的局面。
               */
              const isWorldGame = state.includes('"chg"');
              const unchanged = typeof parsed.chg === 'number' && parsed.chg !== 1;
              if (isWorldGame && unchanged && session?.state && session.gameId === playing.id) {
                return;
              }`;
if (!t.includes(from)) throw new Error('找不到 onState 开头');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('心跳包不再覆盖服务端局面');
