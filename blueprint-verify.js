// Verified badge. People apply in Settings; admins approve or decline. Admins can also verify a username directly.
(async () => {
  let tries = 0;
  while ((!window.BP || !document.getElementById('outrow')) && tries++ < 80) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const sb = BP.sb, me = () => BP.me;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CATS = ['Creator', 'Artist or musician', 'Business or brand', 'Public figure', 'Journalist or media', 'Other'];

  $('#outrow').insertAdjacentHTML('beforebegin', `<div class='row' id='vfrow' hidden><span id='vfst'>Get verified</span><button class='btn alt' id='vfb' style='width:auto;margin:0'>Apply</button></div>
<div class='row' id='vqrow' hidden><span id='vqn'>Verification requests</span><button class='btn alt' id='vqb' style='width:auto;margin:0'>Review</button></div>`);
  document.body.insertAdjacentHTML('beforeend', `<div class='sheet' id='vfs'><div><h2>Get verified <span class='vb'>✓</span></h2>
<p style='font-size:13px;color:var(--mut);margin:0 0 8px'>A blue tick means the Blueprint team checked that this account is who it says it is. It can’t be bought. Tell us who you are and where we can confirm it.</p>
<label style='font-size:12px;color:var(--mut)'>I am a…</label><select id='vfc' style='width:100%;padding:10px;border-radius:10px;background:var(--card);color:var(--fg);border:1px solid var(--line);margin:6px 0'>${CATS.map(c => `<option>${c}</option>`).join('')}</select>
<textarea id='vfr' rows='3' maxlength='300' placeholder='Who are you, and why should this account be verified? (10 to 300 characters)'></textarea>
<input id='vfl' maxlength='200' placeholder='Links that show it is you (website, other accounts, articles)'>
<label style='display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:8px 0'><input type='checkbox' id='vfk' style='width:auto;margin-top:2px'><span>This is my real account and everything I wrote is true.</span></label>
<div class='msg' id='vfm'></div><button class='btn' id='vfsend'>Send request</button><button class='btn alt' id='vfx'>Cancel</button></div></div>
<div class='ovp' id='vqo' style='z-index:60'></div>`);
  const m = (t, ok) => { const e = $('#vfm'); e.className = 'msg ' + (ok ? 'ok' : 'err'); e.textContent = t; };

  async function refresh() {
    if (!me()) { $('#vfrow').hidden = $('#vqrow').hidden = true; return; }
    const [p, rq, ad] = await Promise.all([
      sb.from('bp_profiles').select('verified').eq('id', me().id).maybeSingle(),
      sb.from('bp_verify_requests').select('status,note').eq('user_id', me().id).order('created_at', { ascending: false }).limit(1),
      sb.from('bp_admins').select('user_id').eq('user_id', me().id).maybeSingle()
    ]);
    const ver = !!(p.data && p.data.verified), last = rq.data && rq.data[0], st = $('#vfst'), b = $('#vfb');
    $('#vfrow').hidden = false; b.disabled = false; b.hidden = false;
    if (ver) { st.innerHTML = 'Verified <span class="vb">✓</span>'; b.hidden = true; }
    else if (last && last.status === 'pending') { st.textContent = 'Verification request pending'; b.textContent = 'Pending'; b.disabled = true; }
    else { st.textContent = last && last.status === 'rejected' ? 'Verification not approved' : 'Get verified'; b.textContent = last && last.status === 'rejected' ? 'Apply again' : 'Apply'; }
    $('#vqrow').hidden = !ad.data;
    if (ad.data) { const c = await sb.from('bp_verify_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'); $('#vqn').textContent = 'Verification requests' + (c.count ? ' (' + c.count + ')' : ''); }
  }
  document.querySelector('nav [data-v="me"]').addEventListener('click', refresh);
  refresh();

  $('#vfb').onclick = () => { if (!me()) return BP.openAuth('in'); m('', true); $('#vfs').classList.add('on'); };
  $('#vfx').onclick = () => $('#vfs').classList.remove('on');
  $('#vfsend').onclick = async () => {
    const reason = $('#vfr').value.trim();
    if (reason.length < 10) return m('Please tell us a little more (at least 10 characters).');
    if (!$('#vfk').checked) return m('Please confirm the details are true.');
    const r = await sb.from('bp_verify_requests').insert({ category: $('#vfc').value, reason, links: $('#vfl').value.trim() || null });
    if (r.error) return m(/duplicate|unique/i.test(r.error.message) ? 'You already have a request waiting.' : r.error.message);
    m('Request sent. We’ll notify you when it’s reviewed.', true); setTimeout(() => { $('#vfs').classList.remove('on'); refresh(); }, 1200);
  };

  // ---------- Admin: approve or decline ----------
  const link = t => (/^https?:\/\/\S+$/.test(t) ? `<a href='${esc(t)}' target='_blank' rel='noopener noreferrer' style='color:var(--blue)'>${esc(t)}</a>` : esc(t));
  async function openQueue() {
    const o = $('#vqo'); o.classList.add('on'); o.innerHTML = "<div class='pad'>Loading…</div>";
    const r = await sb.from('bp_verify_requests').select('*').eq('status', 'pending').order('created_at').limit(50), rows = r.data || [];
    const ids = [...new Set(rows.map(x => x.user_id))], pr = ids.length ? (await sb.from('bp_profiles').select('id,username,display_name,verified').in('id', ids)).data || [] : [], P2 = {}; pr.forEach(x => { P2[x.id] = x; });
    o.innerHTML = `<div style='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)'><h2 style='margin:0'>Verification (${rows.length})</h2><button class='btn alt' id='vqx' style='width:auto;margin:0 0 0 auto'>Close</button></div>
<div class='card' style='margin:10px 14px'><b>Verify or remove a badge by username</b><div style='display:flex;gap:6px;margin-top:8px'><input id='vqu' placeholder='username' autocapitalize='none' style='margin:0'><button class='btn' id='vqv' style='width:auto;margin:0'>Verify</button><button class='btn alt' id='vqr' style='width:auto;margin:0'>Remove</button></div></div>` +
      (rows.map(x => { const u = P2[x.user_id] || {}; return `<div class='card' style='margin:10px 14px'><b>${esc(u.display_name || u.username || '?')}</b> @${esc(u.username || '?')}<br><span style='color:var(--mut)'>${esc(x.category)}</span><p style='margin:6px 0'>${esc(x.reason)}</p>${x.links ? `<div style='font-size:13px;word-break:break-all'>${link(x.links)}</div>` : ''}<div style='display:flex;gap:6px;margin-top:8px'><button class='btn' data-ok='${x.id}' style='width:auto;margin:0'>Approve</button><button class='btn alt' data-no='${x.id}' style='width:auto;margin:0'>Decline</button></div></div>`; }).join('') || "<p class='pad' style='color:var(--mut)'>No requests waiting.</p>");
    o.onclick = async e => {
      if (e.target.id === 'vqx') { o.classList.remove('on'); return refresh(); }
      const ok = e.target.dataset.ok, no = e.target.dataset.no;
      if (ok || no) {
        const note = no ? (prompt('Optional reason to show the person (leave empty to skip)') || null) : null;
        const x = await sb.rpc('bp_review_verification', { req: ok || no, approve: !!ok, p_note: note }); if (x.error) return BP.note('Failed: ' + x.error.message);
        BP.note(ok ? 'Approved. The badge is live.' : 'Declined.', true); return openQueue();
      }
      if (e.target.id === 'vqv' || e.target.id === 'vqr') {
        const name = $('#vqu').value.trim().toLowerCase().replace(/^@/, ''); if (!name) return;
        const p = await sb.from('bp_profiles').select('id').eq('username', name).maybeSingle(); if (!p.data) return BP.note('No account with that username.');
        const x = await sb.rpc('bp_set_verified', { uid: p.data.id, flag: e.target.id === 'vqv' }); BP.note(x.error ? 'Failed: ' + x.error.message : e.target.id === 'vqv' ? '@' + name + ' is now verified.' : 'Badge removed from @' + name + '.', !x.error);
      }
    };
  }
  $('#vqb').onclick = openQueue;
})();
