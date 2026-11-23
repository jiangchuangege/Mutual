/** 极简事件发射器：用于 Hub → 设备的推送。 */
export type Listener<T> = (payload: T) => void;

export class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(payload: T): void {
    for (const l of [...this.listeners]) {
      try {
        l(payload);
      } catch {
        // 单个订阅者异常不应影响其它订阅者；这里静默忽略，
        // 因为核心层不依赖 console（保持可在任意运行时编译）。
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
