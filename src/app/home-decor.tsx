import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DECOR_CATALOG, THEME_META } from '../core/modules';
import type { ThemeId } from '../core/types';
import { useApp } from '../store';
import { Btn, Card, NoticeBar, ProgressBar, Screen, SectionTitle, Segmented } from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, radius, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

const SLOT_LABEL: Record<string, string> = {
  wall: '墙面',
  floor: '地面',
  light: '灯',
  plant: '绿植位',
  shelf: '架子',
  window: '窗景',
  rug: '地毯',
  desk: '桌面',
};

export default function HomeDecorScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const [tab, setTab] = useState<'room' | 'pet' | 'theme'>('room');
  const [picking, setPicking] = useState<string | null>(null);

  const decor = snapshot.decor;
  const pet = snapshot.pet;
  const partner = role === 'A' ? 'B' : 'A';
  const catalogFor = (slot: string) => DECOR_CATALOG[slot] ?? [];

  const findEmoji = (itemId: string | null): string => {
    if (!itemId) return '＋';
    for (const list of Object.values(DECOR_CATALOG)) {
      const found = list.find((i) => i.id === itemId);
      if (found) return found.emoji;
    }
    return '·';
  };

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="我们的房间"
        subtitle="把这里布置成只属于你们两个人的样子"
        right={<DevicePills />}
      >
        <Segmented
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'room', label: '房间' },
            { value: 'pet', label: '绿植' },
            { value: 'theme', label: '主题' },
          ]}
        />

        {tab === 'room' ? (
          <>
            <Card style={{ marginTop: space.md }}>
              <Text style={[font.tiny, { marginBottom: 8 }]}>
                双方同步看到同一间房 · 最近由{' '}
                {snapshot.members[decor.updatedBy].name} 改动
              </Text>
              <View style={styles.roomGrid}>
                {Object.keys(decor.slots).map((slot) => (
                  <Pressable
                    key={slot}
                    onPress={() => setPicking(slot)}
                    style={[
                      styles.slot,
                      slot === 'wall' || slot === 'window' ? styles.slotWide : null,
                    ]}
                  >
                    <Text style={{ fontSize: 26 }}>{findEmoji(decor.slots[slot])}</Text>
                    <Text style={[font.tiny, { marginTop: 4 }]}>{SLOT_LABEL[slot] ?? slot}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[font.tiny, { marginTop: 10 }]}>
                这里只有 8 个位置，装饰不做过度堆叠——这是产品刻意限制的。
              </Text>
            </Card>

            {picking ? (
              <Card>
                <Text style={font.bodyStrong}>{SLOT_LABEL[picking]} 放什么</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                  {catalogFor(picking).map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        store.decorate(picking, item.id);
                        setPicking(null);
                      }}
                      style={styles.catalogCell}
                    >
                      <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                      <Text style={[font.tiny, { marginTop: 4 }]}>{item.label}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => {
                      store.decorate(picking, null);
                      setPicking(null);
                    }}
                    style={styles.catalogCell}
                  >
                    <Text style={{ fontSize: 22 }}>🫥</Text>
                    <Text style={[font.tiny, { marginTop: 4 }]}>清空</Text>
                  </Pressable>
                </View>
                <View style={{ height: 10 }} />
                <Btn title="取消" small variant="ghost" onPress={() => setPicking(null)} />
              </Card>
            ) : null}
          </>
        ) : null}

        {tab === 'pet' ? (
          <>
            <Card style={{ marginTop: space.md }} tone={tint(color.mintSoft)}>
              <Text style={[font.h3, { color: color.ok }]}>🪴 {pet.name}</Text>
              <Text style={[font.small, { color: color.ok, marginTop: 4 }]}>
                累计照料 {pet.careDays} 天 · 已解锁 {pet.decorUnlocked} 件装饰
              </Text>
            </Card>

            <Card>
              <Text style={font.tiny}>水</Text>
              <View style={{ marginTop: 4, marginBottom: 10 }}>
                <ProgressBar value={pet.water / 100} tone={tint(color.sky)} />
              </View>
              <Text style={font.tiny}>养分</Text>
              <View style={{ marginTop: 4, marginBottom: 10 }}>
                <ProgressBar value={pet.food / 100} tone={tint(color.mint)} />
              </View>
              <Text style={font.tiny}>亲密度（只增不减）</Text>
              <View style={{ marginTop: 4 }}>
                <ProgressBar value={pet.affection / 100} tone={tint(color.primary)} />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <Btn title="浇水" small style={{ flex: 1 }} onPress={() => store.petCare('water')} />
                <Btn title="施肥" small style={{ flex: 1 }} onPress={() => store.petCare('feed')} />
                <Btn title="摸摸" small variant="ghost" style={{ flex: 1 }} onPress={() => store.petCare('pet')} />
              </View>
            </Card>

            <NoticeBar
              tone={tint(color.butterSoft)}
              ink={color.careInk}
              icon="🌿"
              text="没有排行榜、没有连续签到惩罚、断签不会清零。水与养分会慢慢下降，但亲密度永远不减少。"
            />
          </>
        ) : null}

        {tab === 'theme' ? (
          <>
            <Card style={{ marginTop: space.md }}>
              <Text style={font.tiny}>
                当前：我 {THEME_META.find((t) => t.id === snapshot.themes.current[role])?.label} · TA{' '}
                {THEME_META.find((t) => t.id === snapshot.themes.current[partner])?.label}
                {snapshot.themes.synced ? ' · 已同步' : ' · 各自生效'}
              </Text>
            </Card>

            {THEME_META.map((t) => {
              const active = snapshot.themes.current[role] === t.id;
              return (
                <Card key={t.id} style={active ? { borderColor: color.primary, borderWidth: 2 } : undefined}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={font.bodyStrong}>{t.label}</Text>
                      <Text style={[font.small, { marginTop: 2 }]}>{t.desc}</Text>
                    </View>
                    {active ? <Text style={[font.tiny, { color: color.ok }]}>使用中</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Btn
                      title="仅我用"
                      small
                      variant={active ? 'ghost' : 'soft'}
                      style={{ flex: 1 }}
                      onPress={() => store.setTheme(t.id as ThemeId, false)}
                    />
                    <Btn
                      title="同步给 TA"
                      small
                      variant="ghost"
                      style={{ flex: 1 }}
                      onPress={() => store.setTheme(t.id as ThemeId, true)}
                    />
                  </View>
                </Card>
              );
            })}
            <Text style={[font.tiny, { textAlign: 'center', marginBottom: 20 }]}>
              经期关怀页在任何主题下都不会使用血红警告色。
            </Text>
          </>
        ) : null}

        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    width: '22.5%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotWide: { width: '47%', aspectRatio: 2 },
  catalogCell: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 12,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: radius.md,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
  },
});
