#!/bin/bash
# 部署"缺 return 也自动补"的 buildApk.mjs，并用被截断在 case 里的代码验证
set -euo pipefail
cp -f /tmp/buildApk.mjs /opt/twospace/server/buildApk.mjs
node --check /opt/twospace/server/buildApk.mjs && echo "语法 OK"
pkill -f 'server/sync-server.mjs' || true
sleep 6

# 模拟真实残局：代码在 switch 的 case 之后被截断（缺 return true; 和两个 }）
cat > /tmp/CutCase.java <<'JAVA'
package com.mygame;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;

public class CutGame extends Activity {
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    setContentView(new Board(this));
  }

  static class Board extends View {
    final Paint p = new Paint();
    float x = 100, y = 100, vx = 5, vy = 4;
    Board(Context c) { super(c); p.setAntiAlias(true); }

    @Override protected void onDraw(Canvas cv) {
      cv.drawColor(Color.rgb(14, 12, 11));
      p.setColor(Color.rgb(232, 131, 107));
      x += vx; y += vy;
      if (x < 40 || x > getWidth() - 40) vx = -vx;
      if (y < 40 || y > getHeight() - 40) vy = -vy;
      cv.drawCircle(x, y, 36, p);
      invalidate();
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
      switch (e.getAction()) {
        case MotionEvent.ACTION_DOWN:
          vx = -vx;
          break;
        case MotionEvent.ACTION_MOVE:
          x = e.getX();
          break;
        case MotionEvent.ACTION_UP:
JAVA

cd /opt/twospace && node --input-type=module -e '
import { buildApk } from "/opt/twospace/server/buildApk.mjs";
import fs from "node:fs";
const raw = fs.readFileSync("/tmp/CutCase.java", "utf8");
const r = buildApk({ title: "截断在 case 里", files: [{ name: "CutGame.java", content: raw }] });
console.log("编译 →", r.ok ? `✅ 成功 ${Math.round(r.bytes / 1024)}KB 补全=${JSON.stringify(r.repaired)}` : `❌ ${r.error}`);
if (r.ok) fs.copyFileSync(r.apk, "/opt/twospace/cloudbuild-cutcase.apk");
'
systemctl is-active twospace.service
curl -s -m 5 http://127.0.0.1:8787/health; echo
