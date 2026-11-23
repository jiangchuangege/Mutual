const fs = require('node:fs');
const p = 'C:/ts/server/buildApk.mjs';
let t = fs.readFileSync(p, 'utf8');

// 把上一版写错的 javac 重试命令换成显式参数
const bad = /        try \{\n          sh\(path\.join\(jh, 'bin\/javac'\), \['-nowarn', '-classpath', AJAR, '-d', path\.join\(work, 'out\/classes'\), \.\.\.javacBase\.slice\(javacBase\.indexOf\(\.\.\.javaFilesOnDisk\) - 1\)\]\);\n        \} catch \(e2\) \{/;
if (!bad.test(t)) throw new Error('没找到要替换的 javac 重试行');
t = t.replace(
  bad,
  `        try {
          sh(path.join(jh, 'bin/javac'), [
            '-nowarn',
            '-classpath', AJAR,
            '-d', path.join(work, 'out/classes'),
            ...filesNow,
          ]);
        } catch (e2) {`
);
fs.writeFileSync(p, t, 'utf8');
console.log('javac 重试参数已修正');
console.log(t.split('\n').slice(0, 0).join(''));
const idx = t.indexOf('RETURN_CANDIDATES');
console.log(t.slice(idx - 200, idx + 120));
