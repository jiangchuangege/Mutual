/**
 * 触屏操作层（注入到游戏库里的网页游戏）。
 *
 * 2026-11 修复（用户上报：链接卡在 App 里完全点不动/划不动）：
 * 以前这一层是**铺满屏幕 + pointer-events:auto + 无条件 preventDefault**，
 * 于是它把所有手指事件都吃掉了 —— 普通网站（easegame.cn、game.ra2web.com）在 App 里
 * 点不动、划不动。这层本来是给"只认键盘/鼠标的网页游戏"用的，不该默认接管。
 *
 * 现在的规则：
 *   1. **默认关闭**：注入层 display:none → 页面 100% 正常（滚动 / 点击 / 输入框都能用）；
 *   2. 右下角一个半透明「🎮」小按钮，点一下才打开手柄；按站点记住（localStorage）；
 *   3. 打开后：左半屏按住=移动（WASD/方向键）、右半屏拖动=转视角、轻点=鼠标左键，
 *      这时才 preventDefault（游戏模式，不让页面跟着滚）。
 */
export function buildTouchpadShim(): string {
  return String.raw`
(function(){
  if (window.__TW_PAD__) return;
  window.__TW_PAD__ = true;

  var LS_KEY = '__tw_pad_on:' + (location.hostname || 'local');
  var on = false;
  try { on = localStorage.getItem(LS_KEY) === '1'; } catch(e) {}

  var KMAP = {
    up: ['w','arrowup'], left: ['a','arrowleft'], down: ['s','arrowdown'], right: ['d','arrowright']
  };
  var cursor = { x: innerWidth / 2, y: innerHeight / 2 };
  var held = {}, touches = {};

  function fire(t, type, opts){ try { t.dispatchEvent(new KeyboardEvent(type, opts)); } catch(e) {} }
  function key(dir, down){
    var list = KMAP[dir] || [];
    for (var i = 0; i < list.length; i++){
      var k = list[i], o = { key: k, code: k, bubbles: true, cancelable: true };
      fire(document, down ? 'keydown' : 'keyup', o);
      fire(window, down ? 'keydown' : 'keyup', o);
    }
  }
  function setDirs(next){
    for (var d in KMAP){
      var want = !!next[d], had = !!held[d];
      if (want && !had) { key(d, true); held[d] = 1; }
      if (!want && had) { key(d, false); delete held[d]; }
    }
  }
  function releaseAll(){ setDirs({}); }

  function mouseAt(type, dx, dy, buttons){
    cursor.x = Math.max(0, Math.min(innerWidth, cursor.x + (dx || 0)));
    cursor.y = Math.max(0, Math.min(innerHeight, cursor.y + (dy || 0)));
    var cv = document.querySelector('canvas');
    var o = { clientX: cursor.x, clientY: cursor.y, movementX: dx || 0, movementY: dy || 0,
      buttons: buttons || 0, button: 0, bubbles: true, cancelable: true };
    var C = window.MouseEvent;
    try { document.dispatchEvent(new C(type, o)); } catch(e) {}
    if (cv) { try { cv.dispatchEvent(new C(type, o)); } catch(e) {} }
  }

  function init(){
    if (!document.body) { setTimeout(init, 60); return; }

    /*
     * 锁住缩放（用户反馈：有的页面点两下就放大，很难受）。
     * 做法：强制写死 viewport + 关掉双击缩放 / 文本自动放大。
     * 只影响"缩放"，不拦任何点击滚动，所以不会影响正常操作。
     */
    try {
      var vp = document.querySelector('meta[name="viewport"]');
      if (!vp) {
        vp = document.createElement('meta');
        vp.setAttribute('name', 'viewport');
        document.head.appendChild(vp);
      }
      vp.setAttribute('content',
        'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover');
      var st = document.createElement('style');
      st.textContent = 'html,body{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation;' +
        '-webkit-user-select:none;user-select:none}body{-webkit-touch-callout:none}' +
        '*{touch-action:manipulation;-webkit-text-size-adjust:100%}';
      document.head.appendChild(st);
      /*
       * 双击放大彻底掐掉：用户明说"不小心点两下就放大很恶心，要固定页面"。
       * 320ms 内的第二次 touchend 直接拦掉，双指缩放也一并禁掉。
       */
      var lastTap = 0;
      /*
       * 只拦多指（真正的缩放/双击缩放手势）。以前是不看手指数、只看"距上次点击<320ms"
       * 就 preventDefault，而 touchend 的 preventDefault 会取消这次触摸合成的 click：
       * 网页里任何快速连点（间隔 <320ms）都会被吞掉一次 —— 表现就是"点了没反应"。
       */
      document.addEventListener('touchend', function(e){
        if (e.touches && e.touches.length > 1) { try { e.preventDefault(); } catch(err) {} }
      }, { passive: false });
      document.addEventListener('gesturestart', function(e){ try { e.preventDefault(); } catch(err) {} }, { passive: false });
      // 有些站会自己再改回来：监听变化重新按下去
      var mo = new MutationObserver(function(){
        var v = document.querySelector('meta[name="viewport"]');
        if (v && v.getAttribute('content') !==
            'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover') {
          v.setAttribute('content',
            'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover');
        }
      });
      mo.observe(document.head, { childList: true, subtree: true, attributes: true });
    } catch(e) {}

    /* 手柄层：默认 display:none，只有用户按开关才接管触摸 */
    var layer = document.createElement('div');
    layer.id = '__tw_touch';
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:transparent;' +
      'pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none;display:none';

    layer.addEventListener('touchstart', function(e){
      for (var i = 0; i < e.changedTouches.length; i++){
        var t = e.changedTouches[i];
        var walking = false, id;
        for (id in touches) if (touches[id].zone === 'move') walking = true;
        var zone = walking ? 'look' : (t.clientX < innerWidth * 0.5 ? 'move' : 'look');
        touches[t.identifier] = { zone: zone, ox: t.clientX, oy: t.clientY, lx: t.clientX, ly: t.clientY,
          moved: 0, at: Date.now() };
        if (zone === 'look') mouseAt('mousedown', 0, 0, 1);
      }
      e.preventDefault();
    }, { passive: false });

    layer.addEventListener('touchmove', function(e){
      for (var i = 0; i < e.changedTouches.length; i++){
        var t = e.changedTouches[i], st = touches[t.identifier];
        if (!st) continue;
        var dx = t.clientX - st.ox, dy = t.clientY - st.oy;
        st.moved += Math.abs(t.clientX - st.lx) + Math.abs(t.clientY - st.ly);
        st.lx = t.clientX; st.ly = t.clientY;
        if (st.zone === 'move') {
          var th = 12;
          setDirs({ left: dx < -th, right: dx > th, up: dy < -th, down: dy > th });
        } else {
          mouseAt('mousemove', dx * 1.2, dy * 1.2, 1);
          st.ox = t.clientX; st.oy = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    layer.addEventListener('touchend', function(e){
      for (var i = 0; i < e.changedTouches.length; i++){
        var t = e.changedTouches[i], st = touches[t.identifier];
        if (!st) continue;
        if (st.zone === 'move') releaseAll();
        else {
          mouseAt('mouseup', 0, 0, 0);
          if (st.moved < 24 && Date.now() - st.at < 400) mouseAt('click', 0, 0, 0);
        }
        delete touches[t.identifier];
      }
      e.preventDefault();
    }, { passive: false });

    layer.addEventListener('touchcancel', function(e){
      for (var i = 0; i < e.changedTouches.length; i++) delete touches[e.changedTouches[i].identifier];
      releaseAll();
    });

    document.body.appendChild(layer);
    if (on) layer.style.display = 'block';

    /* 右下角半透明小开关：不挡视线，点一下才启用/关闭手柄 */
    var chip = document.createElement('div');
    chip.id = '__tw_pad_btn';
    chip.style.cssText = 'position:fixed;right:6px;bottom:96px;width:40px;height:40px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;font-size:17px;z-index:2147483001;' +
      'background:rgba(0,0,0,' + (on ? '.5' : '.28') + ');border:1px solid rgba(255,255,255,.35);' +
      'color:#fff;opacity:' + (on ? '1' : '.6') + ';pointer-events:auto;touch-action:manipulation';
    chip.textContent = '🎮';

    var tip = null;
    function showTip(text){
      if (!tip) {
        tip = document.createElement('div');
        tip.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);padding:6px 12px;' +
          'border-radius:12px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;z-index:2147483002;' +
          'pointer-events:none;transition:opacity .8s';
        document.body.appendChild(tip);
      }
      tip.textContent = text;
      tip.style.opacity = '1';
      setTimeout(function(){ if (tip) tip.style.opacity = '0'; }, 2200);
    }

    chip.addEventListener('click', function(ev){
      ev.stopPropagation();
      on = !on;
      layer.style.display = on ? 'block' : 'none';
      if (!on) releaseAll();
      chip.style.background = 'rgba(0,0,0,' + (on ? '.5' : '.28') + ')';
      chip.style.opacity = on ? '1' : '.6';
      try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch(e) {}
      showTip(on ? '触屏手柄已开：左边按住走 · 右边拖动转视角 · 轻点交互' : '触屏手柄已关：页面恢复正常手指滚动/点击');
    }, { passive: true });

    document.body.appendChild(chip);

    /*
     * 屏幕方向跟着游戏走：量一下游戏主容器（canvas/iframe/最大可视区）的宽高比，
     * 报给 App，由 App 决定横屏还是竖屏（网页自己 lock orientation 在 Android 上是锁不动的）。
     */
    function reportOrientation(){
      try {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
        var best = null, bestArea = 0;
        var cands = document.querySelectorAll('canvas,iframe,video,[class*=game],[id*=game]');
        for (var i = 0; i < cands.length; i++){
          var r = cands[i].getBoundingClientRect();
          var a = r.width * r.height;
          if (a > bestArea && r.width > 120 && r.height > 120) { bestArea = a; best = r; }
        }
        var w = best ? best.width : innerWidth;
        var h = best ? best.height : innerHeight;
        if (Math.abs(w - h) < 24) return;   // 近似正方形就不折腾方向
        window.ReactNativeWebView.postMessage('TW_ORIENT:' + (w > h ? 'landscape' : 'portrait'));
      } catch(e) {}
    }
    setTimeout(reportOrientation, 1400);
    setTimeout(reportOrientation, 3200);
    window.addEventListener('resize', function(){ setTimeout(reportOrientation, 400); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;
}
