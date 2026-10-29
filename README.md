# Blueprint

Video and photo social app: video uploads up to 20 minutes, photo posts with music, live streams up to 2 hours, step-by-step Blueprints.

## Set up
1. Create a Supabase project.
2. SQL Editor: run `schema.sql` once, then run `update-all.sql` (safe to run again any time).
3. Project Settings > API: put the Project URL and publishable key in `config.js`.
4. Authentication > Sign In / Providers > Email: turn off "Confirm email" while testing.
5. Deploy the folder to GitHub Pages. Authentication > URL Configuration: set Site URL to your Pages link.

## Files
index.html, blueprint-profile.js, blueprint-supabase.js, blueprint-extra.js, config.js, schema.sql, update-all.sql

## If a video won't post
- The error shows at the top of the page. Free Supabase plans allow 50 MB per file.
- Run `update-all.sql` (it repairs accounts that have no profile).
- Check Supabase > Storage > videos and Table Editor > bp_videos to see how far it got.

## Notes
- Live streams use WebRTC straight from the host's phone to viewers (about 8 at once by default; `maxViewers` in config.js). Some mobile networks block direct connections. For big audiences add a TURN server (`iceServers` in config.js) or use LiveKit, Agora or Mux.
- Live replays upload to storage when they fit the file limit (50 MB on the free plan).
- The AI copilot only works inside claude.ai. Elsewhere, use a Supabase Edge Function.
