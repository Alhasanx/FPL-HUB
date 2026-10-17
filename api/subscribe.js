import { subscriptions, isValid, parseBody } from '../lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  if (req.method === 'POST') {
    let sub; try { sub = parseBody(req); } catch (_) { sub = null; }
    if (!isValid(sub)) return res.status(400).json({ error: 'Invalid subscription' });
    const active = subscriptions().some(s => s.endpoint === sub.endpoint);
    if (!active) console.log('PUSH_SUBSCRIPTION ' + JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }));
    return res.status(200).json({ ok: true, active });
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
