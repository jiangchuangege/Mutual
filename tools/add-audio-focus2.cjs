const fs = require('node:fs');
const p = 'C:/ts/src/ui/useMusicEngine.ts';
let m = fs.readFileSync(p, 'utf8');

// import
if (!m.includes("from '../lib/audioFocus'")) {
  m = m.replace(
    "import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';",
    "import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';\nimport { claimAudioFocus, registerAudioOwner, unregisterAudioOwner } from '../lib/audioFocus';"
  );
}

// 焦点登记（放进已有的销毁 effect）
if (!m.includes('registerAudioOwner(FOCUS_ID')) {
  m = m.replace(
    /  \/\/ 销毁\n  useEffect\(\(\) => \{\n    void setAudioModeAsync\(\{ allowsRecording: false, playsInSilentMode: true \}\)\.catch\(\(\) => undefined\);\n    return \(\) => \{/,
    `  // 销毁 + 音频焦点登记
  const FOCUS_ID = 'listen';
  useEffect(() => {
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    // 别人（如收藏页的本地预览）开始播放时，把我这边暂停，避免两个声音同时响
    registerAudioOwner(FOCUS_ID, () => {
      try {
        playerRef.current?.pause();
      } catch {
        // 忽略
      }
      setPlaying(false);
    });
    return () => {
      unregisterAudioOwner(FOCUS_ID);`
  );
}

// 每个 p.play() / p?.play() 前抢焦点
const lines = m.split('\n');
let patched = 0;
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (/^(p|playerRef\.current)\??\.play\(\);$/.test(trimmed) && !lines[i - 1]?.includes('claimAudioFocus')) {
    const indent = lines[i].match(/^\s*/)[0];
    lines[i] = `${indent}claimAudioFocus(FOCUS_ID);\n${lines[i]}`;
    patched += 1;
  }
}
m = lines.join('\n');
fs.writeFileSync(p, m, 'utf8');
console.log('useMusicEngine: 登记焦点 =', m.includes('registerAudioOwner(FOCUS_ID'), '| play 前抢焦点处数 =', patched);
