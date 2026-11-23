/**
 * 静态资源（图片）的模块声明。
 *
 * 项目里没有 expo-env.d.ts，TypeScript 默认不认识 `import x from './a.png'`，
 * 于是 tsc 会把所有引图片的地方都报成「找不到模块」。
 * Metro 在打包时会把图片解析成一个数字（资源 id），
 * 所以这里按"默认导出是 number"声明，运行时和类型两边对得上。
 */

declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.jpg' {
  const asset: number;
  export default asset;
}

declare module '*.jpeg' {
  const asset: number;
  export default asset;
}

declare module '*.gif' {
  const asset: number;
  export default asset;
}

declare module '*.webp' {
  const asset: number;
  export default asset;
}

declare module '*.mp4' {
  const asset: number;
  export default asset;
}
