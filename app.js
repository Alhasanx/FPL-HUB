/* FPL Consensus Hub · UI */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const TONE = { mint: '#3CF0A0', aqua: '#3DDCF0', rose: '#FF5A8E', lilac: '#A98BFF', gold: '#FFCB5C' };
  const POSTONE = { GK: TONE.lilac, DEF: TONE.aqua, MID: TONE.mint, FWD: TONE.gold };
  const SRC_COL = { 'FPL Harry': TONE.mint, "Let's Talk FPL": TONE.gold, 'FPL Raptor': TONE.rose, 'FPL Mate': TONE.lilac };
  const ICON = {
    ok: c => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c || TONE.mint}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>`,
    warn: c => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c || TONE.rose}" stroke-width="2.4" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>`,
    x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>`,
    down: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`
  };
  let M = null, CR = null, SI = null;

  /* ---------- data ---------- */
  async function fpl(path) {
    try { const r = await fetch('/api/fpl?path=' + encodeURIComponent(path)); if (r.ok) return await r.json(); } catch (e) {}
    const r = await fetch('https://fantasy.premierleague.com/api/' + path); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  }
  async function local(path) { try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? r.json() : null; } catch (e) { return null; } }

  async function boot() {
    skeleton();
    try {
      const [b, f, c, s] = await Promise.all([fpl('bootstrap-static/'), fpl('fixtures/'), local('data/creators.json'), local('data/sites.json')]);
      CR = c; SI = s; M = Engine.build(b, f, c, s);
      $('#gwPill span').textContent = 'GW' + M.info.gw + ' LIVE';
      renderAll();
    } catch (e) {
      $('#gwPill span').textContent = 'OFFLINE';
      $('#home').innerHTML = `<div class="glass card panel"><h3 style="font:700 16px var(--f-d)">Couldn't reach the FPL API</h3><p class="lede">The official API didn't respond. Pull to refresh or try again in a minute.</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
    }
  }
  function skeleton() { $('#home').innerHTML = '<div class="sk" style="height:120px"></div><div class="sk" style="height:260px"></div><div class="sk"></div><div class="sk"></div>'; }
  function renderAll() { renderHome(); renderCreators(); renderTeam(); renderPlayers(); const t = store.get('tab'); if (t && t !== 'home') go(t, true); }

  const fxClass = f => f <= 2 ? 'easy' : f >= 4 ? 'hard' : 'mid';
  const fxTxt = f => f ? `${f.home ? 'v' : '@'} ${f.opp}` : '—';
  const stagger = el => { [...el.children].forEach((c, i) => c.style.setProperty('--i', i)); };
  const sourceStamp = (obj, label) => {
    if (!obj) return `<div class="stamp glass stale"><i></i>No ${label} data yet</div>`;
    const stale = obj.gw < M.info.gw;
    return `<div class="stamp glass ${stale ? 'stale' : ''}"><i></i>${stale ? `From GW${obj.gw} ${label} · GW${M.info.gw} pending` : `From GW${obj.gw} ${label} · updated ${new Date(obj.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}</div>`;
  };

  /* ---------- home ---------- */
  function renderHome() {
    const el = $('#home');
    const flags = M.players.filter(p => p.status !== 'a' && p.own >= 3).sort((a, b) => b.own - a.own).slice(0, 8);
    const flagHtml = flags.map(p => `<span><em class="chip ${p.status === 'd' ? 'gold' : 'rose'}">${p.status === 'd' ? (p.chance + '%') : 'OUT'}</em>${esc(p.name)} · ${esc((p.news || '').split(' - ')[0] || 'flagged')}</span>`).join('');
    const caps = Engine.captainTop(M, 3);
    const c1 = caps[0];
    const picks = Engine.picksByPosition(M);
    const items = (SI && SI.items) || [];
    const signals = items.map(it => {
      const p = M.resolve(it.player, it.team), tone = it.type === 'avoid' ? TONE.rose : TONE.mint;
      return `<a class="signal glass" href="${esc(it.url || '#')}" target="_blank" rel="noopener" style="--tone:${tone}"><span class="chip ${it.type === 'avoid' ? 'rose' : 'mint'}">${it.type === 'avoid' ? 'Avoid' : 'Pick'}</span><h3>${esc(p ? p.web_name : it.player)}</h3><p>${esc(it.why)}</p><span class="src">${esc(it.source)}</span></a>`;
    }).join('');
    el.innerHTML = `
      ${flags.length ? `<div class="ticker glass"><div class="track">${flagHtml}${flagHtml}</div></div>` : ''}
      <div class="hero">
        <span class="label">Gameweek ${M.info.gw} · Deadline</span>
        <h1>${c1 ? `Captain call: <span class="hl">${esc(c1.name)}.</span>` : `Gameweek <span class="hl">${M.info.gw}.</span>`}</h1>
        ${c1 ? `<p class="lede">Highest captain score this week${caps[1] ? `. ${esc(caps[1].name)} and ${esc(caps[2] ? caps[2].name : '')} are next` : ''}.</p>` : ''}
        <div class="clock" id="clock"></div>
      </div>
      <div class="cap glass card">
        <div class="head"><h3>Captain picks</h3><span class="note">score / 100</span></div>
        ${caps.map((p, i) => `<button class="lane ${i === 0 ? 'first' : ''}" data-open="${p.id}">
          <div class="row"><span class="ci">${esc(p.ini)}</span>
            <div class="info"><b>${esc(p.name)}${i === 0 ? '<span class="badge-cap">Captain</span>' : ''}</b>
              <div class="meta">${esc(p.teamName)} <span class="fx ${fxClass(p.next[0].fdr)}">${fxTxt(p.next[0])}</span></div></div>
            <span class="score">${p.cap}</span></div>
          <div class="bar"><i data-w="${p.cap}"></i></div></button>`).join('')}
        <p class="note">From the FPL API: threat, form, opponent and minutes</p>
      </div>
      ${signals ? `<div class="sec"><h2>This week's signals</h2><span>${esc(SI ? 'GW' + SI.gw : '')}</span></div><div class="rail">${signals}</div>` : ''}
      <div class="sec"><h2>Picks by position</h2><span>most-mentioned this GW</span></div>
      <div class="picks glass card">${['GK', 'DEF', 'MID', 'FWD'].map(pos => `<div class="pgrp" style="--tone:${POSTONE[pos]}">
        <div class="lh"><i></i><span class="label">${pos}</span><span class="note">${{ GK: 'Goalkeeper', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' }[pos]}</span></div>
        ${picks[pos].length ? picks[pos].map(x => `<button class="prow" data-open="${x.p.id}"><span class="av ${pos}">${esc(x.p.ini)}</span>
          <span class="tx"><b>${esc(x.p.name)}</b><small>${esc(x.p.teamName)} · £${x.p.price.toFixed(1)}m · ${x.p.own}%</small>${x.why ? `<span>${esc(x.why)}</span>` : ''}<em>via ${esc(x.names.join(' · '))}</em></span>
          <span class="dots"><div>${x.names.map(n => `<i style="background:${SRC_COL[n] || TONE.aqua}"></i>`).join('')}</div><small>×${x.names.length}</small></span></button>`).join('')
        : `<div class="empty">No standout pick from the sources this week</div>`}</div>`).join('')}</div>
      <p class="note">Ranked by how many of your sources named them this week. Players owned by 35%+ are skipped: everyone already has them.</p>`;
    stagger(el); tickClock(); bars(el);
  }
  let clockT = null;
  function tickClock() {
    clearInterval(clockT);
    const t = new Date(M.info.deadline).getTime();
    const draw = () => { const el = $('#clock'); if (!el) return; let d = Math.max(0, Math.floor((t - Date.now()) / 1000)); const v = [Math.floor(d / 86400), Math.floor(d % 86400 / 3600), Math.floor(d % 3600 / 60), d % 60];
      el.innerHTML = ['Days', 'Hrs', 'Min', 'Sec'].map((l, i) => `<div class="glass"><b>${String(v[i]).padStart(2, '0')}</b><small>${l}</small></div>`).join(''); };
    draw(); clockT = setInterval(draw, 1000);
  }
  function bars(root) { requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('.bar i[data-w]').forEach(i => i.style.width = i.dataset.w + '%'))); }

  /* ---------- creators ---------- */
  const CTONE = c => (c.tone || ['mint', 'aqua']).map(t => TONE[t] || t);
  function renderCreators() {
    const el = $('#creators');
    const v = Engine.creatorsView(M, CR);
    const cav = (id, size) => { const c = v.list.find(x => x.id === id) || {}; const [a, b] = CTONE(c); return `<span class="cav" style="--c1:${a};--c2:${b}${size ? `;width:${size}px;height:${size}px` : ''}">${esc(id)}</span>`; };
    const cards = c => 4 + ((c.extra || []).length ? 1 : 0);
    el.innerHTML = `
      <div class="hero"><span class="label">Gameweek ${M.info.gw} · Creators</span><h1>What they <span class="hl">said.</span></h1>${sourceStamp(CR, 'videos')}</div>
      <div class="stories">${v.list.map(c => { const [a, b] = CTONE(c); const fresh = CR.gw >= M.info.gw; return `<button class="story" data-story="${esc(c.id)}" style="--c1:${a};--c2:${b}"><span class="sring"><div><div><span>${esc(c.id)}</span></div></div>${fresh ? '<i class="dot"></i>' : ''}</span><b>${esc(c.name)}</b><span class="dashes">${'<i></i>'.repeat(cards(c))}</span></button>`; }).join('')}</div>
      <div class="panel glass card"><div class="head"><h3>Their captain</h3><span>from card 4</span></div>
        <div class="capt">${v.captains.map(c => `<div>${cav(c.id)}<span class="chip ${c.captain ? 'mint' : ''}">${esc(c.captain ? c.captain : 'TBC')}</span></div>`).join('')}</div></div>
      <div class="panel glass card agree"><div class="head"><h3>Where they agree</h3><span>backed in card 1 · out of ${v.list.length}</span></div>
        ${v.agreeList.length ? v.agreeList.map(a => `<button class="r" data-open="${a.p.id}" style="text-align:left"><div class="t"><b>${esc(a.p.name)}</b><span class="stack">${a.by.map(id => cav(id)).join('')}</span><span style="font:600 11px var(--f-m);color:${a.by.length === v.list.length ? TONE.mint : 'var(--t2)'}">${a.by.length}/${v.list.length}</span></div><div class="bar"><i data-w="${100 * a.by.length / v.list.length}" style="background:var(--grad)"></i></div></button>`).join('') : '<div class="empty">No players backed in this week\'s videos yet</div>'}</div>
      ${v.splits.map(s => `<div class="panel glass card"><div class="head"><span class="chip lilac">They disagree</span><span>${esc(s.p.name)}</span></div><p class="lede">${s.for.map(id => cav(id)).join(' ')} back him. ${s.against.map(id => cav(id)).join(' ')} ${esc(s.whyAgainst || 'is avoiding him')}.</p></div>`).join('')}
      <p class="note">Everything here comes from their videos. Each creator gets the same cards: buys, avoids, moves, squad, plus anything extra.</p>`;
    stagger(el); bars(el);
  }

  /* stories */
  const WM = {
    buys: '<svg viewBox="0 0 400 380" fill="none"><path d="M60 190 150 280 330 80" stroke="currentColor" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    avoids: '<svg viewBox="0 0 400 380" fill="none"><circle cx="200" cy="180" r="140" stroke="currentColor" stroke-width="40"/><path d="M100 280 300 80" stroke="currentColor" stroke-width="40" stroke-linecap="round"/></svg>',
    moves: '<svg viewBox="0 0 400 380" fill="none"><path d="M70 120h230M240 60l60 60-60 60M330 260H100M160 200l-60 60 60 60" stroke="currentColor" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    squad: '<svg viewBox="0 0 400 380" fill="none"><rect x="40" y="20" width="320" height="340" rx="20" stroke="currentColor" stroke-width="18"/><path d="M40 190h320" stroke="currentColor" stroke-width="18"/><circle cx="200" cy="190" r="56" stroke="currentColor" stroke-width="18"/></svg>',
    extra: '<svg viewBox="0 0 400 380" fill="none"><path d="M80 250c0-90 30-140 90-160M200 250c0-90 30-140 90-160" stroke="currentColor" stroke-width="44" stroke-linecap="round"/></svg>'
  };
  const CARD = { buys: ['mint', 'aqua', 'Back these.', 'Buys'], avoids: ['rose', 'gold', 'Skip these.', 'Avoids'], moves: ['gold', 'rose', 'Moves.', 'Moves'], squad: ['aqua', 'lilac', 'His XI.', 'Squad'], extra: ['lilac', 'rose', 'Worth knowing.', 'Also said'] };
  let story = null;
  function openStory(id) {
    const c = CR.creators.find(x => x.id === id); if (!c) return;
    const seq = ['buys', 'avoids', 'moves', 'squad'].concat((c.extra || []).length ? ['extra'] : []);
    story = { c, seq, i: 0 }; drawStory(); $('#viewer').classList.add('on'); document.body.style.overflow = 'hidden';
  }
  function closeStory() { $('#viewer').classList.remove('on'); document.body.style.overflow = ''; story = null; }
  function playerLine(row, i, struck) {
    const e = M.resolve(row.player, row.team); const p = e && M.byId[e.id];
    return `<div class="ticket ${struck ? 'struck' : ''}">${i != null ? `<span class="n">${String(i + 1).padStart(2, '0')}</span>` : ''}<span class="av ${p ? p.pos : 'MID'}" style="width:46px;height:46px">${esc(p ? p.ini : row.player.slice(0, 2).toUpperCase())}</span><span class="tx"><b>${esc(p ? p.name : row.player)}</b><small>${esc(row.why || (p ? `${p.teamName} · £${p.price.toFixed(1)}m` : ''))}</small></span></div>`;
  }
  function drawStory() {
    const { c, seq, i } = story, key = seq[i], [ta, tb, title, label] = CARD[key], a = TONE[ta], b = TONE[tb];
    const [ca, cb] = CTONE(c);
    let body = '';
    if (key === 'buys') body = (c.buys || []).length ? c.buys.map((r, k) => playerLine(r, k)).join('') : `<div class="nothing">No specific buys named in this video.</div>`;
    if (key === 'avoids') body = (c.avoids || []).length ? c.avoids.map(r => playerLine(r, null, true)).join('') : `<div class="nothing">Nobody singled out to avoid in this video.</div>`;
    if (key === 'moves') { const mv = c.moves || {}; body = (mv.chip ? `<div class="wc"><span class="b">${esc(mv.chip === 'wildcard' ? 'WC' : mv.chip === 'freehit' ? 'FH' : mv.chip.slice(0, 2).toUpperCase())}</span><div><b style="font:700 17px var(--f-d)">${esc(mv.chip[0].toUpperCase() + mv.chip.slice(1))} played</b><p class="lede">${esc(mv.note || '')}</p></div></div>` : (mv.note ? `<p class="lede">${esc(mv.note)}</p>` : ''))
      + ((mv.transfers || []).length ? mv.transfers.map(t => `<div class="ticket"><span class="chip rose">OUT · ${esc(t.out.player)}</span><span>→</span><span class="chip mint">IN · ${esc(t.in.player)}</span></div>`).join('') : (!mv.chip ? `<div class="nothing">The exact swaps weren't shown in the video.</div>` : '')); }
    if (key === 'squad') { const sq = c.squad || {}; body = (sq.xi || []).length ? miniPitch(sq) + `<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${sq.captain ? 'mint' : ''}">Captain ${esc(sq.captain || 'TBC')}</span>${(sq.bench || []).length ? `<span class="chip">Bench ${esc(sq.bench.join(', '))}</span>` : '<span class="chip">Bench not shown</span>'}</div>` : `<div class="nothing">The squad wasn't shown in this video.</div>`; }
    if (key === 'extra') body = c.extra.map(x => `<div class="ticket" style="flex-direction:column;align-items:flex-start;gap:8px"><span class="chip lilac">${esc(x.topic)}</span><b style="font-weight:600">${esc(x.text)}</b></div>`).join('');
    $('#viewer').innerHTML = `<div class="wash" style="--a:${a};--b:${b}"></div><div class="blob" style="width:320px;height:320px;left:150px;top:-120px;background:${a};opacity:.42"></div><div class="blob" style="width:300px;height:300px;left:-140px;top:440px;background:${b};opacity:.3"></div><div class="wm" style="color:${a}">${WM[key]}</div>
      <div class="vtap" id="vtap"></div>
      <div class="in" style="--a:${a};--b:${b}">
        <div class="vprog">${seq.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="vhead"><div class="vcap glass"><span class="sring" style="--c1:${ca};--c2:${cb};width:42px;height:42px;padding:2px;box-shadow:none"><div style="padding:2px"><div style="font-size:11px"><span>${esc(c.id)}</span></div></div></span><div class="who"><b>${esc(c.name)}</b><small>▶ GW${CR.gw} video · ${esc(new Date(c.video.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</small></div><div class="cnt"><b>${i + 1}/${seq.length}</b><small>${label.toUpperCase()}</small></div></div><button class="xbtn glass" id="vclose" aria-label="Close">${ICON.x}</button></div>
        <div class="vbody"><h2>${key === 'moves' && c.moves && c.moves.chip === 'wildcard' ? 'Wildcard.' : title}</h2>${body}</div>
        <div class="vfoot"><a class="watch" href="${esc(c.video.url)}" target="_blank" rel="noopener">Watch the video ↗</a><small>${i < seq.length - 1 ? 'Tap for next' : 'Tap to finish'}</small></div>
      </div>`;
    $('#vclose').onclick = closeStory;
    $('#vtap').onclick = e => { const left = e.clientX < innerWidth * 0.3; if (left) { if (story.i > 0) { story.i--; drawStory(); } } else if (story.i < story.seq.length - 1) { story.i++; drawStory(); } else closeStory(); };
  }
  function miniPitch(sq) {
    const rows = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const r of sq.xi) { const e = M.resolve(r.player, r.team); const p = e && M.byId[e.id]; rows[p ? p.pos : 'MID'].push({ r, p }); }
    const order = ['FWD', 'MID', 'DEF', 'GK'], ys = { FWD: 14, MID: 38, DEF: 62, GK: 86 };
    let html = '<div class="minip">';
    for (const pos of order) { const list = rows[pos]; list.forEach((x, i) => { const left = (100 / list.length) * (i + .5); const isC = sq.captain && Engine.norm(sq.captain) === Engine.norm(x.r.player);
      html += `<div class="tok" style="left:${left}%;top:${ys[pos]}%;--c:${TONE.aqua};--v:100"><span class="disc"><div>${esc(x.p ? x.p.ini : x.r.player.slice(0, 2).toUpperCase())}</div>${isC ? '<span class="cbadge">C</span>' : ''}</span><b>${esc(x.p ? x.p.name : x.r.player)}</b>${x.p ? `<small>£${x.p.price.toFixed(1)}m</small>` : ''}</div>`; }); }
    return html + '</div>';
  }

  /* ---------- team ---------- */
  function renderTeam(result, err) {
    const el = $('#team');
    const id = store.get('fplId') || '';
    let body = '';
    if (err) body = `<div class="empty">${esc(err)}</div>`;
    else if (!result) body = `<div class="panel glass card"><h3 style="font:700 15px var(--f-d)">What you'll get</h3><p class="lede">A Squad score for your XI, how many of your players the data backs, a captain check, and the swaps that raise your score the most within your budget.</p><p class="note">Find your ID on the FPL site: Points → the number in the page address.</p></div>`;
    else body = teamView(result);
    el.innerHTML = `<div class="hero"><span class="label">Gameweek ${M.info.gw} · Your squad</span><h1>Team <span class="hl">check.</span></h1></div>
      <form class="idrow glass" id="idform"><input id="fplId" inputmode="numeric" placeholder="FPL team ID · e.g. 1234567" value="${esc(id)}" aria-label="FPL team ID"><button class="btn" type="submit">Check</button></form>${body}`;
    stagger(el); bars(el);
    $('#idform').onsubmit = async e => { e.preventDefault(); const v = $('#fplId').value.trim(); if (!/^\d{1,9}$/.test(v)) { renderTeam(null, 'Enter the number only, e.g. 1234567.'); return; } store.set('fplId', v); await checkTeam(v); };
  }
  async function checkTeam(id) {
    $('#team').insertAdjacentHTML('beforeend', '<div class="sk" style="height:520px"></div>');
    try {
      const [entry, picks] = await Promise.all([fpl(`entry/${id}/`), fpl(`entry/${id}/event/${M.info.picksGw}/picks/`)]);
      renderTeam({ entry, tc: Engine.teamCheck(M, picks) });
    } catch (e) { renderTeam(null, `Couldn't load team ${id}. Check the ID, or try again after the GW${M.info.picksGw} deadline.`); }
  }
  function token(p, opts = {}) {
    const st = opts.captain ? TONE.mint : (p.ai >= 60 || p.src.creatorsBuy.length || p.src.sitesPick.length) ? TONE.mint : (p.src.creatorsAvoid.length || p.src.sitesAvoid.length || p.status !== 'a') ? TONE.rose : p.minutes === 0 ? null : TONE.lilac;
    return `<button class="tok ${st ? '' : 'none'}" data-open="${p.id}" style="left:${opts.left}%;top:${opts.top}%;--c:${st || 'rgba(255,255,255,.4)'};--v:${p.ai}"><span class="disc"><div>${esc(p.ini)}</div>${opts.captain ? '<span class="cbadge">C</span>' : ''}</span><b>${esc(p.name)}</b><small>${p.ai}</small></button>`;
  }
  function teamView({ entry, tc }) {
    const rows = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const x of tc.xi) rows[x.p.pos].push(x);
    const ys = { FWD: 16, MID: 40, DEF: 64, GK: 86 };
    let pitch = '';
    for (const pos of ['FWD', 'MID', 'DEF', 'GK']) rows[pos].forEach((x, i) => pitch += token(x.p, { left: (100 / rows[pos].length) * (i + .5), top: ys[pos], captain: x.is_captain }));
    const stripes = Array.from({ length: 10 }, (_, i) => `<rect y="${i * 52}" width="358" height="52" fill="#3CF0A0" fill-opacity="${i % 2 ? .025 : .055}"/>`).join('');
    return `<div class="squad glass card"><div><span class="label">Squad score</span><div class="big">${tc.score}<small>/100</small></div><span class="note">${esc(entry.name)} · ${tc.coveredN} played</span></div>
      <div class="metrics"><div>Backed by data<b style="color:${TONE.mint}">${tc.backed}/${tc.xi.length}</b></div><div>Captain<b style="color:${tc.captainGood ? TONE.mint : TONE.gold}">${esc(tc.captain ? tc.captain.name : '—')} ${tc.captainGood ? '✓' : ''}</b></div><div>Best upgrade<b style="color:${TONE.aqua}">${tc.swaps[0] ? '+' + tc.swaps[0].delta : '—'}</b></div></div></div>
      <div class="pitch"><span class="fl" style="width:260px;height:260px;left:-90px;top:-120px;background:${TONE.aqua};opacity:.4"></span><span class="fl" style="width:260px;height:260px;right:-80px;top:-120px;background:${TONE.mint};opacity:.35"></span>
        <svg class="mk" viewBox="0 0 358 520" preserveAspectRatio="none">${stripes}<g stroke="#7DFFD0" stroke-opacity=".35" stroke-width="1.4" fill="none"><rect x="14" y="14" width="330" height="492" rx="6"/><path d="M14 260H344"/><circle cx="179" cy="260" r="46"/><path d="M99 14v62h160V14M99 506v-62h160v62"/></g></svg>${pitch}</div>
      <div class="legend"><span><i style="background:${TONE.mint}"></i>Backed</span><span><i style="background:${TONE.lilac}"></i>Average</span><span><i style="background:${TONE.rose}"></i>Flagged</span><span><i style="border:1px dashed var(--t3)"></i>No minutes</span></div>
      <div class="sec"><h2>Smart swaps</h2><span>same position · within budget</span></div>
      ${tc.swaps.length ? tc.swaps.map(s => `<div class="swap glass card"><div class="flow">${token(s.out, {})}<div class="arrow"><i></i><b>+${s.delta} AI</b></div>${token(s.in, {})}</div><b style="font:700 14px var(--f-d)">${esc(s.out.name)} → ${esc(s.in.name)}</b><p class="lede" style="font-size:13px">${esc((s.in.reasons[0] || {}).text || '')}</p><div class="ft"><span class="chip ${s.money >= 0 ? 'mint' : 'gold'}">${s.money >= 0 ? 'Saves' : 'Costs'} £${Math.abs(s.money).toFixed(1)}m</span><button class="btn ghost" data-open="${s.in.id}">View player</button></div></div>`).join('')
        : '<div class="empty">No swap within your budget raises the score by 8 or more. Your XI is in good shape.</div>'}
      <div class="glass card" style="padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="label">Bench</span>${tc.bench.map(p => `<button class="chip" data-open="${p.id}">${esc(p.name)}</button>`).join('')}<span class="note" style="margin-left:auto">Bank £${tc.bank.toFixed(1)}m</span></div>`;
  }

  /* ---------- players ---------- */
  let pf = { pos: 'ALL', sort: 'ai', q: '', n: 40 };
  function renderPlayers() {
    const el = $('#players');
    el.innerHTML = `<div class="hero"><span class="label">Gameweek ${M.info.gw} · Consensus</span><h1>Every <span class="hl">player.</span></h1></div>
      <label class="search glass"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="q" placeholder="Search players or clubs" value="${esc(pf.q)}" aria-label="Search"></label>
      <div class="filters">${['ALL', 'GK', 'DEF', 'MID', 'FWD'].map(p => `<button class="fbtn glass" data-pos="${p}" aria-pressed="${pf.pos === p}">${p === 'ALL' ? 'All' : p}</button>`).join('')}</div>
      <div class="sort">Sort ${[['ai', 'AI score'], ['price', 'Price'], ['own', 'Owned'], ['form', 'Form']].map(([k, l]) => `<button data-sort="${k}" aria-pressed="${pf.sort === k}">${l}</button>`).join('')}</div>
      <div class="list" id="plist"></div>`;
    stagger(el); drawList();
    $('#q').oninput = e => { pf.q = e.target.value; pf.n = 40; drawList(); };
    el.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { pf.pos = b.dataset.pos; pf.n = 40; el.querySelectorAll('[data-pos]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawList(true); });
    el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { pf.sort = b.dataset.sort; el.querySelectorAll('[data-sort]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawList(true); });
  }
  function drawList(anim) {
    const L = $('#plist'); const first = {};
    if (anim && !RM) L.querySelectorAll('.row-p').forEach(r => first[r.dataset.open] = r.getBoundingClientRect().top);
    const q = Engine.norm(pf.q);
    const rows = M.players.filter(p => (pf.pos === 'ALL' || p.pos === pf.pos) && (!q || Engine.norm(p.name + p.teamName + p.team).includes(q))).sort((a, b) => b[pf.sort] - a[pf.sort]);
    L.innerHTML = rows.slice(0, pf.n).map(p => `<button class="row-p" data-open="${p.id}"><span class="av ${p.pos}">${esc(p.ini)}</span><span class="tx"><b>${esc(p.name)}</b><small>${esc(p.teamName)} · ${p.pos} · £${p.price.toFixed(1)}m · ${p.own}%</small></span><span class="ring" style="--v:${p.ai}"><span>${p.ai}</span></span></button>`).join('')
      + (rows.length > pf.n ? `<button class="btn ghost" id="more">Show more (${rows.length - pf.n})</button>` : '') + (!rows.length ? '<div class="empty">No players match.</div>' : '');
    const more = $('#more'); if (more) more.onclick = () => { pf.n += 40; drawList(); };
    if (anim && !RM) L.querySelectorAll('.row-p').forEach((r, i) => { const f = first[r.dataset.open], l = r.getBoundingClientRect().top; if (f == null) r.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: Math.min(i, 12) * 20, easing: 'cubic-bezier(.25,.9,.3,1)', fill: 'backwards' }); else if (f !== l) r.animate([{ transform: `translateY(${f - l}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.25,.9,.3,1)' }); });
  }

  /* ---------- player sheet ---------- */
  function openPlayer(id) {
    const p = M.byId[id]; if (!p) return;
    const f = p.f, posName = { GK: 'keeper', DEF: 'defender', MID: 'midfielder', FWD: 'forward' }[p.pos];
    const fxs = p.next.slice(0, 5);
    $('#sheet').innerHTML = `<span class="glow"></span><div class="grab" id="grab"><i></i></div>
      <div class="sh-head"><div class="nm"><h3>${esc(p.full.length > 22 ? p.name : p.full)}</h3><div class="tags"><span class="pos">${p.pos}</span>${esc(p.teamName)} · £${p.price.toFixed(1)}m</div></div><button class="xbtn" id="xs" aria-label="Close">${ICON.x}</button></div>
      <div class="stats"><div class="glass hi"><small>AI score</small><b>${p.ai}</b><em>#${p.rank} ${posName}</em></div><div class="glass"><small>Captain</small><b>${p.cap}</b><em>#${p.capRank} this GW</em></div><div class="glass"><small>Owned</small><b>${p.own < 10 ? p.own.toFixed(1) : Math.round(p.own)}%</b><em>${p.own >= 35 ? 'template' : p.own < 10 ? 'differential' : 'popular'}</em></div></div>
      <div class="verdict glass">${p.verdict.good ? ICON.ok() : ICON.warn(TONE.gold)}${esc(p.verdict.text)}</div>
      <div><p class="sub" style="margin-bottom:10px">Next ${fxs.length} fixtures</p><div class="fxrow" style="grid-template-columns:repeat(${Math.max(fxs.length, 1)},1fr)">${fxs.map(x => `<div class="${fxClass(x.fdr)}"><b>${esc(x.opp)}</b><small>${x.home ? 'H' : 'A'} · GW${x.gw}</small></div>`).join('') || '<div><small>No fixtures</small></div>'}</div></div>
      ${p.reasons.length ? `<div style="display:flex;flex-direction:column;gap:8px"><p class="sub">Why</p>${p.reasons.map(r => `<div class="reason glass">${r.good ? ICON.ok() : ICON.warn()}<div><p>${esc(r.text)}</p><small>${esc(r.by)}</small></div></div>`).join('')}</div>` : ''}
      <details class="bd glass"><summary>How the ${p.ai} is built ${ICON.down}</summary>
        ${[['Form', f.form, 20], [p.threatLabel, f.threat, 20], ['Next 3 fixtures', f.fixtures, 15], ['Minutes', f.minutes, 15], ['Fitness', f.fitness, 10], [`Creators · ${p.src.creatorsBuy.length} of ${(CR && CR.creators.length) || 4}`, f.creators, 20]].map(([l, v, mx]) => `<div class="b"><div>${esc(l)}<b>${v} / ${mx}</b></div><div class="bar"><i data-w="${100 * v / mx}"></i></div></div>`).join('')}
        <p class="note" style="margin-top:10px">80 points from the FPL API compared with players in the same position, plus up to 20 from the creators.</p></details>`;
    $('#scrim').classList.add('on'); const sh = $('#sheet'); sh.scrollTop = 0; sh.classList.add('on');
    $('#xs').onclick = closeSheet; sh.querySelector('details').addEventListener('toggle', () => bars(sh));
    dragClose($('#grab'), sh);
  }
  function closeSheet() { $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); $('#sheet').style.transform = ''; }
  function dragClose(handle, sh) {
    let y0 = 0, dy = 0, on = false;
    handle.onpointerdown = e => { on = true; y0 = e.clientY; sh.style.transition = 'none'; handle.setPointerCapture(e.pointerId); };
    handle.onpointermove = e => { if (!on) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translate(-50%,${dy}px)`; };
    handle.onpointerup = handle.onpointercancel = () => { if (!on) return; on = false; sh.style.transition = ''; if (dy > 110) closeSheet(); else sh.style.transform = ''; dy = 0; };
  }

  /* ---------- nav ---------- */
  const order = ['home', 'creators', 'team', 'players'];
  function go(tab, instant) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.dataset.screen === tab));
    document.querySelectorAll('.dock button').forEach(b => { if (b.dataset.go === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#ind').style.transform = `translateX(${order.indexOf(tab) * 100}%)`;
    document.body.dataset.tab = tab; if (!instant) window.scrollTo({ top: 0, behavior: 'instant' });
    store.set('tab', tab);
  }
  $('#dock').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.go); };
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o && M) { e.preventDefault(); openPlayer(+o.dataset.open); return; }
    const s = e.target.closest('[data-story]'); if (s) openStory(s.dataset.story);
  });
  $('#scrim').onclick = closeSheet;
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeStory(); } if (story && e.key === 'ArrowRight') $('#vtap').click(); });

  boot();
  const savedId = store.get('fplId'); if (savedId) { const t = setInterval(() => { if (M) { clearInterval(t); checkTeam(savedId); } }, 300); }
})();
