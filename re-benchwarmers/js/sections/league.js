// League results: form guide, running goal difference, scorelines, splits, rolling form,
// attack against defence, winning margins, streaks,
// and (only where the data has opponents' names) head-to-head records.
import { inPeriod, toMonth } from "../state.js?v=1469dbaaae";
import { h, card, legend, tooltip, focusEvent, segmented, dataTable } from "../ui.js?v=1469dbaaae";
import { palette, frame, yGrid, xTime, inkOn, moreShade, barPath } from "../charts.js?v=1469dbaaae";
import * as F from "../format.js?v=1469dbaaae";

let splitBy = "kick";

const NONE = "No league games in this period";
const RES = { W: "Win", T: "Tie", L: "Loss" };
const DAY = d3.timeFormat("%a");
const DAY_LONG = d3.timeFormat("%A");
const resColors = (P) => ({ W: P.win, T: P.tie, L: P.loss });
const resLegend = (P) => [{ label: "Win", color: P.win }, { label: "Tie", color: P.tie }, { label: "Loss", color: P.loss }];

const pl = (n, word) => `${F.int(n)} ${word}${n === 1 ? "" : "s"}`;
const times = (n) => (n === 1 ? "once" : n === 2 ? "twice" : `${F.int(n)} times`);
const signed = (v) => (v > 0 ? `+${F.int(v)}` : v < 0 ? `−${F.int(-v)}` : "0");
const score = (r) => (r.gf == null ? "Forfeit" : `${r.gf}–${r.ga}`);
const NB = "\u00a0"; // keeps "2 W · 1 T · 3 L" and "n = 12" from breaking across lines
const recText = (s) => `${s.w} W · ${s.t} T · ${s.l} L`.replaceAll(" ", NB);
const kickMin = (k) => { const [hh, mm] = String(k || "").split(":").map(Number); return Number.isFinite(hh) ? hh * 60 + (mm || 0) : null; };
/** "20:30" -> "8:30pm" */
const fmtKick = (k) => { const m = kickMin(k); return m == null ? "" : `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}${m < 720 ? "am" : "pm"}`; };
const fmtRange = (a, b) => `${a.slice(0, 4) === b.slice(0, 4) ? F.fmtDateShort(a) : F.fmtDate(a)} to ${F.fmtDate(b)}`;
const MON = d3.timeFormat("%b");
/** Two dates as months: "Oct 2030", "Aug–Oct 2030" or "Nov 2030 to Jan 2031". */
const monthSpan = (a, b) => (a.getFullYear() !== b.getFullYear() ? `${F.fmtMonth(a)} to ${F.fmtMonth(b)}`
  : a.getMonth() === b.getMonth() ? F.fmtMonth(b) : `${MON(a)}–${F.fmtMonth(b)}`);

function tally(rows) {
  const n = rows.length;
  const w = rows.filter((r) => r.result === "W").length, t = rows.filter((r) => r.result === "T").length, l = n - w - t;
  const gf = d3.sum(rows, (r) => r.gf || 0), ga = d3.sum(rows, (r) => r.ga || 0);
  return { n, w, t, l, gf, ga, gd: gf - ga, ppg: n ? (3 * w + t) / n : null, win: n ? w / n : null };
}

// ---------------------------------------------------------------- names (which may be missing) and seasons

/** A name with case, punctuation, emoji and spaces removed: "F.C. Example!" and "fc example" match. */
const nameKey = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "") || String(s || "").trim().toLowerCase();

/** True when two keys are one letter apart (a typo); a differing digit means a different team. */
function oneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  if (/\d/.test(l[i] || "") || /\d/.test(s[i] || "")) return false;
  return s.length === l.length ? s.slice(i + 1) === l.slice(i + 1) : s.slice(i) === l.slice(i + 1);
}

/** Map every spelling's key to one team key; long names one letter apart count as the same team. */
function canonicalKeys(names) {
  const canon = new Map();
  for (const name of names) {
    const k = nameKey(name);
    if (canon.has(k)) continue;
    const near = k.length >= 8 ? [...new Set(canon.values())].find((c) => c.length >= 8 && oneEdit(c, k)) : null;
    canon.set(k, near || k);
  }
  return canon;
}

/** The spelling to show for a merged team: one we have also played as, else the best capitalised, else the most used. */
function displayName(variants, preferKeys = new Set()) {
  const caps = (s) => (s.match(/\p{Lu}/gu) || []).length;
  return [...variants].sort((a, b) => d3.descending(preferKeys.has(nameKey(a[0])), preferKeys.has(nameKey(b[0])))
    || d3.descending(caps(a[0]), caps(b[0])) || d3.descending(a[1], b[1]))[0][0];
}

/** One key and one spelling per opponent across every season, however the name was typed that week. */
function opponentNames(all) {
  const named = all.filter((r) => r._opp);
  const canon = canonicalKeys(named.map((r) => r._opp));
  const ours = new Set(all.map((r) => r._team).filter(Boolean).map(nameKey));
  const key = (r) => canon.get(nameKey(r._opp));
  const shown = d3.rollup(named, (v) => displayName(d3.rollups(v, (q) => q.length, (r) => r._opp), ours), key);
  return { key, name: (r) => (r._opp ? shown.get(key(r)) : null) };
}
let opp = { key: () => null, name: () => null };

/** Two leagues can start in the same month, so a season is its start month + weekday (+ team when known). */
function seasonsOf(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = [r.season, r._date.getDay(), r._team ? nameKey(r._team) : ""].join("|");
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].map(([key, games]) => ({ key, games, ...tally(games), ...seasonLabel(games) }))
    .sort((a, b) => d3.descending(a.games[0].date, b.games[0].date) || d3.descending(a.games[a.games.length - 1].date, b.games[b.games.length - 1].date));
}

/** With names: "Team" + "Mar 2030 · Tue · 7v7". Without: "Mar 2030 · Tue · 7v7" (+ level). Never blank. */
function seasonLabel(games) {
  const g0 = games[0];
  const month = (g0.season && toMonth(g0.season)) || d3.timeMonth.floor(g0._date);
  const when = `${F.fmtMonth(month)} · ${DAY(g0._date)}`;
  const whenFormat = [when, g0.format].filter(Boolean).join(" · ");
  const team = g0._team && String(g0._team).trim();
  return team ? { main: team, sub: whenFormat, label: `${team} · ${when}`, full: `${team} · ${whenFormat}` }
    : { main: whenFormat, sub: g0.level || "", label: whenFormat, full: [whenFormat, g0.level].filter(Boolean).join(" ") };
}

// ---------------------------------------------------------------- render

export function render(data, p) {
  const block = document.getElementById("league-block");
  if (!block) return;
  const all = data.soccer.league || [];
  block.hidden = !all.length;
  if (!all.length) return;
  const games = all.filter((r) => inPeriod(r.date, p));
  const team = data.team || {};
  opp = opponentNames(all);
  const cards = [["form-card", renderForm], ["gd-card", renderGd], ["scores-card", renderScores],
    ["leagueby-card", renderSplit], ["rolling-card", renderRolling], ["attack-card", renderAttack],
    ["margin-card", renderMargin], ["streaks-card", renderStreaks], ["h2h-card", renderH2h]];
  for (const [id, fn] of cards) {
    const el = document.getElementById(id);
    if (!el) continue;
    try {
      fn(el, games, all, team);
    } catch (err) {
      console.error(err);
    }
  }
}

function noGames(c, columns, text = NONE) {
  c.body.append(h("div", { class: "empty-state" }, text));
  legend(c.legend, []);
  if (columns) c.setTable(columns, []);
}

/**
 * Labels above the plot for two shaded bands ({x0, x1, text}): centred on their band, or pushed apart when
 * the bands are neighbours. `right` is how far right a label may reach.
 */
function bandLabels(g, bands, right) {
  const [bl, br] = bands.slice().sort((a, b) => a.x0 - b.x0).map((b) => {
    const t = g.append("text").attr("class", "annot").attr("y", -10).attr("text-anchor", "middle").text(b.text);
    const tw = t.node().getComputedTextLength(), mid = (b.x0 + b.x1) / 2;
    return { t, tw, mid, x0: mid - tw / 2, x1: mid + tw / 2 };
  });
  if (!bl) return;
  if (bl.x1 + 10 > br.x0) { const push = (bl.x1 + 10 - br.x0) / 2; bl.x0 -= push; br.x0 += push; }
  bl.x0 = Math.max(0, Math.min(bl.x0, right - br.tw - 10 - bl.tw));
  br.x0 = Math.min(right - br.tw, Math.max(br.x0, bl.x0 + bl.tw + 10));
  for (const b of [bl, br]) b.t.attr("text-anchor", "start").attr("x", b.x0);
}

/** Tooltip for one league game. */
function gameTip(r, P) {
  const kick = fmtKick(r.kickoff);
  return {
    title: `${DAY(r._date)} ${F.fmtDate(r.date)}${kick ? ` · ${kick} kick-off` : ""}`,
    rows: [{ label: RES[r.result], value: score(r), color: resColors(P)[r.result] },
      ...(r._opp ? [{ label: "Against", value: opp.name(r) }] : [])],
    note: [r.forfeit ? "Forfeited, so no score" : null, r._venue || null].filter(Boolean).join(" · ") || null,
  };
}

// ---------------------------------------------------------------- 1. form guide

