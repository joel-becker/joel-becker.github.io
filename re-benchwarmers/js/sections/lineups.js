// Who said yes to each league game, and how we did in the games each person said yes to against the
// games they missed. The turnout card needs only how many of us said yes; the cards that name people
// need `_lineup`, and hide themselves where the data leaves names out.
//
// Nobody is a special case: everyone who said yes is in `_lineup` and is counted by the same rules. If
// `data.team.me` is a display name, that person's rows are labelled "Me" in bold, and nothing else differs.
import { inPeriod } from "../state.js";
import { h, card, legend, tooltip, focusEvent, dataTable } from "../ui.js";
import { palette, frame, inkOn, hbarPath } from "../charts.js";
import * as F from "../format.js";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NAMED_IDS = ["ppg-pair-card", "ppg-diff-card", "gd-pair-card", "gd-diff-card", "reliable-card", "pairs-card"];
const MIN_SEASONS = 3;  // who is listed: anyone in this many of our seasons
// Women get half the cut-off (rounded up) wherever a card asks for a minimum number of seasons or games:
// it is a coed league with far fewer women, so the usual bar would leave most of them out.
const bar = (n, woman) => (woman ? Math.ceil(n / 2) : n);
const MIN_EACH = 6;     // and at least this many games on each side: said yes to, and missed in their seasons. Joel, 17 Nov 2026:
                        // "minimum 6... for each", for everyone: the women's half rule applies to seasons, not to this.
/** A person is their display name with case, spaces and punctuation ignored: "Sam T." and "sam t" are one person. */
const key = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const pl = (n, word) => `${F.int(n)} ${word}${n === 1 ? "" : "s"}`;
const ppl = (n) => `${F.int(n)} ${n === 1 ? "person" : "people"}`;
const signed = (v, digits = 1) => { const r = +v.toFixed(digits); return `${r > 0 ? "+" : r < 0 ? "−" : ""}${F.num(Math.abs(r), digits)}`; };
/** The "Private" tag on a card that names people: only on a page where the names are shown locally (`data.team.private`). */
const tagPrivate = (c, priv) => { if (priv) c.head.querySelector("h3").append(h("span", { class: "private-tag", style: { marginLeft: "8px" } }, "Private")); };
/** A name for a table cell: "Me" in bold for the person the page is about, the display name for everyone else. */
const nameCell = (m) => (m.me ? h("strong", {}, m.label) : m.label);

/** Record and goals per game over a set of league games (a forfeit has a result but no score). */
function tally(games) {
  const n = games.length;
  const w = games.filter((r) => r.result === "W").length, t = games.filter((r) => r.result === "T").length;
  const scored = games.filter((r) => r.gf != null);
  const gf = scored.length ? d3.mean(scored, (r) => r.gf) : null, ga = scored.length ? d3.mean(scored, (r) => r.ga) : null;
  return { n, w, t, l: n - w - t, win: n ? w / n : null, ppg: n ? (3 * w + t) / n : null, gf, ga, gd: gf == null ? null : gf - ga };
}

export function render(data, p) {
  const league = data.soccer.league || [];
  const team = data.team || {};
  const priv = !!team.private;
  const named = league.some((r) => r._lineup);
  for (const id of NAMED_IDS) { const el = document.getElementById(id); if (el) el.hidden = !named; }
  const turnoutEl = document.getElementById("turnout-card");
  if (turnoutEl) turnoutEl.hidden = !league.some((r) => r.yes != null);
  const games = league.filter((r) => inPeriod(r.date, p));
  const P = palette();
  if (turnoutEl && !turnoutEl.hidden) { try { renderTurnout(turnoutEl, games, P); } catch (err) { console.error("turnout-card", err); } }
  if (!named) return;

  // each person's games: those they said yes to, and the other games of the seasons they were in
  const known = games.filter((r) => r._lineup);
  const seasonKey = (r) => `${r.season}|${WEEKDAY[r._date.getDay()]}`;   // two seasons can start in one month, on different nights
  const meKey = team.me ? key(team.me) : null;
  const isMe = (name) => meKey != null && key(name) === meKey;
  const people = new Map();
  const person = (name) => {
    const k = key(name);
    if (!people.has(k)) people.set(k, { k, name, me: k === meKey, label: k === meKey ? "Me" : name, yes: [], seasons: new Set() });
    return people.get(k);
  };
  for (const r of known) for (const name of r._lineup) {
    const m = person(name);
    m.yes.push(r);
    m.seasons.add(seasonKey(r));
  }
  // people on a squad list who never said yes still count as having been in that season
  const inPeriodSeasons = new Set(games.map(seasonKey));
  for (const s of data.soccer._squads || []) {
    const sk = `${s.season}|${s.weekday}`;
    if (!inPeriodSeasons.has(sk)) continue;
    for (const name of s.players) person(name).seasons.add(sk);
  }
  for (const m of people.values()) {
    const mine = new Set(m.yes);
    // "without": the games they didn't say yes to in the seasons they were in (on the squad list, or said yes to another of its games)
    m.no = known.filter((r) => !mine.has(r) && m.seasons.has(seasonKey(r)));
    m.with = tally(m.yes);
    m.without = tally(m.no);
    m.nSeasons = m.seasons.size;
    m.woman = !!data.soccer._women?.has(m.name.toLowerCase());
    m.rate = m.yes.length + m.no.length ? m.yes.length / (m.yes.length + m.no.length) : 0;
  }
  const ctx = { P, known, unlisted: games.length - known.length, people: [...people.values()], isMe, women: data.soccer._women, priv };
  const cards = [...METRICS.flatMap((m) => [[`${m.id}-pair-card`, (el, c) => renderPair(el, c, m)], [`${m.id}-diff-card`, (el, c) => renderDiff(el, c, m)]]),
    ["reliable-card", renderReliable], ["pairs-card", renderPairs]];
  for (const [id, fn] of cards) {
    const el = document.getElementById(id);
    if (!el) continue;
    try { fn(el, ctx); } catch (err) { console.error(id, err); }
  }
}

