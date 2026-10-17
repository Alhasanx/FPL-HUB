# Weekly source update (runs every gameweek)

Goal: refresh `data/creators.json` and `data/sites.json` for the NEXT gameweek, using only these sources.

## Sources (only these)
- YouTube: FPL Harry, Let's Talk FPL, FPL Raptor, FPL Mate. Use each channel's latest GW team-selection / preview video.
- Sites: Fantasy Football Scout, AllAboutFPL, Fantasy Football Hub (public pages only).
- Never invent. If a video or article does not say something, leave the field empty (`[]` or `null`). The site shows that as "not mentioned" / TBC.

## Steps
1. Find the next gameweek number and deadline from the official FPL API (`/api/fpl?path=bootstrap-static/` on the deployed site, `is_next` event).
2. For each creator, find their newest video for that gameweek. If none yet, keep their previous entry but do NOT change `gw` for the file until at least one creator has posted.
3. From the video (description, chapters, transcript if available) fill the 4 fixed cards:
   - `buys`: players he recommends + one-line why (+ timestamp `t` if known)
   - `avoids`: players he says to avoid + why
   - `moves`: chip played (`wildcard`/`freehit`/`benchboost`/`triplecaptain` or null), short note, and `transfers` [{out:{player}, in:{player}}] if shown
   - `squad`: XI, captain, vice, bench as shown on screen
   - `extra`: anything useful outside those 4 (optional)
4. For sites, add one `items` row per player per source: `type` pick/avoid, `player`, `team` (3-letter FPL code), `source`, `why`, `url`.
5. Set `gw` to the next gameweek and `updated` to today's date (YYYY-MM-DD) in both files.
6. Validate JSON (`node -e "JSON.parse(require('fs').readFileSync('data/creators.json'))"`), commit to `main` with message `Sources: GW<n>`, push. Vercel redeploys automatically.

Players are matched to the FPL API by web name + team, so use the name as FPL shows it (e.g. "B.Fernandes", "João Pedro") and the club code.