function renderForm(el, games) {
  const P = palette(), RC = resColors(P);
  const seasons = seasonsOf(games);
  const tot = tally(games);
  const rated = seasons.filter((s) => s.n >= 4);
  const best = (rated.length ? rated : seasons).slice()
    .sort((a, b) => d3.descending(a.ppg, b.ppg) || d3.descending(a.gd, b.gd) || d3.descending(a.games[0].date, b.games[0].date))[0];
  const phone = (el.getBoundingClientRect().width || 900) < 620; // nine columns need short headings on a phone
  const col = (label, short, value) => ({ label: phone ? short : label, num: true, value });
  const columns = [{ label: "Season", value: (s) => s.full }, col("Played", "P", (s) => s.n),
    col("W", "W", (s) => s.w), col("T", "T", (s) => s.t), col("L", "L", (s) => s.l),
    col("Goals for", "GF", (s) => s.gf), col("Goals against", "GA", (s) => s.ga),
    col("Goal difference", "GD", (s) => signed(s.gd)), col("Points per game", "Pts/game", (s) => F.num(s.ppg, 2))];
  const c = card(el, {
    title: !games.length ? "Form guide"
      : `We have won ${F.int(tot.w)} of ${pl(tot.n, "league game")} (${F.pct(tot.win)}), tied ${F.int(tot.t)} and lost ${F.int(tot.l)}` +
        (seasons.length > 1 ? `. Best season: ${best.label} (${recText(best)})` : ""),
    sub: "One row per season, newest at the top. Each square is a game, in the order they were played: W for a win, T for a tie, L for a loss. " +
      "Each row ends with the season's record and goals for–against.",
  });
  if (!games.length) return noGames(c, columns);

  const narrow = (c.body.getBoundingClientRect().width || 600) < 620;
  const side = narrow ? 19 : 20, gap = narrow ? 3 : 4; // a phone row fits eight squares and the record
  const square = (r) => {
    const fill = RC[r.result];
    const show = (ev) => tooltip.show(ev.type === "focus" ? focusEvent(ev.currentTarget) : ev, gameTip(r, P));
    // the padded wrapper is the hit target, so there are no dead gaps between squares
    return h("span", { tabindex: 0, role: "img", "aria-label": `${F.fmtDate(r.date)}: ${RES[r.result]}, ${score(r)}`,
      style: { display: "inline-flex", padding: `4px ${gap}px 4px 0`, cursor: "pointer", borderRadius: "4px" },
      onpointerenter: show, onpointermove: show, onfocus: show, onpointerleave: () => tooltip.hide(), onblur: () => tooltip.hide() },
    h("span", { style: { width: `${side}px`, height: `${side}px`, borderRadius: "4px", background: fill, color: inkOn(fill),
      font: `700 10.5px/${side}px var(--sans)`, textAlign: "center" } }, r.result));
  };
  const rows = seasons.map((s) => {
    const label = h("div", { style: { minWidth: "0", lineHeight: "1.35" } },
      h("span", { style: { color: "var(--ink)", fontWeight: "550" } }, s.main),
      s.sub ? h("span", { style: { color: "var(--muted)", whiteSpace: "nowrap" } }, `  ${s.sub}`) : null);
    const cells = h("div", { style: { display: "flex", flex: "none" } }, s.games.map(square));
    const rec = h("div", { style: { color: "var(--ink-2)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: narrow ? "12px" : null } },
      narrow ? `${recText(s)} · ${s.gf}–${s.ga}` : `${recText(s)}, goals ${s.gf}–${s.ga}`);
    return narrow
      ? [h("div", { style: { padding: "7px 0 5px", borderTop: "1px solid var(--grid)" } }, label,
        h("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0 4px", marginTop: "2px" } }, cells, rec))]
      : [label, cells, rec];
  });
  c.body.append(h("div", { style: { display: "grid", gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "max-content max-content max-content",
    columnGap: "22px", alignItems: "center", fontSize: "13px" } }, rows.flat()));
  legend(c.legend, resLegend(P));
  c.setTable(columns, seasons);
}

// ---------------------------------------------------------------- 2. goal difference running total

function renderGd(el, games) {
  const P = palette();
  let cum = 0;
  const pts = games.map((r) => { const d = r.gf == null ? 0 : r.gf - r.ga; cum += d; return { r, d, cum, date: r._date }; });
  const n = pts.length, total = cum;
  // best and worst run of consecutive games (about a season's worth)
  const W = n >= 16 ? 8 : n >= 10 ? 5 : 0;
  let best = null, worst = null;
  for (let i = 0; W && i + W <= n; i++) {
    const run = { v: pts[i + W - 1].cum - (i ? pts[i - 1].cum : 0), from: pts[i], to: pts[i + W - 1] };
    if (!best || run.v > best.v) best = run;
    if (!worst || run.v < worst.v) worst = run;
  }
  const word = { 8: "eight", 5: "five" }[W];
  const where = total ? `We are ${pl(Math.abs(total), "goal")} ${total < 0 ? "down" : "up"} over ${pl(n, "game")}` : `We are level on goals over ${pl(n, "game")}`;
  const columns = [{ label: "Date", value: (d) => F.fmtDate(d.r.date) }, { label: "Score", num: true, value: (d) => score(d.r) },
    { label: "Result", value: (d) => RES[d.r.result] }, { label: "Running total", num: true, value: (d) => signed(d.cum) }];
  const c = card(el, {
    title: !n ? "Goal difference, running total" : W ? `${where}; the best ${word}-game run was ${signed(best.v)}, the worst ${signed(worst.v)}` : where,
    sub: "Goals scored minus goals let in, added up game by game. The line climbs when we outscore the other team and drops when we don't." +
      (W ? ` Shaded: the best run (${fmtRange(best.from.r.date, best.to.r.date)}) and the worst (${fmtRange(worst.from.r.date, worst.to.r.date)}).` : "") +
      (games.some((r) => r.gf == null) ? " A forfeit adds no goals either way." : ""),
  });
  if (!n) return noGames(c, columns);

  // the running total is written past the end of the line: a three-figure one needs a little more room than the usual margin
  const right = Math.max(34, 12 + 7 * signed(total).length);
  const f = frame(c.body, { height: 260, margin: { left: 42, right, top: 26 } });
  const { svg, g, w, h: ht } = f;
  let [d0, d1] = d3.extent(pts, (d) => d.date);
  if (d3.timeDay.count(d0, d1) < 28) { d0 = d3.timeDay.offset(d0, -14); d1 = d3.timeDay.offset(d1, 14); }
  const x = d3.scaleTime().domain([d0, d1]).range([0, w]);
  const [lo, hi] = d3.extent([0, ...pts.map((d) => d.cum)]);
  const pad = Math.max(1, (hi - lo) * 0.08);
  const y = d3.scaleLinear().domain([lo - (lo < 0 ? pad : 0), hi + pad]).range([ht, 0]);

  // the best and worst runs sit behind everything as quiet bands
  const bands = W ? [{ run: best, text: `best ${signed(best.v)}` }, { run: worst, text: `worst ${signed(worst.v)}` }] : [];
  for (const b of bands) {
    b.x0 = x(b.run.from.date); b.x1 = Math.max(x(b.run.to.date), b.x0 + 3);
    g.append("rect").attr("x", b.x0).attr("y", 0).attr("width", b.x1 - b.x0).attr("height", ht).attr("fill", P.wash).attr("rx", 3);
  }
  // a gridline that lands on the x axis would double it up: the axis line stands in for it
  yGrid(g, y, w, { ticks: 4, format: signed }).selectAll("line").filter((d) => y(d) > ht - 5).remove();
  xTime(g, x, ht);
  const y0 = Math.round(y(0)) + 0.5;
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y0).attr("y2", y0).attr("stroke", P.muted).attr("stroke-width", 1).attr("shape-rendering", "crispEdges");

  const steps = [{ date: pts[0].date, cum: 0 }, ...pts];
  g.append("path").datum(steps).attr("fill", P.soccer).attr("opacity", 0.12)
    .attr("d", d3.area().curve(d3.curveStepAfter).x((d) => x(d.date)).y0(y(0)).y1((d) => y(d.cum)));
  g.append("path").datum(steps).attr("fill", "none").attr("stroke", P.soccer).attr("stroke-width", 2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
    .attr("d", d3.line().curve(d3.curveStepAfter).x((d) => x(d.date)).y((d) => y(d.cum)));
  const last = pts[n - 1];
  g.append("circle").attr("cx", x(last.date)).attr("cy", y(last.cum)).attr("r", 4).attr("fill", P.soccer).attr("stroke", P.surface).attr("stroke-width", 2);
  g.append("text").attr("class", "annot halo").attr("x", x(last.date) + 8).attr("y", y(last.cum)).attr("dy", "0.32em").text(signed(last.cum));
  bandLabels(g, bands, w + right - 4);

  // hover: nearest match day (a double-header shows both games)
  const days = d3.groups(pts, (d) => +d.date).map(([, v]) => ({ date: v[0].date, games: v, cum: v[v.length - 1].cum }));
  const cross = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ht).attr("visibility", "hidden");
  const ring = g.append("circle").attr("r", 5).attr("fill", P.soccer).attr("stroke", P.surface).attr("stroke-width", 2).attr("visibility", "hidden");
  const RC = resColors(P);
  let idx = days.length - 1;
  const showAt = (i, ev) => {
    idx = Math.max(0, Math.min(days.length - 1, i));
    const d = days[idx];
    cross.attr("visibility", "visible").attr("x1", x(d.date)).attr("x2", x(d.date));
    ring.attr("visibility", "visible").attr("cx", x(d.date)).attr("cy", y(d.cum));
    tooltip.show(ev, { title: `${DAY(d.date)} ${F.fmtDate(d.date)}`, rows: [
      ...d.games.map((q) => ({ label: `${RES[q.r.result]}${q.r._opp ? ` v ${opp.name(q.r)}` : ""}`, value: score(q.r), color: RC[q.r.result] })),
      { label: "Running total", value: signed(d.cum), color: P.soccer, mark: "line" }] });
  };
  const hide = () => { cross.attr("visibility", "hidden"); ring.attr("visibility", "hidden"); tooltip.hide(); };
  const bis = d3.bisector((d) => d.date).center;
  g.append("rect").attr("class", "hit").attr("width", w).attr("height", ht)
    .on("pointermove", (ev) => showAt(bis(days, x.invert(d3.pointer(ev)[0])), ev))
    .on("pointerleave", hide);
  svg.attr("tabindex", 0).attr("aria-label", "Running goal difference: use arrow keys to step through match days")
    .on("focus", function () { showAt(idx, focusEvent(this)); })
    .on("blur", hide)
    .on("keydown", function (ev) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.preventDefault();
        showAt(idx + (ev.key === "ArrowLeft" ? -1 : 1), focusEvent(ring.node()));
      }
    });
  legend(c.legend, []);
  c.setTable(columns, pts.slice().reverse());
}

