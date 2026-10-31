// Editable profile: photo, name, username, bio, location, link, interests, stats, video tabs.
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let prof = { username: 'you', display_name: '', bio: '', location: '', link: '', interests: [], avatar_url: null };
  let stats = { followers: 0, following: 0 }, tab = 'videos', newAvatar = null, myPosts = [];
  const sb = () => window.BP && window.BP.sb;
  const me = () => window.BP && window.BP.me;
  const live = () => !!sb();

  async function fetchProfile() {
    if (!live() || !me()) return;
    const q = (col) => sb().from('bp_follows').select('*', { count: 'exact', head: true }).eq(col, me().id);
    const [p, f1, f2] = await Promise.all([sb().from('bp_profiles').select('*').eq('id', me().id).single(), q('following_id'), q('follower_id')]);
    if (p.data) prof = { ...prof, ...p.data, interests: p.data.interests || [] };
    stats = { followers: f1.count || 0, following: f2.count || 0 };
    const mv = await sb().from('bp_videos').select('*').eq('user_id', me().id).order('created_at', { ascending: false });
    myPosts = window.BP.build ? await window.BP.build(mv.data || []) : [];
  }

  const mine = () => (live() ? myPosts : P.filter(p => p.u === '@you'));
  const tile = p => `<div data-id='${esc(p.id)}' style='background:${G[p.g % 5]}'>${p.imgs ? `<img src='${esc(p.imgs[0])}' alt='' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover'>` : p.src ? `<video src='${esc(p.src)}#t=0.1' preload='metadata' muted playsinline style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover'></video>` : ''}<span style='position:relative'>${esc(p.t)}</span></div>`;

  function render() {
    const box = $('#pf');
    if (live() && !me()) {
      box.innerHTML = "<div class='pad'><svg width='72' height='72'><use href='#logo'/></svg><h2>Create your profile</h2><div class='card'>Sign in to add your photo, name and bio.</div><button class='btn' id='psi'>Sign in</button><button class='btn alt' id='psu'>Create account</button></div>";
      $('#psi').onclick = () => window.BP.openAuth('in'); $('#psu').onclick = () => window.BP.openAuth('up');
      return;
    }
    const v = mine(), likes = v.reduce((a, p) => a + p.l, 0);
    const done = [prof.avatar_url, prof.display_name, prof.bio, prof.location, prof.link, prof.interests.length].filter(Boolean).length;
    const list = tab === 'videos' ? v : tab === 'lives' ? v.filter(p => p.tag.includes('live')) : P.filter(p => saved.has(p.id));
    const tabs = [['videos', 'Posts'], ['lives', 'Lives'], ['saved', 'Saved']].map(t => `<button data-t='${t[0]}' class='${tab === t[0] ? 'on' : ''}'>${t[1]}</button>`).join('');
    box.innerHTML = `<div class='cover'></div>
${prof.avatar_url ? `<img class='av' src='${esc(prof.avatar_url)}' alt=''>` : "<svg class='av' viewBox='0 0 100 100'><use href='#logo'/></svg>"}
<div class='pn'><h2>${esc(prof.display_name || prof.username)}</h2><div class='un'>@${esc(prof.username)}</div>
${prof.bio ? `<p>${esc(prof.bio)}</p>` : "<p style='color:var(--mut)'>Add a bio so people know what you make.</p>"}
<div style='font-size:12px;color:var(--mut)'>${esc(prof.location)}${prof.location && prof.link ? ' · ' : ''}${prof.link ? `<a href='${esc(prof.link)}' target='_blank' rel='noopener noreferrer' style='color:var(--blue)'>${esc(prof.link.replace(/^https?:\/\//, ''))}</a>` : ''}</div>
<div style='margin-top:8px'>${prof.interests.map(t => `<span class='pill'>#${esc(t)}</span>`).join('')}</div></div>
<div class='st'><div><b>${v.length}</b><span>Posts</span></div><div><b>${stats.followers}</b><span>Followers</span></div><div><b>${stats.following}</b><span>Following</span></div><div><b>${n(likes)}</b><span>Likes</span></div></div>
<div class='pb'><button class='btn' id='pe'>Edit profile</button><button class='btn alt' id='ps'>Share profile</button></div>
${done < 6 ? `<div class='card' style='margin:0 16px 8px'>Profile ${Math.round(done / 6 * 100)}% complete<div style='height:6px;background:var(--line);border-radius:9px;margin-top:6px'><i style='display:block;height:100%;width:${done / 6 * 100}%;background:var(--blue);border-radius:9px'></i></div></div>` : ''}
<div class='ptabs'>${tabs}</div>
<div class='pg'>${list.map(tile).join('') || "<p class='pad' style='grid-column:1/-1;color:var(--mut)'>Nothing here yet.</p>"}</div>`;
  }

  async function refresh() {
    await fetchProfile(); render();
    $('#outrow').hidden = !(live() && me());
  }

  document.body.insertAdjacentHTML('beforeend', `<div class='sheet' id='ed'><div><h2>Edit profile</h2>
<label>Photo</label><input type='file' id='eph' accept='image/*'>
<label>Name</label><input id='en' maxlength='30' placeholder='Display name'>
<label>Username</label><input id='eu' maxlength='20' placeholder='letters, numbers, _ and .'>
<label>Bio <span id='ec' style='float:right;color:var(--mut)'>0/160</span></label><textarea id='eb' rows='3' maxlength='160' placeholder='Tell people what you make'></textarea>
<label>Location</label><input id='el' maxlength='40' placeholder='City, country'>
<label>Link</label><input id='ek' maxlength='200' placeholder='https://'>
<label>Interests (up to 5, separated by commas)</label><input id='ei' placeholder='cooking, travel, tech'>
<div class='msg' id='em'></div><button class='btn' id='esv'>Save</button><button class='btn alt' id='ecx'>Cancel</button></div></div>`);

  function openEdit() {
    newAvatar = null; $('#eph').value = ''; $('#em').textContent = '';
    $('#en').value = prof.display_name || ''; $('#eu').value = prof.username; $('#eb').value = prof.bio || '';
    $('#el').value = prof.location || ''; $('#ek').value = prof.link || ''; $('#ei').value = prof.interests.join(', ');
    $('#ec').textContent = $('#eb').value.length + '/160'; $('#ed').classList.add('on');
  }
  $('#eb').oninput = () => { $('#ec').textContent = $('#eb').value.length + '/160'; };
  $('#ecx').onclick = () => $('#ed').classList.remove('on');

  const toSquare = f => new Promise((ok, no) => {
    const im = new Image(), u = URL.createObjectURL(f);
    im.onload = () => {
      const s = Math.min(im.width, im.height), c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 256, 256);
      URL.revokeObjectURL(u); c.toBlob(b => (b ? ok(b) : no()), 'image/jpeg', .85);
    };
    im.onerror = no; im.src = u;
  });
  $('#eph').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { newAvatar = await toSquare(f); $('#em').className = 'msg ok'; $('#em').textContent = 'Photo ready. Tap Save.'; }
    catch (x) { $('#em').className = 'msg err'; $('#em').textContent = 'That file isn’t a usable image.'; }
  };

  $('#esv').onclick = async () => {
    const m = $('#em'); m.className = 'msg err';
    const username = $('#eu').value.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) { m.textContent = 'Username: 3 to 20 letters, numbers, _ or .'; return; }
    const link = $('#ek').value.trim();
    if (link && !/^https?:\/\/\S+\.\S+$/.test(link)) { m.textContent = 'Link must start with https://'; return; }
    const interests = $('#ei').value.split(',').map(s => s.trim().replace(/^#/, '').toLowerCase()).filter(Boolean).slice(0, 5);
    const next = { username, display_name: $('#en').value.trim(), bio: $('#eb').value.trim(), location: $('#el').value.trim(), link: link || null, interests };
    m.className = 'msg'; m.textContent = 'Saving…';
    try {
      if (newAvatar) {
        if (live()) {
          const path = me().id + '/avatar.jpg';
          const up = await sb().storage.from('avatars').upload(path, newAvatar, { upsert: true, contentType: 'image/jpeg' });
          if (up.error) throw up.error;
          next.avatar_url = sb().storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
        } else next.avatar_url = URL.createObjectURL(newAvatar);
      }
      if (live()) { const r = await sb().from('bp_profiles').update(next).eq('id', me().id); if (r.error) throw r.error; }
      prof = { ...prof, ...next };
      $('#ed').classList.remove('on'); render();
      if (live() && window.BP.load) window.BP.load().then(render);
    } catch (e) { m.className = 'msg err'; m.textContent = e.code === '23505' ? 'That username is taken.' : (e.message || 'Couldn’t save. Try again.'); }
  };

  async function share() {
    const url = location.href.split('#')[0] + '#@' + prof.username;
    try { await navigator.share({ title: 'Blueprint', text: (prof.display_name || prof.username) + ' on Blueprint', url }); }
    catch (e) { try { await navigator.clipboard.writeText(url); $('#ps').textContent = 'Link copied'; } catch (x) {} }
  }

  $('#pf').onclick = e => {
    const t = e.target.closest('[data-t]');
    if (t) { tab = t.dataset.t; render(); return; }
    if (e.target.id === 'pe') return openEdit();
    if (e.target.id === 'ps') return share();
    const g = e.target.closest('[data-id]');
    if (g) { const id = g.dataset.id, post = [...myPosts, ...P].find(x => String(x.id) === id); if (post && !P.find(x => String(x.id) === id)) P.push(post); renderFeed(); show('feed'); const el = $(`.post[data-id="${id}"]`); if (el) el.scrollIntoView(); }
  };
  $('#so').onclick = async () => { await sb().auth.signOut(); setTimeout(refresh, 300); };
  document.querySelector('nav [data-v="me"]').addEventListener('click', refresh);
  render();
})();
