// Push subscriptions live in the PUSH_SUBSCRIPTIONS env var (a JSON array).
// A new phone is logged by /api/subscribe and then added to that variable.
export function subscriptions() {
  try { const l = JSON.parse(process.env.PUSH_SUBSCRIPTIONS || '[]'); return Array.isArray(l) ? l : []; } catch (_) { return []; }
}
export const isValid = s => !!(s && typeof s.endpoint === 'string' && s.keys && s.keys.p256dh && s.keys.auth);
export const parseBody = req => !req.body ? {} : (typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
