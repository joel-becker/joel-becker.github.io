// The top of the page: the team's name, its record in the chosen period, and six headline numbers.
import { inPeriod } from "./state.js?v=fe5dbb801b";
import { h } from "./ui.js?v=fe5dbb801b";
import * as F from "./format.js?v=fe5dbb801b";
import { playoffSeasons } from "./sections/playoffs.js?v=fe5dbb801b";

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const signed = (v, digits = 0) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${F.num(Math.abs(v), digits)}`;

export function render(data, p) {
  const t = data.team;
  document.title = t.name;
  for (const id of ["team-name", "footer-team"]) document.getElementById(id).textContent = t.name;
  document.getElementById("logo").firstChild.textContent = t.name.toUpperCase();
  document.getElementById("updated").textContent = `League record · updated ${F.fmtDate(data.meta.as_of)}`;
  const all = data.soccer.league, games = all.filter((r) => inPeriod(r.date, p));
  const seasons = new Set(all.map((r) => `${r.season}|${r.weekday}`)).size;
  const others = t.names.filter((n) => n !== t.name);
  document.getElementById("dek").textContent =
    `A recreational coed soccer team in San Francisco. ${F.int(all.length)} league games over ${F.int(seasons)} seasons since ${d3.timeFormat("%B %Y")(all[0]._date)}` +
    (others.length ? `, some of them under earlier names (${others.join(", ")})` : "") + ". Results, tables, squads and who said yes to each game.";
  document.getElementById("footer-meta").textContent = `Results from the league's site · built ${F.fmtDate(data.meta.generated.slice(0, 10))}`;

  const w = games.filter((r) => r.result === "W").length, tied = games.filter((r) => r.result === "T").length, l = games.length - w - tied;
  const scored = games.filter((r) => r.gf != null && r.ga != null);
  const gf = d3.sum(scored, (r) => r.gf), ga = d3.sum(scored, (r) => r.ga);
  const fig = document.getElementById("hero-figure");
  fig.replaceChildren(
    h("div", { class: "value" }, games.length ? `${w}–${tied}–${l}` : "–"),
    h("div", { class: "label" }, "won, tied, lost"),
    h("div", { class: "sub" }, games.length ? `${F.int(games.length)} games in ${p.label.toLowerCase()}` : `No games in ${p.label.toLowerCase()}`));

  // league tables of seasons that touch the period; a season still being played is not a finish yet
  const tables = (data.soccer.standings || []).filter((s) => games.some((r) => r.season === s.season && r.weekday === s.weekday));
  const done = tables.filter((s) => {
    const last = d3.max(all.filter((r) => r.season === s.season && r.weekday === s.weekday), (r) => r._date);
    return d3.timeDay.count(last, data._asOf) > 14;
  });
  const best = done.slice().sort((a, b) => a.rank / a.teams.length - b.rank / b.teams.length || b.teams.length - a.teams.length)[0];
  // finished seasons that touch the period: did we reach the play-offs, and did we win them
  const po = playoffSeasons(data).filter((s) => s.last >= p.start && s.start <= p.end), won = po.filter((s) => s.won);
  const people = new Set(games.flatMap((r) => r._lineup || []).map((n) => n.toLowerCase()));
  const last5 = games.slice(-5);
  const kpis = [
    { label: "Games won", value: games.length ? F.pct(w / games.length) : "–", sub: `${F.int(w)} of ${F.int(games.length)}` },
    { label: "Points a game", value: games.length ? F.num((3 * w + tied) / games.length, 2) : "–", sub: "3 for a win, 1 for a tie" },
    { label: "Goals", value: scored.length ? `${F.int(gf)}–${F.int(ga)}` : "–", sub: scored.length ? `${F.num(gf / scored.length, 1)} scored, ${F.num(ga / scored.length, 1)} let in a game` : "" },
    { label: "Goal difference", value: scored.length ? signed(gf - ga) : "–", sub: scored.length ? `${signed((gf - ga) / scored.length, 2)} a game` : "" },
    po.length ? { label: "Play-offs reached", value: `${F.int(po.filter((s) => s.made).length)} of ${F.int(po.length)}`,
      sub: won.length ? `seasons; won ${won.map((s) => F.fmtMonth(s.start)).join(", ")}` : "finished seasons" }
      : { label: "Best finish", value: best ? `${ordinal(best.rank)}` : "–", sub: best ? `of ${best.teams.length} teams, ${F.fmtMonth(d3.timeParse("%Y-%m")(best.season))}` : "no finished season" },
    people.size ? { label: "People who said yes", value: F.int(people.size), sub: "to at least one game" }
      : { label: "Last five", value: last5.map((r) => r.result).join(" ") || "–", sub: "oldest first" },
  ];
  document.getElementById("kpis").replaceChildren(...kpis.map((k) =>
    h("div", { class: "kpi" }, h("div", { class: "label" }, k.label), h("div", { class: "value" }, k.value), h("div", { class: "delta" }, k.sub || ""))));
}
