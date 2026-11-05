/* ============================================================================
 * afk-panacea.js — 萬能藥改商店買、野怪不再掉
 *
 * 兩個獨立開關:
 *   ① 商店販售萬能藥(預設開):雜貨型商店(預設商店／波尼／斯克瓦蒂)多賣六種萬能藥(STR/DEX/CON/INT/WIS/CHA),
 *      一瓶 1 金幣。價格直接把 DB.items[id].p 改成 1(開關關掉時還原):購買、顯示都走核心原路徑,
 *      而核心賣價=定價×30%(floor)→ 賣出自動變 0,不會出現「1 金幣買、3000 賣」的套利。
 *      作法:包住 getShopItemsForNpc,在雜貨商店的清單尾端補六個 id;關掉就透明放行。購買、扣款、入包都走核心 buyItem。
 *      「純白的萬能藥」(不可直接使用的原料)不上架。
 *   ② 一般野怪不掉萬能藥(預設開):Lv40 以上一般怪原本 0.01% 隨機掉一種。頭目(1%)與各頭目掉落表裡的萬能藥不動。
 *      機率寫在擊殺結算(js/05)與離線結算(js/27)的區域變數裡,外掛包不到 → 靠核心補丁 14 的 window.__afkPanRate 鉤子,
 *      本檔回 0(一般怪)或原值(頭目)。兩處都問同一個鉤子,線上/離線一致。
 *
 * 不碰:使用上限(總共 60 瓶、單項 60)、回憶蠟燭退還純白、塔斯合成——這些仍照核心。
 * 掛接:index.html 的 </body> 前 <script src="afk-panacea.js">。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) {
    AFK_TOGGLES.register({
      id: 'panshop', name: '商店販售萬能藥', group: '遊戲玩法', def: true,
      desc: '雜貨商店多賣六種屬性的萬能藥'
    });
    AFK_TOGGLES.register({
      id: 'pannodrop', name: '一般野怪不掉萬能藥', group: '遊戲玩法', def: true,
      desc: 'Lv40 以上一般怪不再隨機掉萬能藥（頭目照舊）'
    });
  }
  function on(id) { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled(id); } catch (e) { return true; } }

  var IDS = ['panacea_str', 'panacea_dex', 'panacea_con', 'panacea_int', 'panacea_wis', 'panacea_cha'];
  var PRICE = 1;
  var _origP = {};
  // 開著時定價=PRICE、關掉還原;每次商店清單重算時順手對齊(開關中途切換,下次開商店生效)
  function syncPrice() {
    var want = on('panshop');
    IDS.forEach(function (id) {
      var d = DB.items[id]; if (!d) return;
      if (!(id in _origP)) _origP[id] = d.p;
      d.p = want ? PRICE : _origP[id];
    });
  }
  var GENERAL_SHOPS = ['default', 'npc_boni', 'npc_skvati'];   // 賣藥水/卷軸/箭的雜貨型商店

  // ① 商店
  if (typeof window.getShopItemsForNpc === 'function' && typeof SHOP_LISTS !== 'undefined') {
    var _orig = window.getShopItemsForNpc;
    window.getShopItemsForNpc = function (npcId) {
      var list = _orig.apply(this, arguments);
      try {
        syncPrice();
        if (!on('panshop') || !Array.isArray(list)) return list;
        var key = SHOP_LISTS[npcId] ? npcId : 'default';
        if (GENERAL_SHOPS.indexOf(key) < 0) return list;
        var extra = IDS.filter(function (id) { return DB.items[id] && list.indexOf(id) < 0; });
        return extra.length ? list.concat(extra) : list;
      } catch (e) { return list; }
    };
  } else {
    try { console.warn('[AFK-panacea] 找不到核心 getShopItemsForNpc/SHOP_LISTS,商店販售停用。'); } catch (e) {}
  }

  try { syncPrice(); } catch (e) {}

  // ② 掉落鉤子(核心補丁 14)
  window.__afkPanRate = function (rate, mob) {
    try { if (on('pannodrop') && mob && !mob.boss) return 0; } catch (e) {}
    return rate;
  };

  try { console.log('[AFK-panacea] hooks OK'); } catch (e) {}
})();