// ---------------------------------------------------------------- 3. scorelines

function renderScores(el, games) {
  const P = palette();
  const CAP = 7;
  const scored = games.filter((r) => r.gf != null);
  const exact = d3.groups(scored, (r) => `${r.gf}–${r.ga}`).map(([s, v]) => ({ s, v, n: v.length, res: v[0].result, last: v[v.length - 1].date }))
    .sort((a, b) => d3.descending(a.n, b.n) || d3.descending(a.last, b.last));
  const top = exact[0];
  const forfeits = games.length - scored.length;
  const columns = [{ label: "Score", value: (d) => d.s }, { label: "Result", value: (d) => RES[d.res] }, { label: "Games", num: true, value: (d) => d.n },
    { label: "Share", num: true, value: (d) => F.pct(d.n / scored.length) }, { label: "Most recent", num: true, value: (d) => F.fmtDate(d.last) }];
  const c = card(el, {
    title: !top ? "Scorelines" : top.n === 1 ? "No scoreline has come up twice in this period"
      : `The most common result is a ${top.s} ${RES[top.res].toLowerCase()} (${times(top.n)})`,
    sub: `How often each final score has come up: our goals along the bottom, the other team's up the side, 7 or more lumped together. ` +
      `${moreShade()} is more games. Outlined squares are ties; above them we lost, below them we won.` +
      (forfeits ? ` ${forfeits === 1 ? "One forfeit has" : `${forfeits} forfeits have`} no score and ${forfeits === 1 ? "is" : "are"} left out.` : ""),
  });
  if (!scored.length) return noGames(c, columns);

  const cells = d3.range(CAP + 1).map((ga) => d3.range(CAP + 1).map((gf) => ({ gf, ga, v: [] })));
  for (const r of scored) cells[Math.min(CAP, r.ga)][Math.min(CAP, r.gf)].v.push(r);
  const max = d3.max(cells.flat(), (d) => d.v.length);
  const shade = (k) => (k ? 1 + Math.round(((k - 1) / Math.max(1, max - 1)) * 6) : 0);
  const lab = (v) => (v === CAP ? `${CAP}+` : String(v));
  const bodyW = Math.max(260, c.body.getBoundingClientRect().width || 520);
  const m = { left: 30, top: 20, bottom: 40, right: 2 };
  const cw = Math.min(72, Math.floor((bodyW - m.left - m.right) / (CAP + 1)));
  const ch = Math.min(34, cw);
  const f = frame(c.body, { height: m.top + ch * (CAP + 1) + m.bottom, margin: m });
  const { g } = f;
  const gw = cw * (CAP + 1), gh = ch * (CAP + 1);
  g.append("text").attr("class", "annot-muted").attr("x", -m.left).attr("y", -8).text("Goals let in");
  g.append("text").attr("class", "annot-muted").attr("x", gw / 2).attr("y", gh + 33).attr("text-anchor", "middle").text("Goals we scored");
  d3.range(CAP + 1).forEach((v) => {
    g.append("text").attr("class", "annot-muted").attr("x", -8).attr("y", gh - (v + 0.5) * ch).attr("dy", "0.32em").attr("text-anchor", "end").text(lab(v));
    g.append("text").attr("class", "annot-muted").attr("x", (v + 0.5) * cw - 1).attr("y", gh + 15).attr("text-anchor", "middle").text(lab(v));
  });
  for (const d of cells.flat()) {
    const k = d.v.length, fill = P.seq[shade(k)];
    const cx = d.gf * cw, cy = gh - (d.ga + 1) * ch;
    const results = [...new Set(d.v.map((r) => r.result))];
    g.append("rect").attr("class", "cell cell-hit").attr("tabindex", k ? 0 : null)
      .attr("x", cx).attr("y", cy).attr("width", cw - 2).attr("height", ch - 2).attr("rx", 4).attr("fill", fill)
      .attr("aria-label", `Scored ${lab(d.gf)}, let in ${lab(d.ga)}: ${pl(k, "game")}`)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, {
          title: `Scored ${lab(d.gf)}, let in ${lab(d.ga)}${results.length === 1 ? ` · ${RES[results[0]].toLowerCase()}` : ""}`,
          rows: k ? [{ label: "Games", value: F.int(k) }, { label: "Share of games", value: F.pct(k / scored.length) }] : [{ label: "Never happened", value: "" }],
          note: k ? `Most recent: ${F.fmtDate(d.v[k - 1].date)}` : null });
      })
      .on("pointerleave blur", () => tooltip.hide());
    if (k) g.append("text").attr("x", cx + (cw - 2) / 2).attr("y", cy + (ch - 2) / 2).attr("dy", "0.34em").attr("text-anchor", "middle")
      .attr("fill", inkOn(fill)).attr("pointer-events", "none").style("font", "600 11.5px var(--sans)").text(k);
    // the 7+ / 7+ corner mixes scores, so it isn't marked as a tie
    if (d.gf === d.ga && d.gf < CAP) g.append("rect").attr("x", cx + 0.75).attr("y", cy + 0.75).attr("width", cw - 3.5).attr("height", ch - 3.5).attr("rx", 3.5)
      .attr("fill", "none").attr("stroke", P.ink2).attr("stroke-width", 1.5).attr("pointer-events", "none");
  }
  legend(c.legend, []);
  c.setTable(columns, exact);
}

// ---------------------------------------------------------------- 4. results split by…

const SLOTS = [
  { max: 17 * 60, label: "Daytime", phrase: "in daytime games" },
  { max: 19 * 60, label: "Before 7pm", phrase: "before 7pm" },
  { max: 19 * 60 + 45, label: "7:00–7:44", phrase: "at 7:00–7:44pm" },
  { max: 20 * 60 + 30, label: "7:45–8:29", phrase: "at 7:45–8:29pm" },
  { max: 21 * 60 + 15, label: "8:30–9:14", phrase: "at 8:30–9:14pm" },
  { max: Infinity, label: "9:15 or later", phrase: "at 9:15pm or later" },
];
const SPLITS = {
  kick: { label: "Kick-off", head: "Kick-off", flat: "Kick-off time makes no clear difference", maybe: "Kick-off time may matter, but the samples are small", noun: "kick-off time",
    sub: "by kick-off time (evening slots of 45 minutes; daytime games are their own row)",
    of: (r) => {
      const m = kickMin(r.kickoff);
      if (m == null) return { key: "x", order: 99, label: "Not recorded", phrase: "with no kick-off time" };
      const i = SLOTS.findIndex((s) => m < s.max);
      return { key: i, order: i, ...SLOTS[i] };
    },
    finish: (grp) => {
      // every daytime game so far has been at a weekend: say so when it is true
      if (grp.key === 0 && grp.rows.every((r) => [0, 6].includes(r._date.getDay()))) Object.assign(grp, { label: "Weekend daytime", phrase: "in weekend daytime games" });
    } },
  day: { label: "Day", head: "Day", flat: "The day of the week makes no clear difference", maybe: "The day of the week may matter, but the samples are small", noun: "day of the week", sub: "by day of the week",
    of: (r) => ({ key: r._date.getDay(), order: (r._date.getDay() + 6) % 7, label: DAY(r._date), phrase: `on ${DAY_LONG(r._date)}s` }) },
  year: { label: "Year", head: "Year", flat: "No year clearly stands out", maybe: "Some years look better than others, but the samples are small", noun: "year", sub: "by calendar year",
    of: (r) => ({ key: r.date.slice(0, 4), order: +r.date.slice(0, 4), label: r.date.slice(0, 4), phrase: `in ${r.date.slice(0, 4)}` }) },
  format: { label: "Format", head: "Format", flat: "The format makes no clear difference", maybe: "The format may matter, but the samples are small", noun: "format",
    sub: "by format and, where the league listed one, level",
    of: (r) => {
      const fmt = r.format ? r.format[0].toUpperCase() + r.format.slice(1) : "Not recorded";
      const eight = r.format === "8v8";
      return { key: `${r.format}|${r.level || ""}`, label: fmt, sub: r.level || (eight ? "no level listed" : ""),
        phrase: `in ${r.format || "unrecorded formats"}${r.level ? ` ${r.level}` : eight ? " with no level listed" : ""}` };
    } },
};
const MIN_GROUP = 10;

