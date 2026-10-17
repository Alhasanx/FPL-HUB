/* FPL Consensus Hub · engine
   Every number on the site is computed here from the official FPL API
   (bootstrap-static + fixtures) and the two source files (creators.json, sites.json).
   Pure functions, no DOM. Works for every player in the game. */
(function (root) {
  const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const num = v => (v == null || v === '' || isNaN(+v)) ? 0 : +v;

  /* percentile rank of value inside a sorted array (0..1) */
  function pct(sorted, v) {
    if (!sorted.length) return 0;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
    return lo / sorted.length;
  }

  /* gameweek context */
  function gwInfo(boot) {
    const ev = boot.events || [];
    const next = ev.find(e => e.is_next) || null;
    const cur = ev.find(e => e.is_current) || null;
    const target = next || cur || ev[ev.length - 1];
    const finished = ev.filter(e => e.finished).length;
    const lastPicksGw = cur ? cur.id : (next ? next.id - 1 : target.id);
    return { gw: target.id, deadline: target.deadline_time, finished, current: cur ? cur.id : null, picksGw: Math.max(1, lastPicksGw) };
  }

  /* upcoming fixtures per team: [{gw, opp, home, fdr}] */
  function teamFixtures(fixtures, teamsById, fromGw) {
    const out = {};
    for (const f of fixtures) {
      if (f.finished || f.event == null || f.event < fromGw) continue;
      (out[f.team_h] = out[f.team_h] || []).push({ gw: f.event, opp: teamsById[f.team_a].short_name, home: true, fdr: f.team_h_difficulty, kickoff: f.kickoff_time });
      (out[f.team_a] = out[f.team_a] || []).push({ gw: f.event, opp: teamsById[f.team_h].short_name, home: false, fdr: f.team_a_difficulty, kickoff: f.kickoff_time });
    }
    for (const k in out) out[k].sort((a, b) => a.gw - b.gw || String(a.kickoff).localeCompare(String(b.kickoff)));
    return out;
  }

  /* map source rows {player, team} onto FPL element ids */
  function resolver(elements, teamsById) {
    const byKey = new Map();
    for (const e of elements) {
      const t = teamsById[e.team].short_name;
      const keys = [norm(e.web_name), norm(e.second_name), norm(e.first_name + e.second_name)];
      for (const k of keys) { if (!k) continue; const a = byKey.get(k) || []; a.push({ e, t }); byKey.set(k, a); }
    }
    return function (name, team) {
      const n = norm(name); let c = byKey.get(n) || [];
      if (!c.length) { for (const [k, v] of byKey) if (k.length > 3 && (k.endsWith(n) || n.endsWith(k))) c = c.concat(v); }
      if (team) { const f = c.filter(x => x.t === team); if (f.length) c = f; }
      if (!c.length) return null;
      c.sort((a, b) => num(b.e.selected_by_percent) - num(a.e.selected_by_percent));
      return c[0].e;
    };
  }

  /* who backs / warns about each player this GW */
  function sourceIndex(creators, sites, resolve) {
    const idx = {};
    const add = (id, kind, src) => { if (!id) return; const r = idx[id] = idx[id] || { creatorsBuy: [], creatorsAvoid: [], sitesPick: [], sitesAvoid: [], whys: [] }; r[kind].push(src.name); if (src.why) r.whys.push({ text: src.why, by: src.name, good: kind === 'creatorsBuy' || kind === 'sitesPick' }); };
    for (const c of (creators && creators.creators) || []) {
      for (const b of c.buys || []) { const e = resolve(b.player, b.team); add(e && e.id, 'creatorsBuy', { name: c.name, why: b.why }); }
      for (const a of c.avoids || []) { const e = resolve(a.player, a.team); add(e && e.id, 'creatorsAvoid', { name: c.name, why: a.why }); }
    }
    for (const s of (sites && sites.items) || []) {
      const e = resolve(s.player, s.team);
      add(e && e.id, s.type === 'avoid' ? 'sitesAvoid' : 'sitesPick', { name: s.source, why: s.why });
    }
    return idx;
  }

  /* main model */
  function build(boot, fixtures, creators, sites) {
    const teamsById = Object.fromEntries(boot.teams.map(t => [t.id, t]));
    const info = gwInfo(boot);
    const fx = teamFixtures(fixtures, teamsById, info.gw);
    const resolve = resolver(boot.elements, teamsById);
    const src = sourceIndex(creators, sites, resolve);
    const finished = Math.max(1, info.finished);

    const players = boot.elements.filter(e => e.status !== 'u').map(e => {
      const nextFx = fx[e.team] || [];
      const n3 = nextFx.slice(0, 3);
      const avgFdr = n3.length ? n3.reduce((a, f) => a + f.fdr, 0) / n3.length : 3;
      const chance = e.chance_of_playing_next_round == null ? 100 : num(e.chance_of_playing_next_round);
      const s = src[e.id] || { creatorsBuy: [], creatorsAvoid: [], sitesPick: [], sitesAvoid: [], whys: [] };
      return {
        id: e.id, name: e.web_name, full: `${e.first_name} ${e.second_name}`, pos: POS[e.element_type], team: teamsById[e.team].short_name, teamName: teamsById[e.team].name, teamId: e.team,
        price: e.now_cost / 10, own: num(e.selected_by_percent), form: num(e.form), xgi90: num(e.expected_goal_involvements_per_90),
        minutes: num(e.minutes), starts: num(e.starts), points: num(e.total_points), defcon90: num(e.defensive_contribution_per_90), cs90: num(e.clean_sheets_per_90), saves90: num(e.saves_per_90),
        status: e.status, news: e.news || '', chance, next: nextFx.slice(0, 5), avgFdr, src: s,
        ini: initials(e.web_name)
      };
    });

    /* position-relative percentiles, only among players who have actually played */
    const byPos = {};
    for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
    for (const pos in byPos) {
      const pool = byPos[pos].filter(p => p.minutes > 0);
      const sForm = pool.map(p => p.form).sort((a, b) => a - b);
      const sThreat = pool.map(p => p.xgi90).sort((a, b) => a - b);
      const sDef = pool.map(p => p.defcon90).sort((a, b) => a - b);
      const sCs = pool.map(p => p.cs90).sort((a, b) => a - b);
      const sSv = pool.map(p => p.saves90).sort((a, b) => a - b);
      for (const p of byPos[pos]) {
        const played = p.minutes > 0;
        p.pForm = played ? pct(sForm, p.form) : 0;
        p.pDef = played ? pct(sDef, p.defcon90) : 0;
        const pX = played ? pct(sThreat, p.xgi90) : 0;
        /* "threat" means what earns points in that position */
        if (pos === 'GK') p.pThreat = played ? 0.6 * pct(sCs, p.cs90) + 0.4 * pct(sSv, p.saves90) : 0;
        else if (pos === 'DEF') p.pThreat = played ? 0.5 * pX + 0.5 * p.pDef : 0;
        else p.pThreat = pX;
        p.pX = pX;
        p.threatLabel = pos === 'GK' ? 'Clean sheets & saves /90' : pos === 'DEF' ? 'xGI & defcon /90' : 'Threat · xGI per 90';
      }
    }

    /* captaincy compares everyone against everyone, not within position */
    const allPlayed = players.filter(p => p.minutes >= 90);
    const gThreat = allPlayed.map(p => p.xgi90).sort((a, b) => a - b);
    const gForm = allPlayed.map(p => p.form).sort((a, b) => a - b);
    for (const p of players) {
      const fitness = p.status === 'a' ? 1 : (p.status === 'd' ? p.chance / 100 : 0);
      const startRate = clamp01(p.starts / finished);
      const backers = p.src.creatorsBuy.length;
      const f = {
        form: Math.round(20 * p.pForm),
        threat: Math.round(20 * p.pThreat),
        fixtures: Math.round(15 * clamp01((5 - p.avgFdr) / 3)),
        minutes: Math.round(15 * startRate * (p.chance / 100)),
        fitness: Math.round(10 * fitness),
        creators: Math.min(20, backers * 5)
      };
      p.f = f;
      p.ai = Math.min(100, f.form + f.threat + f.fixtures + f.minutes + f.fitness + f.creators);
      const nf = p.next[0];
      const opp = nf ? (0.8 * clamp01((5 - nf.fdr) / 3) + (nf.home ? 0.2 : 0)) : 0;
      const gT = p.minutes >= 90 ? pct(gThreat, p.xgi90) : 0, gF = p.minutes >= 90 ? pct(gForm, p.form) : 0;
      p.cap = nf ? Math.round(40 * gT + 25 * gF + 25 * opp + 10 * startRate * fitness) : 0;
    }

    for (const pos in byPos) byPos[pos].slice().sort((a, b) => b.ai - a.ai).forEach((p, i) => { p.rank = i + 1; });
    players.slice().sort((a, b) => b.cap - a.cap).forEach((p, i) => { p.capRank = i + 1; });

    /* rule-based reasons (max 3), every line tagged with its source */
    for (const p of players) {
      const r = [];
      const posName = { GK: 'keepers', DEF: 'defenders', MID: 'midfielders', FWD: 'forwards' }[p.pos];
      const top5 = q => Math.ceil((byPos[p.pos].filter(x => x.minutes > 0).length || 1) * (1 - q)) <= 5;
      if (p.minutes > 0 && p.pos !== 'GK' && top5(p.pX)) r.push({ good: true, text: `Top 5 ${posName} for xGI per 90`, by: 'FPL API' });
      if (p.minutes > 0 && p.pos !== 'FWD' && p.pos !== 'GK' && top5(p.pDef)) r.push({ good: true, text: `Top 5 ${posName} for defensive contributions per 90`, by: 'FPL API' });
      if (p.src.creatorsBuy.length) r.push({ good: true, text: `Backed by ${listNames(p.src.creatorsBuy)}`, by: 'Creators' });
      if (p.src.sitesPick.length) { const w = p.src.whys.find(x => x.good && p.src.sitesPick.includes(x.by)); r.push({ good: true, text: w ? w.text : `Recommended by ${listNames(p.src.sitesPick)}`, by: listNames(p.src.sitesPick) }); }
      if (p.avgFdr <= 2.5 && p.next.length) r.push({ good: true, text: 'Kind run: next 3 fixtures average FDR ' + p.avgFdr.toFixed(1), by: 'FPL API · FDR' });
      if (p.status !== 'a' && p.news) r.push({ good: false, text: p.news, by: 'FPL API · news' });
      if (p.next[0] && p.next[0].fdr >= 4) r.push({ good: false, text: `${p.next[0].home ? 'Home to' : 'Away at'} ${p.next[0].opp} is a hard fixture`, by: 'FPL API · FDR ' + p.next[0].fdr });
      for (const n of p.src.creatorsAvoid) r.push({ good: false, text: `${n} is avoiding him this week`, by: 'Creators' });
      for (const n of p.src.sitesAvoid) { const w = p.src.whys.find(x => !x.good && x.by === n); r.push({ good: false, text: w ? w.text : `${n} says avoid`, by: n }); }
      const goods = r.filter(x => x.good), bads = r.filter(x => !x.good);
      p.reasons = goods.slice(0, bads.length ? 2 : 3).concat(bads.slice(0, 1));
      p.verdict = verdict(p);
    }

    return { info, teamsById, players, byId: Object.fromEntries(players.map(p => [p.id, p])), resolve, fx };
  }

  function initials(n) { const w = String(n).replace(/[^A-Za-zÀ-ÿ ]/g, ' ').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || n).slice(0, 2)).toUpperCase(); }
  function listNames(a) { const u = [...new Set(a)]; return u.length <= 2 ? u.join(' and ') : u.slice(0, -1).join(', ') + ' and ' + u[u.length - 1]; }

  function verdict(p) {
    if (p.status === 'i' || p.status === 's' || p.status === 'n') return { good: false, text: 'Unavailable right now' };
    if (p.status === 'd') return { good: false, text: `Doubtful: ${p.chance}% chance to play` };
    if (p.capRank <= 3) return { good: true, text: 'Top captain pick this week' };
    if (p.rank <= 5 && p.own < 10) return { good: true, text: 'Strong differential' };
    if (p.rank <= 5) return { good: true, text: `Top 5 ${p.pos} by AI score` };
    if (p.ai >= 60) return { good: true, text: 'Solid option' };
    if (p.ai >= 45) return { good: true, text: 'Fine, but there are better options' };
    return { good: false, text: 'Low score this week' };
  }

  /* Picks by position: named by sources this GW, ranked by number of sources, skip owned >= 35% */
  function picksByPosition(model, maxOwn = 35, perPos = 2) {
    const out = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of model.players) {
      const names = [...new Set([...p.src.creatorsBuy, ...p.src.sitesPick])];
      if (!names.length || p.own >= maxOwn) continue;
      const why = (p.src.whys.find(w => w.good) || {}).text || '';
      out[p.pos].push({ p, names, why });
    }
    for (const k in out) out[k] = out[k].sort((a, b) => b.names.length - a.names.length || b.p.ai - a.p.ai).slice(0, perPos);
    return out;
  }

  function captainTop(model, n = 3) { return model.players.filter(p => p.next.length).sort((a, b) => b.cap - a.cap).slice(0, n); }

  /* Team check from a manager's picks */
  function teamCheck(model, picksRes) {
    const picks = picksRes.picks || [];
    const xi = picks.filter(x => x.position <= 11).map(x => ({ ...x, p: model.byId[x.element] })).filter(x => x.p);
    const bench = picks.filter(x => x.position > 11).map(x => model.byId[x.element]).filter(Boolean);
    const bank = num(picksRes.entry_history && picksRes.entry_history.bank) / 10;
    const squadIds = new Set(picks.map(x => x.element));
    const covered = xi.filter(x => x.p.minutes > 0);
    const score = covered.length ? Math.round(covered.reduce((a, x) => a + x.p.ai, 0) / covered.length) : 0;
    const backed = xi.filter(x => x.p.ai >= 60 || x.p.src.creatorsBuy.length || x.p.src.sitesPick.length).length;
    const cap = xi.find(x => x.is_captain);
    const topCaps = captainTop(model, 3).map(p => p.id);
    const clubCount = {};
    for (const x of picks) { const p = model.byId[x.element]; if (p) clubCount[p.teamId] = (clubCount[p.teamId] || 0) + 1; }
    const swaps = [];
    for (const x of xi) {
      const out = x.p, budget = out.price + bank;
      let best = null;
      for (const c of model.players) {
        if (c.pos !== out.pos || squadIds.has(c.id) || c.price > budget + 1e-9 || c.status !== 'a') continue;
        const clubs = (clubCount[c.teamId] || 0) - (c.teamId === out.teamId ? 1 : 0);
        if (clubs >= 3) continue;
        if (!best || c.ai > best.ai) best = c;
      }
      if (best && best.ai - out.ai >= 8) swaps.push({ out, in: best, delta: best.ai - out.ai, money: Math.round((out.price - best.price) * 10) / 10 });
    }
    swaps.sort((a, b) => b.delta - a.delta);
    return { xi, bench, bank, score, coveredN: covered.length, backed, captain: cap ? cap.p : null, captainGood: cap ? topCaps.includes(cap.p.id) : false, swaps: swaps.slice(0, 3) };
  }

  /* creators summaries */
  function creatorsView(model, creators) {
    const list = (creators && creators.creators) || [];
    const res = n => n && model.resolve(n.player || n, n.team);
    const agree = {};
    for (const c of list) for (const b of c.buys || []) { const e = res(b); if (!e) continue; (agree[e.id] = agree[e.id] || { p: model.byId[e.id], by: [] }).by.push(c.id); }
    const agreeList = Object.values(agree).filter(a => a.p).sort((a, b) => b.by.length - a.by.length).slice(0, 4);
    const captains = list.map(c => ({ id: c.id, name: c.name, captain: c.squad && c.squad.captain ? c.squad.captain : null }));
    const splits = [];
    for (const c of list) for (const a of c.avoids || []) { const e = res(a); if (!e || !agree[e.id]) continue; splits.push({ p: model.byId[e.id], against: [c.id], for: agree[e.id].by, whyAgainst: a.why }); }
    return { list, agreeList, captains, splits, gw: creators && creators.gw, updated: creators && creators.updated };
  }

  root.Engine = { build, picksByPosition, captainTop, teamCheck, creatorsView, gwInfo, norm };
})(typeof window !== 'undefined' ? window : globalThis);
