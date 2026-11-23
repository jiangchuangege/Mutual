const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

if (t.includes('uploadGameFile')) {
  console.log('UI 已存在');
  process.exit(0);
}

const anchor = `            <View style={{ height: 8 }} />
            <Btn
              title="🛠 云编译成原生 APK（Java 源码用这个）"`;
if (!t.includes(anchor)) throw new Error('找不到插入点');

const ui = `            <View style={{ height: 8 }} />
            <Btn
              title="📁 从手机选文件上传（.html / .apk）"
              variant="soft"
              onPress={() => {
                void (async () => {
                  try {
                    const DocumentPicker = await import('expo-document-picker');
                    const picked = await DocumentPicker.getDocumentAsync({
                      type: [
                        'text/html',
                        'application/vnd.android.package-archive',
                        'application/octet-stream',
                        '*/*',
                      ],
                      copyToCacheDirectory: true,
                      multiple: false,
                    });
                    if (picked.canceled || !picked.assets?.length) return;
                    const file = picked.assets[0];
                    const ok = await store.uploadGameFile({
                      uri: file.uri,
                      name: file.name ?? 'game.html',
                      size: file.size ?? undefined,
                    });
                    if (!ok) return;
                    setImportOpen(false);
                    setTitle('');
                    setCode('');
                  } catch (err) {
                    toast.show(\`选择文件失败：\${err instanceof Error ? err.message : String(err)}\`);
                  }
                })();
              }}
            />
            <View style={{ height: 8 }} />
            <Btn
              title="🛠 云编译成原生 APK（Java 源码用这个）"`;
t = t.replace(anchor, ui);
fs.writeFileSync(p, t, 'utf8');
console.log('games.tsx 加了"从手机选文件上传"按钮');
