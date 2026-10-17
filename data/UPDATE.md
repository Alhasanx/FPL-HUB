# Source update (fast path)

Only `data/creators.json` and `data/sites.json` need updating. Everything else on the site
(players, scores, captain, fixtures, injuries) comes live from the FPL API and never needs a manual update.

Target: finish in about 10 minutes, no questions to Alhasan. Make independent calls in parallel.

## Sources (only these)
- YouTube: FPL Harry, Let's Talk FPL, FPL Raptor, FPL Mate.
- Sites: Fantasy Football Scout, AllAboutFPL, Fantasy Football Hub (public pages only).
- Never invent. If a source doesn't say it, leave the field empty (`[]` / `null`); the site shows "not mentioned".

## 1. Next gameweek (1 call)
`mcp__Vercel__web_fetch_vercel_url` on `https://fpl-hub-eight.vercel.app/api/fpl?path=bootstrap-static/`.
The result is large and gets saved to a file: parse its `text` field as JSON and save it as `boot.json`.
Next GW = the event with `is_next: true` (or the first event whose `deadline_time` is in the future).

## 2. Creators' videos — what they actually SAY (most important part)
a) `mcp__Vercel__web_fetch_vercel_url` on
`https://fpl-hub-eight.vercel.app/api/sources?key=<KEY>&gw=<next gw>&n=6`
It returns each creator's newest videos (title, date, URL, description with chapters). Videos about that GW
have `matchesGw: true` and a `transcriptUrl`.

b) For each creator pick ONE video for the GW, in this order: team selection / "my team" video >
final thoughts / complete guide > anything else that isn't a Short. Use a live stream only if it is the only one.
If that video's URL is already in `data/creators.json` for that creator, keep the entry as is.
If NO creator has a video for the next GW yet (normal early in the week), use the latest GW that has videos
(next GW − 1) instead, so the site is never empty — the site labels it "from GW<n> sources". Do the same for the sites.
Stop and change nothing only when the files already hold the newest GW that has content.

c) Read what he says: call **WebFetch on the video's `transcriptUrl`** (all 4 creators in parallel) with this prompt:
"This is the transcript of <creator>'s FPL GW<n> video. Extract, as a structured list: (1) players he recommends
buying and why, (2) players he says to avoid/sell and why, (3) his own transfers and any chip, (4) his captain and
vice-captain, (5) his starting XI and bench, (6) anything else notable (price changes, injuries, plans).
Only what he actually says; write 'not stated' otherwise. Include approximate timestamps if shown."
If the result is cut short, call WebFetch again with the `offset` it gives to read the rest.
Transcripts are auto-captions: names come out misspelled ("Harland" = Haaland, "Calipuri" = Calafiori,
"Diper" = De Cuyper). Map every name to the real FPL player using boot.json (web_name + team).
If the transcript page fails, fall back to the title/description/chapters only and leave the rest empty.

d) Fill the fixed cards from that:
- `buys` [{player, team, why, t}], `avoids` [...], `moves` {chip, note, transfers:[{out:{player,team}, in:{player,team}}]},
  `squad` {xi:[{player,team}], captain, vice, bench}, `extra` [{topic, text, t}] (max 3, the most useful).
- `why` = his reason in one short line, in your own words. Leave empty what he didn't say.
- Set `video` {title, url, date}. Keep `id`, `name`, `tone` unchanged.

## 3. Sites (max 2 searches + 2 fetches per site, in parallel)
Search `site:fantasyfootballscout.co.uk Gameweek <n>`, `site:allaboutfpl.com Gameweek <n>`,
`site:fantasyfootballhub.co.uk Gameweek <n>`; open the captain / best picks / team reveal article.
One `items` row per player per source: {type: pick|avoid, player, team (3-letter FPL code), source, why, url}.
Every row needs the article's own reason in `why` (one short line) and the article `url`. If an article only lists
names with no reason (paywall, team graphic), write what it factually is, e.g. "In Scout's GW<n> Scout Picks XI" —
never leave `why` empty, never invent a reason, never list a player twice for the same source.

## 4. Save, check, publish
- Set `gw` = the GW the content is for (next GW, or next GW − 1 if that's what you used) and `updated` = today (YYYY-MM-DD).
- Use player names as FPL shows them (`web_name`, e.g. "B.Fernandes", "João Pedro") with the club code.
- Run `node scripts/check.js boot.json` — fix every UNMATCHED name (look it up in boot.json) until it passes.
- Commit to `main` with message `Sources: GW<n>` and push. Vercel redeploys by itself in ~30 s; no approval needed.
- Final reply: short Kuwaiti-Arabic summary per creator (which video, what was filled, what stayed empty) and per site.
