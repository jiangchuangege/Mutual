/**
 * 图片上传：本地图片 → base64 → 我们自己的服务器。
 *
 * 为什么不直接把本地路径同步出去：那个 `file://` 路径只在这台手机上有效，
 * 对方手机打不开、换机也会丢（真机复现过：换了头像/背景，对方那边永远是默认值）。
 *
 * 目前两类图共用这一条通道：
 *   - kind='avatar'     → 状态里存 `/avatar/xxx.jpg`
 *   - kind='background' → 状态里存 `/background/xxx.jpg`
 */

import * as FileSystem from 'expo-file-system/legacy';

import { avatarExtFromUri, checkAvatarPayload, type UploadKind } from '../core/avatar';

/** 把本地图片读成 base64（不带 data: 前缀，服务器自己会处理） */
export async function readImageAsBase64(localUri: string): Promise<string> {
  if (!localUri) throw new Error('没有图片');
  return await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
}

export interface UploadResult {
  ok: boolean;
  /** 服务器上的相对路径，例如 /avatar/TWABCDEF-m3k1.jpg */
  path?: string;
  error?: string;
}

/** 上传一张图：成功返回相对路径，调用方再把它写进空间状态 */
export async function uploadImage(
  serverUrl: string,
  token: string,
  localUri: string,
  kind: UploadKind = 'avatar',
): Promise<UploadResult> {
  if (!serverUrl) return { ok: false, error: '还没连上服务器' };
  if (!token) return { ok: false, error: '登录状态已失效，请重新登录' };
  let base64: string;
  try {
    base64 = await readImageAsBase64(localUri);
  } catch (err) {
    return { ok: false, error: `读不到这张图片：${err instanceof Error ? err.message : String(err)}` };
  }
  const check = checkAvatarPayload(base64);
  if (!check.ok) return { ok: false, error: check.error };

  const base = serverUrl.replace(/\/+$/, '');
  const endpoint = kind === 'avatar' ? '/api/avatar' : '/api/upload';
  const body = kind === 'avatar'
    ? { data: base64, ext: avatarExtFromUri(localUri) }
    : { kind, data: base64, ext: avatarExtFromUri(localUri) };
  try {
    const res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
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

/** 兼容旧调用 */
export const uploadAvatar = (serverUrl: string, token: string, localUri: string) =>
  uploadImage(serverUrl, token, localUri, 'avatar');
