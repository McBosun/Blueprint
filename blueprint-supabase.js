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

  // Feed (plain queries, no embeds, so nothing can be ambiguous)
  const pub = (b, path) => sb.storage.from(b).getPublicUrl(path).data.publicUrl;
  async function build(rows) {
    if (!rows.length) return [];
    const ids = rows.map(v => v.id), uids = [...new Set(rows.map(v => v.user_id))];
    const [pr, lk, cm] = await Promise.all([
      sb.from('bp_profiles').select('id,username').in('id', uids),
      sb.from('bp_likes').select('video_id').in('video_id', ids),
      sb.from('bp_comments').select('video_id').in('video_id', ids)
    ]);
    const nm = {}; (pr.data || []).forEach(x => { nm[x.id] = x.username; });
    const cnt = r => { const m = {}; (r.data || []).forEach(x => { m[x.video_id] = (m[x.video_id] || 0) + 1; }); return m; };
    const L = cnt(lk), K = cnt(cm);
    return rows.map((v, i) => {
      const tag = [...(v.tags || []), ...(v.is_live_replay ? ['live'] : [])];
      const post = { id: v.id, uid: v.user_id, u: '@' + (nm[v.user_id] || 'user'), t: v.title, tag: tag.length ? tag : ['new'], d: v.duration_s,
        l: (L[v.id] || 0) - (liked.has(v.id) ? 1 : 0), c: Array(K[v.id] || 0).fill(['@viewer', 'Comment']), g: i % 5, steps: v.steps };
      if (v.kind === 'photo') {
        post.imgs = (v.image_paths || []).map(x => pub('media', x));
        if (v.music_path) { post.music = pub('media', v.music_path); post.mt = v.music_title || 'Music'; }
      } else post.src = pub('videos', v.video_path);
      post.files = v.kind === 'photo' ? [...(v.image_paths || []).map(x => ['media', x]), ...(v.music_path ? [['media', v.music_path]] : [])] : [['videos', v.video_path]];
      return post;
    });
  }
  window.BP.build = build;
  window.BP.note = note;
  async function load() {
    const { data, error } = await sb.from('bp_videos').select('*').order('created_at', { ascending: false }).limit(40);
    if (error) { note('Couldn’t load posts: ' + error.message); return; }
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
    if (missing.length) { const m = await sb.from('bp_videos').select('*').in('id', missing); rows = rows.concat(m.data || []); }
    P = await build(rows);
    renderFeed();
  }
  async function loadComments(p) {
    const r = await sb.from('bp_comments').select('body,user_id,created_at').eq('video_id', p.id).order('created_at').limit(100);
    const rows = r.data || [], uids = [...new Set(rows.map(x => x.user_id))];
    const pr = uids.length ? await sb.from('bp_profiles').select('id,username').in('id', uids) : { data: [] };
    const nm = {}; (pr.data || []).forEach(x => { nm[x.id] = x.username; });
    p.c = rows.map(x => ['@' + (nm[x.user_id] || 'user'), x.body]);
    drawC();
  }

  // Photo slideshows and music
  window.slideHtml = p => `<div class="slides">${p.imgs.map((u, i) => `<img src="${u}" alt="" class="${i ? '' : 'on'}">`).join('')}</div>${p.music ? `<button class="mu" data-a="mu" data-src="${p.music}">♪ ${String(p.mt || 'Music').replace(/[<>&"']/g, '')}</button>` : ''}`;
  setInterval(() => { $$('.slides').forEach(s => { const im = [...s.children]; if (im.length < 2) return; const i = im.findIndex(x => x.classList.contains('on')); im[i].classList.remove('on'); im[(i + 1) % im.length].classList.add('on'); }); }, 4000);
  const au = new Audio(); au.loop = true; let musicOn = false;
  $('#feed').addEventListener('click', e => {
    const b = e.target.closest('.mu'); if (!b) return;
    if (au.src === b.dataset.src && !au.paused) { au.pause(); musicOn = false; b.classList.remove('on'); return; }
    au.src = b.dataset.src; au.play().catch(() => note('Tap the music button again to play.')); musicOn = true; b.classList.add('on');
  });
  let scT; $('#feed').addEventListener('scroll', () => { clearTimeout(scT); scT = setTimeout(() => {
    const f = $('#feed').getBoundingClientRect();
    const cur = $$('.post').find(el => Math.abs(el.getBoundingClientRect().top - f.top) < f.height / 2);
    const mu = cur && cur.querySelector('.mu');
    if (mu && musicOn) { if (au.src !== mu.dataset.src) au.src = mu.dataset.src; au.play().catch(() => {}); mu.classList.add('on'); } else au.pause();
  }, 200); });

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

  // Posting: a video, or photos with music. Account required.
  const plusOld = $('#plus').onclick;
  $('#plus').onclick = () => (me ? plusOld() : openAuth());
  $('#up h2').textContent = 'New post';
  $('#up h2').insertAdjacentHTML('afterend', "<div style='display:flex;gap:8px'><button class='btn' id='m1'>Video</button><button class='btn alt' id='m2'>Photos + music</button></div>");
  $('#file').insertAdjacentHTML('afterend', "<div id='pp' hidden><input type='file' id='pimg' accept='image/*' multiple><input type='file' id='pmus' accept='audio/*'><div style='font-size:12px;color:var(--mut)'>Pick 1 to 10 photos, then optional music from your phone (max 15 MB). Only use music you have the right to share.</div></div>");
  $('#umsg').insertAdjacentHTML('afterend', `<div id='mx' style='font-size:12px;color:var(--mut)'>Maximum video size: ${MAXMB} MB.</div>`);
  let mode = 'video', busy = false;
  const setMode = k => {
    mode = k; $('#m1').className = 'btn' + (k === 'video' ? '' : ' alt'); $('#m2').className = 'btn' + (k === 'photo' ? '' : ' alt');
    $('#file').style.display = $('#mx').style.display = k === 'video' ? '' : 'none'; $('#pp').hidden = k !== 'photo';
    $('#umsg').className = 'msg'; $('#umsg').textContent = k === 'video' ? 'Videos can be up to 20 minutes long.' : 'Add 1 to 10 photos.';
  };
  $('#m1').onclick = () => setMode('video'); $('#m2').onclick = () => setMode('photo');

  const toJpeg = (f, max = 1600) => new Promise((ok, no) => {
    const im = new Image(), u = URL.createObjectURL(f);
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(b => (b ? ok(b) : no(new Error('That photo can’t be read.'))), 'image/jpeg', .85);
    };
    im.onerror = () => no(new Error('That photo can’t be read. Try a JPG or PNG.')); im.src = u;
  });
  async function ensureProfile() {
    const pr = await sb.from('bp_profiles').select('id').eq('id', me.id).maybeSingle();
    if (pr.data) return;
    const un = (me.email || 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 15) + '_' + me.id.slice(0, 4);
    const ins = await sb.from('bp_profiles').insert({ id: me.id, username: un });
    if (ins.error) throw new Error('Your profile is missing. Run update-all.sql in Supabase, then try again. (' + ins.error.message + ')');
  }
  const meta = () => {
    const d = $('#ud').value, steps = d.split('\n').filter(x => /^\d+[.)]/.test(x.trim())).map(x => x.replace(/^\d+[.)]\s*/, ''));
    return { title: $('#ut').value.trim() || 'Untitled', caption: d, tags: (d.match(/#\w+/g) || []).map(x => x.slice(1)), steps: steps.length ? steps : null };
  };
  const finish = async () => {
    pending = null; ['#file', '#pimg', '#pmus'].forEach(i => { $(i).value = ''; }); $('#ut').value = ''; $('#ud').value = ''; $('#umsg').textContent = '';
    busy = false; $('#post').disabled = false; $('#up').classList.remove('on');
    await load(); show('feed'); $('#feed').scrollTop = 0; note('Posted! It is in the feed and on your profile.', true);
  };
  $('#post').onclick = async () => {
    if (busy) return;
    const m = $('#umsg'), paths = [];
    const fail = t => { m.className = 'msg err'; m.textContent = t; busy = false; $('#post').disabled = false; };
    const up = async (bucket, blob, name, type) => {
      const path = me.id + '/' + Date.now() + '-' + name;
      const r = await sb.storage.from(bucket).upload(path, blob, { contentType: type });
      if (r.error) throw r.error; paths.push([bucket, path]); return path;
    };
    const undo = () => Promise.all(paths.map(([b, x]) => sb.storage.from(b).remove([x])));
    const start = t => { busy = true; $('#post').disabled = true; m.className = 'msg'; m.textContent = t; };

    if (mode === 'photo') {
      const imgs = [...$('#pimg').files].slice(0, 10), mus = $('#pmus').files[0];
      if (!imgs.length) return fail('Choose 1 to 10 photos.');
      if (mus && mus.size > 15 * 1048576) return fail('The music file is over 15 MB.');
      start('Uploading… keep this page open.');
      try {
        await ensureProfile();
        const ip = []; let i = 0;
        for (const f of imgs) ip.push(await up('media', await toJpeg(f), (i++) + '.jpg', 'image/jpeg'));
        const mp = mus ? await up('media', mus, 'music-' + mus.name.replace(/[^\w.-]/g, '_'), mus.type || 'audio/mpeg') : null;
        const r = await sb.from('bp_videos').insert({ ...meta(), kind: 'photo', image_paths: ip, music_path: mp, music_title: mus ? mus.name.replace(/\.[^.]+$/, '') : null, duration_s: Math.max(1, ip.length * 5) });
        if (r.error) throw r.error;
      } catch (e) { await undo(); return fail(e.message || 'Upload failed. Try again.'); }
      return finish();
    }

    const f = $('#file').files[0];
    if (!f) return fail('Choose a video first.');
    if (!pending) return fail('Still reading the video. Wait a second and tap Post again, or choose a different file.');
    if (f.size > MAXMB * 1048576) return fail(`This video is ${(f.size / 1048576).toFixed(0)} MB. The limit is ${MAXMB} MB. Trim or compress it and try again.`);
    start('Uploading… keep this page open.');
    try {
      await ensureProfile();
      const path = await up('videos', f, f.name.replace(/[^\w.-]/g, '_'), f.type || 'video/mp4');
      const r = await sb.from('bp_videos').insert({ ...meta(), kind: 'video', video_path: path, duration_s: pending.d });
      if (r.error) throw r.error;
    } catch (e) { await undo(); return fail(e.message || 'Upload failed. Try again.'); }
    finish();
  };

  load();
})();
