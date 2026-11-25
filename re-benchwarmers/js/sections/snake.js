// Season snake: one running-total line per league season, every one starting from zero before game 1,
// which shows which season pulled ahead and when. Our own games only (data.soccer.league).
import { inPeriod, toMonth } from "../state.js?v=fe5dbb801b";
import { h, card, legend, tooltip, focusEvent, segmented } from "../ui.js?v=fe5dbb801b";
import { palette, frame, yGrid } from "../charts.js?v=fe5dbb801b";
import * as F from "../format.js?v=fe5dbb801b";

let measure = "pts";

const DAY = d3.timeFormat("%a"), DAY_LONG = d3.timeFormat("%A"), MON = d3.timeFormat("%b"), YY = d3.timeFormat("%y");
const pl = (n, word) => `${F.int(n)} ${word}${n === 1 ? "" : "s"}`;
const signed = (v) => (v > 0 ? `+${F.int(v)}` : v < 0 ? `−${F.int(-v)}` : "0");
const signed1 = (v) => { const r = Math.round(v * 10) / 10; return r > 0 ? `+${F.num(r, 1)}` : r < 0 ? `−${F.num(-r, 1)}` : "0.0"; };
const one = (v) => F.num(v, 1);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ROLE = { "so far": "this season, so far", latest: "latest season", best: "best finished season", worst: "worst finished season" };
const points = (r) => (r.result === "W" ? 3 : r.result === "T" ? 1 : 0);

// What is added up game by game. `lower` means a smaller total is the better one.
// best / now / last are the title's clauses: the best finished season, the season being played, the latest finished one.
const MEASURES = [
  { id: "pts", label: "Points", short: "Points", tot: (v) => pl(v, "point"), axis: "Points, running total", of: points, fmt: F.int, avg: one,
    read: "the points (3 for a win, 1 for a tie) added up so far, so the steepest line had the best run",
    adj: "best", tail: "",
    best: (s) => `${pl(s.v, "point")} from ${pl(s.n, "game")}`,
    now: (s) => `this season has ${F.int(s.v)} from ${s.n}`,
    last: (s) => `ended on ${F.int(s.v)} from ${s.n}` },
  { id: "gd", label: "Goal difference", short: "Goal diff", tot: (v) => `a goal difference of ${signed(v)}`, axis: "Goal difference, running total", of: (r) => (r.gf || 0) - (r.ga || 0), fmt: signed, avg: signed1,
    read: "goals scored minus goals let in so far, so a line climbs when we outscore the other team and drops when we don't",
    adj: "best", tail: " for goal difference",
    best: (s) => `${signed(s.v)} over ${pl(s.n, "game")}`,
    now: (s) => `this season is ${signed(s.v)} after ${s.n}`,
    last: (s) => `ended ${signed(s.v)} after ${s.n}` },
  { id: "gf", label: "Goals scored", short: "Scored", tot: (v) => `${pl(v, "goal")} scored`, axis: "Goals scored, running total", of: (r) => r.gf || 0, fmt: F.int, avg: one,
    read: "the goals we have scored so far, so the steeper the line, the faster the goals came",
    adj: "highest-scoring", tail: "",
    best: (s) => `${pl(s.v, "goal")} in ${pl(s.n, "game")}`,
    now: (s) => `this season has ${F.int(s.v)} in ${s.n}`,
    last: (s) => `scored ${F.int(s.v)} in ${s.n}` },
  { id: "ga", label: "Goals let in", short: "Let in", tot: (v) => `${pl(v, "goal")} let in`, axis: "Goals let in, running total (lower is better)", of: (r) => r.ga || 0, fmt: F.int, avg: one, lower: true,
    read: "the goals we have let in so far, so here the lowest line is the best one",
    adj: "tightest", tail: "",
    best: (s) => `${pl(s.v, "goal")} let in over ${pl(s.n, "game")}`,
    now: (s) => `this season has let in ${F.int(s.v)} in ${s.n}`,
    last: (s) => `let in ${F.int(s.v)} in ${s.n}` },
];

// ---------------------------------------------------------------- seasons (mirrors league.js)

