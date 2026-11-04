/* ============================================================================
 * afk-mercfilter.js — 戰鬥日誌:每位傭兵各一顆篩選鈕
 *
 * 上游戰鬥日誌的過濾列只有一顆「傭兵」(全部傭兵一起開關)。隊上有三位傭兵時,想只看法師在放什麼、
 *   或把騎士的普攻訊息收起來,做不到。本外掛放在「戰鬥日誌／系統日誌」分頁鈕同一排,依目前出戰的傭兵各補一顆(顯示傭兵名),
 *   點亮/點暗只影響那一位的訊息;「傭兵」總鈕關掉時整批照舊全收(核心那條 CSS 規則),本外掛不碰。
 *
 * 作法:
 *   - 傭兵訊息核心都寫成「協力·<傭兵名>」,且 data-src="mercenary"。包住 logCombat,送完後若該行是傭兵來源,
 *     從訊息字串取出名字標到 data-merc(只對新訊息做一次小正則,不掃整個日誌)。
 *   - 隱藏用一份自己的 <style>:`#combat-log [data-merc="名字"]{display:none}`,既有與未來的訊息一併套用。
 *   - 鈕由 player.allies 目前的名單產生,名單變了(招募/解散/換人)才重建。
 *   - 隱藏名單存 localStorage `afk_mercfilter_v1`(只是每位玩家自己的顯示偏好;讀寫失敗當沒有)。
 *   名字取不到的傭兵訊息(少數寫法沒帶「協力·」)只受總鈕管,不受個別鈕影響。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'mercfilter', name: '戰鬥日誌傭兵個別篩選', group: '遊戲介面', def: true,
    desc: '戰鬥日誌的篩選列為每位傭兵各加一顆鈕，可單獨收起某位的訊息'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('mercfilter'); } catch (e) { return true; } }

  if (typeof window.logCombat !== 'function') {
    try { console.warn('[AFK-mercfilter] 找不到核心 logCombat,停用。'); } catch (e) {}
    return;
  }

  var KEY = 'afk_mercfilter_v1';
  var hidden = {};
  try { var raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') hidden = raw; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(hidden)); } catch (e) {} }

  var NAME_RE = /協力·([^·<>\s】]+)/;

  var _orig = window.logCombat;
  window.logCombat = function (msg, type, src) {
    var r = _orig.apply(this, arguments);
    try {
      if (on() && typeof msg === 'string' && msg.indexOf('協力·') >= 0) {
        var el = document.getElementById('combat-log');
        var last = el && el.lastElementChild;
        if (last && last.getAttribute('data-src') === 'mercenary' && !last.hasAttribute('data-merc')) {
          var m = NAME_RE.exec(msg);
          if (m) last.setAttribute('data-merc', m[1]);
        }
      }
    } catch (e) {}
    return r;
  };

  var styleEl = null;
  function esc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function applyStyle() {
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'afk-mercfilter-style'; document.head.appendChild(styleEl); }
    var css = '';
    if (on()) Object.keys(hidden).forEach(function (n) { if (hidden[n]) css += '#combat-log [data-merc="' + esc(n) + '"]{display:none;}'; });
    styleEl.textContent = css;
  }

  var _sig = null;
  function names() {
    var out = [];
    try {
      ((typeof player !== 'undefined' && player && player.allies) || []).forEach(function (a) { if (a && a._allyName && out.indexOf(a._allyName) < 0) out.push(a._allyName); });
    } catch (e) {}
    return out;
  }

  function clearPills() {
    var old = document.getElementById('afk-mf-row');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function build() {
    var bar = document.getElementById('combat-filter-pills');
    if (!bar || !bar.parentNode) return;
    var list = on() ? names() : [];
    var sig = list.join('|');
    if (sig === _sig && (!list.length || document.getElementById('afk-mf-row'))) return;
    _sig = sig;
    clearPills();
    applyStyle();
    if (!list.length) return;
    // 放在「戰鬥日誌／系統日誌」分頁鈕同一排(過濾列之前):塞在「傭兵」鈕後面會把「召喚／夥伴」擠到第二行、拆散原本的順序
    var row = document.createElement('div');
    row.id = 'afk-mf-row';
    row.className = 'flex items-center gap-1 flex-wrap justify-end';
    row.style.flex = '0 1 auto';
    row.style.marginLeft = 'auto';
    bar.parentNode.insertBefore(row, bar);
    list.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cf-pill afk-mf-pill' + (hidden[n] ? ' cf-off' : '');
      b.setAttribute('style', 'color:#6ee7b7;border-color:#047857;background:rgba(6,78,59,.18);max-width:6.5em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap');
      b.title = '點亮/點暗：' + n + ' 的戰鬥訊息';
      b.textContent = n;
      b.addEventListener('click', function () {
        hidden[n] = !hidden[n];
        if (!hidden[n]) delete hidden[n];
        b.classList.toggle('cf-off', !!hidden[n]);
        save(); applyStyle();
      });
      row.appendChild(b);
    });
  }

  // 傭兵名單變動不頻繁:低頻輪詢比對簽章,變了才重建(不去包招募/解散函式,少一個耦合點)
  setInterval(function () { try { build(); } catch (e) {} }, 2000);
  setTimeout(function () { try { build(); } catch (e) {} }, 500);
  try { console.log('[AFK-mercfilter] hooks OK'); } catch (e) {}
})();
