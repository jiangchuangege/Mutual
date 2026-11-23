import { AGORA_CONSOLE_URL, classifyRtcError, type RtcErrorInfo } from '../core/rtcErrors';
import { requestRecordingPermissionsAsync as requestMicPermission } from 'expo-audio';
import {
  AgoraVoiceChannel,
  describeRtcConfig,
  getRtcRuntimeConfig,
  type RtcFailure,
  type VoiceChannelState,
} from '../core/rtc';
import { fetchRtcToken, uidForRole } from '../core/rtcToken';
import type { VoiceCallState } from '../core/types';
import { useApp } from '../store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Btn, Card, Pill, useToast } from './components';
import { color, font, radius, shadow } from './theme';
import { surf } from './theme';

const KIND_EMOJI: Record<RtcErrorInfo['kind'], string> = {
  quota: '💛',
  token: '🔑',
  config: '⚙️',
  network: '📶',
  device: '🎙️',
  unknown: '🤔',
};

/** 优雅的错误弹窗：不甩错误码，先给结论与出路 */
function RtcErrorModal({
  info,
  visible,
  onClose,
  onRetry,
  onTextOnly,
}: {
  info: RtcErrorInfo | null;
  visible: boolean;
  onClose: () => void;
  onRetry: () => void;
  onTextOnly: () => void;
}) {
  const toast = useToast();
  if (!info) return null;

  const openConsole = async () => {
    try {
      const okOpen = await Linking.canOpenURL(AGORA_CONSOLE_URL);
      if (!okOpen) {
        toast.show(`请手动打开 ${AGORA_CONSOLE_URL}`, 'warn');
        return;
      }
      await Linking.openURL(AGORA_CONSOLE_URL);
    } catch {
      toast.show(`请手动打开 ${AGORA_CONSOLE_URL}`, 'warn');
    }
  };

  const primaryIsRecharge = info.kind === 'quota';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.emojiCircle}>
            <Text style={{ fontSize: 30 }}>{KIND_EMOJI[info.kind]}</Text>
          </View>

          <Text style={styles.modalTitle}>{info.title}</Text>
          <Text style={styles.modalBody}>{info.body}</Text>

          {info.kind === 'quota' ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintTitle}>怎么继续用</Text>
              <Text style={styles.hintLine}>1. 打开 Agora 控制台（console.agora.io）</Text>
              <Text style={styles.hintLine}>2. 左侧「费用中心 / Billing」充值</Text>
              <Text style={styles.hintLine}>3. 回到这里点「重试一次」即可</Text>
            </View>
          ) : null}

          {primaryIsRecharge ? (
            <>
              <Btn title="去官网充值" onPress={() => void openConsole()} />
              <View style={{ height: 8 }} />
              <Btn title="稍后再说" variant="ghost" onPress={onClose} />
            </>
          ) : (
            <>
              {info.canRetry ? <Btn title={info.primaryLabel ?? '重试一次'} onPress={onRetry} /> : null}
              {info.canRetry ? <View style={{ height: 8 }} /> : null}
              <Btn title="先用文字聊" variant={info.canRetry ? 'ghost' : 'primary'} onPress={onTextOnly} />
              <View style={{ height: 8 }} />
              <Btn title="知道了" variant="ghost" onPress={onClose} />
            </>
          )}

          <Text style={styles.detailText}>{info.detail}</Text>
        </View>
      </View>
    </Modal>
  );
}

