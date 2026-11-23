const fs = require('node:fs');

// ---------- types：GameSpec 加 assetPath（大游戏存网址，不存代码） ----------
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
if (!t.includes('assetPath')) {
  t = t.replace(
    "  /** 单文件 HTML（含 <script>）；在沙箱 WebView 里跑 */\n  code: string;",
    `  /** 单文件 HTML（含 <script>）；在沙箱 WebView 里跑 */
  code: string;
  /**
   * 大游戏的服务器相对路径（\`/game/xxx.html\`）。
   *
   * 有它就说明这个游戏体积远超"能塞进同步状态"的规模（Unity WebGL、几十 MB 资源…），
   * 客户端按网址加载、不再把代码放进空间状态 —— 于是**体积不再有 400KB 上限**。
   */
  assetPath?: string | null;`
  );
  fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');
}

// ---------- hub：加 addGameAsset（只存地址） ----------
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
if (!h.includes('addGameAsset')) {
  h = h.replace(
    '  removeGame(byRole: Role, id: string): Result<null> {',
    `  /**
   * 登记一个"大体积游戏"：只存服务器路径，不存代码。
   *
   * 以前的 400KB 上限是因为代码要进空间状态、两台手机同步；
   * 现在先上传成文件（服务端 /game/xxx），状态里只留一个地址 → 再大都能支持。
   */
  addGameAsset(
    byRole: Role,
    input: { title: string; assetPath: string; players?: 1 | 2; kind?: 'html' | 'link' | 'source' },
  ): Result<GameSpec> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const assetPath = String(input.assetPath ?? '').trim();
    if (!assetPath.startsWith('/game/')) return fail('游戏文件路径不对（应以 /game/ 开头）');
    const title = String(input.title ?? '').trim().slice(0, 40) || '未命名小游戏';
    const dup = this.state.games.find((g) => g.assetPath === assetPath);
    if (dup) return ok(dup);
    const spec: GameSpec = {
      id: uid('game'),
      title,
      code: '',
      assetPath,
      players: input.players === 1 ? 1 : 2,
      kind: input.kind ?? 'html',
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.games.unshift(spec);
    if (this.state.games.length > 60) this.state.games.length = 60;
    this.logActivity(byRole, 'add', 'game', '游戏库', title);
    this.notify();
    return ok(spec);
  }

  removeGame(byRole: Role, id: string): Result<null> {`
  );
  fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');
}

// ---------- store：上传大游戏 ----------
let st = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
if (!st.includes('importLargeGame')) {
  st = st.replace(
    '  removeGame(id: string): void {',
    `  /**
   * 大体积游戏：先传到服务器，再只把地址登记进库。
   * 返回 true 表示已经进库（体积不再受 400KB 限制）。
   */
  async importLargeGame(title: string, code: string): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('大游戏要连上服务器才能上传（对方也要能下载）', 'warn');
      return false;
    }
    this.toast('正在上传游戏文件…', 'info');
    try {
      const base64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(code))) : '';
      if (!base64) {
        this.toast('这个环境无法编码文件，请改用"粘贴代码"方式', 'error');
        return false;
      }
      const url = \`\${this.remoteServer.replace(/\\/+$/, '')}/api/upload\`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: \`Bearer \${this.token}\` },
        body: JSON.stringify({ kind: 'game', data: base64, ext: 'html' }),
      });
      const data = (await res.json()) as { ok?: boolean; value?: { path?: string }; error?: string };
      if (!res.ok || !data.ok || !data.value?.path) {
        this.toast(\`上传失败：\${data.error ?? res.status}\`, 'error');
        return false;
      }
      const added = this.hub.addGameAsset(this.role, { title, assetPath: data.value.path });
      if (!added.ok) {
        this.toast(added.error ?? '登记失败', 'error');
        return false;
      }
      this.bump();
      this.toast('已加入游戏库（体积不受限制，按网址加载）', 'ok');
      return true;
    } catch (err) {
      this.toast(\`上传出错：\${err instanceof Error ? err.message : String(err)}\`, 'error');
      return false;
    }
  }

  removeGame(id: string): void {`
  );
  fs.writeFileSync('C:/ts/src/store.tsx', st, 'utf8');
}
console.log('hub/store 大游戏:', fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8').includes('addGameAsset'), fs.readFileSync('C:/ts/src/store.tsx', 'utf8').includes('importLargeGame'));
