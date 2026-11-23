import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, useWindowDimensions, Text, TextInput, View, Linking, BackHandler, Alert } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { SAMPLE_GAMES } from '../core/gameSamples';
import { buildVoxelHtml } from '../core/gameVoxel';
import { buildFarmHtml } from '../core/gameFarm';
import { canPlayInline, describeKind, detectGameKind, kindBadge } from '../core/gameKind';
import { MOD_TEMPLATE } from '../core/voxelMod';
import { AI_PROMPT, assembleLayers, buildRuntimeHtml, buildRuntimeShim, needsNetwork } from '../core/gameRuntime';
import { ensureLocalGame } from '../lib/gameCache';
import { buildTouchpadShim } from '../core/gameTouchpad';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadApkOnly, installApk, openApkInBrowser, openInstalledGame } from '../lib/cloudBuild';
import type { GameSpec } from '../core/types';
import { useApp } from '../store';
import { Btn, Card, useConfirm, useToast } from '../ui/components';
import { color, font, radius, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

/**
 * 游戏库 + 双人联机。
 *
 * 用法（用户定的）：去问 DeepSeek 要一段单文件 HTML 小游戏 → 粘贴进来 → 一键生成
 * → 进库 → 双方点开同一个库里的游戏 → 一起玩。
 *
 * 关键设计：
 *  - 代码只是**文本**，存在空间状态里，两台手机都有同一份；
 *  - 运行在沙箱 WebView（不许联网、不许跳转），页面里用 `TwGame.send(state)` 交局面；
 *  - 局面经 hub 广播，对方 WebView 收到 `TwGame.apply(state)` —— 服务端从不 eval 陌生代码。
 */
/** 取标题的第一个"像样"字符（中文取一个字，英文取首字母） */
function firstGlyph(title: string): string {
  const t = (title ?? '').trim();
  if (!t) return '?';
  const ch = Array.from(t)[0] ?? '?';
  return ch.toUpperCase();
}

/** 按标题哈希给一个稳定的、柔和的底色（同一个游戏永远同色） */
function tileTint(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i += 1) h = (h * 31 + title.charCodeAt(i)) % 360;
  return `hsl(${h}, 62%, 58%)`;
}

