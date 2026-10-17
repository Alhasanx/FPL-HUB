// Compact "last 4 gameweeks" feed built from the official FPL API
// (event/{gw}/live + fixtures/?event={gw}). Lets the model see recent minutes,
// who started, and recent xG/xA/defcon for every player in one small request.
export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HEADERS = [{ 'User-Agent': 'Mozilla/5.0 (fpl-consensus-hub proxy)' }, { 'User-Agent': UA, 'Accept': 'application/json' }];

async function getJson(path) {
  let last = '';
  for (let i = 0; i < 4; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch('https://fantasy.premierleague.com/api/' + path, { signal: ctl.signal, headers: HEADERS[i % 2] });
      const body = await r.text();
      if (r.ok && /^[\[{]/.test(body.trim())) return JSON.parse(body);
      last = 'upstream ' + r.status;
    } catch (e) { last = String(e && e.name === 'AbortError' ? 'timeout' : e); }
    finally { clearTimeout(t); }
    await new Promise(s => setTimeout(s, 400 * (i + 1)));
  }
  throw new Error(last);
}

export default async function handler(req, res) {
  const to = parseInt(req.query.to, 10);
  const n = Math.min(6, Math.max(1, parseInt(req.query.n, 10) || 4));
  if (!to || to < 1 || to > 38) return res.status(400).json({ error: 'bad gw' });
  const gws = []; for (let g = Math.max(1, to - n + 1); g <= to; g++) gws.push(g);
  try {
    const parts = await Promise.all(gws.map(g => Promise.all([getJson(`event/${g}/live/`), getJson(`fixtures/?event=${g}`)])));
    const p = {}, teamGames = {};
    parts.forEach(([live, fixtures], i) => {
      const tg = teamGames[gws[i]] = {};
      for (const f of fixtures) if (f.started || f.finished || f.finished_provisional) { tg[f.team_h] = (tg[f.team_h] || 0) + 1; tg[f.team_a] = (tg[f.team_a] || 0) + 1; }
      for (const e of live.elements || []) {
        const s = e.stats || {};
        if (!s.minutes) continue;
        (p[e.id] = p[e.id] || {})[gws[i]] = [s.minutes, s.starts || 0, +s.expected_goals || 0, +s.expected_assists || 0, s.defensive_contribution || 0, s.bonus || 0, s.goals_scored || 0, s.assists || 0];
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');
    const cdn = 's-maxage=300, stale-while-revalidate=86400, stale-if-error=86400';
    res.setHeader('CDN-Cache-Control', cdn);
    res.setHeader('Vercel-CDN-Cache-Control', cdn);
    return res.status(200).json({ gws, teamGames, fields: ['min', 'starts', 'xg', 'xa', 'dc', 'bonus', 'g', 'a'], p });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'FPL API unavailable', detail: String(e.message || e) });
  }
}
