import bg1 from '../../assets/wall/live-bg-1.mp4';
import bg2 from '../../assets/wall/live-bg-2.mp4';
import bg3 from '../../assets/wall/fm-bg.mp4';

/**
 * 壁纸视频，每个模块自己的那段：
 *   0 = 电视直播   1 = 影院 / 在线片库   2 = 焦焦FM（听书）
 * 集中在这里，换壁纸只改这一处。
 */
const wallVideos = [bg1, bg2, bg3];

export default wallVideos;

/** 网上扒的高分辨率夜景（1080×1920），给缺视频兜底 / 做静态满屏背景 */
export const wallStills = [require('../../assets/wall/bg-0.jpg'), require('../../assets/wall/bg-1.jpg')];
