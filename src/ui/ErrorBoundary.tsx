import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn } from './components';
import { color, font, radius, space } from './theme';
import { surf } from './theme';

interface State {
  error: Error | null;
}

/**
 * 兜底错误边界。
 *
 * 为什么要它：release 包里如果某个组件在渲染时抛异常，React 会把整棵树卸载，
 * 用户看到的就是"界面还在但点哪儿都没反应"（我们真的踩到过这种情况）。
 * 有了它至少能显示一句人话 + 一个重试按钮，而不是让人对着冻住的屏幕猜。
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // 这里不接远程上报；只留一条本地日志方便连 USB 时看
    console.error('[twospace] 渲染异常：', error?.message ?? error);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.emoji}>🫧</Text>
        <Text style={styles.title}>这个页面出了点问题</Text>
        <Text style={styles.body}>不是你的操作问题。点下面的按钮回到首页就行，数据都还在。</Text>
        <Text style={styles.detail} numberOfLines={4}>
          {error.message}
        </Text>
        <Btn title="回到首页" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    backgroundColor: color.bg,
  },
  emoji: { fontSize: 40, marginBottom: 10 },
  title: { ...font.h2, color: color.ink, marginBottom: 8 },
  body: { ...font.small, color: color.inkMid, textAlign: 'center', marginBottom: 14 },
  detail: {
    ...font.tiny,
    color: color.inkFaint,
    textAlign: 'center',
    marginBottom: 18,
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    padding: 10,
    width: '100%',
  },
});
