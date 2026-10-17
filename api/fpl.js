// Proxy to the official FPL API. Retries, browser-like headers, and long stale caching
// so the site keeps working while FPL is "being updated" on matchdays.
export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const HEADERS = [
  { 'User-Agent': 'Mozilla/5.0 (fpl-consensus-hub proxy)' },
  { 'User-Agent': UA, 'Accept': 'application/json' }
];
async function get(url, ms, i) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { signal: ctl.signal, headers: HEADERS[i % HEADERS.length] }); }
  finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  const path = String(req.query.path || 'bootstrap-static/');
  if (!/^[a-zA-Z0-9/_?=&.-]+$/.test(path)) return res.status(400).json({ error: 'invalid path' });
  const url = 'https://fantasy.premierleague.com/api/' + path;
  const personal = path.startsWith('entry/');
  let last = '';
  for (let i = 0; i < 4; i++) {
    try {
      const r = await get(url, 9000, i);
      const body = await r.text();
      if (r.ok && body.trim().startsWith('{') || r.ok && body.trim().startsWith('[')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        // CDN keeps a good copy and serves it if FPL is down or updating
        const cdn = personal ? 's-maxage=30, stale-while-revalidate=300, stale-if-error=3600' : 's-maxage=120, stale-while-revalidate=86400, stale-if-error=86400';
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.setHeader('CDN-Cache-Control', cdn);
        res.setHeader('Vercel-CDN-Cache-Control', cdn);
        return res.status(200).send(body);
      }
      if (r.status === 404) return res.status(404).json({ error: 'not found' });
      last = 'upstream ' + r.status;
    } catch (e) { last = String(e && e.name === 'AbortError' ? 'timeout' : e); }
    await new Promise(s => setTimeout(s, 400 * (i + 1)));
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({ error: 'FPL API unavailable', detail: last });
}
