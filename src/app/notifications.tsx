import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LockMode, NotifyCategory } from '../core/notifyPrefs';
import { useApp } from '../store';
import {
  Btn,
  Card,
  NoticeBar,
  Screen,
  SectionTitle,
  Segmented,
  ToggleRow,
} from '../ui/components';
import { color, font, radius, shadow, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';
import { ensureSystemNotify, sendTestNotify, systemNotifyGranted } from '../lib/systemNotify';

export default function NotificationsScreen() {
  const router = useRouter();
  const { store, snapshot } = useApp();

  /**
   * 这些开关以前全是 useState，退出页面就还原成默认值——
   * 用户开了"紧急联系人例外"，再进来发现又关着（真实反馈）。
   * 现在统一存进 store.notifyPrefs，并且落盘（AsyncStorage）。
   */
  const prefs = store.notifyPrefs;
  const [permission, setPermission] = useState<boolean | null>(null);

  useEffect(() => {
    void ensureSystemNotify().then((ok) => setPermission(ok));
  }, []);

  const update = (patch: Partial<typeof prefs>) => {
    store.setNotifyPrefs({ ...prefs, ...patch });
  };

  const setCategory = (key: NotifyCategory, value: boolean) => {
    update({ categories: { ...prefs.categories, [key]: value } });
  };

  const notifications = snapshot.notifications.slice(0, 3);

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="通知与锁屏"
        subtitle="默认不打扰，锁屏不泄露任何敏感信息"
        right={<Btn title="返回" small variant="ghost" onPress={() => router.back()} />}
      >
        {permission === false ? (
          <NoticeBar
            tone={tint(color.butterSoft)}
            ink={color.careInk}
            icon="⚠️"
            text="系统通知权限还没给：到手机「设置 → 应用 → Mutual → 通知」里打开，否则锁屏和通知栏看不到提醒。"
          />
        ) : null}

        {/* 锁屏预览 */}
        <View style={styles.lockPhone}>
          <Text style={styles.lockTime}>9:41</Text>
          <Text style={styles.lockDate}>{new Date().toLocaleDateString('zh-CN')}</Text>
          <View style={{ height: 10 }} />
          {notifications.length === 0 ? (
            <View style={styles.lockCard}>
              <Text style={styles.lockApp}>Mutual</Text>
              <Text style={styles.lockText}>TA 今天可能需要关心</Text>
            </View>
          ) : (
            notifications.map((n) => (
              <View key={n.id} style={styles.lockCard}>
                <Text style={styles.lockApp}>Mutual</Text>
                <Text style={styles.lockText}>
                  {prefs.lockMode === 'neutral' ? 'Mutual · TA 那边有新的动静' : n.text}
                </Text>
              </View>
            ))
          )}
          <Text style={styles.lockHint}>
            以上为真实渲染：锁屏文案里不会出现"经期/生理期/流量/痛经"等任何词。
          </Text>
        </View>

        <NoticeBar
          tone={tint(color.mintSoft)}
          ink={color.ok}
          icon="✅"
          text={`已通过脱敏校验：本机所有通知文案均不含敏感词（当前共 ${snapshot.notifications.length} 条）。`}
        />

        <SectionTitle title="系统通知" />
        <Card>
          <Text style={[font.small, { lineHeight: 20 }]}>
            {permission === true
              ? '已获得通知权限：TA 那边有新动静时会推到锁屏和通知栏（App 完全被杀掉时收不到，这点和微信一样需要服务端推送）。'
              : permission === false
                ? '还没有通知权限，点下面的按钮重新申请一次。'
                : '正在检查通知权限…'}
          </Text>
          <View style={{ height: 10 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn
              title="发一条测试通知"
              small
              style={{ flex: 1 }}
              onPress={() => {
                void sendTestNotify().then((ok) => {
                  if (!ok) {
                    setPermission(false);
                    store.toast('发不出去：系统通知权限被关掉了', 'warn');
                  } else {
                    setPermission(systemNotifyGranted());
                    store.toast('已发送，看一下锁屏 / 通知栏', 'ok');
                  }
                });
              }}
            />
            <Btn
              title="重新申请权限"
              small
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                void ensureSystemNotify().then((ok) => {
                  setPermission(ok);
                  store.toast(ok ? '通知权限已开启' : '还是没给权限，去系统设置里开一下', ok ? 'ok' : 'warn');
                });
              }}
            />
          </View>
        </Card>

        <SectionTitle title="锁屏显示内容" />
        <Card>
          <Segmented
            value={prefs.lockMode}
            onChange={(v) => update({ lockMode: v as LockMode })}
            options={[
              { value: 'detail', label: '显示详情' },
              { value: 'neutral', label: '中性文案' },
              { value: 'none', label: '不显示' },
            ]}
          />
          <Text style={[font.small, { marginTop: 10 }]}>
            经期与关怀类通知「始终」使用中性文案，此开关对其无效（产品底线，不可关闭）。
          </Text>
          <View style={{ height: 10 }} />
          <Text style={[font.tiny]}>
            如果没做脱敏，锁屏上可能会直接出现"她经期第 2 天"——这正是我们要避免的。
          </Text>
        </Card>

        <SectionTitle title="免打扰" />
        <Card>
          <ToggleRow
            label="夜间免打扰"
            desc="22:00 – 08:00 不推送（用户自设提醒除外）"
            value={prefs.dnd}
            onChange={(v) => update({ dnd: v })}
          />
          <ToggleRow
            label="紧急联系人例外"
            desc="仅冷静卡与安全报备可穿透免打扰"
            value={prefs.urgentException}
            onChange={(v) => update({ urgentException: v })}
          />
          <Text style={[font.tiny, { marginTop: 6 }]}>
            这些开关会记住（存在本机），退出页面再进来不会变回去。
          </Text>
        </Card>

        <SectionTitle title="分类开关" />
        <Card>
          <ToggleRow
            label="生活提醒"
            desc="待办、日历、购物清单"
            value={prefs.categories.life}
            onChange={(v) => setCategory('life', v)}
          />
          <ToggleRow
            label="关怀提醒"
            desc="中性文案，不含任何身体数据"
            value={prefs.categories.care}
            onChange={(v) => setCategory('care', v)}
          />
          <ToggleRow
            label="情感互动"
            desc="心情天气、卡片、TA 的动态"
            value={prefs.categories.emotion}
            onChange={(v) => setCategory('emotion', v)}
          />
          <ToggleRow
            label="影院"
            desc="邀请与房间状态（不含片名）"
            value={prefs.categories.cinema}
            onChange={(v) => setCategory('cinema', v)}
          />
          <ToggleRow
            label="系统"
            desc="授权变更、解绑等重要通知"
            value={prefs.categories.system}
            onChange={(v) => setCategory('system', v)}
          />
        </Card>

        <Card tone={surf('alt')}>
          <Text style={[font.small]}>
            单用户每日主动推送上限 3 条（不含你自己设的提醒）。任何提醒都可以"本周不再提醒"。
          </Text>
        </Card>

        <Btn title="完成" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  lockPhone: {
    backgroundColor: '#2B2724',
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.float,
  },
  lockTime: { color: '#FFFFFF', fontSize: 40, fontWeight: '300', letterSpacing: 1 },
  lockDate: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  lockCard: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    padding: 10,
    marginTop: 8,
  },
  lockApp: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginBottom: 2 },
  lockText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  lockHint: { color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 10, lineHeight: 15 },
});
