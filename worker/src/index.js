const ALLOWED_ORIGINS = new Set(["https://mcbosun.github.io"]);
const BUCKETS = new Set(["videos", "media", "avatars", "sounds", "ads"]);
const LIMITS = { videos: 50 * 1024 * 1024, media: 15 * 1024 * 1024, avatars: 2 * 1024 * 1024, sounds: 15 * 1024 * 1024, ads: 100 * 1024 * 1024 };

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://mcbosun.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
    "Access-Control-Expose-Headers": "ETag, Content-Length, Content-Range, Accept-Ranges",
    "Vary": "Origin"
  };
}
function response(body, status, origin, extra = {}) {
  return new Response(body, { status, headers: { ...cors(origin), ...extra } });
}
function json(data, status, origin) {
  return response(JSON.stringify(data), status, origin, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
}
function safeKey(value) {
  if (typeof value !== "string" || !value || value.length > 900 || value.startsWith("/") || value.includes("\\") || value.split("/").some(x => !x || x === "." || x === "..")) return false;
  return true;
}
function allowedType(bucket, type) {
  if (!type || type.length > 120) return false;
  if (bucket === "videos") return type.startsWith("video/");
  if (bucket === "avatars") return ["image/jpeg", "image/png", "image/webp"].includes(type);
  if (bucket === "media") return type.startsWith("image/") || type.startsWith("audio/");
  if (bucket === "sounds") return type.startsWith("audio/");
  if (bucket === "ads") return type.startsWith("image/") || type.startsWith("video/");
  return false;
}
async function authenticate(request, env) {
  const token = request.headers.get("Authorization") || "";
  if (!token.startsWith("Bearer ")) return null;
  const r = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
    headers: { Authorization: token, apikey: env.SUPABASE_ANON_KEY }
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user && user.id ? user : null;
}
async function isAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const r = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/bp_is_admin", {
    method: "POST",
    headers: { Authorization: authorization, apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: "{}"
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}
function parseRange(value, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(value || "");
  if (!m) return null;
  if (!m[1] && !m[2]) return null;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!suffix) return null;
    return { offset: Math.max(0, size - suffix), length: Math.min(size, suffix) };
  }
  const offset = Number(m[1]), end = m[2] ? Number(m[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset) return null;
  return { offset, length: Math.min(size - offset, end - offset + 1) };
}
function objectKey(bucket, key) { return bucket + "/" + key; }

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/media/") && ["GET", "HEAD"].includes(request.method)) {
        const parts = url.pathname.slice(7).split("/");
        const bucket = decodeURIComponent(parts.shift() || "");
        const key = parts.map(decodeURIComponent).join("/");
        if (!BUCKETS.has(bucket) || !safeKey(key)) return json({ error: "Invalid media path." }, 400, origin);
        const rangeHeader = request.headers.get("Range");
        const range = rangeHeader ? parseRange(rangeHeader, Number.MAX_SAFE_INTEGER) : null;
        let obj;
        if (rangeHeader) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
          if (!match) return json({ error: "Invalid byte range." }, 416, origin);
          if (!match[1] && !match[2]) return json({ error: "Invalid byte range." }, 416, origin);
          if (!match[1]) {
            const suffix = Number(match[2]);
            obj = await env.MEDIA.get(objectKey(bucket, key), { range: { suffix } });
          } else {
            const offset = Number(match[1]), end = match[2] ? Number(match[2]) : undefined;
            obj = await env.MEDIA.get(objectKey(bucket, key), { range: end === undefined ? { offset } : { offset, length: end - offset + 1 } });
          }
        } else obj = await env.MEDIA.get(objectKey(bucket, key));
        if (!obj) return response("Not found", 404, origin);
        const headers = new Headers(cors(origin));
        obj.writeHttpMetadata(headers);
        headers.set("ETag", obj.httpEtag);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", bucket === "avatars" ? "public, max-age=300" : "public, max-age=3600");
        const downloadName = url.searchParams.get("download");
        if (downloadName) {
          const safeName = downloadName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
          headers.set("Content-Disposition", 'attachment; filename="' + safeName + '"');
        }
        if (rangeHeader && obj.range) {
          const start = obj.range.offset || 0, length = obj.range.length || obj.size;
          headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${obj.size}`);
          headers.set("Content-Length", String(length));
        } else headers.set("Content-Length", String(obj.size));
        return new Response(request.method === "HEAD" ? null : obj.body, { status: rangeHeader ? 206 : 200, headers });
      }

      const bucket = url.searchParams.get("bucket") || "";
      const key = url.searchParams.get("key") || "";
      const prefix = url.searchParams.get("prefix") || "";
      if (!BUCKETS.has(bucket)) return json({ error: "Invalid media category." }, 400, origin);

      const user = await authenticate(request, env);
      if (!user) return json({ error: "Sign in to upload or manage media." }, 401, origin);
      if (url.pathname === "/list" && request.method === "GET") {
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 100)));
        if (prefix && (!safeKey(prefix) || !(prefix === user.id || prefix.startsWith(user.id + "/")))) return json({ error: "You can only list files in your own account folder." }, 403, origin);
        if (!prefix && limit > 1) return json({ error: "Root listing is limited to a health-check request." }, 403, origin);
        const result = await env.MEDIA.list({ prefix: objectKey(bucket, prefix), limit });
        const data = result.objects.map(obj => ({
          name: prefix ? obj.key.slice((objectKey(bucket, prefix) + "/").length) : obj.key.slice((bucket + "/").length),
          id: obj.etag,
          metadata: { size: obj.size, mimetype: obj.httpMetadata && obj.httpMetadata.contentType },
          created_at: obj.uploaded ? obj.uploaded.toISOString() : null,
          updated_at: obj.uploaded ? obj.uploaded.toISOString() : null
        }));
        return json({ data, error: null }, 200, origin);
      }
      if (!safeKey(key)) return json({ error: "Invalid object key." }, 400, origin);
      if (key.split("/")[0] !== user.id) {
        const adminDelete = request.method === "DELETE" && url.pathname === "/object" &&
          ["videos", "media", "avatars"].includes(bucket) && await isAdmin(request, env);
        if (!adminDelete) return json({ error: "You can only manage files in your own account folder." }, 403, origin);
      }

      if (request.method === "PUT" && url.pathname === "/upload") {
        const type = request.headers.get("Content-Type") || "application/octet-stream";
        const size = Number(request.headers.get("Content-Length") || 0);
        if (!allowedType(bucket, type)) return json({ error: "This file type is not allowed for this media category." }, 415, origin);
        if (size && size > LIMITS[bucket]) return json({ error: "File exceeds the configured size limit for this category." }, 413, origin);
        const result = await env.MEDIA.put(objectKey(bucket, key), request.body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=3600" } });
        return json({ ok: true, key, etag: result.httpEtag }, 200, origin);
      }

      if (request.method === "POST" && url.pathname === "/multipart") {
        const body = await request.json();
        const type = String(body.contentType || "");
        const size = Number(body.size || 0);
        if (!allowedType(bucket, type)) return json({ error: "This file type is not allowed for this media category." }, 415, origin);
        if (!Number.isSafeInteger(size) || size < 1 || size > LIMITS[bucket]) return json({ error: "File exceeds the configured size limit for this category." }, 413, origin);
        const upload = await env.MEDIA.createMultipartUpload(objectKey(bucket, key), { httpMetadata: { contentType: type, cacheControl: "public, max-age=3600" } });
        return json({ uploadId: upload.uploadId }, 200, origin);
      }

      if (request.method === "PUT" && url.pathname === "/multipart/part") {
        const uploadId = url.searchParams.get("uploadId");
        const partNumber = Number(url.searchParams.get("partNumber"));
        if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) return json({ error: "Invalid multipart part." }, 400, origin);
        const upload = env.MEDIA.resumeMultipartUpload(objectKey(bucket, key), uploadId);
        const part = await upload.uploadPart(partNumber, request.body);
        return json({ partNumber: part.partNumber, etag: part.etag }, 200, origin);
      }

      if (request.method === "POST" && url.pathname === "/multipart/complete") {
        const body = await request.json();
        if (!body.uploadId || !Array.isArray(body.parts) || !body.parts.length) return json({ error: "Missing multipart upload details." }, 400, origin);
        const upload = env.MEDIA.resumeMultipartUpload(objectKey(bucket, key), body.uploadId);
        const result = await upload.complete(body.parts.map(p => ({ partNumber: Number(p.partNumber), etag: p.etag })));
        return json({ ok: true, key, etag: result.httpEtag }, 200, origin);
      }

      if (request.method === "DELETE" && url.pathname === "/multipart") {
        const uploadId = url.searchParams.get("uploadId");
        if (uploadId) await env.MEDIA.resumeMultipartUpload(objectKey(bucket, key), uploadId).abort();
        return json({ ok: true }, 200, origin);
      }

      if (request.method === "DELETE" && url.pathname === "/object") {
        await env.MEDIA.delete(objectKey(bucket, key));
        return json({ ok: true }, 200, origin);
      }
      return json({ error: "Route not found." }, 404, origin);
    } catch (error) {
      return json({ error: error && error.message ? error.message : "Media service error." }, 500, origin);
    }
  }
};
