/* ============================================================================
 * afk-nosound.js — 完全不下載背景音樂與音效（預設關・省行動網路流量）
 *
 * 上游的音樂/音效「關閉」只管播不播:啟動時 _bgmInit 仍對全部曲目逐一探測(_bgmResolve),
 *   _sfxInit 仍預載音效(_sfxTryLoad,每個音效還建 4 個播放元件)。不開聲音的玩家照樣被抓流量。
 *   本外掛開著時把這兩個「載入入口」擋掉:
 *   - _sfxTryLoad:不建任何 Audio → 音效池留空,播放函式本來就會「沒有池 → 回 false 靜音」。
 *   - _bgmResolve:不探測 → 曲目網址記成 null,_bgmSwitch 本來就會「沒網址 → 直接 return」。
 *   遊戲其餘部分不需要音檔(核心只有 js/17 會建 Audio),所以不影響任何玩法。
 *
 * 載入時機:音訊初始化掛在 DOMContentLoaded,外掛腳本在 </body> 前同步執行、比它早,
 *   故重開遊戲後從頭就不抓。遊戲中途才打開此開關:已載入的不會收回,之後新的也不再抓。
 * 掛接:index.html 的 </body> 前 <script src="afk-nosound.js">。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'nosound', name: '不下載音樂與音效', group: '系統與其他', def: false,
    desc: '省行動網路流量；開啟後遊戲完全無聲，重開遊戲後生效'
  });
  function on() { try { return !!(window.AFK_TOGGLES && AFK_TOGGLES.enabled('nosound')); } catch (e) { return false; } }

  if (typeof window._sfxTryLoad !== 'function' || typeof window._bgmResolve !== 'function') {
    try { console.warn('[AFK-nosound] 找不到核心 _sfxTryLoad/_bgmResolve,停用。'); } catch (e) {}
    return;
  }

  var _sfx = window._sfxTryLoad;
  window._sfxTryLoad = function (key, def) {
    if (on()) return;
    return _sfx.apply(this, arguments);
  };

  var _bgm = window._bgmResolve;
  window._bgmResolve = function (scene, file) {
    if (on()) { try { _bgmUrl[scene] = null; } catch (e) {} return; }
    return _bgm.apply(this, arguments);
  };

  try { console.log('[AFK-nosound] hooks OK — 不下載音樂與音效(開關預設關)。'); } catch (e) {}
})();
