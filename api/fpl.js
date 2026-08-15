export default async function handler(req, res) {
  const path = (req.query.path || 'bootstrap-static/').toString();
  if (!/^[a-zA-Z0-9/_?=&.-]+$/.test(path)) {
    res.status(400).json({ error: 'invalid path' });
    return;
  }
  try {
    const upstream = await fetch('https://fantasy.premierleague.com/api/' + path, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Referer': 'https://fantasy.premierleague.com/'
      }
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
