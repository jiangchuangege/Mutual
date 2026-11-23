#!/bin/bash
# ============================================================================
# Mutual 云编译环境一键部署（无需 root）
#
# 干什么：在服务器上把「Java/Kotlin 源码 → 可安装 APK」这条流水线搭起来。
#   ① 便携定位 JDK（你已经用 yum 装了 java-17，这里只找它、不重复安装）
#   ② 解压 Android 命令行工具
#   ③ 用 sdkmanager 装 android.jar + build-tools（aapt2/d8/zipalign/apksigner）
#   ④ 真的编一个弹球小游戏，产出一个可安装 APK，证明链路是通的
#   ⑤ 输出一份自检报告（路径、版本、体积）
#
# 为什么不用 root：整套工具都装在 ~ 下；只有"编出来的 APK 放到哪个目录"跟权限有关。
# ============================================================================
set -euo pipefail

SDK="$HOME/android-sdk"
CT="$SDK/cmdline-tools/latest"
BT="$SDK/build-tools/34.0.0"
AJAR="$SDK/platforms/android-34/android.jar"

echo "===== ① 找 JDK（yum 装的那个） ====="
# javac 必须在 PATH 里；JAVA_HOME 由它反推（下载 sdkmanager 依赖 JAVA_HOME）
if ! command -v javac >/dev/null 2>&1; then
  echo "❌ 找不到 javac。请先：yum install -y java-17-openjdk-devel"
  exit 1
fi
export JAVA_HOME=$(dirname $(dirname $(readlink -f "$(command -v javac)")))
export PATH="$JAVA_HOME/bin:$PATH"
echo "JAVA_HOME = $JAVA_HOME"
javac -version

echo "===== ② 解压 Android 命令行工具 ====="
# 支持 zip 放在 ~/android-sdk/cmdline-tools/ 或 /tmp（哪个有就用哪个）
ZIP=""
for cand in "$SDK/cmdline-tools/commandlinetools-linux"*.zip /tmp/cmdline-tools.zip "$PWD/commandlinetools-linux"*.zip; do
  [ -f "$cand" ] && ZIP="$cand" && break
done
if [ -z "$ZIP" ]; then
  echo "❌ 找不到 commandlinetools zip。把它放 ~/android-sdk/cmdline-tools/ 下再跑一次"
  exit 1
fi
echo "zip = $ZIP ($(du -h "$ZIP" | cut -f1))"

if [ ! -x "$CT/bin/sdkmanager" ]; then
  rm -rf /tmp/ct_unzip && mkdir -p /tmp/ct_unzip
  # zip 内部自带一层 cmdline-tools/，解出来再整体挪成 latest
  unzip -q -o "$ZIP" -d /tmp/ct_unzip
  mkdir -p "$SDK/cmdline-tools"
  rm -rf "$CT"
  mv /tmp/ct_unzip/cmdline-tools "$CT"
fi
[ -x "$CT/bin/sdkmanager" ] || { echo "❌ sdkmanager 还是不在 $CT/bin/"; exit 1; }
echo "sdkmanager = $CT/bin/sdkmanager"

echo "===== ③ 装 android.jar + build-tools ====="
# --licenses：Google 的 SDK 许可，全自动 yes
yes | "$CT/bin/sdkmanager" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
# platforms;android-34 → 提供 android.jar（编译期需要的 Android API）
# build-tools;34.0.0    → aapt2(资源/打包) d8(dex) zipalign(对齐) apksigner(签名)
"$CT/bin/sdkmanager" --sdk_root="$SDK" "platforms;android-34" "build-tools;34.0.0" >/dev/null

for f in "$AJAR" "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner"; do
  [ -e "$f" ] || { echo "❌ 缺少 $f"; exit 1; }
done
echo "✅ android.jar $(( $(stat -c%s "$AJAR") / 1024 / 1024 ))MB"
echo "✅ build-tools: $("$BT/aapt2" version 2>&1 | head -1)"

echo "===== ④ 冒烟测试：编译一个弹球小游戏 ====="
W=/tmp/cloudbuild-smoke
rm -rf "$W"; mkdir -p "$W/res/values" "$W/src/com/mutual/game" "$W/out"
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

/** 冒烟测试：一个会弹跳的球 */
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

cd "$W"
mkdir -p out/classes out/dex
# javac：编译成 class（-classpath 指向 android.jar，-source/-target 8 兼容老设备）
javac -nowarn -source 8 -target 8 -classpath "$AJAR" -d out/classes $(find src -name '*.java') 2>&1 | grep -v 'bootstrap class path' || true
# d8：class → classes.dex（Android 的字节码格式）
"$BT/d8" --lib "$AJAR" --min-api 24 --output out/dex $(find out/classes -name '*.class') >/dev/null
# aapt2 compile/link：编译资源、把 manifest+资源+dex 打成一个 APK
"$BT/aapt2" compile -o out/res.zip res/values/strings.xml
"$BT/aapt2" link -o out/app.apk -I "$AJAR" --manifest AndroidManifest.xml out/res.zip --min-sdk-version 24 --target-sdk-version 34
# classes.dex 必须以"根目录"的形式进 APK，所以进 dex 目录里压
(cd out/dex && zip -q ../app.apk classes.dex)
# zipalign：4 字节对齐（否则部分 ROM 装不上）
"$BT/zipalign" -f 4 out/app.apk out/app-aligned.apk
# apksigner：签名（第一次自动生成一个本地 keystore，之后复用）
KS="$HOME/cloudbuild.keystore"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias cb \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Mutual Cloud Build" >/dev/null 2>&1
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --out out/final.apk out/app-aligned.apk

echo "===== ⑤ 自检报告 ====="
"$BT/aapt2" dump badging out/final.apk | head -2
echo "APK: $W/out/final.apk ($(du -h out/final.apk | cut -f1))"
cp out/final.apk "$HOME/cloudbuild-sample.apk"
echo "已复制到: $HOME/cloudbuild-sample.apk"
echo "然后把下面这行写进 ~/.cloudbuild.env，服务端编译接口会用："
echo "  export ANDROID_SDK=$SDK"
echo "  export JAVA_HOME=$JAVA_HOME"