/** A name with case, punctuation, emoji and spaces removed: "F.C. Example!" and "fc example" match. */
const nameKey = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "") || String(s || "").trim().toLowerCase();

function tally(rows) {
  const n = rows.length;
  const w = rows.filter((r) => r.result === "W").length, t = rows.filter((r) => r.result === "T").length, l = n - w - t;
  const gf = d3.sum(rows, (r) => r.gf || 0), ga = d3.sum(rows, (r) => r.ga || 0);
  return { n, w, t, l, gf, ga, gd: gf - ga, pts: 3 * w + t };
}

/** With names: "Team" + "Mar 2030 · Tue · 7v7". Without: "Mar 2030 · Tue · 7v7" (+ level). Never blank. */
function seasonLabel(games) {
  const g0 = games[0];
  const month = (g0.season && toMonth(g0.season)) || d3.timeMonth.floor(g0._date);
  const when = `${F.fmtMonth(month)} · ${DAY(g0._date)}`;
  const whenFormat = [when, g0.format].filter(Boolean).join(" · ");
  const team = g0._team && String(g0._team).trim();
  return team ? { month, team, label: `${team} · ${when}`, full: `${team} · ${whenFormat}` }
    : { month, team: "", label: whenFormat, full: [whenFormat, g0.level].filter(Boolean).join(" ") };
}

/** Two leagues can start in the same month, so a season is its start month + weekday (+ team when known). Newest first. */
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

/**
 * Short names for the chart, where the month is enough unless two seasons began in the same one:
 * short "Jan 2030" / "Jan 2030 · Wed", tiny "Jan ’30", prose "Jan 2030 (Wednesdays)", tip (tooltip rows) leads with the team.
 */
function nameSeasons(seasons) {
  for (const s of seasons) {
    const twins = seasons.filter((o) => o !== s && +o.month === +s.month);
    const d = s.games[0]._date, mon = F.fmtMonth(s.month);
    s.short = twins.length ? `${mon} · ${DAY(d)}` : mon;
    s.tiny = `${MON(s.month)} ’${YY(s.month)}${twins.length ? ` ${DAY(d)}` : ""}`;
    s.prose = twins.length ? `${mon} (${DAY_LONG(d)}s)` : mon;
    s.tip = s.team ? `${s.team} · ${mon}${twins.some((o) => nameKey(o.team) === nameKey(s.team)) ? ` · ${DAY(d)}` : ""}` : s.label;
  }
}

// ---------------------------------------------------------------- render

export function render(data, p) {
  const el = document.getElementById("snake-card");
  if (!el) return;
  try {
    draw(el, data.soccer.league || [], p, data._asOf);
  } catch (err) {
    console.error(err);
  }
}

/** Push overlapping label boxes ({x0, x1, y (centre), h}) apart vertically, inside [top, bottom]. */
function spread(boxes, top, bottom, gap = 2) {
  const hit = (a, b) => a.x0 < b.x1 + 6 && b.x0 < a.x1 + 6;
  const clamp = (b) => { b.y = Math.max(top + b.h / 2, Math.min(bottom - b.h / 2, b.y)); };
  boxes.forEach(clamp);
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (!hit(a, b)) continue;
      const need = (a.h + b.h) / 2 + gap, d = b.y - a.y;
      if (Math.abs(d) >= need) continue;
      const push = (need - Math.abs(d)) / 2 + 0.01, up = d > 0 || (d === 0 && i < j) ? a : b, down = up === a ? b : a;
      up.y -= push; down.y += push;
      clamp(up); clamp(down);
      moved = true;
    }
    if (!moved) break;
  }
}

