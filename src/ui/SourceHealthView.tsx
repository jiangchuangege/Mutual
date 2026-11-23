import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { levelLabel, type HealthLevel, type HealthReport } from '../core/sourceHealth';
import { night, nightFont } from './nightTheme';

/**
 * 坏源显示组件（影院片源接口 / 电视直播源共用一套）
 *
 * 设计目标（用户原话）：「哪个接口是坏的，让他能看出来」。
 * 所以每一行都给出三件东西：亮灯、耗时、**人话原因**，
 * 失败的那一行直接变红，并把"为什么坏"写清楚（超时 / 404 / 不是 JSON / 0 部片）。
 */

export function healthColor(level: HealthLevel): string {
  switch (level) {
    case 'ok':
      return night.ok;
    case 'slow':
      return night.warn;
    case 'dead':
      return night.danger;
    case 'checking':
      return night.cyan;
    default:
      return night.unknown;
  }
}

/** 圆点指示灯 */
export function HealthDot({ level, size = 8 }: { level: HealthLevel; size?: number }) {
  const c = healthColor(level);
  return (
    <View style={{ width: size + 6, height: size + 6, alignItems: 'center', justifyContent: 'center' }}>
      {level === 'ok' || level === 'slow' ? (
        <View
          style={{
            position: 'absolute',
            width: size + 6,
            height: size + 6,
            borderRadius: (size + 6) / 2,
            backgroundColor: c,
            opacity: 0.18,
          }}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />
    </View>
  );
}

/** 小胶囊：正常 / 很慢 / 已失效 + 耗时 */
export function HealthChip({ report }: { report: HealthReport }) {
  const c = healthColor(report.level);
  const label = levelLabel(report.level);
  const ms = report.latencyMs > 0 ? `${(report.latencyMs / 1000).toFixed(1)}s` : '';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: `${c}1F`,
        borderWidth: 1,
        borderColor: `${c}66`,
      }}
    >
      {report.level === 'checking' ? (
        <ActivityIndicator size="small" color={c} style={{ transform: [{ scale: 0.6 }] }} />
      ) : (
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c }} />
      )}
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: c }}>
        {label}
        {ms ? ` · ${ms}` : ''}
      </Text>
    </View>
  );
}

/** 地址遮罩：只留域名主体和最后一段路径，配置细节不占屏 */
export function maskUrl(url: string): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '（空地址）';
  try {
    const noProto = raw.replace(/^https?:\/\//i, '');
    const [hostPart, ...rest] = noProto.split('/');
    const host = hostPart.split(':')[0];
    const path = rest.filter(Boolean);
    if (path.length === 0) return host;
    const last = path[path.length - 1];
    return `${host} · ${last.length > 22 ? `${last.slice(0, 22)}…` : last}`;
  } catch {
    return raw.length > 32 ? `${raw.slice(0, 32)}…` : raw;
  }
}

/**
 * 一行源：灯 + 名字 + 地址 + 状态 + 右侧操作
 *
 * `active` 表示"当前正在使用这个源"，用青色描边高亮。
 */
export function SourceRow({
  name,
  url,
  report,
  active,
  onPress,
  onRemove,
  removeLabel = '删除',
  extra,
}: {
  name: string;
  url: string;
  report: HealthReport;
  active?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  /** 名字下面的附加信息（比如"来源：m3u · 128 个台"） */
  extra?: string;
}) {
  const dead = report.level === 'dead';
  const borderColor = active ? night.cyanLine : dead ? `${night.danger}55` : night.line;
  const bg = active ? night.cyanSoft : dead ? `${night.danger}12` : night.glassHi;

  const body = (
    <>
      <HealthDot level={report.level} />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[nightFont.bodyStrong, { flexShrink: 1 }]} numberOfLines={1}>
            {name || '未命名源'}
          </Text>
          <HealthChip report={report} />
        </View>
        <Text style={[nightFont.small, { marginTop: 2 }]} numberOfLines={1}>
          {maskUrl(url)}
        </Text>
        {report.detail ? (
          <Text
            style={[
              nightFont.small,
              { marginTop: 2, color: dead ? night.danger : night.textFaint },
            ]}
            numberOfLines={2}
          >
            {report.detail}
            {extra ? ` · ${extra}` : ''}
          </Text>
        ) : extra ? (
          <Text style={[nightFont.small, { marginTop: 2 }]} numberOfLines={1}>
            {extra}
          </Text>
        ) : null}
      </View>
      {onRemove ? (
        /*
         * DEL_BTN_STANDALONE：删除按钮**不能**套在"整行可点"的 Pressable 里。
         * 真实事故：直播源页的整行没有 onPress（disabled=true），嵌在里面的
         * 删除按钮就永远收不到触摸 —— 用户点了十几次删除，界面上一点反应都没有，
         * 于是以为"这个源删不掉"。这里把删除单独提出来，并且给它足够大的点击区。
         */
        <Pressable
          onPress={onRemove}
          hitSlop={12}
          style={styles.removeBtn}
          accessibilityRole="button"
          accessibilityLabel={`删除 ${name || '这个源'}`}
        >
          <Text style={{ fontSize: 10.5, color: night.textFaint, fontWeight: '600' }}>{removeLabel}</Text>
        </Pressable>
      ) : null}
    </>
  );

  /*
   * 没有 onPress 就渲染普通 View：不摆一个 disabled 的 Pressable 在那里挡路。
   */
  if (!onPress) {
    return <View style={[styles.row, { borderColor, backgroundColor: bg }]}>{body}</View>;
  }

  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor, backgroundColor: bg }]}>
      {body}
    </Pressable>
  );
}

/** 检测结果的汇总一句话：`3 个正常 · 1 个很慢 · 2 个已失效` */
export function HealthSummary({ reports }: { reports: Record<string, HealthReport> }) {
  const list = Object.values(reports);
  if (list.length === 0) return null;
  const ok = list.filter((r) => r.level === 'ok').length;
  const slow = list.filter((r) => r.level === 'slow').length;
  const dead = list.filter((r) => r.level === 'dead').length;
  const checking = list.filter((r) => r.level === 'checking').length;

  const parts: Array<{ text: string; color: string }> = [];
  if (ok > 0) parts.push({ text: `${ok} 个正常`, color: night.ok });
  if (slow > 0) parts.push({ text: `${slow} 个很慢`, color: night.warn });
  if (dead > 0) parts.push({ text: `${dead} 个已失效`, color: night.danger });
  if (checking > 0) parts.push({ text: `${checking} 个检测中`, color: night.cyan });

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {parts.map((p) => (
        <View
          key={p.text}
          style={{
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: `${p.color}1A`,
            borderWidth: 1,
            borderColor: `${p.color}55`,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: p.color }}>{p.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 7,
  },
  removeBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: night.line,
  },
});
