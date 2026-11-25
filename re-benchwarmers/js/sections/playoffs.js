// The play-off bar: the fewest regular-season points that got a team into the play-offs each season,
// and where we finished the regular season against it.
//
// The league's tables include play-off games, so regular-season points have to be worked back from them:
//   - the regular season is as long as the fewest games any team played;
//   - the play-off teams are the ones with more games than that;
//   - a play-off win is worth 3 points in the table, and a team that played two play-off games won the first.
// For our own team the play-off games are known exactly (they are our last games of the season). For the
// others it is known for the teams that went out at the first step; for the two finalists only one of two
// splits is possible, and a split is ruled out when it would put a play-off team below a team that missed.
// What is left is one number in most seasons and a three-point band in a few.
import { h, card, legend, tooltip, focusEvent } from "../ui.js?v=e2d29b3696";
import { palette, frame } from "../charts.js?v=e2d29b3696";
import * as F from "../format.js?v=e2d29b3696";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const POINTS = { W: 3, T: 1, L: 0 };
const SPOTS = 4;   // play-off places assumed for a season still being played (every finished season since Jan 2025 had four)
const pts = (t) => 3 * t[0] + t[1], played = (t) => t[0] + t[1] + t[2];
const pl = (n, word) => `${F.int(n)} ${word}${n === 1 ? "" : "s"}`;
const privateTag = () => h("span", { class: "private-tag", style: { marginLeft: "8px" } }, "Private");

/** Every way of choosing one value from each list. */
const product = (lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);

/**
 * One entry per season with a league table: how long the regular season was, how many teams went through,
 * our regular-season points, the bar (barLo..barHi, equal when it is known exactly) and how we got on.
 * Exported so the page's headline numbers can use it.
 */
export function playoffSeasons(data) {
  const league = data.soccer.league || [];
  return (data.soccer.standings || []).map((s) => {
    const games = league.filter((r) => r.season === s.season && WEEKDAY[r._date.getDay()] === s.weekday);
    const start = d3.timeParse("%Y-%m")(s.season), last = games.length ? games[games.length - 1]._date : start;
    const T = s.teams, us = T[s.rank - 1];
    const base = { season: s.season, weekday: s.weekday, n: T.length, start, last, team: games.find((r) => r._team)?._team || null,
      label: `${F.fmtMonth(start)} · ${s.weekday.slice(0, 3)}` };
    // still being played: its latest game is within two weeks of the newest data, so there are no play-offs to read yet
    if (games.length > 0 && d3.timeDay.count(last, data._asOf) <= 14) {
      const line = T.map(pts).sort(d3.descending)[Math.min(SPOTS, T.length) - 1];
      return { ...base, live: true, length: played(us), spots: Math.min(SPOTS, T.length), ours: pts(us), barLo: line, barHi: line, made: null, outcome: "still being played" };
    }
    const length = d3.min(T, played);
    const through = T.filter((t) => played(t) > length), out = T.filter((t) => played(t) === length);
    if (!through.length || !out.length) return null;   // no sign of play-offs in the table
    const extraUs = played(us) - length;
    const ourPlayoffs = extraUs > 0 && games.length >= extraUs ? games.slice(games.length - extraUs) : [];
    const ours = pts(us) - d3.sum(ourPlayoffs, (r) => POINTS[r.result]);
    const bestOut = d3.max(out, pts);
    // four teams, two semi-finals and a final: the usual shape
    const bracket = through.length === 4 && through.map((t) => played(t) - length).sort().join("") === "1122";
    const weWon = bracket && extraUs === 2 && ourPlayoffs.length === 2 && ourPlayoffs[1].result === "W";
    // each play-off team's possible regular-season points, as [points, won the final?]
    const options = through.map((t) => {
      const e = played(t) - length;
      if (t === us && ourPlayoffs.length === extraUs) return [[ours, weWon]];
      if (bracket) return e === 1 ? [[pts(t), false]] : [[pts(t) - 3, false], [pts(t) - 6, true]];
      return [[pts(t) - 3 * (e - 1), false], [pts(t) - 3 * e, false]];   // lost their last play-off game, or won it
    });
    let ways = product(options).filter((w) => !bracket || w.filter(([, champion]) => champion).length === 1);
    const fits = ways.filter((w) => w.every(([p]) => p >= bestOut));   // nobody who went through had fewer points than a team that missed
    if (fits.length) ways = fits;
    const bars = ways.map((w) => d3.min(w, ([p]) => p));
    const made = extraUs > 0;
    const outcome = !made ? "missed the play-offs"
      : !bracket ? `in the play-offs (${pl(extraUs, "game")})`
        : extraUs === 1 ? "lost the semi-final" : weWon ? "won the final" : "lost the final";
    return { ...base, live: false, length, spots: through.length, ours, barLo: d3.min(bars), barHi: d3.max(bars), bestOut: d3.max(out.filter((t) => t !== us), pts) ?? null,
      made, won: weWon, outcome };
  }).filter(Boolean);
}

