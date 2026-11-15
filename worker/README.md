# Blueprint Cloudflare R2 media service

This Worker is the media API for the Blueprint GitHub Pages frontend. Supabase remains responsible for authentication and application data. The R2 bucket is private; the Worker reads and writes objects through its `MEDIA` binding.

## 1. Deploy the Worker from this repository

In Cloudflare Dashboard:
1. Open **Workers & Pages** and select the Worker you already created (name it `blueprint-media-api` if you have not named it yet).
2. Open **Settings → Builds** / **Builds** and connect the GitHub repository `McBosun/Blueprint`.
3. Select branch `cloudflare-r2-integration` while testing.
4. Set the Worker root directory to `worker`.
5. Set the build command to blank / none and the deploy command to `npx wrangler deploy` if Cloudflare asks for one. The Wrangler config is `worker/wrangler.toml`.
6. Deploy. The Worker URL will look like `https://blueprint-media-api.<your-subdomain>.workers.dev`.

If the Worker was created with the dashboard editor, it is okay to connect the GitHub repository to that existing Worker. Do not create a second Worker unless Cloudflare requires it.

## 2. Bind the R2 bucket

Worker → **Settings → Bindings → Add binding → R2 bucket**:
- Variable name: `MEDIA`
- Bucket: `blueprint-media`

The same binding is declared in `wrangler.toml`. Save and redeploy.

Keep the bucket private. Do not enable the R2 public development URL for this setup.

## 3. Add Worker variables/secrets

Worker → **Settings → Variables and Secrets**:
- `SUPABASE_URL` — your Supabase project URL, e.g. `https://YOUR-PROJECT-REF.supabase.co`
- `SUPABASE_ANON_KEY` — your Supabase publishable/anon key (not the service-role key)

Store them as encrypted secrets if the dashboard offers that option, then deploy. Never put the service-role key in GitHub or the browser.

The Worker validates each Supabase access token by calling Supabase Auth's `/auth/v1/user` endpoint. Upload and delete requests must be authenticated and the object key must begin with the signed-in user's Supabase UUID.

## 4. Configure Blueprint frontend

Open the existing private `config.js` in your repository (do not replace its current Supabase URL or key). Add one property inside `window.BLUEPRINT_CONFIG`:

```js
mediaApi: 'https://blueprint-media-api.YOUR-SUBDOMAIN.workers.dev',
```

Replace the example URL with the exact Worker URL shown by Cloudflare. Keep the existing `url`, `key`, and any other settings. Do not paste credentials into chat or commit service-role keys.

The app loads `blueprint-r2.js` before the Supabase integration. When `mediaApi` is present, its compatibility adapter redirects existing Blueprint Storage operations to R2. When absent, the app continues using Supabase Storage.

## 5. What is moved

The adapter covers Blueprint's existing buckets:
- `videos` — videos and live replays
- `media` — photo posts and their audio
- `avatars` — profile photos
- `sounds` — creator audio library and extracted sounds
- `ads` — sponsored post images/videos

Supabase Auth and all database tables remain in place. Existing Supabase Storage objects are not automatically copied. Old media URLs will continue to work until you migrate those objects and update their paths/URLs.

## 6. Test before merging to main

1. Open the branch's GitHub Pages preview only if Pages is configured for this branch; otherwise test locally or use a temporary Pages preview.
2. Sign in with a test account.
3. Upload a small photo post, then a short video, then a video larger than 8 MB to exercise multipart upload.
4. Update the profile photo.
5. Upload a creator sound and confirm it plays.
6. Test a live replay if possible.
7. Delete a test post and confirm its R2 objects are removed.
8. Test playback on iPhone Safari and Android Chrome, including seeking in a video (HTTP byte ranges).
9. Check Cloudflare Worker logs for errors and verify that objects appear in the `blueprint-media` bucket.

Do not delete existing Supabase Storage objects. This branch is a staging integration; merge only after these tests pass.
