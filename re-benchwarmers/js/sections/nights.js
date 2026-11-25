// Game nights: who said yes to each of our league games, drawn game by game, plus what our record looks
// like by how many women said yes, with drop-ins, and with a lineup of familiar faces.
// Every card here needs the per-game lineups (`_lineup`, and `_women` or `_dropins` for those two cards):
// where the data leaves them out, the card hides itself.
// An RSVP is not attendance: the words are always "said yes".
import { inPeriod } from "../state.js?v=e2d29b3696";
import { h, card, legend, tooltip, focusEvent } from "../ui.js?v=e2d29b3696";
import { palette, frame, inkOn, hbarPath } from "../charts.js?v=e2d29b3696";
import * as F from "../format.js?v=e2d29b3696";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MIN_GAMES = 10;   // games with a lineup needed before any card draws
const MIN_GROUP = 6;    // a group of games smaller than this is merged into a neighbour
const MAX_COLS = 90, MAX_ROWS = 24; // grid: most recent games (fewer when they would not fit), and rows (one per person)
const REGULAR_AFTER = 10; // a "familiar face" had already said yes to this many of our earlier games (half that, rounded up, for women)
const key = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const pl = (n, word) => `${F.int(n)} ${word}${n === 1 ? "" : "s"}`;
const persons = (n) => `${F.int(n)} different ${n === 1 ? "person" : "people"}`;
const seasonKey = (r) => `${r.season}|${WEEKDAY[r._date.getDay()]}`;
const seasonMonth = (r) => d3.timeParse("%Y-%m")(r.season) || d3.timeMonth.floor(r._date);
const RES_WORD = { W: "Won", T: "Tied", L: "Lost" };
const scoreText = (r) => (r.gf == null ? `${RES_WORD[r.result]} (no score recorded)` : `${RES_WORD[r.result]} ${r.gf}–${r.ga}`);
// said only where data.team.private is true (the training log, where names stay on one machine)
const LINEUPS_NOTE = "The lineups behind this are only kept on this Mac.", NAMES_NOTE = "Names are only shown on this Mac.";

/** Record and goals per game over a set of league games (a forfeit has a result but no score). */
function tally(games) {
  const n = games.length;
  const w = games.filter((r) => r.result === "W").length, t = games.filter((r) => r.result === "T").length;
  const scored = games.filter((r) => r.gf != null);
  const gf = scored.length ? d3.mean(scored, (r) => r.gf) : null, ga = scored.length ? d3.mean(scored, (r) => r.ga) : null;
  return { n, w, t, l: n - w - t, win: n ? w / n : null, gf, ga };
}

// each card, and the per-game field it cannot be drawn without
const CARDS = [["attgrid-card", renderGrid, "_lineup"], ["women-card", renderWomen, "_women"], ["dropins-card", renderDropins, "_dropins"], ["regulars-card", renderRegulars, "_lineup"]];

export function render(data, p) {
  const league = data.soccer.league || [];
  const team = data.team || {};
  // lower-cased display names the league marks as women: they get half the usual cut-offs
  const women = data.soccer._women || new Set();
  const isWoman = (name) => women.has(name.toLowerCase());

  // how many of each game's lineup were already familiar: counted over every earlier game, not just the period
  const before = new Map(), regulars = new Map();
  for (const r of league) {
    if (!r._lineup) continue;
    // women need half as many earlier games (rounded up): a coed league has far fewer women, so the usual bar would miss most of them
    regulars.set(r, r._lineup.filter((name) => (before.get(key(name)) || 0) >= (isWoman(name) ? Math.ceil(REGULAR_AFTER / 2) : REGULAR_AFTER)).length);
    for (const name of r._lineup) before.set(key(name), (before.get(key(name)) || 0) + 1);
  }
  const firstOfSeason = new Set(), seenSeason = new Set();
  for (const r of league) { if (!seenSeason.has(seasonKey(r))) { seenSeason.add(seasonKey(r)); firstOfSeason.add(r); } }
  const squadOf = new Map(); // "season|weekday" -> set of player keys on that season's squad list
  for (const s of data.soccer._squads || []) squadOf.set(`${s.season}|${s.weekday}`, new Set(s.players.map(key)));

  const games = league.filter((r) => inPeriod(r.date, p));
  const ctx = { P: palette(), known: games.filter((r) => r._lineup), missing: games.filter((r) => !r._lineup).length, league, regulars, firstOfSeason, squadOf,
    isWoman, knowsWomen: women.size > 0, // without the league's list of women nobody's cut-off is halved, and the cards don't say it is
    // team.me: a display name whose row is labelled "Me" (null on the team's own page); team.private: names are shown only locally
    meKey: team.me ? key(team.me) : null, isPrivate: team.private === true };
  for (const [id, fn, field] of CARDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.hidden = !league.some((r) => r._lineup && r[field] != null);
    if (el.hidden) continue;
    try { fn(el, ctx); } catch (err) { console.error(id, err); }
  }
}

