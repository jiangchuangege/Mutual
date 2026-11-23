/**
 * Live2D 运行时文件落盘。
 *
 * 为什么不能直接把 html 塞进 WebView：老版 live2d.js 里 model.json 写的是**相对路径**
 * （model.moc、textures/default-costume.png、motions/*.mtn），data URI 它不认，
 * 所以模型画不出来。正确做法就是把整套文件按原样解到手机本地目录，
 * 再用 file:// 加载 index.html —— 相对路径全部成立，和他在网页里跑的是同一套。
 */
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { LIVE2D_FILES } from './live2dFilesData';

const ROOT = `${FileSystemLegacy.documentDirectory ?? FileSystemLegacy.cacheDirectory ?? ''}live2d/`;
const READY_FLAG = `${ROOT}.ok`;

let writing: Promise<string | null> | null = null;

async function exists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystemLegacy.getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

async function ensureDirs(): Promise<void> {
  for (const dir of ['', 'js', 'css', 'model', 'model/tia', 'model/tia/textures', 'model/tia/motions']) {
    try {
      await FileSystemLegacy.makeDirectoryAsync(`${ROOT}${dir}`, { intermediates: true });
    } catch {
      /* 已存在 */
    }
  }
}

async function writeAll(): Promise<void> {
  await ensureDirs();
  for (const [path, file] of Object.entries(LIVE2D_FILES)) {
    const target = `${ROOT}${path}`;
    try {
      if (file.text !== undefined) {
        await FileSystemLegacy.writeAsStringAsync(target, file.text);
      } else if (file.b64 !== undefined) {
        await FileSystemLegacy.writeAsStringAsync(target, file.b64, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });
      }
    } catch {
      /* 单个文件失败就跳过 */
    }
  }
  await FileSystemLegacy.writeAsStringAsync(READY_FLAG, String(Date.now()));
}

/** 返回可以直接丢给 WebView 的 index.html 地址（失败返回 null） */
export function ensureLive2dFiles(): Promise<string | null> {
  if (writing) return writing;
  writing = (async () => {
    try {
      const page = `${ROOT}index.html`;
      if ((await exists(page)) && (await exists(READY_FLAG))) return page;
      await writeAll();
      return (await exists(page)) ? page : null;
    } catch {
      return null;
    }
  })();
  return writing;
}

export const LIVE2D_ROOT = ROOT;
