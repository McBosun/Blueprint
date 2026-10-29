// Blueprint extras: live broadcasting (WebRTC signalled through Supabase Realtime), saved live replays,
// notifications, other people's profiles, profile views, search across real posts, deleting your own posts.
(async () => {
  let tries = 0;
  while (!window.BP && tries++ < 50) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const sb = BP.sb, me = () => BP.me, C = window.BLUEPRINT_CONFIG || {}, MAXMB = C.maxMB || 50;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  const ICE = C.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  const cache = {};
  async function names(ids) {
    const need = [...new Set(ids.filter(x => x && !cache[x]))];
    if (need.length) (await sb.from('bp_profiles').select('id,username').in('id', need)).data?.forEach(x => { cache[x.id] = x.username; });
    return cache;
  }
  const showPost = post => {
    if (!P.find(x => x.id === post.id)) P.push(post);
    tab = 'foryou'; $$('#ftabs span').forEach(s => s.classList.toggle('on', s.dataset.f === 'foryou'));
    renderFeed(); show('feed'); const el = $(`.post[data-id="${post.id}"]`); if (el) el.scrollIntoView();
  };
  async function openPost(id) {
    let post = P.find(x => x.id === id);
    if (!post) { const r = await sb.from('bp_videos').select('*').eq('id', id).maybeSingle(); if (!r.data) return BP.note('That post is no longer available.'); post = (await BP.build([r.data]))[0]; }
    showPost(post);
  }

  // ---------- Styles and containers ----------
  document.head.insertAdjacentHTML('beforeend', `<style>
#lvbar{display:none;overflow-x:auto;white-space:nowrap;padding:6px 12px;border-bottom:1px solid var(--line)}
#lvbar button{background:#e5484d;color:#fff;border:0;border-radius:99px;padding:6px 12px;font-size:12px;margin-right:6px;cursor:pointer}
.ovp{position:fixed;inset:0;z-index:15;margin:0 auto;max-width:520px;background:var(--bg);color:var(--fg);overflow-y:auto;display:none;padding-top:env(safe-area-inset-top,0px)}.ovp.on{display:block}
.ul{cursor:pointer;text-decoration:underline}
#bell{background:none;border:0;font-size:20px;position:relative;cursor:pointer;padding:0 4px}
#bd{display:none;position:absolute;top:-4px;right:-4px;background:#e5484d;color:#fff;font-size:10px;border-radius:99px;padding:1px 5px}
.nrow{padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;cursor:pointer;display:flex;justify-content:space-between;gap:8px}.nrow.un{font-weight:700}.nrow small{color:var(--mut);white-space:nowrap}
</style>`);
  $('header').insertAdjacentHTML('beforeend', "<button id='bell' aria-label='Notifications'>🔔<span id='bd'></span></button>");
  $('header').insertAdjacentHTML('afterend', "<div id='lvbar'></div>");
  $('#lt').insertAdjacentHTML('afterend', "<span id='lvw'></span>");
  document.body.insertAdjacentHTML('beforeend', `<div class='ovp' id='op'></div>
<div class='live' id='vw'><video id='vv' playsinline autoplay></video><div class='ov'>
<div><div class='lt'><span class='badge'>LIVE</span><span id='vn'></span><span id='vc'></span><button id='vx' style='margin-left:auto'>Leave</button></div></div>
<div><div id='vs' style='text-align:center;text-shadow:0 1px 3px #000;margin-bottom:6px'></div><div id='vch' style='font-size:13px;margin-bottom:8px;text-shadow:0 1px 3px #000'></div>
<div style='display:flex;gap:6px'><input id='vi' maxlength='200' placeholder='Say something kind' style='margin:0'><button id='vsd'>Send</button></div></div></div></div>
<div class='sheet' id='nt'><div><h2>Activity</h2><div style='display:flex;gap:8px'><button class='btn' id='n1'>Notifications</button><button class='btn alt' id='n2'>Profile views</button></div><div id='nl'></div><button class='btn alt' id='ncl'>Close</button></div></div>
<div class='sheet' id='rp'><div><h2>Replay not uploaded</h2><p id='rpm' style='font-size:14px'></p><a id='rpa' class='btn' style='display:block;text-align:center;text-decoration:none' download='blueprint-replay.webm'>Download replay</a><button class='btn alt' id='rpx'>Close</button></div></div>`);
  $('#rpx').onclick = () => $('#rp').classList.remove('on');

  // ---------- Delete your own posts ----------
  $('#feed').addEventListener('click', async e => {
    const b = e.target.closest('[data-a="del"]'); if (!b) return;
    e.stopImmediatePropagation();
    const p = P.find(x => String(x.id) === b.closest('.post').dataset.id);
    if (!p || !me() || p.uid !== me().id) return;
    if (!confirm('Delete this post? This can’t be undone.')) return;
    const r = await sb.from('bp_videos').delete().eq('id', p.id);
    if (r.error) return BP.note('Couldn’t delete: ' + r.error.message);
    for (const [bk, path] of p.files || []) sb.storage.from(bk).remove([path]).then(() => {});
    P = P.filter(x => x.id !== p.id); renderFeed(); BP.note('Post deleted.', true);
  }, true);

  // ---------- Other people's profiles ----------
  $('#feed').addEventListener('click', e => { const u = e.target.closest('.ul'); if (u && u.dataset.uid) openProfile(u.dataset.uid); });
  const tile = p => `<div data-id='${esc(p.id)}' style='background:${G[p.g % 5]}'>${p.imgs ? `<img src='${esc(p.imgs[0])}' alt='' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover'>` : p.src ? `<video src='${esc(p.src)}#t=0.1' preload='metadata' muted playsinline style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover'></video>` : ''}<span style='position:relative'>${esc(p.t)}</span></div>`;
  async function openProfile(uid) {
    if (!uid) return;
    if (me() && uid === me().id) { $('#op').classList.remove('on'); document.querySelector('nav [data-v="me"]').click(); return; }
    const op = $('#op'); op.classList.add('on'); op.innerHTML = "<div class='pad'>Loading…</div>";
    const cnt = col => sb.from('bp_follows').select('*', { count: 'exact', head: true }).eq(col, uid);
    const [pf, f1, f2, mv, fl] = await Promise.all([
      sb.from('bp_profiles').select('*').eq('id', uid).maybeSingle(), cnt('following_id'), cnt('follower_id'),
      sb.from('bp_videos').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      me() ? sb.from('bp_follows').select('follower_id').eq('follower_id', me().id).eq('following_id', uid) : { data: [] }
    ]);
    const close = () => op.classList.remove('on');
    if (!pf.data) { op.innerHTML = "<div class='pad'><button class='btn alt' id='opx'>‹ Back</button><p>Profile not found.</p></div>"; $('#opx').onclick = close; return; }
    if (me()) sb.from('bp_profile_views').insert({ profile_id: uid }).then(() => {});
    const p = pf.data, posts = await BP.build(mv.data || []);
    let following = (fl.data || []).length > 0, fc = f1.count || 0;
    const likes = posts.reduce((a, x) => a + x.l, 0);
    const draw = () => {
      op.innerHTML = `<div style='padding:8px 12px'><button class='btn alt' id='opx' style='width:auto;margin:0'>‹ Back</button></div><div class='cover'></div>
${p.avatar_url ? `<img class='av' src='${esc(p.avatar_url)}' alt=''>` : "<svg class='av' viewBox='0 0 100 100'><use href='#logo'/></svg>"}
<div class='pn'><h2>${esc(p.display_name || p.username)}</h2><div class='un'>@${esc(p.username)}</div>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
<div style='font-size:12px;color:var(--mut)'>${esc(p.location || '')}${p.location && p.link ? ' · ' : ''}${p.link ? `<a href='${esc(p.link)}' target='_blank' rel='noopener noreferrer' style='color:var(--blue)'>${esc(p.link.replace(/^https?:\/\//, ''))}</a>` : ''}</div>
<div style='margin-top:8px'>${(p.interests || []).map(t => `<span class='pill'>#${esc(t)}</span>`).join('')}</div></div>
<div class='st'><div><b>${posts.length}</b><span>Posts</span></div><div><b>${fc}</b><span>Followers</span></div><div><b>${f2.count || 0}</b><span>Following</span></div><div><b>${n(likes)}</b><span>Likes</span></div></div>
<div class='pb'><button class='btn${following ? ' alt' : ''}' id='opf'>${following ? 'Following ✓' : 'Follow'}</button><button class='btn alt' id='opm'>Message</button></div>
<div class='pg'>${posts.map(tile).join('') || "<p class='pad' style='grid-column:1/-1;color:var(--mut)'>No posts yet.</p>"}</div>`;
    };
    draw();
    op.onclick = async e => {
      if (e.target.id === 'opx') return close();
      if (e.target.id === 'opm') { if (!me()) return BP.openAuth(); close(); return window.BPDM && window.BPDM.open(uid, p.username); }
      if (e.target.id === 'opf') {
        if (!me()) return BP.openAuth();
        const r = following ? await sb.from('bp_follows').delete().match({ follower_id: me().id, following_id: uid }) : await sb.from('bp_follows').insert({ following_id: uid });
        if (r.error) return BP.note('Couldn’t update: ' + r.error.message);
        following = !following; fc += following ? 1 : -1; following ? followed.add(uid) : followed.delete(uid); draw(); return;
      }
      const g = e.target.closest('[data-id]');
      if (g) { const post = posts.find(x => String(x.id) === g.dataset.id); close(); if (post) showPost(post); }
    };
  }

  BP.openProfile = openProfile;
  // ---------- Search across real posts and people ----------
  let qt, found = [];
  const q0 = $('#q').oninput;
  $('#q').oninput = () => { clearTimeout(qt); const v = $('#q').value.trim(); if (!v) return q0(); qt = setTimeout(() => search(v), 300); };
  async function search(raw) {
    const v = raw.replace(/[,()%*\\]/g, ' ').trim(); if (!v) return;
    const tag = v.split(/\s+/)[0].toLowerCase().replace(/[^\w]/g, '');
    const orQ = `title.ilike.*${v}*,caption.ilike.*${v}*` + (tag ? `,tags.cs.{${tag}}` : '');
    const [pv, pp] = await Promise.all([
      sb.from('bp_videos').select('*').or(orQ).order('created_at', { ascending: false }).limit(30),
      sb.from('bp_profiles').select('id,username,display_name').or(`username.ilike.*${v}*,display_name.ilike.*${v}*`).limit(10)
    ]);
    if ($('#q').value.trim() !== raw) return; // a newer search is running
    found = await BP.build(pv.data || []);
    const people = (pp.data || []).map(x => `<div class='row' data-uid='${x.id}' style='cursor:pointer'><span>@${esc(x.username)} <small style='color:var(--mut)'>${esc(x.display_name || '')}</small></span><b style='color:var(--blue)'>View</b></div>`).join('');
    $('#grid').innerHTML = (people ? `<div style='column-span:all;margin-bottom:8px'>${people}</div>` : '') +
      found.map((p, i) => `<div class="tile" data-id="${esc(p.id)}"><div class="th" style="background:${G[p.g % 5]};height:${110 + (i % 3) * 40}px">${esc(p.t)}</div><div class="m"><b>${esc(p.u)}</b>${n(p.l)} likes</div></div>`).join('') ||
      (people ? '' : `<p class='pad'>No results for “${esc(raw)}”.</p>`);
  }
  $('#grid').addEventListener('click', e => {
    const r = e.target.closest('[data-uid]'), t = e.target.closest('.tile');
    if (r) { e.stopImmediatePropagation(); openProfile(r.dataset.uid); }
    else if (t && $('#q').value.trim()) { e.stopImmediatePropagation(); const post = found.find(x => String(x.id) === t.dataset.id); if (post) showPost(post); }
  }, true);

  // ---------- Live: who is live now ----------
  async function loadLives() {
    const r = await sb.from('bp_lives').select('id,host_id,title').eq('status', 'live').gt('last_seen', new Date(Date.now() - 90000).toISOString()).order('started_at', { ascending: false }).limit(15);
    const rows = r.data || []; await names(rows.map(x => x.host_id));
    const bar = $('#lvbar'); bar.style.display = rows.length ? 'block' : 'none';
    bar.innerHTML = rows.map(x => `<button data-id='${x.id}' data-h='@${esc(cache[x.host_id] || 'user')}' data-t='${esc(x.title)}'>● @${esc(cache[x.host_id] || 'user')} · ${esc(x.title)}</button>`).join('');
  }
  $('#lvbar').onclick = e => { const b = e.target.closest('button'); if (b) openViewer(b.dataset.id, b.dataset.h, b.dataset.t); };
  loadLives(); setInterval(loadLives, 30000);

  // ---------- WebRTC helpers ----------
  const addIce = async (pc, c) => { if (pc.remoteDescription) { try { await pc.addIceCandidate(c); } catch (e) {} } else (pc._q = pc._q || []).push(c); };
  const flush = async pc => { for (const c of pc._q || []) { try { await pc.addIceCandidate(c); } catch (e) {} } pc._q = []; };

  // ---------- Live: host ----------
  let H = null;
  const goLive0 = window.goLive;
  window.goLive = async function () { await goLive0(); if (L.on) startBroadcast(); };
  const MR = window.MediaRecorder; // smaller replays so they fit in storage
  if (MR) { window.MediaRecorder = function (s, o) { return new MR(s, { videoBitsPerSecond: (C.replayKbps || 1000) * 1000, audioBitsPerSecond: 96000, ...(o || {}) }); }; window.MediaRecorder.isTypeSupported = MR.isTypeSupported.bind(MR); }
  async function startBroadcast() {
    if (!me()) return;
    const r = await sb.from('bp_lives').insert({ title: $('#ltitle').value.trim() || 'Live' }).select().single();
    if (r.error) { BP.note('Your live is on your device only: ' + r.error.message); return; }
    const stream = new MediaStream([...st.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const ch = sb.channel('live:' + r.data.id, { config: { broadcast: { self: true }, presence: { key: me().id } } });
    const send = (event, payload) => ch.send({ type: 'broadcast', event, payload });
    const h = H = { id: r.data.id, ch, peers: {}, send };
    ch.on('broadcast', { event: 'join' }, async ({ payload }) => {
      if (h.peers[payload.from]) h.peers[payload.from].close();
      if (Object.keys(h.peers).length >= (C.maxViewers || 8)) return send('full', { to: payload.from });
      const pc = new RTCPeerConnection({ iceServers: ICE }); h.peers[payload.from] = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = e => e.candidate && send('ice', { to: payload.from, from: 'host', c: e.candidate });
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) { pc.close(); delete h.peers[payload.from]; } };
      await pc.setLocalDescription(await pc.createOffer());
      send('offer', { to: payload.from, sdp: pc.localDescription });
    });
    ch.on('broadcast', { event: 'answer' }, async ({ payload }) => { const pc = h.peers[payload.from]; if (pc) { await pc.setRemoteDescription(payload.sdp); flush(pc); } });
    ch.on('broadcast', { event: 'ice' }, ({ payload }) => { if (payload.to === 'host' && h.peers[payload.from]) addIce(h.peers[payload.from], payload.c); });
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => { L.chat.push(payload.name + ': ' + payload.text); $('#lchat').innerHTML = L.chat.slice(-4).map(x => '<div>' + esc(x) + '</div>').join(''); });
    ch.on('presence', { event: 'sync' }, () => { $('#lvw').textContent = Math.max(0, Object.keys(ch.presenceState()).length - 1) + ' watching'; });
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.track({ host: true }); });
    clearInterval(chatT); $('#lchat').innerHTML = ''; // real chat replaces the demo chat
    h.hb = setInterval(() => sb.from('bp_lives').update({ last_seen: new Date().toISOString() }).eq('id', h.id).then(() => {}), 30000);
    BP.note('You’re live. Followers were notified.', true); loadLives();
  }
  function endBroadcast() {
    const h = H; if (!h) return; H = null;
    clearInterval(h.hb); h.send('end', {}); Object.values(h.peers).forEach(pc => pc.close());
    sb.from('bp_lives').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', h.id).then(() => {});
    setTimeout(() => { sb.removeChannel(h.ch); loadLives(); }, 600);
  }
  window.endLive = function () {
    if (L.ending) return; L.ending = true;
    clearInterval(timer); endBroadcast();
    const title = $('#ltitle').value.trim() || 'Live replay', dur = L.el;
    const done = blob => { closeLive(); L.ending = false; if (blob && dur > 5) saveReplay(blob, title, dur); };
    if (rec && rec.state !== 'inactive') { rec.onstop = () => done(new Blob(chunks, { type: rec.mimeType || 'video/webm' })); rec.stop(); } else done(null);
  };
  async function saveReplay(blob, title, dur) {
    const mb = blob.size / 1048576;
    if (mb > MAXMB) {
      $('#rpm').textContent = `Your replay is ${mb.toFixed(0)} MB, over the ${MAXMB} MB storage limit, so it wasn’t saved to your profile. Download it now, or raise the limit with a paid Supabase plan.`;
      $('#rpa').href = URL.createObjectURL(blob); $('#rp').classList.add('on'); return;
    }
    BP.note('Saving your live replay…', true);
    const type = (blob.type || 'video/webm').split(';')[0], path = me().id + '/' + Date.now() + '-live-replay.' + (type.includes('mp4') ? 'mp4' : 'webm');
    const up = await sb.storage.from('videos').upload(path, blob, { contentType: type });
    if (up.error) return BP.note('Replay not saved: ' + up.error.message);
    const r = await sb.from('bp_videos').insert({ title, kind: 'video', video_path: path, duration_s: Math.min(7200, Math.max(1, dur)), is_live_replay: true, tags: ['live', 'replay'] });
    if (r.error) { sb.storage.from('videos').remove([path]); return BP.note('Replay not saved: ' + r.error.message); }
    BP.note('Replay saved to your profile.', true); BP.load();
  }

  // ---------- Live: viewer ----------
  let V = null, myName = null;
  async function openViewer(liveId, hostName, title) {
    closeViewer(); $('#vw').classList.add('on');
    $('#vn').textContent = (hostName || '') + ' · ' + (title || ''); $('#vs').textContent = 'Connecting…'; $('#vch').innerHTML = '';
    const myId = (me() && me().id) || crypto.randomUUID();
    const ch = sb.channel('live:' + liveId, { config: { broadcast: { self: true }, presence: { key: myId } } });
    const pc = new RTCPeerConnection({ iceServers: ICE }), v = $('#vv');
    const send = (event, payload) => ch.send({ type: 'broadcast', event, payload });
    V = { ch, pc, send, chat: [] };
    pc.ontrack = e => { v.srcObject = e.streams[0]; $('#vs').textContent = ''; v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); $('#vs').textContent = 'Tap the video to unmute'; }); };
    pc.onicecandidate = e => e.candidate && send('ice', { to: 'host', from: myId, c: e.candidate });
    ch.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (payload.to !== myId) return; V.got = true;
      await pc.setRemoteDescription(payload.sdp); flush(pc); await pc.setLocalDescription(await pc.createAnswer());
      send('answer', { from: myId, sdp: pc.localDescription });
    });
    ch.on('broadcast', { event: 'ice' }, ({ payload }) => { if (payload.to === myId) addIce(pc, payload.c); });
    ch.on('broadcast', { event: 'full' }, ({ payload }) => { if (payload.to === myId) $('#vs').textContent = 'This live is full right now. Try again soon.'; });
    ch.on('broadcast', { event: 'end' }, () => { $('#vs').textContent = 'This live has ended.'; });
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => { V.chat.push(payload.name + ': ' + payload.text); $('#vch').innerHTML = V.chat.slice(-5).map(x => '<div>' + esc(x) + '</div>').join(''); });
    ch.on('presence', { event: 'sync' }, () => { $('#vc').textContent = Math.max(0, Object.keys(ch.presenceState()).length - 1) + ' watching'; });
    ch.subscribe(s => { if (s === 'SUBSCRIBED') { ch.track({}); send('join', { from: myId }); } });
    V.retry = setTimeout(() => { if (V && !V.got) send('join', { from: myId }); }, 6000);
    V.t = setTimeout(() => { if (V && !v.srcObject && !$('#vs').textContent.includes('full')) $('#vs').textContent = 'Still connecting. The host’s network may block direct connections.'; }, 15000);
  }
  function closeViewer() {
    if (!V) return; clearTimeout(V.retry); clearTimeout(V.t); V.pc.close(); sb.removeChannel(V.ch); V = null;
    $('#vv').srcObject = null; $('#vw').classList.remove('on');
  }
  $('#vx').onclick = closeViewer;
  $('#vv').onclick = () => { $('#vv').muted = false; $('#vv').play().catch(() => {}); };
  $('#vsd').onclick = async () => {
    const t = $('#vi').value.trim(); if (!t || !V) return;
    if (!me()) return BP.openAuth();
    if (!myName) myName = '@' + ((await names([me().id]))[me().id] || 'viewer');
    V.send('chat', { name: myName, text: t.slice(0, 200) }); $('#vi').value = '';
  };

  // ---------- Notifications and profile views ----------
  let notes = [], noteCh = null, tabN = 'n';
  const text = { live: x => `${x.u} is live: ${esc(x.body || '')}`, comment: x => `${x.u} commented: “${esc(x.body || '')}”`, follow: x => `${x.u} started following you`, view: x => `${x.u} viewed your profile` };
  async function loadNotes() {
    if (!me()) { $('#bd').style.display = 'none'; return; }
    const r = await sb.from('bp_notifications').select('*').order('created_at', { ascending: false }).limit(50);
    notes = r.data || []; await names(notes.map(x => x.actor_id));
    notes.forEach(x => { x.u = '@' + (cache[x.actor_id] || 'someone'); });
    const un = notes.filter(x => !x.read).length; $('#bd').textContent = un > 9 ? '9+' : un; $('#bd').style.display = un ? 'block' : 'none';
  }
  async function drawNotes() {
    $('#n1').className = 'btn' + (tabN === 'n' ? '' : ' alt'); $('#n2').className = 'btn' + (tabN === 'v' ? '' : ' alt');
    if (!me()) { $('#nl').innerHTML = "<p>Sign in to see your activity.</p>"; return; }
    if (tabN === 'n') {
      $('#nl').innerHTML = notes.map(x => `<div class='nrow ${x.read ? '' : 'un'}' data-i='${x.id}'><span>${text[x.type](x)}</span><small>${ago(x.created_at)}</small></div>`).join('') || '<p style="color:var(--mut)">Nothing yet. Likes aside, comments, follows and lives from people you follow show up here.</p>';
    } else {
      const r = await sb.from('bp_profile_views').select('viewer_id,created_at').eq('profile_id', me().id).order('created_at', { ascending: false }).limit(50);
      const rows = r.data || []; await names(rows.map(x => x.viewer_id));
      const week = rows.filter(x => Date.now() - new Date(x.created_at) < 6048e5).length;
      $('#nl').innerHTML = `<p style='font-size:13px;color:var(--mut)'>${week} people viewed your profile in the last 7 days.</p>` +
        (rows.map(x => `<div class='nrow' data-u='${x.viewer_id}'><span>@${esc(cache[x.viewer_id] || 'someone')}</span><small>${ago(x.created_at)}</small></div>`).join('') || '<p>No profile views yet.</p>');
    }
  }
  $('#bell').onclick = async () => {
    if (!me()) return BP.openAuth();
    $('#nt').classList.add('on'); tabN = 'n'; await loadNotes(); drawNotes();
    if (notes.some(x => !x.read)) sb.from('bp_notifications').update({ read: true }).eq('user_id', me().id).eq('read', false).then(() => { $('#bd').style.display = 'none'; });
  };
  $('#n1').onclick = () => { tabN = 'n'; drawNotes(); }; $('#n2').onclick = () => { tabN = 'v'; drawNotes(); };
  $('#ncl').onclick = () => $('#nt').classList.remove('on');
  $('#nl').onclick = async e => {
    const row = e.target.closest('.nrow'); if (!row) return;
    $('#nt').classList.remove('on');
    if (row.dataset.u) return openProfile(row.dataset.u);
    const x = notes.find(n => n.id === row.dataset.i); if (!x) return;
    if (x.type === 'comment') openPost(x.video_id);
    else if (x.type === 'live') { const l = await sb.from('bp_lives').select('id,title,status').eq('id', x.live_id).maybeSingle(); l.data && l.data.status === 'live' ? openViewer(l.data.id, x.u, l.data.title) : BP.note('That live has ended.'); }
    else openProfile(x.actor_id);
  };
  function startNotes() {
    loadNotes(); if (noteCh || !me()) return;
    noteCh = sb.channel('notes:' + me().id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bp_notifications', filter: 'user_id=eq.' + me().id }, async p => {
      await loadNotes(); const x = notes.find(n => n.id === p.new.id); if (x && text[x.type]) BP.note(text[x.type](x).replace(/&[a-z#0-9]+;/g, ''), true); if (x && x.type === 'live') loadLives();
    }).subscribe();
  }
  sb.auth.onAuthStateChange((_e, s) => { if (s?.user) setTimeout(startNotes, 300); else { if (noteCh) { sb.removeChannel(noteCh); noteCh = null; } $('#bd').style.display = 'none'; } });
  if (me()) startNotes();
  setInterval(() => { if (me()) loadNotes(); }, 60000);

  // ---------- Privacy: let people see when I view their profile ----------
  $('#outrow').insertAdjacentHTML('beforebegin', "<div class='row' id='svrow' hidden><span>Let people see when I view their profile</span><input type='checkbox' id='svc' checked style='width:auto'></div>");
  $('#svc').onchange = () => { sb.from('bp_profiles').update({ share_views: $('#svc').checked }).eq('id', me().id).then(r => { if (r.error) BP.note('Couldn’t save: ' + r.error.message); }); };
  document.querySelector('nav [data-v="me"]').addEventListener('click', async () => {
    $('#svrow').hidden = !me(); if (!me()) return;
    const r = await sb.from('bp_profiles').select('share_views').eq('id', me().id).maybeSingle();
    if (r.data) $('#svc').checked = r.data.share_views !== false;
  });
})();