/** A card with nothing to draw in this period. `priv`: it would have named people, on a page that tags those cards. */
function empty(el, title, text, priv = false) {
  const c = card(el, { title, table: false });
  tagPrivate(c, priv);
  c.body.append(h("div", { class: "empty-state" }, text));
  legend(c.legend, []);
}
const TOO_FEW = "Too few games with a list of who said yes in this period";

// ---------------------------------------------------------------- how many said yes

const BINS = [
  { id: "short", label: "7 or fewer", test: (n) => n <= 7 }, { id: "8", label: "8", test: (n) => n === 8 }, { id: "9", label: "9", test: (n) => n === 9 },
  { id: "10", label: "10", test: (n) => n === 10 }, { id: "11", label: "11", test: (n) => n === 11 }, { id: "12", label: "12 or more", test: (n) => n >= 12 },
];
const FEW_GAMES = 10;   // a row with fewer games than this is drawn paler

function renderTurnout(el, games, P) {
  const known = games.filter((r) => r.yes != null);
  if (known.length < 10) return empty(el, "How many of us said yes", "Too few games with a count of who said yes in this period");
  const rows = BINS.map((b) => ({ ...b, ...tally(known.filter((r) => b.test(r.yes))) })).filter((r) => r.n);
  const few = tally(known.filter((r) => r.yes <= 8)), many = tally(known.filter((r) => r.yes >= 10));
  const med = d3.median(known, (r) => r.yes);
  const enough = few.n >= 10 && many.n >= 10;
  const c = card(el, {
    title: enough
      ? `With 10 or more of us saying yes we win ${F.pct(many.win)} of games (${F.int(many.n)}); with 8 or fewer, ${F.pct(few.win)} (${F.int(few.n)})`
      : `A typical game has ${F.int(med)} of us saying yes`,
    sub: `Each bar is the games where that many of us had said yes on the league's site beforehand: the share we won, tied and lost, how many games, and the goals we scored and let in per game. ` +
      `A typical game has ${F.int(med)}.${rows.some((r) => r.n < FEW_GAMES) ? ` Paler bars are fewer than ${FEW_GAMES} games.` : ""} Saying yes isn't the same as turning up, and stronger squads may simply be keener.`,
  });
  const bodyW = Math.max(280, c.body.getBoundingClientRect().width || 520);
  const narrow = bodyW < 430;
  const rowH = 38;
  // on a phone the goals a game move to the tooltip and the table, so the bars keep their width
  const f = frame(c.body, { height: rows.length * rowH + 28, margin: { left: 78, right: narrow ? 40 : 118, top: 20, bottom: 4 } });
  const { g, w } = f;
  g.append("text").attr("class", "annot-muted").attr("x", -78).attr("y", -8).text("Said yes");
  g.append("text").attr("class", "annot-muted").attr("x", w + 12).attr("y", -8).text(narrow ? "Games" : "Games · goals a game");
  const colors = { w: P.win, t: P.tie, l: P.loss }, names = { w: "Won", t: "Tied", l: "Lost" };
  rows.forEach((r, i) => {
    const y = i * rowH, faded = r.n < FEW_GAMES;
    g.append("text").attr("class", "annot").attr("x", -12).attr("y", y + 14).attr("dy", "0.32em").attr("text-anchor", "end").text(r.label);
    let acc = 0;
    for (const k of ["w", "t", "l"]) {
      const share = r[k] / r.n;
      if (!share) continue;
      const x0 = acc * w + (acc ? 2 : 0), ww = Math.max(0, share * w - (acc ? 2 : 0));
      acc += share;
      g.append("rect").attr("x", x0).attr("y", y + 2).attr("width", ww).attr("height", 24).attr("rx", 4).attr("fill", colors[k]).attr("opacity", faded ? 0.45 : 1);
      if (k === "w" && ww > 36) g.append("text").attr("x", x0 + 7).attr("y", y + 14).attr("dy", "0.34em").attr("fill", inkOn(colors[k])).attr("pointer-events", "none")
        .style("font", "600 11.5px var(--sans)").text(F.pct(share));
      g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", x0).attr("y", y).attr("width", ww).attr("height", 28)
        .on("pointerenter pointermove focus", function (ev) {
          tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: `${r.label} said yes · ${pl(r.n, "game")}`,
            rows: [{ label: names[k], value: `${F.int(r[k])} (${F.pct(share)})`, color: colors[k] },
              ...(r.gf != null ? [{ label: "Goals a game", value: `${F.num(r.gf, 1)} scored, ${F.num(r.ga, 1)} let in` }] : [])] });
        })
        .on("pointerleave blur", () => tooltip.hide());
    }
    g.append("text").attr("class", faded ? "annot-muted" : "annot").attr("x", w + 12).attr("y", y + 14).attr("dy", "0.32em")
      .text(`${F.int(r.n)}${!narrow && r.gf != null ? ` · ${F.num(r.gf, 1)}–${F.num(r.ga, 1)}` : ""}`);
  });
  legend(c.legend, [{ label: "Won", color: P.win }, { label: "Tied", color: P.tie }, { label: "Lost", color: P.loss }]);
  c.setTable([{ label: "Said yes", value: (r) => r.label }, { label: "Games", num: true, value: (r) => r.n }, { label: "W", num: true, value: (r) => r.w },
    { label: "T", num: true, value: (r) => r.t }, { label: "L", num: true, value: (r) => r.l }, { label: "Won", num: true, value: (r) => F.pct(r.win) },
    { label: "Scored a game", num: true, value: (r) => (r.gf == null ? "–" : F.num(r.gf, 2)) }, { label: "Let in a game", num: true, value: (r) => (r.ga == null ? "–" : F.num(r.ga, 2)) }], rows);
}

