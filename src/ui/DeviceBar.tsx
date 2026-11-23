import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DEMO_TOOLS } from '../core/buildFlags';
import { useApp } from '../store';
import { color, font, radius } from './theme';

/**
 * 评审演示台：A/B 端切换 + 断网模拟。
 *
 * 真实产品里**没有**这个组件——两台手机各自是 A/B 端，由同步服务器分配，
 * 用户不该能把自己切换成对方的身份。默认构建下直接不渲染，
 * 所有引用它的页面右上角就是空的，不需要逐个页面改。
 */
export function DevicePills() {
  const { store, role } = useApp();
  const device = store.device;
  const online = device.online;

  if (!DEMO_TOOLS) return null;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => store.setRole(role === 'A' ? 'B' : 'A')}
        style={({ pressed }) => [styles.pill, styles.pillAccent, pressed ? styles.pressed : null]}
      >
        <Text style={[font.tiny, { color: color.primaryInk, fontWeight: '700' }]}>
          {role === 'A' ? 'A 端 ⇄' : 'B 端 ⇄'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => store.toggleOnline()}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: online ? color.mintSoft : color.dangerSoft },
          pressed ? styles.pressed : null,
        ]}
      >
        <View
          style={[
            styles.dot,
            { backgroundColor: online ? color.ok : color.danger },
          ]}
        />
        <Text style={[font.tiny, { color: online ? color.ok : color.danger, fontWeight: '700' }]}>
          {online ? '在线' : '断网'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
  },
  pillAccent: { backgroundColor: color.primarySoft, borderColor: color.primarySoft },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pressed: { opacity: 0.75 },
});
