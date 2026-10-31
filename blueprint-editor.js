// Blueprint editor: trim and speed, music, looks, green screen (chroma key) and text for videos and photos.
// Everything runs on the phone with WebGL; videos are re-recorded in real time when you tap Done.
(async () => {
  let tries = 0;
  while ((!window.BP || !document.getElementById('pp')) && tries++ < 80) await new Promise(r => setTimeout(r, 100));
  const BP = window.BP; if (!BP) return; // demo mode
  const MAXMB = (window.BLUEPRINT_CONFIG || {}).maxMB || 50;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tm = s => { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + Math.floor(s % 1 * 10); };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const toHex = c => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

  // ---------- Shader ----------
  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;varying vec2 v;
uniform sampler2D uV,uB,uT;uniform vec2 uVs,uVo,uBs,uBo;uniform vec3 uKc,uBc;
uniform float uHasB,uBr,uCo,uSa,uWa,uVg,uKey,uSim,uSm,uSp;
vec2 cc(vec3 c){return vec2(-.169*c.r-.331*c.g+.5*c.b,.5*c.r-.419*c.g-.081*c.b);}
void main(){
 vec2 uv=(v-.5)*uVs+.5+uVo;
 vec3 fg=(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)?vec3(0.):texture2D(uV,uv).rgb;
 vec3 col=fg;
 if(uKey>.5){
  float a=smoothstep(uSim,uSim+uSm+.001,distance(cc(fg),cc(uKc)));
  vec3 w=step(vec3(max(uKc.r,max(uKc.g,uKc.b))-.001),uKc);
  float kc=dot(fg,w),ot=(dot(fg,vec3(1.))-kc)*.5;
  fg=mix(fg,fg-w*max(kc-ot,0.),uSp);
  vec3 bg=uHasB>.5?texture2D(uB,(v-.5)*uBs+.5+uBo).rgb:uBc;
  col=mix(bg,fg,a);
 }
 col+=uBr;col=(col-.5)*uCo+.5;
 float l=dot(col,vec3(.299,.587,.114));col=mix(vec3(l),col,uSa);
 col.r+=uWa*.08;col.b-=uWa*.08;
 col*=1.-uVg*smoothstep(.35,.9,distance(v,vec2(.5)));
 vec4 t=texture2D(uT,v);col=mix(col,t.rgb,t.a);
 gl_FragColor=vec4(clamp(col,0.,1.),1.);}`;

  const cv = document.createElement('canvas'); cv.width = 540; cv.height = 960;
  const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return;
  const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); const glOK = gl.getProgramParameter(pr, gl.LINK_STATUS); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const al = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(pr, n), UL = {};
  'uVs uVo uBs uBo uKc uBc uHasB uBr uCo uSa uWa uVg uKey uSim uSm uSp'.split(' ').forEach(n => { UL[n] = U(n); });
  const newTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]].forEach(([a, b]) => gl.texParameteri(gl.TEXTURE_2D, a, b)); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0])); return t; };
  const tV = newTex(), tB = newTex(), tT = newTex();
  gl.uniform1i(U('uV'), 0); gl.uniform1i(U('uB'), 1); gl.uniform1i(U('uT'), 2);
  const put = (unit, t, src) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); };

  // ---------- State ----------
  const LOOKS = { Normal: {}, Warm: { warm: .6, sat: 1.1 }, Cool: { warm: -.6, sat: 1.05 }, 'B&W': { sat: 0, contrast: 1.15 }, Vivid: { sat: 1.5, contrast: 1.1 }, Fade: { contrast: .85, bright: .06, sat: .8 }, Vintage: { warm: .4, sat: .7, contrast: 1.1, vig: .5 }, Drama: { contrast: 1.4, sat: 1.1, vig: .4, bright: -.04 } };
  const LOOK0 = { bright: 0, contrast: 1, sat: 1, warm: 0, vig: 0 };
  const fresh = () => ({ mode: 'video', start: 0, end: 0, dur: 0, speed: 1, fit: 'fill', origVol: 1, music: null, musicVol: .8, musicStart: 0, ...LOOK0, key: false, kc: [0, 1, 0], sim: .35, sm: .12, sp: .5, bgImg: false, bgc: [.04, .1, .25], bgScale: 1, bgx: 0, bgy: 0, text: '', tcol: '#ffffff', tsize: 64, ty: .78 });
  let S = fresh(), vid = document.createElement('video'), ml = new Audio(), mb = new Audio(), imgs = [], cur = 0, opened = false, exporting = false, cancel = false, picking = false, raf = 0, ctx, dst, mon, vG, mG, srcFile = null;
  vid.setAttribute('playsinline', ''); vid.preload = 'auto'; vid.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none'; document.body.appendChild(vid); ml.loop = true; mb.loop = true;
  const txc = document.createElement('canvas'), fc = document.createElement('canvas'), fx = fc.getContext('2d');
  window.BPEdit = { video: null, photos: null, sound: null, clear() { this.video = null; this.photos = null; this.sound = null; stat(); } };
  function preloadSound() { const q = window.BPEdit.sound; if (q) { S.music = { kind: 'lib', url: q.url, title: q.title, credit: q.credit }; mb.src = q.url; S.origVol = .4; } }

  // ---------- Drawing ----------
  function drawText() {
    txc.width = cv.width; txc.height = cv.height; const c = txc.getContext('2d'); c.clearRect(0, 0, txc.width, txc.height);
    if (S.text.trim()) {
      const k = cv.height / 960, px = S.tsize * k; c.font = `800 ${px}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = px * .16; c.strokeStyle = 'rgba(0,0,0,.85)'; c.fillStyle = S.tcol;
      const lines = S.text.split('\n').slice(0, 4); lines.forEach((t, i) => { const y = cv.height * S.ty + (i - (lines.length - 1) / 2) * px * 1.15; c.strokeText(t, cv.width / 2, y, cv.width * .92); c.fillText(t, cv.width / 2, y, cv.width * .92); });
    }
    put(2, tT, txc);
  }
  const srcEl = () => (S.mode === 'video' ? vid : imgs[cur]);
  const srcSize = () => { const e = srcEl(); return e ? (S.mode === 'video' ? [e.videoWidth, e.videoHeight] : [e.naturalWidth, e.naturalHeight]) : [0, 0]; };
  function fitScale() { const [w, h] = srcSize(); if (!w) return [1, 1]; const va = w / h, ca = cv.width / cv.height; return S.fit === 'fill' ? (va > ca ? [ca / va, 1] : [1, va / ca]) : (va > ca ? [1, va / ca] : [ca / va, 1]); }
  function render() {
    const e = srcEl();
    if (e && (S.mode === 'photo' || vid.readyState >= 2)) {
      if (S.mode === 'video') { // copy the frame through a normal canvas first: more reliable on iPhone
        const w = vid.videoWidth, h = vid.videoHeight;
        if (w) { const k = Math.min(1, 1280 / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k); if (fc.width !== cw || fc.height !== ch) { fc.width = cw; fc.height = ch; } fx.drawImage(vid, 0, 0, cw, ch); put(0, tV, fc); }
      } else put(0, tV, e);
    }
    const [sx, sy] = fitScale(); gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(UL.uVs, sx, sy); gl.uniform2f(UL.uVo, 0, 0); gl.uniform2f(UL.uBs, 1 / S.bgScale, 1 / S.bgScale); gl.uniform2f(UL.uBo, S.bgx, S.bgy);
    gl.uniform3fv(UL.uKc, S.kc); gl.uniform3fv(UL.uBc, S.bgc); gl.uniform1f(UL.uHasB, S.bgImg ? 1 : 0);
    gl.uniform1f(UL.uBr, S.bright); gl.uniform1f(UL.uCo, S.contrast); gl.uniform1f(UL.uSa, S.sat); gl.uniform1f(UL.uWa, S.warm); gl.uniform1f(UL.uVg, S.vig);
    gl.uniform1f(UL.uKey, S.key ? 1 : 0); gl.uniform1f(UL.uSim, S.sim); gl.uniform1f(UL.uSm, S.sm); gl.uniform1f(UL.uSp, S.sp);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function loop() {
    if (!opened) return;
    render();
    if (exporting && xx) xx.drawImage(cv, 0, 0, xc.width, xc.height);
    if (S.mode === 'video') {
      if (exporting) { if (vid.currentTime >= S.end - .04 || vid.ended) finishExport(); else prog((vid.currentTime - S.start) / (S.end - S.start)); }
      else { if (vid.currentTime >= S.end || vid.ended) { vid.currentTime = S.start; musicRestart(); if (!vid.paused) vid.play().catch(() => {}); } $('#vtm').textContent = tm(vid.currentTime - S.start) + ' / ' + tm(S.end - S.start); }
    }
    raf = requestAnimationFrame(loop);
  }

  // ---------- Audio ----------
  function initAudio() {
    if (ctx) return; ctx = new (window.AudioContext || window.webkitAudioContext)(); dst = ctx.createMediaStreamDestination(); mon = ctx.createGain(); mon.connect(ctx.destination);
    vG = ctx.createGain(); ctx.createMediaElementSource(vid).connect(vG); vG.connect(mon); vG.connect(dst);
    mG = ctx.createGain(); ctx.createMediaElementSource(ml).connect(mG); mG.connect(mon); mG.connect(dst);
  }
  const musicEl = () => (S.music ? (S.music.kind === 'local' ? ml : mb) : null);
  function applyVol() { if (!ctx) return; vG.gain.value = S.origVol; mG.gain.value = S.musicVol; mb.volume = S.musicVol; vid.playbackRate = S.speed; }
  function musicRestart() { const m = musicEl(); if (!m) return; try { m.currentTime = S.musicStart; } catch (e) {} if (!vid.paused || S.mode === 'photo') m.play().catch(() => {}); }
  function musicStop() { ml.pause(); mb.pause(); }
  function playPause() {
    if (picking) return;
    if (S.mode === 'video') { if (vid.paused) { applyVol(); vid.play().catch(() => {}); musicRestart(); } else { vid.pause(); musicStop(); } }
    else { const m = musicEl(); if (m) { m.paused ? (applyVol(), m.currentTime = S.musicStart, m.play().catch(() => {})) : m.pause(); } }
    $('#vpl').style.display = S.mode === 'video' && vid.paused ? 'flex' : 'none';
  }

  // ---------- Overlay UI ----------
  document.head.insertAdjacentHTML('beforeend', `<style>
#vedt{position:fixed;inset:0;z-index:50;margin:0 auto;max-width:520px;background:#000;color:#fff;display:none;flex-direction:column}#vedt.on{display:flex}
#vedt .bar2{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 12px 8px}#vedt .bar2 b{flex:1;text-align:center}
#vedt button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:99px;padding:9px 14px;font-size:13px;cursor:pointer}#vedt button.on,#vedt button.go{background:#1e6bff}
#vstage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center}#vstage canvas{max-height:100%;max-width:100%;aspect-ratio:9/16;background:#111;border-radius:8px}
#vpl{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:56px;pointer-events:none;text-shadow:0 2px 10px #000}
#vtm{position:absolute;left:12px;bottom:8px;font-size:12px;background:rgba(0,0,0,.5);padding:2px 8px;border-radius:99px}
#vtabs{display:flex;gap:6px;padding:8px 12px;overflow-x:auto}
#vpan{max-height:36vh;overflow-y:auto;padding:4px 14px calc(12px + env(safe-area-inset-bottom,0px));font-size:13px}
#vpan label{display:block;margin:8px 0 2px;color:#aab}#vpan input[type=range]{width:100%;padding:0;margin:0;background:transparent;border:0}
#vpan input,#vpan select{background:#1b2540;color:#fff;border:0;border-radius:10px;padding:9px;width:100%;margin:2px 0}#vpan .chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
#vpan input[type=color]{height:40px;padding:2px}#vprog{position:absolute;inset:0;background:rgba(0,0,0,.8);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-size:16px;text-align:center;padding:20px}
</style>`);
  document.body.insertAdjacentHTML('beforeend', `<div id='vedt'>
<div class='bar2'><button id='vcx'>Cancel</button><b id='vtt'>Edit</b><button class='go' id='vdn'>Done</button></div>
<div id='vstage'><div id='vpl'>▶</div><span id='vtm'></span></div>
<div id='vtabs'></div><div id='vpan'></div>
<div id='vprog'><div id='vpt'>Preparing…</div><button id='vpc'>Cancel</button></div></div>`);
  $('#vstage').prepend(cv);
  const ids = n => document.getElementById(n);
  const panels = { trim: '', sound: '', look: '', chroma: '', text: '' };
  let tab = 'trim';
  const rng = (id, label, min, max, step, val) => `<label>${label} <span id='${id}v'></span></label><input type='range' id='${id}' min='${min}' max='${max}' step='${step}' value='${val}'>`;
  const chips = (id, arr, on) => `<div class='chips' id='${id}'>${arr.map(a => `<button data-v='${esc(a)}' class='${a === on ? 'on' : ''}'>${esc(a)}</button>`).join('')}</div>`;

  function tabs() {
    const t = S.mode === 'video' ? [['trim', 'Time'], ['sound', 'Sound'], ['look', 'Look'], ['chroma', 'Green screen'], ['text', 'Text']] : [['sound', 'Sound'], ['look', 'Look'], ['chroma', 'Green screen'], ['text', 'Text']];
    ids('vtabs').innerHTML = t.map(([k, l]) => `<button data-t='${k}' class='${k === tab ? 'on' : ''}'>${l}</button>`).join('');
  }
  function panel() {
    const p = ids('vpan');
    if (tab === 'trim') p.innerHTML = rng('ts', 'Start', 0, S.dur, .1, S.start) + rng('te', 'End', 0, S.dur, .1, S.end) + `<label>Speed</label>${chips('tsp', ['0.5x', '1x', '1.5x', '2x'], S.speed + 'x')}<label>Picture</label>${chips('tfit', ['Fill screen', 'Fit whole video'], S.fit === 'fill' ? 'Fill screen' : 'Fit whole video')}` + rng('tov', 'Original sound volume', 0, 1, .05, S.origVol) + `<p style='color:#aab'>Videos can be up to 20 minutes. Tap Done to save your edit; it records at about the speed of playback.</p>`;
    if (tab === 'sound') p.innerHTML = `<div class='chips'><button id='mlib'>Free &amp; Naija library</button><label style='margin:0'><input type='file' id='mph' accept='audio/*' hidden><button id='mpb' type='button'>From my phone</button></label>${S.music ? "<button id='mrm'>Remove</button>" : ''}</div><div>${S.music ? '♪ ' + esc(S.music.title) : 'No music yet.'}</div>` + rng('mv', 'Music volume', 0, 1, .05, S.musicVol) + rng('ms', 'Start the song at (seconds)', 0, 120, 1, S.musicStart) + (S.mode === 'photo' ? "<button id='mpl' style='margin-top:8px'>▶ Preview music</button>" : '') + `<p style='color:#aab'>Songs from the library play from their source and show their credit. Music from your phone is mixed into your video. Only use music you have the right to share.</p>`;
    if (tab === 'look') p.innerHTML = `<div class='chips' id='lk'>${Object.keys(LOOKS).map(k => `<button data-v='${k}'>${k}</button>`).join('')}</div>` + rng('lb', 'Brightness', -.4, .4, .01, S.bright) + rng('lc', 'Contrast', .5, 1.6, .01, S.contrast) + rng('ls', 'Colour', 0, 2, .01, S.sat) + rng('lw', 'Warmth', -1, 1, .01, S.warm) + rng('lv', 'Vignette', 0, 1, .01, S.vig);
    if (tab === 'chroma') p.innerHTML = `<label style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='kon' style='width:auto' ${S.key ? 'checked' : ''}> Remove a colour (green screen)</label><label>Colour to remove</label><div style='display:flex;gap:8px'><input type='color' id='kcol' value='${toHex(S.kc)}'><button id='kpk'>Pick from picture</button></div>` + rng('ksim', 'Amount removed', .05, .8, .01, S.sim) + rng('ksm', 'Edge softness', 0, .4, .01, S.sm) + rng('ksp', 'Colour spill clean-up', 0, 1, .01, S.sp) + `<label>Background behind you</label>${chips('kbg', ['Colour', 'My photo'], S.bgImg ? 'My photo' : 'Colour')}<div style='display:flex;gap:8px'><input type='color' id='bcol' value='${toHex(S.bgc)}'><input type='file' id='bimg' accept='image/*'></div>` + rng('bsc', 'Background size', .5, 3, .01, S.bgScale) + rng('bx', 'Background left / right', -.5, .5, .01, S.bgx) + rng('by', 'Background up / down', -.5, .5, .01, S.bgy);
    if (tab === 'text') p.innerHTML = `<label>Text on screen</label><input id='tx' maxlength='120' placeholder='Type here (new line: add | )' value='${esc(S.text.replace(/\n/g, '|'))}'>` + rng('tsz', 'Size', 24, 140, 1, S.tsize) + rng('typ', 'Up / down', .1, .9, .01, S.ty) + `<label>Colour</label><input type='color' id='tco' value='${S.tcol}'>`;
    p.querySelectorAll("input[type=range]").forEach(r => { const o = ids(r.id + 'v'); const sh = () => { if (o) o.textContent = r.id === 'ts' || r.id === 'te' ? tm(+r.value) : (+r.value).toFixed(2).replace(/\.00$/, ''); }; sh(); r.addEventListener('input', sh); });
  }
  ids('vtabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; tabs(); panel(); } };

  // ---------- Controls ----------
  const pan = ids('vpan');
  pan.addEventListener('input', e => {
    const r = e.target, v = +r.value, id = r.id;
    if (id === 'ts') { S.start = Math.min(v, S.end - .5); if (S.end - S.start > 1200) S.end = S.start + 1200; vid.currentTime = S.start; }
    if (id === 'te') { S.end = Math.max(v, S.start + .5); if (S.end - S.start > 1200) S.start = S.end - 1200; }
    if (id === 'tov') { S.origVol = v; applyVol(); }
    if (id === 'mv') { S.musicVol = v; applyVol(); }
    if (id === 'ms') { S.musicStart = v; }
    const map = { lb: 'bright', lc: 'contrast', ls: 'sat', lw: 'warm', lv: 'vig', ksim: 'sim', ksm: 'sm', ksp: 'sp', bsc: 'bgScale', bx: 'bgx', by: 'bgy', tsz: 'tsize', typ: 'ty' };
    if (map[id]) { S[map[id]] = v; if (id === 'tsz' || id === 'typ') drawText(); }
    if (id === 'kcol') { S.kc = hex(r.value); S.key = true; }
    if (id === 'bcol') { S.bgc = hex(r.value); S.bgImg = false; }
    if (id === 'tx') { S.text = r.value.replace(/\|/g, '\n'); drawText(); }
    if (id === 'tco') { S.tcol = r.value; drawText(); }
    if (id === 'kon') { S.key = r.checked; }
  });
  pan.addEventListener('change', async e => {
    const r = e.target;
    if (r.id === 'kon') S.key = r.checked;
    if (r.id === 'mph' && r.files[0]) { const f = r.files[0]; if (f.size > 25 * 1048576) return BP.note('That song is over 25 MB.'); musicStop(); ml.src = URL.createObjectURL(f); S.music = { kind: 'local', file: f, title: f.name.replace(/\.[^.]+$/, '') }; panel(); initAudio(); applyVol(); if (S.mode === 'video' && !vid.paused) musicRestart(); }
    if (r.id === 'bimg' && r.files[0]) { const im = new Image(); im.onload = () => { put(1, tB, im); S.bgImg = true; S.key = true; panel(); }; im.onerror = () => BP.note('That photo can’t be read.'); im.src = URL.createObjectURL(r.files[0]); }
  });
  pan.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const par = b.parentElement && b.parentElement.id, v = b.dataset.v;
    if (par === 'tsp') { S.speed = parseFloat(v); applyVol(); panel(); }
    if (par === 'tfit') { S.fit = v.startsWith('Fill') ? 'fill' : 'fit'; panel(); }
    if (par === 'lk') { Object.assign(S, LOOK0, LOOKS[v]); panel(); }
    if (par === 'kbg') { if (v === 'Colour') S.bgImg = false; else ids('bimg').click(); panel(); }
    if (b.id === 'mpb') ids('mph').click();
    if (b.id === 'mrm') { musicStop(); S.music = null; panel(); }
    if (b.id === 'mlib') { musicStop(); window.BPSounds ? BPSounds.open(r => { S.music = { kind: 'lib', url: r.url, title: r.title, credit: r.credit }; mb.src = r.url; panel(); applyVol(); if (S.mode === 'video' && !vid.paused) musicRestart(); }) : BP.note('The sound library isn’t available.'); }
    if (b.id === 'mpl') playPause();
    if (b.id === 'kpk') { picking = !picking; b.classList.toggle('on', picking); BP.note(picking ? 'Tap the colour you want to remove.' : 'Cancelled.', picking); }
  });
  cv.addEventListener('click', e => {
    if (!picking) return playPause();
    const rc = cv.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width, y = (e.clientY - rc.top) / rc.height, el = srcEl(), [w, h] = srcSize(); if (!w) return;
    const [sx, sy] = fitScale(), u = (x - .5) * sx + .5, v = (y - .5) * sy + .5; if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const t = document.createElement('canvas'); t.width = t.height = 5; t.getContext('2d').drawImage(el, Math.max(0, u * w - 4), Math.max(0, v * h - 4), 8, 8, 0, 0, 5, 5);
    const d = t.getContext('2d').getImageData(0, 0, 5, 5).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    S.kc = [r, g, b].map(c => c / 25 / 255); S.key = true; picking = false; panel(); BP.note('Colour picked. Adjust “Amount removed” if needed.', true);
  });

  // ---------- Open and close ----------
  const prog = f => { ids('vpt').textContent = (S.mode === 'video' ? 'Recording your edit… ' : 'Saving photos… ') + Math.min(99, Math.round(f * 100)) + '%'; };
  function show() { ids('vedt').classList.add('on'); opened = true; tabs(); panel(); drawText(); cancelAnimationFrame(raf); loop(); }
  function hide() { opened = false; cancelAnimationFrame(raf); musicStop(); vid.pause(); ids('vedt').classList.remove('on'); ids('vprog').style.display = 'none'; picking = false; }
  async function openVideo(file) {
    if (!glOK) return BP.note('Editing isn’t available on this phone. You can still post without editing.');
    S = fresh(); S.mode = 'video'; srcFile = file; preloadSound(); tab = 'trim'; ids('vtt').textContent = 'Edit video'; initAudio(); await ctx.resume();
    vid.src = URL.createObjectURL(file); await new Promise((ok, no) => { vid.onloadedmetadata = ok; vid.onerror = () => no(new Error('This video can’t be opened for editing.')); }).catch(e => { BP.note(e.message); throw e; });
    S.dur = vid.duration; S.end = Math.min(S.dur, 1200); applyVol(); show(); vid.currentTime = 0; vid.play().then(() => { ids('vpl').style.display = 'none'; }).catch(() => { ids('vpl').style.display = 'flex'; });
  }
  async function openPhotos(files) {
    if (!glOK) return BP.note('Editing isn’t available on this phone. You can still post without editing.');
    S = fresh(); S.mode = 'photo'; tab = 'sound'; preloadSound(); ids('vtt').textContent = 'Edit photos'; initAudio(); await ctx.resume(); imgs = []; cur = 0;
    for (const f of files.slice(0, 10)) { const im = new Image(); im.src = URL.createObjectURL(f); try { await im.decode(); imgs.push(im); } catch (e) { BP.note('One photo can’t be opened. Use JPG or PNG.'); } }
    if (!imgs.length) return; S.fit = 'fit'; show();
    ids('vstage').insertAdjacentHTML('beforeend', `<div id='vth' style='position:absolute;bottom:8px;left:0;right:0;display:flex;gap:6px;justify-content:center'>${imgs.map((im, i) => `<img src='${im.src}' data-i='${i}' style='width:44px;height:44px;object-fit:cover;border-radius:8px;border:2px solid ${i ? 'transparent' : '#1e6bff'}'>`).join('')}</div>`);
    ids('vth').onclick = e => { const t = e.target.closest('[data-i]'); if (!t) return; cur = +t.dataset.i; ids('vth').querySelectorAll('img').forEach((x, i) => { x.style.borderColor = i === cur ? '#1e6bff' : 'transparent'; }); };
  }
  ids('vcx').onclick = () => { hide(); const t = ids('vth'); if (t) t.remove(); };

  // ---------- Export ----------
  function musicFields() { const m = S.music; return m && m.kind === 'lib' ? { music_url: m.url, music_title: m.title, music_credit: m.credit, music_vol: S.musicVol, orig_vol: S.origVol, music_start: S.musicStart } : null; }
  let rec, chunks, t0, mime, xc = null, xx = null;
  ids('vdn').onclick = async () => {
    if (S.mode === 'photo') return exportPhotos();
    if (exporting) return; exporting = true; cancel = false; picking = false;
    const dur = (S.end - S.start) / S.speed, bps = Math.round(Math.max(4e5, Math.min(2.5e6, MAXMB * .9 * 8e6 / dur - 96e3)));
    cv.width = 720; cv.height = 1280; drawText(); applyVol(); mon.gain.value = 0; musicStop();
    ids('vprog').style.display = 'flex'; ids('vpt').textContent = 'Starting…';
    xc = document.createElement('canvas'); xc.width = 720; xc.height = 1280; xx = xc.getContext('2d'); const stream = xc.captureStream(30); dst.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) { exporting = false; ids('vprog').style.display = 'none'; return BP.note('This browser can’t save edited videos. Try Chrome.'); }
    chunks = []; rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 96000 }); rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      mon.gain.value = 1; exporting = false; cv.width = 540; cv.height = 960; drawText(); vid.pause(); musicStop();
      if (cancel || !chunks.length) { ids('vprog').style.display = 'none'; return; }
      const type = mime.split(';')[0], blob = new Blob(chunks, { type });
      window.BPEdit.video = { blob, type, duration: Math.max(1, Math.round(dur)), music: musicFields(), musicFile: null }; hide(); stat();
      BP.note('Edit saved (' + (blob.size / 1048576).toFixed(1) + ' MB). Add a title and tap Post.', true);
    };
    vid.pause(); vid.currentTime = S.start; await new Promise(r => { vid.onseeked = r; setTimeout(r, 800); });
    rec.start(500); ids('vpt').textContent = 'Recording your edit… 0%'; const m = musicEl(); if (m) { try { m.currentTime = S.musicStart; } catch (e) {} m.play().catch(() => {}); }
    await vid.play().catch(() => {});
  };
  function finishExport() { if (rec && rec.state !== 'inactive') rec.stop(); }
  ids('vpc').onclick = () => { cancel = true; finishExport(); };
  async function exportPhotos() {
    if (exporting) return; exporting = true; ids('vprog').style.display = 'flex'; const keep = cur; cv.width = 1080; cv.height = 1920; drawText(); const blobs = [];
    for (let i = 0; i < imgs.length; i++) { cur = i; render(); prog(i / imgs.length); blobs.push(await new Promise(r => cv.toBlob(r, 'image/jpeg', .9))); }
    cur = keep; cv.width = 540; cv.height = 960; drawText(); exporting = false;
    window.BPEdit.photos = { blobs, music: musicFields(), musicFile: S.music && S.music.kind === 'local' ? S.music.file : null };
    const t = ids('vth'); if (t) t.remove(); hide(); stat(); BP.note('Photos saved. Add a title and tap Post.', true);
  }

  // ---------- Hook into the post sheet ----------
  const stat = () => { const e = window.BPEdit, s = ids('edst'); if (!s) return; const snd = e.sound ? `<div>♪ Using sound: ${esc(e.sound.title)} · <a id='edsx' style='text-decoration:underline;cursor:pointer'>remove</a></div>` : ''; s.innerHTML = snd + (e.video ? `✓ Edited video ready (${tm(e.video.duration)}) · <a id='edrm' style='text-decoration:underline;cursor:pointer'>remove edits</a>` : e.photos ? `✓ ${e.photos.blobs.length} edited photos ready · <a id='edrm' style='text-decoration:underline;cursor:pointer'>remove edits</a>` : ''); const sx = ids('edsx'); if (sx) sx.onclick = () => { window.BPEdit.sound = null; stat(); }; const rm = ids('edrm'); if (rm) rm.onclick = () => { window.BPEdit.video = window.BPEdit.photos = null; stat(); }; };
  window.BPEdit.refresh = stat;
  $('#file').insertAdjacentHTML('afterend', "<video id='upv' playsinline muted controls preload='metadata' style='display:none;width:100%;max-height:220px;border-radius:10px;background:#000;margin:6px 0'></video><button class='btn alt' id='edv' hidden>✂ Edit video</button><div id='edst' style='font-size:13px;color:var(--blue);margin:4px 0'></div>");
  $('#pimg').insertAdjacentHTML('afterend', "<button class='btn alt' id='edp' hidden>✂ Edit photos</button>");
  $('#file').addEventListener('change', () => { window.BPEdit.video = null; stat(); const f = $('#file').files[0], pv = ids('upv'); ids('edv').hidden = !f; if (f) { pv.src = URL.createObjectURL(f) + '#t=0.1'; pv.style.display = 'block'; } else pv.style.display = 'none'; });
  $('#pimg').addEventListener('change', () => { window.BPEdit.photos = null; stat(); ids('edp').hidden = !$('#pimg').files.length; });
  ids('edv').onclick = () => { const f = $('#file').files[0]; if (f) openVideo(f).catch(() => {}); };
  ids('edp').onclick = () => { const f = [...$('#pimg').files]; if (f.length) openPhotos(f); };
})();