function renderSplit(el, games) {
  const P = palette();
  const S = SPLITS[splitBy];
  const tools = h("div", { class: "seg small", role: "group", "aria-label": "Split results by" });
  segmented(tools, Object.entries(SPLITS).map(([id, s]) => ({ id, label: s.label })), splitBy, (id) => { splitBy = id; renderSplit(el, games); });
  const m = new Map();
  for (const r of games) {
    const k = S.of(r);
    if (!m.has(k.key)) m.set(k.key, { ...k, rows: [] });
    m.get(k.key).rows.push(r);
  }
  const groups = [...m.values()].map((grp) => { S.finish?.(grp); return { ...grp, ...tally(grp.rows) }; })
    .sort((a, b) => (a.order != null ? d3.ascending(a.order, b.order) : d3.descending(a.n, b.n)));
  const name = (grp) => `${grp.label}${grp.sub ? ` ${grp.sub}` : ""}`;

  // only groups with enough games are compared, and a gap has to beat what chance alone would give
  const fair = groups.filter((x) => x.n >= MIN_GROUP).sort((a, b) => d3.descending(a.win, b.win));
  let title = "Results split";
  if (games.length) {
    if (fair.length < 2) title = `Not enough games to compare by ${S.noun}: fewer than two groups have ${MIN_GROUP} or more`;
    else {
      const a = fair[0], b = fair[fair.length - 1];
      const pool = (a.w + b.w) / (a.n + b.n);
      const z = (a.win - b.win) / Math.sqrt(pool * (1 - pool) * (1 / a.n + 1 / b.n) || 1);
      // comparing the best with the worst of several groups flatters the gap, so ask for more then
      title = z >= (fair.length > 2 ? 2.5 : 2)
        ? `We win more ${a.phrase} (${F.pct(a.win)} of ${a.n} games) than ${b.phrase} (${F.pct(b.win)} of ${b.n})`
        : `${a.win - b.win >= 0.15 ? S.maybe : S.flat}: we won ${F.pct(a.win)} ${a.phrase} (n${NB}=${NB}${a.n}) and ${F.pct(b.win)} ${b.phrase} (n${NB}=${NB}${b.n})`;
    }
  }
  const columns = [{ label: S.head, value: name }, { label: "Played", num: true, value: (x) => x.n }, { label: "W", num: true, value: (x) => x.w },
    { label: "T", num: true, value: (x) => x.t }, { label: "L", num: true, value: (x) => x.l }, { label: "Win rate", num: true, value: (x) => F.pct(x.win) },
    { label: "Goals", num: true, value: (x) => `${x.gf}–${x.ga}` }];
  const c = card(el, {
    title,
    sub: `Share of games won, tied and lost, ${S.sub}. Each bar is all the games in that group; n is how many. ` +
      `Faded rows have fewer than ${MIN_GROUP} games, too few to read much into.`,
  });
  // four options don't fit beside the title in a half-width card, so the toggle gets its own row
  c.head.after(h("div", { style: { margin: "0 0 12px" } }, tools));
  if (!games.length) return noGames(c, columns);

  const RC = resColors(P);
  const narrow = (c.body.getBoundingClientRect().width || 520) < 420;
  // at least 40: "Mon" and "Wed" are wider than three average letters
  const left = Math.min(narrow ? 100 : 116, Math.max(40, 14 + 6.4 * d3.max(groups, (x) => Math.max(x.label.length, (x.sub || "").length * 0.93))));
  const rowH = 40;
  const f = frame(c.body, { height: groups.length * rowH + 4, margin: { left, right: 52, top: 2, bottom: 2 } });
  const { g, w } = f;
  groups.forEach((x, i) => {
    const y = i * rowH;
    const row = g.append("g").attr("opacity", x.n < MIN_GROUP ? 0.45 : 1);
    g.append("text").attr("class", "annot").attr("x", -12).attr("y", y + (x.sub ? 12 : 18)).attr("dy", "0.32em").attr("text-anchor", "end").text(x.label);
    if (x.sub) g.append("text").attr("class", "annot-muted").attr("x", -12).attr("y", y + 29).attr("text-anchor", "end").text(x.sub);
    g.append("text").attr("class", "annot-muted").attr("x", w + 8).attr("y", y + 18).attr("dy", "0.32em").text(`n = ${x.n}`);
    const segs = [["W", x.w], ["T", x.t], ["L", x.l]].filter(([, v]) => v > 0);
    let acc = 0;
    segs.forEach(([k, v], j) => {
      const share = v / x.n;
      const x0 = acc * w + (j ? 1 : 0);
      const ww = Math.max(1, share * w - (j ? 1 : 0) - (j < segs.length - 1 ? 1 : 0));
      acc += share;
      row.append("rect").attr("x", x0).attr("y", y + 4).attr("width", ww).attr("height", 28).attr("rx", Math.min(4, ww / 2)).attr("fill", RC[k]);
      if (k === "W" && ww > 33) row.append("text").attr("x", x0 + 7).attr("y", y + 18).attr("dy", "0.32em").attr("fill", inkOn(RC[k]))
        .style("font", "600 11.5px var(--sans)").text(F.pct(share));
      g.append("rect").attr("class", "hit").attr("x", x0 - (j ? 1 : 0)).attr("y", y).attr("width", ww + 2).attr("height", 36).attr("tabindex", 0)
        .attr("aria-label", `${name(x)}: ${RES[k]} ${F.pct(share)}`)
        .on("pointerenter pointermove focus", function (ev) {
          tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: `${name(x)} · ${pl(x.n, "game")}`,
            rows: [["W", x.w], ["T", x.t], ["L", x.l]].map(([kk, vv]) => ({ label: { W: "Wins", T: "Ties", L: "Losses" }[kk], value: `${vv} (${F.pct(vv / x.n)})`, color: RC[kk] })),
            note: `Goals ${x.gf}–${x.ga}${x.n < MIN_GROUP ? " · too few games to read much into" : ""}` });
        })
        .on("pointerleave blur", () => tooltip.hide());
    });
  });
  legend(c.legend, resLegend(P));
  c.setTable(columns, groups);
}

// ---------------------------------------------------------------- 5. head to head (needs the opponents' names)

let h2hSort = "win";

function renderH2h(el, games, all, team) {
  if (!all.some((r) => r._opp)) { el.hidden = true; return; }
  el.hidden = false;
  // spellings are merged across every season, so a period's table doesn't depend on which variants fall inside it
  const opps = d3.groups(games.filter((r) => r._opp), opp.key).map(([, v]) => ({ name: opp.name(v[0]), ...tally(v) })).filter((o) => o.n >= 3)
    .sort(h2hSort === "win"
      ? (a, b) => d3.descending(a.win, b.win) || d3.descending(a.ppg, b.ppg) || d3.descending(a.n, b.n) || d3.ascending(a.name, b.name)
      : (a, b) => d3.descending(a.n, b.n) || d3.descending(a.ppg, b.ppg) || d3.ascending(a.name, b.name));
  const teams = d3.groups(games.filter((r) => r._team), (r) => nameKey(r._team))
    .map(([, v]) => ({ name: displayName(d3.rollups(v, (q) => q.length, (r) => r._team)), first: v[0].date, seasons: seasonsOf(v).length, ...tally(v) }))
    .sort((a, b) => d3.descending(a.n, b.n) || d3.descending(a.first, b.first));
  const most = opps.slice().sort((a, b) => d3.descending(a.n, b.n) || d3.descending(a.ppg, b.ppg))[0];
  const best = opps.slice().sort((a, b) => d3.descending(a.win, b.win) || d3.descending(a.ppg, b.ppg) || d3.descending(a.n, b.n))[0];
  const tools = h("div", { class: "seg small" });
  segmented(tools, [{ id: "win", label: "By win rate" }, { id: "n", label: "Most played" }], h2hSort, (id) => { h2hSort = id; renderH2h(el, games, all, team); });
  const c = card(el, {
    // when the best record and the most games belong to the same opponent, it is named once
    title: !games.length ? "Opponents and our names" : !most ? "No opponent has come up three times in this period"
      : best === most ? `Our best record is against ${best.name}, also the team we have met most: ${recText(best)} in ${pl(best.n, "game")}`
        : `Our best record is against ${best.name}: ${recText(best)} in ${pl(best.n, "game")}; the team we have met most is ${most.name} (${pl(most.n, "game")}, ${recText(most)})`,
    sub: `Left: opponents we have played three or more times in this period, ${h2hSort === "win" ? "best win rate first" : "most played first"}, with different spellings of the same team merged. ` +
      "Right: the names we have played under." + (team.private ? " These names are only shown on this Mac; the published page leaves this card out." : ""),
    tools: [tools],
    table: false,
  });
  // where names are shown only locally (data.team.private), the card says so
  if (team.private) c.head.querySelector("h3").append(h("span", { class: "private-tag", title: "Only on this Mac. Left out when the page is published." }, "Private"));
  legend(c.legend, []);
  if (!games.length) return noGames(c, null);
  const narrow = (c.body.getBoundingClientRect().width || 900) < 700;
  const num = (label, value, short) => ({ label: narrow && short ? short : label, num: true, value });
  const oppTable = dataTable([{ label: "Opponent", value: (o) => o.name }, num("Played", (o) => o.n, "P"), num("W", (o) => o.w), num("T", (o) => o.t),
    num("L", (o) => o.l), num("Won", (o) => F.pct(o.win)), num("Goals", (o) => `${o.gf}–${o.ga}`)], opps);
  const teamTable = dataTable([{ label: "Team", value: (t) => t.name }, num("Seasons", (t) => t.seasons, "Sea."), num("Played", (t) => t.n, "P"), num("W", (t) => t.w),
    num("T", (t) => t.t), num("L", (t) => t.l), num("Win rate", (t) => F.pct(t.win), "Win")], teams);
  // on a phone the seven columns only fit with tighter cells; scroll sideways rather than clip if they still don't
  if (narrow) for (const t of [oppTable, teamTable]) t.querySelectorAll("th, td").forEach((cell) => { cell.style.paddingLeft = "5px"; cell.style.paddingRight = "5px"; });
  const wrap = (title, table, empty) => h("div", { style: { minWidth: "0" } }, h("h4", {}, title),
    table.tBodies[0].rows.length ? h("div", { style: { overflowX: "auto" } }, table) : h("div", { class: "empty-state" }, empty));
  c.body.append(h("div", { class: "two-tables", style: { gridTemplateColumns: narrow ? null : "minmax(0, 1fr) minmax(0, 1fr)", marginTop: "4px" } },
    wrap(narrow ? "Opponents met 3+ times (P = played)" : "Opponents met 3+ times", oppTable, "Nobody three times yet in this period"),
    wrap(narrow ? `Names we have played under ${"(Sea. = seasons, P = played)".replaceAll(" ", NB)}` : "Names we have played under", teamTable, "No team names for this period")));
}

