/**
 * 当前"该用哪张图当背景"的同步快照。
 *
 * AppFrame 每次渲染都会把已经解析好的绝对地址写进来（自定义壁纸的首帧图 / 视频地址），
 * 模块页（一起看、影院详情、片库…）在"不播背景视频"时直接读它铺静态图。
 *
 * 为什么不各自用 store 拼地址：之前模块页自己拼 `store.gameBaseUrl + poster`，
 * 某些时序下 baseUrl 还是空串 → 地址不合法 → 图不显示，
 * 用户在"一起看/详情"里就看到二次元壁纸凭空消失了。
 */
let still: string | null = null;

export function setBackdropStill(uri: string | null): void {
  still = uri;
}

export function getBackdropStill(): string | null {
  return still;
}
