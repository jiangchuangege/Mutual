/**
 * UI 基础组件库（自建，不引三方 UI 库，减少版本风险）
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { color, font, isCustomBgActive, radius, shadow, space } from './theme';
import { blurProps, shouldUseBlur } from './blurTarget';
import { surf } from './theme';
import { NetStatusDot } from './NetStatusDot';

// ---------------------------------------------------------------------------
// 布局：屏幕容器
// ---------------------------------------------------------------------------

export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  contentStyle,
  footer,
  back = false,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: React.ReactNode;
  /** 子页面打开时左上角给一个返回（安卓返回键之外的可见入口） */
  back?: boolean;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {back ? (
          <Pressable
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
            hitSlop={12}
            style={styles.headerBack}
          >
            <Text style={{ fontSize: 22, color: color.inkSoft }}>‹</Text>
          </Pressable>
        ) : null}
        <View style={styles.headerText}>
          <Text style={font.h1}>{title}</Text>
          {subtitle ? <Text style={[font.small, { marginTop: 4 }]}>{subtitle}</Text> : null}
        </View>
        {/* 网络状态指示灯：所有页面标题栏统一带一个，不用逐页去加 */}
        <View style={styles.headerRight}>
          {right}
          <NetStatusDot />
        </View>
      </View>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            { paddingHorizontal: space.lg, paddingBottom: 120 + insets.bottom },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingHorizontal: space.lg }, contentStyle]}>{children}</View>
      )}
      {footer}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// 卡片 / 区块
// ---------------------------------------------------------------------------

export function Card({
  children,
  style,
  onPress,
  tone,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: string;
}) {
  /**
   * 有自定义背景时：卡片是**真毛玻璃**。
   *
   * 叠放顺序很关键（之前踩过）：BlurView 画的是"被模糊的背景"，
   * 它会盖在卡片的底色上面 —— 所以白色必须放在模糊**之上**，
   * 否则卡片看起来就是"一张透出来的壁纸"，不是磨砂白。
   *   底 → 模糊层 → 白色薄层(0.72) → 语义色 → 内容
   */
  const glass = isCustomBgActive();
  const body = (
    <View
      style={[
        styles.card,
        glass
          ? {
              backgroundColor: 'transparent',
              borderColor: 'rgba(255,255,255,0.80)',
              shadowColor: '#000000',
              shadowOpacity: 0.10,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
              overflow: 'hidden',
            }
          : null,
        tone && !glass ? { backgroundColor: tone } : null,
        style,
      ]}
    >
      {glass ? (
        <>
          {/* 视频背景时不跑 RenderEffect（糊不到东西又费 GPU），只留白色磨砂层 */}
          {shouldUseBlur() ? (
            <BlurView intensity={40} tint="light" {...blurProps} style={StyleSheet.absoluteFill} />
          ) : null}
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.88)' }]}
          />
          {tone ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: tone, opacity: 0.30 }]}
            />
          ) : null}
        </>
      ) : null}
      <View>{children}</View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {body}
    </Pressable>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={[font.h3, { color: color.inkMid }]}>{title}</Text>
      {right}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

/**
 * 头像。
 *
 * 传了 `uri`（服务器上的绝对地址 / data: / 旧版 file:）就显示图片，
 * 没有、或者加载失败（服务器不通、文件被删）就退回 emoji —— 永远不会出现空白方块。
 * 之前的问题是：所有页面都只渲染 emoji，压根不看 avatarUri，
 * 于是"上传了头像但哪里都不显示"。
 */
