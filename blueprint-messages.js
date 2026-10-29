// Blueprint private messages (one to one). Default rule: only people who follow each other can message.
(async () => {
  let tries = 0;
  while ((!window.BP || !document.getElementById('bell')) && tries++ < 80) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const sb = BP.sb, me = () => BP.me;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  const nm = {};
  async function names(ids) {
    const need = [...new Set(ids.filter(x => x && !nm[x]))];
    if (need.length) (await sb.from('bp_profiles').select('id,username').in('id', need)).data?.forEach(x => { nm[x.id] = x.username; });
  }
  let cur = null, curName = '', msgs = [], canMsg = false, blocked = false, rt = null;

  document.head.insertAdjacentHTML('beforeend', `<style>
#dm.on{display:flex;flex-direction:column}
.bub{max-width:78%;padding:8px 12px;border-radius:16px;margin:4px 0;font-size:14px;line-height:1.35;word-wrap:break-word;white-space:pre-wrap}
.bmine{background:var(--blue);color:#fff;margin-left:auto;border-bottom-right-radius:4px}
.btheirs{background:var(--card);border-bottom-left-radius:4px}
.bub small{display:block;font-size:10px;opacity:.7;margin-top:2px}
</style>`);
  $('#bell').insertAdjacentHTML('beforebegin', "<button id='mbtn' aria-label='Messages' style='background:none;border:0;font-size:20px;position:relative;cursor:pointer;padding:0 4px'>✉️<span id='md' style='display:none;position:absolute;top:-4px;right:-4px;background:#e5484d;color:#fff;font-size:10px;border-radius:99px;padding:1px 5px'></span></button>");
  document.body.insertAdjacentHTML('beforeend', "<div class='ovp' id='dm'></div>");
  const dm = $('#dm');
  const badge = n => { const el = $('#md'); el.textContent = n > 9 ? '9+' : n; el.style.display = n ? 'block' : 'none'; };
  async function refreshBadge() {
    if (!me()) return badge(0);
    const r = await sb.from('bp_messages').select('*', { count: 'exact', head: true }).eq('recipient_id', me().id).is('read_at', null);
    badge(r.count || 0);
  }

  // ---------- Inbox ----------
  async function openList() {
    if (!me()) return BP.openAuth();
    cur = null; dm.classList.add('on'); dm.innerHTML = "<div class='pad'>Loading…</div>";
    const [r, b] = await Promise.all([
      sb.from('bp_messages').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('bp_blocks').select('blocked_id').eq('blocker_id', me().id)
    ]);
    const hidden = new Set((b.data || []).map(x => x.blocked_id)), convo = {};
    (r.data || []).forEach(m => {
      const o = m.sender_id === me().id ? m.recipient_id : m.sender_id; if (hidden.has(o)) return;
      const c = convo[o] || (convo[o] = { o, last: m, un: 0 }); if (m.recipient_id === me().id && !m.read_at) c.un++;
    });
    const list = Object.values(convo); await names(list.map(c => c.o));
    dm.innerHTML = `<div style='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)'><h2 style='margin:0'>Messages</h2><button class='btn alt' id='dmx' style='width:auto;margin:0 0 0 auto'>Close</button></div>
<div style='flex:1;overflow-y:auto;padding:0 14px'>${list.map(c => `<div class='nrow ${c.un ? 'un' : ''}' data-o='${c.o}'><span>@${esc(nm[c.o] || 'user')}<br><small style='font-weight:400'>${esc(c.last.body.slice(0, 60))}</small></span><small>${ago(c.last.created_at)}${c.un ? ' · ' + c.un + ' new' : ''}</small></div>`).join('') ||
      "<p style='color:var(--mut);font-size:14px'>No messages yet. Open someone’s profile and tap Message. By default you can chat with people you follow and who follow you back.</p>"}</div>`;
  }

  // ---------- Conversation ----------
  async function openThread(uid, uname) {
    if (!me()) return BP.openAuth();
    cur = uid; dm.classList.add('on'); dm.innerHTML = "<div class='pad'>Loading…</div>";
    await names([uid]); curName = uname || nm[uid] || 'user';
    const [ms, ok, bl] = await Promise.all([
      sb.from('bp_messages').select('*').or(`and(sender_id.eq.${me().id},recipient_id.eq.${uid}),and(sender_id.eq.${uid},recipient_id.eq.${me().id})`).order('created_at').limit(200),
      sb.rpc('bp_can_message', { s: me().id, r: uid }),
      sb.from('bp_blocks').select('blocked_id').eq('blocker_id', me().id).eq('blocked_id', uid)
    ]);
    msgs = ms.data || []; canMsg = ok.data === true; blocked = (bl.data || []).length > 0;
    draw(); markRead(uid);
  }
  function draw() {
    const footer = blocked ? "<p style='font-size:13px;color:var(--mut)'>You blocked this person. Unblock to message them.</p>"
      : canMsg ? "<div style='display:flex;gap:6px'><input id='dmi' maxlength='1000' placeholder='Message' style='margin:0'><button class='btn' id='dms' style='width:auto;margin:0'>Send</button></div>"
      : `<p style='font-size:13px;color:var(--mut)'>You can message people who follow you back. Follow @${esc(curName)}, and once they follow you back you can chat. They can also open messages to everyone in their settings.</p>`;
    dm.innerHTML = `<div style='display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)'><button class='btn alt' id='dmb' style='width:auto;margin:0'>‹</button><b id='dmu' style='cursor:pointer'>@${esc(curName)}</b><span style='margin-left:auto;display:flex;gap:6px'><button class='btn alt' id='dmr' style='width:auto;margin:0;padding:8px 10px'>Report</button><button class='btn alt' id='dmbl' style='width:auto;margin:0;padding:8px 10px'>${blocked ? 'Unblock' : 'Block'}</button></span></div>
<div id='dml' style='flex:1;overflow-y:auto;padding:10px 14px'></div>
<div style='padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line)'>${footer}</div>`;
    drawMsgs();
  }
  function drawMsgs() {
    const l = $('#dml'); if (!l) return;
    l.innerHTML = msgs.map(m => `<div class='bub ${m.sender_id === me().id ? 'bmine' : 'btheirs'}'>${esc(m.body)}<small>${ago(m.created_at)}</small></div>`).join('') || "<p style='color:var(--mut);font-size:13px;text-align:center'>Say hello.</p>";
    l.scrollTop = l.scrollHeight;
  }
  const markRead = uid => sb.from('bp_messages').update({ read_at: new Date().toISOString() }).eq('recipient_id', me().id).eq('sender_id', uid).is('read_at', null).then(() => refreshBadge());
  async function send() {
    const el = $('#dmi'), t = el.value.trim(); if (!t) return;
    el.value = '';
    const r = await sb.from('bp_messages').insert({ recipient_id: cur, body: t.slice(0, 1000) }).select().single();
    if (r.error) { el.value = t; return BP.note(r.error.code === '42501' ? 'You can’t message this person right now.' : 'Couldn’t send: ' + r.error.message); }
    msgs.push(r.data); drawMsgs();
  }

  dm.onclick = async e => {
    const id = e.target.id, row = e.target.closest('[data-o]');
    if (id === 'dmx') { dm.classList.remove('on'); cur = null; refreshBadge(); return; }
    if (id === 'dmb') { await openList(); refreshBadge(); return; }
    if (id === 'dms') return send();
    if (id === 'dmu') { dm.classList.remove('on'); return BP.openProfile && BP.openProfile(cur); }
    if (id === 'dmbl') {
      const r = blocked ? await sb.from('bp_blocks').delete().match({ blocker_id: me().id, blocked_id: cur }) : await sb.from('bp_blocks').insert({ blocked_id: cur });
      if (r.error) return BP.note('Couldn’t update: ' + r.error.message);
      if (!blocked) { BP.note('Blocked. They can’t message you.', true); return openList(); }
      return openThread(cur, curName);
    }
    if (id === 'dmr') {
      const reason = prompt('Why are you reporting this person? (spam, harassment, other)'); if (!reason) return;
      const r = await sb.from('bp_reports').insert({ reported_id: cur, reason: reason.slice(0, 300) });
      return BP.note(r.error ? 'Couldn’t send report: ' + r.error.message : 'Thanks. Your report was sent.', !r.error);
    }
    if (row) openThread(row.dataset.o);
  };
  dm.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'dmi') send(); });
  $('#mbtn').onclick = openList;
  window.BPDM = { open: openThread };

  // ---------- Instant delivery ----------
  function startRT() {
    refreshBadge(); if (rt || !me()) return;
    rt = sb.channel('dm:' + me().id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bp_messages', filter: 'recipient_id=eq.' + me().id }, async p => {
      const m = p.new;
      if (cur === m.sender_id && dm.classList.contains('on')) { if (!msgs.find(x => x.id === m.id)) { msgs.push(m); drawMsgs(); } markRead(m.sender_id); }
      else { await names([m.sender_id]); BP.note('New message from @' + (nm[m.sender_id] || 'someone'), true); refreshBadge(); }
    }).subscribe();
  }
  sb.auth.onAuthStateChange((_e, s) => { if (s?.user) setTimeout(startRT, 300); else { if (rt) { sb.removeChannel(rt); rt = null; } badge(0); dm.classList.remove('on'); } });
  if (me()) startRT();
  setInterval(() => { if (me()) refreshBadge(); }, 60000);

  // ---------- Setting: who can message me ----------
  $('#outrow').insertAdjacentHTML('beforebegin', "<div class='row' id='dprow' hidden><span>Who can message me</span><select id='dpp' style='width:auto;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:8px'><option value='mutual'>People I follow back</option><option value='anyone'>Anyone</option></select></div>");
  $('#dpp').onchange = () => sb.from('bp_profiles').update({ dm_policy: $('#dpp').value }).eq('id', me().id).then(r => { if (r.error) BP.note('Couldn’t save: ' + r.error.message); });
  document.querySelector('nav [data-v="me"]').addEventListener('click', async () => {
    $('#dprow').hidden = !me(); if (!me()) return;
    const r = await sb.from('bp_profiles').select('dm_policy').eq('id', me().id).maybeSingle();
    if (r.data) $('#dpp').value = r.data.dm_policy || 'mutual';
  });
})();
