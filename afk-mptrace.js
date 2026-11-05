/* ============================================================================
 * afk-mptrace.js — 診斷:隊長 MP 被扣時,把「是誰扣的」寫進系統日誌(預設關・查完即移除)
 *
 * 用法:外掛面板打開「追蹤隊長 MP 下降」→ 做會掉 MP 的動作 → 看系統日誌的 [MP追蹤] 行(截圖即可)。
 * 作法:在 player 物件上把 mp 換成 getter/setter(值照舊存取、JSON 序列化結果不變),
 *   一次下降 ≥ 8 時取呼叫堆疊的函式名寫一行。player 被整個換新(讀檔)時下一輪輪詢重掛。
 * 只讀、不改任何遊戲數值;開關關掉就不記。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'mptrace', name: '追蹤隊長 MP 下降(診斷)', group: '系統與其他', def: false,
    desc: '隊長 MP 一次掉 8 以上時,在系統日誌寫下是哪個函式扣的'
  });
  function on() { try { return !!(window.AFK_TOGGLES && AFK_TOGGLES.enabled('mptrace')); } catch (e) { return false; } }

  var THRESHOLD = 8;
  var tracked = null;

  function frames() {
    var out = [];
    try {
      var lines = String(new Error().stack || '').split('\n');
      for (var i = 0; i < lines.length; i++) {
        var m = /at (?:async )?([^\s(]+) \(|^([^@\s]+)@/.exec(lines[i].trim());
        var name = m && (m[1] || m[2]);
        if (!name || name === 'Error' || name === 'set' || name === 'Object.set') continue;
        out.push(name.replace(/^Object\./, ''));
        if (out.length >= 7) break;
      }
    } catch (e) {}
    return out;
  }

  // 在 shareTeamBuffs 裡扣的:列出隊長「學了+身上有」的可分享增益,以及目前缺它的隊友(扣款發生在補上之前,所以缺者還看得到)
  function shareInfo() {
    var out = [];
    try {
      if (typeof TEAM_SHARE_BUFFS === 'undefined') return '';
      var al = (player.allies || []).filter(function (a) { return a && !a._downed; });
      (player.skills || []).forEach(function (sid) {
        if (!TEAM_SHARE_BUFFS.has(sid) || !((player.buffs || {})[sid] > 0)) return;
        var sk = DB.skills[sid] || {};
        var lack = al.filter(function (a) { return !((a.buffs || {})[sid] > 0); }).map(function (a) { return a._allyName; });
        out.push((sk.n || sid) + '(' + sid + ',耗' + (sk.mp || '?') + ')缺:' + (lack.join('/') || '無'));
      });
    } catch (e) {}
    return out.join('；');
  }

  function attach(p) {
    var v = p.mp;
    try {
      Object.defineProperty(p, 'mp', {
        configurable: true, enumerable: true,
        get: function () { return v; },
        set: function (nv) {
          try {
            if (on() && typeof nv === 'number' && typeof v === 'number' && v - nv >= THRESHOLD) {
              var where = ''; try { where = mapState.current; } catch (e) {}
              var fr = frames();
              var msg = '[MP追蹤] ' + v + '→' + nv + '（' + where + '）← ' + fr.join(' ← ');
              if (fr.indexOf('shareTeamBuffs') >= 0) msg += ' ｜可分享:' + shareInfo();
              console.warn(msg);
              if (typeof logSys === 'function') logSys('<span class="text-amber-300">' + msg.replace(/</g, '&lt;') + '</span>');
            }
          } catch (e) {}
          v = nv;
        }
      });
      tracked = p;
    } catch (e) { try { console.warn('[AFK-mptrace] 掛接失敗,停用。', e); } catch (e2) {} }
  }

  setInterval(function () {
    try { if (typeof player !== 'undefined' && player && player !== tracked && typeof player.mp === 'number') attach(player); } catch (e) {}
  }, 300);

  try { console.log('[AFK-mptrace] hooks OK — 診斷外掛(預設關)。'); } catch (e) {}
})();
