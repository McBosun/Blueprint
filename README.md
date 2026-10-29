# Blueprint

Video and photo social app: video uploads up to 20 minutes, photo posts with music, live streams up to 2 hours.

## Set up
1. Create a Supabase project.
2. SQL Editor: run `schema.sql` once, then `update-all.sql` (safe to run again any time).
3. Project Settings > API: put the Project URL and publishable key in `config.js`.
4. Authentication > Sign In / Providers > Email: turn off "Confirm email" while testing.
5. Deploy the folder to GitHub Pages. Authentication > URL Configuration: set Site URL to your Pages link.
6. Make yourself a moderator: run the `bp_admins` line at the bottom of `update-all.sql` with your email.
7. Fill in the [brackets] in `terms.html` and `privacy.html` and have a lawyer review them.

## Files
index.html, blueprint-profile.js, blueprint-supabase.js, blueprint-extra.js, blueprint-messages.js, blueprint-sound.js, blueprint-upload.js, blueprint-feed.js, blueprint-safety.js, blueprint-settings.js, config.js, schema.sql, update-all.sql, terms.html, privacy.html, TESTING.md

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
