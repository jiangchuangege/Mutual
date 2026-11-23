const fs = require('node:fs');
const p = 'C:/ts/server/watchHub.mjs';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 1) 引入 stream，透传改成 pipe + 错误处理（之前上游断开会把整个进程带崩）
sub("import fs from 'node:fs';\nimport path from 'node:path';",
    "import fs from 'node:fs';\nimport path from 'node:path';\nimport { Readable } from 'node:stream';", '引入 stream');

sub(`    // 其它（JSON / mp4 / ts 分片）：直接透传，支持 Range
    res.writeHead(upstream.status, {
      ...CORS,
      'content-type': ctype,
      'cache-control': 'no-store',
      ...(upstream.headers.get('content-length')
        ? { 'content-length': upstream.headers.get('content-length') }
        : {}),
      ...(upstream.headers.get('content-range')
        ? { 'content-range': upstream.headers.get('content-range') }
        : {}),
      'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
    });
    if (!upstream.body) {
      res.end();
      return true;
    }
    let sent = 0;
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sent += value.length;
      if (sent > LIMITS.relayMaxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        break;
      }
      res.write(value);
    }
    res.end();
    return true;
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      error: '上游请求失败：' + (err instanceof Error ? err.message : String(err)),
    });
    return true;
  } finally {
    clearTimeout(timer);
  }`,
`    // 其它（JSON / mp4 / ts 分片）：直接透传，支持 Range
    res.writeHead(upstream.status, {
      ...CORS,
      'content-type': ctype,
      'cache-control': 'no-store',
      ...(upstream.headers.get('content-length')
        ? { 'content-length': upstream.headers.get('content-length') }
        : {}),
      ...(upstream.headers.get('content-range')
        ? { 'content-range': upstream.headers.get('content-range') }
        : {}),
      'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
    });
    if (!upstream.body) {
      res.end();
      return true;
    }
    // 用 pipe 透传：上游断开、客户端断开、超限都不会把进程带崩
    const stream = Readable.fromWeb(upstream.body);
    let sent = 0;
    stream.on('data', (chunk) => {
      sent += chunk.length;
      if (sent > LIMITS.relayMaxBytes) {
        stream.destroy();
      }
    });
    stream.on('error', () => {
      try {
        res.destroy();
      } catch {
        // ignore
      }
    });
    res.on('close', () => {
      try {
        stream.destroy();
      } catch {
        // ignore
      }
      controller.abort();
    });
    stream.pipe(res);
    return true;
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 502, {
        ok: false,
        error: '上游请求失败：' + (err instanceof Error ? err.message : String(err)),
      });
    } else {
      try {
        res.destroy();
      } catch {
        // ignore
      }
    }
    return true;
  } finally {
    clearTimeout(timer);
  }`, 'pipe 透传');

// 2) 保险丝：任何漏网的 rejection 不许杀进程
if (!t.includes('process.on(')) {
  t += `
/* 保险丝：中转过程里任何漏网的 promise 异常都不许把服务带崩 */
process.on('unhandledRejection', () => {});
`;
  ok.push('保险丝');
}

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
