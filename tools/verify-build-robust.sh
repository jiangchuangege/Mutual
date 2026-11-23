#!/bin/bash
# 部署新版 buildApk.mjs 并做两次真实编译验证：
#  A) 类名不是 MainActivity 的打砖块式游戏（应该成功）
#  B) 故意写错的代码（应该只回传一行人能看懂的错误）
set -euo pipefail
cp -f /tmp/buildApk.mjs /opt/twospace/server/buildApk.mjs
node --check /opt/twospace/server/buildApk.mjs && echo "语法 OK"
pkill -f 'server/sync-server.mjs' || true
sleep 6

cat > /tmp/Breakout.java <<'JAVA'
package com.mygame;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;

public class BreakoutGame extends Activity {
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    setContentView(new Board(this));
  }

  static class Board extends View {
    final Paint p = new Paint();
    float px = 200, pw = 160, bx = 200, by = 300, vx = 4, vy = -6;
    Board(Context c) {
      super(c);
      p.setAntiAlias(true);
    }

    @Override protected void onDraw(Canvas cv) {
      cv.drawColor(Color.rgb(14, 12, 11));
      p.setColor(Color.rgb(232, 131, 107));
      cv.drawRect(px - pw / 2, getHeight() - 90, px + pw / 2, getHeight() - 60, p);
      bx += vx;
      by += vy;
      if (bx < 30 || bx > getWidth() - 30) vx = -vx;
      if (by < 30) vy = -vy;
      if (by > getHeight() - 110 && Math.abs(bx - px) < pw / 2 && vy > 0) vy = -Math.abs(vy);
      if (by > getHeight()) {
        bx = getWidth() / 2f;
        by = 300;
        vx = 4;
        vy = -6;
      }
      p.setColor(Color.rgb(126, 200, 169));
      cv.drawCircle(bx, by, 22, p);
      invalidate();
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
      if (e.getAction() == MotionEvent.ACTION_MOVE || e.getAction() == MotionEvent.ACTION_DOWN) {
        px = e.getX();
        invalidate();
      }
      return true;
    }
  }
}
JAVA

cat > /tmp/Bad.java <<'JAVA'
package com.mygame;

import android.app.Activity;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

public class BadGame extends AppCompatActivity {
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    setContentView(R.layout.activity_main);
  }
}
JAVA

cd /opt/twospace && node --input-type=module -e '
import { buildApk } from "/opt/twospace/server/buildApk.mjs";
import fs from "node:fs";

const a = buildApk({ title: "打砖块", files: [{ name: "BreakoutGame.java", content: fs.readFileSync("/tmp/Breakout.java", "utf8") }] });
console.log("A 正常游戏 →", a.ok ? `✅ 成功 ${Math.round(a.bytes / 1024)}KB` : `❌ ${a.error}`);
if (a.ok) fs.copyFileSync(a.apk, "/opt/twospace/cloudbuild-breakout.apk");

const b = buildApk({ title: "坏代码", files: [{ name: "BadGame.java", content: fs.readFileSync("/tmp/Bad.java", "utf8") }] });
console.log("B 坏代码 →", b.ok ? "❌ 不应该成功" : `✅ 正确拒绝：${b.error}`);
'
systemctl is-active twospace.service
curl -s -m 5 http://127.0.0.1:8787/health; echo