function draw(el, all, p, asOf) {
  const P = palette();
  const M = MEASURES.find((m) => m.id === measure) || MEASURES[0];
  const phone = (el.getBoundingClientRect().width || 900) < 620; // four options and nine columns need short names on a phone
  const tools = h("div", { class: "seg small", role: "group", "aria-label": "What to add up" });
  segmented(tools, MEASURES.map((m) => ({ id: m.id, label: phone ? m.short : m.label, title: m.label })), M.id, (id) => { measure = id; draw(el, all, p, asOf); });

  // names come from every season we have played, so a season is called the same thing in every period
  const whole = seasonsOf(all);
  nameSeasons(whole);
  const byKey = new Map(whole.map((s) => [s.key, s]));
  const inP = seasonsOf(all.filter((r) => inPeriod(r.date, p)));
  for (const s of inP) {
    const full = byKey.get(s.key);
    Object.assign(s, { short: full.short, tiny: full.tiny, prose: full.prose, tip: full.tip, cut: s.n < full.n });
    let acc = 0;
    s.run = [0, ...s.games.map((r) => (acc += M.of(r)))];
    s.v = acc;
  }
  // a season the period cuts in two would start at "game 1" part-way through: it stays in the table, off the chart
  const cut = inP.filter((s) => s.cut);
  const seasons = inP.filter((s) => !s.cut);
  const recent = seasons[0];
  const lastGame = recent ? recent.games[recent.n - 1]._date : null;
  const going = !!recent && !!asOf && d3.timeDay.count(lastGame, asOf) <= 14;
  const finished = seasons.filter((s) => !(going && s === recent));
  const better = (a, b) => (M.lower ? d3.ascending(a.v, b.v) : d3.descending(a.v, b.v)) || d3.descending(a.pts, b.pts) || d3.descending(a.gd, b.gd)
    || d3.descending(a.games[0].date, b.games[0].date);
  const ranked = finished.slice().sort(better);
  const split = ranked.length >= 2 && ranked[0].v !== ranked[ranked.length - 1].v; // is there a best and a worst at all?
  const best = split ? ranked[0] : null, worst = split ? ranked[ranked.length - 1] : null;
  for (const s of seasons) {
    s.roles = [s === recent ? (going ? "so far" : "latest") : null, s === best ? "best" : null, s === worst ? "worst" : null].filter(Boolean);
    s.tier = s === recent ? "now" : s.roles.length ? "mark" : "rest";
  }

  // the average finished season, game by game, for as long as at least half of them were still playing
  const need = Math.max(2, Math.ceil(finished.length / 2));
  const avg = [0];
  for (let k = 1; finished.filter((s) => s.n >= k).length >= need; k++) avg.push(d3.mean(finished.filter((s) => s.n >= k), (s) => s.run[k]));
  const K = avg.length - 1;
  const N = d3.max(seasons, (s) => s.n) || 0;
  const longer = finished.filter((s) => s.n > K).length;

  /** "level with / ahead of / behind the average of 1.3 at that stage", or "" where there is no average. */
  const against = (s) => {
    if (!K || s.n > K) return "";
    const a = avg[s.n], d = s.v - a;
    if (Math.abs(d) < 0.5) return ", level with the average at that stage";
    const word = M.lower ? (d < 0 ? "fewer than" : "more than") : d > 0 ? "ahead of" : "behind";
    return `, ${word} the average of ${M.avg(a)} at that stage`;
  };
  let title = "Season by season";
  if (seasons.length >= 2) {
    const nowPart = going ? `${M.now(recent)}${against(recent)}` : "";
    if (best && best === recent) {
      title = `The latest season, ${best.prose}, was also our ${M.adj}${M.tail}: ${M.best(best)}`;
    } else if (best) {
      title = `${best.prose} was our ${M.adj} season${M.tail}: ${M.best(best)}` +
        (going ? `; ${nowPart}` : `; the latest, ${recent.prose}, ${M.last(recent)}${recent === worst ? ", the worst of the lot" : against(recent)}`);
    } else if (ranked.length >= 2) {
      title = `${ranked.length === 2 ? "Both" : `All ${F.int(ranked.length)}`} finished seasons in this period ended level on ${M.tot(ranked[0].v)}` + (going ? `; ${nowPart}` : "");
    } else {
      // one finished season and one being played: compare them at the same stage
      const other = ranked[0];
      title = cap(nowPart) + (other.n >= recent.n ? `; ${other.prose} had ${M.fmt(other.run[recent.n])} at that stage` : "");
    }
  }

  const col = (label, short, value) => ({ label: phone ? short : label, num: true, value });
  const columns = [{ label: "Season", value: (s) => s.full + (s.cut ? " (part: the rest falls outside this period)" : "") },
    col("Games", "P", (s) => s.n), col("W", "W", (s) => s.w), col("T", "T", (s) => s.t), col("L", "L", (s) => s.l),
    col("Points", "Pts", (s) => s.pts), col("Goals for", "GF", (s) => s.gf), col("Goals against", "GA", (s) => s.ga),
    col("Goal difference", "GD", (s) => signed(s.gd))];

  const forfeits = seasons.some((s) => s.games.some((r) => r.gf == null));
  const c = card(el, {
    title,
    sub: `One line per season, all starting from zero: each dot is a game, and the height of the line is ${M.read}.` +
      (K ? ` The dashed line is the average finished season` +
        (K < N ? `; it stops at game ${K} because only ${longer === 1 ? "one season" : `${F.int(longer)} seasons`} ran longer.` : ".") : "") +
      (cut.length ? ` ${cut.map((s) => s.prose).join(" and ")} ${cut.length === 1 ? "is" : "are"} cut short by the edge of this period, so ${cut.length === 1 ? "it is" : "they are"} in the table but not on the chart.` : "") +
      (forfeits && M.id !== "pts" ? " A forfeit adds no goals either way." : ""),
  });
  c.head.after(h("div", { style: { margin: "2px 0 10px" } }, tools));
  c.setTable(columns, inP);
  if (seasons.length < 2) {
    c.body.append(h("div", { class: "empty-state" }, !inP.length ? "No league games in this period"
      : "Fewer than two whole seasons in this period, so there is nothing to lay side by side"));
    legend(c.legend, []);
    return;
  }

  // ---------------------------------------------------------------- labels: built first, so the right margin fits them
  const narrow = (c.body.getBoundingClientRect().width || 900) < 620;
  /** Draw a label into `parent`: season name (and role) in the quiet ink, the total in the strong one. On a phone it takes two lines. */
  const drawLabel = (parent, L) => {
    const t = parent.append("text").attr("class", L.avg ? "annot-muted halo" : "annot halo").attr("pointer-events", "none");
    if (L.avg) return t.style("font-weight", 500).attr("dy", "0.32em").text(L.name);
    if (!narrow) {
      t.attr("dy", "0.32em");
      t.append("tspan").text(L.name);
      t.append("tspan").attr("dx", 6).style("fill", P.ink).style("font-weight", 700).text(L.value);
      return t;
    }
    t.append("tspan").attr("x", 0).attr("dy", "-0.28em").text(L.name);
    const second = t.append("tspan").attr("x", 0).attr("dy", "1.15em");
    if (L.role) second.append("tspan").text(`${L.role} `);
    second.append("tspan").style("fill", P.ink).style("font-weight", 700).text(L.value);
    return t;
  };
  const labelOf = (s) => {
    const role = s.roles.join(", ");
    return { s, at: s.n, v: s.v, role, value: M.fmt(s.v), name: narrow ? s.tiny : role ? `${s.short} · ${role}` : s.short };
  };
  const labels = seasons.filter((s) => s.tier !== "rest").map(labelOf);
  if (K) labels.push({ avg: true, at: K, v: avg[K], name: narrow ? "average" : "average season" });
  const probe = d3.select(c.body).append("svg").attr("width", 0).attr("height", 0);
  const sizeOf = (L) => { const t = drawLabel(probe, L), b = t.node().getBBox(); t.remove(); return { bw: b.width, bh: Math.max(14, b.height) }; };
  labels.forEach((L) => Object.assign(L, sizeOf(L)));
  // the widest unhighlighted name, so a hovered line's label fits too
  const hoverLabel = new Map(seasons.filter((s) => s.tier === "rest").map((s) => { const L = labelOf(s); return [s, Object.assign(L, sizeOf(L))]; }));
  const spare = d3.max(hoverLabel.values(), (L) => L.bw) || 0;
  const bodyW = Math.max(260, Math.floor(c.body.getBoundingClientRect().width || 600));
  const left = M.id === "gd" ? 38 : 32, GAP = 10;
  let right = narrow ? 56 : 90;
  for (let i = 0; i < 4; i++) {
    const step = (bodyW - left - right) / N;
    const want = d3.max([...labels.map((L) => L.bw + GAP + 4 - (N - L.at) * step),
      // on a phone the plot needs the width more: a hovered line's label goes above or below its end instead
      ...(narrow ? [] : seasons.filter((s) => s.tier === "rest").map((s) => spare + GAP + 4 - (N - s.n) * step))]);
    right = Math.max(narrow ? 22 : 30, Math.min(bodyW * (narrow ? 0.36 : 0.24), Math.ceil(want)));
  }

  const f = frame(c.body, { height: narrow ? 330 : 390, margin: { left, right, top: 32, bottom: 46 } });
  const { svg, g, w, h: ht } = f;
  svg.attr("aria-label", `${M.label} added up game by game, one line per season`);
  const x = d3.scaleLinear().domain([0, N]).range([0, w]);
  let [lo, hi] = d3.extent([0, ...seasons.flatMap((s) => s.run)]);
  if (hi - lo < 4) hi = lo + 4; // keeps the ticks on whole numbers
  const y = d3.scaleLinear().domain([lo, hi]).nice(5).range([ht, 0]);

  // a gridline that lands on the x axis would double it up: the axis line stands in for it
  yGrid(g, y, w, { ticks: 5, format: M.fmt }).selectAll("line").filter((d) => y(d) > ht - 5).remove();
  g.append("text").attr("class", "annot-muted").attr("x", -left).attr("y", -16).text(M.axis);
  const ax = g.append("g").attr("class", "axis").attr("transform", `translate(0,${ht})`);
  ax.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", 0.5).attr("y2", 0.5);
  ax.selectAll("text").data(d3.range(0, N + 1)).join("text").attr("x", (k) => x(k)).attr("y", 17).attr("text-anchor", "middle").text((k) => (k ? k : "Start"));
  g.append("text").attr("class", "annot-muted").attr("x", w / 2).attr("y", ht + 37).attr("text-anchor", "middle")
    .text(narrow ? "Game of the season" : "Game number within the season");
  if (y.domain()[0] < 0) {
    const y0 = Math.round(y(0)) + 0.5;
    g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y0).attr("y2", y0).attr("stroke", P.muted).attr("stroke-width", 1).attr("shape-rendering", "crispEdges");
  }

  // ---------------------------------------------------------------- lines: the crowd first, the highlighted ones on top
  const line = d3.line().x((v, i) => x(i)).y((v) => y(v));
  const LOOK = { now: { stroke: P.soccer, width: 3, r: 4, ring: 2, opacity: 1 }, mark: { stroke: P.ink2, width: 2, r: 4, ring: 2, opacity: 1 },
    rest: { stroke: P.muted, width: 1.25, r: narrow ? 1.75 : 2, ring: 0, opacity: 0.5 } };
  const snake = (parent, s, look) => {
    const gg = parent.append("g").attr("opacity", look.opacity).attr("pointer-events", "none");
    gg.append("path").attr("d", line(s.run)).attr("fill", "none").attr("stroke", look.stroke).attr("stroke-width", look.width)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    gg.selectAll("circle").data(s.run.slice(1)).join("circle").attr("cx", (v, i) => x(i + 1)).attr("cy", (v) => y(v)).attr("r", look.r)
      .attr("fill", look.stroke).attr("stroke", look.ring ? P.surface : "none").attr("stroke-width", look.ring);
    return gg;
  };
  const order = { rest: 0, mark: 1, now: 2 };
  const stack = seasons.slice().reverse().sort((a, b) => order[a.tier] - order[b.tier] || (a === best) - (b === best)); // oldest at the back
  const plot = g.append("g");
  for (const s of stack.filter((q) => q.tier === "rest")) snake(plot, s, LOOK.rest);
  if (K) plot.append("path").attr("d", line(avg)).attr("fill", "none").attr("stroke", P.ink2).attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4")
    .attr("opacity", 0.8).attr("pointer-events", "none");
  for (const s of stack.filter((q) => q.tier !== "rest")) snake(plot, s, LOOK[s.tier]);

  // ---------------------------------------------------------------- direct labels at the line ends, kept off the lines and each other
  // every line as a string of points 5px apart, weighted by how much it matters if a label sits on it
  const ink = [];
  const trace = (run, wt) => d3.pairs(run.map((v, i) => [x(i), y(v)])).forEach(([[ax, ay], [bx, by]]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 5));
    for (let j = 0; j <= n; j++) ink.push({ x: ax + ((bx - ax) * j) / n, y: ay + ((by - ay) * j) / n, wt });
  });
  for (const s of seasons) trace(s.run, s.tier === "rest" ? 1 : 4);
  if (K) trace(avg, 2);
  /**
   * Put a label beside the end of its line: straight to the right if that is clear, else a little above or below,
   * wherever it covers the least line and no label already placed (`taken`).
   */
  const settle = (L, taken) => {
    const ex = x(L.at), ey = y(L.v), hh = L.bh / 2, maxX = w + right - 2 - L.bw;
    const mid = Math.max(2, Math.min(maxX, ex - L.bw / 2)), off = hh + 9;
    const spots = [...[0, -8, 8, -15, 15, -22, 22, -30, 30].map((dy) => ({ x0: ex + GAP, y: ey + dy, fee: Math.abs(dy) * 0.4 })),
      ...[-off, off, -off - 8, off + 8].map((dy) => ({ x0: mid, y: ey + dy, fee: 6 + Math.abs(dy) * 0.4 }))]
      .filter((q) => q.x0 <= maxX + 0.5 && q.y - hh >= -8 && q.y <= ht);   // a label may sit on the axis line when its season ended on zero
    const cost = (q) => q.fee
      + d3.sum(ink, (d) => (d.x > q.x0 - 3 && d.x < q.x0 + L.bw + 3 && d.y > q.y - hh - 1 && d.y < q.y + hh + 1 ? d.wt : 0))
      + (taken.some((o) => q.x0 < o.x1 + 6 && o.x0 < q.x0 + L.bw + 6 && Math.abs(o.y - q.y) < (o.h + L.bh) / 2 + 2) ? 1e4 : 0);
    const q = d3.least(spots, cost) || { x0: Math.min(ex + GAP, maxX), y: Math.max(hh - 8, Math.min(ht, ey)) };
    return Object.assign(L, { x0: q.x0, x1: q.x0 + L.bw, y: q.y, h: L.bh });
  };
  const labG = g.append("g");
  const placed = [];
  for (const L of labels) placed.push(settle(L, placed));
  spread(labels, -8, ht + 7); // only bites if two labels had nowhere clear to go
  const place = (t, L) => { t.attr("transform", `translate(${L.x0},${L.y})`); return t; };
  for (const L of labels) place(drawLabel(labG, L), L);

  // ---------------------------------------------------------------- hover and keyboard: one column per game number
  const cross = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ht).attr("visibility", "hidden").attr("pointer-events", "none");
  const hov = g.append("g").attr("pointer-events", "none");
  const pickOrder = [...seasons.filter((s) => s.tier !== "rest"), ...seasons.filter((s) => s.tier === "rest")]; // ties go to a highlighted line, then the newest
  /** The season whose line passes closest to the pointer. */
  const nearest = (px, py) => {
    const t = x.invert(px);
    let out = null, bd = Infinity;
    for (const s of pickOrder) {
      if (t > s.n + 0.5) continue;
      const tt = Math.max(0, Math.min(s.n, t)), i = Math.min(s.n - 1, Math.floor(tt));
      const d = Math.abs(y(s.run[i] + (s.run[i + 1] - s.run[i]) * (tt - i)) - py);
      if (d < bd - 0.01) { bd = d; out = s; }
    }
    return out;
  };
  let shown = "";
  const lift = (s, k) => {
    const key = `${s ? s.key : ""}@${k}`;
    if (key === shown) return;
    shown = key;
    hov.selectAll("*").remove();
    cross.attr("visibility", "visible").attr("x1", x(k)).attr("x2", x(k));
    if (!s) return;
    const base = LOOK[s.tier], stroke = s.tier === "rest" ? P.ink : base.stroke;
    snake(hov, s, { stroke, width: s.tier === "rest" ? 2.5 : base.width + 1, r: 4, ring: 2, opacity: 1 });
    if (k <= s.n) hov.append("circle").attr("cx", x(k)).attr("cy", y(s.run[k])).attr("r", 6).attr("fill", stroke).attr("stroke", P.surface).attr("stroke-width", 2);
    if (s.tier !== "rest") return; // already labelled
    const L = settle(hoverLabel.get(s), labels);
    place(drawLabel(hov, L).style("fill", P.ink), L);
  };
  const dash = `repeating-linear-gradient(90deg, ${P.ink2} 0 4px, transparent 4px 7px)`;
  const tipFor = (k, near) => {
    const here = seasons.filter((s) => s.n >= k).map((s) => ({ s, v: s.run[k] }));
    if (K && k <= K) here.push({ v: avg[k] });
    here.sort((a, b) => (M.lower ? d3.ascending(a.v, b.v) : d3.descending(a.v, b.v)));
    const over = finished.filter((s) => s.n < k).length;
    return {
      title: `After game ${k} · ${M.label.toLowerCase()} so far${M.lower ? ", fewest first" : ""}`,
      rows: here.map(({ s, v }) => {
        if (!s) return { label: "Average season", value: M.avg(v), color: dash, mark: "line" };
        // a highlighted season says what it is on a second, quieter line; the line under the pointer is in bold
        const name = h("span", s === near ? { style: { color: "var(--ink)", fontWeight: "600", whiteSpace: "nowrap" } } : {}, s.tip);
        const role = s.roles.map((r) => ROLE[r]).join(", ");
        const label = !role ? name : h("span", { style: { display: "inline-flex", flexDirection: "column", lineHeight: "1.3", padding: "2px 0" } },
          name, h("span", { style: { color: "var(--muted)", fontSize: "11px" } }, role));
        return { label, value: M.fmt(v), color: LOOK[s.tier].stroke, mark: s.tier === "rest" ? "line" : "dot" };
      }),
      note: [over ? `${pl(over, "season")} had fewer than ${k} games` : null, going && recent.n < k ? "This season has not got that far" : null]
        .filter(Boolean).join(" · ") || null,
    };
  };
  const hide = () => { shown = ""; hov.selectAll("*").remove(); cross.attr("visibility", "hidden"); tooltip.hide(); };
  let pointing = false;
  g.append("g").selectAll("rect").data(d3.range(1, N + 1)).join("rect").attr("class", "hit")
    .attr("x", (k) => (k === 1 ? -6 : x(k - 0.5))).attr("width", (k) => (k === N ? w + right : x(k + 0.5)) - (k === 1 ? -6 : x(k - 0.5)))
    .attr("y", -8).attr("height", ht + 16).attr("tabindex", 0)
    .attr("aria-label", (k) => `After game ${k}: ${M.label.toLowerCase()} so far in each of ${pl(seasons.filter((s) => s.n >= k).length, "season")}`)
    .on("pointerenter pointermove", function (ev, k) {
      pointing = true;
      const [px, py] = d3.pointer(ev, g.node());
      const s = nearest(px, py);
      lift(s, k);
      tooltip.show(ev, tipFor(k, s));
    })
    .on("pointerleave", () => { pointing = false; hide(); })
    .on("focus", function (ev, k) { if (pointing) return; lift(null, k); tooltip.show(focusEvent(this), tipFor(k, null)); })
    .on("blur", hide);

  const others = seasons.filter((s) => s.tier === "rest").length;
  legend(c.legend, [
    { label: going ? `${recent.short}, so far` : `Latest season${recent === best ? ", also the best" : recent === worst ? ", also the worst" : ""}`,
      value: going ? null : recent.short, color: P.soccer, mark: "ln" },
    ...(best && best !== recent ? [{ label: "Best finished season", value: best.short, color: P.ink2, mark: "ln" }] : []),
    ...(worst && worst !== recent ? [{ label: "Worst", value: worst.short, color: P.ink2, mark: "ln" }] : []),
    ...(others ? [{ label: others === 1 ? "The other season" : "Other seasons", value: others === 1 ? null : F.int(others), color: P.muted, mark: "ln" }] : []),
    ...(K ? [{ label: "Average finished season", color: dash, mark: "ln" }] : []),
  ]);
}
