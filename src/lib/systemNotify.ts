/**
 * 系统级通知（锁屏 / 通知栏）。
 *
 * 为什么要这层：以前只有 App 内的提示框和 Toast —— App 在后台或者锁屏时
 * 什么都看不到（用户实测反馈"锁屏和通知里没有"）。
 * 这里用 expo-notifications 发**本地通知**：JS 还在跑（前台/后台一会儿）就能弹，
 * 通知栏和锁屏都会显示，点一下能回到 App。
 *
 * 注意边界：App 被系统彻底杀掉之后不会再收到任何东西（那需要 FCM/APNs 服务端推送）。
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotifyPrefs } from '../core/notifyPrefs';
import { lockText, shouldPresent } from '../core/notifyPrefs';

export const ANDROID_CHANNEL_ID = 'twospace-default';

/** 只缓存"handler 装好 / 渠道建好"，**不缓存权限结果** */
let handlerReady = false;
let granted = false;

/**
 * 初始化：请求权限 + 建通知渠道 + 前台也显示横幅。
 *
 * 权限每次都要重新问系统：以前是把第一次的结果永久缓存住，第一次被拒之后
 * 用户去系统设置里打开通知、回来点「重新申请权限」也还是 false，必须杀进程重开；
 * 本次会话内所有系统通知（包括"安全到家"这类）都会被静默丢弃。
 */
export async function ensureSystemNotify(): Promise<boolean> {
  if (handlerReady) {
    try {
      const cur = await Notifications.getPermissionsAsync();
      const ok = cur.status === "granted" || (cur as { granted?: boolean }).granted === true;
      if (ok) {
        granted = true;
        return true;
      }
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.status === "granted" || (asked as { granted?: boolean }).granted === true;
      return granted;
    } catch {
      return granted;
    }
  }
  handlerReady = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Mutual',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    granted = status === 'granted';
    return granted;
  } catch {
    granted = false;
    return false;
  }
}

export function systemNotifyGranted(): boolean {
  return granted;
}

/** 弹一条系统通知（锁屏 + 通知栏）。返回是否真的发出了 */
export async function presentSystemNotify(
  title: string,
  body: string,
): Promise<boolean> {
  const ok = await ensureSystemNotify();
  if (!ok) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: null, // 立即
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 按用户设置判断并弹出（免打扰 / 分类开关 / 锁屏模式都在这里生效）。
 */
export async function presentIfAllowed(
  prefs: NotifyPrefs,
  kind: string,
  text: string,
  now: Date = new Date(),
): Promise<boolean> {
  const decision = shouldPresent(prefs, kind, now);
  if (!decision.present) return false;
  return presentSystemNotify('Mutual', lockText(prefs, text));
}

/** 「发一条测试通知」按钮用：跳过所有开关，直接发一条，验证权限和锁屏设置 */
export async function sendTestNotify(): Promise<boolean> {
  const ok = await ensureSystemNotify();
  if (!ok) return false;
  return presentSystemNotify('Mutual · 测试通知', '看到这条说明权限和通知渠道都正常');
}
