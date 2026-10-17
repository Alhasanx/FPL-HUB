// One-call research feed for the weekly source update.
// Fetches the 4 creators' newest videos (YouTube RSS) and, for each video that
// matches the requested gameweek, its description, chapters and a transcript link. The update task reads this instead of hunting videos itself.
// Auth: ?key=<CRON_SECRET>. Params: gw (gameweek number), n (videos per channel, default 4).
export const config = { maxDuration: 30 };

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
      /* YouTube blocks servers from reading captions; the update task reads them through youtubetotranscript.com */
      want.forEach(v => { v.matchesGw = true; v.transcriptUrl = `https://youtubetotranscript.com/transcript?v=${v.videoId}`; });
      return { ...ch, videos: vids };
    } catch (e) { return { ...ch, error: String(e.message || e), videos: [] }; }
  }));
  return res.status(200).json({ gw, fetchedAt: new Date().toISOString(), creators: out });
}
