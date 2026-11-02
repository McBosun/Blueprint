// Coins and gifts for live streams, creator earnings and cash-out requests (Paystack).
(async () => {
  const cfg = window.BLUEPRINT_CONFIG || {};
  let tries = 0;
  while ((!window.BP || !document.getElementById('outrow')) && tries++ < 80) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const sb = BP.sb, me = () => BP.me;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const naira = k => '₦' + Math.floor((k || 0) / 100).toLocaleString('en-NG');
  let GIFTS = [], PACKS = [], W = { coins: 0, earnings_kobo: 0, adult: false, min_payout_kobo: 500000, share: 0.5 };
  let liveId = null, isHost = false, host = null, ch = null, total = 0, pick = null; const seen = new Set(), names = {};

  // ---------- Look ----------
  document.head.insertAdjacentHTML('beforeend', `<style>
.gsheet{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center}.gsheet.on{display:flex}
.gsheet>div{background:var(--bg);color:var(--fg);width:100%;max-width:520px;max-height:82%;overflow:auto;border-radius:22px 22px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
.ggrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
.gf{background:var(--card);border:2px solid transparent;border-radius:14px;text-align:center;padding:10px 2px;cursor:pointer}.gf.on{border-color:var(--blue)}
.gf i{display:block;font-style:normal;font-size:30px}.gf b{display:block;font-size:11px;margin-top:2px}.gf small{color:var(--mut);font-size:11px}
#gbn{position:fixed;left:10px;top:calc(120px + env(safe-area-inset-top,0px));z-index:96;display:flex;flex-direction:column;gap:6px;pointer-events:none}
#gbn div{background:rgba(0,0,0,.6);color:#fff;border-radius:99px;padding:6px 14px;font-size:13px;animation:gin .3s ease-out}@keyframes gin{from{transform:translateX(-40px);opacity:0}}
</style>`);
  document.body.insertAdjacentHTML('beforeend', `<div class='gsheet' id='wal'><div></div></div><div class='gsheet' id='gft'><div></div></div><div class='ovp' id='pyo' style='z-index:60'></div><div id='gbn'></div>`);
  const sheet = (id, html) => { const s = $('#' + id); s.firstElementChild.innerHTML = html; s.classList.add('on'); return s; };
  const close = id => $('#' + id).classList.remove('on');
  $('#wal').onclick = e => { if (e.target.id === 'wal') close('wal'); }; $('#gft').onclick = e => { if (e.target.id === 'gft') close('gft'); };

  async function catalog() { const [g, p] = await Promise.all([sb.from('bp_gifts').select('*').eq('active', true).order('sort'), sb.from('bp_coin_packs').select('*').eq('active', true).order('price_kobo')]); GIFTS = g.data || []; PACKS = p.data || []; }
  async function wallet() { if (!me()) return; const r = await sb.rpc('bp_wallet_info'); if (r.data) W = r.data; $('#cnst').textContent = `Coins ${W.coins} · Earnings ${naira(W.earnings_kobo)}`; }
  const nm = async id => { if (!names[id]) { const r = await sb.from('bp_profiles').select('username').eq('id', id).maybeSingle(); names[id] = r.data ? '@' + r.data.username : 'Someone'; } return names[id]; };

  // ---------- Settings row ----------
  $('#outrow').insertAdjacentHTML('beforebegin', "<div class='row' id='cnrow' hidden><span id='cnst'>Coins and earnings</span><button class='btn alt' id='cnb' style='width:auto;margin:0'>Open</button></div><div class='row' id='porow' hidden><span id='pon'>Payout requests</span><button class='btn alt' id='pob' style='width:auto;margin:0'>Review</button></div>");
  document.querySelector('nav [data-v="me"]').addEventListener('click', async () => {
    $('#cnrow').hidden = !me(); if (!me()) { $('#porow').hidden = true; return; }
    wallet(); $('#porow').hidden = !(await sb.from('bp_admins').select('user_id').eq('user_id', me().id).maybeSingle()).data;
  });

  // ---------- Wallet, buying coins ----------
  function openWallet() {
    if (!me()) return BP.openAuth('in');
    sheet('wal', `<h2 style='margin:0 0 8px'>Coins and earnings</h2>
<div class='card'><div style='font-size:28px;font-weight:800'>🪙 ${W.coins}</div><small style='color:var(--mut)'>Coins let you send gifts on live streams. Coins can’t be turned back into money.</small><button class='btn' id='wb' style='margin-top:10px'>Buy coins</button></div>
<div class='card'><div style='font-size:24px;font-weight:800'>${naira(W.earnings_kobo)}</div><small style='color:var(--mut)'>Earned from gifts people send you (${Math.round((W.share || .5) * 100)}% of each gift’s value). Cash out from ${naira(W.min_payout_kobo)}.</small><button class='btn alt' id='wc' style='margin-top:10px'>Cash out</button></div>
<button class='btn alt' id='wx'>Close</button>`);
    $('#wb').onclick = packs; $('#wc').onclick = payoutForm; $('#wx').onclick = () => close('wal');
  }
  $('#cnb').onclick = async () => { await wallet(); openWallet(); };
  async function packs() {
    if (!W.adult) return BP.note('Buying coins is for people aged 18 and over.');
    if (!PACKS.length) await catalog();
    sheet('wal', `<h2 style='margin:0 0 8px'>Buy coins</h2>${PACKS.map(p => `<button class='btn alt' data-pack='${p.id}' style='display:flex;justify-content:space-between'><span>🪙 ${esc(p.label)}</span><b>${naira(p.price_kobo)}</b></button>`).join('')}<p style='font-size:12px;color:var(--mut)'>Secure payment by Paystack. Coins are non-refundable once bought, unless the law says otherwise.</p><button class='btn alt' id='wx'>Back</button>`);
    $('#wx').onclick = openWallet; $('#wal').firstElementChild.onclick = e => { const b = e.target.closest('[data-pack]'); if (b) buy(b.dataset.pack); };
  }
  const loadPay = () => new Promise((ok, no) => { if (window.PaystackPop) return ok(); const s = document.createElement('script'); s.src = 'https://js.paystack.co/v1/inline.js'; s.onload = ok; s.onerror = () => no(new Error('Couldn’t load the payment window.')); document.head.appendChild(s); });
  async function buy(id) {
    if (!cfg.paystackKey) return BP.note('Payments aren’t switched on yet (paystackKey is missing in config.js).');
    const r = await sb.rpc('bp_start_purchase', { pack: id }); if (r.error) return BP.note(r.error.message);
    const d = r.data; try { await loadPay(); } catch (e) { return BP.note(e.message); }
    close('wal');
    PaystackPop.setup({ key: cfg.paystackKey, email: d.email, amount: d.amount_kobo, currency: 'NGN', ref: d.reference, callback: function () { confirmPay(d.reference); }, onClose: function () { BP.note('Payment window closed.'); } }).openIframe();
  }
  async function confirmPay(ref) {
    BP.note('Confirming your payment…', true);
    for (let i = 0; i < 6; i++) {
      const r = await sb.functions.invoke('paystack', { body: { reference: ref } });
      if (r.data && r.data.ok) { await wallet(); return BP.note('+' + r.data.coins + ' coins added!', true); }
      await new Promise(x => setTimeout(x, 2500));
    }
    BP.note('Still confirming. Your coins will appear in a moment.'); wallet();
  }

  // ---------- Gift tray on a live ----------
  function tray() {
    if (!me()) return BP.openAuth('in');
    sheet('gft', `<div style='display:flex;align-items:center;justify-content:space-between'><h2 style='margin:0'>Send a gift</h2><button class='btn alt' id='gcoins' style='width:auto;margin:0;padding:8px 12px'>🪙 <span id='gbal'>${W.coins}</span> +</button></div>
<div class='ggrid'>${GIFTS.map(g => `<div class='gf ${pick === g.id ? 'on' : ''}' data-g='${g.id}'><i>${g.emoji}</i><b>${esc(g.name)}</b><small>🪙 ${g.coins}</small></div>`).join('')}</div><div class='msg' id='gm'></div><button class='btn' id='gsend'>Send</button>`);
    $('#gcoins').onclick = () => { close('gft'); packs(); $('#wal').classList.add('on'); };
    $('#gft').firstElementChild.onclick = async e => {
      const t = e.target.closest('[data-g]'); if (t) { pick = t.dataset.g; document.querySelectorAll('.gf').forEach(x => x.classList.toggle('on', x.dataset.g === pick)); }
      if (e.target.id !== 'gsend') return; const say = (m, ok) => { $('#gm').className = 'msg ' + (ok ? 'ok' : 'err'); $('#gm').textContent = m; };
      if (!pick) return say('Choose a gift first.');
      say('Sending…', true);
      const r = await sb.rpc('bp_send_gift', { p_receiver: host, p_gift: pick, p_live: liveId, p_qty: 1 });
      if (r.error) return say(/enough coins/i.test(r.error.message) ? 'Not enough coins. Tap 🪙 + to buy more.' : r.error.message);
      W.coins = r.data.coins_left; $('#gbal').textContent = W.coins; say('Sent!', true);
    };
  }

  // ---------- Live: receive and show gifts ----------
  async function watch(id, hostMode) {
    unwatch(); liveId = id; isHost = hostMode; total = 0; seen.clear(); if (!GIFTS.length) await catalog(); wallet();
    if (hostMode) { host = me() && me().id; const lt = $('#lt'); if (lt && !$('#lgs')) lt.insertAdjacentHTML('afterend', "<span id='lgs' style='font-size:12px'></span>"); }
    else {
      host = ((await sb.from('bp_lives').select('host_id').eq('id', id).maybeSingle()).data || {}).host_id;
      if (host && me() && host === me().id) return;
      if (!$('#vgift')) $('#vsd').insertAdjacentHTML('afterend', "<button id='vgift' aria-label='Send a gift'>🎁</button>");
      $('#vgift').onclick = tray;
    }
    ch = sb.channel('gifts:' + id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bp_gift_log', filter: 'live_id=eq.' + id }, onGift).subscribe();
  }
  function unwatch() { if (ch) { sb.removeChannel(ch); ch = null; } liveId = null; const b = $('#vgift'); if (b) b.remove(); close('gft'); }
  async function onGift(p) {
    const g = p.new; if (seen.has(g.id)) return; seen.add(g.id);
    const gift = GIFTS.find(x => x.id === g.gift_id); if (!gift) return;
    play(gift.effect, gift.emoji, g.qty);
    const who = await nm(g.sender_id); banner(`${who} sent ${gift.emoji} ${gift.name}${g.qty > 1 ? ' ×' + g.qty : ''}`);
    if (isHost) { total += g.coins; const s = $('#lgs'); if (s) s.textContent = '🎁 ' + total + ' coins'; }
  }
  const banner = t => { const b = $('#gbn'), d = document.createElement('div'); d.textContent = t; b.appendChild(d); while (b.children.length > 3) b.firstChild.remove(); setTimeout(() => d.remove(), 3500); };
  window.BPGifts = { watch, unwatch, play };

  // ---------- Gift animations (our own) ----------
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:95;pointer-events:none'; document.body.appendChild(cv);
  const x = cv.getContext('2d'); let parts = [], raf = 0, last = 0; const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener('resize', fit);
  const R = (a, b) => a + Math.random() * (b - a), add = o => parts.push({ life: 0, max: 2.5, size: 32, vx: 0, vy: 0, g: 0, ...o });
  function play(effect, e, qty) {
    for (let k = 0; k < Math.min(qty || 1, 5); k++) setTimeout(() => {
      const Wd = cv.width, H = cv.height;
      if (effect === 'rose') for (let i = 0; i < 10; i++) add({ ch: e, x: R(Wd * .2, Wd * .8), y: H + 20, vx: R(-20, 20), vy: R(-260, -160), size: R(28, 44), max: 3.2, sway: R(0, 8) });
      if (effect === 'heart') for (let i = 0; i < 18; i++) { const a = R(0, 6.28), s = R(120, 300); add({ ch: e, x: Wd / 2, y: H * .55, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, g: 200, size: R(24, 40), max: 2 }); }
      if (effect === 'drum') { add({ k: 'pop', ch: e, x: Wd / 2, y: H * .5, size: 150, max: 2.2, pulse: 1 }); for (let i = 0; i < 10; i++) add({ ch: '🎵', x: Wd / 2, y: H * .5, vx: R(-200, 200), vy: R(-260, -80), g: 120, size: 28, max: 1.8 }); }
      if (effect === 'fire') for (let i = 0; i < 24; i++) add({ ch: e, x: R(0, Wd), y: H + 10, vx: R(-15, 15), vy: R(-380, -220), size: R(30, 54), max: 2.4 });
      if (effect === 'crown') { add({ k: 'drop', ch: e, x: Wd / 2, y: -60, ty: H * .4, size: 130, max: 2.6 }); for (let i = 0; i < 14; i++) add({ ch: '✨', x: Wd / 2 + R(-90, 90), y: H * .4 + R(-60, 60), vy: R(-40, 20), size: R(16, 28), max: R(1.2, 2.4) }); }
      if (effect === 'cash') { for (let i = 0; i < 40; i++) { add({ ch: e, x: 0, y: H, vx: R(220, 520), vy: R(-1100, -650), g: 900, size: R(24, 40), max: 2.8 }); add({ ch: e, x: Wd, y: H, vx: R(-520, -220), vy: R(-1100, -650), g: 900, size: R(24, 40), max: 2.8 }); } add({ k: 'text', t: 'CASH BLASTER', x: Wd / 2, y: H * .35, size: 34, max: 2 }); }
      if (effect === 'lion') { add({ k: 'pop', ch: e, x: Wd / 2, y: H * .45, size: 200, max: 2.8 }); for (let i = 0; i < 3; i++) setTimeout(() => add({ k: 'ring', x: Wd / 2, y: H * .45, r0: 40, r1: Wd * .7, max: 1.6 }), i * 350); add({ k: 'text', t: 'ROAR!', x: Wd / 2, y: H * .68, size: 48, max: 2.4, shake: 1 }); }
      if (effect === 'universe') { add({ k: 'glow', max: 3.6 }); for (let i = 0; i < 90; i++) add({ k: 'orbit', ch: Math.random() < .5 ? '✨' : '⭐', cx: Wd / 2, cy: H * .45, a: R(0, 6.28), r: R(20, Wd * .5), w: R(.6, 1.6), size: R(14, 30), max: 3.6 }); add({ k: 'orbit', ch: '🪐', cx: Wd / 2, cy: H * .45, a: 0, r: Wd * .3, w: 1.1, size: 60, max: 3.6 }); add({ k: 'pop', ch: e, x: Wd / 2, y: H * .45, size: 170, max: 3.6 }); add({ k: 'text', t: 'UNIVERSE', x: Wd / 2, y: H * .7, size: 44, max: 3 }); }
    }, k * 450);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function tick(t) {
    const dt = Math.min(.05, (t - last) / 1000); last = t; x.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => (p.life += dt) < p.max); x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const p of parts) {
      const f = p.life / p.max, al = f > .75 ? (1 - f) / .25 : 1; x.globalAlpha = Math.max(0, al);
      if (p.k === 'glow') { const gr = x.createRadialGradient(cv.width / 2, cv.height * .45, 10, cv.width / 2, cv.height * .45, cv.width); gr.addColorStop(0, 'rgba(120,60,255,.55)'); gr.addColorStop(1, 'rgba(5,10,40,.0)'); x.fillStyle = gr; x.fillRect(0, 0, cv.width, cv.height); }
      else if (p.k === 'ring') { x.strokeStyle = 'rgba(255,200,60,' + (1 - f) + ')'; x.lineWidth = 6; x.beginPath(); x.arc(p.x, p.y, p.r0 + f * p.r1, 0, 6.28); x.stroke(); }
      else if (p.k === 'text') { x.font = '900 ' + p.size + 'px system-ui'; x.fillStyle = '#ffd34d'; x.strokeStyle = '#000'; x.lineWidth = 5; const dx = p.shake ? Math.sin(p.life * 40) * 4 : 0; x.strokeText(p.t, p.x + dx, p.y); x.fillText(p.t, p.x + dx, p.y); }
      else if (p.k === 'orbit') { p.a += p.w * dt; const r = p.r * (1 - f * .35); x.font = p.size + 'px serif'; x.fillText(p.ch, p.cx + Math.cos(p.a) * r, p.cy + Math.sin(p.a) * r * .6); }
      else if (p.k === 'pop') { const s = p.size * Math.min(1, p.life / .35) * (p.pulse ? 1 + Math.sin(p.life * 12) * .08 : 1); x.font = s + 'px serif'; x.fillText(p.ch, p.x, p.y); }
      else if (p.k === 'drop') { const y = p.y + (p.ty - p.y) * Math.min(1, p.life / .6); x.font = p.size + 'px serif'; x.fillText(p.ch, p.x, y); }
      else { p.vy += p.g * dt; p.x += p.vx * dt + (p.sway ? Math.sin(p.life * 3) * p.sway : 0); p.y += p.vy * dt; x.font = p.size + 'px serif'; x.fillText(p.ch, p.x, p.y); }
    }
    x.globalAlpha = 1; raf = parts.length ? requestAnimationFrame(tick) : 0;
  }

  // ---------- Cash out ----------
  function payoutForm() {
    if (!W.adult) return BP.note('Cash out is for people aged 18 and over.');
    if (W.earnings_kobo < W.min_payout_kobo) return BP.note('You can cash out from ' + naira(W.min_payout_kobo) + '. You have ' + naira(W.earnings_kobo) + '.');
    sheet('wal', `<h2 style='margin:0 0 8px'>Cash out ${naira(W.earnings_kobo)}</h2><p style='font-size:13px;color:var(--mut)'>We check each request, then send the money to your bank account within a few working days. Use an account in your own name.</p>
<input id='pb' placeholder='Bank name'><input id='pa' inputmode='numeric' maxlength='10' placeholder='Account number (10 digits)'><input id='pn' placeholder='Account name'><div class='msg' id='pm'></div><button class='btn' id='ps'>Request payout</button><button class='btn alt' id='wx'>Back</button>`);
    $('#wx').onclick = openWallet;
    $('#ps').onclick = async () => {
      const m = (t, ok) => { $('#pm').className = 'msg ' + (ok ? 'ok' : 'err'); $('#pm').textContent = t; }, b = $('#pb').value.trim(), a = $('#pa').value.trim(), n = $('#pn').value.trim();
      if (b.length < 2 || !/^\d{10}$/.test(a) || n.length < 3) return m('Check the bank name, the 10-digit account number and the account name.');
      m('Sending…', true); const r = await sb.rpc('bp_request_payout', { p_amount: W.earnings_kobo, p_bank: b, p_account: a, p_name: n });
      if (r.error) return m(r.error.message); await wallet(); m('Request sent. We’ll review it and pay you.', true); setTimeout(() => close('wal'), 1500);
    };
  }

  // ---------- Admin: payout requests ----------
  async function payouts() {
    const o = $('#pyo'); o.classList.add('on'); o.innerHTML = "<div class='pad'>Loading…</div>";
    const r = await sb.from('bp_payout_requests').select('*').eq('status', 'pending').order('created_at').limit(50), rows = r.data || [];
    const ids = [...new Set(rows.map(x => x.user_id))], pr = ids.length ? (await sb.from('bp_profiles').select('id,username').in('id', ids)).data || [] : [], U = {}; pr.forEach(x => { U[x.id] = x.username; });
    o.innerHTML = `<div style='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)'><h2 style='margin:0'>Payout requests (${rows.length})</h2><button class='btn alt' id='pyx' style='width:auto;margin:0 0 0 auto'>Close</button></div>` +
      (rows.map(x => `<div class='card' style='margin:10px 14px'><b>${naira(x.amount_kobo)}</b> · @${esc(U[x.user_id] || '?')}<br>${esc(x.bank)} · ${esc(x.account_number)}<br>${esc(x.account_name)}<br><small style='color:var(--mut)'>${new Date(x.created_at).toLocaleString()}</small><div style='display:flex;gap:6px;margin-top:8px'><button class='btn' data-paid='${x.id}' style='width:auto;margin:0'>I paid this</button><button class='btn alt' data-rej='${x.id}' style='width:auto;margin:0'>Reject and refund</button></div></div>`).join('') || "<p class='pad' style='color:var(--mut)'>No requests waiting.</p>");
    o.onclick = async e => {
      if (e.target.id === 'pyx') return o.classList.remove('on');
      const paid = e.target.dataset.paid, rej = e.target.dataset.rej; if (!paid && !rej) return;
      const note = rej ? prompt('Reason to show the person (optional)') : null;
      const x = await sb.rpc('bp_finish_payout', { p_id: paid || rej, p_paid: !!paid, p_note: note }); if (x.error) return BP.note('Failed: ' + x.error.message);
      BP.note(paid ? 'Marked as paid.' : 'Rejected. Earnings refunded.', true); payouts();
    };
  }
  $('#pob').onclick = payouts;
  catalog(); if (me()) wallet();
})();
