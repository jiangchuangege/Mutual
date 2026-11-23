#!/bin/bash
# 部署带"括号自动补全"的 buildApk.mjs，并用一段被截断的代码验证
set -euo pipefail
cp -f /tmp/buildApk.mjs /opt/twospace/server/buildApk.mjs
node --check /opt/twospace/server/buildApk.mjs && echo "语法 OK"
pkill -f 'server/sync-server.mjs' || true
sleep 6

# 故意截断：少了最后两个 }（模拟 AI 回答被聊天框截断）
cat > /tmp/Truncated.java <<'JAVA'
package com.mygame;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.View;

public class TruncGame extends Activity {
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
JAVA

cd /opt/twospace && node --input-type=module -e '
import { buildApk, repairJavaSource } from "/opt/twospace/server/buildApk.mjs";
import fs from "node:fs";

const raw = fs.readFileSync("/tmp/Truncated.java", "utf8");
const fixed = repairJavaSource(raw);
console.log("修复器：补了", fixed.addedBraces, "个 }，" , fixed.addedParens, "个 )");

const r = buildApk({ title: "截断测试", files: [{ name: "TruncGame.java", content: raw }] });
console.log("编译截断代码 →", r.ok ? `✅ 成功 ${Math.round(r.bytes / 1024)}KB（自动补全=${JSON.stringify(r.repaired)}）` : `❌ ${r.error}`);
'
systemctl is-active twospace.service
curl -s -m 5 http://127.0.0.1:8787/health; echo
