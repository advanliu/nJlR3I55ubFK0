/* ============================================================================
 * afk-enhsure.js — 強化必定成功（預設關）
 *
 * 開啟後:武器/防具/飾品的強化卷軸一律成功,不爆裝、不「無事發生」;已達強化上限(武器+15/防具+15/飾品+5)的
 *   照舊擋下、不消耗卷軸。祝福卷軸的跳級照舊夾在上限內。
 *
 * 作法:核心所有強化路徑(單抽 doEnhance、一鍵到指定值 executeAutoSafeEnhance、快速強化)的成敗
 *   都問同一個函式 enhanceRollOutcome(js/01)。本檔包住它:開著、且該件「有強化資格且還沒到上限」
 *   就直接回 'ok';其餘一律原樣交回原函式——遺物/不可強化物不受影響,上限判定與跳級夾擠仍由核心各呼叫點自己做。
 *   不動 enhanceOutcomeFromRoll(機率表),上游改規則我們自動跟著改。
 *
 * ⚠️ 預設「關」,所以讀不到 AFK_TOGGLES 時要當關閉(不可沿用預設開外掛那條「讀不到就當開啟」)。
 * 掛接:在 index.html 的 </body> 前 <script src="afk-enhsure.js">。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'enhsure', name: '強化必定成功', group: '遊戲玩法', def: false,
    desc: '強化卷軸一律成功，不會爆裝；仍不會超過強化上限'
  });
  function on() { try { return !!(window.AFK_TOGGLES && AFK_TOGGLES.enabled('enhsure')); } catch (e) { return false; } }

  if (typeof window.enhanceRollOutcome !== 'function' || typeof window.enhanceCap !== 'function') {
    try { console.warn('[AFK-enhsure] 找不到核心 enhanceRollOutcome/enhanceCap,強化必成停用。'); } catch (e) {}
    return;
  }

  var _orig = window.enhanceRollOutcome;
  window.enhanceRollOutcome = function (d, en) {
    try {
      if (on() && d && (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc') && !d.relic && !d.noEnhance
          && (Number(en) || 0) < enhanceCap(d)) return 'ok';
    } catch (e) {}
    return _orig.apply(this, arguments);
  };

  try { console.log('[AFK-enhsure] hooks OK — 強化必定成功(開關預設關)。'); } catch (e) {}
})();
