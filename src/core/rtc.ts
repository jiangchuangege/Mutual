/**
 * 语音媒体通道 —— Agora RTC 接入层（真实接通，不伪造状态）
 *
 * 设计原则：
 * 1. 有 App ID 且原生模块可用 → 真正加入 RTC 频道：麦克风上行、对方声音下行；
 * 2. 失败时返回**结构化错误**（message + 错误码），由 UI 分类成人话弹窗，
 *    绝不把 "110" 这种裸错误码甩给用户；
 * 3. 通话结束或组件卸载 → leaveChannel + release，频道资源销毁；
 * 4. 全程不开启任何录制/转写能力。
 */

import Constants from 'expo-constants';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  type ChannelMediaOptions,
  type IRtcEngine,
} from 'react-native-agora';

import { RTC_APP_ID, RTC_TOKEN_SERVER } from './rtcConfigValues';

export interface RtcFailure {
  message: string;
  code: number | null;
}

export interface VoiceChannelState {
  joined: boolean;
  channel: string | null;
  remoteUid: number | null;
  error: string | null;
  errorCode: number | null;
}

/** 依次尝试多个来源读取 app.json 的 extra（standalone / Expo Go / 老清单都覆盖） */
function readExtra(): Record<string, unknown> {
  type WithExtra = { extra?: Record<string, unknown> };
  const c = Constants as unknown as {
    expoConfig?: WithExtra | null;
    manifest2?: { extra?: { expoClient?: WithExtra } } | null;
    manifest?: WithExtra | null;
  };
  const candidates: Array<Record<string, unknown> | undefined> = [
    c.expoConfig?.extra,
    c.manifest2?.extra?.expoClient?.extra,
    c.manifest?.extra,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate;
  }
  return {};
}

export interface RtcRuntimeConfig {
  appId: string;
  /** 自建 / 自有 token 服务地址；为空则按 App ID 无证书模式（token 传空串） */
  tokenServer: string;
}

export function getRtcRuntimeConfig(): RtcRuntimeConfig {
  const extra = readExtra() as { rtcAppId?: unknown; rtcTokenServer?: unknown };
  const fromExtraAppId = typeof extra.rtcAppId === 'string' ? extra.rtcAppId.trim() : '';
  const fromExtraServer =
    typeof extra.rtcTokenServer === 'string' ? extra.rtcTokenServer.trim() : '';
  // app.json 优先；读不到时回落到构建期常量（standalone 包更可靠）
  return {
    appId: fromExtraAppId || RTC_APP_ID,
    tokenServer: fromExtraServer || RTC_TOKEN_SERVER,
  };
}

/** 只用于界面提示：把 App ID 打码后显示，确认到底有没有读进来 */
export function describeRtcConfig(): string {
  const { appId, tokenServer } = getRtcRuntimeConfig();
  if (!appId) return '未配置 App ID';
  const masked = appId.length > 8 ? `${appId.slice(0, 4)}…${appId.slice(-4)}` : appId;
  return `${masked}${tokenServer ? ' · 已配 token 服务' : ''}`;
}

const UID_BY_ROLE: Record<'A' | 'B', number> = { A: 1001, B: 1002 };

export class AgoraVoiceChannel {
  private engine: IRtcEngine | null = null;
  private state: VoiceChannelState = {
    joined: false,
    channel: null,
    remoteUid: null,
    error: null,
    errorCode: null,
  };
  private muted = false;
  private speaker = false;
  private volume = 80;

  constructor(private readonly onState?: (s: VoiceChannelState) => void) {}

  private push(patch: Partial<VoiceChannelState>): void {
    this.state = { ...this.state, ...patch };
    this.onState?.(this.state);
  }

  get status(): VoiceChannelState {
    return this.state;
  }

