// Squads: how big each season's squad list was, and how much of each squad carries over to the next. These cards need `_squads` (the names on each season's list) and hide themselves where the data
// leaves names out.
//
// Nobody is a special case: the lists hold everyone, counted by the same rules. If `data.team.me` is a display
// name, that person's row is labelled "Me" in bold, and nothing else differs.
import { h, card, legend, tooltip, focusEvent, dataTable } from "../ui.js?v=e2d29b3696";
import { palette, frame, yGrid, xTime } from "../charts.js?v=e2d29b3696";
import * as F from "../format.js?v=e2d29b3696";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const IDS = ["squadsize-card", "squadrecord-card"];
const MIN_SEASONS = 3;        // seasons in our squads to get a row of one's own
const MIN_RECORD_GAMES = 15;  // and, on the season-record card, games played by those squads
// Women get half the cut-off (rounded up) wherever a card asks for a minimum number of seasons or games:
// it is a coed league with far fewer women, so the usual bar would leave most of them out.
const bar = (n, woman) => (woman ? Math.ceil(n / 2) : n);
/** A person is their display name with case, spaces and punctuation ignored: "Sam T." and "sam t" are one person. */
const key = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const pl = (n, word) => `${F.int(n)} ${word}${n === 1 ? "" : "s"}`;
const ppl = (n) => `${F.int(n)} ${n === 1 ? "person" : "people"}`;
/** The "Private" tag on a card that names people: only on a page where the names are shown locally (`data.team.private`). */
const tagPrivate = (c, priv) => { if (priv) c.head.querySelector("h3").append(h("span", { class: "private-tag", style: { marginLeft: "8px" } }, "Private")); };
/** A name for a table cell: "Me" in bold for the person the page is about, the display name for everyone else. */
const nameCell = (m) => (m.me ? h("strong", {}, m.label) : m.label);
const record = (s) => `${s.w} W · ${s.t} T · ${s.l} L`;
const seasonName = (s) => [s.team, s.label].filter(Boolean).join(", ");

export function render(data, p) {
  const raw = data.soccer._squads || [];
  for (const id of IDS) { const el = document.getElementById(id); if (el) el.hidden = !raw.length; }
  if (!raw.length) return;
  const league = data.soccer.league || [];
  const team = data.team || {};
  const meKey = team.me ? key(team.me) : null;
  // every season in date order (two can start in the same month on different nights: the one that kicked off first comes first)
  const kickoff = (s) => (s.games.length ? s.games[0]._date : s.start);
  const all = raw.map((s) => {
    const start = d3.timeParse("%Y-%m")(s.season);
    const games = league.filter((r) => r.season === s.season && WEEKDAY[r._date.getDay()] === s.weekday);
    return { ...s, start, games, label: `${F.fmtMonth(start)} · ${s.weekday.slice(0, 3)}`, w: games.filter((r) => r.result === "W").length,
      t: games.filter((r) => r.result === "T").length, l: games.filter((r) => r.result === "L").length };
  }).sort((a, b) => a.start - b.start || kickoff(a) - kickoff(b) || a.weekday.localeCompare(b.weekday));
  // for each name on a list, how many earlier squads of ours they had been in (whatever the chosen period)
  const seen = new Map();
  all.forEach((s, i) => {
    s.first = i === 0;   // our very first squad: nobody could have been in an earlier one
    s.players = s.players.map((name) => ({ name, k: key(name), before: seen.get(key(name)) || 0 }));
    for (const m of s.players) seen.set(m.k, (seen.get(m.k) || 0) + 1);
  });
  const seasons = all.filter((s) => (s.games.length ? s.games[s.games.length - 1]._date : s.start) >= p.start && s.start <= p.end);
  const people = new Map();
  for (const s of seasons) for (const m of s.players) {
    if (!people.has(m.k)) people.set(m.k, { k: m.k, name: m.name, me: m.k === meKey, label: m.k === meKey ? "Me" : m.name,
      woman: !!data.soccer._women?.has(m.name.toLowerCase()), seasons: [] });
    people.get(m.k).seasons.push(s);
  }
  const ctx = { P: palette(), seasons, priv: !!team.private, people: [...people.values()].sort((a, b) => b.seasons.length - a.seasons.length || a.name.localeCompare(b.name)) };
  // once we know who said yes to each game, the season-level record card is superseded by the with/without cards (lineups.js)
  const perGame = league.some((r) => r._lineup);
  for (const [id, fn] of [["squadsize-card", renderSize], ["squadrecord-card", renderRecord]]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id === "squadrecord-card" && perGame) { el.hidden = true; continue; }
    try { fn(el, ctx); } catch (err) { console.error(id, err); }
  }
}

