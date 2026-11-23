/**
 * 云编译：Java 源码 → 可安装 APK。
 *
 * 流水线（都是 Android 官方的工具，服务器上已装好）：
 *   javac  → class                    编译 Java
 *   d8     → classes.dex              转 Android 字节码
 *   aapt2  → APK（资源 + manifest）    打包
 *   zip    → 把 dex 塞进 APK 根目录
 *   zipalign → 4 字节对齐（不对齐有的 ROM 装不上）
 *   apksigner → 签名（自签，同一个 keystore 长期复用，升级不用卸载重装）
 *
 * 约定：用户/ AI 只需给一个类名为 MainActivity 的 Java 文件（可多个文件、各自带 package），
 * 其余（Manifest、应用名、图标位、启动 Activity）这里自动生成。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SDK = process.env.ANDROID_SDK || path.join(os.homedir(), 'android-sdk');
const BT = path.join(SDK, 'build-tools/34.0.0');
const AJAR = path.join(SDK, 'platforms/android-34/android.jar');
const KS = process.env.CLOUDBUILD_KEYSTORE || path.join(os.homedir(), 'cloudbuild.keystore');
const PKG = 'com.mutual.generated';

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, ...opts });
}

function javaHome() {
  const fromEnv = process.env.JAVA_HOME;
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'bin/javac'))) return fromEnv;
  try {
    const p = sh('readlink', ['-f', sh('which', ['javac']).trim()]).trim();
    return path.dirname(path.dirname(p));
  } catch {
    return null;
  }
}

/** 环境自检：给 App 侧一个明确的"能不能编译"的答案 */
export function buildEnvStatus() {
  const jh = javaHome();
  const missing = [];
  if (!jh) missing.push('JDK（javac）');
  if (!fs.existsSync(AJAR)) missing.push('platforms;android-34');
  for (const t of ['aapt2', 'd8', 'zipalign', 'apksigner']) {
    if (!fs.existsSync(path.join(BT, t))) missing.push(`build-tools/${t}`);
  }
  return { ok: missing.length === 0, javaHome: jh, sdk: SDK, missing };
}

/**
 * @param {{ title?: string, files: Array<{ name: string, content: string }> }} input
 * @returns {{ ok: true, apk: string, bytes: number } | { ok: false, error: string }}
 */
/**
 * 修被截断的 Java 源码。
 *
 * 常见情况：AI 的长回答被聊天框截断，粘贴过来就是"少了最后几个 }"，
 * javac 报 `reached end of file while parsing`。这里做最小修复：
 * 扫描（跳过字符串/字符/注释）统计未闭合的 { 和 (，在末尾补上对应的 } 和 )。
 * 只会补括号，绝不改动代码语义；补了几个会回报给用户。
 */
/**
 * 自动纠正 AI 写 Android 时的几个高频错误（只改确定的、不改语义）：
 *  1. 在 View 子类里重写 `draw(Canvas)` —— 必须叫 `onDraw(Canvas)`，
 *     否则 javac 报 "cannot override draw(Canvas) in View"；
 *  2. `super.draw(canvas)` 出现在 onDraw 里时改成 `super.onDraw(canvas)`；
 *  3. `setContentView(R.layout.xxx)` 没有布局文件 → 直接注掉并提示（避免整篇编不过）。
 */
