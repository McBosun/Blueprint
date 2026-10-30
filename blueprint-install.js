// Installable app: service worker, "Install Blueprint" button, update and offline notices.
(() => {
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ua = navigator.userAgent, ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  document.head.insertAdjacentHTML('beforeend', '<style>#bpbar{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:40;display:none;gap:10px;align-items:center;background:#0b1b3a;color:#fff;border-radius:14px;padding:10px 14px;font-size:13px;box-shadow:0 4px 18px rgba(0,0,0,.3)}#bpbar button{background:#1e6bff;color:#fff;border:0;border-radius:99px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer}#bpbar .x{background:transparent;font-size:16px;padding:4px 8px}#bpbar span{flex:1}</style>');
  document.body.insertAdjacentHTML('beforeend', "<div id='bpbar'><span id='bpt'></span><button id='bpa'></button><button class='x' id='bpx' aria-label='Dismiss'>✕</button></div><div class='sheet' id='ins'><div><h2>Install Blueprint</h2><div id='insb' style='font-size:14px;line-height:1.6'></div><button class='btn' id='insx'>Got it</button></div></div>");
  const bar = $('#bpbar'); let action = null, onX = null;
  const showBar = (text, label, act, dismiss) => { $('#bpt').textContent = text; $('#bpa').textContent = label; action = act; onX = dismiss; bar.style.display = 'flex'; };
  const hideBar = () => { bar.style.display = 'none'; };
  $('#bpa').onclick = () => { hideBar(); if (action) action(); };
  $('#bpx').onclick = () => { hideBar(); if (onX) onX(); };
  $('#insx').onclick = () => $('#ins').classList.remove('on');

  // ---------- Service worker and updates ----------
  if ('serviceWorker' in navigator) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) showBar('A new version of Blueprint is ready.', 'Reload', () => location.reload()); });
    addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { setInterval(() => r.update().catch(() => {}), 3600000); }).catch(() => {}));
  }

  // ---------- Install ----------
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  addEventListener('appinstalled', () => { deferred = null; hideBar(); const r = $('#instrow'); if (r) r.hidden = true; });
  function install() {
    if (deferred) { deferred.prompt(); deferred.userChoice.finally(() => { deferred = null; }); return; }
    $('#insb').innerHTML = ios
      ? "<ol style='padding-left:20px;margin:0'><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>"
      : "<ol style='padding-left:20px;margin:0'><li>Open your browser menu (⋮ or ⋯).</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm. Blueprint appears on your home screen.</li></ol>";
    $('#ins').classList.add('on');
  }
  const me = $('#me');
  if (me && $('#outrow') && !standalone()) {
    $('#outrow').insertAdjacentHTML('beforebegin', "<div class='row' id='instrow'><span>Install Blueprint on your phone</span><button class='btn alt' id='instb' style='width:auto;margin:0'>Install</button></div>");
    $('#instb').onclick = install;
  }

  // A gentle one-time reminder on the third visit
  if (!standalone() && !store.get('bp-ins-no')) {
    const n = (+store.get('bp-visits') || 0) + 1; store.set('bp-visits', n);
    if (n >= 3) setTimeout(() => showBar('Install Blueprint for a full-screen app.', 'Install', install, () => store.set('bp-ins-no', '1')), 6000);
  }

  // ---------- Offline notice ----------
  const off = () => showBar('You’re offline. Some things won’t load.', 'OK', null, null);
  addEventListener('offline', off);
  addEventListener('online', () => { if ($('#bpt').textContent.startsWith('You’re offline')) hideBar(); });
  if (!navigator.onLine) off();
})();