/** A card that shows names: it carries the "Private" tag, and the sentence saying so, only where names are kept local. */
function namedCard(el, ctx, { title, sub, note = LINEUPS_NOTE, ...rest }) {
  const c = card(el, { title, sub: sub && ctx.isPrivate ? `${sub} ${note}` : sub, ...rest });
  if (ctx.isPrivate) c.head.querySelector("h3").append(h("span", { class: "private-tag", style: { marginLeft: "8px" } }, "Private"));
  return c;
}

function empty(el, ctx, title, text = "Too few games with a lineup in this period") {
  const c = namedCard(el, ctx, { title, table: false });
  c.body.append(h("div", { class: "empty-state" }, text));
  legend(c.legend, []);
}

// ---------------------------------------------------------------- shared marks

const RIGHT = 118, RIGHT_NARROW = 100; // room for the figures to the right of the bars
const isNarrow = (el) => (el.getBoundingClientRect().width || 600) < 420;
const RESULT_LEGEND = (P) => [{ label: "Won", color: P.win }, { label: "Tied", color: P.tie }, { label: "Lost", color: P.loss }];

/** Columns for a table of groups of games: a label, the record, goals per game, then any extras. */
const recordColumns = (first, extra = []) => [{ label: first, value: (r) => r.label }, { label: "Games", num: true, value: (r) => r.n },
  { label: "W", num: true, value: (r) => r.w }, { label: "T", num: true, value: (r) => r.t }, { label: "L", num: true, value: (r) => r.l },
  { label: "Won", num: true, value: (r) => F.pct(r.win) },
  { label: "Scored a game", num: true, value: (r) => (r.gf == null ? "–" : F.num(r.gf, 2)) },
  { label: "Let in a game", num: true, value: (r) => (r.ga == null ? "–" : F.num(r.ga, 2)) }, ...extra];

/** One 100% won / tied / lost bar per group of games, with the games and goals per game on the right. */
function recordBars(el, rows, { P, head, left = 78 }) {
  const rowH = 38, narrow = isNarrow(el);
  if (narrow) left = Math.min(left, 68);
  const f = frame(el, { height: rows.length * rowH + 22, margin: { left, right: narrow ? RIGHT_NARROW : RIGHT, top: 20, bottom: 2 } });
  const { g, w } = f;
  g.append("text").attr("class", "annot-muted").attr("x", -left).attr("y", -8).text(head);
  g.append("text").attr("class", "annot-muted").attr("x", w + 12).attr("y", -8).text(narrow ? "Games · goals" : "Games · goals a game");
  const colors = { w: P.win, t: P.tie, l: P.loss }, names = { w: "Won", t: "Tied", l: "Lost" };
  rows.forEach((r, i) => {
    const y = i * rowH, faded = r.n < 10;
    g.append("text").attr("class", "annot").attr("x", -12).attr("y", y + 14).attr("dy", "0.32em").attr("text-anchor", "end").text(r.label);
    let acc = 0;
    for (const k of ["w", "t", "l"]) {
      const share = r[k] / r.n;
      if (!share) continue;
      const x0 = acc * w + (acc ? 2 : 0), ww = Math.max(0, share * w - (acc ? 2 : 0));
      acc += share;
      g.append("rect").attr("x", x0).attr("y", y + 2).attr("width", ww).attr("height", 24).attr("rx", 4).attr("fill", colors[k]).attr("opacity", faded ? 0.45 : 1);
      if (k === "w" && ww > 32) g.append("text").attr("x", x0 + 7).attr("y", y + 14).attr("dy", "0.34em").attr("fill", inkOn(colors[k])).attr("pointer-events", "none")
        .style("font", "600 11.5px var(--sans)").text(F.pct(share));
      g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", x0).attr("y", y).attr("width", ww).attr("height", 28)
        .on("pointerenter pointermove focus", function (ev) {
          tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: `${r.tip || r.label} · ${pl(r.n, "game")}`,
            rows: [{ label: names[k], value: `${F.int(r[k])} (${F.pct(share)})`, color: colors[k] },
              ...(r.gf != null ? [{ label: "Goals a game", value: `${F.num(r.gf, 1)} scored, ${F.num(r.ga, 1)} let in` }] : [])],
            note: faded ? "Fewer than 10 games: drawn faded" : null });
        })
        .on("pointerleave blur", () => tooltip.hide());
    }
    g.append("text").attr("class", faded ? "annot-muted" : "annot").attr("x", w + 12).attr("y", y + 14).attr("dy", "0.32em")
      .text(`${F.int(r.n)}${r.gf != null ? ` · ${F.num(r.gf, 1)}–${F.num(r.ga, 1)}` : ""}`);
  });
}

