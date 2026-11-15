// Cloudflare R2 adapter for Blueprint. Supabase remains the identity and database provider.
(() => {
  const C = window.BLUEPRINT_CONFIG || {};
  const base = String(C.mediaApi || "").replace(/\/$/, "");
  if (!base) return; // Keep the existing Supabase Storage behavior until the Worker URL is configured.

  const allowed = new Set(["videos", "media", "avatars", "sounds", "ads"]);
  const partSize = 8 * 1024 * 1024;
  const encodeKey = key => String(key).split("/").map(encodeURIComponent).join("/");
  const url = (bucket, key) => base + "/media/" + encodeURIComponent(bucket) + "/" + encodeKey(key);
  async function token() {
    const sb = window.BP && window.BP.sb;
    if (!sb) throw new Error("Blueprint is still starting. Refresh and try again.");
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session) throw new Error("Please sign in again.");
    return data.session.access_token;
  }
  async function call(path, options = {}) {
    const access = await token();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", "Bearer " + access);
    const r = await fetch(base + path, { ...options, headers });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "Media request failed (" + r.status + ").");
    return body;
  }
  async function upload(bucket, key, blob, type, onProgress) {
    if (!allowed.has(bucket)) throw new Error("Unknown media category.");
    if (blob.size <= partSize) {
      await call("/upload?bucket=" + encodeURIComponent(bucket) + "&key=" + encodeURIComponent(key), {
        method: "PUT", headers: { "Content-Type": type || blob.type || "application/octet-stream" }, body: blob
      });
      if (onProgress) onProgress(100);
      return { path: key };
    }
    const init = await call("/multipart?bucket=" + encodeURIComponent(bucket) + "&key=" + encodeURIComponent(key), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: type || blob.type, size: blob.size })
    });
    const parts = [];
    try {
      const count = Math.ceil(blob.size / partSize);
      for (let i = 0; i < count; i++) {
        const chunk = blob.slice(i * partSize, Math.min(blob.size, (i + 1) * partSize));
        let result, lastError;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            result = await call("/multipart/part?bucket=" + encodeURIComponent(bucket) + "&key=" + encodeURIComponent(key) + "&uploadId=" + encodeURIComponent(init.uploadId) + "&partNumber=" + (i + 1), { method: "PUT", body: chunk });
            break;
          } catch (e) { lastError = e; if (attempt < 3) await new Promise(resolve => setTimeout(resolve, [1000, 2500, 5000][attempt])); }
        }
        if (!result) throw lastError || new Error("A video part failed to upload.");
        parts.push({ partNumber: result.partNumber, etag: result.etag });
        if (onProgress) onProgress(Math.round((i + 1) / count * 100));
      }
      await call("/multipart/complete?bucket=" + encodeURIComponent(bucket) + "&key=" + encodeURIComponent(key), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: init.uploadId, parts })
      });
      return { path: key };
    } catch (e) {
      try { await call("/multipart?bucket=" + encodeURIComponent(bucket) + "&key=" + encodeURIComponent(key) + "&uploadId=" + encodeURIComponent(init.uploadId), { method: "DELETE" }); } catch (_) {}
      throw e;
    }
  }
  async function remove(bucket, paths) {
    if (!allowed.has(bucket)) throw new Error("Unknown media category.");
    for (const key of paths) await call("/object?bucket=" + encodeURIComponent(bucket) + "&key=" + encodeURIComponent(key), { method: "DELETE" });
    return { data: paths.map(name => ({ name })), error: null };
  }
  window.BPR2 = { url, upload, remove, enabled: true };
  window.BPR2.install = sb => {
    const storage = sb.storage, originalFrom = storage.from.bind(storage);
    storage.from = bucket => {
      if (!allowed.has(bucket)) return originalFrom(bucket);
      return {
        upload: async (path, file, options = {}) => {
          try { await upload(bucket, path, file, options.contentType || file.type, options.onProgress); return { data: { path }, error: null }; }
          catch (error) { return { data: null, error }; }
        },
        remove: async paths => {
          try { return await remove(bucket, paths); }
          catch (error) { return { data: null, error }; }
        },
        getPublicUrl: path => ({ data: { publicUrl: url(bucket, path) } })
      };
    };
  };
})();
