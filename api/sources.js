// One-call research feed for the weekly source update.
// Fetches the 4 creators' newest videos (YouTube RSS) and, for each video that
// matches the requested gameweek, its description and transcript when YouTube
// exposes captions. The update task reads this instead of hunting videos itself.
// Auth: ?key=<CRON_SECRET>. Params: gw (gameweek number), n (videos per channel, default 4).
export const config = { maxDuration: 60 };

const CHANNELS = [
  { id: 'FH', name: 'FPL Harry', channel: 'UCcPWnCj5AKC19HaySZjb25g' },
  { id: 'LT', name: "Let's Talk FPL", channel: 'UCxeOc7eFxq37yW_Nc-69deA' },
  { id: 'FR', name: 'FPL Raptor', channel: 'UC54QLWzsMifTRjNQ02z5pCw' },
  { id: 'FM', name: 'FPL Mate', channel: 'UCweDAlFm2LnVcOqaFU4_AGA' }
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', 'Cookie': 'CONSENT=YES+cb; SOCS=CAI' };

const get = (url, ms = 10000, extra = {}) => fetch(url, { headers: { ...H, ...extra.headers }, method: extra.method || 'GET', body: extra.body, signal: AbortSignal.timeout(ms) });
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const tag = (xml, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(xml); return m ? decode(m[1]) : ''; };

async function feed(ch, n) {
  const r = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channel}`);
  if (!r.ok) throw new Error('rss ' + r.status);
  const xml = await r.text();
  return xml.split('<entry>').slice(1, n + 1).map(e => ({
    videoId: tag(e, 'yt:videoId'),
    title: tag(e, 'title'),
    published: tag(e, 'published'),
    url: 'https://www.youtube.com/watch?v=' + tag(e, 'yt:videoId'),
    description: tag(e, 'media:description')
  }));
}

/* captions: watch page -> captionTracks -> json3 */
async function transcript(videoId) {
  try {
    const html = await (await get(`https://www.youtube.com/watch?v=${videoId}&hl=en`, 12000)).text();
    const m = /"captionTracks":(\[.*?\])/.exec(html);
    if (!m) return { ok: false, why: /confirm you.re not a bot|consent/i.test(html) ? 'blocked' : 'no captions' };
    const tracks = JSON.parse(m[1]);
    const t = tracks.find(x => /^en/.test(x.languageCode) && x.kind !== 'asr') || tracks.find(x => /^en/.test(x.languageCode)) || tracks[0];
    const j = await (await get(t.baseUrl.replace(/\\u0026/g, '&') + '&fmt=json3', 12000)).json();
    const parts = [];
    for (const ev of j.events || []) {
      if (!ev.segs) continue;
      const txt = ev.segs.map(s => s.utf8).join('').replace(/\s+/g, ' ').trim();
      if (txt) parts.push(`[${Math.floor(ev.tStartMs / 60000)}:${String(Math.floor(ev.tStartMs / 1000) % 60).padStart(2, '0')}] ${txt}`);
    }
    return { ok: parts.length > 0, lang: t.languageCode, auto: t.kind === 'asr', text: parts.join('\n').slice(0, 60000) };
  } catch (e) { return { ok: false, why: String(e.message || e) }; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query.key !== secret) return res.status(401).json({ error: 'Unauthorized' });
  const gw = parseInt(req.query.gw, 10) || null;
  const n = Math.min(8, Math.max(1, parseInt(req.query.n, 10) || 4));
  const gwRe = gw ? new RegExp(`\\b(GW|Gameweek|Game ?week)\\s*${gw}\\b`, 'i') : null;
  const out = await Promise.all(CHANNELS.map(async ch => {
    try {
      const vids = await feed(ch, n);
      /* transcripts only for videos about the requested GW (or the newest one if no gw given) */
      const want = vids.filter((v, i) => gwRe ? gwRe.test(v.title + ' ' + v.description.slice(0, 300)) : i === 0);
      await Promise.all(want.map(async v => { v.matchesGw = true; v.transcript = await transcript(v.videoId); }));
      return { ...ch, videos: vids };
    } catch (e) { return { ...ch, error: String(e.message || e), videos: [] }; }
  }));
  return res.status(200).json({ gw, fetchedAt: new Date().toISOString(), creators: out });
}
