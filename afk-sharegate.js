/* ============================================================================
 * afk-sharegate.js — 隊長只分享「自己有勾自動施放」的增益
 *
 * 上游 v3.4.45「單體輔助共享」(js/06 shareTeamBuffs,TEAM_SHARE_BUFFS 清單):誰身上有清單內的增益,就幫缺的隊友補,MP 由分享者出。
 *   玩家(隊長)也是分享者(js/07 autoActions 末段呼叫 shareTeamBuffs(player)),且判斷只看「有學+身上有+隊友缺」,不看技能頁的自動施放勾選。
 *   隊長身上的增益常是傭兵先分享給他的 → 隊長沒勾也會轉發給其他傭兵,出站一次補四位就白扣 40 MP(傭兵本來就會直接補缺的人,轉發是多餘的)。
 * 本外掛:隊長當分享者時,暫時把 player.skills 篩成「非清單技能 + 技能頁有勾自動施放(auto-sk-<id>)的清單技能」再呼叫原函式,結束後還原。
 *   傭兵當分享者的路徑完全不動;隊長有勾的技能照舊分享。
 * 掛接:index.html 的 </body> 前 <script src="afk-sharegate.js">。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'sharegate', name: '隊長只分享有勾自動施放的增益', group: '遊戲玩法', def: true,
    desc: '隊長沒勾自動施放的技能（如神聖武器），不再因身上有該增益就替傭兵補、白扣 MP'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('sharegate'); } catch (e) { return true; } }

  if (typeof window.shareTeamBuffs !== 'function' || typeof TEAM_SHARE_BUFFS === 'undefined') {
    try { console.warn('[AFK-sharegate] 找不到核心 shareTeamBuffs/TEAM_SHARE_BUFFS,停用。'); } catch (e) {}
    return;
  }

  var _orig = window.shareTeamBuffs;
  window.shareTeamBuffs = function (caster) {
    var skills = null, filtered = null;
    try {
      if (on() && caster && caster === player && Array.isArray(caster.skills)) {
        skills = caster.skills;
        filtered = skills.filter(function (sid) {
          if (!TEAM_SHARE_BUFFS.has(sid)) return true;
          var chk = document.getElementById('auto-sk-' + sid);
          return !!(chk && chk.checked);
        });
      }
    } catch (e) { filtered = null; }
    if (!filtered) return _orig.apply(this, arguments);
    caster.skills = filtered;
    try { return _orig.apply(this, arguments); }
    finally { caster.skills = skills; }
  };

  try { console.log('[AFK-sharegate] hooks OK'); } catch (e) {}
})();
