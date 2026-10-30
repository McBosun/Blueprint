# Blueprint

Video and photo social app: video uploads up to 20 minutes, photo posts with music, live streams up to 2 hours.

## Set up
1. Create a Supabase project.
2. SQL Editor: run `schema.sql` once, then `update-all.sql` (safe to run again any time).
3. Project Settings > API: put the Project URL and publishable key in `config.js`.
4. Authentication > Sign In / Providers > Email: turn off "Confirm email" while testing.
5. Deploy the folder to GitHub Pages. Authentication > URL Configuration: set Site URL to your Pages link.
6. Moderator: the `bp_admins` statement near the bottom of `update-all.sql` makes one email a moderator. Change the email there if needed.
7. Fill in the [brackets] in `terms.html` and `privacy.html` and have a lawyer review them.

## Files
index.html, blueprint-profile.js, blueprint-supabase.js, blueprint-extra.js, blueprint-messages.js, blueprint-sound.js, blueprint-upload.js, blueprint-feed.js, blueprint-safety.js, blueprint-settings.js, blueprint-install.js, blueprint-notify.js, blueprint-sounds.js, blueprint-editor.js, debug.html, send-push.ts, vapid.html, manifest.json, sw.js, icons (icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-48.png), config.js, schema.sql, update-all.sql, terms.html, privacy.html, TESTING.md

## Optional config.js settings
```js
window.BLUEPRINT_CONFIG = {
  url: '...', key: '...',
  maxMB: 50,            // match your Storage file limit (free plan: 50)
  maxViewers: 8,        // viewers per live (direct phone-to-phone video)
  iceServers: [         // add a TURN relay so lives connect on every mobile network
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:YOUR_TURN_HOST:3478', username: 'USER', credential: 'PASSWORD' }
  ]
};
```
TURN relays are sold by services such as Metered, Twilio or Cloudflare, or you can run your own (coturn).

## Limits and notes
- Free Supabase plan: 50 MB per file. Bigger videos are compressed in the browser (takes about as long as the video) or need a paid plan.
- Lives are direct phone-to-phone video for a handful of viewers. For big audiences use LiveKit, Agora or Mux.
- Private messages are protected by database rules but not end-to-end encrypted.
- Reports appear in Me > Settings > Moderation (admins only) and in the `bp_reports` table.
- Run the health check in Me > Settings any time something seems broken. Follow `TESTING.md` before inviting people.

## Install as an app (PWA)
Open the site on a phone: Android Chrome offers Install app; on iPhone use Safari > Share > Add to Home Screen. Me > Settings > Account and help has an Install button too.
When you release an update, change the version number (20261030c) in `index.html` (meta and script tags), `blueprint-settings.js` and `sw.js` so phones pick it up.
Store listings later: Android via PWABuilder or Bubblewrap (Google Play developer account), iPhone via a Capacitor wrapper (Apple Developer account and App Review; user-generated content apps need reporting, blocking and moderation, which Blueprint has).

## Phone alerts (push) setup
1. Open `vapid.html` on your site and tap Make my keys. Put the public key in `config.js` as `vapidKey: '...'`. Keep the private key secret.
2. Supabase > Edge Functions > Deploy a new function > via Editor. Name it `send-push`, paste `send-push.ts`, deploy, then switch **Verify JWT** off in the function's settings.
3. Supabase > Edge Functions > Secrets: add `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` (like `mailto:you@example.com`) and `PUSH_SECRET` (a long random string).
4. In the SQL Editor (do not save this in GitHub) run, with your own values:
```sql
insert into public.bp_push_config (key, value) values
  ('url', 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push'),
  ('secret', 'THE_SAME_PUSH_SECRET')
on conflict (key) do update set value = excluded.value;
```
5. In the app: Me > Settings > Notifications > Turn on, then Test. On iPhone (iOS 16.4+) install Blueprint to the home screen first.

## config.js: a common mistake
Every line inside the braces needs a comma after it except the last, and text values need quotes:
```js
window.BLUEPRINT_CONFIG = {
  url: 'https://YOUR-REF.supabase.co',
  key: 'YOUR_PUBLISHABLE_KEY',
  vapidKey: 'YOUR_PUBLIC_VAPID_KEY',
  jamendoId: 'YOUR_JAMENDO_CLIENT_ID'
};
```
If config.js has a mistake the app falls back to demo mode (no real videos or profile) and shows a red message at the top. Open `debug.html` to see exactly what is wrong.

## Editor and sounds
- In the post sheet, choose a video or photos, then tap Edit. You can trim and change speed, add music, change the look, remove a colour (green screen) and add text.
- Music: Blueprint Sounds (artists upload their own tracks, including Naija music) and free Creative Commons music from Jamendo (get a free client ID at devportal.jamendo.com and set `jamendoId`). Read Jamendo's terms before using it in a business. Popular commercial songs cannot be included without licences.
- Music from the library plays from its source and shows its credit. Music from your phone is mixed into the video.
