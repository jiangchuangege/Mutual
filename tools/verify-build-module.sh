#!/bin/bash
# 在服务器上直接验证云编译模块（不经过 HTTP），确认 Java → APK 能编出来
set -euo pipefail
cd /opt/twospace

cat > /tmp/TestGame.java <<'JAVA'
package com.mutual.generated;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.View;

/** HTTP 接口用的测试游戏：点一下屏幕，方块变颜色 */
public class MainActivity extends Activity {
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    setContentView(new Tap(this));
  }

  static class Tap extends View {
    int hits = 0;
    final Paint bg = new Paint();
    final Paint box = new Paint();
    Tap(Context c) {
      super(c);
      bg.setColor(Color.rgb(14, 12, 11));
      box.setColor(Color.rgb(126, 200, 169));
      box.setAntiAlias(true);
    }
    @Override protected void onDraw(Canvas cv) {
      cv.drawRect(0, 0, getWidth(), getHeight(), bg);
      float s = Math.min(getWidth(), getHeight()) / 3f;
      cv.drawCircle(getWidth() / 2f, getHeight() / 2f, s, box);
      cv.drawText("taps: " + hits, 24, 48, bg);
      invalidate();
    }
    @Override public boolean onTouchEvent(android.view.MotionEvent e) {
      if (e.getAction() == android.view.MotionEvent.ACTION_DOWN) {
        hits += 1;
        box.setColor(Color.rgb(232 - (hits * 13) % 120, 131, 107 + (hits * 7) % 120));
        invalidate();
      }
      return true;
    }
  }
}
JAVA

node --input-type=module -e '
import { buildApk, buildEnvStatus } from "/opt/twospace/server/buildApk.mjs";
import fs from "node:fs";
console.log("env:", JSON.stringify(buildEnvStatus()));
const code = fs.readFileSync("/tmp/TestGame.java", "utf8");
const r = buildApk({ title: "云编译测试-点方块", files: [{ name: "MainActivity.java", content: code }] });
if (!r.ok) {
  console.log("❌ 编译失败:", r.error);
  process.exit(1);
}
console.log("✅ 编译成功:", r.apk, Math.round(r.bytes / 1024) + "KB");
fs.copyFileSync(r.apk, "/opt/twospace/cloudbuild-http-sample.apk");
console.log("已复制到 /opt/twospace/cloudbuild-http-sample.apk");
'
