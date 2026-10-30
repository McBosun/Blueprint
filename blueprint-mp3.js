// Turn a video's sound into an MP3 so other people can use it as a sound (like "original sound" on TikTok).
window.BPMp3 = {
  async fromBlob(blob, onProgress) {
    if (!window.lamejs) throw new Error('The MP3 encoder did not load.');
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    let buf;
    try { buf = await ac.decodeAudioData(await blob.arrayBuffer()); } finally { ac.close(); }
    if (!buf || buf.duration < 0.5) throw new Error('No sound found in this video.');
    const rate = 44100, oc = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate), src = oc.createBufferSource();
    src.buffer = buf; src.connect(oc.destination); src.start();
    const mono = (await oc.startRendering()).getChannelData(0);
    let peak = 0; for (let i = 0; i < mono.length; i += 50) peak = Math.max(peak, Math.abs(mono[i]));
    if (peak < 0.005) throw new Error('This video is silent.');
    const enc = new lamejs.Mp3Encoder(1, rate, 96), out = [], step = 1152 * 20, i16 = new Int16Array(step);
    for (let p = 0; p < mono.length; p += step) {
      const n = Math.min(step, mono.length - p), chunk = n === step ? i16 : new Int16Array(n);
      for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, mono[p + i])); chunk[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
      const b = enc.encodeBuffer(chunk); if (b.length) out.push(new Int8Array(b));
      if ((p / step) % 10 === 0) { if (onProgress) onProgress(p / mono.length); await new Promise(r => setTimeout(r)); }
    }
    const end = enc.flush(); if (end.length) out.push(new Int8Array(end));
    return new Blob(out, { type: 'audio/mpeg' });
  }
};
