// League tables: where we finished each season, among every team in that league.
// The tables carry no team names (other teams are just positions in the table); our own name
// comes from the league games (`_team`), when the data has names.
import { h, card, legend, tooltip, focusEvent } from "../ui.js?v=fe5dbb801b";
import { palette, frame } from "../charts.js?v=fe5dbb801b";
import * as F from "../format.js?v=fe5dbb801b";
import { playoffSeasons } from "./playoffs.js?v=fe5dbb801b";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const monthOf = (season) => d3.timeParse("%Y-%m")(season);

export function render(data, p) {
  const el = document.getElementById("standings-card");
  if (!el) return;
  const all = data.soccer.standings || [];
  el.hidden = !all.length;
  if (!all.length) return;
  try { draw(el, data, p, all); } catch (err) { console.error(err); }
}

function draw(el, data, p, all) {
  const P = palette();
  const league = data.soccer.league || [];
  const seasons = all.map((s) => {
    const games = league.filter((r) => r.season === s.season && WEEKDAY[r._date.getDay()] === s.weekday);
    const start = monthOf(s.season);
    const last = games.length ? games[games.length - 1]._date : start;
    const n = s.teams.length;
    const ours = s.teams[s.rank - 1];
    return {
      ...s, n, ours, start, last, team: games.find((r) => r._team)?._team || null,
      label: `${F.fmtMonth(start)} · ${s.weekday.slice(0, 3)}`,
      // still being played: its latest game is within two weeks of the newest data
      live: games.length > 0 && d3.timeDay.count(last, data._asOf) <= 14,
      top: s.rank <= n / 2,
    };
  }).filter((s) => s.last >= p.start && s.start <= p.end).sort((a, b) => b.start - a.start || a.weekday.localeCompare(b.weekday));

  if (!seasons.length) {
    const c = card(el, { title: "Where we finished" });
    c.body.append(h("div", { class: "empty-state" }, "No league tables for this period"));
    legend(c.legend, []);
    c.setTable([], []);
    return;
  }
  const done = seasons.filter((s) => !s.live);
  const pool = done.length ? done : seasons;
  const best = pool.slice().sort((a, b) => a.rank / a.n - b.rank / b.n || b.n - a.n)[0];
  const topHalf = pool.filter((s) => s.top).length;
  const bottom = pool.filter((s) => s.rank === s.n).length;
  const name = (s) => (s.team ? `${s.team}, ${s.label}` : s.label);
  // How each season's play-offs went (worked out in playoffs.js). The table's order is by points over the season and
  // the play-offs together, so a place in it is not the play-off result: we have won the final from 2nd in the table.
  const playoffs = new Map(playoffSeasons(data).map((q) => [`${q.season}|${q.weekday}`, q]));
  const PLAYOFF_WORDS = { "won the final": "won the play-offs", "lost the final": "lost the play-off final", "lost the semi-final": "lost the play-off semi-final" };
  for (const s of seasons) {
    const q = playoffs.get(`${s.season}|${s.weekday}`);
    s.playoff = q && q.made ? (PLAYOFF_WORDS[q.outcome] || q.outcome) : null;
    s.wonPlayoffs = !!(q && q.won);
  }
  const champs = seasons.filter((s) => s.wonPlayoffs);
  const c = card(el, {
    title: (champs.length ? `We won the play-offs in ${champs.map((s) => F.fmtMonth(s.start)).reverse().join(" and ")} (${ordinal(champs[0].rank)} of ${champs[0].n} in the table); `
      : `Our best finish is ${ordinal(best.rank)} of ${best.n} (${name(best)}); `) +
      `we ended in the top half of the table in ${F.int(topHalf)} of ${F.int(pool.length)} seasons` + (bottom ? ` and last in ${F.int(bottom)}` : ""),
    sub: "One row per season, newest at the top. Each dot is a team in that league, in table order from first place on the left; the filled dot is us. " +
      "The tables are the league's own and count play-off games too, so the order is by points over the season and the play-offs together, not the play-off result: " +
      "where we reached the play-offs, how they went is noted beside the row." + (seasons.some((s) => s.live) ? " A season still being played is marked “so far”." : ""),
  });

  const maxN = d3.max(seasons, (s) => s.n);
  const bodyW = Math.max(280, c.body.getBoundingClientRect().width || 600);
  const narrow = bodyW < 560;
  const labelW = narrow ? 0 : 230, textW = narrow ? 86 : seasons.some((s) => s.playoff) ? 350 : 190;
  const rowH = narrow ? 44 : 30;
  const f = frame(c.body, { height: seasons.length * rowH + 26, margin: { left: labelW, right: textW, top: 22, bottom: 4 } });
  const { g, w } = f;
  const step = Math.min(30, w / maxN);
  const r = Math.max(4, Math.min(8, step / 2 - 2));
  const cx = (i) => (i + 0.5) * step;
  // column guide: 1st, and every few places after it
  const every = step < 16 ? 4 : step < 24 ? 2 : 1;
  g.append("g").selectAll("text").data(d3.range(maxN).filter((i) => i === 0 || (i + 1) % every === 0)).join("text")
    .attr("class", "annot-muted").attr("x", (i) => cx(i)).attr("y", -9).attr("text-anchor", "middle").text((i) => (i === 0 ? "1st" : i + 1));

  seasons.forEach((s, k) => {
    const y0 = k * rowH, cy = y0 + (narrow ? 30 : rowH / 2);
    const lab = g.append("text").attr("x", narrow ? 0 : -12).attr("y", narrow ? y0 + 12 : cy).attr("dy", narrow ? 0 : "0.32em").attr("text-anchor", narrow ? "start" : "end");
    if (s.team) lab.append("tspan").attr("class", "annot").style("font-weight", 600).text(`${s.team} `);
    // on a phone "so far" goes up here with the season: beside the place it would run past the edge of the plot
    lab.append("tspan").attr("class", "annot-muted").text(narrow && s.live ? `${s.label} · so far` : narrow && s.playoff ? `${s.label} · ${s.playoff.replace("play-off ", "")}` : s.label);
    // faint track across the places this league has
    g.append("line").attr("x1", cx(0)).attr("x2", cx(s.n - 1)).attr("y1", cy).attr("y2", cy).attr("stroke", P.grid);
    s.teams.forEach((t, i) => {
      const us = i === s.rank - 1;
      g.append("circle").attr("cx", cx(i)).attr("cy", cy).attr("r", us ? r : Math.max(3, r - 2))
        .attr("fill", us ? P.soccer : P.surface).attr("stroke", us ? P.surface : P.muted).attr("stroke-width", us ? 2 : 1.5);
      g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", cx(i) - step / 2).attr("y", y0).attr("width", step).attr("height", rowH)
        .on("pointerenter pointermove focus", function (ev) {
          tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, {
            // another team's dot is headed by the season alone: with our name in front it would read as our place
            title: us ? `${name(s)} · ${ordinal(i + 1)} of ${s.n} · us` : `${s.label} · ${ordinal(i + 1)} of ${s.n}`,
            rows: [{ label: "Record", value: `${t[0]} W · ${t[1]} T · ${t[2]} L`, color: us ? P.soccer : null },
              { label: "Goals", value: `${t[3]}–${t[4]}` }, { label: "Goal difference", value: `${t[3] - t[4] > 0 ? "+" : t[3] - t[4] < 0 ? "−" : ""}${Math.abs(t[3] - t[4])}` }],
          });
        })
        .on("pointerleave blur", () => tooltip.hide());
    });
    const txt = g.append("text").attr("x", w + 12).attr("y", cy).attr("dy", "0.32em");
    txt.append("tspan").attr("class", "annot").style("font-weight", 600).text(`${ordinal(s.rank)} of ${s.n}`);
    if (!narrow) txt.append("tspan").attr("class", "annot-muted").text(`  ${s.ours[0]} W · ${s.ours[1]} T · ${s.ours[2]} L${s.live ? ", so far" : ""}`);
    if (!narrow && s.playoff) txt.append("tspan").attr("class", "annot").style("font-weight", s.wonPlayoffs ? 600 : 400).text(` · ${s.playoff}`);
  });
  legend(c.legend, [{ label: "Us", color: P.soccer, mark: "dt" }, { label: "Other teams, in table order", color: P.muted, mark: "dt" }]);
  c.setTable([
    { label: "Season", value: (s) => (s.team ? `${s.team}, ${s.label}` : s.label) },
    { label: "Place in the table", num: true, value: (s) => `${ordinal(s.rank)}${s.live ? " so far" : ""}` },
    { label: "Play-offs", value: (s) => (s.live ? "" : s.playoff || "missed") },
    { label: "Teams", num: true, value: (s) => F.int(s.n) },
    { label: "W", num: true, value: (s) => s.ours[0] }, { label: "T", num: true, value: (s) => s.ours[1] }, { label: "L", num: true, value: (s) => s.ours[2] },
    { label: "Goals", num: true, value: (s) => `${s.ours[3]}–${s.ours[4]}` },
    { label: "Winner's record", value: (s) => `${s.teams[0][0]} W · ${s.teams[0][1]} T · ${s.teams[0][2]} L` },
  ], seasons);
}
