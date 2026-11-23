/**
 * 修复 build.gradle + 设置版本号（以后只用这个脚本改版本，别再手写 PowerShell）
 *
 * 为什么：PowerShell 5.1 的 Set-Content 会按 ANSI 读 UTF-8 文件，
 * 把中文注释写成乱码，还会吞掉换行，导致 gradle 无法解析（已经踩了三次）。
 */
const fs = require('node:fs');
const p = 'C:/ts/android/app/build.gradle';
let t = fs.readFileSync(p, 'utf8');
if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);

const start = t.indexOf('            // Agora ');
const endMarker = '    splits {';
const end = t.indexOf(endMarker);
if (start >= 0 && end > start) {
  const good = `            // Agora 自带一堆我们根本没用到的扩展（视频编解码、美颜、空间音频），
            // 每个 ABI 剔掉它们能省 ~19MB。prebuild 会把这段冲掉，记得补回来（README §7）。
            excludes += [
                '**/libagora_video_*.so',
                '**/libagora_*.so.tmp',
                '**/libaosl.so',
                '**/libagora_beauty*.so',
                '**/libagora_segmentation_extension*.so',
                '**/libagora_spatial_audio*.so',
                '**/libagora_clear_vision*.so',
                '**/libagora_face_detection*.so',
                '**/libagora_lip_sync*.so',
            ]
            // 通用包是给真机用的：x86/x86_64 只有模拟器需要，
            // 留着等于白白多一百多 MB（259MB → 约 150MB）
            if (project.hasProperty('universalApk')) {
                excludes += ['lib/x86/**', 'lib/x86_64/**']
            }
        }
    }
    // 按 ABI 分包：两个小包比一个通用包好装得多。
    // 但有些机型（例如 MIUI/HyperOS 上装了 32 位系统的）会因为包里没有匹配的
    // ABI 直接报「安装失败 -113：该安装包与您的系统不兼容」。
    // 所以留一个开关：-PuniversalApk 时不分包，出一个包含所有 ABI 的通用包。
`;
  t = t.slice(0, start) + good + t.slice(end);
  console.log('已修复 packagingOptions/splits 段');
}

// 剩下零星乱码注释统一替换（含 x86_64 那行）
t = t
  .split(/\r?\n/)
  .map((line) => {
    if (line.trim().startsWith('//') && /[\uFFFD]|锛|鍦|鏄|闇|銆|鈥|鎴|鐨|鑷|姣|鐣|鎸|浣|渚/.test(line)) {
      if (line.includes('x86_64')) return '            // x86_64 只给模拟器验收用（真机不会用这个包）';
      return null;
    }
    return line;
  })
  .filter((l) => l !== null)
  .join('\n');

// 版本号（幂等）
const versionCode = process.argv[2] ? Number(process.argv[2]) : null;
const versionName = process.argv[3] ?? null;
if (versionCode !== null) t = t.replace(/versionCode \d+/, `versionCode ${versionCode}`);
if (versionName !== null) t = t.replace(/versionName "[^"]+"/, `versionName "${versionName}"`);

fs.writeFileSync(p, t, 'utf8');
console.log('build.gradle 处理完成:', (t.match(/versionCode \d+/) ?? [''])[0], (t.match(/versionName "[^"]+"/) ?? [''])[0]);
