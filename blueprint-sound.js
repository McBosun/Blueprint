// Feed playback. ONE shared video player moves to the post on screen (plus one spare that loads the next video).
// The phone only decodes two videos, so scrolling stays smooth, and on iPhone the sound you unlock with your first
// tap keeps working for every video. Also: tap a video to pause, drag the thin bar to seek, music for photo posts.
(() => {
  const feed = document.getElementById('feed'); if (!feed) return;
  const au = window.BPAudio || (window.BPAudio = Object.assign(new Audio(), { loop: true }));
  let sound = false, needTap = false, off = null, justOn = false, t;

  document.body.insertAdjacentHTML('beforeend', "<div id='vpool' style='position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;overflow:hidden;pointer-events:none'></div>");
  const pool = document.getElementById('vpool');
  const mk = () => { const v = document.createElement('video'); v.loop = true; v.muted = true; v.preload = 'auto'; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); pool.appendChild(v); return v; };
  let active = mk(), spare = mk();
  const slotOf = p => (p ? p.querySelector('.vslot') : null);
  const setSrc = (v, s) => { v.dataset.s = s; v.dataset.u = ''; v.dataset.up = ''; v.src = s; v.load(); };

  const current = () => { const f = feed.getBoundingClientRect(); return [...feed.querySelectorAll('.post')].find(el => Math.abs(el.getBoundingClientRect().top - f.top) < f.height / 2); };
  const covered = () => document.querySelector('#live.on,#vw.on,#op.on,#dm.on,#up.on,#cs.on,#spg.on,#vedt.on,#au.on');
  const feedOn = () => feed.classList.contains('on') && !document.hidden && !covered();

  function sync() {
    const posts = [...feed.querySelectorAll('.post')], cur = feedOn() ? current() : null, ci = cur ? posts.indexOf(cur) : -1, slot = slotOf(cur);
    if (slot) {
      const src = slot.dataset.src;
      if (active.dataset.s !== src && spare.dataset.s === src) [active, spare] = [spare, active];
      if (active.dataset.s !== src) { setSrc(active, src); posts.forEach(p => p.classList.remove('paused')); }
      if (active.parentNode !== cur) cur.insertBefore(active, cur.firstChild);
      if (!sound || needTap) active.muted = true;
      else if (active.dataset.u !== '1') { active.muted = false; active.dataset.u = '1'; active.volume = Math.min(1, +(slot.dataset.vol || 1)); }
      if (active.paused && active.dataset.up !== '1') active.play().catch(() => { if (!active.muted) { active.muted = true; active.dataset.u = ''; needTap = true; active.play().catch(() => {}); } });
    } else {
      if (!active.paused) active.pause();
      if (active.parentNode !== pool) pool.appendChild(active);
    }
    // the spare player loads the next video in the background
    const nxt = ci >= 0 ? posts.slice(ci + 1).find(slotOf) : null;
    if (nxt) { const ns = slotOf(nxt).dataset.src; if (spare.dataset.s !== ns) setSrc(spare, ns); }
    if (spare.parentNode !== pool) pool.appendChild(spare);
    if (!spare.paused) spare.pause();

    // music: photo posts and sounds attached to a video
    const mu = cur && cur.querySelector('.mu');
    if (mu) {
      if (off && off !== mu.dataset.src) off = null;
      if (sound && !needTap && off !== mu.dataset.src && !(slot && active.dataset.up === '1')) {
        if (au.src !== mu.dataset.src) { au.src = mu.dataset.src; const st = +(mu.dataset.start || 0); if (st) au.addEventListener('loadedmetadata', () => { au.currentTime = st; }, { once: true }); }
        au.volume = Math.min(1, +(mu.dataset.vol || 1));
        if (au.paused) au.play().catch(() => { needTap = true; });
      }
      mu.classList.toggle('on', !au.paused && au.src === mu.dataset.src);
    } else if (!au.paused) au.pause();
  }

  // The first tap anywhere unlocks sound. The spare player is unlocked in the same tap (needed on iPhone).
  const gesture = () => {
    if (sound && !needTap) return;
    sound = true; needTap = false; justOn = true; setTimeout(() => { justOn = false; }, 0); sync();
    if (spare.src) { spare.muted = false; spare.volume = 0; spare.play().then(() => { spare.pause(); spare.currentTime = 0; spare.volume = 1; }).catch(() => { spare.volume = 1; }); }
  };
  ['click', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, gesture, true));

  // The ♪ button pauses or resumes the music
  feed.addEventListener('click', e => {
    const b = e.target.closest('.mu'); if (!b || justOn) return;
    if (!au.paused && au.src === b.dataset.src) { au.pause(); off = b.dataset.src; b.classList.remove('on'); }
    else { off = null; sync(); }
  });

  const later = ms => { clearTimeout(t); t = setTimeout(sync, ms); };
  feed.addEventListener('scroll', () => later(60));
  new MutationObserver(() => later(50)).observe(feed, { childList: true });
  document.addEventListener('visibilitychange', sync);
  setInterval(sync, 1000);

  // Tap a video to pause or play. Drag the thin bar at the bottom to seek.
  feed.addEventListener('click', e => {
    const v = e.target; if (v.tagName !== 'VIDEO' || justOn) return;
    const post = v.closest('.post');
    if (v.paused) { v.dataset.up = ''; post.classList.remove('paused'); v.play().catch(() => {}); sync(); }
    else { v.pause(); v.dataset.up = '1'; post.classList.add('paused'); au.pause(); }
  });
  let seeking = null;
  const seek = e => { const r = seeking.b.getBoundingClientRect(); seeking.v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * seeking.v.duration; };
  feed.addEventListener('pointerdown', e => {
    const b = e.target.closest('.bar'); if (!b) return;
    const v = b.closest('.post').querySelector('video'); if (!v || !v.duration) return;
    seeking = { b, v }; seek(e);
  });
  feed.addEventListener('pointermove', e => { if (seeking) seek(e); });
  ['pointerup', 'pointercancel'].forEach(ev => addEventListener(ev, () => { seeking = null; }));
  later(300);
})();
