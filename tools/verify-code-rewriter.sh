#!/bin/bash
# 验证"常见错误自动纠正"：模拟 AI 的贪吃蛇写法（void draw(Canvas)）
set -euo pipefail
cd /opt/twospace || exit 1
cat > /tmp/Snake.java <<'JAVA'
package com.mygame;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;

public class SnakeGame extends Activity {
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    setContentView(new SnakeView(this));
  }

  static class SnakeView extends View {
    final Paint p = new Paint();
    float x = 100, y = 100, dx = 12, dy = 0, r = 20;
    SnakeView(Context c) { super(c); p.setAntiAlias(true); }

    // AI 常写成 draw(Canvas)，应该是 onDraw(Canvas)
    @Override protected void draw(Canvas canvas) {
      super.draw(canvas);
      canvas.drawColor(Color.rgb(14, 12, 11));
      p.setColor(Color.rgb(126, 200, 169));
      x += dx; y += dy;
      if (x < r || x > getWidth() - r) dx = -dx;
      if (y < r || y > getHeight() - r) dy = -dy;
      canvas.drawRect(x - r, y - r, x + r, y + r, p);
      invalidate();
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
      if (e.getAction() == MotionEvent.ACTION_DOWN) {
        float t = dx;
        dx = -dy;
        dy = t;
      }
      return true;
    }
  }
}
JAVA

node --input-type=module -e '
import { buildApk, rewriteCommonMistakes } from "/opt/twospace/server/buildApk.mjs";
import fs from "node:fs";
const raw = fs.readFileSync("/tmp/Snake.java", "utf8");
const fixed = rewriteCommonMistakes(raw);
console.log("纠正项：", JSON.stringify(fixed.notes));
const r = buildApk({ title: "贪吃蛇", files: [{ name: "SnakeGame.java", content: raw }] });
console.log("编译 →", r.ok ? `✅ 成功 ${Math.round(r.bytes / 1024)}KB fixes=${JSON.stringify(r.fixes)}` : `❌ ${r.error}`);
if (r.ok) fs.copyFileSync(r.apk, "/opt/twospace/cloudbuild-snake.apk");
'
systemctl is-active twospace.service
curl -s -m 5 http://127.0.0.1:8787/health; echo