// ---------------------------------------------------------------- 6. form over time

function renderRolling(el, games) {
  const P = palette(), RC = resColors(P);
  const n = games.length;
  const W = n >= 10 ? 10 : n >= 5 ? 5 : 0; // games in the window
  const tot = tally(games);
  const pts = games.map((r, i) => {
    const win = W && i + 1 >= W ? games.slice(i + 1 - W, i + 1) : null;
    const rec = win ? tally(win) : null;
    return { r, date: r._date, win, rec, v: rec ? rec.ppg : null };
  });
  const line = pts.filter((d) => d.v != null);
  const now = line[line.length - 1];
  // the first window to reach the highest and the lowest value
  let best = null, worst = null;
  for (const d of line) { if (!best || d.v > best.v) best = d; if (!worst || d.v < worst.v) worst = d; }
  const marked = line.length > 1 && best.v > worst.v;
  // in a short period the best and worst windows share games: shading both would grey out the whole plot
  const shaded = marked && (best.r.date < worst.win[0].date || worst.r.date < best.win[0].date);
  const one = (v) => F.num(v, 1);
  const span = (d) => fmtRange(d.win[0].date, d.r.date);
  let title = "Form over time";
  if (line.length === 1) title = `Our ${W} league games in this period: ${one(now.v)} points a game`;
  else if (W) {
    title = `Our last ${W} games: ${one(now.v)} points a game, against ${one(tot.ppg)} over all ${F.int(n)}` +
      (!marked ? "" : best === now ? `; that is the best ${W} so far` : `; the best ${W} came in ${monthSpan(best.win[0]._date, best.r._date)} at ${one(best.v)}`);
  }
  const columns = [{ label: "Date", value: (d) => F.fmtDate(d.r.date) }, { label: "Score", num: true, value: (d) => score(d.r) },
    { label: "Result", value: (d) => RES[d.r.result] }, { label: `Last ${W || 10} games`, num: true, value: (d) => (d.rec ? recText(d.rec) : "–") },
    { label: "Points per game", num: true, value: (d) => (d.v == null ? "–" : one(d.v)) }];
  const c = card(el, {
    title,
    sub: !W ? "Points per game (3 for a win, 1 for a tie) over our most recent league games, redrawn after every game."
      : `Points per game (3 for a win, 1 for a tie) over the ${W} league games up to each date, so the line starts at game ${W} and moves with every result. ` +
        `The straight line is the average over all ${pl(n, "game")}. Underneath, each game is a tick: wins in the top row, ties in the middle, losses at the bottom.` +
        (shaded ? ` Shaded: the best ${W} games (${span(best)}) and the worst (${span(worst)}).`
          : marked ? ` The dots mark where the best ${W} games (${span(best)}) and the worst (${span(worst)}) ended; the two share games.` : "") +
        (W < 10 ? " With fewer than 10 games in this period the window is 5 games, which swings on a single result." : ""),
  });
  if (!n) return noGames(c, columns);
  if (!W) {
    noGames(c, columns, `Only ${pl(n, "league game")} in this period: too few for a rolling average, which needs at least 5`);
    return c.setTable(columns, pts.slice().reverse());
  }

  const narrow = (c.body.getBoundingClientRect().width || 900) < 620;
  const ROW = 9, TICK = 7, RUG = 10 + 3 * ROW; // three rows of result ticks under the plot
  const f = frame(c.body, { height: narrow ? 280 : 310, margin: { left: 34, right: 40, top: 26 } });
  const { svg, g, w, h: ht } = f;
  const ph = ht - RUG;
  let [d0, d1] = d3.extent(pts, (d) => d.date);
  if (d3.timeDay.count(d0, d1) < 28) { d0 = d3.timeDay.offset(d0, -14); d1 = d3.timeDay.offset(d1, 14); }
  const x = d3.scaleTime().domain([d0, d1]).range([0, w]);
  const y = d3.scaleLinear().domain([0, Math.max(d3.max(line, (d) => d.v), tot.ppg, 1)]).nice(4).range([ph, 0]);

  const bands = marked ? [{ d: best, text: `best ${W}: ${one(best.v)}` }, { d: worst, text: `worst ${W}: ${one(worst.v)}` }] : [];
  for (const b of bands) {
    b.x1 = x(b.d.date); b.x0 = shaded ? Math.min(x(b.d.win[0]._date), b.x1 - 3) : b.x1;
    if (shaded) g.append("rect").attr("x", b.x0).attr("y", 0).attr("width", b.x1 - b.x0).attr("height", ph).attr("fill", P.wash).attr("rx", 3);
  }
  yGrid(g, y, w, { ticks: 4, format: one });
  xTime(g, x, ht);

  // every game as a tick: one row per result, so a double-header or a crowded month hides nothing
  const rowY = (res) => ph + 9 + { W: 0, T: 1, L: 2 }[res] * ROW;
  const tw = narrow ? 1.5 : 2;
  g.append("g").selectAll("rect").data(pts).join("rect").attr("x", (d) => x(d.date) - tw / 2).attr("y", (d) => rowY(d.r.result))
    .attr("width", tw).attr("height", TICK).attr("rx", tw / 2).attr("fill", (d) => RC[d.r.result]);
  // a long break in the ticks is a stretch with no league at all: say so rather than leave a flat line unexplained
  d3.pairs(pts).filter(([a, b]) => d3.timeDay.count(a.date, b.date) > 120).forEach(([a, b]) => {
    const t = g.append("text").attr("class", "annot-muted").attr("x", (x(a.date) + x(b.date)) / 2).attr("y", rowY("T") + TICK)
      .attr("text-anchor", "middle").text("no league games");
    if (t.node().getComputedTextLength() > x(b.date) - x(a.date) - 16) t.remove();
  });

  const avgY = Math.round(y(tot.ppg)) + 0.5;
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", avgY).attr("y2", avgY).attr("stroke", P.ink2).attr("stroke-width", 1.5);
  g.append("path").datum(line).attr("fill", "none").attr("stroke", P.soccer).attr("stroke-width", 2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
    .attr("d", d3.line().curve(d3.curveStepAfter).x((d) => x(d.date)).y((d) => y(d.v)));
  for (const b of bands) if (b.d !== now) g.append("circle").attr("cx", x(b.d.date)).attr("cy", y(b.d.v)).attr("r", 3.5).attr("fill", P.soccer).attr("stroke", P.surface).attr("stroke-width", 1.5);
  g.append("circle").attr("cx", x(now.date)).attr("cy", y(now.v)).attr("r", 4).attr("fill", P.soccer).attr("stroke", P.surface).attr("stroke-width", 2);
  g.append("text").attr("class", "annot halo").attr("x", x(now.date) + 8).attr("y", y(now.v)).attr("dy", "0.32em").text(one(now.v));
  // the average is named just above or below its line, wherever the form line leaves the most room
  const avgText = g.append("text").attr("class", "annot halo").text(`average ${F.num(tot.ppg, 2)}`);
  const aw = avgText.node().getComputedTextLength(), upTo = d3.bisector((d) => d.date).right;
  // the line is stepped, so between two samples it also covers everything from one height to the other
  const crowd = (q) => {
    let before = null;
    return d3.range(q.x - 10, q.x + aw + 11, 4).filter((px) => {
      const i = upTo(line, x.invert(px)) - 1, ly = i < 0 ? null : y(line[i].v);
      const from = before ?? ly;
      before = ly;
      return ly != null && Math.max(ly, from) > q.y - 17 && Math.min(ly, from) < q.y + 9;
    }).length;
  };
  const spots = d3.range(4, Math.max(5, w - aw - 3), 12).flatMap((px) => [{ x: px, y: avgY - 6 }, { x: px, y: avgY + 15 }]).filter((q) => q.y > 12 && q.y < ph - 4);
  const spot = d3.least(spots, crowd) || { x: 4, y: avgY - 6 };
  avgText.attr("x", spot.x).attr("y", spot.y);
  bandLabels(g, bands, w + 36);

  // hover: nearest match day (a double-header shows both games and the window after the second)
  const days = d3.groups(pts, (d) => +d.date).map(([, v]) => ({ date: v[0].date, games: v, last: v[v.length - 1] }));
  const cross = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ht).attr("visibility", "hidden");
  const ring = g.append("circle").attr("r", 5).attr("fill", P.soccer).attr("stroke", P.surface).attr("stroke-width", 2).attr("visibility", "hidden");
  let idx = days.length - 1;
  const showAt = (i, ev) => {
    idx = Math.max(0, Math.min(days.length - 1, i));
    const d = days[idx], q = d.last;
    cross.attr("visibility", "visible").attr("x1", x(d.date)).attr("x2", x(d.date));
    ring.attr("visibility", q.v == null ? "hidden" : "visible").attr("cx", x(d.date)).attr("cy", q.v == null ? 0 : y(q.v));
    tooltip.show(ev, { title: `${DAY(d.date)} ${F.fmtDate(d.date)}`, rows: [
      ...d.games.map((k) => ({ label: `${RES[k.r.result]}${k.r._opp ? ` v ${opp.name(k.r)}` : ""}`, value: score(k.r), color: RC[k.r.result] })),
      ...(q.rec ? [{ label: `Last ${W} games`, value: recText(q.rec) }, { label: "Points per game", value: one(q.v), color: P.soccer, mark: "line" }] : [])],
    note: q.rec ? null : `The line starts at game ${W}` });
  };
  const hide = () => { cross.attr("visibility", "hidden"); ring.attr("visibility", "hidden"); tooltip.hide(); };
  const bis = d3.bisector((d) => d.date).center;
  g.append("rect").attr("class", "hit").attr("width", w).attr("height", ht)
    .on("pointermove", (ev) => showAt(bis(days, x.invert(d3.pointer(ev)[0])), ev))
    .on("pointerleave", hide);
  svg.attr("tabindex", 0).attr("aria-label", `Points per game over the last ${W} games: use arrow keys to step through match days`)
    .on("focus", function () { showAt(idx, focusEvent(this)); })
    .on("blur", hide)
    .on("keydown", function (ev) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.preventDefault();
        showAt(idx + (ev.key === "ArrowLeft" ? -1 : 1), focusEvent(cross.node()));
      }
    });
  legend(c.legend, [{ label: `Points per game, last ${W} games`, color: P.soccer, mark: "ln" },
    { label: `Average over all ${pl(n, "game")}`, color: P.ink2, mark: "ln" }, ...resLegend(P)]);
  c.setTable(columns, pts.slice().reverse());
}

