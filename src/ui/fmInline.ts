/**
 * 「粘贴进来的收听源」。
 *
 * 用户手里常常不是一条网址，而是一整段 XML/JSON（例如别人帮他导出的
 * 喜马拉雅专辑目录：342 个 <item>，只有标题、时长和官方页面链接）。
 * 这种内容没法当网址填，所以：
 *   · 原文写进**文件缓存**（`fm:inline:<sourceId>`，容量只受手机空间限制）；
 *   · 源列表里存一个 `inline:<sourceId>` 的假地址；
 *   · 拉取时看到 inline: 前缀就直接读本地，不走网络。
 *
 * ⚠️ 不要塞进 AsyncStorage：Android 上那是个 6MB 的 SQLite 库，
 * 一份几百集的 XML 就能把它写满，连带账号会话一起写坏（真实事故）。
 */
import { readCmsCache, writeCmsCache } from './cmsCache';

export const INLINE_PREFIX = 'inline:';

export function isInlineUrl(url: string | null | undefined): boolean {
  return String(url ?? '').startsWith(INLINE_PREFIX);
}

export function inlineSourceUrl(id: string): string {
  return `${INLINE_PREFIX}${id}`;
}

export interface InlinePayload {
  text: string;
  at: number;
  name?: string;
}

function keyOf(url: string): string {
  return `fm:inline:${String(url).slice(INLINE_PREFIX.length)}`;
}

/** 保存一段粘贴进来的原文（返回可以直接存进源的假地址） */
export async function saveInlineSource(id: string, text: string, name?: string): Promise<string> {
  const url = inlineSourceUrl(id);
  await writeCmsCache<InlinePayload>(keyOf(url), { text: String(text ?? ''), at: Date.now(), name });
  return url;
}

/** 读回粘贴的原文；不是 inline 源或读不到就返回空串 */
export async function loadInlineText(url: string): Promise<string> {
  if (!isInlineUrl(url)) return '';
  const hit = await readCmsCache<InlinePayload>(keyOf(url)).catch(() => null);
  const text = hit?.value?.text ?? '';
  return typeof text === 'string' ? text : '';
}

/** 删掉一份粘贴内容（删除源时调用，别让文件缓存越攒越多） */
export async function dropInlineSource(url: string): Promise<void> {
  if (!isInlineUrl(url)) return;
  await writeCmsCache<InlinePayload>(keyOf(url), { text: '', at: 0 }).catch(() => undefined);
}
