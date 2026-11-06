/* ============================================================================
 * afk-slotswap.js — 選角畫面:把選中的角色與另一格對調位置
 *
 * 角色存在 localStorage `lineage_idle_save_<格號>`(＋`_bak` 匯入前備份),格號就是順序;上游沒有換位功能。
 *   本外掛在選角動作列加「對調位置」鈕:選中有角色的格 → 輸入目標格號 → 兩格的存檔原字串互換(目標是空格就等於搬過去)。
 * 只搬原字串,不解析、不驗證存檔內容(上游改格式也不受影響);倉庫是全帳號共用的單一 key,與格號無關,不用搬。
 * 寫入順序:先把兩格(含 _bak)原值記在記憶體 → 逐一寫入 → 讀回比對 → 對不上就把原值寫回,絕不留下半套。
 * 傭兵來源是被對調的格 → 核心 purgeReplacedAllies 比對 enSeed 發現換角會自動解散,需重新招募(確認文字已提醒)。
 * 掛接:index.html 的 </body> 前 <script src="afk-slotswap.js">。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'slotswap', name: '選角畫面可對調存檔位置', group: '遊戲介面', def: true,
    desc: '選角畫面選中角色後可與另一格對調，用來調整角色順序'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('slotswap'); } catch (e) { return true; } }

  if (typeof window.slotSummary !== 'function' || typeof window.renderLoadSelect !== 'function' ||
      typeof window.updateLoadInfo !== 'function' || typeof _lsGet !== 'function' || typeof _lzSetStoredRaw !== 'function' ||
      typeof _lzRemoveStored !== 'function' || typeof SAVE_SLOT_MAX === 'undefined') {
    try { console.warn('[AFK-slotswap] 找不到核心選角/存檔函式,停用。'); } catch (e) {}
    return;
  }

  var BTN_ID = 'load-btn-swap';

  function keysOf(n) { var k = 'lineage_idle_save_' + n; return [k, k + '_bak']; }
  function label(n) {
    var s = null; try { s = slotSummary(n); } catch (e) {}
    return s ? ('存檔 ' + n + '（' + (s.name || '未命名') + ' ' + s.cls + ' Lv.' + s.lv + '）') : ('存檔 ' + n + '（空）');
  }

  function swap(a, b) {
    var ka = keysOf(a), kb = keysOf(b), keys = ka.concat(kb);
    var orig = {};
    keys.forEach(function (k) { orig[k] = _lsGet(k); });
    var plan = {};
    for (var i = 0; i < 2; i++) { plan[ka[i]] = orig[kb[i]]; plan[kb[i]] = orig[ka[i]]; }
    function put(map) { keys.forEach(function (k) { if (map[k] == null) _lzRemoveStored(k); else _lzSetStoredRaw(k, map[k]); }); }
    function matches(map) { return keys.every(function (k) { return (_lsGet(k) || null) === (map[k] == null ? null : map[k]); }); }
    try { put(plan); if (matches(plan)) return true; } catch (e) { try { console.warn('[AFK-slotswap] 寫入失敗', e); } catch (e2) {} }
    try { put(orig); } catch (e) {}   // 回復原狀
    return false;
  }

  function onClick() {
    var from = _loadSelectedSlot;
    if (!slotSummary(from)) return;
    var raw = prompt('把「' + label(from) + '」對調到第幾格？（1～' + SAVE_SLOT_MAX + '）');
    if (raw == null) return;
    var to = parseInt(String(raw).trim(), 10);
    if (!(to >= 1 && to <= SAVE_SLOT_MAX) || to === from) { alert('請輸入 1～' + SAVE_SLOT_MAX + ' 之間、不同於目前的格號。'); return; }
    if (!confirm('對調\n' + label(from) + '\n與\n' + label(to) + '\n\n以這兩格為來源的傭兵會被解散，需重新招募。確定？')) return;
    if (!swap(from, to)) { alert('對調失敗，存檔未變動。請重新整理後再試。'); return; }
    _loadSelectedSlot = to;
    try { _loadPage = Math.floor((to - 1) / 4); } catch (e) {}
    renderLoadSelect();
  }

  function ensureBtn() {
    var panel = document.getElementById('load-action-panel');
    if (!panel) return null;
    var b = document.getElementById(BTN_ID);
    if (!b) {
      b = document.createElement('button');
      b.id = BTN_ID; b.type = 'button'; b.textContent = '對調位置';
      b.className = 'hidden';
      b.style.gridColumn = '1 / -1';   // 手機是 2 欄格線,與進入/匯出/刪除一樣整列
      b.addEventListener('click', onClick);
      var back = document.getElementById('load-btn-back');
      panel.insertBefore(b, back || null);
    }
    return b;
  }

  function sync() {
    var b = ensureBtn(); if (!b) return;
    var show = false;
    try { show = on() && !!slotSummary(_loadSelectedSlot); } catch (e) {}
    b.classList.toggle('hidden', !show);
  }

  var _upd = window.updateLoadInfo;
  window.updateLoadInfo = function () {
    var r = _upd.apply(this, arguments);
    try { sync(); } catch (e) {}
    return r;
  };

  try { sync(); } catch (e) {}
  try { console.log('[AFK-slotswap] hooks OK'); } catch (e) {}
})();
