// Autoplay for the feed: the video (or the music of a photo post) on screen plays by itself.
// Browsers only allow sound after the first tap on the page, so until then videos play muted
// and a "Tap to turn sound on" pill shows. After one tap, sound plays automatically as you scroll.
(() => {
  const feed = document.getElementById('feed'); if (!feed) return;
  const au = window.BPAudio || (window.BPAudio = Object.assign(new Audio(), { loop: true }));
  let sound = false, needTap = false, off = null, justOn = false, t;

  document.head.insertAdjacentHTML('beforeend', '<style>#snd{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:12;background:rgba(0,0,0,.75);color:#fff;border-radius:99px;padding:9px 16px;font-size:13px;display:none;cursor:pointer}</style>');
  document.body.insertAdjacentHTML('beforeend', "<div id='snd'>🔊 Tap to turn sound on</div>");
  const snd = document.getElementById('snd');

  const current = () => { const f = feed.getBoundingClientRect(); return [...feed.querySelectorAll('.post')].find(el => Math.abs(el.getBoundingClientRect().top - f.top) < f.height / 2); };
  const covered = () => document.querySelector('#live.on,#vw.on,#op.on,#dm.on,#up.on,#cs.on');
  const feedOn = () => feed.classList.contains('on') && !document.hidden && !covered();

  function sync() {
    const cur = feedOn() ? current() : null;
    let wantsSound = false;

    feed.querySelectorAll('video').forEach(v => {
      if (cur && cur.contains(v)) {
        wantsSound = true;
        if (!sound || needTap) v.muted = true;
        else if (v.dataset.u !== '1') { v.muted = false; v.dataset.u = '1'; }
        if (v.paused && v.dataset.up !== '1') v.play().catch(() => { if (!v.muted) { v.muted = true; v.dataset.u = ''; needTap = true; v.play().catch(() => {}); } });
      } else { v.dataset.up = ''; v.closest('.post')?.classList.remove('paused'); if (!v.paused) v.pause(); }
    });

    const mu = cur && cur.querySelector('.mu');
    if (mu) {
      wantsSound = true;
      if (off && off !== mu.dataset.src) off = null;
      if (sound && !needTap && off !== mu.dataset.src) {
        if (au.src !== mu.dataset.src) au.src = mu.dataset.src;
        if (au.paused) au.play().catch(() => { needTap = true; });
      }
      mu.classList.toggle('on', !au.paused && au.src === mu.dataset.src);
    } else if (!au.paused) au.pause();

    snd.style.display = wantsSound && (!sound || needTap) ? 'block' : 'none';
  }

  // The first tap anywhere unlocks sound (and retries if the browser blocked it)
  const gesture = () => {
    if (sound && !needTap) return;
    sound = true; needTap = false; justOn = true; setTimeout(() => { justOn = false; }, 0); sync();
  };
  ['click', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, gesture, true));

  // The ♪ button pauses or resumes the music
  feed.addEventListener('click', e => {
    const b = e.target.closest('.mu'); if (!b || justOn) return;
    if (!au.paused && au.src === b.dataset.src) { au.pause(); off = b.dataset.src; b.classList.remove('on'); }
    else { off = null; sync(); }
  });

  const later = ms => { clearTimeout(t); t = setTimeout(sync, ms); };
  feed.addEventListener('scroll', () => later(150));
  new MutationObserver(() => later(80)).observe(feed, { childList: true });
  document.addEventListener('visibilitychange', sync);
  setInterval(sync, 1000);
  // Tap a video to pause or play (no on-screen controls). Drag the thin bar at the bottom to seek.
  feed.addEventListener('click', e => {
    const v = e.target; if (v.tagName !== 'VIDEO' || justOn) return;
    const post = v.closest('.post');
    if (v.paused) { v.dataset.up = ''; post.classList.remove('paused'); v.play().catch(() => {}); }
    else { v.pause(); v.dataset.up = '1'; post.classList.add('paused'); }
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
