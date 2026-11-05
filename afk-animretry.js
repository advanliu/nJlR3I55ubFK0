/* ============================================================================
 * afk-animretry.js — 動畫幀載入失敗時自動重試（修「進地圖圖片顯示不完整」）
 *
 * 上游 _probeFramesWin 的快路徑:幀數已知(anim-manifest)時,把該動畫的所有幀同時發出去,
 *   「任何一幀 onerror 就當缺號、動畫截斷到連續段」,結果又整局記在 _mobAnimCache——
 *   行動網路上一次短暫失敗(逾時/連線被重設)就讓那隻怪(或職業戰鬥幀)整局只剩前半截甚至退回靜態圖,
 *   要重新整理遊戲才會恢復。首次進入新地圖/新職業要同時抓的幀最多,所以最常發生在那時候。
 *
 * 作法:包住 _probeFramesWin。manifest 說有 N 幀、結果卻 < N 時,最多重跑 2 次(間隔 0.6s/1.5s)——
 *   已成功的幀走瀏覽器/SW 快取、只有失敗的會真的重抓。重跑結束仍不足才照原樣交給核心(manifest 過期的真缺幀)。
 *   manifest 未涵蓋(退回 404 探測)的情況無從區分「真缺號」與「失敗」,不處理。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'animretry', name: '動畫圖片載入失敗自動重試', group: '遊戲介面', def: true,
    desc: '行動網路下進入新地圖時，怪物/角色動畫缺幀會自動補抓'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('animretry'); } catch (e) { return true; } }

  if (typeof window._probeFramesWin !== 'function' || typeof window._manifestCount !== 'function') {
    try { console.warn('[AFK-animretry] 找不到核心 _probeFramesWin/_manifestCount,停用。'); } catch (e) {}
    return;
  }

  var RETRY_DELAYS = [600, 1500];
  var _orig = window._probeFramesWin;
  window._probeFramesWin = function (urlFor, maxF, minF, done) {
    var known = null;
    try { if (on()) known = window._manifestCount(urlFor(0)); } catch (e) {}
    if (typeof known !== 'number' || known < 2 || typeof done !== 'function') return _orig.apply(this, arguments);
    var self = this, tries = 0;
    function run() {
      _orig.call(self, urlFor, maxF, minF, function (frames, n) {
        if (n < known && tries < RETRY_DELAYS.length) { setTimeout(run, RETRY_DELAYS[tries++]); return; }
        done(frames, n);
      });
    }
    run();
  };

  try { console.log('[AFK-animretry] hooks OK'); } catch (e) {}
})();
