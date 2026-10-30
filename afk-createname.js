/* ============================================================================
 * afk-createname.js — 創角畫面加名字欄
 *
 * 上游創角沒有取名這一步(startGame 寫死 player.name = null),進遊戲後要點左上角狀態欄那塊
 *   「沒取名時是空白」的區域才能改名 → 玩家根本找不到,只能一直玩「未命名」。
 *   這裡在「開始遊戲」鈕上方加一格名字欄,建立角色時直接取好名字。
 *
 * 作法:包 startGame,原函式跑完後再把名字寫進去並存檔。
 *   - 🚨 只在「這次真的建了新角色」時才寫:startGame 遇到存檔位已有角色會提早 return,
 *     那時全域 player 可能是上一個載入的角色——拿 enSeed(創角時才產生)前後比對,沒變就不碰。
 *   - 名字清理規則照抄核心 confirmEditName(js/14):去掉 < > & " '、最多 12 字、空白=不取名。
 *   - 留空就完全是原版行為(player.name 維持 null,之後照樣能點狀態欄改名)。
 *
 * 位置:創角畫面的元素都是在背景圖上用 % 絕對定位,而且每個斷點各一組座標(css/style.css)。
 *   不另抄一組座標,改成每次開畫面/縮放時量 #btn-start 的位置,貼在它正上方、同寬。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'createname', name: '創角取名', group: '遊戲介面', def: true,
    desc: '創角畫面多一格名字欄，建立角色時直接取好名字'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('createname'); } catch (e) { return true; } }

  if (typeof window.startGame !== 'function' || typeof window.showCreation !== 'function') {
    try { console.warn('[AFK-createname] 缺核心 startGame/showCreation,創角取名停用。'); } catch (e) {}
    return;
  }

  var MAX = 12;
  function clean(v) { return String(v || '').trim().replace(/[<>&"']/g, '').slice(0, MAX); }

  function injectCSS() {
    if (document.getElementById('afk-cname-style')) return;
    var s = document.createElement('style'); s.id = 'afk-cname-style';
    s.textContent = [
      '#afk-cname{position:absolute;z-index:7;box-sizing:border-box;margin:0;padding:0 .6em;text-align:center;',
      'font-family:inherit;font-weight:700;color:#f6e3b0;background:linear-gradient(180deg,rgba(40,27,10,.85),rgba(18,12,5,.85));',
      'border:1px solid #8b6a2e;border-radius:4px;outline:none;}',
      '#afk-cname::placeholder{color:#a88d5a;font-weight:400;}',
      '#afk-cname:focus{border-color:#d7ae57;}',
      '#afk-cname.afk-off{display:none;}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function field() {
    var el = document.getElementById('afk-cname');
    if (el) return el;
    var btn = document.getElementById('btn-start');
    if (!btn || !btn.parentNode) return null;
    injectCSS();
    el = document.createElement('input');
    el.id = 'afk-cname';
    el.type = 'text';
    el.maxLength = MAX;
    el.placeholder = '角色名稱';
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (!btn.disabled) btn.click(); }
    });
    btn.parentNode.insertBefore(el, btn);
    return el;
  }

  // 兩個候選位置:
  //   ① 「開始遊戲」正上方、同寬,塞進「配點區底部」與按鈕之間的空隙(桌機/平板)
  //   ② 「經典模式」正下方、與「返回」同一排(手機直式:上游排成固定像素、面板 overflow:hidden,
  //      開始鈕上方那條縫太矮,只剩左下角這格是空的)
  //   空隙高度 ≥ 按鈕的 8 成才用 ①,否則 ②。
  // 配點那幾格的 offsetParent 是 #stat-allocation(手機上它自己又往下移)→ 一律用畫面座標量
  var BLOCKERS = '.creation-stat-control, #creation-pts, #creation-gender-panel';
  function place() {
    var el = field(); if (!el) return;
    el.classList.toggle('afk-off', !on());
    var btn = document.getElementById('btn-start');
    if (!btn || !btn.offsetWidth) return;   // 創角畫面沒開 → 量不到,下次開時再排
    var panel = btn.offsetParent || btn.parentNode;
    var h = btn.offsetHeight, g = 2;
    var b = btn.getBoundingClientRect(), floor = -Infinity;
    var list = panel.querySelectorAll(BLOCKERS);
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (!r.width || r.left >= b.right || r.right <= b.left || r.top >= b.top) continue;   // 只看開始鈕那一欄、在它上方的
      floor = Math.max(floor, r.bottom);
    }
    var room = b.top - floor - 2 * g;
    var box = null;
    if (room >= h * 0.8) {
      var fh = Math.min(h, room);
      box = { x: btn.offsetLeft, y: btn.offsetTop - g - fh, w: btn.offsetWidth, h: fh };
    } else {
      var cm = document.getElementById('classic-mode-control'), back = document.getElementById('creation-back-button');
      if (cm && cm.offsetWidth && back && back.offsetWidth) {
        box = { x: cm.offsetLeft, y: back.offsetTop, w: Math.max(cm.offsetWidth, back.offsetLeft - cm.offsetLeft - 10), h: back.offsetHeight };
      } else {
        box = { x: btn.offsetLeft, y: btn.offsetTop - g - h, w: btn.offsetWidth, h: h };
      }
    }
    el.style.left = box.x + 'px';
    el.style.top = box.y + 'px';
    el.style.width = box.w + 'px';
    el.style.height = box.h + 'px';
    el.style.fontSize = getComputedStyle(btn).fontSize;
  }

  var _showCreation = window.showCreation;
  window.showCreation = function () {
    var r = _showCreation.apply(this, arguments);
    var el = field();
    if (el) el.value = '';   // 刪角後同頁重創:不沿用上一輪打的名字
    place();
    setTimeout(place, 50);   // 版面剛從 hidden 打開,補量一次
    return r;
  };

  var _startGame = window.startGame;
  window.startGame = function () {
    var el = document.getElementById('afk-cname');
    var name = (on() && el) ? clean(el.value) : '';
    var seedBefore = (typeof player !== 'undefined' && player) ? player.enSeed : undefined;
    var r = _startGame.apply(this, arguments);
    try {
      var created = typeof player !== 'undefined' && player && player.cls && player.enSeed && player.enSeed !== seedBefore;
      if (name && created && !player.name) {
        player.name = name;
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveGame === 'function') saveGame();
      }
    } catch (e) { try { console.warn('[AFK-createname] 寫入名字失敗', e); } catch (x) {} }
    return r;
  };

  window.addEventListener('resize', place);
  try { console.log('[AFK-createname] hooks OK'); } catch (e) {}
})();
