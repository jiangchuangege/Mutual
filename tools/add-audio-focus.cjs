const fs = require('node:fs');

// ---------- 1) CollectionScreen：本地预览播放器登记到音频焦点 ----------
const p1 = 'C:/ts/src/ui/CollectionScreen.tsx';
let a = fs.readFileSync(p1, 'utf8');
if (!a.includes('registerAudioOwner')) {
  // 找 import 区插入
  a = a.replace(
    /import \{ useApp \} from '\.\.\/store';/,
    "import { useApp } from '../store';\nimport { claimAudioFocus, registerAudioOwner, releaseAudioFocus, unregisterAudioOwner } from '../lib/audioFocus';"
  );

  a = a.replace(
    `function AudioRow({ uri, label }: { uri: string; label: string }) {
  const player = useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        player.play();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };`,
    `function AudioRow({ uri, label }: { uri: string; label: string }) {
  const player = useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);
  /** 自己的唯一 id：用于"别人开始播放时把我暂停" */
  const ownerId = React.useMemo(() => 'preview-' + Math.random().toString(36).slice(2), []);

  // 登记到全局音频焦点：一起听开始播放时，这里会被自动暂停
  React.useEffect(() => {
    registerAudioOwner(ownerId, () => {
      try {
        player.pause();
      } catch {
        // 忽略
      }
      setPlaying(false);
    });
    return () => {
      unregisterAudioOwner(ownerId);
      try {
        player.pause();
      } catch {
        // 忽略
      }
    };
  }, [ownerId, player]);

  const toggle = () => {
    try {
      if (playing) {
        player.pause();
        releaseAudioFocus(ownerId);
        setPlaying(false);
      } else {
        claimAudioFocus(ownerId); // 先抢焦点，把「一起听」暂停掉
        player.play();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };`
  );
  fs.writeFileSync(p1, a, 'utf8');
}
console.log('CollectionScreen 已接音频焦点:', a.includes('claimAudioFocus'));

// ---------- 2) useMusicEngine：播放时抢焦点，暂停时让出 ----------
const p2 = 'C:/ts/src/ui/useMusicEngine.ts';
let m = fs.readFileSync(p2, 'utf8');
if (!m.includes('claimAudioFocus')) {
  m = m.replace(
    "import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';",
    "import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';\nimport { claimAudioFocus, registerAudioOwner, releaseAudioFocus, unregisterAudioOwner } from '../lib/audioFocus';"
  );

  // 在销毁 effect 里登记/注销
  m = m.replace(
    `  // 销毁
  useEffect(() => {
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        // 释放失败忽略
      }
      playerRef.current = null;
      trackIdRef.current = null;
    };
  }, []);`,
    `  // 销毁 + 音频焦点登记
  const FOCUS_ID = 'listen';
  useEffect(() => {
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    // 别人（比如收藏里的本地预览）开始播放时，把这里暂停
    registerAudioOwner(FOCUS_ID, () => {
      try {
        playerRef.current?.pause();
      } catch {
        // 忽略
      }
      setPlaying(false);
    });
    return () => {
      unregisterAudioOwner(FOCUS_ID);
      try {
        playerRef.current?.remove();
      } catch {
        // 释放失败忽略
      }
      playerRef.current = null;
      trackIdRef.current = null;
    };
  }, []);`
  );

  // 所有 play() 前先抢焦点
  m = m.split('playerRef.current?.play()').join('{ claimAudioFocus(FOCUS_ID); playerRef.current?.play(); }');
  m = m.split('.play();').join('.play();');
  fs.writeFileSync(p2, m, 'utf8');
}
console.log('useMusicEngine 已接音频焦点:', m.includes('claimAudioFocus(FOCUS_ID)'));
