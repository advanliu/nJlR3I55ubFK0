/* ============================================================================
 * afk-cloudsave.js — 雲端備份(自己的 Cloudflare Worker·只有自己用)
 *
 * 解決什麼:進度只存在瀏覽器的 localStorage,清資料/換手機就沒了;Litterbox 轉移碼 24 小時就刪。
 *   這裡把 afk-fullsave 的同一包資料上傳到「玩家自己部署的」Worker(cf-cloudsave/),永久保留最近幾份,
 *   需要時從清單挑一份還原。
 *
 * 設計:
 *   - localStorage 仍是唯一的主存檔,遊戲完全不知道雲端的存在;這支只是「另一個交出去的管道」。
 *     打包/驗證/確認/寫入全部借 AFK_FULLSAVE(同一條還原流程,不另寫一套)→ 父開關是 fullsave。
 *   - 🚨 還原只能手動、只能從首頁設定選單進來(同 afk-fullsave ⑤):自動拉回來＝拿雲端舊檔蓋掉新進度,
 *     遊戲中還原則會被記憶體裡的 player 經 saveGame 寫回去。
 *   - 自動上傳:每 10 分鐘＋切到背景時(至少隔 1 分鐘)。內容與上次上傳的一樣就跳過——
 *     沒在玩的那台裝置才不會用舊資料一直洗掉另一台的新備份(伺服器只留最近幾份)。
 *     比對用 keys 的雜湊,存在 afk_cloud_last(跨重新整理也記得)。
 *   - 伺服器網址/密碼/裝置名存 localStorage(幾百 byte;沒有它就不能用,屬於「設定」),
 *     並登記成 AFK_FULLSAVE.keepKey:不進備份包(密碼不跟著匯出檔傳給作者)、還原時保留這台自己的。
 *
 * 優雅降級:缺 AFK_FULLSAVE / fetch 就 console.warn 後安靜停用。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'cloudsave', parent: 'fullsave', name: '雲端備份', group: '系統與其他', def: true,
    desc: '把全部進度備份到你自己的伺服器，可以自動上傳'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('cloudsave'); } catch (e) { return true; } }

  var FS = window.AFK_FULLSAVE;
  if (!FS || typeof window.fetch !== 'function') {
    try { console.warn('[AFK-cloudsave] 缺 AFK_FULLSAVE 或 fetch,雲端備份停用。'); } catch (e) {}
    return;
  }

  var CFG_KEY = 'afk_cloud_cfg', LAST_KEY = 'afk_cloud_last';
  FS.keepKey(CFG_KEY); FS.keepKey(LAST_KEY);
  var AUTO_EVERY = 10 * 60 * 1000;   // 自動上傳間隔
  var HIDE_MIN = 60 * 1000;          // 切背景時,距上次嘗試至少這麼久才再傳

  function readJson(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function cfg() { var c = readJson(CFG_KEY); return c && c.url && c.token ? c : null; }
  function last() { return readJson(LAST_KEY) || {}; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmtTime(ms) {
    var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function guessDevice() {
    var ua = navigator.userAgent || '';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android';
    return '電腦';
  }
  function base(c) { return String(c.url).trim().replace(/\/+$/, ''); }
  function api(c, path, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ Authorization: 'Bearer ' + c.token }, opt.headers || {});
    opt.cache = 'no-store';
    return fetch(base(c) + path, opt).then(function (r) {
      if (r.status === 401) throw new Error('AUTH');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    });
  }
  function errText(e, inSetup) {
    if (e && e.message === 'AUTH') return inSetup ? '密碼不對。' : '密碼不對，請到「變更設定」重新輸入。';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return '沒有網路連線。';
    if (e instanceof TypeError) return '連不上伺服器，請確認網址是否正確。';
    return (e && e.message) || '未知錯誤';
  }

  // FNV-1a 32 位元。只用來判斷「跟上次傳的一不一樣」,不是安全用途
  function hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }

  // ── 上傳 ───────────────────────────────────────────────────
  var _busy = false, _lastTry = 0;
  function upload(auto) {
    var c = cfg();
    if (!c || _busy || !on()) return Promise.resolve(null);
    _busy = true; _lastTry = Date.now();
    var pack, keysText, h;
    try {
      pack = FS.buildPack();
      keysText = JSON.stringify(pack.keys);
      h = hash(keysText);
    } catch (e) { _busy = false; return Promise.reject(e); }
    var prev = last();
    if (auto && prev.hash === h) { _busy = false; return Promise.resolve('same'); }
    var text = '{"format":' + JSON.stringify(pack.format) + ',"schema":' + pack.schema
      + ',"exportedAt":' + JSON.stringify(pack.exportedAt) + ',"keyCount":' + pack.keyCount + ',"keys":' + keysText + '}';
    pack = keysText = null;
    return api(c, '/backups?device=' + encodeURIComponent(c.device || guessDevice()), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text
    }).then(function (r) { return r.json(); }).then(function (res) {
      writeJson(LAST_KEY, { at: res.at || Date.now(), hash: h });
      _busy = false;
      return 'ok';
    }, function (e) {
      writeJson(LAST_KEY, { at: prev.at, hash: prev.hash, err: errText(e), errAt: Date.now() });
      _busy = false;
      try { console.warn('[AFK-cloudsave] 上傳失敗', e); } catch (x) {}
      throw e;
    });
  }

  function autoOn() { var c = cfg(); return !!(c && c.auto && on()); }
  function autoTick() {
    if (!autoOn() || document.visibilityState === 'hidden') return;
    if (Date.now() - _lastTry < AUTO_EVERY) return;
    upload(true).then(refreshStatus, refreshStatus);
  }
  function onHide() {
    if (document.visibilityState !== 'hidden' || !autoOn()) return;
    if (Date.now() - _lastTry < HIDE_MIN) return;
    upload(true).catch(function () {});
  }

  // ── 面板 ───────────────────────────────────────────────────
  var _layer = null, _editing = false;
  function note(msg, bad) {
    var el = document.getElementById('m-csv-note'); if (!el) return;
    el.className = bad ? 'csv-note csv-bad' : 'csv-note';
    el.innerHTML = esc(msg).replace(/\n/g, '<br>');
  }
  function statusHtml() {
    var l = last();
    if (l.err && (!l.at || l.errAt > l.at)) return '<span class="csv-bad">❌ 上次上傳失敗：' + esc(l.err) + '</span>';
    if (l.at) return '上次上傳：' + esc(fmtTime(l.at));
    return '還沒有上傳過。';
  }
  function refreshStatus() { var el = document.getElementById('m-csv-status'); if (el) el.innerHTML = statusHtml(); }

  function renderSetup() {
    var c = readJson(CFG_KEY) || {};
    return '<div class="csv-desc">填入你部署的雲端備份伺服器，每台裝置各填一次。</div>'
      + '<label class="csv-lb">伺服器網址<input id="m-csv-url" class="csv-in" placeholder="https://cloudsave.xxx.workers.dev" value="' + esc(c.url || '') + '" autocapitalize="off" autocorrect="off" spellcheck="false"></label>'
      + '<label class="csv-lb">密碼<input id="m-csv-token" class="csv-in" type="password" value="' + esc(c.token || '') + '" autocomplete="off"></label>'
      + '<label class="csv-lb">這台裝置的名稱<input id="m-csv-dev" class="csv-in" maxlength="20" value="' + esc(c.device || guessDevice()) + '"></label>'
      + '<div class="csv-btns"><button id="m-csv-save" class="csv-b csv-go">儲存並測試連線</button>'
      + (cfg() ? '<button id="m-csv-cancel" class="csv-b csv-plain">取消</button>' : '') + '</div>'
      + '<div id="m-csv-note" class="csv-note"></div>';
  }
  function renderMain() {
    var c = cfg();
    return '<div id="m-csv-status" class="csv-status">' + statusHtml() + '</div>'
      + '<div class="csv-btns">'
      + '<button id="m-csv-up" class="csv-b csv-go">☁ 立即上傳</button>'
      + '<label class="csv-chk"><input id="m-csv-auto" type="checkbox"' + (c.auto ? ' checked' : '') + '> 自動上傳（每 10 分鐘）</label>'
      + '<button id="m-csv-list" class="csv-b csv-danger">📥 從雲端還原</button>'
      + '<div id="m-csv-rows"></div>'
      + '<button id="m-csv-edit" class="csv-b csv-plain">⚙ 變更設定（' + esc(c.device || guessDevice()) + '）</button>'
      + '</div>'
      + '<div id="m-csv-note" class="csv-note"></div>';
  }
  function render() {
    var body = document.getElementById('m-csv-body'); if (!body) return;
    var setup = _editing || !cfg();
    body.innerHTML = setup ? renderSetup() : renderMain();
    if (setup) bindSetup(); else bindMain();
  }

  function bindSetup() {
    var v = function (id) { var el = document.getElementById(id); return el ? String(el.value).trim() : ''; };
    document.getElementById('m-csv-save').addEventListener('click', function () {
      var url = v('m-csv-url'), token = v('m-csv-token'), device = v('m-csv-dev') || guessDevice();
      if (!/^https?:\/\//i.test(url)) { note('❌ 網址要以 https:// 開頭。', true); return; }
      if (!token) { note('❌ 請輸入密碼。', true); return; }
      var old = readJson(CFG_KEY) || {};
      var c = { url: url, token: token, device: device, auto: old.auto !== false };
      note('連線中…');
      api(c, '/backups').then(function () {
        writeJson(CFG_KEY, c);
        _editing = false;
        render();
        note('✅ 連線成功。');
      }).catch(function (e) { note('❌ ' + errText(e, true), true); });
    });
    var cancel = document.getElementById('m-csv-cancel');
    if (cancel) cancel.addEventListener('click', function () { _editing = false; render(); });
  }

  function bindMain() {
    document.getElementById('m-csv-up').addEventListener('click', function () {
      var btn = this; btn.disabled = true; btn.textContent = '上傳中…';
      upload(false).then(function () { note('✅ 已上傳。'); }, function (e) { note('❌ ' + errText(e), true); })
        .then(function () { btn.disabled = false; btn.textContent = '☁ 立即上傳'; refreshStatus(); });
    });
    document.getElementById('m-csv-auto').addEventListener('change', function () {
      var c = cfg(); if (!c) return;
      c.auto = this.checked; writeJson(CFG_KEY, c);
    });
    document.getElementById('m-csv-list').addEventListener('click', loadList);
    document.getElementById('m-csv-edit').addEventListener('click', function () { _editing = true; render(); });
  }

  function loadList() {
    var c = cfg(), box = document.getElementById('m-csv-rows'); if (!c || !box) return;
    box.innerHTML = '<div class="csv-desc">讀取中…</div>';
    api(c, '/backups').then(function (r) { return r.json(); }).then(function (list) {
      if (!list.length) { box.innerHTML = '<div class="csv-desc">雲端還沒有備份。</div>'; return; }
      box.innerHTML = '<div class="csv-rows">' + list.map(function (b) {
        return '<div class="csv-row"><span>' + esc(fmtTime(b.at)) + '　' + esc(b.device || '') + '</span>'
          + '<button class="csv-b csv-danger csv-mini" data-id="' + esc(b.id) + '">還原</button></div>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(box.querySelectorAll('[data-id]'), function (btn) {
        btn.addEventListener('click', function () { restore(btn.getAttribute('data-id'), btn); });
      });
    }).catch(function (e) { box.innerHTML = ''; note('❌ ' + errText(e), true); });
  }

  function restore(id, btn) {
    var c = cfg(); if (!c) return;
    btn.disabled = true;
    note('下載中…');
    api(c, '/backups/' + encodeURIComponent(id)).then(function (r) { return r.text(); }).then(function (text) {
      var v = FS.validate(text);
      if (!v.ok) { note('❌ ' + v.err, true); return; }
      note('');
      closeModal();
      FS.confirmAndApply(v);
    }).catch(function (e) { note('❌ ' + errText(e), true); })
      .then(function () { btn.disabled = false; });
  }

  function openModal() {
    if (!on()) return;
    buildModal();
    if (_layer) return;
    _editing = false;
    render();
    document.getElementById('m-csv-modal').classList.add('open');
    _layer = window.AFK_UI ? AFK_UI.openLayer(hideModal) : null;
  }
  function hideModal() { var m = document.getElementById('m-csv-modal'); if (m) m.classList.remove('open'); _layer = null; }
  function closeModal() { if (_layer && window.AFK_UI) AFK_UI.closeLayer(_layer); else hideModal(); }

  function buildModal() {
    injectCSS();
    if (document.getElementById('m-csv-modal')) return;
    var modal = document.createElement('div');
    modal.id = 'm-csv-modal';
    modal.innerHTML = '<div id="m-csv-card">'
      + '<div id="m-csv-head"><span id="m-csv-title">☁ 雲端備份</span><button id="m-csv-close" title="關閉">✕</button></div>'
      + '<div id="m-csv-body"></div></div>';
    document.body.appendChild(modal);
    document.getElementById('m-csv-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  }

  // Tailwind 是預建置的 → 一律用自己的具名 class;外觀對齊 afk-fullsave
  function injectCSS() {
    if (document.getElementById('m-csv-style')) return;
    var s = document.createElement('style'); s.id = 'm-csv-style';
    s.textContent = [
      '#m-csv-modal{display:none;position:fixed;inset:0;top:var(--orig-bar-h,0px);z-index:1000;background:rgba(2,6,23,.82);align-items:flex-start;justify-content:center;padding:24px 12px;font-family:system-ui,"Segoe UI",sans-serif;}',
      '#m-csv-modal.open{display:flex;}',
      '#m-csv-card{background:#0f172a;border:1px solid #334155;border-radius:12px;max-width:520px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.6);}',
      '#m-csv-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #334155;}',
      '#m-csv-title{color:#fcd34d;font-weight:700;}',
      '#m-csv-close{color:#94a3b8;background:none;border:0;font-size:18px;cursor:pointer;padding:2px 6px;}',
      '#m-csv-body{padding:14px;overflow:auto;color:#e2e8f0;font-size:13px;line-height:1.7;}',
      '.csv-desc{color:#94a3b8;font-size:12px;margin-bottom:10px;}',
      '.csv-status{margin-bottom:12px;}',
      '.csv-btns{display:flex;flex-direction:column;gap:8px;}',
      '.csv-b{border-radius:8px;padding:10px 12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid transparent;}',
      '.csv-b:disabled{opacity:.6;cursor:default;}',
      '.csv-go{background:#0e7490;border-color:#0891b2;color:#cffafe;}',
      '.csv-danger{background:#7f1d1d;border-color:#b91c1c;color:#fecaca;}',
      '.csv-plain{background:#1e293b;border-color:#475569;color:#cbd5e1;font-weight:400;font-size:13px;}',
      '.csv-mini{padding:6px 12px;font-size:13px;flex:0 0 auto;}',
      '.csv-chk{display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer;}',
      '.csv-chk input{width:18px;height:18px;}',
      '.csv-lb{display:block;margin-bottom:10px;color:#cbd5e1;font-size:12px;}',
      '.csv-in{display:block;width:100%;box-sizing:border-box;margin-top:4px;background:#020617;border:1px solid #475569;border-radius:8px;color:#e2e8f0;padding:9px 10px;font-size:15px;}',
      '.csv-in:focus{outline:none;border-color:#0891b2;}',
      '.csv-rows{display:flex;flex-direction:column;gap:6px;max-height:40vh;overflow:auto;}',
      '.csv-row{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#020617;border:1px solid #334155;border-radius:8px;padding:6px 6px 6px 10px;}',
      '.csv-note{margin-top:10px;font-size:12.5px;color:#a7f3d0;min-height:1em;}',
      '.csv-bad,.csv-note.csv-bad{color:#fca5a5;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  function init() {
    window.AFK_SETTINGS = window.AFK_SETTINGS || { _items: [], add: function (it) { this._items.push(it); } };
    AFK_SETTINGS.add({ label: '☁ 雲端備份', onClick: openModal });
    setInterval(autoTick, 60 * 1000);
    document.addEventListener('visibilitychange', onHide);
    try { console.log('[AFK-cloudsave] hooks OK'); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.AFK_CLOUDSAVE = { upload: upload, open: openModal };
})();
