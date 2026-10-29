// Connects Blueprint to Supabase: accounts, feed, uploads, likes, follows, comments, saved Blueprints.
(async () => {
  const C = window.BLUEPRINT_CONFIG || {};
  if (!C.url || C.url.includes('YOUR_') || !window.supabase) return; // demo mode
  const sb = supabase.createClient(C.url, C.key);
  const MAXMB = C.maxMB || 50;
  let me = (await sb.auth.getSession()).data.session?.user || null;
  sb.auth.onAuthStateChange((_e, s) => { me = s?.user || null; });
  window.BP = { sb, get me() { return me; }, openAuth: () => $('#au').classList.add('on'), load: () => load() };

  // Message banner
  document.body.insertAdjacentHTML('beforeend', "<div id='bpn' style='position:fixed;left:12px;right:12px;top:calc(64px + env(safe-area-inset-top,0px));z-index:30;color:#fff;border-radius:12px;padding:10px 14px;font-size:13px;display:none'></div>");
  const note = (t, ok) => { const el = $('#bpn'); el.style.background = ok ? '#1a9e5a' : '#e5484d'; el.textContent = t; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 7000); };

  // Sign in sheet
  document.body.insertAdjacentHTML('beforeend', "<div class='sheet' id='au'><div><h2>Welcome to Blueprint</h2><input id='ae' type='email' placeholder='Email'><input id='ap' type='password' placeholder='Password (6+ characters)'><div class='msg' id='am'></div><button class='btn' id='asi'>Sign in</button><button class='btn alt' id='asu'>Create account</button><button class='btn alt' id='ax'>Close</button></div></div>");
  const openAuth = () => $('#au').classList.add('on');
  $('#ax').onclick = () => $('#au').classList.remove('on');
  async function auth(kind) {
    const m = $('#am'); m.className = 'msg'; m.textContent = 'One moment…';
    const cred = { email: $('#ae').value.trim(), password: $('#ap').value };
    const r = kind === 'in' ? await sb.auth.signInWithPassword(cred) : await sb.auth.signUp(cred);
    if (r.error) { m.className = 'msg err'; m.textContent = r.error.message; return; }
    if (!r.data.session) { m.className = 'msg ok'; m.textContent = 'Check your email to confirm, then sign in.'; return; }
    me = r.data.user; $('#au').classList.remove('on'); m.textContent = ''; load();
  }
  $('#asi').onclick = () => auth('in');
  $('#asu').onclick = () => auth('up');

  // Feed
  const SEL = 'id,user_id,title,tags,steps,duration_s,is_live_replay,video_path,bp_profiles(username),bp_likes(count),bp_comments(count)';
  const toPost = (v, i) => {
    const tag = [...(v.tags || []), ...(v.is_live_replay ? ['live'] : [])];
    return {
      id: v.id, uid: v.user_id, u: '@' + (v.bp_profiles?.username || 'user'), t: v.title, tag: tag.length ? tag : ['new'],
      d: v.duration_s, l: v.bp_likes[0].count - (liked.has(v.id) ? 1 : 0),
      c: Array(v.bp_comments[0].count).fill(['@viewer', 'Comment']), g: i % 5,
      src: sb.storage.from('videos').getPublicUrl(v.video_path).data.publicUrl, steps: v.steps
    };
  };
  async function load() {
    const { data, error } = await sb.from('bp_videos').select(SEL).order('created_at', { ascending: false }).limit(40);
    if (error) { note('Couldn’t load videos: ' + error.message); return; }
    if (!data.length) return; // keep demo posts until real ones exist
    liked.clear(); saved.clear(); followed.clear();
    if (me) {
      const [l, s, f] = await Promise.all([
        sb.from('bp_likes').select('video_id').eq('user_id', me.id),
        sb.from('bp_saves').select('video_id').eq('user_id', me.id),
        sb.from('bp_follows').select('following_id').eq('follower_id', me.id)
      ]);
      (l.data || []).forEach(x => liked.add(x.video_id));
      (s.data || []).forEach(x => saved.add(x.video_id));
      (f.data || []).forEach(x => followed.add(x.following_id));
    }
    let rows = data;
    const have = new Set(data.map(v => v.id)), missing = [...saved].filter(id => !have.has(id));
    if (missing.length) { const m = await sb.from('bp_videos').select(SEL).in('id', missing); rows = rows.concat(m.data || []); }
    P = rows.map(toPost);
    renderFeed();
  }

  async function loadComments(p) {
    const r = await sb.from('bp_comments').select('body,created_at,bp_profiles(username)').eq('video_id', p.id).order('created_at').limit(100);
    p.c = (r.data || []).map(x => ['@' + (x.bp_profiles?.username || 'user'), x.body]);
    drawC();
  }

  // Like, save, follow, comments (saved to the database)
  $('#feed').addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b || !['like', 'sv', 'follow', 'cm'].includes(b.dataset.a)) return;
    const a = b.dataset.a, p = P.find(x => String(x.id) === b.closest('.post').dataset.id);
    if (!p || typeof p.id !== 'string') return; // demo posts keep the local behaviour
    e.stopImmediatePropagation();
    if (a === 'cm') { cur = p; await loadComments(p); $('#cs').classList.add('on'); return; }
    if (!me) return openAuth();
    const keep = () => { renderFeed(); const el = $(`.post[data-id="${p.id}"]`); if (el) el.scrollIntoView(); };
    let set, id, table, row, match;
    if (a === 'like') { set = liked; id = p.id; table = 'bp_likes'; row = { video_id: p.id }; match = { video_id: p.id, user_id: me.id }; }
    if (a === 'sv') { set = saved; id = p.id; table = 'bp_saves'; row = { video_id: p.id }; match = { video_id: p.id, user_id: me.id }; }
    if (a === 'follow') { if (!p.uid) return; set = followed; id = p.uid; table = 'bp_follows'; row = { following_id: p.uid }; match = { follower_id: me.id, following_id: p.uid }; }
    const on = set.has(id);
    on ? set.delete(id) : set.add(id); keep();
    const r = on ? await sb.from(table).delete().match(match) : await sb.from(table).insert(row);
    if (r.error) { on ? set.add(id) : set.delete(id); keep(); note('Couldn’t save that: ' + r.error.message); }
  }, true);

  const cbOld = $('#cb').onclick;
  $('#cb').onclick = async () => {
    if (!cur || typeof cur.id !== 'string') return cbOld();
    const v = $('#ci').value.trim(); if (!v) return;
    if (!me) { $('#cs').classList.remove('on'); return openAuth(); }
    const r = await sb.from('bp_comments').insert({ video_id: cur.id, body: v.slice(0, 500) });
    if (r.error) return note('Couldn’t post comment: ' + r.error.message);
    $('#ci').value = ''; await loadComments(cur);
    renderFeed(); const el = $(`.post[data-id="${cur.id}"]`); if (el) el.scrollIntoView();
  };

  // Posting a video: account required, uploads go to Storage, rows to bp_videos
  const plusOld = $('#plus').onclick;
  $('#plus').onclick = () => (me ? plusOld() : openAuth());
  $('#umsg').insertAdjacentHTML('afterend', `<div style='font-size:12px;color:var(--mut)'>Maximum file size: ${MAXMB} MB.</div>`);
  let busy = false;
  $('#post').onclick = async () => {
    if (busy) return;
    const f = $('#file').files[0], m = $('#umsg');
    const fail = t => { m.className = 'msg err'; m.textContent = t; busy = false; $('#post').disabled = false; };
    if (!f) return fail('Choose a video first.');
    if (!pending) return fail('Still reading the video. Wait a second and tap Post again, or choose a different file.');
    if (f.size > MAXMB * 1048576) return fail(`This video is ${(f.size / 1048576).toFixed(0)} MB. The limit is ${MAXMB} MB. Trim or compress it and try again.`);
    busy = true; $('#post').disabled = true; m.className = 'msg'; m.textContent = 'Uploading… keep this page open.';
    let path;
    try {
      const pr = await sb.from('bp_profiles').select('id').eq('id', me.id).maybeSingle();
      if (!pr.data) {
        const un = (me.email || 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 15) + '_' + me.id.slice(0, 4);
        const ins = await sb.from('bp_profiles').insert({ id: me.id, username: un });
        if (ins.error) throw new Error('Your profile is missing. Run update-all.sql in Supabase, then try again. (' + ins.error.message + ')');
      }
      path = me.id + '/' + Date.now() + '-' + f.name.replace(/[^\w.-]/g, '_');
      const up = await sb.storage.from('videos').upload(path, f, { contentType: f.type || 'video/mp4' });
      if (up.error) throw up.error;
      const desc = $('#ud').value;
      const tags = (desc.match(/#\w+/g) || []).map(x => x.slice(1));
      const steps = desc.split('\n').filter(x => /^\d+[.)]/.test(x.trim())).map(x => x.replace(/^\d+[.)]\s*/, ''));
      const r = await sb.from('bp_videos').insert({
        title: $('#ut').value.trim() || 'Untitled', caption: desc, tags,
        steps: steps.length ? steps : null, video_path: path, duration_s: pending.d
      });
      if (r.error) { await sb.storage.from('videos').remove([path]); throw r.error; }
    } catch (e) { return fail(e.message || 'Upload failed. Try again.'); }
    pending = null; $('#file').value = ''; $('#ut').value = ''; $('#ud').value = '';
    m.textContent = ''; busy = false; $('#post').disabled = false;
    $('#up').classList.remove('on'); await load(); show('feed'); $('#feed').scrollTop = 0;
    note('Posted! Your video is in the feed.', true);
  };

  load();
})();