// ---------------------------------------------------------------- with and without each of us

// Two measures, each drawn twice: the games a person said yes to against the other games of the seasons they
// were in (a pair of dots), and the gap between the two (a bar). Goals scored and goals let in are
// folded into the goal-difference pair: beside each row of the dots, and as the two parts of each gap bar.
const METRICS = [
  { id: "ppg", get: (t) => t.ppg, name: "points", axis: "Points a game (3 for a win, 1 for a tie)", lead: "Points", col: "Points a game", word: "more",
    withText: (m) => `we take ${F.num(m.with.ppg, 2)} points a game`, withoutText: (m) => F.num(m.without.ppg, 2) },
  { id: "gd", get: (t) => t.gd, signedValues: true, name: "goal difference", axis: "Goal difference a game", lead: "Goal difference", col: "Goal diff. a game", word: "better",
    withText: (m) => `our goal difference is ${signed(m.with.gd)} a game`, withoutText: (m) => `${signed(m.without.gd)}` },
];

/**
 * Everyone listed, biggest gap first. The rules are Joel's (CLAUDE.md): in three or more seasons (two for women),
 * at least six games said yes to and six missed in those seasons (not halved), and the comparison is pooled:
 * every game they said yes to against every game they missed in the seasons they were in.
 */
function compared({ people }, metric) {
  return people.filter((m) => m.nSeasons >= bar(MIN_SEASONS, m.woman) && m.with.n >= MIN_EACH && metric.get(m.with) != null
    && m.without.n >= MIN_EACH && metric.get(m.without) != null)
    .map((m) => ({ ...m, a: metric.get(m.with), b: metric.get(m.without), d: metric.get(m.with) - metric.get(m.without) }))
    .sort((x, y) => y.d - x.d || y.with.n - x.with.n);
}
const whoListed = `Everyone in ${MIN_SEASONS} or more of our seasons (${bar(MIN_SEASONS, true)} for women) who said yes to at least ${MIN_EACH} games and missed at least ${MIN_EACH} games of those seasons`;
const CAVEAT = "Saying yes isn't turning up, the groups are small (the table counts the games on each side), and who is free on which night isn't random: a curiosity, not a rating.";
const NOBODY = `Nobody in this period has been in ${MIN_SEASONS} of our seasons (${bar(MIN_SEASONS, true)} for women), said yes to ${MIN_EACH} games and missed ${MIN_EACH}`;
const fmtVal = (metric, v, digits = 1) => (metric.signedValues ? signed(v, digits) : F.num(v, metric.id === "ppg" ? Math.max(digits, 2) : digits));
const tip = (m, metric) => {
  const line = (t) => `${pl(t.n, "game")}, ${t.w} W · ${t.t} T · ${t.l} L, ${F.num(t.gf, 1)}–${F.num(t.ga, 1)} a game`;
  return { title: m.label, rows: [
    { label: "Said yes", value: `${fmtVal(metric, m.a, 2)}  (${line(m.with)})` },
    { label: "Their seasons without them", value: `${fmtVal(metric, m.b, 2)}  (${line(m.without)})` },
    { label: "Difference", value: `${signed(m.d, 2)} a game` }] };
};
// short headers, so the seven columns fit a half-width card: games said yes to and the figure for them, games missed and the figure for those
const compareTable = (metric) => [
  { label: "Who", value: nameCell }, { label: "Seasons", num: true, value: (m) => m.nSeasons },
  { label: "Said yes", num: true, value: (m) => m.with.n }, { label: metric.col, num: true, value: (m) => fmtVal(metric, m.a, 2) },
  { label: "Missed", num: true, value: (m) => m.without.n }, { label: metric.col, num: true, value: (m) => fmtVal(metric, m.b, 2) },
  { label: "Gap", num: true, value: (m) => signed(m.d, 2) },
];
/**
 * The person a title names: the biggest gap in our favour, skipping "Me" (a poor headline). Null when nobody's
 * gap is in our favour: a title never names someone for a gap that goes against them.
 */
