const fs = require('node:fs');

// ---------- 1) types：kind 增加 'native' ----------
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
t = t.replace(
  "  kind?: 'html' | 'link' | 'source';",
  "  kind?: 'html' | 'link' | 'source' | 'native';"
);
fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');

// ---------- 2) store：云编译入口 ----------
let st = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
if (!st.includes('buildNativeGame')) {
  st = st.replace(
    '  removeGame(id: string): void {',
    `  /**
   * 云编译：把 Java 源码交给服务器编成 APK，然后把"文件型游戏"登记进库。
   * 产物是独立 App（原生程序没法嵌进 Mutual 一页），点卡片走系统安装。
   */
  async compileNativeGame(title: string, code: string): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('云编译要连上服务器', 'warn');
      return false;
    }
    this.toast('正在上传源码到服务器编译…', 'info');
    const res = await buildNativeGame(this.remoteServer, this.token, title || 'Mutual 小游戏', [
      { name: 'MainActivity.java', content: code },
    ]);
    if (!res.ok || !res.path) {
      this.toast(\`编译失败：\${(res.error ?? '未知错误').slice(0, 160)}\`, 'error');
      return false;
    }
    const added = this.hub.addGameAsset(this.role, {
      title: title || 'Mutual 小游戏',
      assetPath: res.path,
      kind: 'native',
    });
    if (!added.ok) {
      this.toast(added.error ?? '登记失败', 'error');
      return false;
    }
    this.bump();
    this.toast(\`编译成功（\${Math.round((res.bytes ?? 0) / 1024)}KB），点卡片安装\`, 'ok');
    return true;
  }

  removeGame(id: string): void {`
  );
  fs.writeFileSync('C:/ts/src/store.tsx', st, 'utf8');
}

// ---------- 3) store import ----------
let st2 = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
if (!st2.includes("from './lib/cloudBuild'")) {
  st2 = st2.replace(
    "import { readMusicMeta } from './lib/musicMetaFile';",
    "import { readMusicMeta } from './lib/musicMetaFile';\nimport { buildNativeGame } from './lib/cloudBuild';"
  );
  fs.writeFileSync('C:/ts/src/store.tsx', st2, 'utf8');
}
console.log('store 云编译:', fs.readFileSync('C:/ts/src/store.tsx', 'utf8').includes('compileNativeGame'));