/** Thin single-series bars for a share: rows of { label, share, text, tip: [tooltip rows] }. `max` 1 draws a full-width track. */
function shareBars(el, rows, { P, head, left = 78, max = 1 }) {
  const rowH = 22, narrow = isNarrow(el);
  if (narrow) left = Math.min(left, 68);
  const f = frame(el, { height: rows.length * rowH + 32, margin: { left, right: narrow ? RIGHT_NARROW : RIGHT, top: 30, bottom: 2 } });
  const { g, w } = f;
  g.append("text").attr("class", "annot-muted").attr("x", -left).attr("y", -10).text(head);
  const x = d3.scaleLinear().domain([0, max]).range([0, w]);
  rows.forEach((r, i) => {
    const y = i * rowH;
    g.append("text").attr("class", "annot").attr("x", -12).attr("y", y + 9).attr("dy", "0.32em").attr("text-anchor", "end").text(r.label);
    if (max === 1) g.append("rect").attr("x", 0).attr("y", y + 3).attr("width", w).attr("height", 12).attr("rx", 4).attr("fill", P.seq[0]);
    else g.append("line").attr("x1", 0.5).attr("x2", 0.5).attr("y1", y + 1).attr("y2", y + 17).attr("stroke", P.axis);
    if (r.share > 0) g.append("path").attr("d", hbarPath(0, y + 3, Math.max(2, x(r.share)), 12)).attr("fill", P.soccer);
    g.append("text").attr("class", "annot-muted").attr("x", w + 12).attr("y", y + 9).attr("dy", "0.32em").text(r.text);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", 0).attr("y", y).attr("width", w).attr("height", rowH - 2)
      .on("pointerenter pointermove focus", function (ev) { tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: r.title || r.label, rows: r.tip, note: r.note }); })
      .on("pointerleave blur", () => tooltip.hide());
  });
}

/** Games grouped by a count (ranges of [lo, hi]); a group with too few games is merged into its smaller neighbour. */
function grouped(games, valueOf, ranges) {
  let bins = ranges.map(([lo, hi]) => ({ lo, hi, games: games.filter((r) => valueOf(r) >= lo && valueOf(r) <= hi) })).filter((b) => b.games.length);
  while (bins.length > 1) {
    const small = bins.filter((b) => b.games.length < MIN_GROUP).sort((a, b) => a.games.length - b.games.length)[0];
    if (!small) break;
    const i = bins.indexOf(small);
    const j = i === 0 ? 1 : i === bins.length - 1 ? i - 1 : bins[i - 1].games.length <= bins[i + 1].games.length ? i - 1 : i + 1;
    const [a, b] = [bins[Math.min(i, j)], bins[Math.max(i, j)]];
    bins.splice(Math.min(i, j), 2, { lo: a.lo, hi: b.hi, games: [...a.games, ...b.games] });
  }
  return bins.map((b) => ({ ...b, label: b.hi === Infinity ? `${b.lo}+` : b.lo === b.hi ? String(b.lo) : `${b.lo}–${b.hi}`, ...tally(b.games) }));
}

/** Two stacked plots inside one card body (frame() clears the element it is given). */
function split(body) {
  const top = h("div"), bottom = h("div");
  body.append(top, bottom);
  return [top, bottom];
}

// ---------------------------------------------------------------- who said yes, game by game

/** Longest run of consecutive yeses over a list of games in date order. */
function longestRun(games, said) {
  let best = { n: 0 }, n = 0, from = null;
  for (const r of games) {
    if (said.has(r)) {
      if (!n) from = r;
      n++;
      if (n >= best.n) best = { n, from, to: r };
    } else n = 0;
  }
  return best;
}