  /** 返回 null 表示成功 */
  init(appId: string): RtcFailure | null {
    if (this.engine) return null;
    if (!appId) {
      return {
        message: '未配置语音服务（Agora App ID）：请在 app.json 的 extra.rtcAppId 填入后重新构建',
        code: 101,
      };
    }
    try {
      const engine = createAgoraRtcEngine();
      engine.registerEventHandler({
        onJoinChannelSuccess: (connection) => {
          this.push({ joined: true, channel: connection.channelId ?? null, error: null, errorCode: null });
        },
        onUserJoined: (_connection, remoteUid) => {
          this.push({ remoteUid });
        },
        onUserOffline: () => {
          this.push({ remoteUid: null });
        },
        onError: (err, msg) => {
          this.push({ joined: false, error: msg, errorCode: Number(err) });
        },
      });
      const ret = engine.initialize({
        appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });
      if (ret !== 0) {
        /*
         * 真实事故：初始化失败时直接 return，而 this.engine 还没赋值 →
         * release() 因为 engine 为 null 什么也不做，原生引擎（带自己的线程和音频设备）
         * 就永久留在内存里；用户每点一次"重试"再叠一个，几个之后开始掉音、耗电。
         */
        try {
          engine.release();
        } catch {
          // 释放失败也不能影响错误上报
        }
        return { message: `RTC 初始化失败（错误码 ${ret}）`, code: ret };
      }
      engine.enableAudio();
      /*
       * 打开本地上行：某些机型初始化后默认是"只订阅不发布"，接通了双方都没声音。
       * 但**静音/音量必须按用户当前的偏好来**，不能硬写 false/100：
       * 以前这里强制 muteLocalAudioStream(false)，而 VoiceCall 页在引擎就绪之前
       * 就把"静音"设过了（那一刻 engine 还是 null，被忽略），于是界面显示
       * 「你已静音」、麦克风其实在上行 —— 隐私事故。
       */
      try {
        engine.enableLocalAudio(true);
        engine.muteLocalAudioStream(this.muted);
        engine.setEnableSpeakerphone(this.speaker);
        engine.adjustRecordingSignalVolume(this.muted ? 0 : 100);
        engine.adjustPlaybackSignalVolume(Math.round(Math.min(100, Math.max(0, this.volume))) * 1);
      } catch {
        // 个别版本没有这些方法时忽略
      }
      this.engine = engine;
      return null;
    } catch (err) {
      return {
        message: `RTC 初始化异常：${err instanceof Error ? err.message : String(err)}`,
        code: null,
      };
    }
  }

  /** 用 App ID（无证书模式）时 token 传空字符串即可 */
  join(channel: string, role: 'A' | 'B', token = ''): RtcFailure | null {
    if (!this.engine) return { message: 'RTC 未初始化', code: null };
    const options: ChannelMediaOptions = {
      channelProfile: ChannelProfileType.ChannelProfileCommunication,
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      publishCameraTrack: false,
      autoSubscribeAudio: true,
    };
    try {
      const ret = this.engine.joinChannel(token, channel, UID_BY_ROLE[role], options);
      if (ret !== 0) {
        return { message: `加入语音频道失败（错误码 ${ret}）`, code: ret };
      }
      /*
       * 进频道之后再应用一次偏好：任何"先设静音、后接通道"的顺序都不会
       * 让麦克风在界面上写着静音时继续上行。
       */
      try {
        this.engine.muteLocalAudioStream(this.muted);
        this.engine.setEnableSpeakerphone(this.speaker);
      } catch {
        // 忽略
      }
      this.push({ channel, error: null, errorCode: null });
      return null;
    } catch (err) {
      return {
        message: `加入语音频道异常：${err instanceof Error ? err.message : String(err)}`,
        code: null,
      };
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      this.engine?.muteLocalAudioStream(muted);
    } catch {
      // 引擎未就绪时忽略
    }
  }

  setSpeaker(on: boolean): void {
    this.speaker = on;
    try {
      this.engine?.setEnableSpeakerphone(on);
    } catch {
      // 引擎未就绪时忽略
    }
  }

  /** 只调对方人声音量（0–100 → 0–400），不动系统媒体音量 */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, Math.round(volume)));
    try {
      this.engine?.adjustPlaybackSignalVolume(this.volume * 4);
    } catch {
      // 引擎未就绪时忽略
    }
  }

  get preferences(): { muted: boolean; speaker: boolean; volume: number } {
    return { muted: this.muted, speaker: this.speaker, volume: this.volume };
  }

  leave(): void {
    try {
      this.engine?.leaveChannel();
    } catch {
      // 已离开时忽略
    }
    this.push({ joined: false, remoteUid: null });
  }

  /** 释放引擎：房间结束时必须调用，token 与频道随之销毁 */
  release(): void {
    try {
      this.engine?.release();
    } catch {
      // 已释放时忽略
    }
    this.engine = null;
    this.push({ joined: false, channel: null, remoteUid: null });
  }
}