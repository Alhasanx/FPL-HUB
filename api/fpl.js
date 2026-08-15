export default async function handler(req, res) {
  const path = (req.query.path || 'bootstrap-static/').toString();
  if (!/^[a-zA-Z0-9/_?=&.-]+$/.test(path)) {
    res.status(400).json({ error: 'invalid path' });
    return;
  }
  try {
    const upstream = await fetch('https://fantasy.premierleague.com/api/' + path, {
      headers: { 'User-Agent': 'Mozilla/5.0 (fpl-consensus-hub proxy)' }
    });
    const body = await upstream.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(upstream.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(e) });
  }
}
