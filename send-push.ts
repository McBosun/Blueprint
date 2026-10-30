// Supabase Edge Function "send-push": sends phone alerts (Web Push).
// Called by the database (with the x-webhook-secret header) when a notification or message is created,
// and by the app's "Send a test alert" button (with the signed-in user's token).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC')!, Deno.env.get('VAPID_PRIVATE')!);
const admin = createClient(URL_, SERVICE);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Content-Type': 'application/json'
};
const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

async function nameOf(id: string | null) {
  if (!id) return 'Someone';
  const { data } = await admin.from('bp_profiles').select('username').eq('id', id).maybeSingle();
  return data ? '@' + data.username : 'Someone';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply({ ok: true });
  const body = await req.json().catch(() => ({}));
  let userId: string, payload: { title: string; body: string; url: string; tag?: string };

  if (req.headers.get('x-webhook-secret') && req.headers.get('x-webhook-secret') === Deno.env.get('PUSH_SECRET')) {
    // From the database
    const r = body.record || {};
    if (body.table === 'bp_messages') {
      userId = r.recipient_id;
      const { data: pr } = await admin.from('bp_notif_prefs').select('msg_preview').eq('user_id', userId).maybeSingle();
      const who = await nameOf(r.sender_id);
      payload = { title: who, body: pr?.msg_preview ? String(r.body || '').slice(0, 120) : 'Sent you a message', url: './#m-' + r.sender_id, tag: 'msg-' + r.sender_id };
    } else {
      userId = r.user_id;
      const who = await nameOf(r.actor_id);
      const t = r.type;
      if (t === 'like') payload = { title: 'Blueprint', body: who + ' liked your post', url: './#p-' + r.video_id, tag: 'like-' + r.video_id };
      else if (t === 'comment') payload = { title: 'Blueprint', body: who + ' commented: ' + String(r.body || '').slice(0, 80), url: './#p-' + r.video_id };
      else if (t === 'follow') payload = { title: 'Blueprint', body: who + ' started following you', url: './#' + who };
      else if (t === 'view') payload = { title: 'Blueprint', body: who + ' viewed your profile', url: './#' + who, tag: 'view-' + r.actor_id };
      else if (t === 'live') payload = { title: who + ' is live', body: String(r.body || 'Tap to watch'), url: './#l-' + r.live_id, tag: 'live-' + r.live_id };
      else return reply({ sent: 0 });
    }
  } else {
    // From the app: a test alert for the signed-in person
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
    const { data } = await createClient(URL_, ANON).auth.getUser(token);
    if (!data?.user) return reply({ error: 'Not signed in' }, 401);
    userId = data.user.id;
    payload = { title: 'Blueprint', body: 'Phone alerts are working. 🎉', url: './', tag: 'test' };
  }

  const { data: subs } = await admin.from('bp_push_subs').select('id,endpoint,p256dh,auth').eq('user_id', userId);
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('bp_push_subs').delete().eq('id', s.id); // phone unsubscribed
    }
  }
  return reply({ sent });
});
