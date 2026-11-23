const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) import 缓存模块
if (!t.includes('ensureLocalGame')) {
  t = t.replace(
    "import { AI_PROMPT, assembleLayers, buildRuntimeHtml, buildRuntimeShim, needsNetwork } from '../core/gameRuntime';",
    "import { AI_PROMPT, assembleLayers, buildRuntimeHtml, buildRuntimeShim, needsNetwork } from '../core/gameRuntime';\nimport { ensureLocalGame } from '../lib/gameCache';"
  );
}

// 2) GamePlayer：大游戏先下载到本地，再从本地加载
if (!t.includes('localUri')) {
  t = t.replace(
    `  const webRef = useRef<any>(null);`,
    `  const webRef = useRef<any>(null);
  /**
   * 大游戏的本地副本。
   *
   * 有 assetPath 说明是"文件型"游戏：第一次点开下载到手机私有目录，
   * 之后（含离线）都从本地跑；对方点开时他自己下载、存他自己手机。
   */
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [fetching, setFetching] = useState<boolean>(Boolean(game.assetPath));
  const [fetchError, setFetchError] = useState<string | null>(null);
  useEffect(() => {
    if (!game.assetPath) return;
    let cancelled = false;
    void (async () => {
      const res = await ensureLocalGame(baseUrl, game.assetPath as string);
      if (cancelled) return;
      setFetching(false);
      if (res.uri) setLocalUri(res.uri);
      else setFetchError(res.error ?? '下载失败');
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, game.assetPath]);`
  );

  // source：优先本地文件；没下载完就显示加载中
  t = t.replace(
    `        source={
          game.assetPath
            ? { uri: \`\${baseUrl}\${game.assetPath}\` }
            : {`,
    `        allowFileAccess
        source={
          game.assetPath
            ? localUri
              ? { uri: localUri }
              : { html: '<html><body style="background:#0E0C0B;color:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui">' +
                  (fetchError ? '下载失败：' + fetchError : '正在把游戏下载到手机…') +
                  '</body></html>' }
            : {`
  );
}

fs.writeFileSync(p, t, 'utf8');
console.log('本地缓存接入:', {
  下载: t.includes('ensureLocalGame'),
  本地优先: t.includes('? { uri: localUri }'),
  加载态: t.includes('正在把游戏下载到手机'),
});
