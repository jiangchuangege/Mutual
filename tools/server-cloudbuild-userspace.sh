#!/bin/bash
# 云编译工具链（无需 root）：便携 JDK + Android SDK 全放 ~/，并真的编出一个可安装 APK
set -euo pipefail
HOME_DIR="$HOME"
JDK_DIR="$HOME_DIR/jdk17"
SDK="$HOME_DIR/android-sdk"
BT="$SDK/build-tools/34.0.0"
AJAR="$SDK/platforms/android-34/android.jar"

echo "== 0) 环境检查 =="
uname -m
df -h "$HOME_DIR" | tail -1
for c in tar curl python3; do command -v $c >/dev/null && echo "有 $c" || echo "缺 $c"; done
command -v unzip >/dev/null && echo "有 unzip" || echo "缺 unzip（将用 python3 解压）"

unzip_to() { # $1=zip $2=dir
  if command -v unzip >/dev/null; then unzip -q -o "$1" -d "$2"; else python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$1" "$2"; fi
}

echo "== 1) 便携 JDK 17 =="
if [ ! -x "$JDK_DIR/bin/javac" ]; then
  ARCH=$(uname -m)
  if [ "$ARCH" = "aarch64" ]; then JDK_URL="https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.13_11.tar.gz";
  else JDK_URL="https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_linux_hotspot_17.0.13_11.tar.gz"; fi
  cd /tmp
  [ -f jdk17.tar.gz ] || curl -sSL "$JDK_URL" -o jdk17.tar.gz
  mkdir -p /tmp/jdkx && tar -xzf jdk17.tar.gz -C /tmp/jdkx
  rm -rf "$JDK_DIR" && mv /tmp/jdkx/jdk-17* "$JDK_DIR"
fi
export JAVA_HOME="$JDK_DIR"; export PATH="$JAVA_HOME/bin:$PATH"
echo "javac: $(javac -version 2>&1)"

echo "== 2) Android cmdline-tools + build-tools（用户目录，无需 root） =="
if [ ! -x "$BT/aapt2" ]; then
  cd /tmp
  [ -f cmdline-tools.zip ] || curl -sSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o cmdline-tools.zip
  rm -rf /tmp/cmdline-tools && mkdir -p /tmp/cmdline-tools && unzip_to cmdline-tools.zip /tmp/cmdline-tools
  mkdir -p "$SDK/cmdline-tools" && rm -rf "$SDK/cmdline-tools/latest"
  mv /tmp/cmdline-tools/cmdline-tools "$SDK/cmdline-tools/latest"
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
  "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" "platforms;android-34" "build-tools;34.0.0" >/dev/null
fi
echo "aapt2: $("$BT/aapt2" version 2>&1 | head -1)"
echo "android.jar: $(stat -c%s "$AJAR" 2>/dev/null || echo 0) bytes"

echo "== 3) 写一个最小可玩 Java 游戏（弹球） =="
W=/tmp/apkgame
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

echo "== 4) 编译打包签名 =="
cd "$W"
javac -nowarn -source 8 -target 8 -classpath "$AJAR" -d out/classes $(find src -name '*.java') 2>&1 | grep -v 'bootstrap class path' || true
"$BT/d8" --lib "$AJAR" --min-api 24 --output out/dex $(find out/classes -name '*.class') >/dev/null
"$BT/aapt2" compile -o out/res.zip res/values/strings.xml
"$BT/aapt2" link -o out/app.apk -I "$AJAR" --manifest AndroidManifest.xml out/res.zip --min-sdk-version 24 --target-sdk-version 34
(cd out && zip -q app.apk classes.dex 2>/dev/null || python3 -c "import zipfile;z=zipfile.ZipFile('app.apk','a');z.write('classes.dex','classes.dex');z.close()")
"$BT/zipalign" -f 4 out/app.apk out/app-aligned.apk
KS="$HOME_DIR/cloudbuild.keystore"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias cb -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Mutual Cloud Build" >/dev/null 2>&1
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --out out/final.apk out/app-aligned.apk
echo "== 5) 结果 =="
"$BT/aapt2" dump badging out/final.apk | head -2
ls -la out/final.apk
cp out/final.apk /opt/twospace/cloudbuild-sample.apk 2>/dev/null || cp out/final.apk "$HOME_DIR/cloudbuild-sample.apk"
echo "✅ 云编译打通"
