#!/bin/bash
# 在服务器上搭「云编译」工具链：JDK + Android SDK build-tools，并真的编出一个可安装 APK
set -euo pipefail

echo "== 0) 免密 sudo 检查 =="
if ! sudo -n true 2>/dev/null; then
  echo "❌ 没有免密 sudo，无法安装系统包"
  exit 1
fi
echo "✅ 免密 sudo 可用"

echo "== 1) 装 JDK / unzip / wget =="
if ! command -v javac >/dev/null 2>&1; then
  sudo -n apt-get update -qq
  sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-17-jdk-headless unzip wget >/dev/null
fi
javac -version 2>&1 || true

SDK=/opt/android-sdk
echo "== 2) 装 Android 命令行工具 + build-tools =="
if [ ! -d "$SDK/build-tools" ]; then
  sudo -n mkdir -p "$SDK"
  sudo -n chown "$(id -u):$(id -g)" "$SDK"
  cd /tmp
  if [ ! -f cmdline-tools.zip ]; then
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdline-tools.zip
  fi
  rm -rf /tmp/cmdline-tools && unzip -q cmdline-tools.zip -d /tmp/cmdline-tools
  mkdir -p "$SDK/cmdline-tools"
  rm -rf "$SDK/cmdline-tools/latest"
  mv /tmp/cmdline-tools/cmdline-tools "$SDK/cmdline-tools/latest"
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
  "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" "platform-tools" "platforms;android-34" "build-tools;34.0.0" >/dev/null
fi
BT="$SDK/build-tools/34.0.0"
AJAR="$SDK/platforms/android-34/android.jar"
echo "build-tools: $($BT/aapt2 version 2>&1 | head -1)"
echo "android.jar: $(ls -la "$AJAR" | awk '{print $5}') bytes"

echo "== 3) 写一个最小可玩 Java 游戏（弹球） =="
W=/tmp/apkgame
rm -rf "$W" && mkdir -p "$W/res/values" "$W/src/com/mutual/game" "$W/out"
cat > "$W/res/values/strings.xml" <<'XML'
<resources><string name="app_name">Mutual 云编译测试</string></resources>
XML
cat > "$W/AndroidManifest.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
  package="com.mutual.game" android:versionCode="1" android:versionName="1.0">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34"/>
  <application android:label="@string/app_name">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
  </application>
</manifest>
XML
cat > "$W/src/com/mutual/game/MainActivity.java" <<'JAVA'
package com.mutual.game;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.View;

/** 云编译冒烟测试：一个会弹跳的球，证明原生 APK 真的能跑 */
public class MainActivity extends Activity {
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    setContentView(new Ball(this));
  }

  static class Ball extends View {
    float x = 100, y = 100, vx = 5.5f, vy = 4.2f, r = 40;
    final Paint bg = new Paint();
    final Paint ball = new Paint();
    Ball(Context c) {
      super(c);
      bg.setColor(Color.rgb(14, 12, 11));
      ball.setColor(Color.rgb(232, 131, 107));
      ball.setAntiAlias(true);
    }
    @Override protected void onDraw(Canvas cv) {
      cv.drawRect(0, 0, getWidth(), getHeight(), bg);
      x += vx; y += vy;
      if (x < r || x > getWidth() - r) vx = -vx;
      if (y < r || y > getHeight() - r) vy = -vy;
      cv.drawCircle(x, y, r, ball);
      invalidate();
    }
  }
}
JAVA

echo "== 4) 编译：javac → d8 → aapt2 → zipalign → apksigner =="
cd "$W"
javac -nowarn -source 8 -target 8 -classpath "$AJAR" -d out/classes $(find src -name '*.java') 2>&1 | grep -v 'bootstrap class path' || true
"$BT/d8" --lib "$AJAR" --min-api 24 --output out/dex $(find out/classes -name '*.class') >/dev/null
"$BT/aapt2" compile -o out/res.zip res/values/strings.xml
"$BT/aapt2" link -o out/base.apk -I "$AJAR" --manifest AndroidManifest.xml out/res.zip --min-sdk-version 24 --target-sdk-version 34
cd out && cp base.apk app.apk && cd ..
(cd out && zip -q app.apk classes.dex)
"$BT/zipalign" -f 4 out/app.apk out/app-aligned.apk
if [ ! -f /opt/twospace/keystore/debug.keystore ]; then
  mkdir -p /opt/twospace/keystore
  keytool -genkeypair -v -keystore /opt/twospace/keystore/debug.keystore -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Mutual Cloud Build" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks /opt/twospace/keystore/debug.keystore --ks-pass pass:android --key-pass pass:android \
  --out out/final.apk out/app-aligned.apk
echo "== 5) 结果 =="
"$BT/aapt2" dump badging out/final.apk | head -3
ls -la out/final.apk
cp out/final.apk /opt/twospace/cloudbuild-sample.apk
echo "✅ 云编译工具链打通：/opt/twospace/cloudbuild-sample.apk"
