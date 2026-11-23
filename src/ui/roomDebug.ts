/**
 * 房间播放的调试读数（临时用，定位"一直加载不出来"）。
 * room.tsx 每帧写、我们 → 诊断 读。
 */
let info = '（还没进过房间）';

export function setRoomDebug(s: string): void {
  info = s;
}

export function getRoomDebug(): string {
  return info;
}