function empty(el, title, priv) {
  const c = card(el, { title, table: false });
  tagPrivate(c, priv);
  c.body.append(h("div", { class: "empty-state" }, "No squads in this period"));
  legend(c.legend, []);
}

const tally = (seasons) => {
  const w = d3.sum(seasons, (s) => s.w), t = d3.sum(seasons, (s) => s.t), l = d3.sum(seasons, (s) => s.l);
  return { n: w + t + l, w, t, l, win: w + t + l ? w / (w + t + l) : null };
};

// ---------------------------------------------------------------- squad size and turnover

function renderSize(el, { P, seasons, priv }) {
  if (!seasons.length) return empty(el, "Squad size and turnover", priv);
  const rows = seasons.map((s) => ({ s, back: s.players.filter((m) => m.before > 0).length, fresh: s.players.filter((m) => m.before === 0).length }));
  const later = rows.filter((r) => !r.s.first);   // our very first squad had nobody to return
  const share = later.length ? d3.sum(later, (r) => r.back) / d3.sum(later, (r) => r.back + r.fresh) : null;
  const last = rows[rows.length - 1];
  const startOf = (r) => (r.s.games.length ? r.s.games[0]._date : r.s.start);
  const side = { length: rows.filter((r, i) => i && d3.timeDay.count(startOf(rows[i - 1]), startOf(r)) <= 35).length };   // seasons that began alongside another
  const c = card(el, {
    title: `A typical squad has ${ppl(d3.median(rows, (r) => r.back + r.fresh))}` +
      (share != null ? `; ${F.pct(share)} of them had been in an earlier squad of ours` : "") +
      (last.s.first ? "" : `. The latest has ${F.int(last.back)} returning and ${F.int(last.fresh)} new`),
    sub: "Two lines, one point per season on the date of its first game: everyone on the squad list, and those of them who had been in an earlier squad of ours. " +
      "The shaded gap between the lines is the people new to the team that season. " +
      (side.length ? "When we ran two squads at once, the line follows the one with more returning people and the other is drawn on its own. " : "") +
      "These are squad lists, not who said yes to each game.",
  });
  tagPrivate(c, priv);   // no names are drawn, but the card exists only where the squad lists do
  const narrow = Math.max(280, c.body.getBoundingClientRect().width || 600) < 520;
  const f = frame(c.body, { height: 250, margin: { left: 30, right: narrow ? 46 : 118, top: 14, bottom: 24 } });
  const { g, w, h: hh } = f;
  // a real date axis: each season sits on the date of its first game (two that began in the same month stay apart)
  const pts = rows.map((r) => ({ ...r, at: r.s.games.length ? r.s.games[0]._date : r.s.start, all: r.back + r.fresh }));
  const [a, b] = d3.extent(pts, (d) => d.at);
  const x = d3.scaleTime().domain([d3.timeDay.offset(a, -14), d3.timeDay.offset(b, 14)]).range([0, w]);
  const y = d3.scaleLinear().domain([0, d3.max(pts, (d) => d.all)]).nice(4).range([hh, 0]);
  yGrid(g, y, w, { ticks: 4 });
  xTime(g, x, hh);
  // We have sometimes run two squads at once, on different nights. Joining those in date order would zig-zag between
  // two different groups of people, so the line follows one squad through each such spell (the one with more
  // returning people) and the other squad is drawn on its own, off the line.
  const spells = [];
  for (const d of pts) {
    const cur = spells[spells.length - 1];
    if (cur && d3.timeDay.count(cur[0].at, d.at) <= 35) cur.push(d); else spells.push([d]);
  }
  const main = spells.map((sp) => sp.slice().sort((p1, p2) => p2.back - p1.back || p2.all - p1.all)[0]);
  const runs = [main, ...pts.filter((d) => !main.includes(d)).map((d) => [d])];
  const series = [{ key: "all", color: P.ink2 }, { key: "back", color: P.soccer }];
  for (const run of runs) {
    // the gap between the lines: people new to the team
    if (run.length > 1) g.append("path").attr("d", d3.area().x((d) => x(d.at)).y0((d) => y(d.back)).y1((d) => y(d.all))(run)).attr("fill", P.other).attr("opacity", 0.3);
    else g.append("line").attr("x1", x(run[0].at)).attr("x2", x(run[0].at)).attr("y1", y(run[0].back)).attr("y2", y(run[0].all)).attr("stroke", P.other).attr("stroke-width", 5).attr("opacity", 0.45);
    for (const sr of series) {
      if (run.length > 1) g.append("path").attr("d", d3.line().x((d) => x(d.at)).y((d) => y(d[sr.key]))(run)).attr("fill", "none").attr("stroke", sr.color).attr("stroke-width", 2)
        .attr("stroke-linejoin", "round");
    }
  }
  for (const sr of series) {
    g.append("g").selectAll("circle").data(pts).join("circle").attr("cx", (d) => x(d.at)).attr("cy", (d) => y(d[sr.key])).attr("r", 3.5).attr("fill", sr.color)
      .attr("stroke", P.surface).attr("stroke-width", 1.5);
  }
  // the latest season's numbers at the end of each line, kept apart when the lines end close together
  const end = pts[pts.length - 1];
  let yAll = y(end.all), yBack = y(end.back);
  if (yBack - yAll < 14) { const mid = (yAll + yBack) / 2; yAll = mid - 7; yBack = mid + 7; }
  const endLabel = (yy, value, name, color) => {
    const t = g.append("text").attr("x", x(end.at) + 9).attr("y", yy).attr("dy", "0.32em");
    t.append("tspan").attr("class", "annot").style("font-weight", 600).style("fill", P.ink).text(F.int(value));
    if (!narrow) t.append("tspan").attr("class", "annot-muted").text(` ${name}`);
    g.append("line").attr("x1", x(end.at) + 5).attr("x2", x(end.at) + 7).attr("y1", yy).attr("y2", yy).attr("stroke", color).attr("stroke-width", 2);
  };
  endLabel(yAll, end.all, "in the squad", P.ink2);
  endLabel(yBack, end.back, "returning", P.soccer);
  // hover and keyboard: the nearest season
  const mark = g.append("g").attr("pointer-events", "none");
  const show = (ev, d) => {
    mark.selectAll("*").remove();
    mark.append("line").attr("x1", x(d.at)).attr("x2", x(d.at)).attr("y1", 0).attr("y2", hh).attr("stroke", P.axis);
    for (const sr of series) mark.append("circle").attr("cx", x(d.at)).attr("cy", y(d[sr.key])).attr("r", 5.5).attr("fill", sr.color).attr("stroke", P.surface).attr("stroke-width", 2);
    tooltip.show(ev, { title: `${seasonName(d.s)} · ${ppl(d.all)}`,
      rows: [{ label: "In the squad", value: F.int(d.all), color: P.ink2 }, { label: "Were in an earlier squad", value: F.int(d.back), color: P.soccer },
        { label: "New to the team", value: F.int(d.fresh), color: P.other },
        ...(d.s.games.length ? [{ label: "Our record that season", value: record(d.s) }] : [])] });
  };
  const hide = () => { mark.selectAll("*").remove(); tooltip.hide(); };
  pts.forEach((d, i) => {
    const x0 = i ? (x(pts[i - 1].at) + x(d.at)) / 2 : 0, x1 = i < pts.length - 1 ? (x(d.at) + x(pts[i + 1].at)) / 2 : w;
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", x0).attr("y", 0).attr("width", Math.max(1, x1 - x0)).attr("height", hh)
      .attr("aria-label", `${seasonName(d.s)}: ${ppl(d.all)}, ${F.int(d.back)} returning, ${F.int(d.fresh)} new`)
      .on("pointerenter pointermove", (ev) => show(ev, d)).on("focus", function () { show(focusEvent(this), d); })
      .on("pointerleave blur", hide);
  });
  legend(c.legend, [{ label: "In the squad", color: P.ink2, mark: "ln" }, { label: "Were in an earlier squad", color: P.soccer, mark: "ln" }, { label: "New to the team (the gap)", color: P.other }]);
  c.setTable([{ label: "Season", value: (r) => seasonName(r.s) }, { label: "In the squad", num: true, value: (r) => r.back + r.fresh },
    { label: "Were in an earlier squad", num: true, value: (r) => r.back }, { label: "New to the team", num: true, value: (r) => r.fresh },
    { label: "Our record", value: (r) => (r.s.games.length ? record(r.s) : "") }], rows.slice().reverse());
}

