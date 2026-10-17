// Deadline alert. Called every 5 minutes by cron-job.org.
// Sends exactly once: in the 5-minute slot that contains (deadline − 30 min).
// Auth: ?key=<CRON_SECRET>. Test: add &test=1 to send now.
import webpush from 'web-push';
import { subscriptions } from '../lib/store.js';
import '../engine.js';
import creators from '../data/creators.json';
import sites from '../data/sites.json';

const SLOT = 5 * 60 * 1000, LEAD = 30 * 60 * 1000;
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept': 'application/json' };

async function fpl(path) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch('https://fantasy.premierleague.com/api/' + path, { headers: H, signal: AbortSignal.timeout(9000) });
      if (r.ok) return await r.json();
    } catch (_) {}
    await new Promise(s => setTimeout(s, 500 * (i + 1)));
  }
  throw new Error('FPL unavailable: ' + path);
}

const KW = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

function message(boot, fixtures, ev) {
  let lines = [];
  try {
    const m = globalThis.Engine.build(boot, fixtures, creators, sites, null);
    const cap = m.players.slice().sort((a, b) => b.cap - a.cap).slice(0, 3);
    lines.push('Captain: ' + cap.map(p => `${p.name} ${p.cap}`).join(' · '));
    const flags = m.players.filter(p => p.own >= 15 && p.status !== 'a').sort((a, b) => b.own - a.own).slice(0, 3);
    if (flags.length) lines.push('⚠️ ' + flags.map(p => `${p.name} ${p.status === 'd' ? p.chance + '%' : 'out'}`).join(' · '));
  } catch (e) { console.error('engine', e); }
  return {
    title: `⏰ GW${ev.id} deadline in 30 min`,
    body: [`Deadline ${KW.format(new Date(ev.deadline_time))} (Kuwait)`].concat(lines).join('\n'),
    url: '/',
    tag: 'deadline-gw' + ev.id
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.query.key !== secret && req.headers.authorization !== `Bearer ${secret}`)) return res.status(401).json({ error: 'Unauthorized' });
  const test = req.query.test === '1';
  try {
    const boot = await fpl('bootstrap-static/');
    const now = Date.now();
    const ev = (boot.events || []).find(e => new Date(e.deadline_time).getTime() > now - 60000);
    if (!ev) return res.status(200).json({ ok: true, note: 'no upcoming deadline' });
    const target = new Date(ev.deadline_time).getTime() - LEAD;
    const slot = Math.floor(now / SLOT) * SLOT;
    const due = test || (target >= slot && target < slot + SLOT);
    const subs = subscriptions();
    if (!due) return res.status(200).json({ ok: true, gw: ev.id, sendAt: new Date(target).toISOString(), subscribers: subs.length, sent: 0 });
    const fixtures = await fpl('fixtures/?future=1').catch(() => []);
    const payload = message(boot, fixtures, ev);
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://fpl-hub-eight.vercel.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    let sent = 0; const gone = [];
    await Promise.all(subs.map(s => webpush.sendNotification(s, JSON.stringify(payload), { TTL: 1800, urgency: 'high' })
      .then(() => { sent++; })
      .catch(e => { if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint.slice(-12)); console.error('push', e.statusCode, e.body); })));
    return res.status(200).json({ ok: true, gw: ev.id, test, payload, subscribers: subs.length, sent, expired: gone });
  } catch (e) {
    return res.status(503).json({ error: String(e.message || e) });
  }
}