/** 删除源码里某个方法（按大括号配对），连它前面的 @Override 一起删 */
export function removeMethodBySignature(src, signatureRe) {
  const s = String(src ?? '');
  const m = signatureRe.exec(s);
  if (!m) return s;
  // 往前找到 @Override 行（如果紧邻）
  let start = m.index;
  const before = s.slice(0, start);
  const lines = before.split('\n');
  if (lines.length >= 1 && /^\s*@Override\s*$/.test(lines[lines.length - 1] ?? '')) {
    start -= lines[lines.length - 1].length + 1;
  }
  // 从签名起找到方法体的第一个 {
  let i = m.index;
  while (i < s.length && s[i] !== '{') i += 1;
  if (i >= s.length) return s;
  let depth = 0;
  let end = i;
  for (; end < s.length; end += 1) {
    if (s[end] === '{') depth += 1;
    else if (s[end] === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return s.slice(0, start) + '/* 云编译：删除与 onDraw 冲突的重复方法 */\n' + s.slice(end);
}

export function rewriteCommonMistakes(src) {
  let out = String(src ?? '');
  const notes = [];
  const hasDraw = /\bvoid\s+draw\s*\(\s*Canvas\b/.test(out);
  const hasOnDraw = /\bvoid\s+onDraw\s*\(\s*Canvas\b/.test(out);
  if (hasDraw && hasOnDraw) {
    // 两个都有 → 把多余的 draw 改名并去掉 @Override。
    // 用改名而不是删除：不碰大括号配对，绝不会切坏别的代码。
    out = out.replace(
      /@Override\s*((?:protected|public|private)\s+)?void\s+draw\s*\(\s*Canvas/g,
      (_m, mod) => `${mod ?? ''}void drawUnusedByCloudBuild(Canvas`
    );
    out = out.replace(
      /((?:protected|public|private)\s+)?void\s+draw\s*\(\s*Canvas/g,
      (_m, mod) => `${mod ?? ''}void drawUnusedByCloudBuild(Canvas`
    );
    notes.push('多余的 draw(Canvas) 已改名（保留你写的 onDraw）');
  } else if (hasDraw) {
    out = out.replace(/\bvoid\s+draw\s*\(\s*Canvas\b/g, 'void onDraw(Canvas');
    notes.push('draw(Canvas) → onDraw(Canvas)');
  }
  if (/\bsuper\.draw\s*\(/.test(out) && /void\s+onDraw\s*\(/.test(out)) {
    out = out.replace(/\bsuper\.draw\s*\(/g, 'super.onDraw(');
    notes.push('super.draw → super.onDraw');
  }
  if (/setContentView\s*\(\s*R\.layout\./.test(out)) {
    out = out.replace(
      /setContentView\s*\(\s*R\.layout\.[\w.]+\s*\)\s*;/g,
      '/* setContentView(R.layout.*) 已移除：云编译没有 XML 布局，请用代码创建 View */'
    );
    notes.push('移除 R.layout 引用');
  }
  return { code: out, notes };
}

export function repairJavaSource(src) {
  const s = String(src ?? '');
  let braces = 0;
  let parens = 0;
  let inStr = false;
  let inChar = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const n = s[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (inChar) {
      if (c === '\\') i += 1;
      else if (c === "'") inChar = false;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "'") {
      inChar = true;
      continue;
    }
    if (c === '{') braces += 1;
    else if (c === '}') braces -= 1;
    else if (c === '(') parens += 1;
    else if (c === ')') parens -= 1;
  }
  const addClose = Math.max(0, braces);
  const addParen = Math.max(0, parens);
  if (addClose === 0 && addParen === 0) return { code: s, addedBraces: 0, addedParens: 0 };
  const filler = ')'.repeat(addParen) + '}'.repeat(addClose);
  return { code: `${s.replace(/\s*$/, '')}\n${filler}\n`, addedBraces: addClose, addedParens: addParen };
}

/**
 * 被截断的代码还有一种残局：方法闭合了但少了 return。
 * javac 会报 `missing return statement`。
 * 这里把候选返回值塞到最后一个 } 之前，交给编译结果自己判断对不对。
 */
/** 在"从末尾数第 n 个 }"之前插入 return 语句（用于修复被截断的方法体） */
function insertReturnBefore(src, n, value) {
  const s = String(src ?? '');
  let idx = -1;
  let count = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    if (s[i] === '}') {
      count += 1;
      if (count === n) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return s;
  return `${s.slice(0, idx)}return ${value};\n${s.slice(idx)}`;
}

const RETURN_CANDIDATES = ['true', 'false', '0', 'null', '""'];

function withReturn(src, value) {
  const s = String(src ?? '');
  const i = s.lastIndexOf('}');
  if (i < 0) return s;
  return `${s.slice(0, i)}return ${value};\n${s.slice(i)}`;
}

export function buildApk(input) {
  const minSdk = Math.max(21, Math.min(34, Number(input?.minSdk) || 24));
  const env = buildEnvStatus();
  if (!env.ok) return { ok: false, error: `服务器编译环境不完整，缺：${env.missing.join('、')}` };

  const files = Array.isArray(input?.files) ? input.files : [];
  const javaFiles = files.filter((f) => /\.java$/i.test(f?.name ?? '') && typeof f.content === 'string');
  // 除 java 之外的都当资源：路径里带 assets/ 或任意文件名 → 打进 APK 的 assets/
  const assetFiles = files.filter(
    (f) => typeof f?.content === 'string' && !/\.java$/i.test(f?.name ?? ''),
  );
  if (javaFiles.length === 0) return { ok: false, error: '没有收到 .java 文件' };
  const total = javaFiles.reduce((n, f) => n + f.content.length, 0);
  // 软上限：只是防呆（一次 JSON 请求里塞太多会很慢）。真要更大就走分片/资产分开传。
  if (total > 8_000_000) return { ok: false, error: '源码超过 8MB，请把资源（图片/音频）作为 assets 单独传' };
  // 自动识别：包名 + 入口类（优先"继承 Activity 的那个类"，否则取第一个 public class）
  const pickEntry = () => {
    for (const f of javaFiles) {
      const cls = /(?:public\s+)?(?:final\s+)?class\s+(\w+)\s+extends\s+[\w.]*(?:Activity)\b/.exec(f.content);
      if (cls) return { name: cls[1], content: f.content };
    }
    for (const f of javaFiles) {
      const cls = /public\s+(?:final\s+)?class\s+(\w+)/.exec(f.content);
      if (cls) return { name: cls[1], content: f.content };
    }
    return null;
  };
  const entry = pickEntry();
  if (!entry) return { ok: false, error: '源码里找不到 class（要有 public class Xxx extends Activity）' };
  const pkgMatch = /^\s*package\s+([\w.]+)\s*;/m.exec(entry.content);
  const manifestPkg = pkgMatch ? pkgMatch[1] : PKG;

  const title = String(input?.title ?? '').slice(0, 24).replace(/["<>&]/g, '') || 'Mutual 小游戏';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
  try {
    const res = path.join(work, 'res/values');
    fs.mkdirSync(res, { recursive: true });
    fs.mkdirSync(path.join(work, 'src'), { recursive: true });
    fs.mkdirSync(path.join(work, 'out/classes'), { recursive: true });
    fs.mkdirSync(path.join(work, 'out/dex'), { recursive: true });
    // 资源目录：content 为 base64 的二进制（图片/音频），或纯文本
    const assetsDir = path.join(work, 'assets');
    if (assetFiles.length > 0) fs.mkdirSync(assetsDir, { recursive: true });
    for (const a of assetFiles) {
      const rel = String(a.name).replace(/^assets\//, '').replace(/[^\w./-]/g, '');
      if (!rel) continue;
      const dest = path.join(assetsDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const b64 = String(a.content).startsWith('base64:') ? String(a.content).slice(7) : null;
      if (b64) fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
      else fs.writeFileSync(dest, a.content);
    }

    fs.writeFileSync(path.join(res, 'strings.xml'), `<resources><string name="app_name">${title}</string></resources>`);
    fs.writeFileSync(
      path.join(work, 'AndroidManifest.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
  package="${manifestPkg}" android:versionCode="1" android:versionName="1.0">
  <uses-sdk android:minSdkVersion="${minSdk}" android:targetSdkVersion="34"/>
  <application android:label="@string/app_name">
    <activity android:name=".${entry.name}" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
  </application>
</manifest>`
    );

    // 写源码前先修被截断的括号（AI 长回答常被截断）
    let repairedBraces = 0;
    let repairedParens = 0;
    const fixNotes = [];
    const repaired = javaFiles.map((f) => {
      const fixed = rewriteCommonMistakes(f.content);
      if (fixed.notes.length) fixNotes.push(...fixed.notes);
      const r = repairJavaSource(fixed.code);
      repairedBraces += r.addedBraces;
      repairedParens += r.addedParens;
      return { ...f, content: r.code };
    });
    javaFiles.length = 0;
    javaFiles.push(...repaired);

    // 写源码：文件名叫什么不重要，但 package 要和路径对上
    for (const f of javaFiles) {
      const m = /^\s*package\s+([\w.]+)\s*;/m.exec(f.content);
      const dir = m ? path.join(work, 'src', ...m[1].split('.')) : path.join(work, 'src');
      fs.mkdirSync(dir, { recursive: true });
      // 文件名必须等于 public class 名，否则 javac 报
      // "class X is public, should be declared in a file named X.java"
      const own = /public\s+(?:final\s+)?class\s+(\w+)/.exec(f.content);
      const base = own ? `${own[1]}.java` : (f.name.split('/').pop() || 'MainActivity.java').replace(/[^\w.-]/g, '');
      fs.writeFileSync(path.join(dir, base), f.content);
    }

    const jh = env.javaHome;
    const javaFilesOnDisk = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.java')) javaFilesOnDisk.push(p);
      }
    };
    walk(path.join(work, 'src'));

    const javacBase = ['-nowarn', '-classpath', AJAR, '-d', path.join(work, 'out/classes'), ...javaFilesOnDisk];
    const attempts = [
      ['--release', '8', ...javacBase],
      ['-source', '8', '-target', '8', ...javacBase],
      javacBase,
    ];
    let compiled = false;
    let lastErr = '';
    for (const args of attempts) {
      try {
        sh(path.join(jh, 'bin/javac'), args);
        compiled = true;
        break;
      } catch (e) {
        lastErr = (e && typeof e === 'object' && 'stderr' in e ? String(e.stderr) : '') || String(e);
        // 只有"版本参数不支持"才继续换；真正的语法错误立刻停
        if (!/release version|source release|target release|invalid target/i.test(lastErr)) break;
      }
    }
    // 补 return 再试：把候选返回值插到"从末尾数第 1~4 个 }"之前，逐个试编译。
    // 这样不管是缺在方法里、还是缺在 switch 里，都能找到那个合法的插入点。
    if (!compiled && /missing return statement|illegal start of type|not a statement/i.test(lastErr)) {
      const originals = javaFilesOnDisk.map((f) => fs.readFileSync(f, 'utf8'));
      const putBack = () => javaFilesOnDisk.forEach((f, i) => fs.writeFileSync(f, originals[i]));
      let ok = false;
      for (let fromEnd = 1; fromEnd <= 4 && !ok; fromEnd += 1) {
        for (const cand of RETURN_CANDIDATES) {
          javaFilesOnDisk.forEach((f, i) => fs.writeFileSync(f, insertReturnBefore(originals[i], fromEnd, cand)));
          try {
            sh(path.join(jh, 'bin/javac'), [
              '-nowarn',
              '-classpath', AJAR,
              '-d', path.join(work, 'out/classes'),
              ...javaFilesOnDisk,
            ]);
            ok = true;
            compiled = true;
            repairedBraces += 1;
            break;
          } catch (e2) {
            lastErr = (e2 && typeof e2 === 'object' && 'stderr' in e2 ? String(e2.stderr) : '') || String(e2);
          }
        }
      }
      if (!ok) putBack();
    }

    if (!compiled) {
      const firstError = lastErr.split('\n').find((l) => l.includes('error:')) || lastErr.split('\n')[0] || '未知错误';
      return { ok: false, error: `Java 编译失败：${firstError.trim().slice(0, 220)}` };
    }
    const classes = [];
    const walkCls = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walkCls(p);
        else if (e.name.endsWith('.class')) classes.push(p);
      }
    };
    walkCls(path.join(work, 'out/classes'));

    sh(path.join(BT, 'd8'), ['--lib', AJAR, '--min-api', String(minSdk), '--output', path.join(work, 'out/dex'), ...classes]);
    sh(path.join(BT, 'aapt2'), ['compile', '-o', path.join(work, 'out/res.zip'), path.join(res, 'strings.xml')]);
    sh(path.join(BT, 'aapt2'), [
      'link', '-o', path.join(work, 'out/app.apk'), '-I', AJAR,
      '--manifest', path.join(work, 'AndroidManifest.xml'), path.join(work, 'out/res.zip'),
      ...(assetFiles.length > 0 ? ['-A', path.join(work, 'assets')] : []),
      '--min-sdk-version', String(minSdk), '--target-sdk-version', '34',
    ]);
    sh('zip', ['-q', path.join(work, 'out/app.apk'), 'classes.dex'], { cwd: path.join(work, 'out/dex') });
    sh(path.join(BT, 'zipalign'), ['-f', '4', path.join(work, 'out/app.apk'), path.join(work, 'out/aligned.apk')]);
    if (!fs.existsSync(KS)) {
      sh(path.join(jh, 'bin/keytool'), [
        '-genkeypair', '-keystore', KS, '-storepass', 'android', '-keypass', 'android',
        '-alias', 'cb', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
        '-dname', 'CN=Mutual Cloud Build',
      ]);
    }
    const outApk = path.join(work, 'out/final.apk');
    sh(path.join(BT, 'apksigner'), [
      'sign', '--ks', KS, '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
      '--out', outApk, path.join(work, 'out/aligned.apk'),
    ]);
    const bytes = fs.statSync(outApk).size;
    return {
      ok: true,
      apk: outApk,
      bytes,
      title,
      repaired: repairedBraces + repairedParens > 0 ? { braces: repairedBraces, parens: repairedParens } : null,
      fixes: fixNotes.length > 0 ? [...new Set(fixNotes)] : null,
    };
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : '';
    const keyLine = stderr.split('\n').find((l) => l.includes('error:')) || stderr.split('\n')[0] || '';
    const msg = keyLine.trim() || (err instanceof Error ? err.message : String(err));
    return { ok: false, error: `编译失败：${msg.slice(0, 220)}` };
  }
}
