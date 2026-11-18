// Squads: who has been on our squad list season by season, and how much of each squad carries over to the
// next. These cards need `_squads` (the names on each season's list) and hide themselves where the data
// leaves names out.
//
// Nobody is a special case: the lists hold everyone, counted by the same rules. If `data.team.me` is a display
// name, that person's row is labelled "Me" in bold, and nothing else differs.
import { h, card, legend, tooltip, focusEvent, dataTable } from "../ui.js";
import { palette, frame, yGrid, xTime, barPath } from "../charts.js";
import * as F from "../format.js";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const IDS = ["squad-card", "squadsize-card", "squadrecord-card"];
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
  for (const [id, fn] of [["squad-card", renderGrid], ["squadsize-card", renderSize], ["squadrecord-card", renderRecord]]) {
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

// ---------------------------------------------------------------- who, when

/** What the title says about who has been in the most squads: names only, and never "Me" (a poor headline). */
function mostSeasons(people, nSeasons) {
  const top = people[0].seasons.length;
  if (nSeasons < 2) return "";
  const of = `${F.int(top)} of ${pl(nSeasons, "season")}`;
  const tied = people.filter((m) => m.seasons.length === top);
  const names = tied.filter((m) => !m.me);
  if (!names.length) {   // "Me" alone is in the most: say how many the next person has been in, without calling it the most
    const next = people.find((m) => !m.me);
    return next ? `; ${next.label} in ${F.int(next.seasons.length)} of ${pl(nSeasons, "season")}` : "";
  }
  if (names.length === 1) return `; ${names[0].label} in the most, ${of}`;
  if (names.length === 2) return `; ${names[0].label} and ${names[1].label} in the most, ${of} each`;
  return `; ${F.int(tied.length)} of them in ${top === nSeasons ? (nSeasons === 2 ? "both seasons" : `all ${F.int(nSeasons)} seasons`) : `${of} each, the most`}`;
}

function renderGrid(el, { P, seasons, people, priv }) {
  if (!seasons.length) return empty(el, "Who has been in our squads", priv);
  // three seasons to get a row, two for women
  const regulars = people.filter((m) => m.seasons.length >= bar(MIN_SEASONS, m.woman));
  const twos = people.filter((m) => m.seasons.length >= 2);
  const [pool, which] = regulars.length >= 5 ? [regulars, "in three or more of our seasons (two for women)"]
    : twos.length ? [twos, "in two or more of our seasons"] : [people, "on the squad list"];
  const shown = pool.slice(0, 40);
  const once = people.filter((m) => m.seasons.length === 1).length;
  const twoInAMonth = seasons.some((s, j) => j && +seasons[j - 1].start === +s.start);
  const c = card(el, {
    title: `${people.length === 1 ? "1 person has" : `${F.int(people.length)} people have`} been in one of our squads${mostSeasons(people, seasons.length)}`,
    sub: `One row for ${shown.length < pool.length ? `the first ${F.int(shown.length)} of the ${F.int(pool.length)} people` : shown.length === 1 ? "the one person" : `each of the ${F.int(shown.length)} people`} ` +
      `${which}, and one column per season, oldest on the left` +
      `${twoInAMonth ? " (two columns share a month where we played on two nights)" : ""}. A filled square means they were on that season's squad list. ` +
      `${once === 1 ? "1 person was" : `${F.int(once)} people were`} in a single squad.${priv ? " Names are only shown on this Mac." : ""}`,
  });
  tagPrivate(c, priv);
  const bodyW = Math.max(280, c.body.getBoundingClientRect().width || 600);
  const narrow = bodyW < 560;
  const labelW = narrow ? 86 : 120, countW = 34;
  const cw = Math.max(7, Math.min(28, Math.floor((bodyW - labelW - countW) / seasons.length)));
  const ch = narrow ? 16 : 20;
  const f = frame(c.body, { height: shown.length * ch + 50, margin: { left: labelW, right: countW, top: 44, bottom: 6 } });
  const { g } = f;
  // season headings: a line and a year label where the year changes, and the month where there is room (the tooltip has the team's name that season)
  const years = d3.groups(seasons.map((s, j) => ({ s, j })), (d) => d.s.start.getFullYear());
  years.forEach(([year, cols], i) => {
    const x0 = cols[0].j * cw;
    g.append("line").attr("x1", x0 - 2.5).attr("x2", x0 - 2.5).attr("y1", -40).attr("y2", shown.length * ch).attr("stroke", P.grid);
    // a year with only a column or two may not have room for "2025" before the next year's label: it is shortened to ’25, or left out
    const room = i === years.length - 1 ? Infinity : cols.length * cw;
    const text = room >= 34 ? String(year) : room >= 20 ? `’${String(year).slice(2)}` : null;
    if (text) g.append("text").attr("class", "annot-muted").attr("x", x0).attr("y", -30).text(text);
  });
  if (cw >= 22) seasons.forEach((s, j) => {
    g.append("text").attr("class", "annot-muted").attr("x", j * cw + (cw - 3) / 2).attr("y", -10).attr("text-anchor", "middle").text(d3.timeFormat("%b")(s.start));
  });
  shown.forEach((m, i) => {
    const y = i * ch;
    g.append("text").attr("class", "annot").attr("x", -10).attr("y", y + (ch - 3) / 2).attr("dy", "0.32em").attr("text-anchor", "end").style("font-weight", m.me ? 600 : null).text(m.label);
    g.append("text").attr("class", "annot-muted").attr("x", seasons.length * cw + 6).attr("y", y + (ch - 3) / 2).attr("dy", "0.32em").text(m.seasons.length);
    const mine = new Set(m.seasons);
    seasons.forEach((s, j) => {
      const on = mine.has(s);
      g.append("rect").attr("class", "cell cell-hit").attr("tabindex", on ? 0 : null)
        .attr("x", j * cw).attr("y", y).attr("width", cw - 3).attr("height", ch - 3).attr("rx", 3).attr("fill", on ? P.soccer : P.seq[0])
        .on("pointerenter pointermove focus", function (ev) {
          tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: `${m.label} · ${seasonName(s)}`,
            rows: [{ label: on ? "In the squad" : "Not in the squad", value: "", color: on ? P.soccer : null },
              ...(s.games.length ? [{ label: "Our record that season", value: record(s) }] : [])] });
        })
        .on("pointerleave blur", () => tooltip.hide());
    });
  });
  legend(c.legend, []);
  c.setTable([{ label: "Who", value: nameCell }, { label: "Seasons", num: true, value: (m) => m.seasons.length },
    { label: "First", value: (m) => m.seasons[0].label }, { label: "Latest", value: (m) => m.seasons[m.seasons.length - 1].label },
    { label: "We played as", value: (m) => [...new Set(m.seasons.map((s) => s.team).filter(Boolean))].join(", ") }], people.filter((m) => m.seasons.length >= 2));
}

