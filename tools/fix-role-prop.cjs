const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) GamePlayer 增加 role 参数
sub(`function GamePlayer({
  game,
  width,
  availableHeight,
  baseUrl,
  stateText,
  seq,
  onState,
}: {`,
`function GamePlayer({
  game,
  width,
  availableHeight,
  baseUrl,
  stateText,
  seq,
  role,
  onState,
}: {`, 'props 解构');
sub(`  stateText: string;
  seq: number;
  onState: (state: string) => void;
}) {`,
`  stateText: string;
  seq: number;
  /** 我在这个空间里的角色：A 是世界的唯一写入者（同步用） */
  role: 'A' | 'B';
  onState: (state: string) => void;
}) {`, 'props 类型');

// 2) 用 prop
sub("buildFarmHtml(((store as unknown as { role?: 'A' | 'B' }).role ?? 'A'))", 'buildFarmHtml(role)', '调用改 prop');

// 3) 调用处传值
sub(`          baseUrl={store.gameBaseUrl}
          stateText={session?.gameId === playing.id ? session.state : ''}`,
`          baseUrl={store.gameBaseUrl}
          role={store.role}
          stateText={session?.gameId === playing.id ? session.state : ''}`, '传入 role');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