const headline = (rows) => rows.find((m) => !m.me && m.d > 0) || null;

function renderPair(el, ctx, metric) {
  const { P, known, priv } = ctx;
  const topic = `Our ${metric.name} in the games each of us said yes to, and in the ones they missed`;
  if (known.length < 10) return empty(el, topic, TOO_FEW, priv);
  const rows = compared(ctx, metric);
  if (!rows.length) return empty(el, topic, NOBODY, priv);
  const best = headline(rows);
  const c = card(el, {
    title: best
      ? `With ${best.label} saying yes ${metric.withText(best)} (${pl(best.with.n, "game")}), against ${metric.withoutText(best)} in the same seasons without them (${F.int(best.without.n)})`
      : topic,
    sub: `Filled dot: the games each person said yes to. Hollow dot: the other games of the seasons they were in the squad. Further right is better; the biggest gain is at the top. ` +
      `${whoListed}. ` +
      (ctx.unlisted > 0 ? `${pl(ctx.unlisted, "game")} with no list of who said yes ${ctx.unlisted === 1 ? "is" : "are"} left out. ` : "") + CAVEAT,
  });
  tagPrivate(c, priv);
  c.setTable(compareTable(metric), rows);
  const bodyW = Math.max(280, c.body.getBoundingClientRect().width || 520);
  const narrow = bodyW < 430;
  const goals = metric.id === "gd";   // show goals scored-let in a game beside each row, with and without
  const rowH = 22, textW = narrow ? 0 : goals ? 132 : 118;
  const f = frame(c.body, { height: rows.length * rowH + 46, margin: { left: 96, right: textW + 10, top: 26, bottom: 20 } });
  const { g, w } = f;
  const ext = d3.extent(rows.flatMap((m) => [m.a, m.b]));
  const x = d3.scaleLinear().domain(metric.signedValues ? [Math.min(ext[0], -0.5), Math.max(ext[1], 0.5)] : [0, ext[1]]).nice(5).range([0, w]);
  const hh = rows.length * rowH;
  for (const t of x.ticks(narrow ? 4 : 6)) {
    g.append("line").attr("class", "gridline").attr("x1", Math.round(x(t)) + 0.5).attr("x2", Math.round(x(t)) + 0.5).attr("y1", 0).attr("y2", hh);
    g.append("text").attr("class", "annot-muted").attr("x", x(t)).attr("y", hh + 14).attr("text-anchor", "middle").text(metric.signedValues ? signed(t, Number.isInteger(t) ? 0 : 1) : F.num(t, Number.isInteger(t) ? 0 : 1));
  }
  if (metric.signedValues) g.append("line").attr("x1", Math.round(x(0)) + 0.5).attr("x2", Math.round(x(0)) + 0.5).attr("y1", -4).attr("y2", hh).attr("stroke", P.ink2);
  g.append("text").attr("class", "annot-muted").attr("x", 0).attr("y", -12).text(metric.axis);
  if (!narrow) g.append("text").attr("class", "annot-muted").attr("x", w + 10 + textW).attr("y", -12).attr("text-anchor", "end")
    .text(goals ? "scored–let in: with · without" : "with · without (games)");
  rows.forEach((m, i) => {
    const y = i * rowH + rowH / 2;
    g.append("text").attr("class", "annot").attr("x", -10).attr("y", y).attr("dy", "0.32em").attr("text-anchor", "end").style("font-weight", m.me ? 600 : null).text(m.label);
    g.append("line").attr("x1", x(m.b)).attr("x2", x(m.a)).attr("y1", y).attr("y2", y).attr("stroke", P.muted).attr("stroke-width", 2);
    g.append("circle").attr("cx", x(m.b)).attr("cy", y).attr("r", 4).attr("fill", P.surface).attr("stroke", P.muted).attr("stroke-width", 2);
    g.append("circle").attr("cx", x(m.a)).attr("cy", y).attr("r", 5).attr("fill", P.soccer).attr("stroke", P.surface).attr("stroke-width", 2);
    if (!narrow) {
      const t = g.append("text").attr("x", w + 10 + textW).attr("y", y).attr("dy", "0.32em").attr("text-anchor", "end");
      t.append("tspan").attr("class", "annot").style("font-weight", 600).text(goals ? `${F.num(m.with.gf, 1)}–${F.num(m.with.ga, 1)}` : fmtVal(metric, m.a));
      t.append("tspan").attr("class", "annot-muted").text(goals ? ` · ${F.num(m.without.gf, 1)}–${F.num(m.without.ga, 1)}` : ` (${F.int(m.with.n)}) · ${fmtVal(metric, m.b)} (${F.int(m.without.n)})`);
    }
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", -6).attr("y", i * rowH).attr("width", w + 12).attr("height", rowH)
      .on("pointerenter pointermove focus", function (ev) { tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, tip(m, metric)); })
      .on("pointerleave blur", () => tooltip.hide());
  });
  legend(c.legend, [{ label: "Games they said yes to", color: P.soccer, mark: "dt" }, { label: "Their seasons, games without them", color: P.muted, mark: "dt" }]);
}

