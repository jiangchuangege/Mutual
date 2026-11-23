const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) 移除「粘贴模组」入口按钮
t = t.replace(
  `          <View style={{ height: 8 }} />
          <Btn title="🧩 粘贴模组（直接生成到 3D 存档）" variant="ghost" onPress={() => setModOpen(true)} />`,
  ''
);

// 2) 移除模组弹层（从注释标记到下一个注释标记之间）
const modStart = t.indexOf('      {/* 粘贴模组 JSON：直接写进 3D 世界存档 */}');
if (modStart >= 0) {
  const modEnd = t.indexOf('      {/* 粘贴代码 */}');
  if (modEnd > modStart) t = t.slice(0, modStart) + t.slice(modEnd);
}

// 3) 移除"已应用的模组"列表
const listStart = t.indexOf('        {(snapshot.voxelMods ?? []).length > 0 ? (');
if (listStart >= 0) {
  const listEnd = t.indexOf('        {session ? (');
  if (listEnd > listStart) t = t.slice(0, listStart) + t.slice(listEnd);
}

fs.writeFileSync(p, t, 'utf8');
console.log('移除模组 UI:', {
  入口: !t.includes('粘贴模组（直接生成到 3D 存档）'),
  弹层: !t.includes('粘贴模组 JSON'),
  列表: !t.includes('已应用的模组'),
});
