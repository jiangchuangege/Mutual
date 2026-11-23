const fs = require('node:fs');
const p = 'C:/ts/src/store.tsx';
let t = fs.readFileSync(p, 'utf8');

if (t.includes('uploadGameFile')) {
  console.log('已存在 uploadGameFile');
  process.exit(0);
}

// 在 importLargeGame 后面插入"上传本地文件"的方法
const anchor = `  /**
   * 云编译：把 Java 源码交给服务器编成 APK，然后把"文件型游戏"登记进库。`;
if (!t.includes(anchor)) throw new Error('找不到插入点');

const method = `  /**
   * 从手机里选一个文件上传成游戏。
   *
   * 支持：.html/.htm（当网页游戏，按网址加载，几个人都能玩）、.apk（原生游戏，点卡片安装）。
   * 其它后缀会提示先转成这两种。文件走 /api/upload 进服务器 /game/，状态里只留地址。
   */
  async uploadGameFile(file: { uri: string; name: string; size?: number }): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('上传文件要先连上服务器（对方也要能下载）', 'warn');
      return false;
    }
    const name = (file.name || 'game.html').trim();
    const extMatch = /\\.([a-z0-9]+)$/i.exec(name);
    const ext = (extMatch ? extMatch[1] : '').toLowerCase();
    const webExt = ['html', 'htm'];
    const apkExt = ['apk'];
    if (!webExt.includes(ext) && !apkExt.includes(ext)) {
      this.toast('只支持 .html/.htm（网页游戏）或 .apk（安卓游戏）；.zip/.js 请先解出 index.html', 'error');
      return false;
    }
    if (file.size && file.size > 95 * 1024 * 1024) {
      this.toast('文件超过 95MB，服务器收不下', 'error');
      return false;
    }
    this.toast('正在读取文件…', 'info');
    let base64 = '';
    try {
      const FileSystem = await import('expo-file-system/legacy');
      base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      try {
        const blob = await (await fetch(file.uri)).blob();
        const buf = await new Response(blob).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
        base64 = typeof btoa === 'function' ? btoa(bin) : '';
      } catch {
        base64 = '';
      }
    }
    if (!base64) {
      this.toast('读不出这个文件，换个文件或用"粘贴代码"方式', 'error');
      return false;
    }
    this.toast('正在上传游戏文件…', 'info');
    try {
      const url = \`\${this.remoteServer.replace(/\\/+$/, '')}/api/upload\`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: \`Bearer \${this.token}\` },
        body: JSON.stringify({ kind: 'game', data: base64, ext: webExt.includes(ext) ? 'html' : 'apk' }),
      });
      const data = (await res.json()) as { ok?: boolean; value?: { path?: string }; error?: string };
      if (!res.ok || !data.ok || !data.value?.path) {
        this.toast(\`上传失败：\${data.error ?? res.status}\`, 'error');
        return false;
      }
      const title = name.replace(/\\.[a-z0-9]+$/i, '').slice(0, 40) || '上传的游戏';
      const added = this.hub.addGameAsset(this.role, {
        title,
        assetPath: data.value.path,
        kind: apkExt.includes(ext) ? 'native' : 'html',
      });
      if (!added.ok) {
        this.toast(added.error ?? '登记失败', 'error');
        return false;
      }
      this.bump();
      this.toast(
        apkExt.includes(ext)
          ? '已加入游戏库：点卡片会装到手机上'
          : '已加入游戏库：点卡片直接开玩，对方也能下载',
        'ok',
      );
      return true;
    } catch (err) {
      this.toast(\`上传出错：\${err instanceof Error ? err.message : String(err)}\`, 'error');
      return false;
    }
  }

`;
t = t.replace(anchor, method + anchor);
fs.writeFileSync(p, t, 'utf8');
console.log('store.uploadGameFile 已加入');