function renderGrid(el, ctx) {
  const { P, known, missing, firstOfSeason, squadOf, isWoman, knowsWomen, meKey } = ctx;
  if (known.length < MIN_GAMES) return empty(el, ctx, "Who said yes, game by game");
  const people = new Map();
  for (const r of known) for (const name of r._lineup) {
    const k = key(name);
    // the person data.team.me names is a row like any other, except that it is labelled "Me", in bold, and comes first
    if (!people.has(k)) people.set(k, { k, name, label: k === meKey ? "Me" : name, isMe: k === meKey, said: new Set(), seasons: new Set() });
    const m = people.get(k);
    m.said.add(r);
    m.seasons.add(seasonKey(r));
  }
  const everyone = [...people.values()];
  for (const m of everyone) {
    const theirs = known.filter((r) => m.said.has(r));
    m.first = theirs[0]; m.last = theirs[theirs.length - 1];
    // a run counts only the games of seasons the person was part of (said yes at least once, or on the squad list)
    m.run = longestRun(known.filter((r) => m.seasons.has(seasonKey(r)) || squadOf.get(seasonKey(r))?.has(m.k)), m.said);
  }
  const best = [...everyone].sort((a, b) => b.run.n - a.run.n || d3.descending(a.run.to?.date, b.run.to?.date))[0];

  // columns: as many of the most recent games as fit, with a gap where a new season starts
  const c0 = card(el, { title: "" }); // measured first: the number of games drawn depends on the width
  const bodyW = Math.max(280, c0.body.getBoundingClientRect().width || 600);
  const narrow = bodyW < 560;
  const labelW = narrow ? 84 : 118, countW = narrow ? 26 : 36, gapW = narrow ? 4 : 6, minCell = narrow ? 7 : 10;
  const layout = (n) => {
    const cols = known.slice(-n);
    const gap = cols.map((r, j) => j > 0 && firstOfSeason.has(r) && !firstOfSeason.has(cols[j - 1]));
    const cw = Math.floor((bodyW - labelW - countW - d3.sum(gap, Number) * gapW) / n);
    return { cols, gap, cw };
  };
  let n = Math.min(MAX_COLS, known.length), lay = layout(n);
  while (lay.cw < minCell && n > 10) lay = layout(--n);
  const { cols, gap } = lay, cw = Math.min(26, lay.cw);
  const xs = []; let off = 0;
  cols.forEach((r, j) => { if (gap[j]) off += gapW; xs.push(j * cw + off); });
  const gridW = xs[xs.length - 1] + cw;

  for (const m of everyone) m.shown = cols.filter((r) => m.said.has(r)).length;
  // who gets a row: the most yeses, with a woman's count doubled for the ranking (half the bar: a coed league has far fewer women)
  const rank = (m) => m.shown * (isWoman(m.name) ? 2 : 1);
  const byYeses = (a, b) => b.shown - a.shown || b.said.size - a.said.size || a.name.localeCompare(b.name);
  const drawn = everyone.filter((m) => m.shown);
  const meRow = drawn.find((m) => m.isMe);
  const others = drawn.filter((m) => m !== meRow);
  const rows = [...(meRow ? [meRow] : []), ...[...others].sort((a, b) => rank(b) - rank(a) || byYeses(a, b)).slice(0, MAX_ROWS - (meRow ? 1 : 0)).sort(byYeses)];
  const limited = rows.length < drawn.length, cut = cols.length < known.length;
  const ranking = "who said yes most often in these games" + (knowsWomen ? " (a woman's count is doubled for this ranking, as a coed league has far fewer women)" : "");

  const c = namedCard(el, ctx, {
    title: `${persons(people.size)} said yes to at least one of our ${F.int(known.length)} games` +
      (best && best.run.n >= 3 ? `; the longest unbroken run is ${best.name}'s, ${F.int(best.run.n)} in a row` : ""),
    sub: `One row per person` +
      (meRow ? `: the row labelled Me, then ${limited ? `the ${F.int(rows.length - 1)} others ${ranking}` : "everyone else, most yeses first"}`
        : limited ? `: the ${F.int(rows.length)} ${ranking}` : ", most yeses first") +
      `. One column per game, oldest on the left` +
      (cut ? ` (the most recent ${F.int(cols.length)} of ${F.int(known.length)}; the table has everyone)` : limited ? " (the table has everyone)" : "") +
      `. A filled square means they had said yes on the league's site beforehand, which is not the same as turning up; an outlined square means they were in that season's squad but didn't say yes; ` +
      `a faint square means they weren't in the squad that season. ` +
      `The strip on top is the result, with a gap where a new season starts; the number on the right counts their yeses in these games. ` +
      `A run counts only the games of seasons that person was part of.` +
      (missing ? ` ${pl(missing, "game")} with no lineup on the site ${missing === 1 ? "is" : "are"} left out.` : ""),
    note: NAMES_NOTE,
  });

  const ch = narrow ? 15 : 18, stripH = 8, stripY = -(stripH + 8);
  const f = frame(c.body, { height: rows.length * ch + 60, margin: { left: labelW, right: Math.max(countW, bodyW - labelW - gridW), top: 56, bottom: 4 } });
  const { g } = f;
  const resColor = { W: P.win, T: P.tie, L: P.loss };

  // season headings: the month each season started, and the year where it changes
  const fMon = d3.timeFormat("%b");
  let lastYear = null, monthEnd = -Infinity, yearEnd = -Infinity, partial = null;
  cols.forEach((r, j) => {
    if (j && !gap[j]) return;
    const start = seasonMonth(r);
    // the window can open on the tail of a season: its label gives way to the first full season's
    if (partial && xs[j] < monthEnd + 5) { partial.remove(); monthEnd = -Infinity; }
    if (xs[j] >= monthEnd + 5) {
      const t = g.append("text").attr("class", "annot-muted").attr("x", xs[j]).attr("y", stripY - 7).text(fMon(start));
      const len = t.node().getComputedTextLength();
      if (xs[j] + len > gridW + countW) t.remove(); else monthEnd = xs[j] + len;
      partial = j === 0 && !firstOfSeason.has(r) ? t : null;
    }
    if (start.getFullYear() !== lastYear && xs[j] >= yearEnd + 6) {
      lastYear = start.getFullYear();
      const t = g.append("text").attr("class", "annot").attr("x", xs[j]).attr("y", stripY - 21).text(lastYear);
      yearEnd = xs[j] + t.node().getComputedTextLength();
    }
  });
  g.append("text").attr("class", "annot-muted").attr("x", -10).attr("y", stripY + stripH / 2).attr("dy", "0.32em").attr("text-anchor", "end").text("Result");
  g.append("text").attr("class", "annot-muted").attr("x", gridW + 5).attr("y", stripY + stripH / 2).attr("dy", "0.32em").text("Yes");

  const gameTitle = (r) => `${F.fmtDate(r.date)}${r._opp ? ` · v ${r._opp}` : ""}`;
  const gameRows = (r) => [{ label: "Result", value: scoreText(r), color: resColor[r.result] },
    ...(r._team ? [{ label: "Playing as", value: `${r._team}, ${F.fmtMonth(seasonMonth(r))} season` }] : [])];
  cols.forEach((r, j) => {
    g.append("rect").attr("x", xs[j]).attr("y", stripY).attr("width", cw - 2).attr("height", stripH).attr("rx", 2).attr("fill", resColor[r.result]);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", xs[j] - 1).attr("y", stripY - 4).attr("width", cw).attr("height", stripH + 8)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: gameTitle(r),
          rows: [...gameRows(r), { label: "Said yes", value: F.int(r._lineup.length) }],
          note: r._lineup.length ? `Said yes: ${r._lineup.join(", ")}` : null });
      })
      .on("pointerleave blur", () => tooltip.hide());
  });

  rows.forEach((m, i) => {
    const y = i * ch, fill = P.soccer;
    g.append("text").attr("class", "annot").attr("x", -10).attr("y", y + (ch - 2) / 2).attr("dy", "0.32em").attr("text-anchor", "end").style("font-weight", m.isMe ? 600 : null).text(m.label);
    g.append("text").attr("class", "annot-muted").attr("x", gridW + 5).attr("y", y + (ch - 2) / 2).attr("dy", "0.32em").text(m.shown);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", -labelW).attr("y", y - 1).attr("width", labelW - 4).attr("height", ch)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: m.label, rows: [
          { label: "Said yes", value: `${F.int(m.said.size)} of ${pl(known.length, "game")} in this period`, color: fill },
          ...(cut ? [{ label: "Of the games drawn", value: `${F.int(m.shown)} of ${F.int(cols.length)}` }] : []),
          ...(m.first ? [{ label: "First", value: F.fmtDate(m.first.date) }, { label: "Latest", value: F.fmtDate(m.last.date) }] : []),
          ...(m.run.n >= 2 ? [{ label: "Longest run", value: `${F.int(m.run.n)} in a row, to ${F.fmtDate(m.run.to.date)}` }] : [])] });
      })
      .on("pointerleave blur", () => tooltip.hide());
    cols.forEach((r, j) => {
      const on = m.said.has(r);
      // three states: said yes; on that season's squad list but didn't say yes; not on it. Where the data has no squad list
      // for a season, saying yes to any of its games stands in for being on the list. (With a list, a drop-in's one yes
      // doesn't make the season's other games ones they "didn't say yes" to.)
      const list = squadOf.get(seasonKey(r));
      const inSquad = on || (list ? list.has(m.k) : m.seasons.has(seasonKey(r)));
      const cell = g.append("rect").attr("class", "cell cell-hit").attr("x", xs[j]).attr("y", y).attr("width", cw - 2).attr("height", ch - 2).attr("rx", 2);
      if (on) cell.attr("fill", fill);
      else if (inSquad) cell.attr("x", xs[j] + 0.75).attr("y", y + 0.75).attr("width", cw - 3.5).attr("height", ch - 3.5).attr("fill", P.surface).attr("stroke", P.muted).attr("stroke-width", 1.2);
      else cell.attr("fill", P.seq[0]).attr("opacity", 0.45);
      cell
        .on("pointerenter pointermove", (ev) => {
          tooltip.show(ev, { title: `${m.label} · ${gameTitle(r)}`, rows: [{ label: on ? "Said yes" : inSquad ? "In the squad, didn't say yes" : "Not in the squad that season", value: "", color: on ? fill : null }, ...gameRows(r)] });
        })
        .on("pointerleave", () => tooltip.hide());
    });
  });
  legend(c.legend, [...RESULT_LEGEND(P), { label: "Said yes", color: P.soccer }]);
  // the two kinds of empty square, shown as they are drawn
  const sw = (style) => h("span", { style: { display: "inline-block", width: "10px", height: "10px", borderRadius: "3px", boxSizing: "border-box", ...style } });
  c.legend.append(h("span", { class: "key" }, sw({ background: P.surface, border: `1.2px solid ${P.muted}` }), "In the squad, didn't say yes"),
    h("span", { class: "key" }, sw({ background: P.seq[0], opacity: 0.6 }), "Not in the squad that season"));
  c.setTable([{ label: "Who", value: (m) => m.label }, { label: "Games said yes", num: true, value: (m) => m.said.size },
    { label: "First", value: (m) => (m.first ? F.fmtDate(m.first.date) : "–") }, { label: "Latest", value: (m) => (m.last ? F.fmtDate(m.last.date) : "–") },
    { label: "Longest run", num: true, value: (m) => m.run.n }],
  [...everyone].sort((a, b) => b.isMe - a.isMe || b.said.size - a.said.size || a.name.localeCompare(b.name)));
}

