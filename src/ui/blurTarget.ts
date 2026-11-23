/** 全 App 共用的"毛玻璃目标"：BlurView 只模糊它，才是真磨砂而不是半透白 */
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import React from 'react';

/** AppFrame 里包住背景层的那个 View 的 ref（由 AppFrame 填） */
export const blurTargetRef: RefObject<ComponentRef<typeof View> | null> = React.createRef();

/** BlurView 通用参数：新 API（blurMethod + blurTarget），旧 experimentalBlurMethod 已废弃 */
export const blurProps = {
  blurMethod: 'dimezisBlurViewSdk31Plus' as const,
  blurTarget: blurTargetRef,
  blurReductionFactor: 6,
};

/**
 * 背景是**视频**时，毛玻璃其实什么也糊不到（视频盖在目标层上面），
 * 但每个 BlurView 都会让系统多跑一遍 RenderEffect —— 页面上十来张卡片就是十来遍，
 * 这正是"用起来有点小卡顿"的来源之一。
 * 所以视频背景时直接退化成"白色半透明"，观感几乎一样，GPU 少一大截。
 */
let videoBgActive = false;
/**
 * 本次进程里只要**出现过**视频背景，就不再切回 blur。
 *
 * 真实事故：「我们的片单」那张卡片一直在闪。
 * 原因是卡片每次 store bump 都重渲染，而 BlurView 的挂载/卸载
 * 要看 `videoBgActive` —— 背景视频在起播、重挂、切集时会反复
 * 置真/置假，于是卡片就在"有磨砂 / 没磨砂"之间来回跳，看起来就是闪。
 * 视频背景下一旦关掉模糊就不再打开，最多闪一次（起播那一刻），之后稳定。
 */
let everVideoBg = false;

export function setVideoBgActive(on: boolean): void {
  videoBgActive = on;
  if (on) everVideoBg = true;
}

export function isVideoBgActive(): boolean {
  return videoBgActive;
}

/** 卡片/弹层要不要真的跑 blur */
export function shouldUseBlur(): boolean {
  return !everVideoBg;
}