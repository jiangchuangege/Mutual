import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { todayISO } from '../core/time';
import type { Role } from '../core/types';
import { useApp } from '../store';
import { Btn, Card, Chip, EmptyState, Field, NoticeBar, Screen, SectionTitle, Sheet } from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { tint } from '../ui/theme';

const CATEGORY_LABEL: Record<string, string> = {
  travel: '旅行',
  rent: '房租',
  daily: '日常',
  gift: '礼物',
  other: '其他',
};

export default function LedgerScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const partner: Role = role === 'A' ? 'B' : 'A';
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<Role>(role);
  const [split, setSplit] = useState<'equal' | 'custom'>('equal');
  const [ratioA, setRatioA] = useState('50');
  const [category, setCategory] = useState<'travel' | 'rent' | 'daily' | 'gift' | 'other'>('daily');
  const [ownerOnly, setOwnerOnly] = useState(false);

  const balance = store.hub.ledgerBalance();
  const who = balance.amountCents >= 0 ? snapshot.members[partner].name : snapshot.members[role].name;
  const owed = Math.abs(balance.amountCents) / 100;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title="共同记账" subtitle="记流水、看分摊、双方确认" right={<DevicePills />}>
        <Card tone={tint(color.primarySoft)}>
          <Text style={[font.tiny, { color: color.primaryInk }]}>已确认账目结算</Text>
          <Text style={[font.h1, { color: color.primaryInk, marginTop: 4 }]}>¥ {owed.toFixed(2)}</Text>
          <Text style={[font.small, { color: color.primaryInk, marginTop: 2 }]}>
            {balance.amountCents === 0 ? '当前两清' : `${who} 需要补给另外一方`}
          </Text>
          <Text style={[font.tiny, { color: color.primaryInk, marginTop: 6 }]}>
            已确认 {balance.settledCount} 笔 · 待确认 {balance.pendingCount} 笔（未确认不计入）
          </Text>
        </Card>

        <Btn title="＋ 记一笔" onPress={() => setOpen(true)} />

        <NoticeBar
          tone={tint(color.skySoft)}
          ink={color.inkMid}
          icon="ℹ️"
          text="分摊必须双方确认才计入结算；不采集收入/负债，只记共同开销。"
        />

        <SectionTitle title={`共 ${snapshot.ledger.length} 笔`} />
        {snapshot.ledger.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title="还没有记账"
            desc="旅行、房租、日常开销都可以先记下来。"
            actionLabel="记第一笔"
            onAction={() => setOpen(true)}
          />
        ) : (
          snapshot.ledger.map((e) => {
            const confirmed = e.confirmedBy.length >= 2;
            const shareA = Math.round((e.amountCents * e.shares.A) / 100);
            const shareB = Math.round((e.amountCents * e.shares.B) / 100);
            return (
              <Card key={e.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={font.bodyStrong}>{e.title}</Text>
                    <Text style={[font.small, { marginTop: 2 }]}>
                      ¥{(e.amountCents / 100).toFixed(2)} · {CATEGORY_LABEL[e.category]} ·{' '}
                      {e.payerRole === role ? '我付的' : `${snapshot.members[e.payerRole].name} 付的`}
                      {e.visibility === 'owner' ? ' · 仅我可见' : ''}
                    </Text>
                    <Text style={[font.tiny, { marginTop: 2 }]}>
                      分摊：我 ¥{role === 'A' ? shareA : shareB} / TA ¥{role === 'A' ? shareB : shareA}
                    </Text>
                  </View>
                  <Text style={[font.tiny, { color: confirmed ? color.ok : color.danger }]}>
                    {confirmed ? '已确认' : `待${e.confirmedBy.includes(role) ? 'TA' : '我'}确认`}
                  </Text>
                </View>
                {!confirmed && !e.confirmedBy.includes(role) ? (
                  <View style={{ marginTop: 10 }}>
                    <Btn title="确认这个分摊" small onPress={() => store.confirmLedger(e.id)} />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}

        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>

      <Sheet visible={open} title="记一笔" onClose={() => setOpen(false)}>
        <Field label="花在哪了" value={title} onChangeText={setTitle} placeholder="周末民宿 / 这个月房租" />
        <Field label="金额（元）" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="numeric" />
        <Text style={[font.tiny, { marginBottom: 6 }]}>谁付的钱</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          <Chip label="我付的" active={payer === role} onPress={() => setPayer(role)} />
          <Chip label={`${snapshot.members[partner].name} 付的`} active={payer === partner} onPress={() => setPayer(partner)} />
        </View>
        <Text style={[font.tiny, { marginBottom: 6 }]}>怎么分</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          <Chip label="人均" active={split === 'equal'} onPress={() => setSplit('equal')} />
          <Chip label="按比例" active={split === 'custom'} onPress={() => setSplit('custom')} />
        </View>
        {split === 'custom' ? (
          <Field
            label={`我承担的比例（%，剩下给 TA）`}
            value={ratioA}
            onChangeText={setRatioA}
            placeholder="50"
            keyboardType="numeric"
          />
        ) : null}
        <Text style={[font.tiny, { marginBottom: 6 }]}>分类</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          {(['travel', 'rent', 'daily', 'gift', 'other'] as const).map((c) => (
            <Chip key={c} label={CATEGORY_LABEL[c]} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          <Chip label="双方可见" active={!ownerOnly} onPress={() => setOwnerOnly(false)} />
          <Chip label="仅我可见" active={ownerOnly} onPress={() => setOwnerOnly(true)} />
        </View>
        <Btn
          title="保存"
          onPress={() => {
            const yuan = Number(amount);
            if (!Number.isFinite(yuan) || yuan <= 0) {
              store.toast('金额需要大于 0', 'error');
              return;
            }
            const a = Math.max(0, Math.min(100, Number(ratioA) || 50)) / 100;
            const okAdd = store.addLedger({
              title,
              amountCents: Math.round(yuan * 100),
              payerRole: payer,
              split,
              shares: split === 'custom' ? { A: a, B: 1 - a } : { A: 0.5, B: 0.5 },
              category,
              date: todayISO(),
              visibility: ownerOnly ? 'owner' : 'shared',
            });
            if (okAdd) {
              setTitle('');
              setAmount('');
              setOpen(false);
            }
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
