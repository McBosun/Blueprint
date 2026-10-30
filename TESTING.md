# Blueprint test checklist (use two accounts, A and B, on two phones)

First: Me > Settings > **Run check**. Fix every ✗ before testing (most mean update-all.sql still needs running).

1. Sign up A and B (tick the age and terms box). Confirm both appear in Supabase > Authentication.
2. A posts a short video (under 10 MB). It shows in the feed and under A's Me > Posts.
3. A posts 3 photos with a song. Slideshow plays; music starts after your first tap.
4. B follows A. A gets a 🔔 notification. B's Following tab shows A's posts.
5. B likes and comments on A's post. A gets notifications. Refresh: they stay.
6. B saves a post. It stays in Blueprints after refresh.
7. B taps A's @username: profile opens. A's Activity > Profile views shows B.
8. B searches a word from A's title, and taps a #tag chip.
9. B reports A's post (⚑). In Supabase: Table Editor > bp_reports has a row.
10. A messages B (mutual follow needed). B sees a banner and ✉️ count.
11. A deletes a post (🗑). It disappears and its files leave Storage.
12. A goes live. B sees the red bar, joins, chats. A sees the viewer count. A ends: replay appears on A's profile.
13. Upload a video over the size limit: it offers to compress, then uploads with a % progress.
14. Share a post link (Share button), open it in a private tab: the post opens.

Admins can also tick these off inside the app: Me > Settings > Account and help > Test checklist.
