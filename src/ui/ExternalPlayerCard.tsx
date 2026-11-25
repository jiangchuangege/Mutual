import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { night } from './nightTheme';
import { radius } from './theme';
import {
  extControl,
  extKeyOf,
  extTitleOf,
  fmtClock,
  playerName,
  startSyncLoop,
  stopSyncLoop,
  useExternalSession,
  type ExternalSession,
} from './externalPlayer';
import { openAccessSettings } from '../../modules/xm-media';

/**
 * 「外部播放器」卡片：喜马拉雅这类 App 在自己 App 里放，我们只做读取 + 进度同步。
 *
 * 用户原话：「不能接入到那个播放器那里吗？调用到我的账号 ID，我账号是有会员的」。
 * 会员权益只在他们 App 内生效，我不会去抓他们的付费音频；能做的是
 * 把「两台设备听到第几秒」对齐 —— 声音各放各的（都用各自的会员），进度由我们对齐。
 */
export function ExternalPlayerCard({
  enabled,
  autoFollow,
  partner,
  onPush,
  onToast,
}: {
  enabled: boolean;
  autoFollow: boolean;
  partner: { itemKey: string; positionSec: number; playing: boolean; updatedAt: number } | null;
  onPush: (input: { itemKey: string; positionSec: number; playing: boolean }) => void;
  onToast: (text: string) => void;
}) {
  const { available, granted, session, refresh, sessions: listSessions } = useExternalSession(enabled);
  const all = listSessions();
  const lastSeekAt = useRef(0);
  const lastPushAt = useRef(0);

  const key = session ? extKeyOf(session) : null;
  const posSec = session ? session.positionMs / 1000 : 0;
  const durSec = session ? session.durationMs / 1000 : 0;

  /*
   * 后台同步环：开着「跟随」又拿到授权就常驻 —— 人切回喜马拉雅、我们界面在后台时
   * 也继续上报进度并对齐。以前只在页面可见时跑，一回到喜马拉雅同步就断了。
   */
  const partnerRef = useRef(partner);
  partnerRef.current = partner;
  const pushRef = useRef(onPush);
  pushRef.current = onPush;
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  useEffect(() => {
    if (!granted || !autoFollow) {
      stopSyncLoop();
      return;
    }
    startSyncLoop({
      getPartner: () => partnerRef.current,
      push: (input) => pushRef.current(input),
      onAlign: (sec) => toastRef.current(`已对齐到 TA 的 ${fmtClock(sec)}`),
    });
    // 卸载时不停：后台还要同步；关掉跟随才停
  }, [granted, autoFollow]);

  if (!available) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>🎧 外部播放器</Text>
        <Text style={styles.tag}>{session ? playerName(session) : granted ? '没在放' : '未授权'}</Text>
      </View>
      <Text style={styles.hint}>
        喜马拉雅这类 App 在自己 App 里放（用你的会员），我们只读进度、对齐两台设备，不搬音频。
      </Text>
      {/* 诊断行：授权了但读不到时，这里会列出系统里所有媒体会话，方便定位是哪一步被卡住 */}
      {granted ? (
        <Text style={styles.diag} numberOfLines={2}>
          检测到 {all.length} 个媒体会话
          {all.length > 0
            ? `：${all.map((s) => `${s.appLabel}${s.playing ? '(播放中)' : ''}`).join('、')}`
            : '（没有任何 App 在放声音）'}
        </Text>
      ) : null}

      {!granted ? (
        <>
          <Text style={styles.warn}>需要一次「通知使用权」授权，才能读到播放进度。</Text>
          <Pressable
            onPress={() => {
              openAccessSettings();
              onToast('在列表里勾上「双人空间」，回来就自动生效');
            }}
            style={styles.primary}
          >
            <Text style={styles.primaryInk}>去授权通知使用权</Text>
          </Pressable>
        </>
      ) : !session ? (
        <Text style={styles.hint}>先在你常用的有声书 App 里点开一集播放，这里就会出现。</Text>
      ) : (
        <>
          <Text style={styles.nowTitle} numberOfLines={2}>
            {extTitleOf(session)}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.time}>
              {fmtClock(posSec)} / {durSec > 0 ? fmtClock(durSec) : '--:--'}
            </Text>
            <Text style={styles.state}>{session.playing ? '▶ 正在放' : '⏸ 已暂停'}</Text>
          </View>
          <View style={styles.btnRow}>
            <Pressable
              onPress={() => {
                extControl(session, 'seek', Math.max(0, posSec - 10));
                refresh();
              }}
              style={styles.btn}
            >
              <Text style={styles.btnInk}>−10s</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                extControl(session, 'toggle');
                refresh();
              }}
              style={[styles.btn, styles.btnMain]}
            >
              <Text style={[styles.btnInk, styles.btnMainInk]}>{session.playing ? '⏸ 暂停' : '▶ 播放'}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                extControl(session, 'seek', posSec + 10);
                refresh();
              }}
              style={styles.btn}
            >
              <Text style={styles.btnInk}>+10s</Text>
            </Pressable>
          </View>
          <View style={styles.btnRow}>
            <Pressable
              onPress={() => {
                if (!key) return;
                onPush({ itemKey: key, positionSec: posSec, playing: session.playing });
                onToast(`已把这集和 ${fmtClock(posSec)} 发给 TA`);
              }}
              style={styles.btnWide}
            >
              <Text style={styles.btnInk}>同步到这里</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!partner || partner.itemKey !== key) {
                  onToast('TA 那边还没在放同一集');
                  return;
                }
                if (!session.canSeek) {
                  onToast('这个 App 不允许跳转进度');
                  return;
                }
                extControl(session, 'seek', partner.positionSec);
                refresh();
                onToast(`已跟到 TA 的 ${fmtClock(partner.positionSec)}`);
              }}
              style={styles.btnWide}
            >
              <Text style={styles.btnInk}>跟随 TA</Text>
            </Pressable>
          </View>
          {partner && partner.itemKey === key ? (
            <Text style={styles.partner}>
              TA 也在放这一集 · {fmtClock(partner.positionSec)}
              {partner.playing ? ' · 播放中' : ' · 已暂停'}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(12,20,40,0.74)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.20)',
    padding: 14,
    marginTop: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, color: night.text, fontSize: 13.5, fontWeight: '800' },
  tag: { color: night.cyan, fontSize: 11, fontWeight: '700' },
  hint: { color: night.textDim, fontSize: 10.5, marginTop: 6, lineHeight: 16 },
  diag: { color: 'rgba(160,200,255,0.72)', fontSize: 10, marginTop: 6, lineHeight: 15 },
  warn: { color: '#FFD37A', fontSize: 11, marginTop: 8, lineHeight: 16 },
  primary: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(232,131,107,0.92)',
    alignItems: 'center',
  },
  primaryInk: { color: '#1A0E0A', fontSize: 12.5, fontWeight: '800' },
  nowTitle: { color: night.text, fontSize: 12.5, fontWeight: '700', marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  time: { color: night.textDim, fontSize: 11, fontVariant: ['tabular-nums'] },
  state: { color: night.cyan, fontSize: 11, marginLeft: 10, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.22)',
  },
  btnMain: { backgroundColor: 'rgba(120,220,255,0.18)', borderColor: 'rgba(120,220,255,0.45)' },
  btnWide: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.18)',
  },
  btnInk: { color: night.text, fontSize: 11.5, fontWeight: '700' },
  btnMainInk: { color: night.cyan },
  partner: { color: night.textFaint, fontSize: 10.5, marginTop: 8 },
});