// ---------------------------------------------------------------- women who said yes

function renderWomen(el, ctx) {
  const { P, known } = ctx;
  const topic = "Women who said yes, and our results";
  const games = known.filter((r) => r._women != null);
  if (games.length < MIN_GAMES) return empty(el, ctx, topic);
  const rows = grouped(games, (r) => r._women, [[0, 1], [2, 2], [3, 3], [4, 4], [5, Infinity]]);
  const womenText = (r) => `${r.label} ${r.lo === 1 && r.hi === 1 ? "woman" : "women"}`;
  for (const r of rows) r.tip = `${womenText(r)} said yes`;
  // the group that stands furthest from the rest of the games, as a rough z-score of the two win rates
  const all = tally(games);
  const versus = rows.map((r) => {
    const rest = tally(games.filter((q) => !r.games.includes(q)));
    const se = Math.sqrt(all.win * (1 - all.win) * (1 / r.n + 1 / Math.max(1, rest.n)));
    return { r, rest, z: rest.n && se ? (r.win - rest.win) / se : 0 };
  });
  const out = d3.greatest(versus, (v) => Math.abs(v.z));
  const side = out.r === rows[0] ? "more" : out.r === rows[rows.length - 1] ? "fewer" : "any other number";
  const title = rows.length < 2 ? `The ${F.int(games.length)} games in this period are too few to split by how many women said yes`
    : `With ${womenText(out.r)} saying yes we have won ${F.pct(out.r.win)} of ${pl(out.r.n, "game")}, against ${F.pct(out.rest.win)} of the ${F.int(out.rest.n)} with ${side}: ` +
      (Math.abs(out.z) >= 2 ? "a clear gap, on few games" : Math.abs(out.z) >= 1 ? "suggestive at most" : "no real pattern");
  const c = namedCard(el, ctx, {
    title,
    sub: `Each bar is the games where that many women had said yes beforehand (it is a coed league with a minimum number of women on the pitch): the share won, tied and lost, ` +
      `the games, and the goals scored and let in per game. A typical game has ${F.int(d3.median(games, (r) => r._women))}. ` +
      `Saying yes isn't turning up, the squad changes from season to season, and the groups are small.`,
  });
  recordBars(c.body, rows, { P, head: "Women", left: 64 });
  legend(c.legend, RESULT_LEGEND(P));
  c.setTable(recordColumns("Women who said yes"), rows);
}

