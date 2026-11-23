/**
 * 读本地音频的标签（ID3）：JS 侧只做 IO，解析在 core/musicMeta 里（可单测）。
 */

import * as FileSystem from 'expo-file-system/legacy';

import {
  EMPTY_META,
  base64ToBytes,
  mergeMeta,
  metaFromFilename,
  parseId3,
  type MusicMeta,
} from '../core/musicMeta';

/** ID3 标签通常在文件最前面；读 256KB 足够覆盖绝大多数文件 */
const HEAD_BYTES = 256 * 1024;

export async function readMusicMeta(localUri: string, fileName: string): Promise<MusicMeta> {
  const fromName = metaFromFilename(fileName || localUri);
  try {
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: 'base64',
      length: HEAD_BYTES,
      position: 0,
    });
    if (!b64) return fromName;
    const tag = parseId3(base64ToBytes(b64));
    return mergeMeta(tag, fromName);
  } catch {
    return fromName ?? EMPTY_META;
  }
}
