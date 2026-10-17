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
  function build(boot, fixtures, creators, sites, recent) {
    const teamsById = Object.fromEntries(boot.teams.map(t => [t.id, t]));
    const info = gwInfo(boot);
    const fx = teamFixtures(fixtures, teamsById, info.gw);
    const model_fxAll = fx; const model_teamIdByShort = Object.fromEntries(boot.teams.map(t => [t.short_name, t.id])); let model_teams = null;
    const resolve = resolver(boot.elements, teamsById);
    /* sources only count for the gameweek they were written for */
    const fresh = d => d && d.gw >= info.gw;
    const src = sourceIndex(fresh(creators) ? creators : null, fresh(sites) ? sites : null, resolve);
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
        minutes: num(e.minutes), starts: num(e.starts), points: num(e.total_points), defcon90: num(e.defensive_contribution_per_90), xg90: num(e.expected_goals_per_90), xa90: num(e.expected_assists_per_90), ppg: num(e.points_per_game), cs90: num(e.clean_sheets_per_90), saves90: num(e.saves_per_90),
        status: e.status, news: e.news || '', chance, next: nextFx.slice(0, 5), avgFdr, src: s,
        ini: initials(e.web_name)
      };
    });

    /* position-relative percentiles, only among players who have actually played */
    const byPos = {};
    for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
    for (const pos in byPos) {
      const pool = byPos[pos].filter(p => p.minutes >= 270);
      const sForm = pool.map(p => p.form).sort((a, b) => a - b);
      const sThreat = pool.map(p => p.xgi90).sort((a, b) => a - b);
      const sDef = pool.map(p => p.defcon90).sort((a, b) => a - b);
      const sCs = pool.map(p => p.cs90).sort((a, b) => a - b);
      const sSv = pool.map(p => p.saves90).sort((a, b) => a - b);
      for (const p of byPos[pos]) {
        const played = p.minutes > 0;
        const w = Math.min(1, p.minutes / 270);
        p.pForm = played ? w * pct(sForm, p.form) : 0;
        p.pDef = played ? w * pct(sDef, p.defcon90) : 0;
        const pX = played ? w * pct(sThreat, p.xgi90) : 0;
        /* "threat" means what earns points in that position */
        if (pos === 'GK') p.pThreat = played ? w * (0.6 * pct(sCs, p.cs90) + 0.4 * pct(sSv, p.saves90)) : 0;
        else if (pos === 'DEF') p.pThreat = played ? 0.5 * pX + 0.5 * p.pDef : 0;
        else p.pThreat = pX;
        p.pX = pX;
        p.threatLabel = pos === 'GK' ? 'Clean sheets & saves /90' : pos === 'DEF' ? 'xGI & defcon /90' : 'Threat · xGI per 90';
      }
    }

    /* ================= projection model =================
       Expected FPL points per fixture, from the official API only:
       per-90 output (xG, xA, defensive contributions, saves, bonus, cards) shrunk toward
       the position average when the sample is small, x expected minutes,
       x opponent strength measured from real xG / xGC (not FDR), with FPL's own scoring rules. */
    const SC = (boot.game_config && boot.game_config.scoring) || {};
    const ptsFor = (k, pos, dflt) => { const v = SC[k]; const key = pos === 'GK' ? 'GKP' : pos; return v && typeof v === 'object' ? num(v[key]) : (v != null ? num(v) : dflt); };
    const DC_THR = { GK: 99, DEF: 10, MID: 12, FWD: 12 };
    const raw = Object.fromEntries(boot.elements.map(e => [e.id, e]));
    /* team strength from player data */
    const T = {};
    for (const e of boot.elements) {
      const t = T[e.team] = T[e.team] || { g: 1, xg: 0, gkMin: -1, xgc: null };
      t.g = Math.max(t.g, num(e.starts));
      t.xg += num(e.expected_goals);
      if (e.element_type === 1 && num(e.minutes) > t.gkMin) { t.gkMin = num(e.minutes); t.xgc = num(e.expected_goals_conceded_per_90); }
    }
    const tl = Object.values(T); tl.forEach(t => { t.att = t.xg / t.g; if (!t.gkMin || t.gkMin < 90 || !t.xgc) t.xgc = null; });
    const mAtt = tl.reduce((a, t) => a + t.att, 0) / tl.length || 1.35;
    const dl = tl.filter(t => t.xgc != null); const mDef = dl.reduce((a, t) => a + t.xgc, 0) / (dl.length || 1) || 1.35;
    tl.forEach(t => { t.attS = (t.att * t.g + mAtt * 4) / (t.g + 4); t.defS = ((t.xgc ?? mDef) * t.g + mDef * 4) / (t.g + 4); });
    model_teams = T;
    /* position priors (median of regulars) */
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const PRI = {};
    for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
      const reg = players.filter(p => p.pos === pos && p.minutes >= 450).map(p => raw[p.id]);
      const per90 = (e, k) => num(e[k]) * 90 / Math.max(1, num(e.minutes));
      PRI[pos] = { xg: med(reg.map(e => num(e.expected_goals_per_90))), xa: med(reg.map(e => num(e.expected_assists_per_90))), dc: med(reg.map(e => num(e.defensive_contribution_per_90))), sv: med(reg.map(e => num(e.saves_per_90))), bn: med(reg.map(e => per90(e, 'bonus'))), yc: med(reg.map(e => per90(e, 'yellow_cards'))) };
    }
    const K = 450;
    const shrink = (v, m, prior) => (v * m + prior * K) / (m + K);
    const gws = []; for (let g = info.gw; g < info.gw + 5; g++) gws.push(g);
    const deadlineOf = Object.fromEntries((boot.events || []).map(ev => [ev.id, new Date(ev.deadline_time)]));
    const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    /* "Expected back 25 Oct" / "Suspended until 25 Oct" -> Date */
    const backDate = news => {
      const m = /(?:expected back|until|return(?:s|ing)? on)\s+(\d{1,2})\s+([a-z]{3})/i.exec(news || '');
      if (!m || MON[m[2].toLowerCase()] == null) return null;
      const ref = deadlineOf[info.gw] || new Date();
      let d = new Date(Date.UTC(ref.getUTCFullYear(), MON[m[2].toLowerCase()], +m[1]));
      if (d - ref < -200 * 864e5) d = new Date(Date.UTC(ref.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
      return d;
    };
    /* chance of being available in each of the next 5 GWs, from FPL's status/chance/news */
    const fitnessCurve = p => {
      const back = backDate(p.news);
      return gws.map((g, k) => {
        if (p.status === 'a') return 1;
        const dl = deadlineOf[g];
        if (back && dl) { if (dl < back) return 0; const wk = Math.floor((dl - back) / (7 * 864e5)); return Math.min(1, 0.75 + 0.12 * wk); }
        if (p.status === 'd') return 1 - (1 - p.chance / 100) * Math.pow(0.5, k);
        if (p.status === 's') return [0, 0.5, 0.8, 1, 1][k];
        return 0; /* injured / unavailable with no return date */
      });
    };
    /* recent form = the last few GWs from event/{gw}/live (who started, minutes, xG, xA, defcon) */
    const R = recent && recent.p ? recent : null;
    const recentOf = p => {
      if (!R) return null;
      const rows = R.p[p.id] || {};
      let min = 0, st = 0, xg = 0, xa = 0, dc = 0, tg = 0, missed = 0;
      for (const g of R.gws) { const n = num((R.teamGames[g] || {})[p.teamId]); tg += n; const r = rows[g]; if (r) { min += r[0]; st += r[1]; xg += r[2]; xa += r[3]; dc += r[4]; } else missed += n; }
      /* a game with no minutes at all is usually an injury or ban, not a benching: if he is fit now, it counts less */
      const tgEff = p.status === 'a' ? tg - 0.6 * missed : tg;
      return tg ? { min, st, xg, xa, dc, tg, tgEff } : null;
    };

    /* pass 1: per-90 rates, base start probability, fitness per GW */
    for (const p of players) {
      const e = raw[p.id], m = p.minutes, pr = PRI[p.pos], t = T[p.teamId];
      const per90 = k => num(e[k]) * 90 / Math.max(1, m);
      /* finishing matters: 70% expected, 30% actual output */
      const g90 = 0.7 * num(e.expected_goals_per_90) + 0.3 * per90('goals_scored'), a90 = 0.7 * num(e.expected_assists_per_90) + 0.3 * per90('assists');
      const s = { xg: shrink(g90, m, pr.xg), xa: shrink(a90, m, pr.xa), dc: shrink(num(e.defensive_contribution_per_90), m, pr.dc), sv: shrink(num(e.saves_per_90), m, pr.sv), bn: shrink(per90('bonus'), m, pr.bn), yc: shrink(per90('yellow_cards'), m, pr.yc) };
      const rc = recentOf(p);
      p.recent = rc;
      let sp = clamp01(p.starts / t.g);
      if (rc) {
        /* last ~4 GWs: underlying numbers pulled toward his season rate when the sample is small, then 30% weight */
        const RK = 270, blend = (season, tot) => 0.7 * season + 0.3 * ((tot * 90 / Math.max(1, rc.min)) * rc.min + season * RK) / (rc.min + RK);
        if (rc.min > 0) { s.xg = blend(s.xg, rc.xg); s.xa = blend(s.xa, rc.xa); s.dc = blend(s.dc, rc.dc); }
        /* who is starting now matters more than who started in August */
        sp = 0.45 * sp + 0.55 * clamp01(rc.st / Math.max(1, rc.tgEff));
      }
      p.s90 = s; p.baseSP = sp;
      p.minPerStart = p.starts ? Math.min(90, m / p.starts) : 75;
      p.fitC = fitnessCurve(p);
      p.spC = gws.map(() => sp);
      p.coverC = gws.map(() => null);
    }

    /* pass 2: if a regular starter is out, his starts go to the teammates in the same position who are next in line */
    const groups = {};
    for (const p of players) (groups[p.teamId + p.pos] = groups[p.teamId + p.pos] || []).push(p);
    for (const key in groups) {
      const g = groups[key];
      gws.forEach((gw, k) => {
        const out = g.filter(p => p.baseSP >= 0.3 && p.fitC[k] < 0.75);
        const missing = out.reduce((a, p) => a + p.baseSP * (1 - p.fitC[k]), 0);
        if (missing < 0.15) return;
        const cands = g.filter(p => p.fitC[k] >= 0.75 && p.baseSP < 0.8);
        const w = p => (0.1 + (p.recent ? clamp01(p.recent.min / (90 * p.recent.tg)) : clamp01(p.minutes / (90 * T[p.teamId].g)))) * p.fitC[k];
        const W = cands.reduce((a, p) => a + w(p), 0);
        if (!W) return;
        for (const c of cands) {
          const add = Math.min(missing * w(c) / W, 0.95 - c.baseSP);
          if (add <= 0) continue;
          c.spC[k] = c.baseSP + add;
          if (add >= 0.15) c.coverC[k] = out.map(o => o.name).join(' & ');
        }
      });
    }

    /* pass 3: expected points per fixture */
    for (const p of players) {
      const e = raw[p.id], m = p.minutes, t = T[p.teamId], s = p.s90;
      const gPts = ptsFor('goals_scored', p.pos, 4), csPts = ptsFor('clean_sheets', p.pos, 0), gcPts = ptsFor('goals_conceded', p.pos, 0), dcPts = ptsFor('defensive_contribution', p.pos, 2);
      const mins = (k) => {
        const fit = p.fitC[k], sp = clamp01(p.spC[k]), mps = p.minPerStart;
        const p60 = sp * fit * (mps >= 70 ? 0.95 : mps >= 60 ? 0.8 : 0.5);
        const cameo = (1 - sp) * fit * (m > 0 ? 0.35 : 0.05);
        return { p60, cameo, mf: sp * fit * (mps / 90) + cameo * 0.25 };
      };
      const fxPts = (f, k) => {
        const { p60, cameo, mf } = mins(k);
        const o = T[model_teamIdByShort[f.opp]] || { attS: mAtt, defS: mDef };
        const atkMult = Math.pow(o.defS / mDef, 1.1) * (f.home ? 1.08 : 0.93);
        const lam = t.defS * Math.pow(o.attS / mAtt, 1.1) * (f.home ? 0.92 : 1.08);
        const lg = s.xg * atkMult * mf, la = s.xa * atkMult * mf;
        const b = {
          appearance: 2 * p60 + 1 * cameo,
          goals: lg * gPts,
          assists: la * 3,
          cleanSheets: csPts * Math.exp(-lam) * p60,
          conceded: gcPts * 0.5 * lam * 0.85 * p60,
          defcon: p.pos === 'GK' ? 0 : dcPts * p60 / (1 + Math.exp(-(s.dc - DC_THR[p.pos] + 0.5) / 1.6)),
          saves: p.pos === 'GK' ? (s.sv * Math.pow(o.attS / mAtt, 0.8) / 3) * mf : 0,
          bonus: s.bn * Math.sqrt(atkMult) * mf,
          cards: -s.yc * mf
        };
        b.total = Object.values(b).reduce((a, v) => a + v, 0);
        b.csProb = Math.exp(-lam);
        b.lamRet = lg + la; b.lamG = lg; b.gPts = gPts;
        return b;
      };
      const all = (model_fxAll[p.teamId] || []);
      p.byGw = gws.map((g, k) => { const fs = all.filter(f => f.gw === g); const parts = fs.map(f => fxPts(f, k)); return { gw: g, fixtures: fs, xp: parts.reduce((a, b) => a + b.total, 0), parts }; });
      const first = p.byGw[0];
      p.xp1 = first.xp;
      p.xb = first.parts.length ? Object.fromEntries(Object.keys(first.parts[0]).map(k => [k, first.parts.reduce((a, b) => a + b[k], 0)])) : null;
      p.xp5 = p.byGw.reduce((a, g) => a + g.xp, 0);
      /* ceiling: chance of 2+ goal involvements this GW (Poisson), and of a goal */
      const lr = first.parts.reduce((a, b) => a + b.lamRet, 0), lgo = first.parts.reduce((a, b) => a + b.lamG, 0);
      p.haul = 1 - Math.exp(-lr) * (1 + lr);
      p.goalP = 1 - Math.exp(-lgo);
      const W = [1, 0.9, 0.8, 0.7, 0.6];
      const wsum = p.byGw.reduce((a, g, i) => a + g.xp * W[i], 0);
      const backers = p.src.creatorsBuy.length + p.src.sitesPick.length, warns = p.src.creatorsAvoid.length + p.src.sitesAvoid.length;
      p.aiRaw = wsum * (1 + 0.03 * Math.min(backers, 4) - 0.04 * Math.min(warns, 3));
      /* captain = expected points plus a premium for explosive upside (a captain's haul is doubled) */
      p.ep = p.xp1;
      p.capX = p.xp1 + 2.2 * p.haul;
      p.startP = clamp01(p.spC[0]); p.fitness = p.fitC[0]; p.covering = p.coverC[0];
      p.setPieces = [num(e.penalties_order) === 1 && 'penalties', num(e.corners_and_indirect_freekicks_order) === 1 && 'corners', num(e.direct_freekicks_order) === 1 && 'free kicks'].filter(Boolean);
    }
    const topAi = Math.max(...players.map(p => p.aiRaw), 0.01), topCap = Math.max(...players.map(p => p.capX), 0.01);
    for (const p of players) { p.ai = Math.round(100 * Math.pow(Math.max(0, p.aiRaw) / topAi, 0.85)); p.cap = Math.round(100 * Math.max(0, p.capX) / topCap); }
    for (const pos in byPos) byPos[pos].slice().sort((a, b) => b.aiRaw - a.aiRaw).forEach((p, i) => { p.rank = i + 1; });
    players.slice().sort((a, b) => b.capX - a.capX).forEach((p, i) => { p.capRank = i + 1; });
    for (const pos in byPos) byPos[pos].slice().sort((a, b) => (b.xp5 / b.price) - (a.xp5 / a.price)).forEach((p, i) => { p.valueRank = i + 1; });

    /* rule-based reasons (max 3), every line tagged with its source */
    for (const p of players) {
      const r = [];
      const posName = { GK: 'keepers', DEF: 'defenders', MID: 'midfielders', FWD: 'forwards' }[p.pos];
      const top5 = q => p.minutes >= 270 && Math.ceil((byPos[p.pos].filter(x => x.minutes >= 270).length || 1) * (1 - q)) <= 5;
      if (p.minutes > 0 && p.pos !== 'GK' && top5(p.pX)) r.push({ good: true, text: `Top 5 ${posName} for xGI per 90`, by: 'FPL API' });
      if (p.minutes > 0 && p.pos !== 'FWD' && p.pos !== 'GK' && top5(p.pDef)) r.push({ good: true, text: `Top 5 ${posName} for defensive contributions per 90`, by: 'FPL API' });
      if (p.covering) r.push({ good: true, text: `Next in line to start while ${p.covering} ${p.covering.includes('&') ? 'are' : 'is'} out`, by: 'Model · FPL API status' });
      if ((p.pos === 'DEF' || p.pos === 'GK') && p.xb && p.xb.goals + p.xb.assists >= 0.9) r.push({ good: true, text: `Attacking threat: ${(p.xb.goals + p.xb.assists).toFixed(1)} expected pts from goals & assists this GW`, by: 'Model · xG/xA' });
      if (p.setPieces.length && p.minutes > 0 && p.startP >= 0.6) r.push({ good: true, text: `On ${p.setPieces.join(' & ')}`, by: 'FPL API · set pieces' });
      if (p.rank <= 5 && p.xp5 > 0) r.push({ good: true, text: `Projected ${p.xp5.toFixed(1)} pts over the next 5 GWs (#${p.rank} ${p.pos})`, by: 'Model · FPL API' });
      if (p.valueRank <= 5 && p.minutes >= 270) r.push({ good: true, text: `Top 5 ${posName} for projected points per £m`, by: 'Model · FPL API' });
      if ((p.pos === 'DEF' || p.pos === 'GK') && p.xb && p.xb.csProb > 0.38) r.push({ good: true, text: `${Math.round(p.xb.csProb * 100)}% clean sheet chance this GW`, by: 'Model · team xGC' });
      if (p.byGw[0] && p.byGw[0].fixtures.length > 1) r.push({ good: true, text: 'Double gameweek: two fixtures this GW', by: 'FPL API · fixtures' });
      if (p.byGw[0] && !p.byGw[0].fixtures.length) r.push({ good: false, text: 'Blank gameweek: no fixture this GW', by: 'FPL API · fixtures' });
      if (p.minutes > 0 && p.startP < 0.6 && p.status === 'a' && !p.covering) r.push({ good: false, text: p.recent ? `Started ${p.recent.st} of his team's last ${p.recent.tg} games` : `Started ${p.starts} of his team's games`, by: 'FPL API · minutes' });
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

    return { info, teamsById, teams: model_teams, players, byId: Object.fromEntries(players.map(p => [p.id, p])), resolve, fx };
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

  function captainTop(model, n = 3) { return model.players.filter(p => p.next.length).sort((a, b) => b.ep - a.ep).slice(0, n); }

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
    const stale = !creators || creators.gw < model.info.gw;
    const list = (creators && creators.creators) || [];
    const res = n => n && model.resolve(n.player || n, n.team);
    const agree = {};
    for (const c of list) for (const b of c.buys || []) { const e = res(b); if (!e) continue; (agree[e.id] = agree[e.id] || { p: model.byId[e.id], by: [] }).by.push(c.id); }
    const agreeList = Object.values(agree).filter(a => a.p).sort((a, b) => b.by.length - a.by.length).slice(0, 4);
    const captains = list.map(c => ({ id: c.id, name: c.name, captain: c.squad && c.squad.captain ? c.squad.captain : null }));
    const splits = [];
    for (const c of list) for (const a of c.avoids || []) { const e = res(a); if (!e || !agree[e.id]) continue; splits.push({ p: model.byId[e.id], against: [c.id], for: agree[e.id].by, whyAgainst: a.why }); }
    return { list, agreeList: stale ? [] : agreeList, captains, splits: stale ? [] : splits, stale, gw: creators && creators.gw, updated: creators && creators.updated };
  }

  root.Engine = { build, picksByPosition, captainTop, teamCheck, creatorsView, gwInfo, norm };
})(typeof window !== 'undefined' ? window : globalThis);
