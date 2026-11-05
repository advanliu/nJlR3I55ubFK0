/* ============================================================================
 * afk-selfmark.js — 隊伍面板「自動維持」勾選列:標出只能加持自己的增益
 *
 * 傭兵的自動維持勾選列(js/10 _allyAutoBuffChips)把所有自我增益排在一起,但其中只有 TEAM_SHARE_BUFFS 清單內的(神聖武器、加速術、聖結界…)
 *   施放後會分享給隊友,其餘(日光術、保護罩、鎧甲護持…)只加在施放者自己身上。玩家看不出差別,就無從判斷「勾這個值不值得」。
 *   本外掛包住 _allyAutoBuffChips,對「分類=自我增益 且不在分享清單」的勾選項尾端補一個小「自」,標題旁補一句圖例。
 * 只改回傳的 HTML 字串,不碰勾選行為;開關關掉就原樣放行。
 * 掛接:index.html 的 </body> 前 <script src="afk-selfmark.js">。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'selfmark', name: '自動維持列標出「只加持自己」的技能', group: '遊戲介面', def: true,
    desc: '隊伍面板的自動維持勾選上，只加持施放者自己、不會分享給隊友的增益尾端標「自」'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('selfmark'); } catch (e) { return true; } }

  if (typeof window._allyAutoBuffChips !== 'function' || typeof window.allyAutoCastableSkills !== 'function' || typeof TEAM_SHARE_BUFFS === 'undefined') {
    try { console.warn('[AFK-selfmark] 找不到核心 _allyAutoBuffChips/allyAutoCastableSkills/TEAM_SHARE_BUFFS,停用。'); } catch (e) {}
    return;
  }

  var MARK = '<span title="只加持施放者自己，不會分享給隊友" style="color:#c4b5fd;font-size:9px;font-weight:bold;">自</span>';
  var HEAD = '自動維持（增益／召喚／回復／淨化）</span>';

  var _orig = window._allyAutoBuffChips;
  window._allyAutoBuffChips = function (a) {
    var html = _orig.apply(this, arguments);
    try {
      if (!on() || !html) return html;
      var selfOnly = {};
      window.allyAutoCastableSkills(a).forEach(function (it) { if (it.cat === '自我增益' && !TEAM_SHARE_BUFFS.has(it.sid)) selfOnly[it.sid] = true; });
      var n = 0;
      html = html.split('</label>').map(function (chunk) {
        var m = /setAllyAutoBuff\('[^']*','([^']*)'/.exec(chunk);
        if (m && selfOnly[m[1]]) { n++; return chunk + MARK; }
        return chunk;
      }).join('</label>');
      if (n && html.indexOf(HEAD) >= 0) html = html.replace(HEAD, HEAD + '<span style="color:#c4b5fd;font-size:9px;margin-left:4px;">「自」＝只加持自己</span>');
    } catch (e) { return _orig.apply(this, arguments); }
    return html;
  };

  try { console.log('[AFK-selfmark] hooks OK'); } catch (e) {}
})();
