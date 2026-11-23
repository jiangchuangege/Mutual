import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { todayISO } from '../core/time';
import { useApp } from '../store';
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  Field,
  NoticeBar,
  Screen,
  SectionTitle,
  Sheet,
  ToggleRow,
  useChoice,
} from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { tint } from '../ui/theme';

export default function TrustScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const choose = useChoice();
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';
  const today = todayISO();

  const [locLabel, setLocLabel] = useState('在路上');
  const [intimacyOpen, setIntimacyOpen] = useState(false);
  const [intimacyTopic, setIntimacyTopic] = useState('边界');
  const [intimacyText, setIntimacyText] = useState('');
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialPlace, setSocialPlace] = useState('');
  const [socialPeople, setSocialPeople] = useState('');
  const [socialEta, setSocialEta] = useState('');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultLabel, setVaultLabel] = useState('');
  const [vaultSecret, setVaultSecret] = useState('');
  const [weddingOpen, setWeddingOpen] = useState(false);
  const [weddingBudget, setWeddingBudget] = useState('');
  const [weddingStyle, setWeddingStyle] = useState('');
  const [weddingGuest, setWeddingGuest] = useState('');

  const trust = snapshot.trust;
  const wedding = snapshot.wedding;
  const shareUntil = trust.locationShareUntil;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title="信任与安全" subtitle="默认全部关闭；需要时单次开启，随时可关" right={<DevicePills />}>
        {/* ---------------- 7.14 ---------------- */}
        <SectionTitle title="信任与安全报备" />
        <NoticeBar
          tone={tint(color.dangerSoft)}
          ink={color.danger}
          icon="⚠️"
          text="这里没有轨迹历史、没有停留时长、没有「TA 移动了」推送。只有你主动发的一次性信号。"
        />
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn title="我到家了" small style={{ flex: 1 }} onPress={() => store.requestArrived()} />
            <Btn
              title="单次共享 30 分钟"
              small
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => store.startLocationOnce(30, locLabel)}
            />
          </View>
          <Text style={[font.tiny, { marginTop: 8 }]}>
            单次共享状态：{shareUntil ? `进行中，${new Date(shareUntil).toLocaleTimeString()} 自动失效` : '未开启'}
          </Text>
          <View style={{ height: 8 }} />
          <Field label="这次共享的说明（对方能看到这句）" value={locLabel} onChangeText={setLocLabel} placeholder="在路上 / 加班回家" />
          <ToggleRow
            label="到家与聚会报备总开关"
            desc="默认关闭；开启后才能使用社交报备"
            value={trust.arrivedReport}
            onChange={(v) => store.setTrust({ arrivedReport: v })}
          />
          <ToggleRow
            label={`紧急联系人（${snapshot.members[partner].name}）`}
            desc="仅用于冷静卡与安全报备穿透免打扰"
            value={trust.emergencyContact}
            onChange={(v) => store.setTrust({ emergencyContact: v })}
          />
        </Card>

        <Card>
          <Text style={[font.tiny, { marginBottom: 6 }]}>最近的安全信号</Text>
          {snapshot.safety.length === 0 ? (
            <Text style={font.small}>暂无</Text>
          ) : (
            snapshot.safety.slice(0, 5).map((s) => (
              <Text key={s.id} style={[font.small, { marginTop: 4 }]}>
                · {new Date(s.at).toLocaleString()} {s.byRole === role ? '我' : snapshot.members[s.byRole].name}
                ：{s.label}
              </Text>
            ))
          )}
        </Card>

        {/* ---------------- 7.16 ---------------- */}
        <SectionTitle title="社交与聚会报备" right={<Btn title="＋ 报备" small variant="ghost" onPress={() => setSocialOpen(true)} />} />
        <Card>
          {snapshot.socialReports.length === 0 ? (
            <Text style={font.small}>暂无报备。这是自愿分享，不是义务，也不做时间校验。</Text>
          ) : (
            snapshot.socialReports.slice(0, 5).map((r) => (
              <View key={r.id} style={{ marginTop: 8 }}>
                <Text style={font.small}>
                  {r.byRole === role ? '我' : snapshot.members[r.byRole].name}：{r.place} · {r.people} · 预计{' '}
                  {r.eta}
                  {r.withdrawn ? '（已撤回）' : ''}
                </Text>
                {r.byRole === role && !r.withdrawn ? (
                  <View style={{ marginTop: 6 }}>
                    <Btn title="撤回这条" small variant="ghost" onPress={() => store.withdrawSocialReport(r.id)} />
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Card>

        {/* ---------------- 7.15 ---------------- */}
        <SectionTitle title="亲密关系边界卡" right={<Btn title="＋ 写一条" small variant="ghost" onPress={() => setIntimacyOpen(true)} />} />
        <NoticeBar
          tone={tint(color.lavenderSoft)}
          ink={color.lavender}
          icon="🔒"
          text="默认仅本人可见。未共享的条目对 TA 连数量都不显示；本功能不做任何医疗判断。"
        />
        {snapshot.intimacy.length === 0 ? (
          <Card>
            <Text style={font.small}>还没有记录。</Text>
          </Card>
        ) : (
          snapshot.intimacy.map((c) => (
            <Card key={c.id}>
              <Text style={[font.tiny]}>{c.topic}</Text>
              <Text style={[font.bodyStrong, { marginTop: 4 }]}>{c.content}</Text>
              <Text style={[font.tiny, { marginTop: 4 }]}>
                {c.ownerRole === role ? (c.shared ? '已共享给 TA' : '仅我可见') : 'TA 主动共享给你'}
              </Text>
              {c.ownerRole === role ? (
                <View style={{ marginTop: 8 }}>
                  <Btn
                    title={c.shared ? '撤回共享' : '共享这一条'}
                    small
                    variant={c.shared ? 'ghost' : 'soft'}
                    onPress={() => store.shareIntimacyCard(c.id, !c.shared)}
                  />
                </View>
              ) : null}
            </Card>
          ))
        )}

        {/* ---------------- 7.17 ---------------- */}
        <SectionTitle title="共享保险箱" right={<Btn title="＋ 存一条" small variant="ghost" onPress={() => setVaultOpen(true)} />} />
        <NoticeBar
          tone={tint(color.dangerSoft)}
          ink={color.danger}
          icon="🔐"
          text="逐条授权、查看留痕、不可批量导出。这是本项目里风险最高的功能，默认不授权任何人。"
        />
        {snapshot.vault.length === 0 ? (
          <EmptyState emoji="🔐" title="保险箱是空的" desc="共用账号可以先存进来，再决定给不给对方。" actionLabel="存一条" onAction={() => setVaultOpen(true)} />
        ) : (
          snapshot.vault.map((v) => (
            <Card key={v.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={font.bodyStrong}>{v.label}</Text>
                  <Text style={[font.tiny, { marginTop: 2 }]}>
                    所有者：{v.ownerRole === role ? '我' : snapshot.members[v.ownerRole].name}
                    {v.ownerRole !== role ? ' · 已授权给我' : ''} · 被查看 {v.views.length} 次
                  </Text>
                </View>
                <Text style={{ fontSize: 18 }}>🔑</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Btn
                  title="查看内容"
                  small
                  style={{ flex: 1 }}
                  onPress={() => {
                    void (async () => {
                      const secret = await store.openVaultItem(v.id);
                      if (secret !== null) {
                        void choose({
                          title: v.label,
                          message: secret,
                          icon: '🔑',
                          actions: [{ text: '看完了，关闭', value: 'close', variant: 'primary' }],
                        });
                      }
                    })();
                  }}
                />
                {v.ownerRole === role ? (
                  <Btn
                    title={v.granted.length > 0 ? '撤回授权' : '授权给 TA'}
                    small
                    variant="ghost"
                    style={{ flex: 1 }}
                    onPress={() =>
                      v.granted.length > 0 ? store.revokeVaultAccess(v.id) : store.grantVaultAccess(v.id)
                    }
                  />
                ) : null}
              </View>
              {v.ownerRole === role && v.views.length > 0 ? (
                <Text style={[font.tiny, { marginTop: 6 }]}>
                  最近一次查看：{new Date(v.views[v.views.length - 1].at).toLocaleString()} 由{' '}
                  {v.views[v.views.length - 1].role === role ? '我' : snapshot.members[v.views[v.views.length - 1].role].name}
                </Text>
              ) : null}
            </Card>
          ))
        )}

        {/* ---------------- 7.20 ---------------- */}
        <SectionTitle title="求婚 / 婚礼计划" />
        {wedding === null ? (
          <Card>
            <Text style={font.small}>TA 的计划还没对你开放（默认仅本人可见，防剧透）。</Text>
          </Card>
        ) : (
          <Card>
            <Text style={font.small}>
              预算 ¥{(wedding.budgetCents / 100).toFixed(0)} · 风格 {wedding.styles.join('、') || '未填'} · 宾客{' '}
              {wedding.guests.length} 人 · 备选日期 {wedding.dates.join('、') || '未填'}
            </Text>
            <Text style={[font.tiny, { marginTop: 4 }]}>
              {wedding.sharedWithPartner ? '已共享给双方' : '仅所有者可见'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Btn title="编辑" small style={{ flex: 1 }} onPress={() => setWeddingOpen(true)} />
              {wedding.ownerRole === role ? (
                <Btn
                  title={wedding.sharedWithPartner ? '改为仅我可见' : '共享给 TA'}
                  small
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => store.shareWedding(!wedding.sharedWithPartner)}
                />
              ) : null}
            </View>
          </Card>
        )}

        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>

      <Sheet visible={intimacyOpen} title="写一条边界卡" onClose={() => setIntimacyOpen(false)}>
        <NoticeBar tone={tint(color.lavenderSoft)} ink={color.lavender} icon="🔒" text="默认仅我可见；写完后可以逐条决定要不要给 TA 看。" />
        <Field label="主题" value={intimacyTopic} onChangeText={setIntimacyTopic} placeholder="边界 / 偏好 / 不希望" />
        <Field label="内容" value={intimacyText} onChangeText={setIntimacyText} multiline placeholder="需要先沟通再安排…" />
        <Btn
          title="保存（不共享）"
          onPress={() => {
            if (store.addIntimacyCard(intimacyTopic, intimacyText)) {
              setIntimacyText('');
              setIntimacyOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={socialOpen} title="聚会报备" onClose={() => setSocialOpen(false)}>
        <NoticeBar
          tone={tint(color.butterSoft)}
          ink={color.careInk}
          icon="ℹ️"
          text="需要先在页面上打开「到家与聚会报备总开关」。报备不会校验你的位置，也不会提醒你按时回家。"
        />
        <Field label="去哪" value={socialPlace} onChangeText={setSocialPlace} placeholder="同事聚餐" />
        <Field label="和谁" value={socialPeople} onChangeText={setSocialPeople} placeholder="3 位同事" />
        <Field label="大概几点回" value={socialEta} onChangeText={setSocialEta} placeholder="22:00" />
        <Btn
          title="发送报备"
          onPress={() => {
            if (store.addSocialReport(socialPlace, socialPeople, socialEta)) {
              setSocialPlace('');
              setSocialPeople('');
              setSocialEta('');
              setSocialOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={vaultOpen} title="存入保险箱" onClose={() => setVaultOpen(false)}>
        <NoticeBar tone={tint(color.dangerSoft)} ink={color.danger} icon="🔐" text="存入后默认不授权任何人；每次查看都会留痕。" />
        <Field label="条目名" value={vaultLabel} onChangeText={setVaultLabel} placeholder="Netflix 共用账号" />
        <Field label="内容" value={vaultSecret} onChangeText={setVaultSecret} placeholder="账号 / 密码" multiline />
        <Btn
          title="存入"
          onPress={() => {
            if (store.addVaultItem(vaultLabel, vaultSecret)) {
              setVaultLabel('');
              setVaultSecret('');
              setVaultOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={weddingOpen} title="婚礼计划" onClose={() => setWeddingOpen(false)}>
        <Field label="预算（元）" value={weddingBudget} onChangeText={setWeddingBudget} placeholder="200000" keyboardType="numeric" />
        <Field label="风格（顿号分隔）" value={weddingStyle} onChangeText={setWeddingStyle} placeholder="小型、户外" />
        <Field label="宾客（顿号分隔）" value={weddingGuest} onChangeText={setWeddingGuest} placeholder="家人、好朋友" />
        <Btn
          title="保存"
          onPress={() => {
            store.updateWedding({
              budgetCents: Math.round((Number(weddingBudget) || 0) * 100),
              styles: weddingStyle.split(/[、,，\s]+/).filter(Boolean),
              guests: weddingGuest.split(/[、,，\s]+/).filter(Boolean),
              dates: wedding?.dates ?? [],
            });
            setWeddingOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
