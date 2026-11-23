import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { normalizeAccountId } from '../core/account';
import { useApp } from '../store';
import { Btn, Card, Field, NoticeBar, Screen } from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { TabBar } from '../ui/TabBar';
import { color, font, radius } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

/**
 * 绑定页：**用账号 ID 互相绑定**。
 *
 * 账号模型下这件事变得很直接：
 *   · 你的账号 ID 是固定的（就是你登录的那个账号），发给 TA
 *   · TA 在自己的 App 里搜这个 ID → 发请求
 *   · 你点「同意」→ 两个账号并成一个双人空间
 *
 * 没有邀请码、没有时效、没有「A 端 / B 端」。
 * 所有判定都在服务器上做（账号存不存在、是不是自己、对方是不是已经有伴），
 * 客户端不再自己猜——那正是以前"ID 明明对了却说找不到"的根源。
 */
export default function BindScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const bound = snapshot.boundAt !== null;
  const online = store.remoteStatus.connected;
  const myId = store.myAccountId;
  const partner = snapshot.members[role === 'A' ? 'B' : 'A'];
  const partnerId = store.partnerPublicId;
  const incoming = snapshot.bindRequest;
  const fromOther = Boolean(incoming && incoming.fromRole !== role);
  const waiting = sentTo !== null || Boolean(incoming && !fromOther);

  useEffect(() => {
    if (bound) router.replace('/');
  }, [bound, router]);

  // 进页面先问服务器要一次最新状态：待确认的请求、对方账号 ID 都以服务器为准
  useEffect(() => {
    if (!online) return;
    void store.refreshFromServer();
    const timer = setInterval(() => void store.refreshFromServer(), 5000);
    return () => clearInterval(timer);
  }, [online, store]);

  const send = async () => {
    setBusy(true);
    const res = await store.requestBind(targetId);
    setBusy(false);
    if (res === 'paired') {
      router.replace('/');
      return;
    }
    if (res === 'requested') setSentTo(normalizeAccountId(targetId));
  };

  const typed = normalizeAccountId(targetId);

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="绑定你们的双人空间"
        subtitle="互相同意才绑定，任何一方都能随时解绑"
        right={<DevicePills />}
      >
        {!online ? (
          <>
            <NoticeBar
              tone={tint(color.butterSoft)}
              ink={color.careInk}
              icon="📶"
              text="还没连上同步服务器。两台手机要登录各自的账号、连同一台服务器，才能互相绑定。"
            />
            <Btn title="去检查服务器设置" onPress={() => router.push('/us')} />
          </>
        ) : null}

        {/* ---------------- 我的账号 ---------------- */}
        <Card>
          <Text style={font.h3}>我的账号</Text>
          <Text style={[font.small, { marginTop: 6, marginBottom: 10 }]}>
            把它发给 TA（微信、念给对方都行）。这个 ID 就是你的账号，不会过期。
          </Text>
          <View style={styles.idBox}>
            <Text style={styles.idText}>{myId || '——'}</Text>
            <Text style={[font.tiny, { textAlign: 'center', color: color.inkSoft, marginTop: 4 }]}>
              {snapshot.members[role].name || '我'}
            </Text>
          </View>
        </Card>

        {/* ---------------- 收到请求 ---------------- */}
        {fromOther && incoming ? (
          <Card tone={tint(color.mintSoft)}>
            <Text style={[font.bodyStrong, { color: color.ok }]}>
              {incoming.fromName || '有人'} 想和你绑定
            </Text>
            {incoming.fromPublicId ? (
              <Text style={[font.small, { marginTop: 4 }]}>账号 ID：{incoming.fromPublicId}</Text>
            ) : null}
            <Text style={[font.tiny, { marginTop: 6, color: color.inkSoft }]}>
              确认是你认识的那个人再同意。同意之后你们就在同一个双人空间里了。
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Btn
                title="同意绑定"
                small
                style={{ flex: 1 }}
                onPress={() => {
                  void (async () => {
                    const ok = await store.acceptBind();
                    if (ok) router.replace('/');
                  })();
                }}
              />
              <Btn
                title="拒绝"
                small
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => void store.declineBind()}
              />
            </View>
          </Card>
        ) : null}

        {/* ---------------- 搜对方账号 ID ---------------- */}
        <Card>
          <Text style={font.h3}>填 TA 的账号 ID</Text>
          <Text style={[font.small, { marginTop: 6, marginBottom: 10 }]}>
            TA 在他的 App「我们」页顶部能看到这串 ID，形如 TW8K3M9Q。
          </Text>
          <Field
            label="对方的账号 ID"
            value={targetId}
            onChangeText={(t) => setTargetId(normalizeAccountId(t))}
            placeholder="例如 TW8K3M9Q"
            maxLength={12}
            autoCapitalize="characters"
          />
          {typed.length > 0 && typed === myId ? (
            <Text style={[font.tiny, { color: color.danger, marginBottom: 8 }]}>
              这是你自己的账号，要填对方的
            </Text>
          ) : null}
          <Btn
            title={busy ? '发送中…' : '发送绑定请求'}
            disabled={!online || busy || typed.length === 0}
            onPress={() => void send()}
          />
          {waiting ? (
            <Text style={[font.tiny, { marginTop: 10, color: color.careInk }]}>
              请求已发出，等 TA 在手机上点「同意绑定」即可。TA 现在不在线也没关系，下次打开就能看到。
            </Text>
          ) : null}
        </Card>

        {partner.profileCompleted && partnerId ? (
          <Card tone={surf('alt')}>
            <Text style={[font.tiny, { color: color.inkMid }]}>
              空间里现在已经有另一位：{partner.name}（账号 {partnerId}）
            </Text>
          </Card>
        ) : null}

        <NoticeBar
          tone={tint(color.skySoft)}
          ink={color.inkMid}
          icon="🔒"
          text="知道账号 ID 也进不来：必须你自己在手机上点「同意」；没有登录码也登录不了你的账号。"
        />

        <View style={{ height: 120 }} />
      </Screen>
      <TabBar active="today" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  idBox: {
    paddingVertical: 16,
    borderRadius: radius.md,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
  },
  idText: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    color: color.ink,
  },
});
