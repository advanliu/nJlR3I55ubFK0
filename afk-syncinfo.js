/* ============================================================================
 * afk-syncinfo.js — 首頁顯示「原作者署名 + 正版/社群連結」
 *
 * 純靜態、不發任何網路請求。
 *   - 原本會 fetch version.json 顯示「最後同步原版時間」:原作者已停更、數值對玩家無意義,
 *     且 no-store 請求在開機時要排隊(約 3 秒~更久才冒出來),已移除。
 *   - 檔名沿用歷史名稱,避免改名折騰快取與引用。
 *
 * 掛接:在 index.html 的 </body> 前加一行 <script src="afk-syncinfo.js"></script>
 * ========================================================================== */
(function () {
  'use strict';
  if (window.AFK_TOGGLES && !AFK_TOGGLES.enabled('skin')) return;   // 🎚️ 外掛開關:與 afk-skin 共用「首頁外掛入口/資訊」一顆開關(都是純首頁視覺)

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function injectCSS() {
    if (document.getElementById('afk-syncinfo-style')) return;
    var s = document.createElement('style');
    s.id = 'afk-syncinfo-style';
    s.textContent =
      '#afk-syncinfo,#afk-syncinfo-links{color:#64748b;font-size:12px;text-align:center;letter-spacing:.3px;line-height:1.6;}' +
      '.afk-si-row{margin-top:1px;}' +
      '.afk-si-link{color:#7dd3fc;text-decoration:underline;}' +
      '.afk-si-dot{color:#475569;margin:0 5px;}' +
      // 原作者名:彩虹漸層流動(會動)
      '.afk-si-name{font-weight:bold;background:linear-gradient(90deg,#f472b6,#fb923c,#fde047,#34d399,#22d3ee,#a78bfa,#f472b6);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:afk-si-flow 6s linear infinite;}' +
      '@keyframes afk-si-flow{to{background-position:220% 0;}}';
    document.head.appendChild(s);
  }

  function init() {
    var menu = document.getElementById('main-menu');
    if (!menu) { console.warn('[AFK-syncinfo] 找不到 #main-menu,原作者資訊不顯示。'); return; }
    if (document.getElementById('afk-syncinfo')) return;
    injectCSS();
    // 頂部:原作者一列(afk-skin 會把這塊排到外掛框最上方)
    var foot = document.createElement('div');
    foot.id = 'afk-syncinfo';
    foot.innerHTML =
      '<div class="afk-si-row"><span class="afk-si-author">原作者：<span class="afk-si-name">秋玥</span></span>' +
      '（<a class="afk-si-link" href="https://shines871.github.io/idle-lineage-class/" target="_blank" rel="noopener">原版連結</a>）</div>';
    menu.appendChild(foot);
    // 連結:巴哈討論串一列;Line群與Discord群同一列(afk-skin 會排到框內較下方)
    var links = document.createElement('div');
    links.id = 'afk-syncinfo-links';
    links.innerHTML =
      '<div class="afk-si-row"><a class="afk-si-link" href="https://forum.gamer.com.tw/C.php?bsn=84452&amp;snA=8362" target="_blank" rel="noopener">巴哈討論串</a>（本加掛版發布在 <a class="afk-si-link" href="https://forum.gamer.com.tw/Co.php?bsn=84452&amp;sn=37297" target="_blank" rel="noopener">301</a> 樓）</div>' +
      '<div class="afk-si-row"><a class="afk-si-link" href="https://line.me/ti/g2/RRXPx6rMc8ZhxiuNSSziKtcjnhc2AXEPuIOpVA?utm_source=invitation&amp;utm_medium=link_copy&amp;utm_campaign=default" target="_blank" rel="noopener">[加入Line群討論]</a> <a class="afk-si-link" href="https://discord.gg/tMcpkK9yUZ" target="_blank" rel="noopener">[加入Discord群]</a></div>';
    menu.appendChild(links);
    console.log('[AFK-syncinfo] hooks OK — 首頁顯示原作者與連結。');
  }

  ready(init);
})();