export function Avatar({
  emoji,
  size = 40,
  ring,
  uri,
  dim,
  bg,
}: {
  emoji: string;
  size?: number;
  ring?: boolean;
  uri?: string | null;
  /** 对方不在线时压暗一点 */
  dim?: boolean;
  bg?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  // 换了地址就重新给一次机会（比如刚上传成功）
  React.useEffect(() => setFailed(false), [uri]);
  const showImage = Boolean(uri) && !failed;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        bg ? { backgroundColor: bg } : null,
        ring ? { borderColor: color.primary, borderWidth: 2 } : null,
        dim ? { opacity: 0.5 } : null,
        showImage ? { overflow: 'hidden' } : null,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 按钮
// ---------------------------------------------------------------------------

export type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'dark';

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
  icon,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  const palette = {
    primary: { bg: color.primary, fg: '#FFFFFF', border: color.primary },
    soft: { bg: color.primarySoft, fg: color.primaryInk, border: color.primarySoft },
    ghost: { bg: 'transparent', fg: color.inkMid, border: color.lineStrong },
    danger: { bg: color.dangerSoft, fg: color.danger, border: color.dangerSoft },
    dark: { bg: color.ink, fg: '#FFFFFF', border: color.ink },
  }[variant];

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small ? styles.btnSmall : null,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text
          style={[
            small ? font.small : font.bodyStrong,
            { color: palette.fg, fontWeight: '700' },
          ]}
        >
          {icon ? `${icon} ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tone,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? tone ?? color.primary : surf('alt'),
          borderColor: active ? tone ?? color.primary : color.line,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={[
          font.small,
          { color: active ? '#FFFFFF' : color.inkMid, fontWeight: active ? '700' : '500' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Pill({ label, tone = color.lavenderSoft, ink = color.inkMid }: { label: string; tone?: string; ink?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: tone }]}>
      <Text style={[font.tiny, { color: ink }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 表单
// ---------------------------------------------------------------------------

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  maxLength,
  autoFocus,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'numeric';
  maxLength?: number;
  autoFocus?: boolean;
  /** 账号 ID 这类要按大写输入的字段用 'characters' */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[font.tiny, { marginBottom: 6, color: color.inkSoft }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.inkFaint}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === 'characters' ? false : undefined}
        style={[
          styles.input,
          multiline ? { minHeight: 88, textAlignVertical: 'top', paddingTop: 10 } : null,
        ]}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text
              style={[
                font.small,
                {
                  color: active ? color.ink : color.inkSoft,
                  fontWeight: active ? '700' : '500',
                },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({
  label,
  desc,
  value,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={font.bodyStrong}>{label}</Text>
        {desc ? <Text style={[font.small, { marginTop: 2 }]}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: color.lineStrong, true: color.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={font.small}>{k}</Text>
      <Text style={[font.mono, { color: color.ink }]}>{v}</Text>
    </View>
  );
}

export function ProgressBar({ value, tone = color.primary }: { value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: tone }]} />
    </View>
  );
}

export function Disclaimer({ text }: { text: string }) {
  return (
    <View style={styles.disclaimer}>
      <Text style={[font.tiny, { color: color.careInk, lineHeight: 16 }]}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 空状态（方案 §4.4：不允许白屏）
// ---------------------------------------------------------------------------

export function EmptyState({
  emoji,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 34 }}>{emoji}</Text>
      <Text style={[font.bodyStrong, { marginTop: 10, textAlign: 'center' }]}>{title}</Text>
      {desc ? (
        <Text style={[font.small, { marginTop: 6, textAlign: 'center' }]}>{desc}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Btn title={actionLabel} onPress={onAction} variant="soft" small style={{ marginTop: 14 }} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 底部弹层
// ---------------------------------------------------------------------------

/** 居中弹窗：全 App 的弹层统一居中显示（不再从底部升起） */
export function Sheet({
  visible,
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  /** 副标题：一句话说明这个弹窗要你做什么 */
  subtitle?: string;
  /** 头部图标（emoji），没有就不占位 */
  icon?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.centerBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.centerBackdropFill} onPress={onClose} />
        <View
          style={[
            styles.centerCard,
            // 有自定义背景时：底色交给「模糊 + 白色薄层」，弹层必须和后面分得开
            isCustomBgActive() ? { backgroundColor: 'transparent' } : null,
          ]}
        >
          {isCustomBgActive() ? (
            <>
              <BlurView
                intensity={40}
                tint="light"
                {...blurProps}
                style={StyleSheet.absoluteFill}
              />
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(253,253,254,0.96)' }]}
              />
            </>
          ) : null}
          <View style={styles.centerAccent} />
          <View style={styles.centerHeader}>
            <View style={{ flex: 1 }}>
              {icon ? <Text style={styles.centerIcon}>{icon}</Text> : null}
              <Text style={[font.h2, { color: color.ink }]} numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[font.small, { color: color.inkMid, marginTop: 4 }]}>{subtitle}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.centerClose}>
              <Text style={styles.centerCloseText}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.centerDivider} />
          <ScrollView
            style={{ maxHeight: Math.max(200, height * 0.58) }}
            contentContainerStyle={styles.centerBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.centerFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 确认弹窗：替代系统 Alert（安卓的系统弹窗是一个灰盒子，和整个 App 不搭）
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  /** 正文：把后果说清楚，尤其是不可撤销的 */
  message?: string;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作用暖红，不用刺眼的警告红 */
  danger?: boolean;
}

export interface DialogAction {
  text: string;
  /** choose() 的返回值 */
  value: string;
  variant?: BtnVariant;
}

interface ConfirmApi {
  /** 二选一确认：true = 点了确认 */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** 多选一：返回被点按钮的 value，点遮罩返回 null */
  choose: (opts: ConfirmOptions & { actions: DialogAction[] }) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmApi>({
  confirm: () => Promise.resolve(false),
  choose: () => Promise.resolve(null),
});

/** 二选一确认（替代系统 Alert） */
export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}

/** 三选一 / 只读提示（替代系统 Alert） */
export function useChoice() {
  return useContext(ConfirmContext).choose;
}

interface PendingDialog {
  opts: ConfirmOptions;
  actions: DialogAction[];
  settle: (value: string | null) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  const open = useCallback(
    (opts: ConfirmOptions, actions: DialogAction[]) =>
      new Promise<string | null>((resolve) => {
        setPending({ opts, actions, settle: resolve });
      }),
    [],
  );

  const api = useMemo<ConfirmApi>(
    () => ({
      confirm: async (opts) => {
        const res = await open(opts, [
          { text: opts.cancelText ?? '取消', value: 'cancel', variant: 'ghost' },
          {
            text: opts.confirmText ?? '确定',
            value: 'ok',
            variant: opts.danger ? 'danger' : 'primary',
          },
        ]);
        return res === 'ok';
      },
      choose: (opts) => open(opts, opts.actions),
    }),
    [open],
  );

  const close = useCallback((value: string | null) => {
    setPending((cur) => {
      cur?.settle(value);
      return null;
    });
  }, []);

  const opts = pending?.opts;
  const actions = pending?.actions ?? [];
  const stacked = actions.length > 2;

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Sheet
        visible={pending !== null}
        title={opts?.title ?? ''}
        icon={opts?.icon ?? '🤍'}
        onClose={() => close(null)}
        footer={
          stacked ? (
            <View style={{ gap: 8 }}>
              {actions.map((a) => (
                <Btn
                  key={a.value}
                  title={a.text}
                  variant={a.variant ?? 'ghost'}
                  onPress={() => close(a.value)}
                />
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {actions.map((a) => (
                <Btn
                  key={a.value}
                  title={a.text}
                  variant={a.variant ?? 'ghost'}
                  style={{ flex: 1 }}
                  onPress={() => close(a.value)}
                />
              ))}
            </View>
          )
        }
      >
        <Text style={[font.small, { color: color.inkMid, lineHeight: 21, paddingBottom: 6 }]}>
          {opts?.message ?? ''}
        </Text>
      </Sheet>
    </ConfirmContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

type ToastTone = 'info' | 'ok' | 'warn' | 'error';
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ show: (text: string, tone?: ToastTone) => void }>({
  show: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    counter.current += 1;
    const id = counter.current;
    setItems((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 2400);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={styles.toastHost}>
        {items.map((item) => (
          <View
            key={item.id}
            style={[
              styles.toast,
              {
                backgroundColor:
                  item.tone === 'ok'
                    ? color.ok
                    : item.tone === 'warn'
                      ? color.careInk
                      : item.tone === 'error'
                        ? color.danger
                        : color.ink,
              },
            ]}
          >
            <Text style={[font.bodyStrong, { color: '#FFFFFF' }]}>{item.text}</Text>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// 提示条
// ---------------------------------------------------------------------------

export function NoticeBar({
  text,
  tone = color.primarySoft,
  ink = color.primaryInk,
  icon,
}: {
  text: string;
  tone?: string;
  ink?: string;
  icon?: string;
}) {
  return (
    <View style={[styles.notice, { backgroundColor: tone }]}>
      <Text style={[font.small, { color: ink, flex: 1 }]}>
        {icon ? `${icon} ` : ''}
        {text}
      </Text>
    </View>
  );
}

export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 240,
      delay,
      useNativeDriver: true,
    }).start();
  }, [opacity, delay]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1 },
  headerBack: {
    width: 26,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
    // 和标题顶部对齐（标题栏是 flex-end，默认会把箭头压到底下）
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
    paddingBottom: 2,
  },
  card: {
    backgroundColor: surf('base'),
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: color.line,
    ...shadow.card,
    marginBottom: space.md,
  },
  pressed: { opacity: 0.9 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  divider: { height: 1, backgroundColor: color.line, marginVertical: space.md },
  avatar: {
    backgroundColor: surf('alt'),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 34 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  input: {
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: color.ink,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: color.line,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm },
  segmentActive: { backgroundColor: surf('base'), ...shadow.card },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  kv: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: surf('alt'),
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: radius.pill },
  disclaimer: {
    backgroundColor: color.careSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(12,14,20,0.42)', justifyContent: 'flex-end' },
  centerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // 中性深色遮罩（不是暖棕），弹层前后分得开
    backgroundColor: 'rgba(12,14,20,0.46)',
  },
  centerBackdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  centerCard: {
    width: '88%',
    maxWidth: 420,
    // 弹窗必须是实色：底下还透出页面内容会显得脏，看不清字
    backgroundColor: surf('base'),
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.float,
  },
  centerAccent: { height: 5, backgroundColor: color.primarySoft },
  centerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },
  centerIcon: { fontSize: 22, marginBottom: 6 },
  centerClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surf('alt'),
  },
  centerCloseText: { fontSize: 14, fontWeight: '700', color: color.inkSoft, lineHeight: 17 },
  centerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginTop: 14 },
  centerBody: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  centerFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: surf('alt'),
  },
  sheet: {
    // 弹层必须近乎不透明：页面底色已经降到 0.55 让背景图透出来，
    // 弹层再半透明就会出现"隔着卡片看到下面的字"
    // 用中性近白（不是奶黄）—— 用户明确不喜欢黄调
    backgroundColor: 'rgba(253,253,254,0.96)',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.lineStrong,
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  toastHost: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginTop: 8,
    maxWidth: '100%',
  },
  notice: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
