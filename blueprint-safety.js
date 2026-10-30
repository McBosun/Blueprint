// Safety and trust: reporting, moderation panel (admins), legal links, delete account, health check.
(async () => {
  let tries = 0;
  while ((!window.BP || !document.getElementById('outrow')) && tries++ < 80) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const sb = BP.sb, me = () => BP.me, C = window.BLUEPRINT_CONFIG || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Report sheet (posts, comments, people) ----------
  const REASONS = ['Spam or scam', 'Nudity or sexual content', 'Violence or dangerous acts', 'Harassment or hate', 'Child safety concern', 'Misleading or fake', 'Something else'];
  document.body.insertAdjacentHTML('beforeend', `<div class='sheet' id='rs'><div><h2>Report</h2>${REASONS.map((r, i) => `<label style='display:flex;gap:8px;align-items:center;padding:7px 0;font-size:14px'><input type='radio' name='rsn' value='${r}' style='width:auto;margin:0'${i ? '' : ' checked'}> ${r}</label>`).join('')}<textarea id='rd' rows='2' maxlength='200' placeholder='Details (optional)'></textarea><div class='msg' id='rm'></div><button class='btn' id='rsend'>Send report</button><button class='btn alt' id='rcx'>Cancel</button></div></div>
<div class='ovp' id='mod'></div><div class='sheet' id='hc'><div><h2>Health check</h2><div id='hcl' style='font-size:13px'></div><button class='btn alt' id='hcx'>Close</button></div></div>`);
  let target = null;
  window.BPReport = t => { if (!me()) return BP.openAuth(); target = t; $('#rm').textContent = ''; $('#rd').value = ''; $('#rs').classList.add('on'); };
  $('#rcx').onclick = () => $('#rs').classList.remove('on');
  $('#rsend').onclick = async () => {
    const cat = document.querySelector('input[name="rsn"]:checked').value, d = $('#rd').value.trim();
    const r = await sb.from('bp_reports').insert({ target_type: target.type, video_id: target.video || null, comment_id: target.comment || null, reported_id: target.user, reason: (cat + (d ? ': ' + d : '')).slice(0, 300) });
    $('#rm').className = 'msg ' + (r.error ? 'err' : 'ok'); $('#rm').textContent = r.error ? r.error.message : 'Thanks. Our team will review it.';
    if (!r.error) setTimeout(() => $('#rs').classList.remove('on'), 1200);
  };
  $('#feed').addEventListener('click', e => {
    const b = e.target.closest('[data-a="rep"]'); if (!b) return;
    e.stopImmediatePropagation();
    const p = P.find(x => String(x.id) === b.closest('.post').dataset.id);
    if (p && p.uid) BPReport({ type: 'post', video: p.id, user: p.uid });
  }, true);
  $('#cl').addEventListener('click', async e => {
    const rc = e.target.closest('.rc'), dc = e.target.closest('.dc');
    if (rc) BPReport({ type: 'comment', comment: rc.dataset.cid, user: rc.dataset.uid });
    if (dc && confirm('Delete your comment?')) { const r = await sb.from('bp_comments').delete().eq('id', dc.dataset.cid); if (r.error) BP.note('Couldn’t delete: ' + r.error.message); else { await BP.loadComments(cur); renderFeed(); } }
  });

  // ---------- Settings rows ----------
  $('#outrow').insertAdjacentHTML('beforebegin', `<div class='row'><span>Legal</span><span><a href='terms.html' target='_blank' style='color:var(--blue)'>Terms and rules</a> · <a href='privacy.html' target='_blank' style='color:var(--blue)'>Privacy</a></span></div>
<div class='row' id='hcrow' hidden><span>Check that everything works</span><button class='btn alt' id='hcb' style='width:auto;margin:0'>Run check</button></div>
<div class='row' id='tcrow' hidden><span>Test checklist</span><button class='btn alt' id='tcb' style='width:auto;margin:0'>Open</button></div>
<div class='row' id='modrow' hidden><span>Moderation</span><button class='btn alt' id='modb' style='width:auto;margin:0'>Open reports</button></div>
<div class='row' id='delrow' hidden><span>Delete my account</span><button class='btn alt' id='delb' style='width:auto;margin:0;color:#e5484d'>Delete</button></div>`);
  document.querySelector('nav [data-v="me"]').addEventListener('click', async () => {
    $('#delrow').hidden = !me(); if (!me()) { $('#modrow').hidden = true; $('#hcrow').hidden = true; $('#tcrow').hidden = true; return; }
    const a = await sb.from('bp_admins').select('user_id').eq('user_id', me().id).maybeSingle(); $('#modrow').hidden = !a.data; $('#hcrow').hidden = !a.data; $('#tcrow').hidden = !a.data;
    const p = await sb.from('bp_profiles').select('banned').eq('id', me().id).maybeSingle();
    if (p.data && p.data.banned) BP.note('Your account is restricted. You can’t post, comment or message. Contact support if you think this is a mistake.');
  });

  // ---------- Delete my account ----------
  $('#delb').onclick = async () => {
    if (prompt('This permanently deletes your account, posts, messages and followers. Type DELETE to confirm.') !== 'DELETE') return;
    const uid = me().id; BP.note('Deleting…', true);
    for (const b of ['videos', 'media', 'avatars', 'sounds']) {
      const l = await sb.storage.from(b).list(uid, { limit: 1000 }), names = (l.data || []).map(x => uid + '/' + x.name);
      if (names.length) await sb.storage.from(b).remove(names);
    }
    const r = await sb.rpc('bp_delete_me'); if (r.error) return BP.note('Couldn’t delete: ' + r.error.message);
    await sb.auth.signOut(); location.hash = ''; location.reload();
  };

  // ---------- Moderation panel (admins only) ----------
  $('#modb').onclick = openMod;
  async function openMod() {
    const mod = $('#mod'); mod.classList.add('on'); mod.innerHTML = "<div class='pad'>Loading…</div>";
    const r = await sb.from('bp_reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(50);
    const rows = r.data || [], vids = rows.map(x => x.video_id).filter(Boolean), cms = rows.map(x => x.comment_id).filter(Boolean), ids = [...new Set(rows.flatMap(x => [x.reporter_id, x.reported_id]))];
    const [v, c, p] = await Promise.all([
      vids.length ? sb.from('bp_videos').select('*').in('id', vids) : { data: [] },
      cms.length ? sb.from('bp_comments').select('id,body').in('id', cms) : { data: [] },
      ids.length ? sb.from('bp_profiles').select('id,username').in('id', ids) : { data: [] }
    ]);
    const V = {}, Cm = {}, U = {}; (v.data || []).forEach(x => { V[x.id] = x; }); (c.data || []).forEach(x => { Cm[x.id] = x; }); (p.data || []).forEach(x => { U[x.id] = x.username; });
    mod.innerHTML = `<div style='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)'><h2 style='margin:0'>Open reports (${rows.length})</h2><button class='btn alt' id='modx' style='width:auto;margin:0 0 0 auto'>Close</button></div>` +
      (rows.map(x => `<div class='card' style='margin:10px 14px'><b>${esc(x.target_type)}</b> · @${esc(U[x.reported_id] || '?')}<br><span style='color:var(--mut)'>Reported by @${esc(U[x.reporter_id] || '?')}: ${esc(x.reason)}</span>
${x.video_id ? `<div>Post: ${V[x.video_id] ? esc(V[x.video_id].title) : '(already removed)'}</div>` : ''}${x.comment_id ? `<div>Comment: ${Cm[x.comment_id] ? esc(Cm[x.comment_id].body) : '(already removed)'}</div>` : ''}
<div style='display:flex;gap:6px;margin-top:8px;flex-wrap:wrap'>${x.video_id || x.comment_id ? `<button class='btn' data-a='rm' data-id='${x.id}' style='width:auto;margin:0'>Remove content</button>` : ''}<button class='btn alt' data-a='ban' data-id='${x.id}' data-u='${x.reported_id}' style='width:auto;margin:0'>Ban user</button><button class='btn alt' data-a='ok' data-id='${x.id}' style='width:auto;margin:0'>Dismiss</button></div></div>`).join('') || "<p class='pad' style='color:var(--mut)'>No open reports.</p>");
    mod.onclick = async e => {
      if (e.target.id === 'modx') return mod.classList.remove('on');
      const b = e.target.closest('[data-a]'); if (!b) return;
      const rep = rows.find(x => x.id === b.dataset.id), a = b.dataset.a; let err = null;
      if (a === 'rm') {
        if (rep.video_id && V[rep.video_id]) { const x = V[rep.video_id], files = x.kind === 'photo' ? [...(x.image_paths || []).map(p => ['media', p]), ...(x.music_path ? [['media', x.music_path]] : [])] : [['videos', x.video_path]]; err = (await sb.from('bp_videos').delete().eq('id', x.id)).error; files.forEach(([bk, p]) => sb.storage.from(bk).remove([p])); }
        if (rep.comment_id) err = (await sb.from('bp_comments').delete().eq('id', rep.comment_id)).error || err;
      }
      if (a === 'ban') { if (!confirm('Ban this user? They can no longer post, comment or message.')) return; err = (await sb.rpc('bp_set_ban', { uid: b.dataset.u, flag: true })).error; }
      if (err) return BP.note('Failed: ' + err.message);
      await sb.from('bp_reports').update({ status: a === 'ok' ? 'dismissed' : 'actioned', handled_by: me().id, handled_at: new Date().toISOString() }).eq('id', rep.id);
      BP.note('Done.', true); openMod();
    };
  }

  // ---------- Health check ----------
  $('#hcx').onclick = () => $('#hc').classList.remove('on');
  $('#hcb').onclick = async () => {
    $('#hc').classList.add('on'); const box = $('#hcl'); box.innerHTML = 'Checking…';
    const out = [], add = (name, res) => out.push([name, res]);
    const tables = ['bp_profiles', 'bp_videos', 'bp_likes', 'bp_saves', 'bp_comments', 'bp_lives', 'bp_follows', 'bp_notifications', 'bp_profile_views', 'bp_messages', 'bp_blocks', 'bp_reports', 'bp_views', 'bp_admins', 'bp_notif_prefs', 'bp_push_subs', 'bp_sounds'];
    for (const t of tables) { const r = await sb.from(t).select('*', { count: 'exact', head: true }); add('Table ' + t, r.error ? r.error.message : true); }
    const cols = [['bp_videos', 'kind,image_paths,music_path,music_title,allow_download,music_url,music_credit,music_vol,orig_vol,music_start'], ['bp_profiles', 'display_name,bio,avatar_url,share_views,dm_policy,banned,terms_accepted_at'], ['bp_lives', 'last_seen'], ['bp_reports', 'target_type,video_id,comment_id,status']];
    for (const [t, c] of cols) { const r = await sb.from(t).select(c).limit(1); add(`Columns in ${t}`, r.error ? r.error.message : true); }
    for (const b of ['videos', 'media', 'avatars', 'sounds']) { const r = await sb.storage.from(b).list('', { limit: 1 }); add('Storage bucket ' + b, r.error ? r.error.message : true); }
    if (me()) {
      const a = await sb.rpc('bp_can_message', { s: me().id, r: me().id }); add('Messaging rules function', a.error ? a.error.message : true);
      const s = await sb.rpc('bp_stats', { ids: [] }); add('Feed ranking function', s.error ? s.error.message : true);
      const pr = await sb.from('bp_profiles').select('id').eq('id', me().id).maybeSingle(); add('Your profile exists', pr.data ? true : 'Missing. Run update-all.sql.');
    } else add('Signed in', 'Sign in to test messaging and ranking.');
    add('Live realtime connection', await new Promise(ok => { const ch = sb.channel('hc:' + Date.now()); const t = setTimeout(() => { sb.removeChannel(ch); ok('Timed out'); }, 5000); ch.subscribe(s => { if (s === 'SUBSCRIBED') { clearTimeout(t); sb.removeChannel(ch); ok(true); } }); }));
    add('Browser: camera and live', navigator.mediaDevices && window.RTCPeerConnection ? true : 'This browser can’t go live.');
    add('Browser: recording replays', window.MediaRecorder ? true : 'No MediaRecorder. Replays and compression won’t work.');
    add('Resumable uploads loaded', window.tus ? true : 'tus library missing. Large uploads use the basic method.');
    add('Phone alerts key (vapidKey in config.js)', C.vapidKey ? true : 'Not set. Phone alerts stay off.');
    add('Free music search (jamendoId in config.js)', C.jamendoId ? true : 'Not set. Only Blueprint Sounds are available.');
    add('Live relay (TURN) set up', C.iceServers && C.iceServers.some(x => String(x.urls).startsWith('turn')) ? true : 'Not set. Some mobile networks will fail to connect to lives.');
    const bad = out.filter(x => x[1] !== true);
    box.innerHTML = `<p><b>${bad.length ? bad.length + ' issue' + (bad.length > 1 ? 's' : '') + ' found' : 'Everything looks good'}</b></p>` + out.map(([n, r]) => `<div style='padding:3px 0;color:${r === true ? 'inherit' : '#e5484d'}'>${r === true ? '✓' : '✗'} ${esc(n)}${r === true ? '' : '<br><small>' + esc(r) + '</small>'}</div>`).join('') + (bad.length ? "<p style='color:var(--mut)'>Most ✗ lines about tables, columns or functions mean update-all.sql still needs to be run.</p>" : '');
  };
  // ---------- Test checklist (admins only; ticks are remembered on this phone) ----------
  const STEPS = [
    'Run the health check (Settings > Account and help). Fix every ✗ first.',
    'Sign up accounts A and B (tick the age and terms box). Both show in Supabase > Authentication.',
    'A posts a short video (under 10 MB). It shows in the feed and under A’s Me > Posts.',
    'A posts 3 photos with a song. The slideshow plays and music starts after your first tap.',
    'B follows A. A gets a 🔔 notification. B’s Following tab shows A’s posts.',
    'B likes and comments on A’s post. A gets notifications. Refresh: they stay.',
    'B saves a post. It stays in Blueprints after refresh.',
    'B taps A’s @username and the profile opens. A’s Activity > Profile views shows B.',
    'B searches a word from A’s title, then taps a #tag chip.',
    'B reports A’s post (⚑). The report shows in Moderation and in the bp_reports table.',
    'A and B follow each other, then A messages B. B sees a banner and an ✉️ count.',
    'A deletes a post (🗑). It disappears and its files leave Storage.',
    'A goes live. B sees the red bar, joins and chats. A ends: the replay appears on A’s profile.',
    'Upload a video over the size limit. It offers to compress, then uploads with a % progress.',
    'Download a video and a photo post (⬇). Share a post link and open it in a private tab.'
  ];
  document.body.insertAdjacentHTML('beforeend', "<div class='sheet' id='tc'><div><h2>Test checklist</h2><div id='tcp' style='font-size:13px;color:var(--mut);margin-bottom:6px'></div><div id='tcl'></div><button class='btn alt' id='tcr'>Reset ticks</button><button class='btn' id='tcx'>Close</button></div></div>");
  const KEY = 'bp-test-v1';
  const loadTicks = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const saveTicks = t => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {} };
  function drawTests() {
    const t = loadTicks();
    $('#tcl').innerHTML = STEPS.map((s, i) => `<label style='display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px'><input type='checkbox' data-i='${i}' style='width:auto;margin:3px 0 0'${t.includes(i) ? ' checked' : ''}><span style='${t.includes(i) ? 'text-decoration:line-through;color:var(--mut)' : ''}'>${i + 1}. ${esc(s)}</span></label>`).join('');
    $('#tcp').textContent = t.length + ' of ' + STEPS.length + ' done' + (t.length === STEPS.length ? '. Ready for friends!' : '');
  }
  $('#tcb').onclick = () => { drawTests(); $('#tc').classList.add('on'); };
  $('#tcx').onclick = () => $('#tc').classList.remove('on');
  $('#tcr').onclick = () => { if (confirm('Clear all ticks?')) { saveTicks([]); drawTests(); } };
  $('#tcl').onchange = e => {
    const i = +e.target.dataset.i, t = loadTicks().filter(x => x !== i);
    if (e.target.checked) t.push(i);
    saveTicks(t); drawTests();
  };
})();
