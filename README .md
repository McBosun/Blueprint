# Blueprint

Video-only social app: 20-minute uploads, live streams up to 2 hours, step-by-step Blueprints.

## Set up
1. Create a Supabase project.
2. SQL Editor: paste `schema.sql`, Run.
3. Project Settings > API: copy the Project URL and publishable key into `config.js`.
4. Authentication > Sign In / Providers > Email: turn off "Confirm email" while testing.
5. Open `index.html` (or deploy the folder to GitHub Pages, Netlify or Vercel).
6. Authentication > URL Configuration: add your deployed site URL.

## Push to GitHub
```
git init
git add .
git commit -m "Blueprint"
git branch -M main
git remote add origin https://github.com/YOU/blueprint.git
git push -u origin main
```
On a phone: create the repo on github.com, then Add file > Upload files.

## Notes
- Free Supabase plan limits files to 50 MB. Raise it on a paid plan for longer videos.
- Live viewers need a streaming service (LiveKit, Agora or Mux). Supabase stores data and replays but does not carry live video.
- The AI copilot only works inside claude.ai. Outside it, add a Supabase Edge Function that calls an AI API.
