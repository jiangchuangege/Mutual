/**
 * 3D 体素世界的「模组」接口。
 *
 * 用户要的用法：**我下次直接给一段代码，你复制粘贴进 App，就在存档里生成各种模组。**
 * 所以模组不做成插件/脚本（不在手机里 eval 陌生代码），而是**声明式 JSON**：
 *  - `blocks`：新增方块（id、名字、颜色），id 从 20 起，1-9 是内置的；
 *  - `build` ：要生成什么（盒子/线/圆/爱心/星形/螺旋/球壳/文字牌），可叠加多层。
 *
 * 应用一个模组 = 把这些形状展开成"格子改动"，并进 voxelWorld 存档 →
 * 落地即成存档的一部分：双方都能看到、下次打开还在、也能被"清空存档"一次清掉。
 */

export interface ModBlock {
  id: number;
  name: string;
  color: string;
}

export type ModOp =
  | { type: 'box'; from: [number, number, number]; to: [number, number, number]; block: number; hollow?: boolean }
  | { type: 'line'; from: [number, number, number]; to: [number, number, number]; block: number }
  | { type: 'circle'; center: [number, number, number]; radius: number; block: number; axis?: 'xz' | 'xy' | 'yz' }
  | { type: 'heart'; center: [number, number, number]; size?: number; block: number }
  | { type: 'star'; center: [number, number, number]; size?: number; block: number; points?: number }
  | { type: 'sphere'; center: [number, number, number]; radius: number; block: number; hollow?: boolean }
  | { type: 'spiral'; center: [number, number, number]; radius: number; height: number; block: number }
  | { type: 'plaza'; center: [number, number, number]; radius: number; block: number; edge?: number };

export interface VoxelMod {
  name: string;
  blocks?: ModBlock[];
  build: ModOp[];
}

const W = 32;
const H = 10;
const D = 32;

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const asVec = (v: unknown): [number, number, number] | null => {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) return null;
  return [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];
};
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** 校验 + 规范化一个模组 JSON；不合法就给出人能看懂的原因 */
export function parseMod(raw: string): { ok: true; mod: VoxelMod } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(String(raw ?? ''));
  } catch (err) {
    return { ok: false, error: `不是合法 JSON：${err instanceof Error ? err.message : String(err)}` };
  }
  const obj = data as Partial<VoxelMod> & { build?: unknown };
  if (!obj || typeof obj !== 'object') return { ok: false, error: '模组必须是一个 JSON 对象' };
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 30) : '未命名模组';
  const blocks: ModBlock[] = [];
  if (Array.isArray(obj.blocks)) {
    for (const b of obj.blocks as Partial<ModBlock>[]) {
      if (!b || !isNum(b.id) || !b.color) continue;
      const id = Math.round(b.id);
      if (id < 20 || id > 240) continue; // 1-9 是内置方块，20 起给模组
      blocks.push({
        id,
        name: typeof b.name === 'string' && b.name ? b.name.slice(0, 8) : `方块${id}`,
        color: String(b.color).slice(0, 16),
      });
    }
  }
  if (!Array.isArray(obj.build) || obj.build.length === 0) {
    return { ok: false, error: 'build 不能为空：至少要有一个形状' };
  }
  const build: ModOp[] = [];
  for (const op of obj.build as ModOp[]) {
    if (!op || typeof op !== 'object') continue;
    const block = isNum((op as { block?: number }).block) ? Math.round((op as { block: number }).block) : 0;
    if (!block) continue;
    switch (op.type) {
      case 'box': {
        const from = asVec(op.from);
        const to = asVec(op.to);
        if (from && to) build.push({ type: 'box', from, to, block, hollow: Boolean(op.hollow) });
        break;
      }
      case 'line': {
        const from = asVec(op.from);
        const to = asVec(op.to);
        if (from && to) build.push({ type: 'line', from, to, block });
        break;
      }
      case 'circle': {
        const center = asVec(op.center);
        if (center && isNum(op.radius) && op.radius > 0) {
          build.push({
            type: 'circle',
            center,
            radius: Math.min(16, Math.round(op.radius)),
            block,
            axis: op.axis === 'xy' || op.axis === 'yz' ? op.axis : 'xz',
          });
        }
        break;
      }
      case 'heart': {
        const center = asVec(op.center);
        if (center) build.push({ type: 'heart', center, block, size: Math.min(6, Math.max(1, Math.round(op.size ?? 3))) });
        break;
      }
      case 'star': {
        const center = asVec(op.center);
        if (center) {
          build.push({
            type: 'star',
            center,
            block,
            size: Math.min(8, Math.max(2, Math.round(op.size ?? 4))),
            points: Math.min(12, Math.max(3, Math.round(op.points ?? 5))),
          });
        }
        break;
      }
      case 'sphere': {
        const center = asVec(op.center);
        if (center && isNum(op.radius)) {
          build.push({ type: 'sphere', center, radius: Math.min(8, Math.round(op.radius)), block, hollow: Boolean(op.hollow) });
        }
        break;
      }
      case 'spiral': {
        const center = asVec(op.center);
        if (center && isNum(op.radius) && isNum(op.height)) {
          build.push({
            type: 'spiral',
            center,
            radius: Math.min(12, Math.round(op.radius)),
            height: Math.min(H, Math.max(1, Math.round(op.height))),
            block,
          });
        }
        break;
      }
      case 'plaza': {
        const center = asVec(op.center);
        if (center && isNum(op.radius)) {
          build.push({
            type: 'plaza',
            center,
            radius: Math.min(14, Math.round(op.radius)),
            block,
            edge: isNum(op.edge) ? Math.round(op.edge) : undefined,
          });
        }
        break;
      }
      default:
        break;
    }
  }
  if (build.length === 0) return { ok: false, error: 'build 里没有能识别的形状（支持 box/line/circle/heart/star/sphere/spiral/plaza）' };
  return { ok: true, mod: { name, blocks: blocks.length ? blocks : undefined, build } };
}

