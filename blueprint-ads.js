// Sponsored posts: labelled ads that appear in the feed every few posts. Admins create and manage them.
// Ads are not personalised: nothing about a person's activity is used to choose them.
(async () => {
  const cfg = window.BLUEPRINT_CONFIG || {}, live = !!(cfg.url && !String(cfg.url).includes('YOUR_'));
  let tries = 0; while (live && !window.BP && tries++ < 80) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) { window.BPAds = { mix: a => a, html: () => '' }; return; } // demo mode: no ads
  const sb = BP.sb, me = () => BP.me, feed = $('#feed');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pub = p => sb.storage.from('ads').getPublicUrl(p).data.publicUrl;
  const vk = (() => { try { let k = localStorage.getItem('bp-vk'); if (!k) { k = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, ''); localStorage.setItem('bp-vk', k); } return k; } catch (e) { return 'anon' + Math.random().toString(36).slice(2, 12); } })();
  let ads = [], by = {};

  // ---------- Showing ads in the feed ----------
  window.BPAds = {
    mix(list) {
      if (!ads.length) return list;
      const n = Math.max(3, Math.min(...ads.map(a => a.every_n || 6))), out = []; let k = 0, c = 0;
      list.forEach(p => { out.push(p); if (++c % n === 0 && c < list.length) out.push({ ad: true, ...ads[k++ % ads.length] }); });
      return out;
    },
    html(a) {
      const media = a.media_kind === 'video' ? `<div class="vslot" data-src="${esc(pub(a.media_path))}" data-vol="1"></div>` : `<img class="adimg" src="${esc(pub(a.media_path))}" alt="">`;
      return `<article class="post ad" data-ad="${esc(a.id)}" style="background:#0b1b3a">${media}<div class="info"><span class="chip">Sponsored</span><h3>${esc(a.headline)}</h3><p style="font-size:13px">${esc(a.advertiser)}</p>${a.body ? `<p style="font-size:13px;opacity:.9">${esc(a.body)}</p>` : ''}<button class="adcta" data-ad="${esc(a.id)}">${esc(a.cta)} ›</button></div><div class="bar"><i></i></div></article>`;
    }
  };
  async function loadAds(first) {
    const r = await sb.rpc('bp_active_ads'); if (r.error) return;
    ads = r.data || []; ads.forEach(a => { by[a.id] = a; });
    if (first && ads.length && feed.querySelectorAll('.post').length >= 3) renderFeed();
  }
  const sent = new Set();
  const track = (id, kind) => { const key = id + kind; if (sent.has(key)) return; sent.add(key); sb.from('bp_ad_events').upsert({ ad_id: id, kind, viewer_key: vk }, { onConflict: 'ad_id,kind,viewer_key,bucket', ignoreDuplicates: true }).then(() => {}); };
  let seen = null, since = 0;
  setInterval(() => {
    const el = feed.querySelector('.post.ad.cur'), id = el && el.dataset.ad;
    if (!id) { seen = null; return; }
    if (id !== seen) { seen = id; since = Date.now(); } else if (Date.now() - since >= 1000) track(id, 'view');
  }, 500);
  feed.addEventListener('click', e => {
    const b = e.target.closest('.adcta'); if (!b) return;
    const a = by[b.dataset.ad]; if (!a || !/^https:\/\//.test(a.link_url)) return;
    track(a.id, 'click'); window.open(a.link_url, '_blank', 'noopener,noreferrer');
  });
  await loadAds(true); setInterval(() => loadAds(false), 600000);

  // ---------- Admin: Ads manager ----------
  $('#outrow').insertAdjacentHTML('beforebegin', "<div class='row' id='adrow' hidden><span>Ads manager</span><button class='btn alt' id='admb' style='width:auto;margin:0'>Open</button></div>");
  document.body.insertAdjacentHTML('beforeend', "<div class='ovp' id='adm' style='z-index:60'></div>");
  document.querySelector('nav [data-v="me"]').addEventListener('click', async () => {
    if (!me()) { $('#adrow').hidden = true; return; }
    $('#adrow').hidden = !(await sb.from('bp_admins').select('user_id').eq('user_id', me().id).maybeSingle()).data;
  });
  const dtl = d => (d ? new Date(d).toISOString().slice(0, 16) : '');
  async function manager() {
    const o = $('#adm'); o.classList.add('on'); o.innerHTML = "<div class='pad'>Loading…</div>";
    const [l, s] = await Promise.all([sb.from('bp_ads').select('*').order('created_at', { ascending: false }).limit(50), sb.rpc('bp_ad_stats')]);
    const st = {}; (s.data || []).forEach(x => { st[x.ad_id] = x; });
    o.innerHTML = `<div style='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)'><h2 style='margin:0'>Ads manager</h2><button class='btn alt' id='amx' style='width:auto;margin:0 0 0 auto'>Close</button></div>
<div style='padding:10px 14px'><button class='btn' id='amn'>＋ New sponsored post</button>
${(l.data || []).map(a => { const x = st[a.id] || { views: 0, clicks: 0 }, ctr = x.views ? (x.clicks / x.views * 100).toFixed(1) : '0.0'; return `<div class='card'><b>${esc(a.headline)}</b> <small style='color:var(--mut)'>· ${esc(a.advertiser)}</small><br><span style='font-size:13px'>${esc(a.status)} · every ${a.every_n} posts${a.adult_only ? ' · adults only' : ''}</span><br><span style='font-size:13px'>${x.views} views · ${x.clicks} taps · ${ctr}% tap rate${a.max_impressions ? ' · cap ' + a.max_impressions : ''}</span>
<div style='display:flex;gap:6px;margin-top:8px;flex-wrap:wrap'>${a.status === 'active' ? `<button class='btn alt' data-st='paused' data-id='${a.id}' style='width:auto;margin:0'>Pause</button>` : `<button class='btn alt' data-st='active' data-id='${a.id}' style='width:auto;margin:0'>Activate</button>`}<button class='btn alt' data-st='ended' data-id='${a.id}' style='width:auto;margin:0'>End</button><button class='btn alt' data-del='${a.id}' data-p='${esc(a.media_path)}' style='width:auto;margin:0;color:#e5484d'>Delete</button></div></div>`; }).join('') || "<p style='color:var(--mut)'>No ads yet.</p>"}</div>`;
    o.onclick = async e => {
      if (e.target.id === 'amx') { o.classList.remove('on'); loadAds(false); return; }
      if (e.target.id === 'amn') return form();
      const t = e.target.dataset;
      if (t.st) { const r = await sb.from('bp_ads').update({ status: t.st }).eq('id', t.id); if (r.error) BP.note(r.error.message); return manager(); }
      if (t.del && confirm('Delete this ad and its numbers?')) { await sb.from('bp_ads').delete().eq('id', t.del); sb.storage.from('ads').remove([t.p]); return manager(); }
    };
  }
  function form() {
    const o = $('#adm');
    o.innerHTML = `<div style='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)'><h2 style='margin:0'>New sponsored post</h2><button class='btn alt' id='amb' style='width:auto;margin:0 0 0 auto'>Back</button></div>
<div style='padding:10px 14px'><input id='aa' maxlength='60' placeholder='Advertiser (company name)'><input id='ah' maxlength='80' placeholder='Headline'><textarea id='ab' rows='2' maxlength='200' placeholder='Short text (optional)'></textarea>
<input id='ac' maxlength='20' placeholder='Button text (e.g. Shop now)' value='Learn more'><input id='al' maxlength='500' placeholder='Link (must start with https://)'>
<label style='font-size:12px;color:var(--mut)'>Video or picture (up to 30 MB, portrait works best)</label><input type='file' id='af' accept='video/*,image/*'>
<label style='font-size:12px;color:var(--mut)'>Starts</label><input type='datetime-local' id='as' value='${dtl(new Date())}'><label style='font-size:12px;color:var(--mut)'>Ends (optional)</label><input type='datetime-local' id='ae'>
<label style='font-size:12px;color:var(--mut)'>Show one ad after every how many posts? (3 to 20)</label><input type='number' id='an' min='3' max='20' value='6'>
<input type='number' id='am' min='1' placeholder='Maximum views (optional)'>
<label style='display:flex;gap:8px;font-size:13px;margin:8px 0'><input type='checkbox' id='ad2' style='width:auto'> Adults only (18+). Use for anything not suitable for teenagers.</label>
<div class='msg' id='amm'></div><button class='btn' id='ams'>Publish ad</button></div>`;
    o.onclick = async e => {
      if (e.target.id === 'amb') return manager();
      if (e.target.id !== 'ams') return;
      const g = id => $(id).value.trim(), m = (t, ok) => { const x = $('#amm'); x.className = 'msg ' + (ok ? 'ok' : 'err'); x.textContent = t; }, f = $('#af').files[0];
      if (!g('#aa') || !g('#ah')) return m('Add the advertiser and a headline.');
      if (!/^https:\/\/\S+$/.test(g('#al'))) return m('The link must start with https://');
      if (!f) return m('Choose a video or picture.');
      if (f.size > 30 * 1048576) return m('The file is over 30 MB.');
      const n = +g('#an'); if (!(n >= 3 && n <= 20)) return m('Choose a number from 3 to 20.');
      m('Uploading…', true);
      const kind = f.type.startsWith('video') ? 'video' : 'image', path = me().id + '/' + Date.now() + '-' + f.name.replace(/[^\w.-]/g, '_');
      const up = await sb.storage.from('ads').upload(path, f, { contentType: f.type }); if (up.error) return m(up.error.message);
      const r = await sb.from('bp_ads').insert({ advertiser: g('#aa'), headline: g('#ah'), body: g('#ab') || null, cta: g('#ac') || 'Learn more', link_url: g('#al'), media_kind: kind, media_path: path, starts_at: new Date(g('#as') || Date.now()).toISOString(), ends_at: g('#ae') ? new Date(g('#ae')).toISOString() : null, every_n: n, max_impressions: g('#am') ? +g('#am') : null, adult_only: $('#ad2').checked, status: 'active' });
      if (r.error) { sb.storage.from('ads').remove([path]); return m(r.error.message); }
      BP.note('Ad is live.', true); manager();
    };
  }
  $('#admb').onclick = manager;
})();
