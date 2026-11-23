const fs = require('node:fs');

// ---------- types：模组列表 ----------
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
if (!t.includes('voxelMods')) {
  t = t.replace(
    '  /** 3D 体素世界的存档（两人共用一份） */\n  voxelWorld: VoxelWorld;',
    `  /** 3D 体素世界的存档（两人共用一份） */
  voxelWorld: VoxelWorld;
  /** 应用过的体力模组（只记名字与方块表，形状已经写进存档） */
  voxelMods: Array<{ id: string; name: string; blocks: Array<{ id: number; name: string; color: string }>; createdAt: number }>;`
  );
  fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');
}
// SpaceSnapshot 里也补
let t2 = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
const count = (t2.match(/voxelMods: Array<\{ id: string/g) || []).length;
if (count === 1) {
  t2 = t2.replace(
    '  /** 3D 体素世界存档 */\n  voxelWorld: VoxelWorld;',
    `  /** 3D 体素世界存档 */
  voxelWorld: VoxelWorld;
  /** 应用过的模组 */
  voxelMods: Array<{ id: string; name: string; blocks: Array<{ id: number; name: string; color: string }>; createdAt: number }>;`
  );
  fs.writeFileSync('C:/ts/src/core/types.ts', t2, 'utf8');
}
console.log('types: voxelMods 出现次数 =', (t2.match(/voxelMods:/g) || []).length);

// ---------- hub：状态 + 方法 ----------
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace(
  "      voxelWorld: { edits: [], updatedAt: 0, updatedBy: 'A' },",
  "      voxelWorld: { edits: [], updatedAt: 0, updatedBy: 'A' },\n      voxelMods: [],"
);
h = h.replace('      voxelWorld: this.state.voxelWorld,', '      voxelWorld: this.state.voxelWorld,\n      voxelMods: this.state.voxelMods,');
h = h.replace(
  "        (raw as { voxelWorld?: VoxelWorld }).voxelWorld ?? { edits: [], updatedAt: 0, updatedBy: 'A' },",
  "        (raw as { voxelWorld?: VoxelWorld }).voxelWorld ?? { edits: [], updatedAt: 0, updatedBy: 'A' },\n      voxelMods: (raw as { voxelMods?: HubModList }).voxelMods ?? [],"
);
h = h.replace(
  "import { Emitter } from './emitter';",
  "import { Emitter } from './emitter';\nimport { expandMod, parseMod } from './voxelMod';\n\n/** 模组列表元素（形状已展开进存档，这里只留展示信息） */\ntype HubModList = Array<{ id: string; name: string; blocks: Array<{ id: number; name: string; color: string }>; createdAt: number }>;"
);

const marker = '  // ---- 3D 体素世界存档 ----';
if (!h.includes(marker)) throw new Error('hub 插入点没找到');
const methods = `  // ---- 3D 世界模组 ----

  /**
   * 粘贴一个模组 JSON → 校验 → 形状展开成格子 → 并进存档。
   *
   * 用户要的："下次你直接给代码我直接复制就可以直接在我们的存档生成各种模组"。
   * 所以这是**声明式**模组（不是脚本），手机里不执行陌生代码，只按描述摆方块。
   */
  applyVoxelMod(byRole: Role, json: string): Result<{ id: string; name: string; blocks: number }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const parsed = parseMod(json);
    if (!parsed.ok) return fail(parsed.error);
    const edits = expandMod(parsed.mod);
    if (edits.length === 0) return fail('这个模组没有生成任何方块（检查坐标是否在世界范围内）');
    const merged = this.mergeVoxelEdits(byRole, edits);
    if (!merged.ok) return fail(merged.error);
    const id = uid('mod');
    this.state.voxelMods = [
      { id, name: parsed.mod.name, blocks: parsed.mod.blocks ?? [], createdAt: this.now() },
      ...this.state.voxelMods,
    ].slice(0, 40);
    this.logActivity(byRole, 'add', 'game', '3D 模组', parsed.mod.name);
    this.notify();
    return ok({ id, name: parsed.mod.name, blocks: edits.length });
  }

  /** 只从列表里移除记录（摆出来的方块留在世界里，想清掉用"清空存档"） */
  removeVoxelMod(byRole: Role, id: string): Result<null> {
    const before = this.state.voxelMods.length;
    this.state.voxelMods = this.state.voxelMods.filter((m) => m.id !== id);
    if (this.state.voxelMods.length === before) return fail('没有这个模组');
    void byRole;
    this.notify();
    return ok(null);
  }

`;
h = h.replace(marker, methods + marker);
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');
console.log('hub: applyVoxelMod 已加');

// ---------- store ----------
let st = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
if (!st.includes('applyVoxelMod')) {
  st = st.replace(
    '  resetVoxelWorld(): void {',
    `  /** 粘贴模组 JSON → 直接在存档里生成方块 */
  applyVoxelMod(json: string): boolean {
    const res = this.hub.applyVoxelMod(this.role, json);
    if (!res.ok) {
      this.toast(res.error ?? '模组应用失败', 'error');
      return false;
    }
    this.bump();
    this.toast(\`模组「\${res.value.name}」已生成 \${res.value.blocks} 格\`, 'ok');
    return true;
  }

  removeVoxelMod(id: string): void {
    this.handle(this.hub.removeVoxelMod(this.role, id), '已从模组列表移除（方块还在世界里）');
  }

  resetVoxelWorld(): void {`
  );
  fs.writeFileSync('C:/ts/src/store.tsx', st, 'utf8');
  console.log('store: applyVoxelMod 已加');
}
