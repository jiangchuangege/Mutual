#!/bin/bash
# 验证"draw + onDraw 同时存在"时能自动删掉重复的 draw
set -euo pipefail
cat > /tmp/Dup2.java <<'JAVA'
package com.mygame;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.View;

public class SnakeGame extends Activity {
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    setContentView(new SnakeView(this));
  }

  static class SnakeView extends View {
    final Paint p = new Paint();
    float x = 100, y = 100, dx = 8, dy = 0, r = 20;
    SnakeView(Context c) { super(c); p.setAntiAlias(true); }

    @Override protected void onDraw(Canvas c) {
      c.drawColor(Color.rgb(14, 12, 11));
      p.setColor(Color.rgb(126, 200, 169));
      x += dx; y += dy;
      if (x < r || x > getWidth() - r) dx = -dx;
      if (y < r || y > getHeight() - r) dy = -dy;
      c.drawRect(x - r, y - r, x + r, y + r, p);
      invalidate();
    }

    @Override protected void draw(Canvas c) {
      super.draw(c);
      x += 1;
    }
  }
}
JAVA

cd /opt/twospace && node --input-type=module -e '
import { buildApk, rewriteCommonMistakes } from "/opt/twospace/server/buildApk.mjs";
import fs from "node:fs";
const raw = fs.readFileSync("/tmp/Dup2.java", "utf8");
console.log("纠正项：", JSON.stringify(rewriteCommonMistakes(raw).notes));
const r = buildApk({ title: "重复方法", files: [{ name: "SnakeGame.java", content: raw }] });
console.log(r.ok ? `✅ 成功 ${Math.round(r.bytes / 1024)}KB fixes=${JSON.stringify(r.fixes)}` : `❌ ${r.error}`);
'
systemctl is-active twospace.service
curl -s -m 5 http://127.0.0.1:8787/health; echo
