/* ============================================================================
 * afk-vendor.js — 安全區「叫賣販售」的玩家 NPC:拿金幣跟他買裝備
 *
 * 上游只有「收購者」(js/24:NPC 向你買),沒有反方向。本外掛補一個賣家:
 *   - 每 10 分鐘判定一次,沒有賣家在場時 40% 出現一位,待 2 小時;一次只賣一件。
 *   - 在場期間每 5 分鐘在世界頻道喊一次;點他的名字開購買確認。只有人在安全區才能成交(比照收購者)。
 *   - 商品池=「有怪會掉」的武器/防具/飾品(掃上游各張掉落表,同 afk-dex 的 _allTables),
 *     排除遺物與箭矢 → 不賣任務/製作限定品,打寶進度不被跳過。六成機率從「你的職業能穿」的裡面挑。
 *   - 價格=物品基礎價 × 20~50 倍(約等於金幣收購者的出價區間),一律 +0、無詞綴(gainItem forceNormal)。
 *
 * 儲存:localStorage `afk_vendor_v1`(幾十 bytes,裝置共用、所有角色看到同一位賣家)。
 *   壞掉只會讓賣家消失,不影響遊戲;不碰玩家存檔格式,成交才改 player.gold/背包並 saveGame()。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'vendor', name: '叫賣販售', group: '遊戲玩法', def: true,
    desc: '安全區偶爾有玩家叫賣裝備，可以用金幣跟他買'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('vendor'); } catch (e) { return true; } }

  if (typeof window.gainItem !== 'function' || typeof window.logWorld !== 'function') {
    try { console.warn('[AFK-vendor] 缺核心 gainItem/logWorld,停用。'); } catch (e) {}
    return;
  }

  var KEY = 'afk_vendor_v1';
  var CHECK_MS = 10 * 60 * 1000, LIFE_MS = 2 * 60 * 60 * 1000, CALL_MS = 5 * 60 * 1000;
  var CHANCE = 0.40, OWN_CLASS = 0.60, MULT_MIN = 20, MULT_MAX = 50;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  // 商品池:各掉落表裡的裝備(只建一次)
  var _pool = null;
  function pool() {
    if (_pool) return _pool;
    var seen = {}, list = [];
    var tables = [];
    try { if (typeof MOB_DROPS !== 'undefined') tables.push(MOB_DROPS); } catch (e) {}
    try { if (typeof DARK_WEAPON_DROPS !== 'undefined') tables.push(DARK_WEAPON_DROPS); } catch (e) {}
    try { if (typeof DARK_CRYSTAL_DROPS !== 'undefined') tables.push(DARK_CRYSTAL_DROPS); } catch (e) {}
    try { if (typeof DRAGON_DROPS !== 'undefined') tables.push(DRAGON_DROPS); } catch (e) {}
    try { if (typeof WARRIOR_DROPS !== 'undefined') tables.push(WARRIOR_DROPS); } catch (e) {}
    try { if (typeof MEM_DROPS !== 'undefined') tables.push(MEM_DROPS); } catch (e) {}
    tables.forEach(function (t) {
      Object.keys(t || {}).forEach(function (mob) {
        (t[mob] || []).forEach(function (e) {
          var id = e && e[0], d = id && DB.items[id];
          if (!d || seen[id]) return;
          seen[id] = true;
          if (d.type !== 'wpn' && d.type !== 'arm' && d.type !== 'acc') return;
          if (d.isArrow || d.relic || !(d.p > 0)) return;
          list.push(id);
        });
      });
    });
    _pool = list;
    return list;
  }

  function canUse(d) {
    try { return typeof reqAllowsClass !== 'function' || reqAllowsClass(d, player.cls); } catch (e) { return true; }
  }

  function pickItem() {
    var all = pool();
    if (!all.length) return null;
    var list = all;
    if (Math.random() < OWN_CLASS) {
      var mine = all.filter(function (id) { return canUse(DB.items[id]); });
      if (mine.length) list = mine;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  function makeName() {
    try { if (typeof pvpRandomName === 'function') return pvpRandomName(); } catch (e) {}
    return '商人' + Math.floor(Math.random() * 10000);
  }

  // 核心 getItemFullName 回傳帶顏色的 HTML(上游自己產的,可直接塞日誌);確認視窗要純文字
  function itemHtml(id) {
    try { if (typeof getItemFullName === 'function') return getItemFullName({ id: id, en: 0 }); } catch (e) {}
    return esc((DB.items[id] && DB.items[id].n) || id);
  }
  function itemText(id) {
    var t = document.createElement('div'); t.innerHTML = itemHtml(id);
    return t.textContent || '';
  }

  function alive(s) { return s.seller && s.seller.until > Date.now() && DB.items[s.seller.itemId]; }

  function call(s) {
    var v = s.seller;
    logWorld('<span class="wc-answer"><span class="text-amber-300 font-bold">【販售】</span>'
      + '<span class="afk-vd-name" onclick="AFK_VENDOR.open()" style="cursor:pointer;text-decoration:underline;">' + esc(v.name) + '</span>'
      + '：賣 ' + itemHtml(v.itemId) + '，' + v.price.toLocaleString() + ' 金幣，要的點我</span>');
  }

  function ready() {
    return typeof player !== 'undefined' && player && player.cls
      && !(typeof state !== 'undefined' && state && state.ff);
  }

  function tick() {
    if (!on() || !ready()) return;
    var now = Date.now(), s = load(), dirty = false;
    if (s.seller && !alive(s)) { s.seller = null; dirty = true; }
    if (!(s.nextCheck > now) || s.nextCheck > now + CHECK_MS) {   // 後者:裝置時間被往回調過
      s.nextCheck = now + CHECK_MS; dirty = true;
      if (!s.seller && Math.random() < CHANCE) {
        var id = pickItem();
        if (id) {
          var mult = MULT_MIN + Math.random() * (MULT_MAX - MULT_MIN);
          s.seller = { name: makeName(), itemId: id, price: Math.max(1, Math.round(DB.items[id].p * mult)), until: now + LIFE_MS };
          s.nextCall = 0;
        }
      }
    }
    if (s.seller && !(s.nextCall > now)) { call(s); s.nextCall = now + CALL_MS; dirty = true; }
    if (dirty) store(s);
  }

  function inTown() {
    try { return String(mapState.current || '').indexOf('town_') === 0; } catch (e) { return false; }
  }

  function open() {
    if (!ready()) return;
    var s = load();
    if (!alive(s)) { logWorld('<span class="wc-sys">這個人已經下線了。</span>'); return; }
    if (!inTown()) { logWorld('<span class="wc-sys">回到安全區才能跟他交易。</span>'); return; }
    var v = s.seller, d = DB.items[v.itemId];
    var msg = v.name + ' 賣 ' + itemText(v.itemId) + '\n價格 ' + v.price.toLocaleString() + ' 金幣（你有 ' + Math.floor(player.gold || 0).toLocaleString() + '）'
      + (canUse(d) ? '' : '\n你的職業不能裝備這件。');
    var buy = function () { doBuy(v); };
    if (window.AFK_UI && AFK_UI.confirm) AFK_UI.confirm({ title: '購買裝備', message: msg, okText: '買', cancelText: '不要', onOk: buy });
    else if (window.confirm(msg)) buy();
  }

  function doBuy(v) {
    if (!ready()) return;
    var s = load();
    if (!alive(s) || s.seller.itemId !== v.itemId || s.seller.until !== v.until) { logWorld('<span class="wc-sys">這個人已經下線了。</span>'); return; }
    if ((player.gold || 0) < v.price) { logWorld('<span class="wc-sys">金幣不夠。</span>'); return; }
    player.gold -= v.price;
    gainItem(v.itemId, 1, false, true);
    s.seller = null; store(s);
    logWorld('<span class="wc-answer">' + esc(v.name) + '：謝啦，合作愉快！</span>');
    try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
    try { if (typeof saveGame === 'function' && player && player.cls) saveGame(); } catch (e) {}
  }

  window.AFK_VENDOR = { open: open, _tick: tick, _pool: pool };
  setInterval(tick, 30 * 1000);
  try { console.log('[AFK-vendor] hooks OK'); } catch (e) {}
})();
