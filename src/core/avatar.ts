/**
 * 头像地址处理。
 *
 * 历史教训（v1.2.3 之前在真机上复现）：
 *   1. 选完头像是把图片 **copy 到手机本地**（`file:///data/user/0/…/twospace-avatar-xxx.jpg`），
 *      然后把这个本地路径当成"头像"同步出去 —— 对方的手机根本打不开那个路径，
 *      所以 TA 那边永远是默认的小叶子；卸载重装自己也丢。
 *   2. 界面上除了注册页那张预览，压根没有渲染过这个字段，于是"传了等于没传"。
 *
 * 现在：图片上传到我们自己的服务器，状态里只存 `/avatar/<文件>` 这样的**相对路径**，
 * 显示时用"当前连的服务器地址 + 路径"拼成绝对地址。这样：
 *   - 两台手机看到的是同一张图；
 *   - 换手机登录也能看到（图在服务器上）；
 *   - 状态体积不变（几百字节，而不是几百 KB 的 base64）。
 */

/** 服务器上头像的相对路径前缀 */
export const AVATAR_PATH_PREFIX = '/avatar/';
/** 空间背景图在服务器上的相对路径前缀 */
export const BACKGROUND_PATH_PREFIX = '/background/';
/** 清单里的照片 / 配图在服务器上的相对路径前缀 */
export const PHOTO_PATH_PREFIX = '/photo/';

/** 上传类型：头像 / 空间背景图 / 清单照片与配图 */
export type UploadKind = 'avatar' | 'background' | 'photo';

/** 上传前把图片压到的 base64 体积上限（和服务器一致） */
export const AVATAR_MAX_B64 = 3 * 1024 * 1024;

export type AvatarKind = 'none' | 'remote' | 'local' | 'data';

/** 是不是"我们服务器上的相对路径"（头像 / 背景 / 照片共用一套拼法） */
export function isServerRelativePath(v: string): boolean {
  return (
    v.startsWith(AVATAR_PATH_PREFIX) ||
    v.startsWith(BACKGROUND_PATH_PREFIX) ||
    v.startsWith(PHOTO_PATH_PREFIX)
  );
}

/** 判断这是哪种图片地址（用于显示和迁移） */
export function avatarKind(uri: string | null | undefined): AvatarKind {
  const v = (uri ?? '').trim();
  if (!v) return 'none';
  if (v.startsWith('data:image/')) return 'data';
  if (isServerRelativePath(v)) return 'remote';
  if (/^https?:\/\//i.test(v)) return 'remote';
  return 'local';
}

/**
 * 把状态里的图片字段变成可以直接喂给 <Image source={{uri}}> 的地址。
 * （头像 / 背景 / 照片共用；旧版本存的是 file:// 本地路径，原样返回本机能看，同时会触发迁移）
 *
 * @param uri       字段值（相对路径 / 绝对地址 / data: / 旧版的 file:）
 * @param serverUrl 当前连的服务器（例如 http://192.168.1.100:8787）
 * @returns 绝对地址；拿不到就返回 null
 */
export function resolveAvatarUri(
  uri: string | null | undefined,
  serverUrl: string | null | undefined,
): string | null {
  const v = (uri ?? '').trim();
  if (!v) return null;
  if (v.startsWith('data:image/')) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('file://') || v.startsWith('content://')) return v;
  if (isServerRelativePath(v)) {
    const base = (serverUrl ?? '').trim().replace(/\/+$/, '');
    if (!base) return null;
    return `${base}${v}`;
  }
  // 别的相对路径不认（防止拼出奇怪的地址）
  return null;
}

/** 从本地文件路径推断扩展名（上传时告诉服务器存成什么格式） */
export function avatarExtFromUri(uri: string): 'jpg' | 'png' | 'webp' {
  const clean = (uri.split('?')[0] ?? '').toLowerCase();
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.webp')) return 'webp';
  return 'jpg';
}

/** 上传前的基本校验：base64 太大 / 太空都拒绝，别把请求发出去 */
export function checkAvatarPayload(base64: string): { ok: true } | { ok: false; error: string } {
  const clean = base64.replace(/^data:image\/[a-z]+;base64,/i, '').replace(/\s/g, '');
  if (clean.length < 64) return { ok: false, error: '这张图读出来是空的，换一张试试' };
  if (clean.length > AVATAR_MAX_B64) {
    return { ok: false, error: '这张图太大了（超过 2MB），换一张小一点的' };
  }
  return { ok: true };
}
