/**
 * 外壳取色：从背景画面里算一个"主色"，只给外壳 UI 用（底部导航/外框/按钮高亮）。
 *
 * 分工（用户明确要求，别再搞混）：
 *   - **外壳**：用用户上传的 MP4/图片背景 → 颜色由这段背景算出来；
 *   - **模块内部**（影院 / 直播 / 焦焦FM）：各用自己的背景和配色，**不受影响**；
 *   - 今天 / 生活 / 关怀 / 我们：各自主题，**完全不动**。
 *
 * 这里只放**纯计算**（不碰 RN、不碰截图），所以可以直接单测：
 * 一串像素 → 一个能用的 accent 色。
 */

/** RGBA 像素数组（每 4 个一组，0-255） */
export type Pixels = Uint8Array | Uint8ClampedArray | number[];

export interface AccentResult {
  /** 最终给 UI 用的主色（#RRGGBB） */
  hex: string;
  /** 柔和背景版本（rgba，透明度 0.16） */
  soft: string;
  /** 采样到的有效像素比例（0~1），太低说明画面太黑/太糊，应回退默认色 */
  confidence: number;
}

const FALLBACK: AccentResult = { hex: '#57F8FF', soft: 'rgba(87,248,255,0.16)', confidence: 0 };

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/**
 * 把一个颜色往"适合当强调色"的方向拉一拉：
 * 太暗会被背景吃掉，太灰会显得脏，所以提亮 + 加饱和。
 */
export function tuneAccent(r: number, g: number, b: number): { r: number; g: number; b: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  // 提饱和：离灰轴越远越鲜艳
  const mid = (max + min) / 2;
  const satBoost = max === min ? 1 : 1.25;
  let rr = mid + (r - mid) * satBoost;
  let gg = mid + (g - mid) * satBoost;
  let bb = mid + (b - mid) * satBoost;
  // 提亮：目标亮度 0.62 左右，暗背景也能看清
  const target = 0.62;
  const cur = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
  if (cur < target && cur > 0.01) {
    const k = Math.min(2.2, target / cur);
    rr *= k;
    gg *= k;
    bb *= k;
  } else if (cur > 0.9 && lum > 0.9) {
    // 太亮的（比如纯白背景）压暗一点，避免强调色和背景糊在一起
    const k = 0.82;
    rr *= k;
    gg *= k;
    bb *= k;
  }
  return { r: clamp255(rr), g: clamp255(gg), b: clamp255(bb) };
}

/**
 * 从像素里算主色。
 *
 * 做法：把每个像素按 4bit/通道量化成色桶（4096 个桶），
 * 丢掉过暗（<10%）和过亮（>95%）的像素，再按"数量 × 饱和度"给桶打分，
 * 取最高分的桶的平均色 —— 比单纯取平均更贴近"画面里最显眼的那块颜色"。
 */
export function dominantAccent(pixels: Pixels, stride = 4): AccentResult {
  const len = Math.floor(pixels.length / stride);
  if (len < 16) return FALLBACK;

  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let valid = 0;

  for (let i = 0; i < len; i += 1) {
    const o = i * stride;
    const r = Number(pixels[o] ?? 0);
    const g = Number(pixels[o + 1] ?? 0);
    const b = Number(pixels[o + 2] ?? 0);
    const a = stride >= 4 ? Number(pixels[o + 3] ?? 255) : 255;
    if (a < 40) continue; // 透明像素不算
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.1 || lum > 0.95) continue; // 纯黑纯白不算
    valid += 1;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key);
    if (cur) {
      cur.n += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }

  if (!buckets.size || valid / len < 0.15) return FALLBACK;

  let best: { n: number; r: number; g: number; b: number } | null = null;
  let bestScore = -1;
  for (const v of buckets.values()) {
    const r = v.r / v.n;
    const g = v.g / v.n;
    const b = v.b / v.n;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // 饱和度 0~1：越鲜艳越适合当强调色
    const sat = max === 0 ? 0 : (max - min) / max;
    const score = v.n * (0.55 + sat * 1.6);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  if (!best) return FALLBACK;

  const avg = { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
  const tuned = tuneAccent(avg.r, avg.g, avg.b);
  const hex = toHex(tuned.r, tuned.g, tuned.b);
  return {
    hex,
    soft: `rgba(${tuned.r},${tuned.g},${tuned.b},0.16)`,
    confidence: Math.min(1, valid / len),
  };
}

/** 「#RRGGBB」→ rgba(...) 字符串，方便做半透明底色 */
export function hexToRgba(hex: string, alpha = 0.16): string {
  const h = String(hex ?? '').replace('#', '');
  if (h.length !== 6) return `rgba(87,248,255,${alpha})`;
  const r = Number.parseInt(h.slice(0, 2), 16) || 0;
  const g = Number.parseInt(h.slice(2, 4), 16) || 0;
  const b = Number.parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}
