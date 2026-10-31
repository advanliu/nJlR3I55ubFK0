/* ============================================================================
 * afk-cfgleak.js — 換角色時,自動施放設定不再沿用上一個角色的
 *
 * 上游 bug(js/13 loadGame):
 *   ① 先 renderSkillSelects() 重建技能下拉——它會「保留畫面上目前選的值」(上一個角色的)
 *   ② 再用 `if (c.selAtkSkill) ... = c.selAtkSkill` 還原存檔設定——存的是「無」('')時 if 不成立,不覆寫
 *   → 騎士設「無」、法師設某攻擊技:法師→騎士時,只要騎士也會那招,下拉就停在法師的選擇,騎士開始自動施放。
 *   治癒/轉換下拉同理;Buff 勾選框也是 renderSkillSelects 沿用畫面勾選狀態再部分覆寫。
 *   (上游 v3.7.73 的 resetConfigDomToDefaults 只在「創新角色」時呼叫,載入既有角色沒有。)
 *
 * 作法:包 loadGame,呼叫原函式前先把這三個下拉清成「無」、Buff 勾選框全部取消
 *   → ①沿用不到上一個角色的值,②有存值的照常還原,存「無」的就維持「無」。
 *   ⚠ 載入失敗(簽章不符/存檔毀損)時原函式提早 return、角色沒換——那時要把畫面還原回去,
 *     否則目前角色的自動施放會被清掉。判準:核心載入成功的最後一步才把 _uiConfigReady 設回 true。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'cfgleak', name: '換角不沿用施放設定', group: '自動化', def: true,
    desc: '修正換角色後，自動施放的技能沿用上一個角色的選擇'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('cfgleak'); } catch (e) { return true; } }

  if (typeof window.loadGame !== 'function') {
    try { console.warn('[AFK-cfgleak] 缺核心 loadGame,停用。'); } catch (e) {}
    return;
  }

  var SELECTS = ['sel-atk-skill', 'sel-heal-skill', 'sel-convert-skill'];

  function snapshotAndClear() {
    var snap = { sel: {}, chk: [] };
    SELECTS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      snap.sel[id] = el.value;
      el.value = '';
    });
    var box = document.getElementById('auto-buff-skills');
    if (box) {
      var list = box.querySelectorAll('input[type=checkbox]');
      for (var i = 0; i < list.length; i++) {
        snap.chk.push([list[i].id, list[i].checked]);
        list[i].checked = false;
      }
    }
    return snap;
  }

  function restore(snap) {
    Object.keys(snap.sel).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = snap.sel[id];
    });
    snap.chk.forEach(function (p) {
      var el = p[0] && document.getElementById(p[0]);
      if (el) el.checked = p[1];
    });
  }

  var _loadGame = window.loadGame;
  window.loadGame = function () {
    if (!on()) return _loadGame.apply(this, arguments);
    var snap = null;
    try { snap = snapshotAndClear(); } catch (e) { try { console.warn('[AFK-cfgleak] 清除設定失敗', e); } catch (x) {} }
    var r = _loadGame.apply(this, arguments);
    try {
      // 載入沒走到最後(_uiConfigReady 仍是 false)=角色沒換 → 畫面還原
      if (snap && typeof _uiConfigReady !== 'undefined' && !_uiConfigReady) restore(snap);
    } catch (e) {}
    return r;
  };

  try { console.log('[AFK-cfgleak] hooks OK'); } catch (e) {}
})();