// ---------------------------------------------------------------- results by squad member

// Drawn only where the data has squad lists but not who said yes to each game.
function renderRecord(el, { P, seasons, people, priv }) {
  const topic = "Our results in the seasons each person was in the squad";
  if (!seasons.length) return empty(el, topic, priv);
  const overall = tally(seasons);
  const rows = people.filter((m) => m.seasons.length >= bar(MIN_SEASONS, m.woman)).map((m) => ({ m, ...tally(m.seasons) }))
    .filter((r) => r.n >= bar(MIN_RECORD_GAMES, r.m.woman)).sort((a, b) => b.win - a.win || b.n - a.n);
  const best = rows.find((r) => !r.m.me);   // "Me" is a poor headline
  const c = card(el, {
    title: rows.length >= 2 && best && best.win > overall.win
      ? `We have done best in seasons with ${best.m.label} in the squad: ${F.pct(best.win)} of ${pl(best.n, "game")} won, against ${F.pct(overall.win)} overall`
      : topic,
    sub: `Our results in the seasons each regular was on the squad list: everyone with ${MIN_SEASONS} or more seasons and ${MIN_RECORD_GAMES} or more games ` +
      `(${bar(MIN_SEASONS, true)} and ${bar(MIN_RECORD_GAMES, true)} for women). It says nothing about who said yes on the night, and these are small samples: a curiosity, not a rating.`,
    table: false,
  });
  tagPrivate(c, priv);
  legend(c.legend, []);
  if (!rows.length) {
    c.body.append(h("div", { class: "empty-state" }, `Nobody has been in ${MIN_SEASONS} of our squads in this period`));
    return;
  }
  const narrow = Math.max(280, c.body.getBoundingClientRect().width || 520) < 430;
  // seven columns don't fit a phone: there the seasons and the record go on a second line under the name
  const columns = narrow ? [
    { label: "Who", value: (r) => [nameCell(r.m), h("div", { style: { color: P.muted, fontSize: "12px", marginTop: "2px" } },
      `${pl(r.m.seasons.length, "season")}, ${pl(r.n, "game")}: ${r.w} W · ${r.t} T · ${r.l} L`)] },
    { label: "Won", num: true, value: (r) => F.pct(r.win) },
  ] : [
    { label: "Who", value: (r) => nameCell(r.m) }, { label: "Seasons", num: true, value: (r) => r.m.seasons.length },
    { label: "Games", num: true, value: (r) => r.n }, { label: "W", num: true, value: (r) => r.w }, { label: "T", num: true, value: (r) => r.t },
    { label: "L", num: true, value: (r) => r.l }, { label: "Won", num: true, value: (r) => F.pct(r.win) },
  ];
  c.body.append(h("div", { class: "table-wrap", style: { maxHeight: "330px", overflowY: "auto" } },
    dataTable(columns, [...rows, { m: { label: "All our seasons", seasons }, ...overall }])));
}
