import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { looksLikeAccountId, normalizeAccountId, normalizeBirthDate } from '../core/account';
import { DEFAULT_SERVER_URL } from '../core/serverUrl';
import { loadServerSettings } from '../core/serverConfig';
import type { Gender } from '../core/types';
import { useApp } from '../store';
import { Avatar, Btn, Card, Chip, Field, NoticeBar } from './components';
import { color, font, radius, shadow } from './theme';
import { surf } from './theme';
import { tint } from './theme';

const GENDERS: Array<{ value: Gender; label: string; emoji: string }> = [
  { value: 'female', label: '女生', emoji: '🌸' },
  { value: 'male', label: '男生', emoji: '🌿' },
  { value: 'other', label: '其他 / 不想说', emoji: '🫧' },
];

function ageFrom(birthDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const t = Date.parse(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return null;
  return Math.floor(diff / (365.2425 * 86400000));
}

/**
 * 账号页（也是整个 App 的入口）。
 *
 * 这里取代了以前那套「服务端给你分配 A 端 / B 端」的做法：
 *   · 第一次用 → 注册账号：昵称 + 生日（自动算年龄）+ 性别 + 头像 + 6 位登录码
 *   · 换手机用 → 登录：账号 ID + 登录码
 *
 * **账号 ID 就是你的身份**，也是别人搜你时填的那串。两台账号互相同意后
 * 才会组成双人空间；界面上再也不会出现「女端 / 男端」这种东西。
 */
export function ProfileGate() {
  const { store, snapshot, role } = useApp();
  const insets = useSafeAreaInsets();
  const me = snapshot.members[role];

  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [busy, setBusy] = useState(false);

  // 注册表单：**故意不预填任何旧档案**。
  // 这台手机可能用过另一个账号，预填出来的就是别人的昵称/生日/性别 ——
  // 用户一点"创建账号"，新账号就顶着别人的名字（真实事故：
  // 她的新账号本该叫 9，绑定后服务器上变成了他的 jog）。
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  /** 表单内联错误：toast 会消失，这里一直留着，点完按钮一定看得见 */
  const [formError, setFormError] = useState<string | null>(null);

  // 登录表单
  const [loginId, setLoginId] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // 服务器地址（两台手机必须连同一台）
  const [server, setServer] = useState(store.remoteStatus.server || DEFAULT_SERVER_URL);
  /*
   * SERVER_PREFILL：退出登录/被踢之后 remoteStatus.server 是空的（remoteServer 被清了），
   * 以前就直接退回默认公网地址 —— 在自建服务器/隧道上建的账号怎么登都提示「没有这个账号」。
   * 这里读一次上次保存的地址补上。
   */
  useEffect(() => {
    if (store.remoteStatus.server) return;
    void loadServerSettings()
      .then((saved) => {
        const url = (saved as { url?: string } | null)?.url;
        if (url && url !== server) setServer(url);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 已经有账号了就不拦人
  if (store.hasAccount) return null;
  // 账号状态还没读出来：先别闪登录页
  if (!store.accountReady) return null;

  const age = ageFrom(birthDate);

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        store.toast('没有相册权限，无法选择图片', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (result.canceled || result.assets.length === 0) return;
      const dir = FileSystem.documentDirectory;
      if (!dir) {
        store.toast('设备不支持本地存储', 'error');
        return;
      }
      const ext = (result.assets[0].uri.split('.').pop() ?? 'jpg').split('?')[0].slice(0, 5);
      const dest = `${dir}twospace-avatar-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
      setAvatarUri(dest);
      store.toast('头像已选好', 'ok');
    } catch (err) {
      store.toast(`选择图片失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const doRegister = async () => {
    const fail = (msg: string) => {
      setFormError(msg);
      store.toast(msg, 'warn');
    };
    setFormError(null);
    if (!name.trim()) {
      fail('填一个昵称（对方会看到这个名字）');
      return;
    }
    if (!birthDate.trim()) {
      fail('填一下出生日期（用来算年龄）');
      return;
    }
    // 允许 2000-2-11 / 2000/2/11 / 20000211，自动补成 2000-02-11
    const birth = normalizeBirthDate(birthDate);
    if (!birth) {
      fail('生日填成像 2000-02-11 这样的日期（不补零也行）');
      return;
    }
    setBirthDate(birth);
    if (!gender) {
      fail('选一个性别再继续');
      return;
    }
    if (!/^\d{6}$/.test(pin.trim())) {
      fail('设一个 6 位数字的登录码（换手机登录时要用）');
      return;
    }
    setBusy(true);
    const ok = await store.createAccount({
      name: name.trim(),
      birthDate: birth,
      gender,
      avatarUri,
      pin: pin.trim(),
      server,
    });
    setBusy(false);
    if (ok) {
      store.rememberProfile();
      // 账号建好之后才有身份能把图传上服务器；
      // 不传的话这张头像只活在这台手机上，对方永远看不到（真机踩过）
      if (avatarUri) void store.changeMyAvatar(avatarUri);
    } else setFormError('创建失败：看一下上面的服务器地址能不能连上（点「测试连接」）');
  };

  const doLogin = async () => {
    const fail = (msg: string) => {
      setFormError(msg);
      store.toast(msg, 'warn');
    };
    setFormError(null);
    const id = normalizeAccountId(loginId);
    if (!looksLikeAccountId(id)) {
      fail('账号 ID 看起来不对（形如 TW8K3M9Q）');
      return;
    }
    if (!/^\d{6}$/.test(loginPin.trim())) {
      fail('输入 6 位登录码');
      return;
    }
    setBusy(true);
    /*
     * TUNNEL_AWARE_LOGIN：登录失败要分清"服务器连不上"和"账号/登录码不对"。
     * 以前统一报"三者组合不对"，Cloudflare 临时隧道一关（域名立刻失效、DNS 解析不了），
     * 用户会被误导成输错了账号 —— 临时隧道本来就是随时会失效的。
     */
    const reachable = await (async () => {
      try {
        const url = String(server).trim().replace(/\/+$/, '');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url + '/ping', { signal: ctrl.signal }).catch(() => null);
        clearTimeout(timer);
        return Boolean(res && res.ok);
      } catch {
        return false;
      }
    })();
    const ok = await store.loginAccount({ accountId: id, pin: loginPin.trim(), server });
    setBusy(false);
    if (ok) {
      store.rememberProfile();
      return;
    }
    if (!reachable) {
      const isTunnel = /trycloudflare\.com$/i.test(String(server).trim().replace(/\/+$/, ''));
      fail(
        isTunnel
          ? '服务器连不上：这个 Cloudflare 临时隧道已经关了（临时隧道一关，域名立刻失效）。重新开一条隧道把新地址粘进来，或者直接用电脑的局域网地址（http://192.168.x.x:8787）'
          : '服务器连不上：检查地址是否可访问、端口有没有开（点「测试连接」看一眼）',
      );
      return;
    }
    setFormError('登录失败：账号 ID 或登录码不对（服务器是通的）');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Mutual</Text>
        <Text style={styles.tagline}>
          一个人一个账号，两台手机各登录自己的账号；互相同意之后才组成你们的空间。
        </Text>

        <View style={styles.tabs}>
          {(['register', 'login'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.tab, mode === m ? styles.tabActive : null]}
            >
              <Text
                style={[
                  font.bodyStrong,
                  { color: mode === m ? color.primaryInk : color.inkSoft, fontSize: 14 },
                ]}
              >
                {m === 'register' ? '创建账号' : '登录已有账号'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'register' ? (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Avatar emoji={me.avatar} uri={avatarUri} size={52} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Btn title="从相册选头像" small variant="soft" onPress={() => void pickImage()} />
                  <Text style={[font.tiny, { marginTop: 6 }]}>
                    只能设置自己的头像，改不了对方的。注册完成后会自动上传，对方也能看到。
                  </Text>
                </View>
              </View>

              <Field label="昵称" value={name} onChangeText={setName} placeholder="对方会看到的名字" maxLength={20} />
              <Field
                label="出生日期（YYYY-MM-DD，用来算年龄）"
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="2000-05-20"
              />
              <Text style={[font.tiny, { marginBottom: 6 }]}>
                年龄：{age === null ? '填完生日自动计算' : `${age} 岁`}
              </Text>

              <Text style={[font.tiny, { marginTop: 10, marginBottom: 6 }]}>性别</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {GENDERS.map((g) => (
                  <Chip
                    key={g.value}
                    label={`${g.emoji} ${g.label}`}
                    active={gender === g.value}
                    onPress={() => setGender(g.value)}
                  />
                ))}
              </View>
            </Card>

            <Card>
              <Field
                label="6 位登录码（换手机登录时要用）"
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                keyboardType="number-pad"
              />
              <Text style={[font.tiny]}>
                以后再登录或换手机，就靠「账号 ID + 这个登录码」。别设成生日这类一眼能猜到的数字。
              </Text>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <Field
                label="账号 ID"
                value={loginId}
                onChangeText={(t) => setLoginId(normalizeAccountId(t))}
                placeholder="TW8K3M9Q"
                maxLength={12}
                autoCapitalize="characters"
              />
              <Field
                label="6 位登录码"
                value={loginPin}
                onChangeText={(t) => setLoginPin(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                keyboardType="number-pad"
              />
              <Text style={[font.tiny]}>
                账号 ID 就是你上次在「我们」页看到的那串，形如 TW8K3M9Q。
              </Text>
            </Card>
            <NoticeBar
              tone={tint(color.skySoft)}
              ink={color.inkMid}
              icon="🔑"
              text="忘了登录码就进不来了——这台手机上的数据也会看不到。建议现在就把它记在备忘录里。"
            />
          </>
        )}

        <Card>
          <Field
            label="同步服务器"
            value={server}
            onChangeText={setServer}
            placeholder="https://<你的服务器地址>"
          />
          <Text style={[font.tiny]}>
            两个人必须连同一台服务器：一台填公网地址，另一台也填同一个。
          </Text>
          {/trycloudflare\.com/i.test(server) ? (
            <Text style={[font.tiny, { marginTop: 6, color: color.danger }]}>
              这是 Cloudflare 的**临时隧道**地址：那个 cloudflared 窗口一关，地址立刻失效（DNS 都解析不了）。
              长期用请填固定域名，或填电脑的局域网地址（例如 http://192.168.1.100:8787，手机连同一个 Wi-Fi）。
            </Text>
          ) : null}
        </Card>

        <NoticeBar
          tone={tint(color.primarySoft)}
          ink={color.primaryInk}
          icon="🔒"
          text="账号是强隔离的：没有你的登录码，别人就算知道你的账号 ID 也进不来、看不到任何内容。"
        />

        {/* 内联错误：toast 一闪就没，用户会以为"点了没反应" */}
        {formError ? (
          <View style={styles.errorBox}>
            <Text style={{ fontSize: 13, color: color.danger, fontWeight: '700' }}>没有提交成功</Text>
            <Text style={[font.small, { color: color.danger, marginTop: 4 }]}>{formError}</Text>
          </View>
        ) : null}

        <Btn
          title={busy ? '处理中…（最长 12 秒）' : mode === 'register' ? '创建账号并进入' : '登录'}
          disabled={busy}
          onPress={() => {
            if (busy) return;
            void (mode === 'register' ? doRegister() : doLogin());
          }}
        />
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 入口页必须是**不透明**的：color.bg 带 0.9 透明度（平时让背景图透出来），
  // 盖在别的页面上会看到下面的标题和底部栏在透光（模拟器上实测过）。
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFF9F6',
    zIndex: 50,
  },
  brand: { fontSize: 28, fontWeight: '700', color: color.ink, letterSpacing: 0.5 },
  tagline: { fontSize: 13, color: color.inkSoft, marginTop: 6, lineHeight: 20 },
  tabs: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: surf('alt'),
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
  tabActive: { backgroundColor: surf('base'), ...shadow.card },
  avatarBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  errorBox: {
    backgroundColor: color.dangerSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: color.danger,
  },
});
