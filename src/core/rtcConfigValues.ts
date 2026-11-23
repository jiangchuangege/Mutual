/**
 * RTC 运行时配置（构建期常量）
 *
 * 为什么要有这个文件：
 *   prebuild 出来的 standalone APK 里，`Constants.expoConfig.extra` 不保证非空
 *   （依赖 expo-updates / 清单注入）。把它写成源码常量，Metro 一定会打进 bundle，
 *   装到任何设备上都能读到，且可以直接在 APK 里 grep 到做验证。
 *
 * 安全边界：
 *   - App ID 是**客户端可见的公开标识**，放在这里没问题；
 *   - App Certificate **绝对不能**出现在客户端，只能放在服务端（see server/token-server.mjs）。
 *
 * 优先级：app.json 的 extra.rtcAppId（非空时） > 这里的常量。
 */

export const RTC_APP_ID = '80341501274e4ff6857f89b8604bb3f7';

/** 自建 token 服务地址，例如 http://192.168.1.10:8787；留空表示 App ID 无证书模式 */
export const RTC_TOKEN_SERVER = '';