export default function GamesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { store, snapshot, role } = useApp();
  const confirm = useConfirm();
  const toast = useToast();

  const [importOpen, setImportOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [playing, setPlaying] = useState<GameSpec | null>(null);
  /**
   * 网址类游戏：在 App 里全屏跑（不安装、不跳浏览器）。
   * 用户要的：「我要的是直接能运行的游戏，不是一个安装包」——
   * APK 必须先安装（Android 安全模型），网页版可以真的在库里面跑起来。
   */
  const [webUrl, setWebUrl] = useState<string | null>(null);
  /** 源码类：只给看和复制，手机上跑不了 */
  const [showSource, setShowSource] = useState<GameSpec | null>(null);
  /** 粘贴模组 */
  const [modOpen, setModOpen] = useState(false);
  /** 原生游戏装不上时的兜底提示（给下载地址 / 已保存路径） */
  /** 安装流程的实时诊断（每步都写一行，配合截图就能定位卡在哪） */
  const [debugLine, setDebugLine] = useState<string>('');
  const [installHelp, setInstallHelp] = useState<
    { title: string; url: string; savedTo: string | null; error: string } | null
  >(null);
  const [modCode, setModCode] = useState(MOD_TEMPLATE);
  /** 分层粘贴：结构 / 样式 / 脚本分开贴，合成一个单文件页面 */
  const [layered, setLayered] = useState(false);
  const [layerHtml, setLayerHtml] = useState('');
  const [layerCss, setLayerCss] = useState('');
  const [layerJs, setLayerJs] = useState('');

  const games = useMemo(() => {
    // 内置样例排后面，用户自己的排前面（库里存的是用户粘贴的）
    // 服务端内核没更新时这个字段可能是 undefined：不能用 .some 直接上，否则整页崩
    const mine = snapshot.games ?? [];
    const missing = SAMPLE_GAMES.filter((s) => !mine.some((g) => g.title === s.title));
    return [...mine, ...missing];
  }, [snapshot.games]);

  /**
   * 把 3D 世界的存档灌进这一局。
   *
   * 存档存的是"和确定性地形不同的格子"（x,y,z,v），这里转成游戏认识的
   * {e:[[x,y,z,v]...]} 走同一条广播通道 —— 所以对方一进来也是同一座世界。
   */
  const restoreVoxel = () => {
    const edits = store.voxelEdits;
    if (!edits.length) return;
    const e = edits
      .map((s) => s.split(',').map((n) => Number(n)))
      .filter((a) => a.length === 4 && a.every((n) => Number.isFinite(n)));
    if (!e.length) return;
    store.pushGameState(JSON.stringify({ e, m: 3 }), 0);
  };

  const session = snapshot.gameSession;
  // 横竖屏切换时要跟着重算，不能用一次性读到的 Dimensions
  const { width, height } = useWindowDimensions();
  const [landscape, setLandscape] = useState(false);

  /** 游戏大部分是横屏更好玩：进游戏自动横屏，退出时转回竖屏 */
  const lockLandscape = (on: boolean) => {
    setLandscape(on);
    void ScreenOrientation.lockAsync(
      on ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {
      // 有的设备不允许锁方向：不影响玩，只是不转
    });
  };

  // 全屏时屏幕上不放任何按钮（太挡游戏）；返回键/侧滑手势都要**二次确认**才退出
  useEffect(() => {
    if (!playing && !webUrl) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /*
       * 用户反馈：「一划就直接退了」。全面屏的侧滑返回会误触，
       * 所以这里不再直接退出，先弹确认；点「继续玩」就当没发生。
       */
      Alert.alert('退出游戏？', '退出后这一局的画面会关掉，存档不受影响。', [
        { text: '继续玩', style: 'cancel' },
        {
          text: '退出',
          style: 'destructive',
          onPress: () => {
            lockLandscape(false);
            setPlaying(null);
            setWebUrl(null);
          },
        },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [playing, webUrl]);

  /* 网址类游戏：全屏 WebView 里直接跑，并注入触屏手柄（方向键 / 点一下交互 / 滑动转视角） */
  if (webUrl && !playing) {
    return (
      <View style={styles.immersiveRoot}>
        <StatusBar hidden />
        <OrientationChips gameId={`web:${webUrl}`} onApply={lockLandscape} />
        <WebView
          source={{ uri: webUrl }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
setSupportZoom
          allowsFullscreenVideo
setBuiltInZoomControls={false}
setDisplayZoomControls={false}
textZoom={100}
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          mixedContentMode="compatibility"
          injectedJavaScriptBeforeContentLoaded={`${buildTouchpadShim()}\n${buildRuntimeShim()}`}
          onMessage={(event) => {
            const raw = event.nativeEvent.data;
            if (typeof raw === 'string' && raw.startsWith('TW_ORIENT:')) {
              lockLandscape(raw.slice('TW_ORIENT:'.length) === 'landscape');
            }
          }}
          onError={() => {
            // 页面拒绝被加载 → 退回系统浏览器，至少还能玩
            void Linking.openURL(webUrl).catch(() => undefined);
            lockLandscape(false);
            setWebUrl(null);
          }}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  if (playing) {
    /**
     * 沉浸式全屏。
     *
     * 用户反馈：「要全屏不要出现上面那个」——之前游戏上方还留着我自己的标题栏
     * （返回 / 游戏名 / 竖屏 / 结束这局），横屏玩起来很挤。
     * 现在游戏铺满整块屏幕、连状态栏都隐藏，只留几个半透明的悬浮按钮。
     */
    return (
      <View style={styles.immersiveRoot}>
        <StatusBar hidden />
        <OrientationChips gameId={playing.id} onApply={lockLandscape} />
        <GamePlayer
          game={playing}
          width={width}
          availableHeight={height}
          baseUrl={store.gameBaseUrl}
          stateText={session?.gameId === playing.id ? session.state : ''}
          seq={session?.gameId === playing.id ? session.seq : 0}
          role={role}
          netText={session?.gameId === playing.id ? session.net ?? '' : ''}
          netSeq={session?.gameId === playing.id ? session.netSeq ?? 0 : 0}
          netFrom={session?.netFrom ?? null}
          netSeed={store.gameNetSeed}
          onNet={(packet) => store.pushGameNet(packet)}
          onState={(state) => {
            let turn = session?.turn ?? 0;
            try {
              const parsed = JSON.parse(state) as {
                turn?: number;
                e?: number[][];
              };
              if (typeof parsed.turn === 'number') turn = Math.max(0, Math.min(1, parsed.turn));
              // 3D 沙盒：把这批挖/放并进存档，下次打开还在
              if (Array.isArray(parsed.e) && parsed.e.length > 0) {
                store.mergeVoxelEdits(
                  parsed.e
                    .filter((a) => Array.isArray(a) && a.length === 4)
                    .map((a) => a.map((n) => Math.round(Number(n) || 0)).join(',')),
                );
              }
            } catch {
              // 局面不是 JSON 就沿用服务端的回合
            }
            store.pushGameState(state, turn);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingRight: 10 }}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>游戏库</Text>
        <Text style={styles.count}>{games.length} 个</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 40 + insets.bottom }}>
        {debugLine ? (
          <Card tone={tint(color.butterSoft)}>
            <Text style={[font.tiny, { color: color.careInk }]}>{debugLine}</Text>
          </Card>
        ) : null}
        <Card tone={surf('alt')}>
          <Text style={font.bodyStrong}>粘贴 AI 写的游戏，一键进库</Text>
          <Text style={[font.tiny, { marginTop: 4, lineHeight: 18 }]}>
            去问 DeepSeek（或任何 AI）要一个**单文件 HTML 小游戏**，整段代码粘贴进来点「生成」，
            它就会出现在下面这个库里。两台手机同步可见，双方点同一个游戏就能一起玩。
          </Text>
          <View style={{ height: 10 }} />
          <Btn title="＋ 粘贴代码生成游戏" onPress={() => setImportOpen(true)} />

        </Card>

        <View style={{ height: 14 }} />
        <Text style={[font.tiny, { color: color.inkSoft, marginBottom: 8 }]}>
          库里是空的就先用内置样例试试；粘贴进来的会排在前面，可以长按卡片删除。
        </Text>

        <View style={styles.grid}>
          {games.map((g) => (
            <Pressable
              key={g.id}
              style={styles.tile}
              onPress={() => {
                const kind = g.builtin === 'voxel3d' ? 'html' : (g.kind ?? 'html');
                if (kind === 'link') {
                  /*
                   * 链接类（网页版游戏 / 商店 / 已装 App）：先在 App 里全屏跑，
                   * 这就是"直接能运行的游戏"；加载不了才退回系统浏览器。
                   */
                  const url = g.code.trim();
                  setWebUrl(url);
                  return;
                }
                if (kind === 'source') {
                  setShowSource(g);
                  return;
                }
                if ((g.kind as string) === 'native') {
                  /**
                   * 原生游戏：装过就直接打开，没装过就装。
                   * 每一步都弹提示（以前失败了什么都不显示，看起来像"点不动"）。
                   * 系统 Intent 被 ROM 拦掉时，走"浏览器下载"这条兜底路。
                   */
                  void (async () => {
                    try {
                      setDebugLine(`① 点击「${g.title}」 kind=${g.kind} path=${g.assetPath ?? '空'}`);
                      /* 必须带上这台游戏自己的包名，否则永远指向默认包名 → 装好了也打不开 */
                      const opened = await openInstalledGame(g.packageName);
                      setDebugLine(`② 尝试打开已安装：${opened ? '成功' : '未安装'}`);
                      if (opened) return;
                      toast.show('正在下载 APK…（约几秒）');
                      const res = await installApk(store.gameBaseUrl, g.assetPath ?? '');
                      setDebugLine(
                        `③ 安装器调用：${res.ok ? '已弹出' : '失败'} ${res.error ?? ''}`,
                      );
                      if (res.ok) {
                        toast.show('已交给系统安装器，请在弹窗里点"安装"');
                        return;
                      }
                    // 兜底：先保存到本机，再让浏览器去下（任何 ROM 都能用）
                      const dl = await downloadApkOnly(store.gameBaseUrl, g.assetPath ?? '');
                      setDebugLine(
                        `④ 已下载到本地：${dl.ok ? dl.uri : '失败 ' + (dl.error ?? '')}`,
                      );
                      setInstallHelp({
                        title: g.title,
                        url: `${store.gameBaseUrl}${g.assetPath ?? ''}`,
                        savedTo: dl.ok ? dl.uri ?? null : null,
                        error: res.error ?? '系统没有弹出安装器',
                      });
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setDebugLine(`✖ 异常：${msg}`);
                      toast.show(`安装异常：${msg}`);
                    }
                  })();
                  return;
                }
                if (!canPlayInline(g)) return;
                const isVoxel = g.builtin === 'voxel3d';
                if (snapshot.gameSession?.gameId === g.id) {
                  if (isVoxel) restoreVoxel();
                  setPlaying(g);
                  return;
                }
                /*
                 * 内置样例（井字棋/沙盒/小窝）不在 state.games 里，
                 * 用 startGame 会失败（"游戏库里没有这个游戏"），服务端就没有这一局，
                 * 于是两台手机各玩各的。样例走 startSampleGame。
                 */
                if (g.builtin || g.id.startsWith('sample-')) {
                  store.startSampleGame(g.id, g.title);
                } else {
                  store.startGame(g.id);
                }
                if (isVoxel) restoreVoxel();
                setPlaying(g);
              }}
              onLongPress={() => {
                if (g.builtin === 'voxel3d') {
                  void confirm({
                    title: '清空 3D 世界存档？',
                    message: `现在存档里有 ${store.voxelEdits.length} 个改动。清空后世界回到初始地形（包括情侣小院），两人都一样。`,
                    confirmText: '清空',
                    danger: true,
                  }).then((ok) => {
                    if (ok) store.resetVoxelWorld();
                  });
                  return;
                }
                if (g.builtin) {
                  toast.show('内置样例不用删，粘贴的才需要');
                  return;
                }
                void confirm({
                  title: `删掉「${g.title}」？`,
                  message: '代码会从空间里移除，双方都看不到了（已经存到别处的源码不受影响）。',
                  confirmText: '删除',
                  danger: true,
                }).then((ok) => {
                  if (ok) store.removeGame(g.id);
                });
              }}
            >
              {g.builtin ? (
                <Text style={styles.tileEmoji}>{g.builtin === 'voxel3d' ? '🌍' : '🎮'}</Text>
              ) : (
                /* 用户导入的游戏：标题首字 + 按标题取的色，60 多个卡片才分得清 */
                <View style={[styles.tileBadge, { backgroundColor: tileTint(g.title) }]}>
                  <Text style={styles.tileBadgeText}>{firstGlyph(g.title)}</Text>
                </View>
              )}
              <Text style={styles.tileTitle} numberOfLines={2}>
                {g.title}
              </Text>
              <Text style={styles.tileMeta}>
                {g.builtin === 'voxel3d'
                  ? `3D · 存档 ${store.voxelEdits.length} 块`
                  : g.builtin
                    ? '内置样例'
                    : (g.kind as string) === 'native'
                      ? '原生 · 点卡片安装'
                      : g.assetPath
                        ? '文件'
                        : kindBadge(g.kind ?? 'html')}
                {snapshot.gameSession?.gameId === g.id ? ' · 进行中' : ''}
              </Text>
            </Pressable>
          ))}
        </View>

        {session ? (
          <View style={{ marginTop: 12 }}>
            <Text style={[font.tiny]}>
              当前这一局：{session.title} · 局面已同步 {session.seq} 次
            </Text>
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn
                title={landscape ? '下次竖屏玩' : '下次横屏玩'}
                small
                variant="ghost"
                onPress={() => lockLandscape(!landscape)}
              />
              <Btn
                title="结束这局"
                small
                variant="ghost"
                onPress={() => {
                  lockLandscape(false);
                  store.endGame();
                }}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* 原生游戏装不上：给出下载地址 + 已保存路径 */}
      {installHelp ? (
        <View style={styles.modalRoot}>
          <Card>
            <Text style={font.bodyStrong}>装不上「{installHelp.title}」</Text>
            <Text style={[font.tiny, { marginTop: 6, lineHeight: 17 }]}>
              这台手机的系统把"直接调安装器"拦住了（{installHelp.error}）。
              下面两种办法都能装上：
            </Text>
            <View style={{ height: 10 }} />
            <Text style={[font.tiny, { color: color.inkSoft }]}>① 用浏览器下载后点安装包：</Text>
            <Text style={[font.tiny, { color: color.primaryInk, marginTop: 4 }]} numberOfLines={2}>
              {installHelp.url}
            </Text>
            <View style={{ height: 8 }} />
            <Btn
              title="用浏览器打开这个地址"
              small
              onPress={() => {
                void openApkInBrowser(store.gameBaseUrl, installHelp.url.replace(store.gameBaseUrl, ''))
                  .then((ok) => {
                    if (!ok) toast.show('打不开浏览器，请手动复制上面的地址');
                  });
              }}
            />
            <View style={{ height: 12 }} />
            {installHelp.savedTo ? (
              <>
                <Text style={[font.tiny, { color: color.inkSoft }]}>② 已经保存到手机了，用文件管理器打开：</Text>
                <Text style={[font.tiny, { marginTop: 4 }]} numberOfLines={2}>
                  {installHelp.savedTo}
                </Text>
                <View style={{ height: 8 }} />
              </>
            ) : null}
            <Btn title="知道了" variant="ghost" onPress={() => setInstallHelp(null)} />
          </Card>
        </View>
      ) : null}

      {/* 源码类：只能看/复制，明确告诉用户手机上跑不了 */}
      {showSource ? (
        <View style={styles.modalRoot}>
          <Card style={{ maxHeight: '86%' }}>
            <Text style={font.bodyStrong}>{showSource.title}</Text>
            <Text style={[font.tiny, { marginTop: 4, lineHeight: 17 }]}>
              这是原生/引擎源码（不是 HTML）。手机里不能直接跑，也不适合塞进 WebView ——
              大型游戏在 WebView 里会卡死。请复制回电脑，用对应工具打包成 APK 再安装。
            </Text>
            <View style={{ height: 10 }} />
            <View style={[styles.input, { height: 180 }]}>
              <ScrollView>
                <Text style={[font.tiny, { color: color.inkSoft }]}>{showSource.code.slice(0, 4000)}</Text>
              </ScrollView>
            </View>
            <View style={{ height: 12 }} />
            {/\bclass\s+\w+\s+extends\s+[\w.]*Activity\b/.test(showSource.code) ? (
              <>
                <Text style={[font.tiny, { marginTop: 8, color: color.primaryInk, lineHeight: 17 }]}>
                  看起来是 Java（有 class ... extends Activity）：可以直接云编译成原生 APK，
                  不用复制回电脑。
                </Text>
                <View style={{ height: 8 }} />
                <Btn
                  title="🛠 直接云编译成原生 APK"
                  onPress={() => {
                    const spec = showSource;
                    setShowSource(null);
                    void store.compileNativeGame(spec.title, spec.code);
                  }}
                />
                <View style={{ height: 8 }} />
              </>
            ) : null}
            <Btn title="关闭" variant="ghost" onPress={() => setShowSource(null)} />
          </Card>
        </View>
      ) : null}

      {/* 粘贴代码 */}
      {importOpen ? (
        <View style={styles.modalRoot}>
          <Card style={{ maxHeight: '86%' }}>
            <Text style={font.bodyStrong}>粘贴游戏代码</Text>
            <Text style={[font.tiny, { marginTop: 6, color: color.inkSoft, lineHeight: 17 }]}>
              {`框架会自动把这些都跑起来：完整 HTML、只有一段 JS/HTML 片段、需要 CDN 的 3D 游戏。
联机接口是 TwGame.send(状态) / window.onRemoteState(状态)。`}
            </Text>
            <Text style={[font.tiny, { marginTop: 4 }]}>
              HTML 直接贴（App 里打开、可联机）；应用商店/网页链接也行（交给手机打开）；其它源码（Java/Kotlin/C#…）会当源码存着，手机里跑不了。
            </Text>
            <View style={{ height: 8 }} />
            <Btn
              title={layered ? '← 回到一次性粘贴' : '🧱 分层粘贴（结构 / 样式 / 脚本分开贴）'}
              small
              variant="ghost"
              onPress={() => setLayered(!layered)}
            />
            <View style={{ height: 8 }} />
            {layered ? (
              <>
                <TextInput
                  value={layerHtml}
                  onChangeText={setLayerHtml}
                  placeholder="第一层：HTML 结构（<canvas> / <div> …）"
                  placeholderTextColor={color.inkFaint}
                  multiline
                  style={[styles.input, { height: 90, textAlignVertical: 'top', fontSize: 11 }]}
                />
                <View style={{ height: 6 }} />
                <TextInput
                  value={layerCss}
                  onChangeText={setLayerCss}
                  placeholder="第二层：CSS 样式"
                  placeholderTextColor={color.inkFaint}
                  multiline
                  style={[styles.input, { height: 80, textAlignVertical: 'top', fontSize: 11 }]}
                />
                <View style={{ height: 6 }} />
                <TextInput
                  value={layerJs}
                  onChangeText={setLayerJs}
                  placeholder="第三层：JS 逻辑（也放得下整页 HTML）"
                  placeholderTextColor={color.inkFaint}
                  multiline
                  style={[styles.input, { height: 140, textAlignVertical: 'top', fontSize: 11 }]}
                />
                <View style={{ height: 6 }} />
                <Btn
                  title="合成到下面的代码框"
                  small
                  onPress={() => {
                    setCode(assembleLayers({ html: layerHtml, css: layerCss, js: layerJs }));
                    toast.show('已合成：可以点"生成并加入游戏库"了');
                  }}
                />
                <View style={{ height: 8 }} />
              </>
            ) : null}
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="给它起个名字，例如：井字棋"
              placeholderTextColor={color.inkFaint}
              style={styles.input}
            />
            <View style={{ height: 8 }} />
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="<!doctype html>…"
              placeholderTextColor={color.inkFaint}
              multiline
              style={[styles.input, { height: 200, textAlignVertical: 'top' }]}
            />
            <View style={{ height: 12 }} />
            <Btn
              title="生成并加入游戏库"
              onPress={() => {
                // 体积大就上传成文件（只存地址），彻底绕开同步状态的大小限制
                if (code.length > 300_000) {
                  void store.importLargeGame(title || '大体积游戏', code).then((ok) => {
                    if (!ok) return;
                    setImportOpen(false);
                    setTitle('');
                    setCode('');
                  });
                  return;
                }
                const kind = detectGameKind(code);
                if (kind === 'source') {
                  // 原生/引擎源码：手机里跑不了，先说明再存
                  toast.show('这不是 HTML，也不是链接：会当"源码"存进库（可以复制出来到电脑上打包），App 里不能直接跑');
                }
                store.addGame(title, code, kind);
                setImportOpen(false);
                setTitle('');
                setCode('');
              }}
            />
            <View style={{ height: 8 }} />
            <Btn
              title="🛠 云编译成原生 APK（Java 源码用这个）"
              variant="soft"
              onPress={() => {
                void store.compileNativeGame(title || 'Mutual 小游戏', code).then((ok) => {
                  if (!ok) return;
                  setImportOpen(false);
                  setTitle('');
                  setCode('');
                });
              }}
            />
            <View style={{ height: 8 }} />
            <Btn
              title="📋 复制给 AI 的指令模板"
              small
              variant="ghost"
              onPress={() => {
                void Clipboard.setStringAsync(AI_PROMPT)
                  .then(() => toast.show('已复制：去问 AI 要游戏代码吧'))
                  .catch(() => toast.show('复制失败，长按输入框手动粘贴'));
                setCode(AI_PROMPT);
              }}
            />
            <View style={{ height: 8 }} />
            <Btn title="取消" variant="ghost" onPress={() => setImportOpen(false)} />
          </Card>
        </View>
      ) : null}
    </View>
  );
}

/**
 * 沙箱里跑游戏。
 *
 * 桥接约定（写进我们给 AI 的说明里，也内置在样例中）：
 *   window.TwGame.send(jsonString)   → 我把局面交给 App，App 广播给对方
 *   window.TwGame.apply(jsonString)  → 对方局面到了（WebView 内注入调用）
 */
function GamePlayer({
  game,
  width,
  availableHeight,
  baseUrl,
  stateText,
  seq,
  role,
  netText,
  netSeq,
  netFrom,
  netSeed,
  onState,
  onNet,
}: {
  game: GameSpec;
  width: number;
  availableHeight: number;
  /** 服务器基地址：按网址加载大游戏时用 */
  baseUrl: string;
  stateText: string;
  seq: number;
  /** 农场是"一个人写、另一个人镜像"，需要把角色带进页面 */
  role: 'A' | 'B';
  /** 联机层最新数据包（第三方 HTML 游戏用） */
  netText: string;
  netSeq: number;
  netFrom: 'A' | 'B' | null;
  /** 两台手机必须一致：同一对 + 同一个游戏 = 同一颗种子 */
  netSeed: number;
  onState: (state: string) => void;
  onNet: (packet: string) => void;
}) {
  const webRef = useRef<any>(null);
  /**
   * 大游戏的本地副本。
   *
   * 有 assetPath 说明是"文件型"游戏：第一次点开下载到手机私有目录，
   * 之后（含离线）都从本地跑；对方点开时他自己下载、存他自己手机。
   */
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [fetching, setFetching] = useState<boolean>(Boolean(game.assetPath));
  const [fetchError, setFetchError] = useState<string | null>(null);
  useEffect(() => {
    if (!game.assetPath) return;
    let cancelled = false;
    void (async () => {
      const res = await ensureLocalGame(baseUrl, game.assetPath as string);
      if (cancelled) return;
      setFetching(false);
      if (res.uri) setLocalUri(res.uri);
      else setFetchError(res.error ?? '下载失败');
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, game.assetPath]);
  // 竖屏时代原来是 width * 1.15；横屏时高度变小，不能把画面顶出屏幕
  const height = Math.max(240, Math.min(availableHeight, width * 1.15));
  /**
   * 正在应用"对方传来的局面"。
   *
   * 应用完后有些游戏会顺手再 send 一次（我们内置样例不会），
   * 那就会两端互相推来推去。所以在 apply 之后短暂屏蔽 600ms 的上报。
   */
  const applying = useRef(false);
  /** 刚注入进 WebView 的那份局面：只用来过滤"自己回声"，不作为时间窗 */
  const lastInjected = useRef<string>('');
  const lastSeq = useRef(0);
  /** 联机包：只注入"对方发来的那颗"，自己的不回灌 */
  const lastNetSeq = useRef(0);

  const applyRemote = (text: string) => {
    lastInjected.current = text;
    if (!text) return;
    applying.current = true;
    const js =
      '(function(){try{var s=' +
      JSON.stringify(text) +
      ';if(window.TwGame&&window.TwGame.apply){window.TwGame.apply(s);}}catch(e){}})();true;';
    webRef.current?.injectJavaScript(js);
    setTimeout(() => {
      applying.current = false;
    }, 600);
  };

  // 关键：局面变了就把新局面 inject 进 WebView。
  // 以前只靠 injectedJavaScript（只在页面加载时执行一次），
  // 所以对方落子后我这边的 WebView 永远收不到 —— 表现就是"只能在我一个手机上操作"。
  useEffect(() => {
    if (seq === lastSeq.current) return;
    lastSeq.current = seq;
    applyRemote(stateText);
  }, [seq, stateText]);

  /*
   * 联机包：只把**对方**发来的注入页面（自己的包自己已经执行过，回灌会重复一步）。
   */
  useEffect(() => {
    if (netSeq === lastNetSeq.current) return;
    lastNetSeq.current = netSeq;
    if (!netText || !netFrom || netFrom === role) return;
    const js =
      '(function(){try{var t=' +
      JSON.stringify(netText) +
      ";if(window.TwNet&&window.TwNet.applyRemote){window.TwNet.applyRemote(t);}}catch(e){}})();true;";
    webRef.current?.injectJavaScript(js);
  }, [netSeq, netText, netFrom, role]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0E0C0B' }}>
      <WebView
        ref={webRef}
        // key 只跟游戏走：不要因为 seq 变化重建 WebView（重建会丢局面和动画）
        key={game.id}
        originWhitelist={
          game.assetPath || game.builtin === 'voxel3d' || !needsNetwork(game.code)
            ? ['*']
            : ['about:blank', 'data:*']
        }
        mixedContentMode="compatibility"
        allowFileAccess
        source={
          game.assetPath
            ? localUri
              ? { uri: localUri }
              : { html: '<html><body style="background:#0E0C0B;color:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui">' +
                  (fetchError ? '下载失败：' + fetchError : '正在把游戏下载到手机…') +
                  '</body></html>' }
            : {
                html:
                  /* 农场卡是 builtin:'farm'、code 为空：以前拿空字符串当代码跑 → 黑屏 */
                  game.builtin === 'farm'
                    ? buildFarmHtml(role)
                    : game.builtin === 'voxel3d'
                      ? buildVoxelHtml()
                      : /*
                         * NET_LAYER：粘贴进来的第三方 HTML 游戏也要能双人玩。
                         * 注入联机层（同种子随机 + 输入/局面镜像），它会把包以 TW_NET: 前缀
                         * 发上来，我们转给服务器再镜像给对方。
                         * 以前这里不带 net：联机层从来没被注入，两个人在各自手机上各玩一份。
                         */ buildRuntimeHtml(game.code, { role, seed: netSeed }),
              }
        }
        style={{ flex: 1, height }}
        javaScriptEnabled
        domStorageEnabled={false}
        allowsInlineMediaPlayback
setSupportZoom
          allowsFullscreenVideo
setBuiltInZoomControls={false}
setDisplayZoomControls={false}
textZoom={100}
        setSupportMultipleWindows={false}
        // 按网址加载的大游戏：页面一加载就把兼容层塞进去（html 路径已经内联注入过）
        injectedJavaScriptBeforeContentLoaded={
          game.assetPath ? `${buildTouchpadShim()}\n${buildRuntimeShim()}` : buildTouchpadShim()
        }
        onLoadEnd={() => {
          // 中途加入对局：页面加载完先把当前局面灌进去
          if (stateText) applyRemote(stateText);
        }}
        onMessage={(event) => {
          const raw = event.nativeEvent.data;
          if (!raw) return;
          /* 联机包：转给服务器，靠投影镜像给对方 */
          if (raw.startsWith('TW_NET:')) {
            onNet(raw.slice('TW_NET:'.length));
            return;
          }
          if (!raw.startsWith('TW_STATE:')) return;
          /*
           * 只屏蔽"和刚注入的那份一模一样"的回声，不要按 600ms 时间窗整段屏蔽：
           * 以前 applyRemote 之后 600ms 内的输入全被丢掉，用户连点两下，
           * 第二次的改动永远同步不过去。
           */
          const payload = raw.slice('TW_STATE:'.length);
          if (applying.current && payload === lastInjected.current) return;
          onState(payload);
        }}
      />
    </View>
  );
}

/** 屏幕方向：自动（跟随系统）/ 强制竖屏 / 强制横屏 */
type Orient = 'auto' | 'portrait' | 'landscape';
const ORIENT_KEY = (id: string) => `game_orient:${id}`;

async function applyOrient(mode: Orient, setLandscape?: (b: boolean) => void): Promise<void> {
  try {
    if (mode === 'landscape') {
      setLandscape?.(true);
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else if (mode === 'portrait') {
      setLandscape?.(false);
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      // 自动 = 交回系统（旋转手机就跟着转）
      await ScreenOrientation.unlockAsync();
    }
  } catch {
    /* 有些设备不允许锁方向：不影响玩 */
  }
}

/**
 * 游戏内右下角的三个小按钮：自动 / 竖 / 横。
 *
 * 为什么必须有：有些网页游戏把横屏绑在 HTML5 全屏上（requestFullscreen），
 * Android WebView 不支持 DOM 全屏，于是它永远等不到横屏 —— 只能 App 这边手动转。
 * 选择按卡片记住（AsyncStorage），下次进同一张卡沿用。
 */
function OrientationChips({ gameId, onApply }: { gameId: string; onApply?: (b: boolean) => void }) {
  const [mode, setMode] = useState<Orient>('auto');
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(ORIENT_KEY(gameId))
      .then((v) => {
        if (!alive) return;
        const m = v === 'landscape' || v === 'portrait' ? v : 'auto';
        setMode(m);
        if (m !== 'auto') void applyOrient(m, onApply);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [gameId]);

  const pick = (m: Orient) => {
    setMode(m);
    void AsyncStorage.setItem(ORIENT_KEY(gameId), m).catch(() => undefined);
    void applyOrient(m, onApply);
  };

  const items: Array<{ k: Orient; label: string }> = [
    { k: 'auto', label: '自动' },
    { k: 'portrait', label: '竖' },
    { k: 'landscape', label: '横' },
  ];

  return (
    <View style={styles.orientBar}>
      {items.map((it) => (
        <Pressable
          key={it.k}
          onPress={() => pick(it.k)}
          style={[styles.orientChip, mode === it.k && styles.orientChipOn]}
        >
          <Text style={[styles.orientText, mode === it.k && styles.orientTextOn]}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  immersiveRoot: { flex: 1, backgroundColor: '#000000' },
  orientBar: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    gap: 6,
    zIndex: 50,
  },
  orientChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  orientChipOn: { backgroundColor: 'rgba(120,190,120,0.85)', borderColor: '#fff' },
  orientText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  orientTextOn: { color: '#10230f' },
  floatBar: { position: 'absolute', flexDirection: 'row', gap: 8, opacity: 0.82 },
  floatBtn: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.pill ?? 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  floatText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingBottom: 8,
  },
  back: { fontSize: 14, color: color.inkSoft },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: color.ink },
  count: { fontSize: 12, color: color.inkSoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: 104,
    backgroundColor: surf('base'),
    borderRadius: radius.md,
    padding: 10,
    alignItems: 'center',
  },
  tileEmoji: { fontSize: 26 },
  tileBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadgeText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  tileTitle: { fontSize: 12, fontWeight: '700', color: color.ink, marginTop: 6, textAlign: 'center' },
  tileMeta: { fontSize: 10, color: color.inkSoft, marginTop: 4 },
  modalRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: space.md,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: color.ink,
  },
});