function renderDiff(el, ctx, metric) {
  if (metric.id === "gd") return renderGoalGap(el, ctx, metric);
  const { P, known, priv } = ctx;
  const topic = `The gap in ${metric.name}: with them minus without`;
  if (known.length < 10) return empty(el, topic, TOO_FEW, priv);
  const rows = compared(ctx, metric);
  if (!rows.length) return empty(el, topic, NOBODY, priv);
  const best = headline(rows);
  const above = `the gap is above zero for ${F.int(rows.filter((m) => m.d > 0).length)} of ${ppl(rows.length)}`;
  const c = card(el, {
    title: `${metric.lead}: ` + (best ? `${F.num(best.d, metric.id === "ppg" ? 2 : 1)} a game ${metric.word} with ${best.label} than without; ` : "") + above,
    sub: `Each bar is our ${metric.name} per game in the games that person said yes to, minus the same in their seasons' other games. ` +
      `Right of zero means we did better with them; same order as the with-and-without chart. ${CAVEAT}`,
  });
  tagPrivate(c, priv);
  c.setTable(compareTable(metric), rows);
  const bodyW = Math.max(280, c.body.getBoundingClientRect().width || 520);
  const narrow = bodyW < 430;
  const rowH = 22, textW = narrow ? 44 : 104;
  const f = frame(c.body, { height: rows.length * rowH + 46, margin: { left: 96, right: textW + 10, top: 26, bottom: 20 } });
  const { g, w } = f;
  const max = d3.max(rows, (m) => Math.abs(m.d)) || 1;
  const x = d3.scaleLinear().domain([-max, max]).nice(5).range([0, w]);
  const hh = rows.length * rowH;
  for (const t of x.ticks(narrow ? 4 : 6)) {
    g.append("line").attr("class", "gridline").attr("x1", Math.round(x(t)) + 0.5).attr("x2", Math.round(x(t)) + 0.5).attr("y1", 0).attr("y2", hh);
    g.append("text").attr("class", "annot-muted").attr("x", x(t)).attr("y", hh + 14).attr("text-anchor", "middle").text(signed(t, Number.isInteger(t) ? 0 : 1));
  }
  g.append("line").attr("x1", Math.round(x(0)) + 0.5).attr("x2", Math.round(x(0)) + 0.5).attr("y1", -4).attr("y2", hh).attr("stroke", P.ink2);
  g.append("text").attr("class", "annot-muted").attr("x", 0).attr("y", -12).text(narrow ? `Gap in ${metric.name} a game` : `Difference in ${metric.name} a game`);
  g.append("text").attr("class", "annot-muted").attr("x", w + 10 + textW).attr("y", -12).attr("text-anchor", "end").text(narrow ? "gap" : "gap · games");
  rows.forEach((m, i) => {
    const y = i * rowH;
    const fill = m.d >= 0 ? P.win : P.loss;
    g.append("text").attr("class", "annot").attr("x", -10).attr("y", y + rowH / 2).attr("dy", "0.32em").attr("text-anchor", "end").style("font-weight", m.me ? 600 : null).text(m.label);
    const x0 = Math.min(x(0), x(m.d)), ww = Math.abs(x(m.d) - x(0));
    g.append("path").attr("fill", fill).attr("d", m.d >= 0 ? hbarPath(x0, y + 4, ww, rowH - 8) : mirrorBar(x0, y + 4, ww, rowH - 8));
    const t = g.append("text").attr("x", w + 10 + textW).attr("y", y + rowH / 2).attr("dy", "0.32em").attr("text-anchor", "end");
    t.append("tspan").attr("class", "annot").style("font-weight", 600).text(signed(m.d, metric.id === "ppg" ? 2 : 1));
    if (!narrow) t.append("tspan").attr("class", "annot-muted").text(` · ${F.int(m.with.n)} v ${F.int(m.without.n)}`);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", -6).attr("y", y).attr("width", w + 12).attr("height", rowH)
      .on("pointerenter pointermove focus", function (ev) { tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, tip(m, metric)); })
      .on("pointerleave blur", () => tooltip.hide());
  });
  legend(c.legend, [{ label: "We did better with them", color: P.win }, { label: "We did better without them", color: P.loss }]);
}