// ---------------------------------------------------------------- 7. attack against defence

function renderAttack(el, games) {
  const P = palette();
  const SIDE = { W: { label: "Scored more than let in", color: P.win }, T: { label: "Level", color: P.tie }, L: { label: "Let in more than scored", color: P.loss } };
  const two = (v) => F.num(v, 2);
  // per-game figures are over games with a score, so a forfeit doesn't water them down
  const seasons = seasonsOf(games).map((s) => {
    const k = s.games.filter((r) => r.gf != null).length;
    return { ...s, k, x: k ? s.gf / k : null, y: k ? s.ga / k : null, side: s.gd > 0 ? "W" : s.gd < 0 ? "L" : "T", futsal: /futsal|5v5/i.test(s.games[0].format || "") };
  }).filter((s) => s.k);
  // 5-a-side scores run far higher: a futsal season that would stretch the scales is left off the chart
  const rest = seasons.filter((s) => !s.futsal);
  const top = d3.max(rest, (s) => Math.max(s.x, s.y)) || 0;
  const off = rest.length ? seasons.filter((s) => s.futsal && Math.max(s.x, s.y) > top * 1.25) : [];
  const drawn = seasons.filter((s) => !off.includes(s));
  const count = (side) => seasons.filter((s) => s.side === side).length;
  const up = count("W"), level = count("T"), down = count("L"), ns = seasons.length;
  const tail = [down ? `were outscored in ${F.int(down)}` : null, level ? `finished level in ${F.int(level)}` : null].filter(Boolean).join(" and ");
  const only = seasons[0];
  const title = !ns ? "Attack against defence"
    : ns === 1 ? `In the one season in this period we scored ${two(only.x)} a game and let in ${two(only.y)}`
      : up ? `We outscored the opposition in ${F.int(up)} of ${pl(ns, "season")}${tail ? `, ${tail}` : ""}`
        : `We didn't outscore the opposition in ${ns === 2 ? "either of the 2 seasons" : `any of the ${F.int(ns)} seasons`} in this period`;
  const sizes = d3.extent(drawn, (s) => s.n);
  const forfeits = games.filter((r) => r.gf == null).length;
  const columns = [{ label: "Season", value: (s) => s.full }, { label: "Played", num: true, value: (s) => s.n },
    { label: "W", num: true, value: (s) => s.w }, { label: "T", num: true, value: (s) => s.t }, { label: "L", num: true, value: (s) => s.l },
    { label: "Goals", num: true, value: (s) => `${s.gf}–${s.ga}` }, { label: "Scored/game", num: true, value: (s) => two(s.x) },
    { label: "Let in/game", num: true, value: (s) => two(s.y) }];
  const c = card(el, {
    title,
    sub: "One dot per season: goals scored per game along the bottom, goals let in per game up the side (fewer at the top), so the best seasons sit top right " +
      "and dots above the diagonal scored more than they let in." +
      (drawn.length > 1 && sizes[0] !== sizes[1] ? ` Bigger dots are longer seasons (${sizes[0]} to ${sizes[1]} games)${drawn.length > 6 ? "; only the most extreme are named" : ""}.` : "") +
      (off.length === 1 ? ` Not drawn: the futsal season (5-a-side, ${F.num(off[0].x, 1)} scored and ${F.num(off[0].y, 1)} let in per game), which would stretch both scales but still counts in the title and the table.`
        : off.length ? ` Not drawn: ${off.length} futsal seasons (5-a-side, with far higher scores), which would stretch both scales but still count in the title and the table.` : "") +
      (forfeits ? ` ${forfeits === 1 ? "One forfeit has" : `${forfeits} forfeits have`} no score and ${forfeits === 1 ? "is" : "are"} left out of the per-game figures.` : ""),
  });
  if (!ns) return noGames(c, columns);

  const narrow = (c.body.getBoundingClientRect().width || 520) < 420;
  const m = { left: 30, right: 14, top: 28, bottom: 42 };
  const f = frame(c.body, { height: narrow ? 310 : 340, margin: m });
  const { g, w, h: ht } = f;
  // one scale for both axes, so the diagonal runs corner to corner
  const M = d3.scaleLinear().domain([0, Math.max(1, d3.max(drawn, (s) => Math.max(s.x, s.y)) * 1.04)]).nice(5).domain()[1];
  const x = d3.scaleLinear().domain([0, M]).range([0, w]);
  const y = d3.scaleLinear().domain([0, M]).range([0, ht]); // fewer let in is higher up
  const r = d3.scaleSqrt().domain([0, d3.max(drawn, (s) => s.n)]).range([0, narrow ? 8 : 10]);
  const tk = x.tickFormat(5);
  yGrid(g, y, w, { ticks: 5, format: tk });
  const gx = g.append("g").attr("class", "axis");
  gx.selectAll("line").data(x.ticks(5)).join("line").attr("class", "gridline")
    .attr("x1", (d) => Math.round(x(d)) + 0.5).attr("x2", (d) => Math.round(x(d)) + 0.5).attr("y1", 0).attr("y2", ht);
  gx.selectAll("text").data(x.ticks(5)).join("text").attr("x", (d) => x(d)).attr("y", ht + 17).attr("text-anchor", "middle").text(tk);
  g.append("text").attr("class", "annot-muted").attr("x", -m.left).attr("y", -14).text("Goals let in per game (fewer is better ↑)");
  g.append("text").attr("class", "annot-muted").attr("x", w / 2).attr("y", ht + 36).attr("text-anchor", "middle").text("Goals scored per game (more is better →)");
  g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", w).attr("y2", ht).attr("stroke", P.muted).attr("stroke-width", 1);
  g.append("text").attr("class", "annot-muted halo").attr("text-anchor", "end").attr("dy", -6)
    .attr("transform", `translate(${w * 0.97},${ht * 0.97}) rotate(${(Math.atan2(ht, w) * 180) / Math.PI})`).style("font-weight", 400).text("scored = let in");

  const dots = drawn.slice().sort((a, b) => d3.descending(a.n, b.n)).map((s) => ({ s, cx: x(s.x), cy: y(s.y), rr: r(s.n) }));
  g.append("g").selectAll("circle").data(dots).join("circle").attr("cx", (d) => d.cx).attr("cy", (d) => d.cy).attr("r", (d) => d.rr)
    .attr("fill", (d) => SIDE[d.s.side].color).attr("stroke", P.surface).attr("stroke-width", 1.5);

  // name only the extremes: best and worst balance, then attack and defence at their best and worst
  const fair = drawn.filter((s) => s.k >= 4);
  const pool = fair.length >= 2 ? fair : drawn;
  const pick = (v, dir) => pool.slice().sort((a, b) => dir(v(a), v(b)) || d3.descending(a.n, b.n))[0];
  const named = drawn.length <= 3 ? drawn : [...new Set([pick((s) => s.x - s.y, d3.descending), pick((s) => s.x - s.y, d3.ascending),
    pick((s) => s.x, d3.descending), pick((s) => s.y, d3.ascending), pick((s) => s.y, d3.descending), pick((s) => s.x, d3.ascending)])].slice(0, narrow ? 4 : 6);
  // each label slides around its own dot (right, left, above, below) to the spot that covers the least of the other labels and dots
  // and isn't hard up against somebody else's dot; three rounds let an early label make way for a later one
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const dotBox = (d) => ({ x0: d.cx - d.rr - 2, x1: d.cx + d.rr + 2, y0: d.cy - d.rr - 2, y1: d.cy + d.rr + 2 });
  const gapTo = (q, o) => Math.hypot(Math.max(q.x0 - o.cx, 0, o.cx - q.x1), Math.max(q.y0 - o.cy, 0, o.cy - q.y1)) - o.rr;
  const labels = g.append("g").attr("pointer-events", "none");
  const tags = named.map((s) => {
    const d = dots.find((q) => q.s === s);
    // "Team · Mar 2030 · Tue" takes two lines (team, then when) to stay narrow; a phone has room for the month and day only
    const team = s.label.startsWith(`${s.main} · `), fmt = s.games[0].format ? ` · ${s.games[0].format}` : null;
    const when = team ? s.label.slice(s.main.length + 3) : fmt && s.label.endsWith(fmt) ? s.label.slice(0, -fmt.length) : s.label;
    const t = labels.append("text").attr("class", "annot halo");
    const spans = (narrow ? [when] : team ? [s.main, when] : [s.label]).map((text, i) => t.append("tspan").style("font-weight", i ? 400 : null).text(text));
    const tw = d3.max(spans, (sp) => sp.node().getComputedTextLength()), th = 13 * spans.length + 1;
    const xs = d3.range(d.cx - tw, d.cx + 1, 4), ys = d3.range(d.cy - th, d.cy + 1, 3);
    const spots = [...ys.map((y0) => ({ x0: d.cx + d.rr + 5, y0, bias: Math.abs(y0 + th / 2 - d.cy) / 2 })),
      ...ys.map((y0) => ({ x0: d.cx - d.rr - 5 - tw, y0, bias: 1 + Math.abs(y0 + th / 2 - d.cy) / 2 })),
      ...xs.map((x0) => ({ x0, y0: d.cy - d.rr - 3 - th, bias: 2 + Math.abs(x0 + tw / 2 - d.cx) / 5 })),
      ...xs.map((x0) => ({ x0, y0: d.cy + d.rr + 3, bias: 3 + Math.abs(x0 + tw / 2 - d.cx) / 5 }))]
      .map((q) => ({ ...q, x1: q.x0 + tw, y1: q.y0 + th }));
    const inside = spots.filter((q) => q.x0 >= 2 && q.x1 <= w + m.right - 2 && q.y0 >= 0 && q.y1 <= ht + 4);
    return { d, text: t, spans, spots: inside.length ? inside : spots, spot: null };
  });
  for (let round = 0; round < 3; round++) for (const tag of tags) {
    const taken = tags.filter((o) => o !== tag && o.spot).map((o) => o.spot);
    tag.spot = d3.least(tag.spots, (q) => 50 * d3.sum(taken, (o) => overlap(q, o)) + q.bias
      + d3.sum(dots, (o) => (o === tag.d ? 0 : 2 * overlap(q, dotBox(o)) + (gapTo(q, o) < 5 ? 150 : 0))));
  }
  // in a tight cluster on a phone the least bad spot can still be on top of a neighbour's dot or label:
  // that season then goes unnamed on the chart (its tooltip and the table still name it); the first named are the most extreme
  const placed = [];
  for (const tag of tags) {
    const blocked = dots.some((o) => o !== tag.d && overlap(tag.spot, dotBox(o)) > 0) || placed.some((o) => overlap(tag.spot, o.spot) > 0);
    if (blocked) tag.text.remove(); else placed.push(tag);
  }
  for (const tag of placed) tag.spans.forEach((sp, i) => sp.attr("x", tag.spot.x0).attr("y", tag.spot.y0 + 11 + 13 * i));

  // small dots on top, so a big neighbour can't swallow their hit target
  g.append("g").selectAll("circle").data(dots).join("circle").attr("class", "hit").attr("cx", (d) => d.cx).attr("cy", (d) => d.cy)
    .attr("r", (d) => Math.max(11, d.rr + 4)).attr("tabindex", 0)
    .attr("aria-label", (d) => `${d.s.full}: scored ${two(d.s.x)} a game, let in ${two(d.s.y)}`)
    .on("pointerenter pointermove focus", function (ev, d) {
      const s = d.s;
      tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: s.full, rows: [
        { label: "Record", value: recText(s) },
        { label: "Goals for–against", value: `${s.gf}–${s.ga}`, color: SIDE[s.side].color, mark: "dot" },
        { label: "Scored per game", value: two(s.x) }, { label: "Let in per game", value: two(s.y) }],
      note: `${pl(s.n, "game")}${s.k < s.n ? `, ${pl(s.n - s.k, "forfeit")} with no score` : ""}${s.n < 4 ? " · too few to read much into" : ""}` });
    })
    .on("pointerleave blur", () => tooltip.hide());
  legend(c.legend, ["W", "T", "L"].map((k) => ({ label: SIDE[k].label, color: SIDE[k].color, mark: "dt" })));
  c.setTable(columns, seasons);
}