// ---------------------------------------------------------------- drop-ins

function renderDropins(el, ctx) {
  const { P } = ctx;
  const topic = "Drop-ins";
  const known = ctx.known.filter((r) => r._dropins);
  if (known.length < MIN_GAMES) return empty(el, ctx, topic);
  const drops = (games) => d3.sum(games, (r) => r._dropins.length), yeses = (games) => d3.sum(games, (r) => r._lineup.length);
  const stat = (label, games, tip) => ({ label, tip, ...tally(games), withDrop: games.filter((r) => r._dropins.length).length, drops: drops(games), yeses: yeses(games), share: yeses(games) ? drops(games) / yeses(games) : 0 });
  const withG = known.filter((r) => r._dropins.length), withoutG = known.filter((r) => !r._dropins.length);
  if (!withG.length) return empty(el, ctx, topic, `No drop-in said yes to any of the ${F.int(known.length)} games in this period`);
  const a = stat("A drop-in", withG, "Games where a drop-in said yes"), b = stat("None", withoutG, "Games with no drop-in");
  const all = stat("All games", known);
  const rows = [a, b].filter((r) => r.n);
  const distinct = new Set(withG.flatMap((r) => r._dropins.map(key))).size;
  const years = d3.groups(known, (r) => r.date.slice(0, 4)).map(([y, v]) => stat(y, v));
  // drop-ins tend to fill a short squad: compare how many of the squad itself said yes
  const squadYes = (games) => d3.mean(games, (r) => r._lineup.length - r._dropins.length);
  const c = namedCard(el, ctx, {
    title: `${F.int(a.n)} of ${pl(known.length, "game")} had a drop-in say yes (${persons(distinct)})` +
      (a.n >= 5 && b.n >= 5 ? `; we won ${F.pct(a.win)} of those and ${F.pct(b.win)} of the rest` + (Math.min(a.n, b.n) < 10 ? ", on too few games to read into" : "")
        : "; too few to compare the results"),
    sub: `A drop-in signed up for that one game instead of the season. Top: games where at least one drop-in said yes against the rest, as the share won, tied and lost, ` +
      `with the games and the goals scored and let in per game. ` +
      (b.n ? `They fill gaps: the squad's own yeses average ${F.num(squadYes(withG), 1)} in those games and ${F.num(squadYes(withoutG), 1)} in the rest. ` : "") +
      (years.length > 1 ? `Bottom: drop-ins as a share of everyone who said yes, by year` : `Drop-ins were ${F.pct(all.share, 1)} of everyone who said yes (${F.int(all.drops)} of ${F.int(all.yeses)})`) +
      `. Saying yes isn't turning up.`,
  });
  const [top, bottom] = split(c.body);
  recordBars(top, rows, { P, head: "Drop-ins" });
  if (years.length > 1) {
    const max = Math.max(0.1, Math.ceil(d3.max(years, (r) => r.share) * 20) / 20);
    shareBars(bottom, years.map((r) => ({ label: r.label, share: r.share, text: `${F.int(r.drops)} of ${F.int(r.yeses)} · ${F.pct(r.share)}`,
      tip: [{ label: "Yeses from drop-ins", value: `${F.int(r.drops)} of ${F.int(r.yeses)} (${F.pct(r.share, 1)})`, color: P.soccer },
        { label: "Games with a drop-in", value: `${F.int(r.withDrop)} of ${F.int(r.n)}` }] })),
    { P, head: `Share of all yeses that came from drop-ins (${F.pct(all.share, 1)} overall)`, max });
  }
  legend(c.legend, [...RESULT_LEGEND(P), ...(years.length > 1 ? [{ label: "Yeses from drop-ins", color: P.soccer }] : [])]);
  c.setTable(recordColumns("Which games", [{ label: "Drop-in yeses", num: true, value: (r) => r.drops }, { label: "All yeses", num: true, value: (r) => r.yeses },
    { label: "Share", num: true, value: (r) => F.pct(r.share, 1) }]),
  [{ ...a, label: "With a drop-in" }, ...(b.n ? [{ ...b, label: "No drop-in" }] : []), ...years.map((r) => ({ ...r, label: `All games in ${r.label}` }))]);
}

