/* ============================================================================
 * afk-ver.js — 首頁最下方顯示「這個畫面載入的是哪一版」,並和線上版本比對
 *
 * 手機卡在舊版(快取/網路沒換到新首頁)時,玩家和我們都沒有簡單的辦法確認。這裡把「目前頁面引用的全部
 *   <script src="…?v=…"> 字串」排序後算成 8 碼短碼(djb2),顯示在首頁角落;同時用 no-store 讀線上 version.json 的 pageSig
 *   (scripts/stamp-sw-version.mjs 用同一個演算法、對 index.html 的同一批字串算出)→ 一致=已是最新,不一致=有新版。
 *   讀不到線上版本(離線/連不上)只顯示短碼,不報錯。
 * 演算法兩端必須一致:改這裡的 sig() 就要同步改 stamp-sw-version.mjs 的 pageSig()。
 * 掛點:#login-meta-layer(首頁免責聲明那層)。找不到就不顯示。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'ver', name: '首頁顯示程式版本', group: '系統與其他', def: true,
    desc: '首頁最下方顯示這個畫面載入的版本短碼,線上有新版時提醒重開'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('ver'); } catch (e) { return true; } }

  function sig(list) {
    var s = list.slice().sort().join('\n'), h = 5381;
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
    var x = h.toString(16); while (x.length < 8) x = '0' + x;
    return x;
  }

  function pageSig() {
    var list = [];
    var els = document.getElementsByTagName('script');
    for (var i = 0; i < els.length; i++) {
      var src = els[i].getAttribute('src');
      if (src && /\?v=/.test(src)) list.push(src);
    }
    return list.length ? sig(list) : '';
  }

  function show() {
    if (!on()) return;
    var host = document.getElementById('login-meta-layer');
    if (!host) { try { console.warn('[AFK-ver] 找不到 #login-meta-layer,不顯示。'); } catch (e) {} return; }
    var mine = pageSig();
    if (!mine) return;
    var el = document.getElementById('afk-ver-line');
    if (!el) {
      el = document.createElement('div');
      el.id = 'afk-ver-line';
      el.className = 'text-center select-none';
      el.setAttribute('style', 'font-size:11px;color:#94a3b8;margin-top:4px;opacity:.85');
      host.appendChild(el);
    }
    el.textContent = '程式 ' + mine;
    try {
      fetch('version.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
        if (!v || !v.pageSig) return;
        if (v.pageSig === mine) { el.textContent = '程式 ' + mine + '・已是最新'; }
        else {
          el.textContent = '程式 ' + mine + '・線上有新版 ' + v.pageSig + '，請完全關掉遊戲再開';
          el.style.color = '#fbbf24';
        }
      }).catch(function () {});
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();

  try { console.log('[AFK-ver] hooks OK'); } catch (e) {}
})();