/**
 * The goal-difference gap split into its two parts: scoring more (or less) with them, and letting in fewer
 * (or more). The parts add up to the gap, which is marked with a dot; when they pull in opposite
 * directions they sit either side of zero.
 */
function renderGoalGap(el, ctx, metric) {
  const { P, known, priv } = ctx;
  const topic = "The gap in goal difference: scoring and conceding";
  if (known.length < 10) return empty(el, topic, TOO_FEW, priv);
  const rows = compared(ctx, metric).map((m) => ({ ...m, att: m.with.gf - m.without.gf, def: m.without.ga - m.with.ga }));
  if (!rows.length) return empty(el, topic, NOBODY, priv);
  const best = headline(rows);
  const A = P.soccer, D = P.cat[6];
  const part = (v, more, less) => `${F.num(Math.abs(v), 1)} ${v >= 0 ? more : less}`;
  const c = card(el, {
    title: best
      ? `With ${best.label} we are ${F.num(best.d, 1)} goals a game better off: we score ${part(best.att, "more", "fewer")} and let in ${part(best.def, "fewer", "more")}`
      : `Goal difference: the gap is above zero for ${F.int(rows.filter((m) => m.d > 0).length)} of ${ppl(rows.length)}`,
    sub: "Each bar is the gap in our goal difference per game (games they said yes to, minus their seasons' other games), split into two parts: how many more goals we score with them, " +
      "and how many fewer we let in. Right of zero is better; the dot is the two added together. Same order as the with-and-without chart. " + CAVEAT,
  });
  tagPrivate(c, priv);
  c.setTable([
    { label: "Who", value: nameCell }, { label: "Said yes", num: true, value: (m) => m.with.n },
    { label: "Scored", num: true, value: (m) => F.num(m.with.gf, 2) }, { label: "Let in", num: true, value: (m) => F.num(m.with.ga, 2) },
    { label: "Missed", num: true, value: (m) => m.without.n },
    { label: "Scored", num: true, value: (m) => F.num(m.without.gf, 2) }, { label: "Let in", num: true, value: (m) => F.num(m.without.ga, 2) },
    { label: "We score more by", num: true, value: (m) => signed(m.att, 2) }, { label: "We let in fewer by", num: true, value: (m) => signed(m.def, 2) },
    { label: "Gap", num: true, value: (m) => signed(m.d, 2) },
  ], rows);
  const bodyW = Math.max(280, c.body.getBoundingClientRect().width || 520);
  const narrow = bodyW < 430;
  const rowH = 22, textW = narrow ? 44 : 104;
  const f = frame(c.body, { height: rows.length * rowH + 46, margin: { left: 96, right: textW + 10, top: 26, bottom: 20 } });
  const { g, w } = f;
  // each row's bar runs from the sum of its negative parts to the sum of its positive parts
  const reach = d3.max(rows, (m) => Math.max(Math.max(m.att, 0) + Math.max(m.def, 0), -(Math.min(m.att, 0) + Math.min(m.def, 0)))) || 1;
  const x = d3.scaleLinear().domain([-reach, reach]).nice(5).range([0, w]);
  const hh = rows.length * rowH;
  for (const t of x.ticks(narrow ? 4 : 6)) {
    g.append("line").attr("class", "gridline").attr("x1", Math.round(x(t)) + 0.5).attr("x2", Math.round(x(t)) + 0.5).attr("y1", 0).attr("y2", hh);
    g.append("text").attr("class", "annot-muted").attr("x", x(t)).attr("y", hh + 14).attr("text-anchor", "middle").text(signed(t, Number.isInteger(t) ? 0 : 1));
  }
  g.append("line").attr("x1", Math.round(x(0)) + 0.5).attr("x2", Math.round(x(0)) + 0.5).attr("y1", -4).attr("y2", hh).attr("stroke", P.ink2);
  g.append("text").attr("class", "annot-muted").attr("x", 0).attr("y", -12).text(narrow ? "Goals a game: with − without" : "Goals a game, with them minus without");
  g.append("text").attr("class", "annot-muted").attr("x", w + 10 + textW).attr("y", -12).attr("text-anchor", "end").text(narrow ? "gap" : "gap · games");
  rows.forEach((m, i) => {
    const y = i * rowH;
    g.append("text").attr("class", "annot").attr("x", -10).attr("y", y + rowH / 2).attr("dy", "0.32em").attr("text-anchor", "end").style("font-weight", m.me ? 600 : null).text(m.label);
    // stack the parts outwards from zero, each on its own side
    let pos = 0, neg = 0;
    for (const [v, fill] of [[m.att, A], [m.def, D]]) {
      if (!v) continue;
      const from = v > 0 ? pos : neg, to = from + v;
      if (v > 0) pos = to; else neg = to;
      const x0 = Math.min(x(from), x(to)), ww = Math.abs(x(to) - x(from));
      const inner = from !== 0 ? 2 : 0;   // a surface gap between the two parts when they stack on one side
      g.append("rect").attr("x", x0 + (v > 0 ? inner : 0)).attr("y", y + 4).attr("width", Math.max(0, ww - inner)).attr("height", rowH - 8).attr("rx", 3).attr("fill", fill);
    }
    g.append("circle").attr("cx", x(m.d)).attr("cy", y + rowH / 2).attr("r", 4).attr("fill", P.ink).attr("stroke", P.surface).attr("stroke-width", 2);
    const t = g.append("text").attr("x", w + 10 + textW).attr("y", y + rowH / 2).attr("dy", "0.32em").attr("text-anchor", "end");
    t.append("tspan").attr("class", "annot").style("font-weight", 600).text(signed(m.d));
    if (!narrow) t.append("tspan").attr("class", "annot-muted").text(` · ${F.int(m.with.n)} v ${F.int(m.without.n)}`);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", -6).attr("y", y).attr("width", w + 12).attr("height", rowH)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: m.label, rows: [
          { label: "Said yes", value: `${F.num(m.with.gf, 2)} scored, ${F.num(m.with.ga, 2)} let in (${pl(m.with.n, "game")})` },
          { label: "Their seasons without them", value: `${F.num(m.without.gf, 2)} scored, ${F.num(m.without.ga, 2)} let in (${pl(m.without.n, "game")})` },
          { label: "Scoring", value: `${signed(m.att, 2)} a game`, color: A }, { label: "Letting in", value: `${signed(m.def, 2)} a game (fewer is +)`, color: D },
          { label: "Goal difference gap", value: `${signed(m.d, 2)} a game`, color: P.ink }] });
      })
      .on("pointerleave blur", () => tooltip.hide());
  });
  legend(c.legend, [{ label: "We score more (right) or fewer (left)", color: A }, { label: "We let in fewer (right) or more (left)", color: D },
    { label: "The two together: goal difference gap", color: P.ink, mark: "dt" }]);
}

