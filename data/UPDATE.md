# Source update (fast path)

Only `data/creators.json` and `data/sites.json` need updating. Everything else on the site
(players, scores, captain, fixtures, injuries) comes live from the FPL API and never needs a manual update.

Target: finish in under 10 minutes, no questions to Alhasan. Make independent calls in parallel.

## Sources (only these)
- YouTube: FPL Harry, Let's Talk FPL, FPL Raptor, FPL Mate.
- Sites: Fantasy Football Scout, AllAboutFPL, Fantasy Football Hub (public pages only).
- Never invent. If a source doesn't say it, leave the field empty (`[]` / `null`); the site shows "not mentioned".

## 1. Next gameweek (1 call)
`mcp__Vercel__web_fetch_vercel_url` on `https://fpl-hub-eight.vercel.app/api/fpl?path=bootstrap-static/`.
The result is large and gets saved to a file: parse its `text` field as JSON and save it as `boot.json`.
Next GW = the event with `is_next: true` (or the first event whose `deadline_time` is in the future).

## 2. Creators' videos (1 call)
`mcp__Vercel__web_fetch_vercel_url` on
`https://fpl-hub-eight.vercel.app/api/sources?key=<KEY>&gw=<next gw>&n=6`
It returns each creator's newest videos (title, date, URL, full description with chapters) and, when
YouTube allows it, the transcript (`transcript.ok`). Videos about that GW have `matchesGw: true`.

For each creator pick ONE video for the GW, in this order: team selection / "my team" video >
final thoughts / complete guide > anything else that isn't a Short or a live stream. Use a live
stream only if it is the only one.

If that video's URL is already in `data/creators.json` for that creator, keep the entry as is.
If NO creator has a new GW video and the sites already show this GW, stop and change nothing.

From the title, description, chapters and transcript (if present) fill the fixed cards:
- `buys` [{player, team, why, t}], `avoids` [...], `moves` {chip, note, transfers:[{out:{player,team}, in:{player,team}}]},
  `squad` {xi:[{player,team}], captain, vice, bench}, `extra` [{topic, text, t}].
- No transcript: use only what the title/description/chapters state (e.g. "BUY DE CUYPER & GROß?" is a
  question, not a recommendation; a chapter "Players to Buy" without names gives no names). Leave the rest empty.
- Set `video` {title, url, date}. Keep `id`, `name`, `tone` unchanged.

## 3. Sites (max 2 searches + 2 fetches per site, in parallel)
Search `site:fantasyfootballscout.co.uk Gameweek <n>`, `site:allaboutfpl.com Gameweek <n>`,
`site:fantasyfootballhub.co.uk Gameweek <n>`; open the captain / best picks / team reveal article.
One `items` row per player per source: {type: pick|avoid, player, team (3-letter FPL code), source, why, url}.

## 4. Save, check, publish
- Set `gw` = next GW and `updated` = today (YYYY-MM-DD) in both files (creators `gw` only if at least one creator has a GW video).
- Use player names as FPL shows them (`web_name`, e.g. "B.Fernandes", "João Pedro") with the club code.
- Run `node scripts/check.js boot.json` — fix every UNMATCHED name (look it up in boot.json) until it passes.
- Commit to `main` with message `Sources: GW<n>` and push. Vercel redeploys by itself in ~30 s; no approval needed.
- Final reply: short Kuwaiti-Arabic summary per creator (which video, what was filled, what stayed empty) and per site.
