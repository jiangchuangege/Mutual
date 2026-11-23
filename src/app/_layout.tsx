// 必须是第一行 import：先给 StyleSheet.create 打补丁，后面所有模块的表面色才登记得上
import '../ui/dynamicSurfaces';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../store';
import { ConfirmProvider, ToastProvider, useToast } from '../ui/components';
import { ActivityDock } from '../ui/ActivityDock';
import { AppFrame } from '../ui/AppFrame';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { installGlobalErrorHandler } from '../ui/globalErrorHandler';
import { GlobalCallDock } from '../ui/GlobalCallDock';
import { color } from '../ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <ConfirmProvider>
          <GlobalErrorGuard />
          <AppProvider>
            <StatusBar style="dark" />
            <ErrorBoundary>
              <AppFrame>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                    animation: 'slide_from_right',
                  }}
                />
              </AppFrame>
            </ErrorBoundary>
            <GlobalCallDock />
            <ActivityDock />
          </AppProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

/**
 * 把未捕获的 JS 异常降级成一条 Toast，而不是让 App 直接退出。
 * 放在 ToastProvider 内部，这样它能用到 toast。
 */
function GlobalErrorGuard() {
  const toast = useToast();
  React.useEffect(() => installGlobalErrorHandler(toast.show), [toast]);
  return null;
}
