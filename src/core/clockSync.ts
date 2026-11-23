/**
 * NTP 式对时（方案 §2.1.3）
 * 客户端发 t1，服务端记 t2（收到）、t3（回包），客户端记 t4（收到）。
 * offset = ((t2 - t1) + (t3 - t4)) / 2
 * rtt    = (t4 - t1) - (t3 - t2)
 * 取 RTT 最小的可用样本作为权威 offset；RTT > 400ms 的样本丢弃。
 */

export interface PingSample {
  t1: number;
  t2: number;
  t3: number;
  t4: number;
}

export interface SampleMetrics {
  rtt: number;
  offset: number;
  usable: boolean;
}

export const MAX_USABLE_RTT_MS = 400;
export const GOOD_RTT_MS = 200;

export function sampleMetrics(sample: PingSample): SampleMetrics {
  const { t1, t2, t3, t4 } = sample;
  const rtt = Math.max(0, t4 - t1 - (t3 - t2));
  const offset = (t2 - t1 + (t3 - t4)) / 2;
  return { rtt, offset, usable: rtt <= MAX_USABLE_RTT_MS };
}

export class ClockSync {
  private samples: PingSample[] = [];

  constructor(private readonly maxSamples: number = 5) {}

  add(sample: PingSample): SampleMetrics {
    const metrics = sampleMetrics(sample);
    this.samples.push(sample);
    while (this.samples.length > this.maxSamples) this.samples.shift();
    return metrics;
  }

  reset(): void {
    this.samples = [];
  }

  private best(): SampleMetrics | null {
    let bestMetrics: SampleMetrics | null = null;
    for (const s of this.samples) {
      const m = sampleMetrics(s);
      if (!m.usable) continue;
      if (bestMetrics === null || m.rtt < bestMetrics.rtt) bestMetrics = m;
    }
    return bestMetrics;
  }

  /** 本地时钟 + offset = 估算的服务端时间 */
  get offset(): number {
    const b = this.best();
    return b ? b.offset : 0;
  }

  serverNow(localNow: number): number {
    return localNow + this.offset;
  }

  get quality(): { rtt: number; samples: number; degraded: boolean } {
    const b = this.best();
    return {
      rtt: b ? b.rtt : -1,
      samples: this.samples.length,
      degraded: b === null || b.rtt > GOOD_RTT_MS,
    };
  }
}
