/**
 * 背景视频的实时状态（只给「我们 → 诊断」用）。
 *
 * 为什么要有它：用户反馈"上传了 MP4 但看不到/不动"，
 * 光看截图分不清"背景是视频在播"还是"只显示了首帧占位图"。
 * AppFrame 里的播放器每秒把 status / 已播秒数写进来，诊断那行直接显示出来，
 * 一眼就能判断：status=readyToPlay 且秒数在涨 = 视频真的在播。
 */
export type VideoStatusSnapshot = {
  status: string;
  positionSec: number;
  updatedAt: number;
};

let current: VideoStatusSnapshot = { status: 'idle', positionSec: 0, updatedAt: 0 };

export function setVideoStatus(status: string, positionSec: number): void {
  current = { status, positionSec: Math.round(positionSec * 10) / 10, updatedAt: Date.now() };
}

export function getVideoStatus(): VideoStatusSnapshot {
  return current;
}

export function clearVideoStatus(): void {
  current = { status: 'idle', positionSec: 0, updatedAt: 0 };
}