/** A bar that grows leftwards from its right edge: rounded on the left end, square at the zero line. */
function mirrorBar(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return "";
  r = Math.min(r, h / 2, w);
  return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
}

// ---------------------------------------------------------------- who says yes most

function renderReliable(el, { P, people, priv }) {
  const topic = "Who says yes most often";
  const listed = people.filter((m) => m.nSeasons >= bar(MIN_SEASONS, m.woman) && m.yes.length >= MIN_EACH);
  const rows = listed.slice().sort((a, b) => b.rate - a.rate || b.yes.length - a.yes.length).slice(0, 40);
  if (rows.length < 3) return empty(el, topic, `Too few people in this period have been in ${MIN_SEASONS} of our seasons (${bar(MIN_SEASONS, true)} for women) and said yes to ${MIN_EACH} games`, priv);
  const top = rows.find((m) => !m.me) || rows[0];   // "Me" is a poor headline
  const c = card(el, {
    title: `${top.label} says yes to ${F.pct(top.rate)} of games (${F.int(top.yes.length)} of ${F.int(top.yes.length + top.no.length)}); ` +
      `the typical person listed says yes to ${F.pct(d3.median(listed, (m) => m.rate))}`,
    sub: `The share of games each person said yes to, out of every game in the seasons they were in the squad, for everyone in ${MIN_SEASONS} or more of our seasons ` +
      `(${bar(MIN_SEASONS, true)} for women) who said yes to at least ${MIN_EACH} games${listed.length > rows.length ? `: the first ${F.int(rows.length)} of ${F.int(listed.length)}` : ""}. ` +
      `Beside each bar: games said yes to, out of games in their seasons.`,
  });
  tagPrivate(c, priv);
  const rowH = 24;
  const f = frame(c.body, { height: rows.length * rowH + 8, margin: { left: 96, right: 78, top: 4, bottom: 2 } });
  const { g, w } = f;
  const x = d3.scaleLinear().domain([0, 1]).range([0, w]);
  rows.forEach((m, i) => {
    const y = i * rowH;
    g.append("text").attr("class", "annot").attr("x", -10).attr("y", y + 10).attr("dy", "0.32em").attr("text-anchor", "end").style("font-weight", m.me ? 600 : null).text(m.label);
    g.append("rect").attr("x", 0).attr("y", y + 3).attr("width", w).attr("height", 14).attr("rx", 4).attr("fill", P.seq[0]);
    g.append("path").attr("d", hbarPath(0, y + 3, x(m.rate), 14)).attr("fill", P.soccer);
    g.append("text").attr("class", "annot-muted").attr("x", w + 8).attr("y", y + 10).attr("dy", "0.32em").text(`${F.pct(m.rate)} · ${m.yes.length}/${m.yes.length + m.no.length}`);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", 0).attr("y", y).attr("width", w).attr("height", rowH)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: m.label, rows: [
          { label: "Said yes", value: `${F.int(m.yes.length)} of ${pl(m.yes.length + m.no.length, "game")}`, color: P.soccer }, { label: "Share", value: F.pct(m.rate) },
          { label: "Seasons", value: F.int(m.nSeasons) }] });
      })
      .on("pointerleave blur", () => tooltip.hide());
  });
  legend(c.legend, []);
  c.setTable([{ label: "Who", value: nameCell }, { label: "Said yes", num: true, value: (m) => m.yes.length },
    { label: "Out of", num: true, value: (m) => m.yes.length + m.no.length }, { label: "Share", num: true, value: (m) => F.pct(m.rate) }],
  listed.slice().sort((a, b) => b.yes.length - a.yes.length));
}

