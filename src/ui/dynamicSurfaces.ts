/**
 * 表面色动态化（全透明模式）
 *
 * 问题：`Card`、卡片、弹层这些表面色都是写死在 `StyleSheet.create` 里的
 * （`color.surface = #FFFFFF`、`color.surfaceAlt`、各种奶油色），
 * 模块加载那一刻就固化了 —— 用户上传 MP4 背景后，这些白底会把视频整块盖住，
 * 于是"上传成功但看不到背景"。
 *
 * 做法：给 `StyleSheet.create` 打一个很小的补丁，把**表面色**（纯白 / 奶油 / 各主题
 * 浅色底 / 半透奶白）的样式对象登记下来；AppFrame 每帧调用 `applySurfaceMode()`
 * 告诉它当前有没有自定义背景：
 *   - 有 → 把登记过的表面色统一改成 'transparent'（全透明，不是半透）
 *   - 没有 → 原样改回去，视觉零变化
 *
 * 只碰 backgroundColor / borderColor，且只碰白名单里的表面色：
 * 按钮主色、深色模块、文字色、阴影都不受影响。
 */
import { StyleSheet } from 'react-native';

/** 设计系统里所有"页面表面"颜色（其它颜色一律不动） */
const SURFACE_VALUES = new Set<string>([
  '#FFFFFF',
  '#FFF8F4',
  '#FFF3EC',
  '#FDEFE7',
  '#FFF3E2',
  '#FFEFF4',
  '#EAF9EF',
  '#FFE7DE',
  '#E4F5ED',
  '#E7F0FB',
  '#EFEAFA',
  '#FCF2DA',
  '#FBEDE6',
  'rgba(255,248,244,0.55)',
  'rgba(255,252,250,0.55)',
  'rgba(255,255,255,0.55)',
  'rgba(255,255,255,0.65)',
  'rgba(255,248,238,0.72)',
  'rgba(242,251,245,0.72)',
  'rgba(255,244,247,0.72)',
  'rgba(255,246,250,0.72)',
]);

const SURFACE_LINES = new Set<string>([
  '#F1E3DA',
  '#E4D2C7',
  'rgba(255,255,255,0.28)',
  'rgba(255,255,255,0.22)',
  'rgba(255,255,255,0.65)',
  'rgba(255,255,255,0.10)',
]);

type Entry = {
  style: Record<string, unknown>;
  bg?: string;
  border?: string;
  shadowOpacity?: number;
  elevation?: number;
};

const tracked: Entry[] = [];
let patched = false;
let active = false;

/** 给 StyleSheet.create 打补丁（幂等；必须在其它模块 create 之前执行） */
export function installSurfaceTracking(): void {
  if (patched) return;
  patched = true;
  const ss = StyleSheet as unknown as { create: (obj: Record<string, any>) => any };
  const original = ss.create.bind(StyleSheet);
  ss.create = (obj: Record<string, any>) => {
    try {
      for (const key of Object.keys(obj)) {
        const style = obj[key];
        if (!style || typeof style !== 'object') continue;
        const bg = typeof style.backgroundColor === 'string' && SURFACE_VALUES.has(style.backgroundColor)
          ? style.backgroundColor
          : undefined;
        const border = typeof style.borderColor === 'string' && SURFACE_LINES.has(style.borderColor)
          ? style.borderColor
          : undefined;
        if (!bg && !border) continue;
        tracked.push({
          style,
          bg,
          border,
          shadowOpacity: typeof style.shadowOpacity === 'number' ? style.shadowOpacity : undefined,
          elevation: typeof style.elevation === 'number' ? style.elevation : undefined,
        });
      }
    } catch {
      // 登记失败不影响正常渲染
    }
    return original(obj);
  };
}

/** 有自定义背景时，表面色换成这层中性薄玻璃（不发黄、又能和背景分层） */
const GLASS_FILL = 'rgba(255,255,255,0.95)';
const GLASS_LINE = 'rgba(255,255,255,0.95)';

/** 开/关全透明模式（由 AppFrame 在渲染阶段调用，幂等） */
export function applySurfaceMode(next: boolean): void {
  if (next === active) return;
  active = next;
  for (const entry of tracked) {
    try {
      if (entry.bg !== undefined) entry.style.backgroundColor = next ? GLASS_FILL : entry.bg;
      if (entry.border !== undefined) {
        entry.style.borderColor = next ? GLASS_LINE : entry.border;
      }
      if (next) {
        // 全透明时阴影也别留（否则卡片边缘会有一圈灰）
        if (entry.shadowOpacity !== undefined) entry.style.shadowOpacity = 0;
        if (entry.elevation !== undefined) entry.style.elevation = 0;
      } else {
        if (entry.shadowOpacity !== undefined) entry.style.shadowOpacity = entry.shadowOpacity;
        if (entry.elevation !== undefined) entry.style.elevation = entry.elevation;
      }    } catch {
      // dev 下样式可能被 Object.freeze，忽略即可
    }
  }
}

/** 已登记数量（调试用） */
export function trackedSurfaceCount(): number {
  return tracked.length;
}

installSurfaceTracking();
