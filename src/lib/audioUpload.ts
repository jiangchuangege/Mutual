/**
 * 本地音频上传：让"我手机里的歌"也能参与一起听。
 *
 * 以前本地音乐只在 `collection` 里存一个 `file://` 路径 —— 那是这台手机的私有目录，
 * 对方打不开，所以本地歌只能自己听（用户反馈："音乐那里让本地音乐也可以上传一起听"）。
 * 现在走 `/api/upload` + `kind=audio`，服务器存到 `audio/`，返回 `/audio/xxx.mp3`，
 * 拼上服务器地址后两台手机都能播。
 */

import * as FileSystem from 'expo-file-system/legacy';

export interface UploadAudioResult {
  ok: boolean;
  /** 服务器相对路径，例如 /audio/TWABCDEF-m3k1.mp3 */
  path?: string;
  error?: string;
}

const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus'];

export function audioExtOf(nameOrUri: string): string {
  const m = /\.([A-Za-z0-9]{1,5})(?:\?|#|$)/.exec(String(nameOrUri ?? ''));
  const ext = (m?.[1] ?? '').toLowerCase();
  return AUDIO_EXT.includes(ext) ? ext : 'mp3';
}

/** 读本地音频为 base64（上传前先把大小挡在服务器允许的范围内） */
export async function readAudioAsBase64(localUri: string): Promise<string> {
  if (!localUri) throw new Error('没有音频文件');
  return await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
}

export async function uploadAudio(
  serverUrl: string,
  token: string,
  localUri: string,
  fileName: string,
): Promise<UploadAudioResult> {
  if (!serverUrl) return { ok: false, error: '还没连上服务器' };
  if (!token) return { ok: false, error: '登录状态已失效，请重新登录' };
  let base64: string;
  try {
    base64 = await readAudioAsBase64(localUri);
  } catch (err) {
    return { ok: false, error: `读不到这个音频：${err instanceof Error ? err.message : String(err)}` };
  }
  if (!base64 || base64.length < 100) return { ok: false, error: '这个音频文件是空的' };
  const base = serverUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: 'audio', data: base64, ext: audioExtOf(fileName || localUri) }),
    });
    const data = (await res.json()) as { ok?: boolean; value?: { path?: string }; error?: string };
    if (!res.ok || !data.ok || !data.value?.path) {
      return { ok: false, error: data.error ?? `上传失败（HTTP ${res.status}）` };
    }
    return { ok: true, path: data.value.path };
  } catch (err) {
    return {
      ok: false,
      error: `上传不了（网络不通？）：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
