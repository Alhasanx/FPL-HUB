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

/* captions: try the mobile player API first (less often bot-checked), then the watch page */
async function captionTracks(videoId) {
  const tries = [];
  for (const client of [
    { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip' },
    { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)' },
    { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0' }
  ]) {
    try {
      const r = await get('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', 10000, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(client.userAgent ? { 'User-Agent': client.userAgent } : {}) }, body: JSON.stringify({ videoId, context: { client: { hl: 'en', gl: 'GB', ...client } } }) });
      const j = await r.json();
      const t = j && j.captions && j.captions.playerCaptionsTracklistRenderer && j.captions.playerCaptionsTracklistRenderer.captionTracks;
      tries.push(client.clientName + ':' + (j && j.playabilityStatus && j.playabilityStatus.status));
      if (t && t.length) return { tracks: t, via: client.clientName };
    } catch (e) { tries.push(client.clientName + ':err'); }
  }
  const html = await (await get(`https://www.youtube.com/watch?v=${videoId}&hl=en`, 12000)).text();
  const m = /"captionTracks":(\[.*?\])/.exec(html);
  if (m) return { tracks: JSON.parse(m[1]), via: 'web' };
  return { tracks: null, why: (/confirm you.re not a bot/i.test(html) ? 'blocked' : 'no captions') + ' · ' + tries.join(',') };
}
/* Invidious mirrors serve YouTube's own caption files (same words as the video), without YouTube's bot check */
const INVIDIOUS = ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de', 'https://invidious.f5.si'];
const sec = t => { const p = t.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
const stamp = x => `${Math.floor(x / 60)}:${String(Math.floor(x) % 60).padStart(2, '0')}`;
function vttToText(vtt) {
  const out = []; let last = '', lastT = -99;
  for (const block of vtt.split(/\n\n+/)) {
    const m = /(\d{1,2}:\d{2}(?::\d{2})?)\.\d{3}\s+-->/.exec(block);
    if (!m) continue;
    const lines = block.split('\n').slice(block.split('\n').findIndex(l => l.includes('-->')) + 1)
      .map(l => decode(l.replace(/<[^>]+>/g, '')).trim()).filter(Boolean);
    for (const l of lines) {
      if (l === last) continue;                 /* auto-captions repeat each line twice */
      const t = sec(m[1]);
      if (out.length && t - lastT < 20) out[out.length - 1] += ' ' + l; else { out.push(`[${stamp(t)}] ${l}`); lastT = t; }
      last = l;
    }
  }
  return out.join('\n');
}
async function viaInvidious(videoId) {
  const errs = [];
  for (const base of INVIDIOUS) {
    try {
      const list = await (await get(`${base}/api/v1/captions/${videoId}`, 9000)).json();
      const caps = (list && list.captions) || [];
      const c = caps.find(x => /^en/.test(x.languageCode) && !/auto/i.test(x.label)) || caps.find(x => /^en/.test(x.languageCode));
      if (!c) { errs.push(base.slice(8) + ':no en'); continue; }
      const vtt = await (await get(base + c.url, 15000)).text();
      const text = vttToText(vtt);
      if (text.length > 200) return { ok: true, via: 'invidious ' + base.slice(8), lang: c.languageCode, auto: /auto/i.test(c.label), text: text.slice(0, 80000) };
      errs.push(base.slice(8) + ':empty');
    } catch (e) { errs.push(base.slice(8) + ':' + (e.name === 'TimeoutError' ? 'timeout' : 'err')); }
  }
  return { ok: false, why: errs.join(',') };
}
async function transcript(videoId) {
  const inv = await viaInvidious(videoId);
  if (inv.ok) return inv;
  try {
    const ct = await captionTracks(videoId);
    if (!ct.tracks) return { ok: false, why: inv.why + ' · ' + ct.why };
    const tracks = ct.tracks;
    const t = tracks.find(x => /^en/.test(x.languageCode) && x.kind !== 'asr') || tracks.find(x => /^en/.test(x.languageCode)) || tracks[0];
    const raw = await (await get(t.baseUrl.replace(/\\u0026/g, '&').replace(/&fmt=[^&]*/, '') + '&fmt=json3', 12000)).text();
    if (!raw.trim()) return { ok: false, why: 'empty caption file (' + ct.via + ')' };
    const j = JSON.parse(raw);
    const parts = [];
    for (const ev of j.events || []) {
      if (!ev.segs) continue;
      const txt = ev.segs.map(s => s.utf8).join('').replace(/\s+/g, ' ').trim();
      if (txt) parts.push(`[${Math.floor(ev.tStartMs / 60000)}:${String(Math.floor(ev.tStartMs / 1000) % 60).padStart(2, '0')}] ${txt}`);
    }
    return { ok: parts.length > 0, via: ct.via, lang: t.languageCode, auto: t.kind === 'asr', text: parts.join('\n').slice(0, 60000) };
  } catch (e) { return { ok: false, why: String(e.message || e) }; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query.key !== secret) return res.status(401).json({ error: 'Unauthorized' });
  if (req.query.raw) { const r = await get(`https://inv.nadeko.net/api/v1/captions/${req.query.raw}?label=English+%28auto-generated%29`, 15000); const t = await r.text(); return res.status(200).json({ status: r.status, len: t.length, head: t.slice(0, 1500) }); }
  if (req.query.video) return res.status(200).json(await transcript(String(req.query.video).slice(0, 20)));
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
