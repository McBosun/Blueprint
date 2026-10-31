// Reliable uploads: resumable chunked uploads with progress (tus) and optional in-browser compression.
window.BPUpload = {
  // Upload a file or blob to Supabase Storage. Large files go in resumable 6 MB chunks.
  async put(bucket, path, blob, type, onProgress) {
    const C = window.BLUEPRINT_CONFIG, sb = window.BP.sb;
    const s = (await sb.auth.getSession()).data.session;
    if (!s) throw new Error('Please sign in again.');
    if (!window.tus || blob.size < 6 * 1048576) {
      const r = await sb.storage.from(bucket).upload(path, blob, { contentType: type });
      if (r.error) throw r.error;
      if (onProgress) onProgress(100);
      return;
    }
    await new Promise((ok, no) => {
      const u = new tus.Upload(blob, {
        endpoint: C.url.replace(/\/$/, '') + '/storage/v1/upload/resumable',
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: 'Bearer ' + s.access_token, apikey: C.key },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: bucket, objectName: path, contentType: type, cacheControl: '3600' },
        chunkSize: 6 * 1048576,
        onError: e => no(new Error((e && e.message) || 'Upload failed. Check your connection and try again.')),
        onProgress: (a, b) => { if (onProgress) onProgress(Math.round(a / b * 100)); },
        onSuccess: () => ok()
      });
      u.start();
    });
  },

  // Re-encode a video so it plays smoothly for everyone: at most 1280 pixels on the long side and a modest bitrate.
  // It runs in real time: a 3 minute video takes about 3 minutes. Needs Chrome, Edge, Firefox or a recent iPhone.
  compress(file, targetMB, onProgress) {
    return new Promise((ok, no) => {
      const v = document.createElement('video'), url = URL.createObjectURL(file);
      v.setAttribute('playsinline', ''); v.preload = 'auto'; v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none'; document.body.appendChild(v); v.src = url;
      const fail = e => { v.remove(); URL.revokeObjectURL(url); no(e); };
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return fail(new Error('Optimizing isn’t supported in this browser. Trim the video or use Chrome.'));
      v.onerror = () => fail(new Error('That video can’t be read.'));
      v.onloadedmetadata = async () => {
        try {
          const dur = v.duration, vw = v.videoWidth, vh = v.videoHeight;
          if (!isFinite(dur) || !vw) throw new Error('Couldn’t read the video.');
          const k = Math.min(1, 1280 / Math.max(vw, vh)), cw = Math.round(vw * k / 2) * 2, ch = Math.round(vh * k / 2) * 2;
          const cvs = document.createElement('canvas'); cvs.width = cw; cvs.height = ch; const c2 = cvs.getContext('2d');
          const ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(v).connect(dest);
          const stream = cvs.captureStream(30); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
          const abps = 96000, bps = Math.max(250000, Math.min(2500000, Math.floor(targetMB * 8e6 / dur * 0.85 - abps)));
          const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
          const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: abps });
          const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
          let raf; const draw = () => { c2.drawImage(v, 0, 0, cw, ch); if (onProgress) onProgress(Math.min(99, Math.round(v.currentTime / dur * 100))); raf = requestAnimationFrame(draw); };
          rec.onstop = () => { cancelAnimationFrame(raf); ac.close(); v.remove(); URL.revokeObjectURL(url); const type = (mime || 'video/webm').split(';')[0]; ok({ blob: new Blob(chunks, { type }), type, duration: Math.round(dur) }); };
          v.onended = () => rec.stop();
          rec.start(1000); await ac.resume(); await v.play(); draw();
        } catch (e) { fail(e); }
      };
    });
  }
};