/** RTC 媒体通道：接通后真的建立音频通道 */
function AgoraChannel({
  connected,
  channel,
  role,
  muted,
  speaker,
  volume,
  retryNonce,
  onFailure,
}: {
  connected: boolean;
  channel: string;
  role: 'A' | 'B';
  muted: boolean;
  speaker: boolean;
  volume: number;
  retryNonce: number;
  onFailure: (failure: RtcFailure) => void;
}) {
  const channelRef = useRef<AgoraVoiceChannel | null>(null);
  const [state, setState] = useState<VoiceChannelState>({
    joined: false,
    channel: null,
    remoteUid: null,
    error: null,
    errorCode: null,
  });
  const [authMode, setAuthMode] = useState<'token' | 'appId-only' | '-'>('-');
  const config = getRtcRuntimeConfig();

  useEffect(() => {
    let cancelled = false;
    const teardown = (ch: AgoraVoiceChannel | null) => {
      if (!ch) return;
      ch.leave();
      ch.release();
    };

    if (!connected) {
      teardown(channelRef.current);
      channelRef.current = null;
      setState({ joined: false, channel: null, remoteUid: null, error: null, errorCode: null });
      setAuthMode('-');
      return;
    }

    const ch = new AgoraVoiceChannel((s) => {
      if (!cancelled) setState(s);
    });

    const boot = async () => {
      /**
       * 先要麦克风权限。
       *
       * 用户实测：「语音通话能接通，但双方都没有声音」。
       * Android 上 RECORD_AUDIO 是**运行时权限**：清单里声明了不等于拿到了。
       * Agora 在没有权限时会照常加入频道（所以界面显示"已接通"），
       * 但上行是一路静音 —— 两台手机都这样，就是"双方都没声音"。
       * 以前只有录语音留言的页面申请过这个权限，通话路径从来没申请。
       */
      const mic = await requestMicPermission();
      if (!mic.granted) {
        const failure: RtcFailure = {
          message: '没有麦克风权限：到手机「设置 → 应用 → Mutual → 权限」里打开麦克风，再重试',
          code: null,
        };
        if (!cancelled) {
          setState({ joined: false, channel, remoteUid: null, error: failure.message, errorCode: null });
          onFailure(failure);
        }
        return;
      }

      const initFailure = ch.init(config.appId);
      if (initFailure) {
        if (!cancelled) {
          setState({
            joined: false,
            channel,
            remoteUid: null,
            error: initFailure.message,
            errorCode: initFailure.code,
          });
          onFailure(initFailure);
        }
        return;
      }

      let token = '';
      if (config.tokenServer) {
        const result = await fetchRtcToken(config.tokenServer, channel, uidForRole(role));
        if (cancelled) return;
        if (result.error !== null || result.token === null) {
          const failure: RtcFailure = {
            message: result.error ?? '获取语音 token 失败',
            code: 109,
          };
          setState({ joined: false, channel, remoteUid: null, error: failure.message, errorCode: failure.code });
          onFailure(failure);
          ch.release();
          return;
        }
        token = result.token;
        setAuthMode(result.mode === 'token' ? 'token' : 'appId-only');
      } else {
        setAuthMode('appId-only');
      }

      const joinFailure = ch.join(channel, role, token);
      if (joinFailure) {
        if (!cancelled) {
          setState({
            joined: false,
            channel,
            remoteUid: null,
            error: joinFailure.message,
            errorCode: joinFailure.code,
          });
          onFailure(joinFailure);
        }
        ch.release();
        return;
      }
      if (cancelled) {
        teardown(ch);
        return;
      }
      channelRef.current = ch;
    };

    void boot();

    return () => {
      cancelled = true;
      teardown(channelRef.current);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, channel, role, config.appId, config.tokenServer, retryNonce]);

  useEffect(() => {
    if (channelRef.current && connected) channelRef.current.setMuted(muted);
  }, [connected, muted]);

  // 规格 E10：App 切到后台 / 来电时，默认关闭麦克风上行（不做后台录音）
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    if (!connected) return;
    const sub = AppState.addEventListener('change', (next) => {
      const ch = channelRef.current;
      if (!ch) return;
      if (next === 'active') {
        ch.setMuted(mutedRef.current);
      } else {
        ch.setMuted(true);
      }
    });
    return () => sub.remove();
  }, [connected]);

  useEffect(() => {
    if (channelRef.current && connected) channelRef.current.setSpeaker(speaker);
  }, [connected, speaker]);

  useEffect(() => {
    if (channelRef.current && connected) channelRef.current.setVolume(volume);
  }, [connected, volume]);

  const tone = state.error ? color.butterSoft : state.joined ? color.mintSoft : surf('alt');
  const ink = state.error ? color.careInk : state.joined ? color.ok : color.inkSoft;
  const line = state.error
    ? '语音通道没能建立，点下面的提示查看怎么办'
    : state.joined
      ? `已加入语音频道${state.remoteUid ? '，对方已接入' : '，等待对方接入'}${muted ? '（你已静音）' : '（麦克风上行中）'}`
      : '正在建立语音通道…';

  return (
    <View style={[styles.agora, { backgroundColor: tone }]}>
      <Text style={[font.tiny, { color: ink }]}>{line}</Text>
      <Text style={[font.tiny, { color: ink, marginTop: 4, opacity: 0.85 }]}>
        App ID {describeRtcConfig()} · 频道 {state.channel ?? channel} · 鉴权{' '}
        {authMode === 'token' ? 'Token 模式' : authMode === 'appId-only' ? 'App ID 模式' : '-'} · 不录音不存储
      </Text>
    </View>
  );
}

/**
 * 语音通话卡片：首页与影院房间共用同一个组件、同一份状态、同一个频道。
 * 任何 RTC 失败都会走分类 → 弹窗，绝不把裸错误码甩给用户。
 */
