// Validate data/creators.json + data/sites.json against the official FPL player list.
// Usage: node scripts/check.js <bootstrap-static.json>
// Prints every player name that doesn't match an FPL player (fix those before committing).
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '..', 'engine.js'));
const boot = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const cr = read('creators.json'), si = read('sites.json');
const m = globalThis.Engine.build(boot, [], cr, si);
const bad = [];
const chk = (r, where) => { if (r && r.player && !m.resolve(r.player, r.team)) bad.push(`${where}: "${r.player}" (${r.team || '?'})`); };
for (const c of cr.creators || []) {
  (c.buys || []).forEach(r => chk(r, c.name + ' buys'));
  (c.avoids || []).forEach(r => chk(r, c.name + ' avoids'));
  ((c.squad && c.squad.xi) || []).forEach(r => chk(r, c.name + ' xi'));
  ((c.squad && c.squad.bench) || []).forEach(r => chk(typeof r === 'string' ? { player: r } : r, c.name + ' bench'));
  ((c.moves && c.moves.transfers) || []).forEach(t => { chk(t.out, c.name + ' out'); chk(t.in, c.name + ' in'); });
}
(si.items || []).forEach(r => chk(r, r.source));
/* site rows: one per player per source, each with the article's reason */
const seen = new Set();
for (const r of si.items || []) {
  const k = `${r.source}|${r.type}|${r.player}`;
  if (seen.has(k)) bad.push(`${r.source}: "${r.player}" listed twice`); seen.add(k);
  if (!String(r.why || '').trim()) bad.push(`${r.source}: "${r.player}" has no reason (add the article's reason or drop the row)`);
  if (!/^https?:\/\//.test(r.url || '')) bad.push(`${r.source}: "${r.player}" has no article url`);
}
const next = (boot.events || []).find(e => e.is_next);
console.log(`creators gw ${cr.gw} · sites gw ${si.gw} · FPL next gw ${next && next.id}`);
console.log(bad.length ? 'FIX BEFORE COMMIT:\n' + bad.join('\n') : 'All checks passed.');
process.exit(bad.length ? 1 : 0);
