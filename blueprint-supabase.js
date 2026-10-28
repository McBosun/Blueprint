// Connects the Blueprint page to Supabase: sign in, feed, video upload, likes.
(async () => {
  const C = window.BLUEPRINT_CONFIG || {};
  if (!C.url || C.url.includes('YOUR_') || !window.supabase) return; // demo mode
  const sb = supabase.createClient(C.url, C.key);
  let me = (await sb.auth.getSession()).data.session?.user || null;
  sb.auth.onAuthStateChange((_e, s) => { me = s?.user || null; });
  window.BP = { sb, get me() { return me; }, openAuth: () => $('#au').classList.add('on'), load: () => load() };

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
    me = r.data.user; $('#au').classList.remove('on'); load();
  }
  $('#asi').onclick = () => auth('in');
  $('#asu').onclick = () => auth('up');

  // Feed
  async function load() {
    const { data, error } = await sb.from('bp_videos')
      .select('id,title,tags,steps,duration_s,is_live_replay,video_path,bp_profiles(username),bp_likes(count),bp_comments(count)')
      .order('created_at', { ascending: false }).limit(30);
    if (error || !data.length) return; // keep demo posts until real ones exist
    liked.clear();
    if (me) {
      const r = await sb.from('bp_likes').select('video_id').eq('user_id', me.id);
      (r.data || []).forEach(x => liked.add(x.video_id));
    }
    P = data.map((v, i) => {
      const tag = [...(v.tags || []), ...(v.is_live_replay ? ['live'] : [])];
      return {
        id: v.id, u: '@' + (v.bp_profiles?.username || 'user'), t: v.title, tag: tag.length ? tag : ['new'],
        d: v.duration_s, l: v.bp_likes[0].count - (liked.has(v.id) ? 1 : 0),
        c: Array(v.bp_comments[0].count).fill(['@viewer', 'Comment']), g: i % 5,
        src: sb.storage.from('videos').getPublicUrl(v.video_path).data.publicUrl, steps: v.steps
      };
    });
    renderFeed();
  }

  // Likes saved to the database
  $('#feed').addEventListener('click', async e => {
    const b = e.target.closest('[data-a="like"]');
    if (!b) return;
    e.stopImmediatePropagation();
    if (!me) return openAuth();
    const el = b.closest('.post'), p = P.find(x => String(x.id) === el.dataset.id);
    if (typeof p.id !== 'string') return; // demo post
    if (liked.has(p.id)) { liked.delete(p.id); sb.from('bp_likes').delete().match({ video_id: p.id, user_id: me.id }).then(() => {}); }
    else { liked.add(p.id); sb.from('bp_likes').insert({ video_id: p.id }).then(() => {}); }
    renderFeed(); $(`.post[data-id="${p.id}"]`).scrollIntoView();
  }, true);

  // Posting requires an account; uploads go to Storage, rows to bp_videos
  const plusOld = $('#plus').onclick;
  $('#plus').onclick = () => (me ? plusOld() : openAuth());
  const postOld = $('#post').onclick;
  $('#post').onclick = async () => {
    const f = $('#file').files[0], m = $('#umsg');
    if (!pending || !f) return postOld();
    m.className = 'msg'; m.textContent = 'Uploading…';
    const path = me.id + '/' + Date.now() + '-' + f.name.replace(/[^\w.-]/g, '_');
    const up = await sb.storage.from('videos').upload(path, f, { contentType: f.type });
    if (up.error) { m.className = 'msg err'; m.textContent = up.error.message; return; }
    const desc = $('#ud').value;
    const tags = (desc.match(/#\w+/g) || []).map(x => x.slice(1));
    const steps = desc.split('\n').filter(x => /^\d+[.)]/.test(x.trim())).map(x => x.replace(/^\d+[.)]\s*/, ''));
    const r = await sb.from('bp_videos').insert({
      title: $('#ut').value.trim() || 'Untitled', caption: desc, tags,
      steps: steps.length ? steps : null, video_path: path, duration_s: pending.d
    });
    if (r.error) { m.className = 'msg err'; m.textContent = r.error.message; return; }
    pending = null; $('#file').value = ''; $('#ut').value = ''; $('#ud').value = '';
    m.textContent = ''; $('#up').classList.remove('on'); await load(); show('feed');
  };

  load();
})();