export function VoiceCallCard({
  voice,
  channel,
  role,
  compact = false,
}: {
  voice: VoiceCallState;
  channel: string;
  role: 'A' | 'B';
  compact?: boolean;
}) {
  const { store, snapshot } = useApp();
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';
  const status = voice.status;
  const connected = status === 'connected';

  const [errorInfo, setErrorInfo] = useState<RtcErrorInfo | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const handleFailure = useCallback((failure: RtcFailure) => {
    const info = classifyRtcError(failure.code, failure.message);
    setErrorInfo(info);
    setModalVisible(true);
  }, []);

  // 接通成功就清掉上一次的错误
  useEffect(() => {
    if (connected) {
      setErrorInfo(null);
      setModalVisible(false);
    }
  }, [connected]);

  const statusLabel =
    status === 'idle'
      ? '未接通'
      : status === 'inviting'
        ? voice.byRole === role
          ? '等待 TA 同意'
          : 'TA 邀请你语音'
        : status === 'connected'
          ? '已接通'
          : status === 'declined'
            ? '未接通（拒绝或超时）'
            : '已结束';

  return (
    <Card tone={connected ? color.mintSoft : compact ? surf('base') : surf('alt')}>
      <View style={styles.head}>
        <Text style={font.bodyStrong}>语音通话</Text>
        <Pill
          label={statusLabel}
          tone={connected ? color.mintSoft : status === 'inviting' ? color.butterSoft : surf('alt')}
          ink={connected ? color.ok : color.inkMid}
        />
      </View>

      {status === 'idle' || status === 'declined' || status === 'ended' ? (
        <View style={{ marginTop: 10 }}>
          <Btn
            title={`和 ${store.partnerLabel} 语音（需对方同意）`}
            small={compact}
            onPress={() => {
              setErrorInfo(null);
              store.startVoiceInvite();
            }}
          />
        </View>
      ) : null}

      {status === 'inviting' ? (
        voice.byRole === role ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[font.tiny]}>已推送脱敏通知给 TA，60 秒内未响应会自动失效。</Text>
            <View style={{ height: 8 }} />
            <Btn title="取消邀请" small variant="ghost" onPress={() => store.endVoice()} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn title="同意" small style={{ flex: 1 }} onPress={() => store.acceptVoiceInvite()} />
            <Btn title="拒绝" small variant="ghost" style={{ flex: 1 }} onPress={() => store.declineVoiceInvite()} />
          </View>
        )
      ) : null}

      {connected ? (
        <>
          <AgoraChannel
            connected={connected}
            channel={channel}
            role={role}
            muted={voice.muted[role]}
            speaker={voice.speaker[role]}
            volume={voice.volume[role]}
            retryNonce={retryNonce}
            onFailure={handleFailure}
          />

          {errorInfo ? (
            <Pressable onPress={() => setModalVisible(true)} style={styles.errorBar}>
              <Text style={[font.tiny, { color: color.careInk }]}>
                {errorInfo.kind === 'quota' ? '语音额度已用完' : errorInfo.title} · 点这里查看怎么办
              </Text>
            </Pressable>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn
              title={voice.muted[role] ? '取消静音' : '静音'}
              small
              variant={voice.muted[role] ? 'primary' : 'ghost'}
              style={{ flex: 1 }}
              onPress={() => store.setVoiceMuted(!voice.muted[role])}
            />
            <Btn
              title={voice.speaker[role] ? '切到听筒' : '开扬声器'}
              small
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => store.setVoiceSpeaker(!voice.speaker[role])}
            />
          </View>
          <View style={styles.volumeRow}>
            <Text style={[font.tiny]}>对方音量 {voice.volume[role]}</Text>
            <Btn title="-10" small variant="ghost" onPress={() => store.setVoiceVolume(voice.volume[role] - 10)} />
            <Btn title="+10" small variant="ghost" onPress={() => store.setVoiceVolume(voice.volume[role] + 10)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn title="网络差，切仅文字" small variant="ghost" style={{ flex: 1 }} onPress={() => store.switchToTextOnly()} />
            <Btn title="挂断" small variant="danger" style={{ flex: 1 }} onPress={() => store.endVoice()} />
          </View>
        </>
      ) : null}

      <Text style={[font.tiny, { marginTop: 10, color: color.inkSoft }]}>
        已接入 Agora RTC：邀请 / 同意 / 拒绝 / 60 秒超时 / 静音 / 扬声器 / 独立音量 / 切文字 / 挂断全部走服务端状态机；
        接通后由 RTC SDK 建立真实音频通道，挂断即 leaveChannel + release，全程不录音不存储。
      </Text>

      <RtcErrorModal
        info={errorInfo}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onRetry={() => {
          setModalVisible(false);
          setErrorInfo(null);
          setRetryNonce((n) => n + 1);
        }}
        onTextOnly={() => {
          setModalVisible(false);
          store.switchToTextOnly();
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  agora: { borderRadius: radius.md, padding: 10, marginTop: 8 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  errorBar: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: color.butterSoft,
    borderWidth: 1,
    borderColor: color.butter,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(46,42,40,0.5)', justifyContent: 'center', alignItems: 'center' },
  backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  modalCard: {
    width: '86%',
    maxWidth: 380,
    backgroundColor: color.bg,
    borderRadius: radius.xl,
    padding: 22,
    alignItems: 'stretch',
    ...shadow.float,
  },
  emojiCircle: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.butterSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: { ...font.h2, textAlign: 'center' },
  modalBody: { ...font.small, textAlign: 'center', marginTop: 8, marginBottom: 14, lineHeight: 20 },
  hintBox: {
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: color.line,
  },
  hintTitle: { ...font.tiny, color: color.inkMid, marginBottom: 6, fontWeight: '700' },
  hintLine: { ...font.small, color: color.inkMid, lineHeight: 19 },
  detailText: { ...font.tiny, textAlign: 'center', marginTop: 12, color: color.inkFaint },
});