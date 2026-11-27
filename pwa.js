// Web-App „Darts aktuell“: Service Worker anmelden + gut sichtbarer „App aufs Handy“-Knopf
// Android/Chrome/Edge: ein Klick öffnet das Installations-Fenster des Browsers.
// iPhone/iPad: Apple erlaubt das nicht per Knopf – dort erklärt ein Fenster die zwei Schritte.
// Die Platzhalter __SB_URL__/__SB_KEY__ setzt scripts/build.mjs ein (Zählung von Installationen, ohne Cookies).
(function () {
  'use strict';
  var d = document, w = window, LS = w.localStorage;
  var get = function (k) { try { return LS.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { LS.setItem(k, v); } catch (e) { } };

  if ('serviceWorker' in navigator) w.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { }); });

  var ping = function (p) {
    try {
      if (location.hostname !== 'dartsaktuell.com' || navigator.webdriver) return;
      fetch('__SB_URL__/rest/v1/rpc/track_view', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: '__SB_KEY__', Authorization: 'Bearer __SB_KEY__' }, body: JSON.stringify({ p_path: p, p_ref: 'app' }) }).catch(function () { });
    } catch (e) { }
  };

  var standalone = (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (standalone) { try { if (!sessionStorage.getItem('da-app')) { sessionStorage.setItem('da-app', '1'); ping('/_app/start'); } } catch (e) { } return; }

  var lang = (d.documentElement.lang || 'de').slice(0, 2);
  var T = {
    de: { title: 'Darts aktuell als App', sub: 'Kostenlos · Live-Ergebnisse & Tippspiel', btn: 'App holen', close: 'Schließen', foot: '📲 App aufs Handy',
      iosH: 'So kommt die App auf dein iPhone', ios1: 'Tippe unten (oder oben) auf das Teilen-Symbol', ios2: 'Wähle „Zum Home-Bildschirm“ (evtl. etwas nach unten wischen)', ios3: 'Tippe oben rechts auf „Hinzufügen“ – fertig!',
      gH: 'So kommt die App auf dein Handy', g1: 'Öffne das Browser-Menü (⋮ oder ☰)', g2: 'Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“', g3: 'Bestätigen – das Darts-aktuell-Icon liegt jetzt auf deinem Handy', ok: 'Alles klar', done: 'Installiert ✓',
      inH: 'Erst in Safari öffnen', in1: 'Du bist gerade in einer App (z. B. Google, Instagram, TikTok). Dort fehlt „Zum Home-Bildschirm“.', in2: 'Tippe auf ⋯ bzw. das Teilen-Symbol und wähle „In Safari öffnen“ (oder „Im Browser öffnen“)', in3: 'In Safari: Teilen-Symbol → „Zum Home-Bildschirm“ → „Hinzufügen“', copy: 'Link kopieren', copied: 'Link kopiert – jetzt in Safari einfügen ✓' },
    en: { title: 'Get Darts aktuell as an app', sub: 'Free · live scores & predictor', btn: 'Get the app', close: 'Close', foot: '📲 Install the app',
      iosH: 'Add the app to your iPhone', ios1: 'Tap the Share icon at the bottom (or top)', ios2: 'Choose “Add to Home Screen” (scroll down a little if needed)', ios3: 'Tap “Add” in the top right – done!',
      gH: 'Add the app to your phone', g1: 'Open the browser menu (⋮ or ☰)', g2: 'Choose “Install app” or “Add to Home screen”', g3: 'Confirm – the Darts aktuell icon is now on your phone', ok: 'Got it', done: 'Installed ✓',
      inH: 'Open in Safari first', in1: 'You are inside an app (e.g. Google, Instagram, TikTok), which has no “Add to Home Screen”.', in2: 'Tap ⋯ or the Share icon and choose “Open in Safari” (or “Open in browser”)', in3: 'In Safari: Share icon → “Add to Home Screen” → “Add”', copy: 'Copy link', copied: 'Link copied – paste it into Safari ✓' },
    nl: { title: 'Darts aktuell als app', sub: 'Gratis · live-uitslagen & poule', btn: 'App installeren', close: 'Sluiten', foot: '📲 App op je telefoon',
      iosH: 'Zo zet je de app op je iPhone', ios1: 'Tik onderaan (of bovenaan) op het deel-icoon', ios2: 'Kies „Zet op beginscherm” (eventueel iets naar beneden scrollen)', ios3: 'Tik rechtsboven op „Voeg toe” – klaar!',
      gH: 'Zo zet je de app op je telefoon', g1: 'Open het browsermenu (⋮ of ☰)', g2: 'Kies „App installeren” of „Toevoegen aan startscherm”', g3: 'Bevestig – het Darts-aktuell-icoon staat nu op je telefoon', ok: 'Begrepen', done: 'Geïnstalleerd ✓',
      inH: 'Eerst openen in Safari', in1: 'Je zit nu in een app (bijv. Google, Instagram, TikTok). Daar ontbreekt „Zet op beginscherm”.', in2: 'Tik op ⋯ of het deel-icoon en kies „Open in Safari” (of „Open in browser”)', in3: 'In Safari: deel-icoon → „Zet op beginscherm” → „Voeg toe”', copy: 'Link kopiëren', copied: 'Link gekopieerd – plak hem in Safari ✓' }
  }[lang] || null;
  if (!T) return;

  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // In-App-Browser (Google-App, Instagram, Facebook, TikTok, Snapchat …) können auf dem iPhone nichts zum Home-Bildschirm legen
  var inApp = isIOS && /GSA\/|FBAN|FBAV|FB_IAB|Instagram|musical_ly|BytedanceWebview|TikTok|Snapchat|Line\/|LinkedInApp|Twitter|Pinterest/i.test(ua);
  var mobile = isIOS || /android|mobile/i.test(ua);
  var deferred = null;

  var css = '.pwa-bar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9999;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;background:#141816;color:#fff;border:2px solid #ffd54a;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:15px/1.3 Barlow,system-ui,sans-serif;max-width:560px;margin:0 auto;animation:pwaIn .35s ease-out}' +
    '@keyframes pwaIn{from{transform:translateY(120%);opacity:0}to{transform:none;opacity:1}}' +
    '.pwa-bar img{width:44px;height:44px;border-radius:10px;flex:none}.pwa-bar .pwa-t{flex:1;min-width:0}.pwa-bar b{display:block;font:700 17px/1.2 Oswald,system-ui,sans-serif;letter-spacing:.2px}.pwa-bar span{display:block;font-size:13px;color:#cfe6d6;margin-top:2px}' +
    '.pwa-go{flex:none;background:#ffd54a;color:#122017;border:0;border-radius:999px;padding:0 18px;min-height:44px;font:700 15px Barlow,system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 0 #b8941c}.pwa-go:active{transform:translateY(1px)}' +
    '.pwa-x{flex:none;background:transparent;border:0;color:#cfe6d6;font-size:22px;line-height:1;width:32px;height:44px;cursor:pointer;padding:0}' +
    '.pwa-m{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:12px}' +
    '.pwa-c{background:#fff;color:#141714;border-radius:18px;max-width:440px;width:100%;padding:20px 20px calc(20px + env(safe-area-inset-bottom));font:16px/1.45 Barlow,system-ui,sans-serif;border-top:6px solid #136b3a}' +
    '.pwa-c h2{margin:0 0 14px;font:700 21px/1.2 Oswald,system-ui,sans-serif;color:#136b3a}.pwa-c ol{margin:0 0 18px;padding:0;list-style:none;counter-reset:s}' +
    '.pwa-c li{counter-increment:s;display:flex;gap:12px;align-items:center;margin:0 0 12px}.pwa-c li:before{content:counter(s);flex:none;width:30px;height:30px;border-radius:50%;background:#136b3a;color:#fff;font-weight:700;display:grid;place-items:center}' +
    '.pwa-c li svg{flex:none;width:24px;height:24px;color:#0a84ff}.pwa-c .pwa-go{width:100%}' +
    '.pwa-foot{background:#ffd54a!important;color:#122017!important;border-radius:999px;padding:4px 12px;font-weight:700;text-decoration:none!important;display:inline-block;margin:6px 0;border:0;cursor:pointer;font-size:15px}' +
    '@media (min-width:900px){.pwa-bar{left:auto;right:20px;bottom:20px;max-width:420px}}';

  var el = function (tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var share = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  var plus = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

  function howTo() {
    var m = el('div', 'pwa-m'), c = el('div', 'pwa-c');
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    if (inApp) {
      c.innerHTML = '<h2>' + T.inH + '</h2><p style="margin:0 0 14px">' + T.in1 + '</p><ol><li><span>' + T.in2 + '</span></li><li>' + share + '<span>' + T.in3 + '</span></li></ol>';
      var cp = el('button', 'pwa-go', T.copy); cp.type = 'button'; cp.style.marginBottom = '10px';
      cp.onclick = function () { var u = 'https://dartsaktuell.com/'; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { cp.textContent = T.copied; }).catch(function () { cp.textContent = u; }); };
      c.appendChild(cp);
    } else c.innerHTML = isIOS
      ? '<h2>' + T.iosH + '</h2><ol><li>' + share + '<span>' + T.ios1 + '</span></li><li>' + plus + '<span>' + T.ios2 + '</span></li><li><span>' + T.ios3 + '</span></li></ol>'
      : '<h2>' + T.gH + '</h2><ol><li><span>' + T.g1 + '</span></li><li><span>' + T.g2 + '</span></li><li><span>' + T.g3 + '</span></li></ol>';
    var ok = el('button', 'pwa-go', T.ok); ok.type = 'button';
    var shut = function () { m.remove(); };
    ok.onclick = shut; m.onclick = function (e) { if (e.target === m) shut(); };
    c.appendChild(ok); m.appendChild(c); d.body.appendChild(m); ok.focus();
    ping(inApp ? '/_app/anleitung-inapp' : '/_app/anleitung');
  }

  function install() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (r) { if (r && r.outcome === 'accepted') hideBar(); }).catch(function () { });
      deferred = null;
    } else howTo();
  }

  var bar = null;
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function showBar() {
    if (bar || get('da-installed')) return;
    var until = +get('da-hide') || 0; if (Date.now() < until) return;
    bar = el('div', 'pwa-bar');
    bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', T.title);
    bar.innerHTML = '<img src="/img/icon-192.png" alt=""><div class="pwa-t"><b>' + T.title + '</b><span>' + T.sub + '</span></div>';
    var go = el('button', 'pwa-go', T.btn); go.type = 'button'; go.onclick = install;
    var x = el('button', 'pwa-x', '×'); x.type = 'button'; x.setAttribute('aria-label', T.close);
    x.onclick = function () { set('da-hide', String(Date.now() + 3 * 864e5)); hideBar(); };
    bar.appendChild(go); bar.appendChild(x); d.body.appendChild(bar);
  }

  function init() {
    var st = el('style'); st.textContent = css; d.head.appendChild(st);
    // Dauerhafter Knopf im Seitenfuß (auch nach dem Wegklicken der Leiste) + jedes Element mit data-install
    var f = d.querySelector('footer');
    if (f && !d.querySelector('.pwa-foot')) { var b = el('button', 'pwa-foot', T.foot); b.type = 'button'; b.onclick = install; var p = el('p'); p.appendChild(b); f.insertBefore(p, f.firstChild); }
    d.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-install]'); if (t) { e.preventDefault(); install(); } });
    // Handy: Leiste nach kurzem Lesen einblenden; Desktop nur, wenn der Browser wirklich installieren kann
    if (mobile) setTimeout(showBar, 2500);
  }

  w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; setTimeout(showBar, mobile ? 2500 : 4000); });
  w.addEventListener('appinstalled', function () { set('da-installed', '1'); hideBar(); deferred = null; ping('/_app/installiert'); });

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
