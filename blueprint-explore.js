// Explore: every tile shows the picture (first frame) and plays a short muted preview while you look at it.
(() => {
  window.tileMedia = p => p.imgs ? `<img src="${p.imgs[0]}" alt="" loading="lazy">` : p.src ? `<video src="${p.src}#t=0.1" muted loop playsinline preload="metadata" data-pv="1"></video>` : '';
  document.head.insertAdjacentHTML('beforeend', '<style>.tile .th{position:relative;overflow:hidden}.tile .th video,.tile .th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.tile .th::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 55%,rgba(0,0,0,.55));pointer-events:none}.tile .tt{position:relative;z-index:1;text-shadow:0 1px 6px rgba(0,0,0,.7)}</style>');
  const grid = document.getElementById('grid'); if (!grid) return;
  const saver = () => navigator.connection && navigator.connection.saveData; // data saver: first frame only
  const playing = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting && e.intersectionRatio > .6 && !saver() && (playing.has(v) || playing.size < 4)) { playing.add(v); v.play().catch(() => {}); }
    else { playing.delete(v); v.pause(); }
  }), { threshold: [0, .6, 1] });
  grid.addEventListener('timeupdate', e => { const v = e.target; if (v.dataset && v.dataset.pv && v.currentTime > 3) v.currentTime = 0.1; }, true); // preview = first 3 seconds
  const watch = () => grid.querySelectorAll('video[data-pv]').forEach(v => { if (!v._w) { v._w = 1; io.observe(v); } });
  new MutationObserver(watch).observe(grid, { childList: true }); watch();
})();