// ---------------------------------------------------------------- familiar faces

function renderRegulars(el, ctx) {
  const { P, known, league, regulars, knowsWomen } = ctx;
  const topic = "Familiar faces";
  if (known.length < MIN_GAMES) return empty(el, ctx, topic);
  const count = (r) => regulars.get(r) || 0;
  if (!known.some((r) => count(r) > 0)) {
    return empty(el, ctx, topic, `Nobody who said yes in this period had already said yes to ${REGULAR_AFTER} of our earlier games${knowsWomen ? ` (${Math.ceil(REGULAR_AFTER / 2)} for women)` : ""}`);
  }
  const rows = grouped(known, count, [[0, 2], [3, 4], [5, 6], [7, Infinity]]);
  for (const r of rows) r.tip = `${r.label} familiar faces said yes`;
  // compare the fixed ends when both have enough games, else the first and last groups drawn
  let many = { ...tally(known.filter((r) => count(r) >= 5)), text: "5 or more" }, few = { ...tally(known.filter((r) => count(r) <= 2)), text: "2 or fewer" };
  if ((many.n < 10 || few.n < 10) && rows.length > 1) {
    const lo = rows[0], hi = rows[rows.length - 1];
    few = { ...lo, text: lo.lo === 0 ? `${lo.hi} or fewer` : lo.label }; many = { ...hi, text: hi.hi === Infinity ? `${hi.lo} or more` : hi.label };
  }
  const diff = rows.length > 1 ? many.win - few.win : null;
  const verdict = diff == null ? "" : diff > 0.08 ? "better so far, on a small sample" : diff < -0.08 ? "no better so far, on a small sample" : "about the same";
  const firstEver = league.find((r) => count(r) > 0);
  // familiarity only builds with time, so the fuller groups are later games: say when each end's typical game was
  const typical = (games) => F.fmtMonth(new Date(d3.median(games, (r) => +r._date)));
  const fewG = known.filter((r) => count(r) <= 2), manyG = known.filter((r) => count(r) >= 5);
  const c = namedCard(el, ctx, {
    title: rows.length > 1
      ? `With ${many.text} familiar faces saying yes we have won ${F.pct(many.win)} of ${pl(many.n, "game")}, against ${F.pct(few.win)} of ${F.int(few.n)} with ${few.text}: ${verdict}`
      : `The ${F.int(known.length)} games in this period are too few to split by how many familiar faces said yes`,
    sub: `A familiar face is someone who had already said yes to ${REGULAR_AFTER} or more of our earlier games${knowsWomen ? ` (${Math.ceil(REGULAR_AFTER / 2)} for women)` : ""}, counted over every game and not just this period. ` +
      `Each bar is the games with that many of them saying yes: the share won, tied and lost, the games, and the goals scored and let in per game. ` +
      (firstEver ? `Nobody qualified before ${F.fmtMonth(firstEver._date)}` : "") +
      (firstEver && fewG.length >= 5 && manyG.length >= 5 && typical(fewG) !== typical(manyG)
        ? `; the typical game with 2 or fewer was in ${typical(fewG)} and with 5 or more in ${typical(manyG)}, so this is also just later seasons against earlier ones. `
        : firstEver ? ", so the fuller groups are all later games. " : "") +
      `Saying yes isn't turning up.`,
  });
  recordBars(c.body, rows, { P, head: "Familiar", left: 64 });
  legend(c.legend, RESULT_LEGEND(P));
  c.setTable(recordColumns("Familiar faces who said yes"), rows);
}
