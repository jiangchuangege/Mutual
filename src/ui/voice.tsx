import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Text as RNText } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Btn } from './components';
import { color, font, radius } from './theme';

const MAX_SECONDS = 60;

/**
 * 真实录音组件：真的开麦克风、真的落文件。
 * 不用任何模拟音源；没有权限时明确报错而不是假装录到了。
 */
export function VoiceRecorder({
  onDone,
  onError,
}: {
  onDone: (uri: string, durationSec: number) => void;
  onError?: (message: string) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const duration = Math.max(1, seconds);
      setRecording(false);
      setSeconds(0);
      if (!uri) {
        onError?.('没有录到声音，请再试一次');
        return;
      }
      onDone(uri, duration);
    } catch {
      setRecording(false);
      onError?.('录音失败，请检查麦克风权限');
    }
  };

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onError?.('没有麦克风权限，无法录制语音');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            void stop();
            return MAX_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      onError?.('录音启动失败（设备可能不支持）');
    }
  };

  return (
    <View style={styles.recorderRow}>
      {recording ? (
        <Btn title={`停止并发送（${seconds}s / ${MAX_SECONDS}s）`} small onPress={() => void stop()} style={{ flex: 1 }} />
      ) : (
        <Btn title="按住说一句（最多 60 秒）" small variant="soft" onPress={() => void start()} style={{ flex: 1 }} />
      )}
      {recording ? (
        <View style={styles.recordingDot}>
          <View style={styles.dotInner} />
          <Text style={[font.tiny, { color: color.danger, marginLeft: 6 }]}>录音中</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 真实播放：文件不存在或加载失败会明确提示 */
export function VoicePlayer({ uri, label }: { uri: string; label?: string }) {
  const player = useAudioPlayer(uri ? { uri } : undefined);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        player.play();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };

  return (
    <View style={styles.playerRow}>
      <Btn title={playing ? '暂停' : `▶ 播放${label ? ` ${label}` : ''}`} small variant="ghost" onPress={toggle} />
      {playing ? <Text style={[font.tiny, { marginLeft: 8 }]}>播放中…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  recorderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  recordingDot: { flexDirection: 'row', alignItems: 'center' },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
  },
});

/**
 * 通话中的麦克风指示器：**真的开麦克风采集**，但媒体通道未接 RTC，
 * 因此声音不会传到对方设备——这一点在 UI 上必须写清楚，不能假装在通话。
 */
export function CallMic({ active }: { active: boolean }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<'idle' | 'live' | 'denied' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          if (!cancelled) setState('denied');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!cancelled) {
          recorder.record();
          setState('live');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    };
    const stop = async () => {
      try {
        if (recorder.isRecording) await recorder.stop();
      } catch {
        // 停止失败不影响 UI
      }
      setState('idle');
    };

    if (active) void start();
    else void stop();

    return () => {
      cancelled = true;
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        // 卸载时静默清理
      }
    };
  }, [active, recorder]);

  const text =
    state === 'live'
      ? '🎙️ 麦克风已开启（本机采集，未上传）'
      : state === 'denied'
        ? '⚠️ 没有麦克风权限，只能文字互动'
        : state === 'error'
          ? '⚠️ 麦克风启动失败'
          : '麦克风已关闭';

  return <RNText style={[font.tiny, { color: state === 'live' ? color.ok : color.inkSoft }]}>{text}</RNText>;
}