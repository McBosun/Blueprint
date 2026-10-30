// Notification settings (which alerts you get) and phone alerts (push) on/off.
(async () => {
  let tries = 0;
  while ((!window.BP || !document.getElementById('sg4')) && tries++ < 80) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP, box = document.getElementById('sg4'); if (!BP || !box) return; // demo mode
  const sb = BP.sb, me = () => BP.me, C = window.BLUEPRINT_CONFIG || {};
  const ua = navigator.userAgent, ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const KINDS = [['likes', 'Likes on my posts'], ['comments', 'Comments on my posts'], ['follows', 'New followers'], ['lives', 'Lives from people I follow'], ['messages', 'New messages'], ['views', 'Profile views'], ['msg_preview', 'Show message text in phone alerts']];

  box.innerHTML = KINDS.map(([k, l]) => `<div class='row'><span>${l}</span><input type='checkbox' data-k='${k}' ${k === 'msg_preview' ? '' : 'checked'} style='width:auto'></div>`).join('') +
    "<div class='row'><span id='pst'>Phone alerts: checking…</span><button class='btn alt' id='pbtn' style='width:auto;margin:0'>Turn on</button></div>" +
    "<div class='row' id='ptrow'><span>Send a test alert</span><button class='btn alt' id='ptest' style='width:auto;margin:0'>Test</button></div>";
  const st = document.getElementById('pst'), pb = document.getElementById('pbtn'), pt = document.getElementById('ptrow');

  async function loadPrefs() {
    if (!me()) return;
    const r = await sb.from('bp_notif_prefs').select('*').eq('user_id', me().id).maybeSingle(), p = r.data || {};
    box.querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k; i.checked = p[k] !== undefined ? p[k] : k !== 'msg_preview'; });
  }
  box.onchange = async e => {
    const k = e.target.dataset && e.target.dataset.k; if (!k) return;
    if (!me()) { e.target.checked = !e.target.checked; return BP.openAuth(); }
    const r = await sb.from('bp_notif_prefs').upsert({ user_id: me().id, [k]: e.target.checked, updated_at: new Date().toISOString() });
    if (r.error) BP.note('Couldn’t save: ' + r.error.message);
  };

  // ---------- Phone alerts ----------
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const key = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); };
  async function state() {
    if (!C.vapidKey) { st.textContent = 'Phone alerts: not set up yet (see README)'; pb.hidden = pt.hidden = true; return; }
    if (!supported()) { st.textContent = ios && !standalone ? 'Phone alerts: install Blueprint to your home screen first' : 'Phone alerts: not supported in this browser'; pb.hidden = pt.hidden = true; return; }
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(), on = !!sub && Notification.permission === 'granted';
    st.textContent = 'Phone alerts: ' + (Notification.permission === 'denied' ? 'blocked in your browser settings' : on ? 'on' : 'off');
    pb.hidden = Notification.permission === 'denied'; pb.textContent = on ? 'Turn off' : 'Turn on'; pt.hidden = !on;
  }
  pb.onclick = async () => {
    if (!me()) return BP.openAuth();
    const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted' && pb.textContent === 'Turn off') {
      await sb.from('bp_push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); BP.note('Phone alerts are off.', true); return state();
    }
    if (sub) await sub.unsubscribe(); // always start with a fresh subscription for this account
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { BP.note('Alerts were not allowed. You can change this in your browser or phone settings.'); return state(); }
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(C.vapidKey) });
      const j = sub.toJSON(), r = await sb.from('bp_push_subs').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: ua.slice(0, 200) });
      if (r.error) throw r.error;
      BP.note('Phone alerts are on. Tap Test to try one.', true);
    } catch (e) { BP.note('Couldn’t turn on alerts: ' + (e.message || e)); }
    state();
  };
  document.getElementById('ptest').onclick = async () => {
    const r = await sb.functions.invoke('send-push', { body: { test: true } });
    BP.note(r.error ? 'Test failed: ' + r.error.message + '. Check the function is deployed.' : r.data && r.data.sent ? 'Sent. Look at your lock screen.' : 'No phone is registered yet. Turn alerts on first.', !r.error && r.data && r.data.sent);
  };

  document.querySelector('nav [data-v="me"]').addEventListener('click', () => { loadPrefs(); state(); });
  if (me()) { loadPrefs(); }
  state();
})();
