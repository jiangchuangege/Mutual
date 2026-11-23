/**
 * 从本地音频文件里读出歌名/歌手（ID3 标签），读不到就用文件名猜。
 *
 * 为什么需要：用户抱怨「歌手和音乐名自己识别到不要自己手敲太麻烦了」。
 * 这里手写 ID3v2 解析（不引三方库：装依赖风险高，上次 --legacy-peer-deps
 * 顺手把 reanimated 之类清掉过一次）。
 *
 * 覆盖范围：ID3v2.2/2.3/2.4 的 TIT2(歌名)/TPE1(歌手)/TALB(专辑)，
 * 文本编码 0(latin1)/1(UTF-16 带 BOM)/2(UTF-16BE)/3(UTF-8) 都处理；
 * 没有 ID3 时按「歌手 - 歌名.mp3」这类文件名猜。
 */

export interface MusicMeta {
  title: string | null;
  artist: string | null;
  album: string | null;
}

export const EMPTY_META: MusicMeta = { title: null, artist: null, album: null };

/** 把 base64（可能是 data: 前缀）解成字节数组 */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let pos = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '=') break;
    const v = alphabet.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[pos % out.length] = (buffer >> bits) & 0xff;
      pos += 1;
    }
  }
  return out.slice(0, pos);
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  try {
    if (encoding === 0) {
      // latin1：逐个字节转字符（ID3 里多用于英文，中文常见于老文件）
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return s;
    }
    if (encoding === 3) {
      return new TextDecoder('utf-8').decode(bytes);
    }
    // 1 = UTF-16 with BOM, 2 = UTF-16BE
    let little = encoding === 1;
    let start = 0;
    if (encoding === 1 && bytes.length >= 2) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        little = true;
        start = 2;
      } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        little = false;
        start = 2;
      }
    }
    const body = bytes.slice(start);
    if (little) {
      // 已经是小端：直接按 utf-16le 解，不要再来回交换字节
      return new TextDecoder('utf-16le').decode(body);
    }
    const even = body.length - (body.length % 2);
    const swapped = new Uint8Array(even);
    for (let i = 0; i < even; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return new TextDecoder('utf-16le').decode(swapped);
  } catch {
    return '';
  }
}

/** 去掉结尾的 0、空白和不可见字符 */
function tidy(s: string): string | null {
  const cleaned = s
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u001f]/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** 解析 ID3v2 标签（拿不到就返回 EMPTY_META 的字段） */
export function parseId3(bytes: Uint8Array): MusicMeta {
  const meta: MusicMeta = { ...EMPTY_META };
  if (bytes.length < 10) return meta;
  const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33; // "ID3"
  if (!isId3) return meta;
  const version = bytes[3];
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const end = Math.min(bytes.length, 10 + size);
  let p = 10;

  // ID3v2.2：3 字符帧名（TT2/TP1/TAL）
  if (version === 2) {
    while (p + 6 <= end) {
      const id = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2]);
      if (!/^[A-Z0-9]{3}$/.test(id)) break;
      const frameSize = (bytes[p + 3] << 16) | (bytes[p + 4] << 8) | bytes[p + 5];
      const start = p + 6;
      if (frameSize <= 0 || start + frameSize > end) break;
      const data = bytes.slice(start, start + frameSize);
      applyFrame(meta, id === 'TT2' ? 'TIT2' : id === 'TP1' ? 'TPE1' : id === 'TAL' ? 'TALB' : id, data);
      p = start + frameSize;
    }
    return meta;
  }

  while (p + 10 <= end) {
    const id = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    // v2.3 是普通 32 位长度；v2.4 是同步安全整数（每字节 7 位）
    let frameSize: number;
    if (version === 4) {
      frameSize =
        ((bytes[p + 4] & 0x7f) << 21) |
        ((bytes[p + 5] & 0x7f) << 14) |
        ((bytes[p + 6] & 0x7f) << 7) |
        (bytes[p + 7] & 0x7f);
    } else {
      frameSize = (bytes[p + 4] << 24) | (bytes[p + 5] << 16) | (bytes[p + 6] << 8) | bytes[p + 7];
    }
    const start = p + 10;
    if (frameSize <= 0 || start + frameSize > end) break;
    applyFrame(meta, id, bytes.slice(start, start + frameSize));
    p = start + frameSize;
  }
  return meta;
}

function applyFrame(meta: MusicMeta, id: string, data: Uint8Array): void {
  if (id !== 'TIT2' && id !== 'TPE1' && id !== 'TALB') return;
  if (data.length < 2) return;
  const encoding = data[0];
  const text = tidy(decodeText(data.slice(1), encoding));
  if (!text) return;
  if (id === 'TIT2') meta.title = text;
  if (id === 'TPE1') meta.artist = text;
  if (id === 'TALB') meta.album = text;
}

/** 从文件名猜：`周杰伦 - 晴天.mp3` → {artist:'周杰伦', title:'晴天'} */
export function metaFromFilename(name: string): MusicMeta {
  const base = String(name ?? '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!base) return { ...EMPTY_META };
  const separators = [' - ', ' – ', ' — ', '-'];
  for (const sep of separators) {
    const idx = base.indexOf(sep);
    if (idx > 0) {
      const artist = tidy(base.slice(0, idx));
      const title = tidy(base.slice(idx + sep.length));
      if (artist && title) return { title, artist, album: null };
    }
  }
  return { title: base, artist: null, album: null };
}

/** 合并：标签优先，缺什么用文件名补 */
export function mergeMeta(tag: MusicMeta, fromName: MusicMeta): MusicMeta {
  return {
    title: tag.title ?? fromName.title,
    artist: tag.artist ?? fromName.artist,
    album: tag.album ?? fromName.album,
  };
}
