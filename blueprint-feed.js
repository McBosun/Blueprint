// Growth features: watch tracking for the For You ranking, trending hashtags, tappable #tags, shareable links.
(async () => {
  let tries = 0;
  while (!window.BP && tries++ < 50) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const sb = BP.sb, me = () => BP.me, feed = $('#feed');

  // ---------- Watch tracking (feeds the ranking) ----------
  let curId = null, since = 0; const sent = new Set();
  const covered = () => document.querySelector('#live.on,#vw.on,#op.on,#dm.on,#up.on,#cs.on');
  const onScreen = () => {
    if (!feed.classList.contains('on') || document.hidden || covered()) return null;
    const f = feed.getBoundingClientRect(), el = [...feed.querySelectorAll('.post')].find(x => Math.abs(x.getBoundingClientRect().top - f.top) < f.height / 2);
    return el ? el.dataset.id : null;
  };
  const flush = () => {
    if (!curId || !since || !me() || sent.has(curId)) return;
    const s = (Date.now() - since) / 1000, p = P.find(x => String(x.id) === curId);
    if (!p || typeof p.id !== 'string' || p.uid === me().id || s < 2) return;
    sent.add(curId);
    sb.from('bp_views').insert({ video_id: curId, watched_s: Math.min(7200, Math.round(s)), completed: p.d ? s >= p.d * 0.8 : false }).then(() => {});
  };
  setInterval(() => { const id = onScreen(); if (id !== curId) { flush(); curId = id; since = id ? Date.now() : 0; } }, 500);
  addEventListener('pagehide', flush);

  // ---------- Hashtags ----------
  document.head.insertAdjacentHTML('beforeend', '<style>.chip[data-tag],#trend .pill{cursor:pointer}</style>');
  const goTag = tag => { $('#q').value = '#' + tag; show('explore'); $('#q').oninput(); };
  feed.addEventListener('click', e => { const c = e.target.closest('.chip[data-tag]'); if (c) goTag(c.dataset.tag); });
  $('#grid').insertAdjacentHTML('beforebegin', "<div id='trend' style='padding:6px 10px 0'></div>");
  const SKIP = new Set(['new', 'live', 'replay', 'photos']);
  function drawTrend() {
    const box = $('#trend'); if (!box) return;
    if ($('#q').value.trim()) { box.innerHTML = ''; return; }
    const score = {};
    P.forEach(p => p.tag.forEach(t => { if (!SKIP.has(t)) score[t] = (score[t] || 0) + 1 + (p.l || 0) / 10; }));
    const top = Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
    box.innerHTML = top.length ? `<div style='font-size:12px;color:var(--mut);margin-bottom:6px'>Trending now</div>${top.map(t => `<span class='pill' data-tag='${t}'>#${t}</span>`).join('')}` : '';
  }
  $('#trend').onclick = e => { const c = e.target.closest('[data-tag]'); if (c) goTag(c.dataset.tag); };
  document.querySelector('nav [data-v="explore"]').addEventListener('click', drawTrend);
  $('#q').addEventListener('input', drawTrend);
  setInterval(() => { if ($('#explore').classList.contains('on')) drawTrend(); }, 3000);

  // ---------- Shareable links: #p-<post id> and #@username ----------
  async function route() {
    const h = decodeURIComponent(location.hash || '');
    const m = h.match(/^#p-([0-9a-f-]{36})$/i), u = h.match(/^#@([a-z0-9_.]{3,20})$/), dm = h.match(/^#m-([0-9a-f-]{36})$/i), lv = h.match(/^#l-([0-9a-f-]{36})$/i);
    if (dm && window.BPDM) return window.BPDM.open(dm[1]);
    if (lv && BP.openViewer) return BP.openViewer(lv[1], '', 'Live');
    if (m && BP.openPost) BP.openPost(m[1]);
    else if (u && BP.openProfile) {
      const r = await sb.from('bp_profiles').select('id').eq('username', u[1]).maybeSingle();
      if (r.data) BP.openProfile(r.data.id); else BP.note('That profile doesn’t exist.');
    }
  }
  setTimeout(route, 1200);
  addEventListener('hashchange', route);
})();