/** 把模组展开成存档条目（`x,y,z,v`），自动裁到世界范围内、自动去重 */
export function expandMod(mod: VoxelMod): string[] {
  const map = new Map<string, string>();
  const put = (x: number, y: number, z: number, v: number) => {
    const X = Math.round(x);
    const Y = Math.round(y);
    const Z = Math.round(z);
    if (X < 0 || Y < 0 || Z < 0 || X >= W || Y >= H || Z >= D) return;
    map.set(key(X, Y, Z), `${X},${Y},${Z},${Math.round(v)}`);
  };

  for (const op of mod.build) {
    switch (op.type) {
      case 'box': {
        const [x1, y1, z1] = op.from;
        const [x2, y2, z2] = op.to;
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
          for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
            for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z += 1) {
              const onEdge = x === x1 || x === x2 || y === y1 || y === y2 || z === z1 || z === z2;
              if (op.hollow && !onEdge) continue;
              put(x, y, z, op.block);
            }
          }
        }
        break;
      }
      case 'line': {
        const steps = Math.max(
          Math.abs(op.to[0] - op.from[0]),
          Math.abs(op.to[1] - op.from[1]),
          Math.abs(op.to[2] - op.from[2]),
        );
        for (let i = 0; i <= steps; i += 1) {
          const t = steps === 0 ? 0 : i / steps;
          put(
            op.from[0] + (op.to[0] - op.from[0]) * t,
            op.from[1] + (op.to[1] - op.from[1]) * t,
            op.from[2] + (op.to[2] - op.from[2]) * t,
            op.block,
          );
        }
        break;
      }
      case 'circle': {
        const [cx, cy, cz] = op.center;
        const r = op.radius;
        for (let a = 0; a < 360; a += Math.max(2, Math.round(90 / r))) {
          const rad = (a * Math.PI) / 180;
          const u = Math.round(cx + Math.cos(rad) * r);
          const w = Math.round(cz + Math.sin(rad) * r);
          if (op.axis === 'xy') put(u, Math.round(cy + Math.sin(rad) * r), cz, op.block);
          else if (op.axis === 'yz') put(cx, Math.round(cy + Math.sin(rad) * r), w, op.block);
          else put(u, cy, w, op.block);
        }
        break;
      }
      case 'heart': {
        const [cx, cy, cz] = op.center;
        const s = Math.max(1, op.size ?? 3);
        // 爱心形状用参数方程取点，size 控制大小
        for (let t = 0; t < Math.PI * 2; t += 0.06) {
          const hx = 16 * Math.sin(t) ** 3;
          const hz = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          put(cx + (hx / 16) * s * 2, cy, cz + (hz / 16) * s * 2, op.block);
        }
        break;
      }
      case 'star': {
        const [cx, cy, cz] = op.center;
        const r = op.size ?? 4;
        const pts = op.points ?? 5;
        for (let i = 0; i < pts * 2; i += 1) {
          const rr = i % 2 === 0 ? r : r * 0.45;
          const a1 = (i * Math.PI) / pts;
          const a2 = ((i + 1) * Math.PI) / pts;
          const x1 = cx + Math.cos(a1) * rr;
          const z1 = cz + Math.sin(a1) * rr;
          const x2 = cx + Math.cos(a2) * (i % 2 === 0 ? r * 0.45 : r);
          const z2 = cz + Math.sin(a2) * (i % 2 === 0 ? r * 0.45 : r);
          const steps = Math.max(Math.abs(Math.round(x2 - x1)), Math.abs(Math.round(z2 - z1)));
          for (let s2 = 0; s2 <= steps; s2 += 1) {
            const t2 = steps === 0 ? 0 : s2 / steps;
            put(x1 + (x2 - x1) * t2, cy, z1 + (z2 - z1) * t2, op.block);
          }
        }
        break;
      }
      case 'sphere': {
        const [cx, cy, cz] = op.center;
        const r = op.radius;
        for (let x = -r; x <= r; x += 1) {
          for (let y = -r; y <= r; y += 1) {
            for (let z = -r; z <= r; z += 1) {
              const d2 = x * x + y * y + z * z;
              if (d2 > r * r) continue;
              if (op.hollow && d2 < (r - 1) * (r - 1)) continue;
              put(cx + x, cy + y, cz + z, op.block);
            }
          }
        }
        break;
      }
      case 'spiral': {
        const [cx, cy, cz] = op.center;
        for (let i = 0; i < op.height * 12; i += 1) {
          const a = i * 0.6;
          put(
            cx + Math.cos(a) * op.radius,
            cy + Math.floor(i / 12),
            cz + Math.sin(a) * op.radius,
            op.block,
          );
        }
        break;
      }
      case 'plaza': {
        const [cx, cy, cz] = op.center;
        const r = op.radius;
        for (let x = -r; x <= r; x += 1) {
          for (let z = -r; z <= r; z += 1) {
            const d = Math.sqrt(x * x + z * z);
            if (d > r) continue;
            const isEdge = op.edge !== undefined && d > r - 1.2;
            put(cx + x, cy, cz + z, isEdge ? (op.edge as number) : op.block);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return [...map.values()];
}

/** 给粘贴者看的文档（App 里可以直接照着改） */
export const MOD_TEMPLATE = `{
  "name": "樱花庭院",
  "blocks": [
    { "id": 20, "name": "樱花瓣", "color": "#ffc0cb" },
    { "id": 21, "name": "樱木", "color": "#c98a6a" }
  ],
  "build": [
    { "type": "plaza", "center": [16, 4, 16], "radius": 7, "block": 20, "edge": 21 },
    { "type": "heart", "center": [16, 4, 16], "size": 3, "block": 6 },
    { "type": "spiral", "center": [16, 4, 10], "radius": 3, "height": 4, "block": 21 },
    { "type": "circle", "center": [16, 5, 16], "radius": 9, "block": 8 }
  ]
}`;
