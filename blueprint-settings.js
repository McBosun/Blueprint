// Settings: one button at the top of the Me tab that opens three collapsible groups. Also the Download button.
(() => {
  const me = document.getElementById('me'), pf = document.getElementById('pf');
  if (!me || !pf) return;

  document.head.insertAdjacentHTML('beforeend', `<style>
[hidden]{display:none!important}
#setwrap{position:sticky;top:0;z-index:4;background:var(--bg);padding:8px 14px;border-bottom:1px solid var(--line)}
#setbtn{margin:0;display:flex;justify-content:space-between;align-items:center}
#setpanel{max-height:68vh;overflow-y:auto;padding-top:6px}
.sgrp{border:1px solid var(--line);border-radius:12px;margin:8px 0;padding:0 12px;background:var(--card)}
.sgrp summary{padding:12px 0;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between}
.sgrp summary::after{content:'▾';color:var(--mut)}.sgrp[open] summary::after{content:'▴'}
.sgrp .row:last-child{border-bottom:0}
</style>`);

  pf.insertAdjacentHTML('beforebegin', `<div id='setwrap'><button class='btn alt' id='setbtn'><span>⚙ Settings</span><span id='setar'>▾</span></button>
<div id='setpanel' hidden>
<details class='sgrp'><summary>Privacy and messages</summary><div id='sg1'></div></details>
<details class='sgrp'><summary>Notifications</summary><div id='sg4'></div></details>
<details class='sgrp'><summary>Playback and wellbeing</summary><div id='sg2'></div></details>
<details class='sgrp'><summary>Account and help</summary><div id='sg3'></div></details>
<div id='ver' style='font-size:11px;color:var(--mut);padding:6px 2px'></div></div></div>`);
  const VERSION = '20261030d', page = (document.querySelector('meta[name="bp-version"]') || {}).content || 'old';
  document.getElementById('ver').innerHTML = 'Version ' + VERSION + (page === VERSION ? '' : " <b style='color:#e5484d'>Your phone is showing an old copy of the page. Close the tab, clear website data, and reopen.</b>");
  document.getElementById('setbtn').onclick = () => {
    const p = document.getElementById('setpanel'); p.hidden = !p.hidden;
    document.getElementById('setar').textContent = p.hidden ? '▾' : '▴';
  };

  // Move each existing setting row into its group. Other scripts add rows later, so repeat for a while.
  const row = sel => { const el = me.querySelector(sel); return el && (el.closest('.row') || el); };
  const plan = [
    ['sg1', ['#svc', '#dpp', '#fam']],
    ['sg2', ['#brk', '#tm']],
    ['sg3', ['a[href="terms.html"]', '#instb', '#hcb', '#tcb', '#modb', '#delb', '#so']]
  ];
  function organize() {
    plan.forEach(([g, sels]) => {
      const box = document.getElementById(g);
      sels.forEach(s => { const r = row(s); if (r && r.parentNode !== box) box.appendChild(r); });
    });
    const old = me.querySelector(':scope > .pad');
    if (old && !old.querySelector('.row')) old.remove();
  }
  organize();
  let n = 0; const t = setInterval(() => { organize(); if (++n > 20) clearInterval(t); }, 1000);

  // ---------- Download (your posts, and others' when the creator allows it) ----------
  document.getElementById('feed').addEventListener('click', e => {
    const b = e.target.closest('[data-a="dl"]'); if (!b) return;
    e.stopImmediatePropagation();
    const BP = window.BP, p = P.find(x => String(x.id) === b.closest('.post').dataset.id);
    if (!BP || !p) return;
    if (p.dl === false && !(BP.me && BP.me.id === p.uid)) return BP.note('The creator turned off downloads for this post.');
    const base = (p.t || 'blueprint').replace(/[^\w-]+/g, '_').slice(0, 40);
    const files = (p.files || []).filter(([bk, path]) => bk === 'videos' || /\.(jpe?g|png|webp)$/i.test(path));
    if (!files.length) return BP.note('Nothing to download here.');
    files.forEach(([bk, path], i) => setTimeout(() => {
      const url = BP.sb.storage.from(bk).getPublicUrl(path, { download: base + (files.length > 1 ? '-' + (i + 1) : '') + '.' + path.split('.').pop() }).data.publicUrl;
      const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    }, i * 900));
    BP.note(files.length > 1 ? 'Downloading ' + files.length + ' photos…' : 'Download started. Check your Files or Downloads.', true);
  }, true);
})();
