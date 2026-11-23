/** AppFrame 用：订阅"背景视频要不要让路"的开关（React 版） */
import { useEffect, useState } from 'react';

import { isBackgroundVideoSuppressed, subscribeBackgroundVideoSuppressed } from './bgVideoGate';

export function useBgVideoSuppressed(): boolean {
  const [suppressed, setSuppressed] = useState(() => isBackgroundVideoSuppressed());
  useEffect(() => {
    const off = subscribeBackgroundVideoSuppressed(setSuppressed);
    setSuppressed(isBackgroundVideoSuppressed());
    return off;
  }, []);
  return suppressed;
}