// ---------------------------------------------------------------- 8. how games are decided

function renderMargin(el, games) {
  const P = palette(), RC = resColors(P);
  const CAP = 6;
  const scored = games.filter((r) => r.gf != null);
  const n = scored.length, forfeits = games.length - n;
  const bins = d3.range(-CAP, CAP + 1).map((m) => ({ m, res: m < 0 ? "L" : m > 0 ? "W" : "T", v: [] }));
  for (const r of scored) bins[Math.max(-CAP, Math.min(CAP, r.gf - r.ga)) + CAP].v.push(r);
  const name = (b) => (b.m === 0 ? "Tied" : `${b.m < 0 ? "Lost" : "Won"} by ${Math.abs(b.m)}${Math.abs(b.m) === CAP ? " or more" : ""}`);
  const won1 = bins[CAP + 1].v.length, lost1 = bins[CAP - 1].v.length, one = won1 + lost1;
  const columns = [{ label: "Final margin", value: name }, { label: "Games", num: true, value: (b) => b.v.length },
    { label: "Share", num: true, value: (b) => F.pct(b.v.length / n) }];
  const c = card(el, {
    title: !n ? "How games are decided" : !one ? `None of our ${pl(n, "league game")} in this period was decided by a single goal`
      : `${F.int(one)} of our ${pl(n, "league game")} (${F.pct(one / n)}) ${one === 1 ? "was" : "were"} decided by a single goal: we won ${F.int(won1)} and lost ${F.int(lost1)}`,
    sub: `How many games finished at each margin: our goals minus the other team's, so losses are on the left, ties in the middle and wins on the right. ` +
      `Margins of ${CAP} or more are lumped together at each end.` +
      (forfeits ? ` ${forfeits === 1 ? "One forfeit has" : `${forfeits} forfeits have`} no score and ${forfeits === 1 ? "is" : "are"} left out.` : ""),
  });
  if (!n) return noGames(c, columns);

  legend(c.legend, resLegend(P));
  // beside a taller neighbour the bars grow into the room the row leaves, rather than sit above a blank strip
  const room = el.getBoundingClientRect().bottom - c.body.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).paddingBottom) || 0) - 2;
  const mg = { left: 30, right: 6, top: 26, bottom: 54 };
  const f = frame(c.body, { height: Math.round(Math.max(300, Math.min(400, room || 0))), margin: mg });
  const { g, w, h: ht } = f;
  const x = d3.scaleBand().domain(bins.map((b) => b.m)).range([0, w]);
  const max = d3.max(bins, (b) => b.v.length);
  const y = d3.scaleLinear().domain([0, max]).nice(4).range([ht, 0]);
  // the gridline at zero would double up the baseline
  yGrid(g, y, w, { ticks: Math.min(4, max), format: F.int }).selectAll("line").filter((d) => d === 0).remove();
  g.append("text").attr("class", "annot-muted").attr("x", -mg.left).attr("y", -14).text("Games");
  g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", ht + 0.5).attr("y2", ht + 0.5);
  g.append("text").attr("class", "annot-muted").attr("x", w / 2).attr("y", ht + 48).attr("text-anchor", "middle").text("Final margin: our goals minus theirs");
  const band = x.bandwidth(), bw = Math.max(6, Math.min(24, band - 6));
  for (const b of bins) {
    const k = b.v.length, mid = x(b.m) + band / 2, edge = Math.abs(b.m) === CAP;
    if (k) {
      g.append("path").attr("d", barPath(mid - bw / 2, y(k), bw, ht - y(k))).attr("fill", RC[b.res]);
      g.append("text").attr("class", "annot").attr("x", mid).attr("y", y(k) - 6).attr("text-anchor", "middle").text(k);
    }
    g.append("text").attr("class", "annot").attr("x", mid).attr("y", ht + 17).attr("text-anchor", "middle").text(signed(b.m));
    // the end bars take a second line; it hangs from the plot's edge so it can't run into its neighbour
    if (edge) g.append("text").attr("class", "annot-muted").attr("x", b.m < 0 ? x(b.m) : x(b.m) + band).attr("y", ht + 31)
      .attr("text-anchor", b.m < 0 ? "start" : "end").text(b.m < 0 ? "or worse" : "or better");
    const common = d3.groups(b.v, (q) => score(q)).map(([s, v]) => ({ s, n: v.length })).sort((a, z) => d3.descending(a.n, z.n))[0];
    g.append("rect").attr("class", "hit").attr("x", x(b.m)).attr("y", 0).attr("width", band).attr("height", ht).attr("tabindex", 0)
      .attr("aria-label", `${name(b)}: ${pl(k, "game")}`)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: `${name(b)}${b.m && !edge ? ` goal${Math.abs(b.m) === 1 ? "" : "s"}` : b.m ? " goals" : ""}`,
          rows: k ? [{ label: "Games", value: F.int(k), color: RC[b.res] }, { label: "Share of games", value: F.pct(k / n) }] : [{ label: "Never happened", value: "" }],
          note: !k ? null : common.n > 1 ? `Most often ${common.s} (${times(common.n)})` : `Most recent: ${score(b.v[k - 1])} on ${F.fmtDate(b.v[k - 1].date)}` });
      })
      .on("pointerleave blur", () => tooltip.hide());
  }
  c.setTable(columns, bins);
}

