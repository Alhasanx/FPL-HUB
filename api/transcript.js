// Plain-text transcript of one YouTube video, for the weekly source update.
// YouTube blocks servers from reading captions, so this goes through Supadata (SUPADATA_API_KEY).
// Auth: ?key=<CRON_SECRET>. Params: v (YouTube video id). mode=native reads existing captions only,
// so it costs 1 credit per video and never starts paid AI generation.
export const config = { maxDuration: 30 };

const stamp = ms => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query.key !== secret) return res.status(401).json({ error: 'Unauthorized' });
  const v = String(req.query.v || '');
  if (!/^[\w-]{11}$/.test(v)) return res.status(400).json({ error: 'Bad video id' });
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'SUPADATA_API_KEY is not set' });

  const url = `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + v)}&lang=en&mode=native&chunkSize=800`;
  try {
    const r = await fetch(url, { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(25000) });
    const body = await r.json().catch(() => ({}));
    if (r.status !== 200 || !Array.isArray(body.content)) {
      return res.status(502).json({ error: 'transcript unavailable', status: r.status, detail: body.error || body.message || (body.jobId ? 'async job' : null) });
    }
    const text = body.content.map(c => `[${stamp(c.offset)}] ${c.text}`).join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ error: 'transcript unavailable', detail: String(e.message || e) });
  }
}