// ---------------------------------------------------------------- pairs

const PAIR_GAMES = 12;   // shared games for a pair to be listed; half (6) when either of the two is a woman
const PAIR_ROWS = 40;

function renderPairs(el, { P, known, women, isMe, priv }) {
  const topic = "Pairs who said yes to the same games";
  const pairs = new Map();
  for (const r of known) {
    const names = r._lineup.slice().sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const k = `${key(names[i])}|${key(names[j])}`;
      if (!pairs.has(k)) pairs.set(k, { a: names[i], b: names[j], games: [] });
      pairs.get(k).games.push(r);
    }
  }
  const isWoman = (name) => !!women?.has(name.toLowerCase());
  const who = (name) => (isMe(name) ? { me: true, label: "Me" } : { me: false, label: name });
  const all = [...pairs.values()].filter((q) => q.games.length >= bar(PAIR_GAMES, isWoman(q.a) || isWoman(q.b)))
    .map((q) => ({ ...q, ...tally(q.games), pa: who(q.a), pb: who(q.b) })).filter((q) => q.gd != null)
    .sort((x, y) => y.gd - x.gd || y.n - x.n);
  if (!all.length) return empty(el, topic, `No two of us said yes to ${PAIR_GAMES} of the same games in this period`, priv);
  const rows = all.slice(0, PAIR_ROWS);
  const best = rows.find((q) => !q.pa.me && !q.pb.me) || rows[0];   // "Me" is a poor headline
  const c = card(el, {
    title: `${best.pa.label} and ${best.pb.label} together: ${best.w} W · ${best.t} T · ${best.l} L in ${pl(best.n, "game")}, ${signed(best.gd)} goals a game`,
    sub: `Every two of us who both said yes to ${PAIR_GAMES} or more of the same games (${bar(PAIR_GAMES, true)} when either is a woman), best goal difference first` +
      `${all.length > rows.length ? `: the first ${F.int(rows.length)} of ${F.int(all.length)} pairs` : ""}. Small samples, and the same games count for many pairs: a curiosity, not a rating.`,
    table: false,
  });
  tagPrivate(c, priv);
  legend(c.legend, []);
  const pair = (q) => [nameCell(q.pa), " + ", nameCell(q.pb)];
  const goals = (q) => `${F.num(q.gf, 1)}–${F.num(q.ga, 1)}`;
  const narrow = Math.max(280, c.body.getBoundingClientRect().width || 520) < 430;
  // eight columns don't fit a phone: there the record goes on a second line under the pair's names
  const columns = narrow ? [
    { label: "Pair", value: (q) => [...pair(q), h("div", { style: { color: P.muted, fontSize: "12px", marginTop: "2px" } }, `${pl(q.n, "game")}: ${q.w} W · ${q.t} T · ${q.l} L`)] },
    { label: "Goals", num: true, value: goals }, { label: "Diff.", num: true, value: (q) => signed(q.gd, 2) },
  ] : [
    { label: "Pair", value: pair }, { label: "Games", num: true, value: (q) => q.n },
    { label: "W", num: true, value: (q) => q.w }, { label: "T", num: true, value: (q) => q.t }, { label: "L", num: true, value: (q) => q.l },
    { label: "Won", num: true, value: (q) => F.pct(q.win) }, { label: "Goals a game", num: true, value: goals },
    { label: "Diff.", num: true, value: (q) => signed(q.gd, 2) },
  ];
  c.body.append(h("div", { class: "table-wrap", style: { maxHeight: "360px", overflowY: "auto" } }, dataTable(columns, rows)));
}
