/**
 * 全局 JS 异常兜底。
 *
 * 为什么要它：release 包里 **未捕获的 JS 异常会直接把 App 关掉**（闪退），
 * 用户只看到"点一下就没反应/退出了"，我们连一行错误都拿不到。
 * 真实案例：`store.createInvite()` 在远程模式下读到 `null.code` 抛 TypeError，
 * 点「生成邀请码」直接闪退。
 *
 * 装了这个之后：异常会被记录 + 用 Toast 说明，App 继续活着。
 * 这不是"掩盖 bug"——真正的修法是每个 bug 本身；这里只是把"闪退"降级成"一条提示"。
 */

type ToastFn = (text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void;

interface ErrorUtilsLike {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (fn: (error: unknown, isFatal?: boolean) => void) => void;
}

export function installGlobalErrorHandler(toast: ToastFn): () => void {
  const g = globalThis as unknown as { ErrorUtils?: ErrorUtilsLike };
  const utils = g.ErrorUtils;
  if (!utils?.setGlobalHandler) return () => undefined;

  const previous = utils.getGlobalHandler?.();

  utils.setGlobalHandler((error, isFatal) => {
    const message = error instanceof Error ? error.message : String(error);
    // 打日志方便连 USB 时看，同时给用户一句人话
    console.error('[twospace] 未捕获异常：', message, isFatal ? '(fatal)' : '');
    try {
      toast(`出了点小问题（已记录）：${message.slice(0, 60)}`, 'error');
    } catch {
      // Toast 本身也挂了就算了
    }
    // 不再调用 previous / 不再 rethrow：宁可留个"半残"的界面，也不要闪退
  });

  return () => {
    if (previous) utils.setGlobalHandler?.(previous);
  };
}
