/**
 * 从 APK 里读出"包名"。
 *
 * 为什么要这个：用户把下载来的 .apk 传进游戏库后，点卡片应该**直接打开这个游戏**。
 * 以前只能打开我们自己云编译的那个固定包名（com.mutual.generated），
 * 别人的 APK 装上了却打不开 —— 只能反复弹安装器。
 *
 * 这里的做法是纯 JS 解析 APK（本质是 zip）里的 AndroidManifest.xml（二进制 AXML），
 * 零依赖、不联网、不上传任何东西，服务端和手机端都能算。
 */

/* ============================ zip 读取 ============================ */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

/** 列出 zip 里的条目（只读中央目录，够用且快） */
export function listZipEntries(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = data.byteLength;
  // EOCD 在文件末尾，最多 64KB 注释，所以从后往前找签名
  let eocd = -1;
  const from = Math.max(0, len - 66_000);
  for (let i = len - 22; i >= from; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (off + 46 > len || view.getUint32(off, true) !== SIG_CENTRAL) break;
    const method = view.getUint16(off + 10, true);
    const compressedSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOffset = view.getUint32(off + 42, true);
    const nameBytes = data.subarray(off + 46, off + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    out.push({ name, method, compressedSize, localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 取出某个条目的原始字节（store / deflate 两种都支持） */
export function readZipEntry(
  data: Uint8Array,
  entry: ZipEntry,
  inflateRaw?: (b: Uint8Array) => Uint8Array,
): Uint8Array | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const o = entry.localOffset;
  if (o + 30 > data.byteLength || view.getUint32(o, true) !== 0x04034b50) return null;
  const nameLen = view.getUint16(o + 26, true);
  const extraLen = view.getUint16(o + 28, true);
  const start = o + 30 + nameLen + extraLen;
  const raw = data.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    try {
      /*
       * 解压函数由调用方传进来（Node 传 zlib.inflateRawSync）。
       * 核心模块保持零依赖，浏览器/RN 端用不到这条路。
       */
      const fn =
        inflateRaw ??
        (globalThis as unknown as { __twzlib?: { inflateRawSync(b: Uint8Array): Uint8Array } }).__twzlib
          ?.inflateRawSync;
      if (!fn) return null;
      return fn(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/* ============================ AXML 解析 ============================ */

const RES_STRING_POOL = 0x0001;
const RES_XML_START_ELEMENT = 0x0102;

function readStringPool(buf: Uint8Array, view: DataView, o: number, size: number): string[] {
  const count = view.getUint32(o + 8, true);
  const flags = view.getUint32(o + 16, true);
  const stringsStart = view.getUint32(o + 20, true);
  const headerSize = view.getUint16(o + 2, true);
  const isUtf8 = (flags & 0x100) !== 0;
  const offsetsAt = o + headerSize;
  const dataAt = o + stringsStart;
  const out: string[] = [];
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < count; i += 1) {
    const at = offsetsAt + i * 4;
    if (at + 4 > o + size) break;
    let p = dataAt + view.getUint32(at, true);
    if (p >= buf.byteLength) {
      out.push('');
      continue;
    }
    try {
      if (isUtf8) {
        // 长度是"字符数"，再跟一个"字节数"，两段都是 varint
        let skip = 0;
        for (let k = 0; k < 2; k += 1) {
          while (skip < 4 && (buf[p] & 0x80) !== 0) {
            p += 1;
            skip += 1;
          }
          p += 1;
          skip += 1;
        }
        let end = p;
        while (end < buf.byteLength && buf[end] !== 0) end += 1;
        out.push(decoder.decode(buf.subarray(p, end)));
      } else {
        let n = view.getUint16(p, true);
        p += 2;
        if (n & 0x8000) {
          n = ((n & 0x7fff) << 16) | view.getUint16(p, true);
          p += 2;
        }
        const bytes = buf.subarray(p, p + n * 2);
        out.push(new TextDecoder('utf-16le').decode(bytes));
      }
    } catch {
      out.push('');
    }
  }
  return out;
}

/**
 * 解析 AndroidManifest.xml（二进制），返回包名。
 * 解析不出来就返回 null —— 绝不抛错，导入流程不能因为一个怪包挂掉。
 */
export function packageNameFromManifest(axml: Uint8Array): string | null {
  try {
    const view = new DataView(axml.buffer, axml.byteOffset, axml.byteLength);
    if (axml.byteLength < 16 || view.getUint16(0, true) !== 0x0003) return null;
    let strings: string[] = [];
    let o = view.getUint16(2, true);
    while (o + 8 <= axml.byteLength) {
      const type = view.getUint16(o, true);
      const headerSize = view.getUint16(o + 2, true);
      const size = view.getUint32(o + 4, true);
      if (size <= 0 || o + size > axml.byteLength) break;
      if (type === RES_STRING_POOL) {
        strings = readStringPool(axml, view, o, size);
      } else if (type === RES_XML_START_ELEMENT) {
        const body = o + headerSize;
        const nameIdx = view.getUint32(body + 4, true);
        const attrStart = view.getUint16(body + 8, true);
        const attrCount = view.getUint16(body + 12, true);
        const elName = strings[nameIdx] ?? '';
        if (elName === 'manifest') {
          let at = body + attrStart;
          for (let i = 0; i < attrCount; i += 1) {
            if (at + 20 > o + size) break;
            const aName = strings[view.getUint32(at + 4, true)] ?? '';
            const rawValue = view.getUint32(at + 8, true);
            const dataType = view.getUint8(at + 15);
            const data = view.getUint32(at + 16, true);
            if (aName === 'package') {
              if (rawValue !== 0xffffffff && strings[rawValue]) return strings[rawValue];
              if (dataType === 0x03 && strings[data]) return strings[data];
            }
            at += 20;
          }
        }
      }
      o += size;
    }
  } catch {
    return null;
  }
  return null;
}

/** 一步到位：给整个 APK 字节，返回包名（读不到就 null） */
export function packageNameOfApk(apk: Uint8Array, inflateRaw?: (b: Uint8Array) => Uint8Array): string | null {
  const entries = listZipEntries(apk);
  const entry = entries.find((e) => e.name === 'AndroidManifest.xml');
  if (!entry) return null;
  const manifest = readZipEntry(apk, entry, inflateRaw);
  if (!manifest) return null;
  return packageNameFromManifest(manifest);
}

/** 这个文件看起来是不是 APK（zip + 有 AndroidManifest.xml） */
export function looksLikeApk(bytes: Uint8Array): boolean {
  return listZipEntries(bytes).some((e) => e.name === 'AndroidManifest.xml');
}