const barText = (s) => (s.barLo === s.barHi ? F.int(s.barLo) : `${F.int(s.barLo)}–${F.int(s.barHi)}`);
/** "in by 5", "level with the bar", "4 short", "3–4 short". */
function gapText(s) {
  if (s.made) return s.ours > s.barHi ? `${F.int(s.ours - s.barHi)} clear of the bar` : "level with the bar";
  const lo = s.barLo - s.ours, hi = s.barHi - s.ours;
  if (hi <= 0) return s.live ? "level with 4th" : "level on points, out on the tie-break";
  const short = lo === hi || lo <= 0 ? `${F.int(hi)}` : `${F.int(lo)}–${F.int(hi)}`;
  return s.live ? `${short} behind ${ordinal(s.spots)}` : `${lo <= 0 ? "up to " : ""}${short} short`;
}
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

export function render(data, p) {
  const el = document.getElementById("playoffs-card");
  if (!el) return;
  const all = playoffSeasons(data);
  el.hidden = !all.length;
  if (!all.length) return;
  try { draw(el, data, p, all); } catch (err) { console.error("playoffs-card", err); }
}

function draw(el, data, p, all) {
  const P = palette();
  const seasons = all.filter((s) => s.last >= p.start && s.start <= p.end).sort((a, b) => b.start - a.start || a.weekday.localeCompare(b.weekday));
  if (!seasons.length) {
    const c = card(el, { title: "The play-off bar, season by season" });
    c.body.append(h("div", { class: "empty-state" }, "No league tables for this period"));
    legend(c.legend, []);
    c.setTable([], []);
    return;
  }
  const done = seasons.filter((s) => !s.live), made = done.filter((s) => s.made), missed = done.filter((s) => !s.made);
  const live = seasons.find((s) => s.live);
  const range = (v, lo, hi) => { const a = d3.min(v, lo), b = d3.max(v, hi); return a === b ? F.int(a) : `${F.int(a)} to ${F.int(b)}`; };
  const smallest = d3.min(done, (s) => s.n);
  const allSmall = made.length > 1 && made.every((s) => s.n === smallest) && missed.some((s) => s.n > smallest);
  let title;
  if (!done.length) title = `This season we have ${pl(live.ours, "point")} from ${pl(live.length, "game")}; ${ordinal(live.spots)} place is on ${F.int(live.barHi)}`;
  else if (!made.length) title = `We have not made the play-offs in these ${pl(done.length, "season")}: the bar was ${range(done, (s) => s.barLo, (s) => s.barHi)} points and our best was ${F.int(d3.max(done, (s) => s.ours))}`;
  else {
    title = `We made the play-offs in ${F.int(made.length)} of ${pl(done.length, "finished season")}` +
      (allSmall ? `, every time in a ${F.int(smallest)}-team league, where it took ${range(made, (s) => s.barLo, (s) => s.barHi)} points` : "") +
      (missed.length ? `; in the seasons we missed, the bar was ${range(missed, (s) => s.barLo, (s) => s.barHi)} points and we had ${range(missed, (s) => s.ours, (s) => s.ours)}` : "");
  }
  const spotsText = [...new Set(done.map((s) => s.spots))].sort(d3.ascending);
  const c = card(el, {
    title,
    sub: "One row per season, newest at the top. The dot is our points from the regular season (3 for a win, 1 for a tie). The upright mark is the play-off bar: " +
      "the fewest regular-season points that got a team into the play-offs that season" +
      (spotsText.length ? ` (${spotsText.map((n) => F.int(n)).join(" or ")} teams went through)` : "") + ". " +
      "The league's tables count play-off games too, so the bar is worked back from them; where that leaves two possible answers it is drawn as a band." +
      (live ? ` The season still being played shows the points of the team now in ${ordinal(live.spots)} place.` : ""),
  });
  if (data.team?.private && seasons.some((s) => s.team)) c.head.querySelector("h3")?.append(privateTag());   // only the team names are private here

  const bodyW = Math.max(280, c.body.getBoundingClientRect().width || 600);
  const narrow = bodyW < 560;
  const labelW = narrow ? 0 : 290, textW = narrow ? 0 : 250;
  const rowH = narrow ? 66 : 30;
  const f = frame(c.body, { height: seasons.length * rowH + 30, margin: { left: labelW + 6, right: textW + 14, top: 26, bottom: 4 } });
  const { g, w } = f;
  const top = Math.max(d3.max(seasons, (s) => Math.max(s.barHi, s.ours)), 6);
  const step = top > 12 ? 3 : 2, end = Math.ceil((top + 0.5) / step) * step;
  const x = d3.scaleLinear().domain([0, end]).range([0, w]);
  const ticks = d3.range(0, end + 1, step);
  g.append("g").selectAll("line").data(ticks).join("line").attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", 0).attr("y2", seasons.length * rowH)
    .attr("stroke", P.grid).attr("stroke-width", 1);
  g.append("g").selectAll("text").data(ticks).join("text").attr("class", "annot-muted").attr("x", (d) => x(d)).attr("y", -9).attr("text-anchor", "middle").text((d) => d);
  if (!narrow) g.append("text").attr("class", "annot-muted").attr("x", -labelW - 6).attr("y", -9).text("Regular-season points");

  const colorOf = (s) => (s.live ? P.tie : s.made ? P.win : P.loss);
  seasons.forEach((s, k) => {
    const y0 = k * rowH, cy = y0 + (narrow ? 34 : rowH / 2), fill = colorOf(s);
    // on a phone each season is three lines (name, marks, figures): a rule keeps one season's figures apart from the next one's name
    if (narrow && k) g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y0 + 0.5).attr("y2", y0 + 0.5).attr("stroke", P.axis);
    const lab = g.append("text").attr("x", narrow ? 0 : -12).attr("y", narrow ? y0 + 17 : cy).attr("dy", narrow ? 0 : "0.32em").attr("text-anchor", narrow ? "start" : "end");
    if (s.team && !narrow) lab.append("tspan").attr("class", "annot").style("font-weight", 600).text(`${s.team} `);
    lab.append("tspan").attr("class", narrow ? "annot" : "annot-muted").text(`${s.label} · ${F.int(s.n)} teams`);
    const xo = x(s.ours), xa = x(s.barLo), xb = x(s.barHi);
    // from our points to the bar
    const near = s.ours <= s.barLo ? xa : s.ours >= s.barHi ? xb : xo;
    if (Math.abs(near - xo) > 8) g.append("line").attr("x1", xo).attr("x2", near).attr("y1", cy).attr("y2", cy).attr("stroke", fill).attr("stroke-width", 2).attr("opacity", 0.55);
    // the bar: an upright mark, widened to a band when it is only known to within three points
    if (xb > xa) g.append("rect").attr("x", xa).attr("y", cy - 9).attr("width", xb - xa).attr("height", 18).attr("rx", 3).attr("fill", P.ink).attr("opacity", 0.16);
    for (const xv of xb > xa ? [xa, xb] : [xa]) g.append("line").attr("x1", xv).attr("x2", xv).attr("y1", cy - 10).attr("y2", cy + 10).attr("stroke", P.ink).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    g.append("circle").attr("cx", xo).attr("cy", cy).attr("r", 6).attr("fill", fill).attr("stroke", P.surface).attr("stroke-width", 2);
    const text = `${pl(s.ours, "pt")}, bar ${barText(s)}`;
    const tail = s.live ? `${gapText(s)}, after ${pl(s.length, "game")}` : s.made ? s.outcome : gapText(s);
    const txt = g.append("text").attr("x", narrow ? 0 : w + 14).attr("y", narrow ? y0 + 57 : cy).attr("dy", narrow ? 0 : "0.32em");
    txt.append("tspan").attr("class", "annot").style("font-weight", 600).text(text);
    txt.append("tspan").attr("class", "annot-muted").text(` · ${tail}`);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", narrow ? 0 : -labelW).attr("y", y0).attr("width", (narrow ? 0 : labelW) + w + textW).attr("height", rowH)
      .attr("aria-label", `${s.label}: ${text}, ${tail}`)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, {
          title: `${s.team ? `${s.team}, ` : ""}${s.label}`,
          rows: [
            { label: "Our points", value: `${F.int(s.ours)} from ${pl(s.length, "game")}`, color: fill, mark: "dot" },
            { label: s.live ? `${ordinal(s.spots)} place now` : "Play-off bar", value: `${barText(s)} points`, color: P.ink },
            ...(s.live ? [] : [{ label: "Went through", value: `${F.int(s.spots)} of ${F.int(s.n)} teams` }]),
            ...(!s.live && s.bestOut != null ? [{ label: s.made ? "Best team that missed" : "Best other team that missed", value: `${F.int(s.bestOut)} points` }] : []),
            { label: "How it ended", value: s.live ? `still being played (${gapText(s)})` : s.made ? s.outcome : `${s.outcome} (${gapText(s)})` },
          ],
          note: s.live ? "A season still in progress: the bar will move." : s.barLo !== s.barHi ? "The table can't say which of the two finalists won, so the bar is one of two numbers." : null,
        });
      })
      .on("pointerleave blur", () => tooltip.hide());
  });
  legend(c.legend, [
    { label: "Our points: made the play-offs", color: P.win, mark: "dt" }, { label: "Missed", color: P.loss, mark: "dt" },
    ...(live ? [{ label: "Season still being played", color: P.tie, mark: "dt" }] : []),
    { label: "Play-off bar", color: P.ink },
  ]);
  c.setTable([
    { label: "Season", value: (s) => (s.team ? `${s.team}, ${s.label}` : s.label) },
    { label: "Teams", num: true, value: (s) => F.int(s.n) },
    { label: "Went through", num: true, value: (s) => (s.live ? "–" : F.int(s.spots)) },
    { label: "Games", num: true, value: (s) => F.int(s.length) },
    { label: "Our points", num: true, value: (s) => F.int(s.ours) },
    { label: "Bar", num: true, value: (s) => barText(s) },
    { label: "Best that missed", num: true, value: (s) => (s.live || s.bestOut == null ? "–" : F.int(s.bestOut)) },
    { label: "How it ended", value: (s) => (s.live ? `still being played: ${gapText(s)}` : s.made ? s.outcome : `missed: ${gapText(s)}`) },
  ], seasons);
}
