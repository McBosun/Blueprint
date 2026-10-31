// Blueprints tab: step-by-step guides. Discover, continue where you stopped, saved guides, your own,
// and a checklist for each guide whose progress is remembered.
(async () => {
  const view = document.getElementById('saved'); if (!view) return;
  const cfg = window.BLUEPRINT_CONFIG || {}, liveMode = !!(cfg.url && !String(cfg.url).includes('YOUR_'));
  let tries = 0; while (liveMode && !window.BP && tries++ < 50) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP, sb = BP && BP.sb, me = () => BP && BP.me;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let seg = 'discover', cat = 'All', q = '', posts = [], prog = {}, loaded = false, cur = null;
  const KEY = 'bp-guide-progress';
  const lget = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const lset = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  const done = id => prog[id] || [];
  const pct = p => (p.steps && p.steps.length ? Math.round(done(p.id).length / p.steps.length * 100) : 0);
  const all = () => { const ids = new Set(posts.map(p => String(p.id))); return [...posts, ...P.filter(p => !ids.has(String(p.id)))]; };

  async function load() {
    if (BP) {
      const r = await sb.from('bp_videos').select('*').not('steps', 'is', null).order('created_at', { ascending: false }).limit(80);
      posts = await BP.build(r.data || []);
      prog = {}; if (me()) { const g = await sb.from('bp_progress').select('video_id,done').eq('user_id', me().id); (g.data || []).forEach(x => { prog[x.video_id] = x.done || []; }); }
    } else { posts = P.filter(p => p.steps); prog = lget(); }
    loaded = true;
  }
  const score = p => (p.l || 0) + (p.c ? p.c.length : 0) * 2 + (saved.has(p.id) ? 3 : 0);
  function pick() {
    let l = all().filter(p => p.steps && p.steps.length);
    if (seg === 'saved') l = all().filter(p => saved.has(p.id));
    if (seg === 'progress') l = l.filter(p => pct(p) > 0 && pct(p) < 100);
    if (seg === 'mine') l = l.filter(p => me() && p.uid === me().id);
    if (seg === 'discover') l = l.sort((a, b) => score(b) - score(a));
    if (cat !== 'All') l = l.filter(p => p.tag.includes(cat.toLowerCase()));
    if (q) l = l.filter(p => (p.t + ' ' + p.tag.join(' ') + ' ' + p.u + ' ' + (p.steps || []).join(' ')).toLowerCase().includes(q.toLowerCase()));
    return l;
  }
  const card = p => `<div class='gcard' data-id='${esc(p.id)}'><div class='gth' style='background:${G[p.g % 5]}'>${typeof tileMedia === 'function' ? tileMedia(p) : ''}</div><div class='gin'><b>${esc(p.t)}</b><small>${esc(p.u)} · ${p.steps ? p.steps.length + ' steps' : 'Video'}</small>${p.steps && pct(p) ? `<div class='gbar'><i style='width:${pct(p)}%'></i></div><small>${pct(p) === 100 ? 'Completed ✓' : pct(p) + '% done'}</small>` : ''}</div></div>`;
  const EMPTY = { discover: 'No Blueprints yet. Be the first: tap “Make one” and write your steps as 1. 2. 3.', progress: 'Nothing in progress. Open a Blueprint and tick off a step to see it here.', saved: 'Tap Blueprint on any post to save it here.', mine: 'You haven’t made a Blueprint yet. Tap “Make one”.' };
  const listHtml = () => { const l = pick(); return l.length ? l.map(card).join('') : `<div class='gempty'>${EMPTY[seg]}</div>`; };
  function render() {
    if (!loaded) { view.innerHTML = "<div class='pad'><h2>Blueprints</h2><div class='gcard skel' style='height:116px'></div><div class='gcard skel' style='height:116px'></div></div>"; return; }
    const count = {}; all().filter(p => p.steps).forEach(p => p.tag.forEach(t => { if (!['new', 'live', 'replay', 'photos'].includes(t)) count[t] = (count[t] || 0) + 1; }));
    const cats = ['All', ...Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0][0].toUpperCase() + x[0].slice(1))];
    view.innerHTML = `<div class='pad'><div style='display:flex;align-items:center'><h2 style='margin:0'>Blueprints</h2><button class='btn' id='gnew' style='width:auto;margin:0 0 0 auto;padding:8px 14px;min-height:40px'>＋ Make one</button></div>
<p style='color:var(--mut);font-size:13px;margin:6px 0 10px'>Step-by-step guides from creators. Tick steps off as you go.</p>
<input id='gq' placeholder='Search guides' value='${esc(q)}'>
<div class='gseg'>${[['discover', 'Discover'], ['progress', 'Continue'], ['saved', 'Saved'], ['mine', 'Mine']].map(([k, l]) => `<button data-s='${k}' class='${seg === k ? 'on' : ''}'>${l}</button>`).join('')}</div>
<div class='gchips'>${cats.map(c => `<span data-c='${esc(c)}' class='${cat === c ? 'on' : ''}'>${esc(c)}</span>`).join('')}</div><div id='glist'>${listHtml()}</div></div>`;
  }
  window.renderSaved = () => { render(); load().then(render).catch(() => { loaded = true; render(); }); };

  // ---------- Guide page with checklist ----------
  document.body.insertAdjacentHTML('beforeend', "<div class='ovp' id='gdt' style='z-index:62'></div>");
  const dt = document.getElementById('gdt');
  const bar = p => { const n = done(p.id).length, t = p.steps.length; return `<div class='gbar' style='height:10px'><i style='width:${Math.round(n / t * 100)}%'></i></div><div style='font-size:13px;color:var(--mut);margin:6px 0 12px'>${n} of ${t} steps${n === t ? ' · Complete 🎉' : ''}</div>`; };
  function open(id) {
    cur = all().find(p => String(p.id) === String(id)); if (!cur) return;
    const p = cur, d = done(p.id);
    dt.classList.add('on'); dt.innerHTML = `<div style='padding:8px 12px'><button class='btn alt' id='gx' style='width:auto;margin:0'>‹ Back</button></div><div style='padding:0 16px 24px'>
<div class='gth' style='width:100%;height:170px;border-radius:16px;background:${G[p.g % 5]}'>${typeof tileMedia === 'function' ? tileMedia(p) : ''}</div>
<h2 style='margin:12px 0 2px'>${esc(p.t)}</h2><div style='color:var(--mut);font-size:13px;margin-bottom:12px'>${esc(p.u)}</div><div id='gbar'>${bar(p)}</div>
<div id='gsteps'>${p.steps.map((s, i) => `<label class='gstep ${d.includes(i) ? 'on' : ''}'><input type='checkbox' data-i='${i}' ${d.includes(i) ? 'checked' : ''}><span><b>${i + 1}.</b> ${esc(s)}</span></label>`).join('')}</div>
<div style='display:flex;gap:8px;margin-top:12px'><button class='btn' id='gw' style='margin:0'>▶ Watch</button><button class='btn alt' id='gs' style='margin:0'>${saved.has(p.id) ? 'Saved ✓' : 'Save'}</button></div>
<div style='display:flex;gap:8px;margin-top:8px'><button class='btn alt' id='gr' style='margin:0'>Reset progress</button><button class='btn alt' id='gsh' style='margin:0'>Share</button></div></div>`;
  }
  async function saveProg(p) {
    if (BP) { if (!me()) return; const r = await sb.from('bp_progress').upsert({ user_id: me().id, video_id: p.id, done: done(p.id), updated_at: new Date().toISOString() }); if (r.error) BP.note('Couldn’t save progress: ' + r.error.message); }
    else lset(prog);
  }
  dt.onchange = async e => {
    const i = e.target.dataset && e.target.dataset.i; if (i === undefined || !cur) return;
    if (BP && !me()) { e.target.checked = !e.target.checked; return BP.openAuth('in'); }
    const s = new Set(done(cur.id)); e.target.checked ? s.add(+i) : s.delete(+i); prog[cur.id] = [...s].sort((a, b) => a - b);
    e.target.closest('.gstep').classList.toggle('on', e.target.checked); document.getElementById('gbar').innerHTML = bar(cur);
    if (s.size === cur.steps.length && BP) BP.note('Blueprint complete! 🎉', true);
    saveProg(cur);
  };
  dt.onclick = async e => {
    const id = e.target.id; if (!cur) return;
    if (id === 'gx') { dt.classList.remove('on'); window.renderSaved(); }
    if (id === 'gw') { dt.classList.remove('on'); if (BP && BP.openPost) BP.openPost(cur.id); else { show('feed'); const el = $(`.post[data-id="${cur.id}"]`); if (el) el.scrollIntoView(); } }
    if (id === 'gr') { prog[cur.id] = []; saveProg(cur); open(cur.id); }
    if (id === 'gsh') { const url = location.href.split('#')[0] + '#p-' + cur.id; try { await navigator.share({ title: cur.t, url }); } catch (x) { try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; } catch (y) {} } }
    if (id === 'gs') {
      if (BP && !me()) return BP.openAuth('in');
      const had = saved.has(cur.id); had ? saved.delete(cur.id) : saved.add(cur.id); e.target.textContent = had ? 'Save' : 'Saved ✓';
      if (BP && typeof cur.id === 'string') { had ? await sb.from('bp_saves').delete().match({ video_id: cur.id, user_id: me().id }) : await sb.from('bp_saves').insert({ video_id: cur.id }); }
    }
  };

  // ---------- Tab interactions ----------
  view.addEventListener('click', e => {
    const s = e.target.closest('[data-s]'), c = e.target.closest('[data-c]'), g = e.target.closest('.gcard'), n = e.target.closest('#gnew');
    if (s) { seg = s.dataset.s; render(); }
    if (c) { cat = c.dataset.c; render(); }
    if (g && g.dataset.id) open(g.dataset.id);
    if (n) {
      if (BP && !me()) return BP.openAuth('in');
      document.getElementById('up').classList.add('on'); const ud = document.getElementById('ud');
      if (ud && !ud.value.trim()) ud.value = '#howto\n1. \n2. \n3. ';
      const um = document.getElementById('umsg'); if (um) { um.className = 'msg'; um.textContent = 'Write your steps as 1. 2. 3. in the caption, then choose your video.'; }
    }
  });
  view.addEventListener('input', e => { if (e.target.id === 'gq') { q = e.target.value; const l = document.getElementById('glist'); if (l) l.innerHTML = listHtml(); } });
  render(); load().then(render).catch(() => { loaded = true; render(); });
})();
