// Sound library. Tab 1: Blueprint Sounds (artists upload their own music for others to use, including Naija music).
// Tab 2: free Creative Commons music from Jamendo (needs a free jamendoId in config.js). Tab 3: upload your own sound.
(async () => {
  let tries = 0;
  while (!window.BP && tries++ < 50) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const sb = BP.sb, me = () => BP.me, C = window.BLUEPRINT_CONFIG || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const GENRES = ['All', 'Afrobeats', 'Amapiano', 'Highlife', 'Afro-fusion', 'Gospel', 'Hip-hop', 'Fuji', 'Instrumental', 'Other'];
  const FREE = ['Afrobeat', 'African', 'Highlife', 'Gospel', 'Hip-hop', 'Pop', 'Electronic', 'Reggae', 'Chillout', 'Classical', 'Acoustic', 'Cinematic'];
  let cb = null, tab = 'mine', genre = 'All', list = [];
  const prev = new Audio(); prev.preload = 'none';

  document.body.insertAdjacentHTML('beforeend', `<div class='ovp' id='snp' style='z-index:60'>
<div style='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)'><h2 style='margin:0'>Sounds</h2><button class='btn alt' id='snx' style='width:auto;margin:0 0 0 auto'>Close</button></div>
<div style='display:flex;gap:6px;padding:10px 14px 0'><button class='btn' id='sn1' style='margin:0;padding:9px'>Blueprint & Naija</button><button class='btn alt' id='sn2' style='margin:0;padding:9px'>Free music</button><button class='btn alt' id='sn3' style='margin:0;padding:9px'>Add mine</button></div>
<div id='snb' style='padding:10px 14px'></div></div>`);
  const box = document.getElementById('snb'), root = document.getElementById('snp');
  const stop = () => { prev.pause(); };
  const close = () => { stop(); root.classList.remove('on'); };
  document.getElementById('snx').onclick = close;
  window.BPSounds = { open(fn) { cb = fn; tab = 'mine'; genre = 'All'; root.classList.add('on'); draw(); } };

  const chips = arr => `<div style='display:flex;gap:6px;overflow-x:auto;padding:6px 0'>${arr.map(g => `<span class='pill' data-g='${esc(g)}' style='white-space:nowrap;${g === genre ? 'background:var(--blue);color:#fff' : ''}'>${esc(g)}</span>`).join('')}</div>`;
  const rows = () => list.map((s, i) => `<div class='nrow' style='cursor:default'><span><b>${esc(s.title)}</b><br><small style='color:var(--mut)'>${esc(s.sub)}</small></span><span style='display:flex;gap:6px'><button class='btn alt' data-p='${i}' style='width:auto;margin:0;padding:8px 12px'>▶</button><button class='btn' data-u='${i}' style='width:auto;margin:0;padding:8px 12px'>Use</button></span></div>`).join('');

  function draw() {
    ['sn1', 'sn2', 'sn3'].forEach((id, i) => { document.getElementById(id).className = 'btn' + (['mine', 'free', 'up'][i] === tab ? '' : ' alt'); });
    if (tab === 'up') return drawUpload();
    box.innerHTML = `<input id='snq' placeholder='Search songs or artists'>${chips(tab === 'mine' ? GENRES : FREE)}<div id='snl'>Loading…</div>`;
    document.getElementById('snq').oninput = () => { clearTimeout(draw.t); draw.t = setTimeout(load, 350); };
    load();
  }
  async function load() {
    const q = (document.getElementById('snq') || { value: '' }).value.trim().replace(/[,()%*\\]/g, ' '), el = document.getElementById('snl'); if (!el) return;
    el.textContent = 'Loading…';
    try {
      if (tab === 'mine') {
        let r = sb.from('bp_sounds').select('*').order('created_at', { ascending: false }).limit(40);
        if (genre !== 'All') r = r.eq('genre', genre);
        if (q) r = r.or(`title.ilike.*${q}*,artist.ilike.*${q}*`);
        const { data, error } = await r; if (error) throw error;
        list = (data || []).map(s => ({ url: sb.storage.from('sounds').getPublicUrl(s.audio_path).data.publicUrl, title: s.title + ' — ' + s.artist, sub: `${s.genre} · ${mmss(s.duration_s || 0)}`, credit: 'Blueprint Sound by ' + s.artist }));
        el.innerHTML = rows() || "<p style='color:var(--mut)'>No sounds here yet. Artists can add theirs in the Add mine tab. If you make music, be the first.</p>";
      } else {
        if (!C.jamendoId) { el.innerHTML = "<p style='color:var(--mut)'>Free music search isn’t switched on yet. The app owner needs a free Jamendo client ID in config.js (see the README).</p>"; return; }
        const kw = q || (genre === 'All' ? 'afrobeat' : genre), u = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(C.jamendoId)}&format=json&limit=40&audioformat=mp32&order=popularity_total&search=${encodeURIComponent(kw)}`;
        const j = await (await fetch(u)).json();
        list = (j.results || []).filter(t => t.audio && /\/licenses\/by(-sa)?\/|publicdomain|zero/.test(t.license_ccurl || '')).map(t => {
          const lic = (t.license_ccurl.match(/licenses\/([a-z-]+)\/([\d.]+)/) || []); // only licenses that allow commercial use and adaptation
          return { url: t.audio, title: t.name + ' — ' + t.artist_name, sub: `${mmss(+t.duration || 0)} · ${lic[1] ? 'CC ' + lic[1].toUpperCase() + ' ' + lic[2] : 'Free'} · Jamendo`, credit: `${t.artist_name} · ${lic[1] ? 'CC ' + lic[1].toUpperCase() + ' ' + lic[2] : 'Free'} · Jamendo` };
        });
        el.innerHTML = rows() || "<p style='color:var(--mut)'>Nothing found. Try another word.</p>";
      }
    } catch (e) { el.innerHTML = `<p style='color:#e5484d'>Couldn’t load sounds: ${esc(e.message || 'network problem')}</p>`; }
  }
  box.onclick = e => {
    const g = e.target.closest('[data-g]'), p = e.target.closest('[data-p]'), u = e.target.closest('[data-u]');
    if (g) { genre = g.dataset.g; draw(); }
    if (p) { const s = list[+p.dataset.p]; if (prev.src === s.url && !prev.paused) return stop(); prev.src = s.url; prev.play().catch(() => BP.note('Couldn’t play this preview.')); }
    if (u) { const s = list[+u.dataset.u]; close(); if (cb) cb({ url: s.url, title: s.title, credit: s.credit }); }
  };
  [['sn1', 'mine'], ['sn2', 'free'], ['sn3', 'up']].forEach(([id, t]) => { document.getElementById(id).onclick = () => { stop(); tab = t; genre = 'All'; draw(); }; });

  function drawUpload() {
    if (!me()) { box.innerHTML = "<p>Sign in to add your music.</p><button class='btn' id='sng'>Sign in</button>"; document.getElementById('sng').onclick = () => { close(); BP.openAuth(); }; return; }
    box.innerHTML = `<p style='font-size:14px'>Share your own track so people can use it in their videos and photos. Nigerian artists are welcome.</p>
<input type='file' id='sf' accept='audio/*'><input id='st' maxlength='80' placeholder='Song title'><input id='sa' maxlength='60' placeholder='Artist name'>
<select id='sg' style='width:100%;padding:10px;border-radius:10px;background:var(--card);color:var(--fg);border:1px solid var(--line);margin:6px 0'>${GENRES.slice(1).map(g => `<option>${g}</option>`).join('')}</select>
<label style='display:flex;gap:8px;font-size:13px;align-items:flex-start;margin:8px 0'><input type='checkbox' id='so2' style='width:auto;margin-top:2px'><span>I own this music, or I have permission to share it, and I allow people on Blueprint to use it in their posts. Maximum 15 MB.</span></label>
<div class='msg' id='sm'></div><button class='btn' id='sup'>Upload sound</button>`;
    document.getElementById('sup').onclick = uploadSound;
  }
  async function uploadSound() {
    const m = document.getElementById('sm'), f = document.getElementById('sf').files[0], title = document.getElementById('st').value.trim(), artist = document.getElementById('sa').value.trim();
    const bad = !f ? 'Choose an audio file.' : f.size > 15 * 1048576 ? 'The file is over 15 MB.' : !title || !artist ? 'Add the song title and artist name.' : !document.getElementById('so2').checked ? 'Please confirm you have the right to share this music.' : '';
    if (bad) { m.className = 'msg err'; m.textContent = bad; return; }
    m.className = 'msg'; m.textContent = 'Uploading…';
    const dur = await new Promise(ok => { const a = new Audio(URL.createObjectURL(f)); a.onloadedmetadata = () => ok(Math.round(a.duration) || 0); a.onerror = () => ok(0); });
    const path = me().id + '/' + Date.now() + '-' + f.name.replace(/[^\w.-]/g, '_');
    const up = await sb.storage.from('sounds').upload(path, f, { contentType: f.type || 'audio/mpeg' });
    if (up.error) { m.className = 'msg err'; m.textContent = up.error.message; return; }
    const r = await sb.from('bp_sounds').insert({ title, artist, genre: document.getElementById('sg').value, audio_path: path, duration_s: dur });
    if (r.error) { sb.storage.from('sounds').remove([path]); m.className = 'msg err'; m.textContent = r.error.message; return; }
    m.className = 'msg ok'; m.textContent = 'Added. People can now use your sound.'; setTimeout(() => { tab = 'mine'; draw(); }, 900);
  }
})();