// ---------------------------------------------------------------- 9. streaks

/** The longest run of consecutive games passing `keep` (the latest, if several are as long) and how many runs are that long. */
function longestRun(games, keep) {
  let best = null, count = 0, cur = [];
  const close = () => {
    if (cur.length && (!best || cur.length >= best.length)) { count = best && cur.length === best.length ? count + 1 : 1; best = cur; }
    cur = [];
  };
  for (const r of games) { if (keep(r)) cur.push(r); else close(); }
  close();
  return { len: best ? best.length : 0, games: best || [], count };
}
/** How many games at the end of the list pass `keep`. */
function tailRun(games, keep) {
  let k = 0;
  while (k < games.length && keep(games[games.length - 1 - k])) k++;
  return k;
}

function renderStreaks(el, games, all) {
  const isW = (r) => r.result === "W", isL = (r) => r.result === "L", notL = (r) => !isL(r), notW = (r) => !isW(r);
  const won = longestRun(games, isW), unbeaten = longestRun(games, notL), lost = longestRun(games, isL), winless = longestRun(games, notW);
  const n = games.length;
  const title = !n ? "Streaks"
    : !lost.len ? `We haven't lost a league game in this period; the most we have won in a row is ${F.int(won.len)}`
      : `The most league games we have lost in a row is ${F.int(lost.len)}; ` + (won.len ? `the most we have won in a row is ${F.int(won.len)}` : "we haven't won one in this period");
  const c = card(el, {
    title,
    sub: "Runs of league games in the order they were played, across seasons and whichever name we were playing under. A tie ends a winning run and a losing run, " +
      "but keeps an unbeaten run and a run without a win going." + (games.some((r) => r.forfeit) ? " A forfeit counts as a loss." : ""),
    table: false,
  });
  legend(c.legend, []);
  if (!n) return noGames(c, null);
  const narrow = (c.body.getBoundingClientRect().width || 520) < 420;

  const when = (run) => (run.len === 1 ? F.fmtDate(run.games[0].date) : fmtRange(run.games[0].date, run.games[run.len - 1].date));
  // "(4 W · 1 T)" for a run that includes ties; the bracket never breaks inside
  const mix = (run, a, b) => {
    const t = tally(run.games);
    return t.t ? ` (${a === "W" ? `${t.w} W` : `${t.t} T`} · ${b === "T" ? `${t.t} T` : `${t.l} L`})`.replaceAll(" ", NB).replace(NB, " ") : "";
  };
  const row = (label, run, extra = "") => ({ label, value: run.len ? `${pl(run.len, "game").replace(" ", NB)}${extra}` : "None",
    dates: run.len ? when(run) : "–", note: run.count > 1 ? `the latest of ${run.count} runs this long` : null });
  // where things stand after the last game in the period
  const last = games[n - 1];
  const tw = tailRun(games, isW), tu = tailRun(games, notL), tl = tailRun(games, isL), tn = tailRun(games, notW);
  const now = isW(last) ? (tw > 1 ? [`Won the last ${tw}`, tw] : tu > 1 ? [`Unbeaten in ${tu}`, tu] : ["Won the last game", 1])
    : isL(last) ? (tl > 1 ? [`Lost the last ${tl}`, tl] : tn > 1 ? [`Without a win in ${tn}`, tn] : ["Lost the last game", 1])
      : tu > 1 && tu >= tn ? [`Unbeaten in ${tu}`, tu] : tn > 1 ? [`Without a win in ${tn}`, tn] : ["Tied the last game", 1];
  const current = all[all.length - 1] === last;
  const runs = [row("Most wins in a row", won), row("Longest unbeaten", unbeaten, mix(unbeaten, "W", "T")), row("Most losses in a row", lost),
    row("Longest without a win", winless, mix(winless, "T", "L")),
    { label: current ? "Right now" : "At the end of this period", value: now[0], dates: now[1] > 1 ? `since ${F.fmtDate(games[n - now[1]].date)}` : F.fmtDate(last.date) }];
  const runTable = dataTable([{ label: "Run", value: (d) => d.label }, { label: "Length", value: (d) => d.value }, { label: "When", value: (d) => (d.note ? [d.dates, h("div", { style: { color: "var(--muted)", fontSize: "12px" } }, d.note)] : d.dates) }], runs);
  if (narrow) runTable.querySelectorAll("th, td").forEach((cell) => { cell.style.paddingLeft = "5px"; cell.style.paddingRight = "5px"; });
  else runTable.querySelectorAll("td").forEach((cell) => { cell.style.whiteSpace = "nowrap"; });

  // first and last games of a season; a season whose latest game is within a fortnight of our most recent one is taken to be still going
  const latest = all[all.length - 1]._date;
  const seasons = seasonsOf(games).filter((s) => s.n >= 2);
  const firsts = seasons.map((s) => s.games[0]);
  const lasts = seasons.filter((s) => d3.timeDay.count(s.games[s.n - 1]._date, latest) > 14).map((s) => s.games[s.n - 1]);
  const after = (res) => games.slice(1).filter((_, i) => games[i].result === res);
  const aw = tally(after("W")), al = tally(after("L"));
  const groups = [{ label: "First game of a season", ...tally(firsts) }, { label: "Last game of a season", ...tally(lasts) },
    { label: "Game after a win", ...aw }, { label: "Game after a loss", ...al }];
  const num = (label, value, short) => ({ label: narrow && short ? short : label, num: true, value });
  const nextTable = dataTable([{ label: "", value: (d) => d.label }, num("Played", (d) => d.n, "P"), num("W", (d) => d.w), num("T", (d) => d.t), num("L", (d) => d.l),
    num("Win rate", (d) => F.pct(d.win), "Win")], groups);
  if (narrow) nextTable.querySelectorAll("th, td").forEach((cell) => { cell.style.paddingLeft = "5px"; cell.style.paddingRight = "5px"; });

  // does a win carry over? the same test of a gap against chance as the splits card
  let carry = "Too few games in this period to say whether a win carries over into the next game.";
  if (aw.n >= MIN_GROUP && al.n >= MIN_GROUP) {
    const pool = (aw.w + al.w) / (aw.n + al.n);
    const z = (aw.win - al.win) / Math.sqrt(pool * (1 - pool) * (1 / aw.n + 1 / al.n) || 1);
    const nums = `we won ${F.pct(aw.win)} of the games straight after a win (${aw.w} of ${aw.n}) and ${F.pct(al.win)} of those straight after a loss (${al.w} of ${al.n})`;
    // as on the splits card, a wide gap that still falls short of the test is "may, but small samples", not "chance would easily give this"
    const gap = aw.win - al.win;
    carry = z >= 2 ? `A win does seem to carry over: ${nums}.`
      : z <= -2 ? `If anything a win is followed by fewer wins: ${nums}.`
        : Math.abs(gap) >= 0.15 ? `${gap > 0 ? "A win may carry over" : "A win may be followed by fewer wins"}, but the samples are small: ${nums}.`
          : `A win doesn't visibly carry over: ${nums}, a gap chance alone would easily give.`;
  }
  const small = `First and last games are one a season (${firsts.length} and ${lasts.length} here), far too few to read anything into` +
    (lasts.length < seasons.length ? "; a season still being played has no last game yet." : ".");
  const wrap = (heading, ...kids) => h("div", { style: { minWidth: "0" } }, h("h4", {}, heading), kids);
  c.body.append(h("div", { class: "two-tables", style: { gridTemplateColumns: "minmax(0, 1fr)", marginTop: "4px" } },
    wrap("Runs", h("div", { style: { overflowX: "auto" } }, runTable)),
    wrap(narrow ? "Does it carry over? (P = played)" : "Does it carry over?", h("div", { style: { overflowX: "auto" } }, nextTable),
      h("p", { class: "sub", style: { marginTop: "8px" } }, `${carry} ${small}`))));
}
