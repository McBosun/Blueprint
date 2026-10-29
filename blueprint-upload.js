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

  // Re-encode a video at a lower bitrate so it fits the storage limit. Runs in real time:
  // a 3 minute video takes about 3 minutes. Needs Chrome, Edge, Firefox or Android browsers.
  compress(file, targetMB, onProgress) {
    return new Promise((ok, no) => {
      const v = document.createElement('video');
      v.playsInline = true; v.preload = 'auto';
      const url = URL.createObjectURL(file); v.src = url;
      const cap = v.captureStream ? () => v.captureStream() : v.mozCaptureStream ? () => v.mozCaptureStream() : null;
      if (!cap || !window.MediaRecorder) { URL.revokeObjectURL(url); return no(new Error('Compression isn’t supported in this browser. Trim the video or use Chrome.')); }
      v.onerror = () => { URL.revokeObjectURL(url); no(new Error('That video can’t be read for compression.')); };
      v.onloadedmetadata = async () => {
        try {
          const dur = v.duration;
          if (!isFinite(dur) || dur <= 0) throw new Error('Couldn’t read the video length.');
          const ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createMediaStreamDestination();
          ac.createMediaElementSource(v).connect(dest); // audio goes to the recorder, not the speakers
          const vt = cap().getVideoTracks()[0];
          const stream = new MediaStream([vt, ...dest.stream.getAudioTracks()]);
          const audioBps = 96000, bps = Math.max(250000, Math.min(2500000, Math.floor(targetMB * 8e6 / dur * 0.85 - audioBps)));
          const rec = new MediaRecorder(stream, { videoBitsPerSecond: bps, audioBitsPerSecond: audioBps });
          const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
          rec.onstop = () => {
            clearInterval(tick); ac.close(); URL.revokeObjectURL(url);
            const type = (rec.mimeType || 'video/webm').split(';')[0];
            ok({ blob: new Blob(chunks, { type }), type, duration: Math.round(dur) });
          };
          const tick = setInterval(() => { if (onProgress) onProgress(Math.min(99, Math.round(v.currentTime / dur * 100))); }, 500);
          v.onended = () => rec.stop();
          rec.start(1000); await ac.resume(); await v.play();
        } catch (e) { URL.revokeObjectURL(url); no(e); }
      };
    });
  }
};