// ---------------------------------------------------------------- squad size and turnover

function renderSize(el, { P, seasons, priv }) {
  if (!seasons.length) return empty(el, "Squad size and turnover", priv);
  const rows = seasons.map((s) => ({ s, back: s.players.filter((m) => m.before > 0).length, fresh: s.players.filter((m) => m.before === 0).length }));
  const later = rows.filter((r) => !r.s.first);   // our very first squad had nobody to return
  const share = later.length ? d3.sum(later, (r) => r.back) / d3.sum(later, (r) => r.back + r.fresh) : null;
  const last = rows[rows.length - 1];
  const c = card(el, {
    title: `A typical squad has ${ppl(d3.median(rows, (r) => r.back + r.fresh))}` +
      (share != null ? `; ${F.pct(share)} of them had been in an earlier squad of ours` : "") +
      (last.s.first ? "" : `. The latest has ${F.int(last.back)} returning and ${F.int(last.fresh)} new`),
    sub: "One column per season, placed on the month it started: the people who had been in an earlier squad of ours, and those new to the team. These are squad lists, not who said yes to each game.",
  });
  tagPrivate(c, priv);   // no names are drawn, but the card exists only where the squad lists do
  const f = frame(c.body, { height: 230, margin: { left: 30, right: 8, top: 12, bottom: 24 } });
  const { g, w, h: hh } = f;
  // a real date axis: each season sits on the month it started (two that started together sit side by side)
  const [a, b] = d3.extent(rows, (r) => r.s.start);
  const x = d3.scaleTime().domain([d3.timeMonth.offset(a, -1), d3.timeMonth.offset(b, 2)]).range([0, w]);
  const perMonth = x(d3.timeMonth.offset(a, 1)) - x(a);
  const bw = Math.max(3, Math.min(18, perMonth * 0.42));
  const cx = [];
  rows.forEach((r, i) => cx.push(i && +rows[i - 1].s.start === +r.s.start ? cx[i - 1] + bw + 1 : x(r.s.start) + bw / 2));
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.back + r.fresh)]).nice(4).range([hh, 0]);
  yGrid(g, y, w, { ticks: 4 });
  xTime(g, x, hh);
  rows.forEach((r, i) => {
    const x0 = cx[i] - bw / 2;
    const yBack = y(r.back), yTop = y(r.back + r.fresh);
    if (r.back) g.append("path").attr("d", r.fresh ? `M${x0},${hh}V${yBack + 1}H${x0 + bw}V${hh}Z` : barPath(x0, yBack, bw, hh - yBack)).attr("fill", P.soccer);
    if (r.fresh) g.append("path").attr("d", barPath(x0, yTop, bw, yBack - yTop - (r.back ? 1 : 0))).attr("fill", P.other);
    g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("x", x0 - 1).attr("y", 0).attr("width", bw + 2).attr("height", hh)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: `${seasonName(r.s)} · ${ppl(r.back + r.fresh)}`,
          rows: [{ label: "Were in an earlier squad", value: F.int(r.back), color: P.soccer }, { label: "New to the team", value: F.int(r.fresh), color: P.other },
            ...(r.s.games.length ? [{ label: "Our record that season", value: record(r.s) }] : [])] });
      })
      .on("pointerleave blur", () => tooltip.hide());
  });
  legend(c.legend, [{ label: "Were in an earlier squad", color: P.soccer }, { label: "New to the team", color: P.other }]);
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
