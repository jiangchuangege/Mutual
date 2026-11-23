const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

// 1) 不再死要求 class MainActivity：自动识别入口类与 package
t = t.replace(
  `  const hasMain = javaFiles.some((f) => /class\\s+MainActivity\\b/.test(f.content));
  if (!hasMain) return { ok: false, error: '源码里必须有 class MainActivity（App 的入口）' };`,
  `  // 自动识别：包名 + 入口类（优先"继承 Activity 的那个类"，否则取第一个 public class）
  const pickEntry = () => {
    for (const f of javaFiles) {
      const cls = /(?:public\\s+)?(?:final\\s+)?class\\s+(\\w+)\\s+extends\\s+[\\w.]*(?:Activity)\\b/.exec(f.content);
      if (cls) return { name: cls[1], content: f.content };
    }
    for (const f of javaFiles) {
      const cls = /public\\s+(?:final\\s+)?class\\s+(\\w+)/.exec(f.content);
      if (cls) return { name: cls[1], content: f.content };
    }
    return null;
  };
  const entry = pickEntry();
  if (!entry) return { ok: false, error: '源码里找不到 class（要有 public class Xxx extends Activity）' };
  const pkgMatch = /^\\s*package\\s+([\\w.]+)\\s*;/m.exec(entry.content);
  const manifestPkg = pkgMatch ? pkgMatch[1] : PKG;`
);

// 2) 写源码时用入口类真实名字（public class 必须与文件名一致，否则 javac 直接报错）
t = t.replace(
  `      const base = (f.name.split('/').pop() || 'MainActivity.java').replace(/[^\\w.-]/g, '');
      fs.writeFileSync(path.join(dir, base), f.content);`,
  `      // 文件名必须等于 public class 名，否则 javac 报
      // "class X is public, should be declared in a file named X.java"
      const own = /public\\s+(?:final\\s+)?class\\s+(\\w+)/.exec(f.content);
      const base = own ? \`\${own[1]}.java\` : (f.name.split('/').pop() || 'MainActivity.java').replace(/[^\\w.-]/g, '');
      fs.writeFileSync(path.join(dir, base), f.content);`
);

// 3) Manifest 用识别到的包名与入口类
t = t.replace('  package="${PKG}" android:versionCode="1"', '  package="${manifestPkg}" android:versionCode="1"');
t = t.replace('<activity android:name=".MainActivity" android:exported="true">', '<activity android:name=".${entry.name}" android:exported="true">');

// 4) javac：先试 --release 8；不支持就退回不带 release 参数（有的 JDK 不支持 8）
t = t.replace(
  `    sh(path.join(jh, 'bin/javac'), [
      '-nowarn', '-source', '8', '-target', '8',
      '-classpath', AJAR, '-d', path.join(work, 'out/classes'), ...javaFilesOnDisk,
    ]);`,
  `    const javacBase = ['-nowarn', '-classpath', AJAR, '-d', path.join(work, 'out/classes'), ...javaFilesOnDisk];
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
    if (!compiled) {
      const firstError = lastErr.split('\\n').find((l) => l.includes('error:')) || lastErr.split('\\n')[0] || '未知错误';
      return { ok: false, error: \`Java 编译失败：\${firstError.trim().slice(0, 220)}\` };
    }`
);

// 5) 其它步骤失败时也只回传关键一行
t = t.replace(
  "    const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr).slice(0, 600) : '';\n    return { ok: false, error: `编译失败：${(err instanceof Error ? err.message : String(err)).slice(0, 300)}${stderr ? `\\n${stderr}` : ''}` };",
  `    const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : '';
    const keyLine = stderr.split('\\n').find((l) => l.includes('error:')) || stderr.split('\\n')[0] || '';
    const msg = keyLine.trim() || (err instanceof Error ? err.message : String(err));
    return { ok: false, error: \`编译失败：\${msg.slice(0, 220)}\` };`
);

fs.writeFileSync(p, t, 'utf8');
console.log('buildApk 更新:', {
  自动识别入口类: t.includes('pickEntry'),
  文件名等于类名: t.includes('const own = /public'),
  javac兼容: t.includes('--release'),
  关键错误行: t.includes('keyLine'),
});
