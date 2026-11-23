// Every card on the page. Each takes the data in site/data/rsvps.json (written by dashboard.py)
// and draws into its own element; titles state the finding with its numbers.
import { h, card, legend, tooltip, focusEvent, segmented } from "./ui.js?v=fdbdd6a9";
import { palette, frame, yGrid, barPath, inkOn, css } from "./charts.js?v=fdbdd6a9";
import { lineChart, valueAt } from "./lines.js?v=fdbdd6a9";

const int = (n) => d3.format(",")(Math.round(n));
const pct = (v) => `${Math.round(v * 100)}%`;
const last = (a) => a[a.length - 1];
const words = (n) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] || String(n);
const isNarrow = (el, at = 520) => (el.getBoundingClientRect().width || 900) < at;

/** One colour per event, the same in every card; the upcoming event is the page's purple. */
function eventColours(P) {
  return { berkeley: P.cat[6], bday: P.cat[0], lighthaven: P.cat[2], valentines: P.cat[4], mox: P.cat[3] };
}

/** Events newest first, each with its colour and curves, plus the upcoming one (or null once it has happened). */
function setup(data) {
  const P = palette(), colours = eventColours(P);
  const events = data.events.slice().reverse().map((e, i) => ({ ...e, color: colours[e.slug] || P.cat[i % 8], ...data.series[e.slug] }));
  const up = events.find((e) => e.upcoming) || null;
  const left = data.meta.days_left;
  const stage = left <= 0 ? "on the day" : left === 1 ? "with a day to go" : `with ${left} days to go`;
  const first = d3.min(events, (e) => (e.lead.going.length ? e.lead.going[0][0] : 0));
  return { P, events, up, past: events.filter((e) => !e.upcoming), stage, daysDomain: [-31, 0], meta: data.meta };
}

const daysAxis = (domain) => ({
  xDomain: domain,
  xTicks: d3.range(Math.ceil(domain[0] / 5) * 5, 1, 5),
  xFormat: (t) => (t === 0 ? "Night" : String(-t)),
  xLabel: "Days before the event",
  tipTitle: (x) => (x > -0.03 ? "On the night" : x > -1 ? `${Math.round(-x * 24)} hours before` : `${(-x).toFixed(1)} days before`),
});

const lineLegend = (el, events, value, note = () => "") =>
  legend(el, events.map((e) => ({ label: e.name + note(e), color: e.color, mark: "ln", value: value(e) })));

/** Table rows shared by the line cards: each event's value at this stage and on the night. */
function stageTable(c, S, points, fmt, stageX = (e) => S.up?.now) {
  c.setTable([
    { label: "Event", value: (e) => e.name },
    { label: "When", value: (e) => e.when },
    { label: S.up ? "At this stage" : "Two days out", num: true, value: (e) => { const p = valueAt(points(e), stageX(e) ?? -2); return p ? fmt(p) : "–"; } },
    { label: "On the night", num: true, value: (e) => (e.upcoming || !points(e).length ? "–" : fmt(last(points(e)))) },
  ], S.events);
}

// ---------------------------------------------------------------- lead-up

let measure = "going";
const MEASURES = [{ id: "going", label: "Going", word: "going" }, { id: "maybe", label: "Maybe", word: "maybes" }];

export function leadup(data) {
  const el = document.getElementById("leadup-card");
  const S = setup(data), M = MEASURES.find((m) => m.id === measure);
  const events = S.events.filter((e) => e.lead[M.id].length);
  const pts = (e) => e.lead[M.id];
  let title = "How the headcount built up before each event";
  if (S.up) {
    const here = last(pts(S.up))[1];
    const rivals = events.filter((e) => !e.upcoming && !e.approval).map((e) => ({ e, v: valueAt(pts(e), S.up.now)?.[1] ?? 0 }));
    const top = d3.greatest(rivals, (r) => r.v);
    title = `${int(here)} ${M.word} ${S.stage}` + (!top ? ""
      : M.id === "maybe" ? `; ${top.e.name} had ${int(top.v)} at this stage`
      : here > top.v ? `: more than any past event had at this stage (${top.e.name} had ${int(top.v)})`
      : `; ${top.e.name} had ${int(top.v)} at this stage`);
  }
  const approved = events.some((e) => e.approval) && M.id === "going";
  const tools = h("div", { class: "seg small", role: "group", "aria-label": "Which reply to count" });
  segmented(tools, MEASURES, M.id, (id) => { measure = id; leadup(data); });
  const c = card(el, {
    title,
    sub: `People who said ${M.id === "going" ? "going" : "maybe"}, counting their +1s, by days before each event.` +
      (approved ? ` Love Band Karaoke approved its guests rather than letting them say going, so each approved guest counts as ${S.meta.approved_weight} of a person.` : ""),
  });
  c.head.after(h("div", { style: { margin: "2px 0 10px" } }, tools));
  lineLegend(c.legend, events, (e) => int(last(pts(e))[1]), (e) => (e.approval && approved ? ` (approved × ${S.meta.approved_weight})` : ""));
  stageTable(c, { ...S, events }, pts, (p) => int(p[1]));
  lineChart(c.body, {
    ...daysAxis(S.daysDomain), label: `${M.label} headcount by days before each event`,
    series: events.map((e) => ({ label: e.name, color: e.color, points: pts(e), emph: e.upcoming })),
    yLabel: `People ${M.id === "going" ? "going" : "saying maybe"}, running total`, yFormat: int, nowX: S.up?.now,
    endLabel: (p) => `${int(p[1])} now`, height: isNarrow(el) ? 310 : 400,
  });
}

/** Of everyone who has said going or maybe, the share who said going. */
export function goingShare(data) {
  const el = document.getElementById("share-card");
  const S = setup(data);
  const share = (e) => e.lead.going.map(([x, g]) => {
    const m = valueAt(e.lead.maybe, x)?.[1] ?? 0;
    return g + m >= 10 ? [x, g / (g + m)] : null;
  }).filter(Boolean);
  const events = S.events.filter((e) => e.lead.going.length && e.lead.maybe.length && share(e).length);
  const pts = (e) => share(e);
  let title = "Share of going and maybe replies that are going";
  if (S.up && events.includes(S.up)) {
    const now = last(pts(S.up))[1], rivals = events.filter((e) => e !== S.up && !e.approval).map((e) => ({ e, v: valueAt(pts(e), S.up.now)?.[1] }));
    const top = d3.greatest(rivals.filter((r) => r.v != null), (r) => r.v);
    title = `${pct(now)} of people saying going or maybe to ${S.up.name} say going` + (top ? `; ${top.e.name} was at ${pct(top.v)} at this stage` : "");
  }
  const c = card(el, {
    title,
    sub: "Going divided by going plus maybe, counting +1s, by days before each event. A line starts once ten people have said going or maybe. Love Band Karaoke is left out of the comparison: it had no maybes.",
  });
  lineLegend(c.legend, events, (e) => pct(last(pts(e))[1]));
  stageTable(c, { ...S, events }, pts, (p) => pct(p[1]));
  lineChart(c.body, {
    ...daysAxis(S.daysDomain), label: "Share of going and maybe replies that are going, by days before each event",
    series: events.map((e) => ({ label: e.name, color: e.color, points: pts(e), emph: e.upcoming })),
    yDomain: [0, 1], yLabel: "Going, out of going and maybe", yFormat: pct, nowX: S.up?.now,
    endLabel: (p) => `${pct(p[1])} now`, height: 320,
  });
}

export function launch(data) {
  const el = document.getElementById("launch-card");
  const S = setup(data), days = S.meta.launch_days;
  const pts = (e) => e.launch.going;
  let title = "The first days after invites went out";
  if (S.up) {
    const at = Math.min(S.up.launch.end, days), here = valueAt(pts(S.up), at)[1];
    const rivals = S.past.filter((e) => !e.approval && e.launch.end >= at).map((e) => ({ e, v: valueAt(pts(e), at)?.[1] ?? 0 }));
    const top = d3.greatest(rivals, (r) => r.v);
    title = `${int(here)} going ${Math.round(at)} days after invites went out` + (top ? `; ${top.e.name} had ${int(top.v)} by then` : "");
  }
  const c = card(el, {
    title,
    sub: `The going lines again, counted from the moment invites went out (each event's ${S.meta.launch_rsvps}th RSVP), so events with different lead times start together. ` +
      `First ${days} days; a line that stops early has reached its night.`,
  });
  lineLegend(c.legend, S.events, (e) => int(valueAt(pts(e), Math.min(e.launch.end, days))[1]), (e) => (e.approval ? ` (approved × ${S.meta.approved_weight})` : ""));
  c.setTable([
    { label: "Event", value: (e) => e.name },
    { label: "Days from invites to the night", num: true, value: (e) => (e.upcoming ? "–" : Math.round(e.launch.end)) },
    { label: "Going after a week", num: true, value: (e) => (e.launch.end >= 7 ? int(valueAt(pts(e), 7)[1]) : "–") },
    { label: "Going after two weeks", num: true, value: (e) => (e.launch.end >= 14 ? int(valueAt(pts(e), 14)[1]) : "–") },
  ], S.events);
  lineChart(c.body, {
    label: "Going headcount by days since invites went out",
    series: S.events.map((e) => ({ label: e.name, color: e.color, points: pts(e), emph: e.upcoming })),
    xDomain: [0, days], xTicks: d3.range(0, days + 1, 3), xFormat: String, xLabel: "Days since invites went out",
    tipTitle: (x) => `${x.toFixed(1)} days after invites went out`,
    yLabel: "People going, running total", yFormat: int, endLabel: (p) => `${int(p[1])} now`, height: 320,
  });
}

export function guestList(data) {
  const el = document.getElementById("list-card");
  const S = setup(data);
  const pts = (e) => e.list;
  let title = "How each guest list grew";
  if (S.up) {
    const here = last(pts(S.up))[1];
    const top = d3.greatest(S.past.map((e) => ({ e, v: valueAt(pts(e), S.up.now)?.[1] ?? 0 })), (r) => r.v);
    title = `${int(here)} people on the guest list ${S.stage}` + (top ? `; ${top.e.name} had ${int(top.v)} at this stage` : "");
  }
  const c = card(el, {
    title,
    sub: "Everyone invited, plus everyone who replied without an invite, by when they joined the list. A +1 with a name counts; one without does not.",
  });
  lineLegend(c.legend, S.events, (e) => int(last(pts(e))[1]));
  stageTable(c, S, pts, (p) => int(p[1]));
  lineChart(c.body, {
    ...daysAxis(S.daysDomain), label: "Guest list size by days before each event",
    series: S.events.map((e) => ({ label: e.name, color: e.color, points: pts(e), emph: e.upcoming })),
    yLabel: "People on the guest list", yFormat: int, nowX: S.up?.now, endLabel: (p) => `${int(p[1])} now`, height: 320, left: 46,
  });
}

// ---------------------------------------------------------------- regulars

const EXPERIENCE = ["First time", "1 earlier event", "2 earlier events", "3 or more"];

export function experience(data) {
  const el = document.getElementById("experience-card");
  const S = setup(data), P = S.P;
  const colours = [P.seq[1], P.seq[3], P.seq[5], P.seq[7]];
  const bySlug = new Map(S.events.map((e) => [e.slug, e]));
  const rows = data.experience.map((r) => ({ ...r, e: bySlug.get(r.slug), total: d3.sum(r.counts) }));
  const now = last(rows);
  const back = now.counts[2] + now.counts[3];
  const c = card(el, {
    title: `${int(now.counts[0])} of the ${int(now.total)} people going to ${now.e.name} are new; ${int(back)} said going to two or more before`,
    sub: "People who said going to each event, by how many earlier events they had also said going to. People are matched by their Partiful account.",
  });
  legend(c.legend, EXPERIENCE.map((label, i) => ({ label, color: colours[i] })));
  c.setTable([{ label: "Event", value: (r) => r.e.name }, ...EXPERIENCE.map((label, i) => ({ label, num: true, value: (r) => int(r.counts[i]) })),
    { label: "Total", num: true, value: (r) => int(r.total) }], rows);

  const narrow = isNarrow(el, 440);
  const f = frame(c.body, { height: 320, margin: { left: 38, right: 8, top: 22, bottom: 30 } });
  const { g, w, h: ht } = f;
  const x = d3.scaleBand().domain(rows.map((r) => r.slug)).range([0, w]).paddingInner(0.3).paddingOuter(0.15);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.total)]).nice(4).range([ht, 0]);
  yGrid(g, y, w, { ticks: 4, format: int }).selectAll("line").filter((d) => y(d) > ht - 5).remove();
  const ax = g.append("g").attr("class", "axis").attr("transform", `translate(0,${ht})`);
  ax.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", 0.5).attr("y2", 0.5);
  ax.selectAll("text").data(rows).join("text").attr("x", (r) => x(r.slug) + x.bandwidth() / 2).attr("y", 17).attr("text-anchor", "middle")
    .style("fill", (r) => (r.e.upcoming ? P.ink : null)).style("font-weight", (r) => (r.e.upcoming ? 600 : null))
    .text((r) => (!narrow ? r.e.short : r.e.upcoming ? r.e.short : r.e.when.replace(/ \d\d(\d\d)$/, " ’$1")));
  const bw = Math.min(x.bandwidth(), 64);
  for (const r of rows) {
    const bx = x(r.slug) + (x.bandwidth() - bw) / 2;
    const present = r.counts.map((v, i) => ({ v, i })).filter((d) => d.v > 0);
    let acc = 0;
    present.forEach((d, j) => {
      const y0 = y(acc), y1 = y(acc + d.v);
      acc += d.v;
      const segH = Math.max(0, y0 - y1 - (j ? 2 : 0));
      g.append("path").attr("d", j === present.length - 1 ? barPath(bx, y1, bw, segH) : `M${bx},${y1}h${bw}v${segH}h${-bw}Z`).attr("fill", colours[d.i]);
      if (segH >= 16 && present.length > 1) g.append("text").attr("x", bx + bw / 2).attr("y", y1 + segH / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
        .style("font", "600 11px var(--sans)").style("fill", inkOn(colours[d.i])).attr("pointer-events", "none").text(int(d.v));
    });
    g.append("text").attr("class", "annot").attr("x", bx + bw / 2).attr("y", y(r.total) - 6).attr("text-anchor", "middle")
      .style("font-weight", 600).style("fill", P.ink).text(int(r.total));
  }
  g.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit").attr("x", (r) => x(r.slug)).attr("width", x.bandwidth()).attr("y", 0).attr("height", ht)
    .attr("tabindex", 0).attr("aria-label", (r) => r.e.name)
    .on("pointerenter pointermove focus", function (ev, r) {
      tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, {
        title: `${r.e.name} · ${r.e.when}`,
        rows: [...r.counts.map((v, i) => ({ label: EXPERIENCE[i], value: `${int(v)} (${pct(v / r.total)})`, color: colours[i] })).filter((_, i) => r.counts[i]).reverse(),
          { label: "Said going", value: int(r.total) }],
      });
    })
    .on("pointerleave blur", () => tooltip.hide());
}

export function standing(data) {
  const el = document.getElementById("standing-card");
  const S = setup(data), P = S.P;
  const KEYS = [
    { id: "going", label: "Going", color: css("--good") },
    { id: "maybe", label: "Maybe", color: css("--warning") },
    { id: "cant", label: "Can't go", color: css("--critical") },
    { id: "none", label: "Invited, no reply", color: P.other },
    { id: "absent", label: "Not invited", color: P.seq[0], edge: P.axis },
  ];
  const rows = data.standing.map((r) => ({ ...r, total: d3.sum(KEYS, (k) => r[k.id]), label: `${r.events} past event${r.events > 1 ? "s" : ""}` }));
  const regulars = rows.filter((r) => r.events >= 2);
  const sum = (k) => d3.sum(regulars, (r) => r[k]);
  const name = S.events[0].name;
  const c = card(el, {
    title: `Of the ${int(d3.sum(regulars, (r) => r.total))} people who said going to two or more past events, ${int(sum("going"))} are going and ${int(sum("none"))} have not answered their invite`,
    sub: `Everyone who said going to a past event, by how many of them, and where they stand for ${name}. Not invited means they are not on this guest list. The number of people is written in each bar.`,
  });
  legend(c.legend, KEYS.map((k) => ({ label: k.label, color: k.color })));
  c.setTable([{ label: "Said going to", value: (r) => r.label }, ...KEYS.map((k) => ({ label: k.label, num: true, value: (r) => int(r[k.id]) })),
    { label: "People", num: true, value: (r) => int(r.total) }], rows);

  const narrow = isNarrow(el, 440);
  const f = frame(c.body, { height: rows.length * 58 + 44, margin: { left: narrow ? 84 : 104, right: 46, top: 8, bottom: 30 } });
  const { g, w, h: ht } = f;
  const x = d3.scaleLinear().domain([0, 1]).range([0, w]);
  const y = d3.scaleBand().domain(rows.map((r) => r.events)).range([0, ht]).paddingInner(0.42).paddingOuter(0.25);
  const ax = g.append("g").attr("class", "axis").attr("transform", `translate(0,${ht})`);
  ax.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", 0.5).attr("y2", 0.5);
  ax.selectAll("text").data([0, 0.25, 0.5, 0.75, 1]).join("text").attr("x", (t) => x(t)).attr("y", 17).attr("text-anchor", "middle").text(pct);
  for (const r of rows) {
    const yy = y(r.events), bh = y.bandwidth();
    g.append("text").attr("class", "annot").attr("x", -10).attr("y", yy + bh / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(r.label);
    g.append("text").attr("class", "annot-muted").attr("x", w + 8).attr("y", yy + bh / 2).attr("dy", "0.35em").text(`n=${int(r.total)}`);
    let acc = 0;
    for (const k of KEYS) {
      const v = r[k.id];
      if (!v) continue;
      const x0 = x(acc / r.total), x1 = x((acc + v) / r.total);
      acc += v;
      const sw = Math.max(1, x1 - x0 - 2);
      g.append("rect").attr("x", x0).attr("y", yy).attr("width", sw).attr("height", bh).attr("rx", 3).attr("fill", k.color).attr("stroke", k.edge || "none")
        .attr("tabindex", 0).attr("aria-label", `${r.label}: ${k.label} ${v}`).style("cursor", "pointer")
        .on("pointerenter pointermove focus", function (ev) {
          tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, {
            title: `Said going to ${r.label}`,
            rows: KEYS.map((q) => ({ label: q.label, value: `${int(r[q.id])} (${pct(r[q.id] / r.total)})`, color: q.color })),
          });
        })
        .on("pointerleave blur", () => tooltip.hide());
      if (sw >= 18) g.append("text").attr("x", x0 + sw / 2).attr("y", yy + bh / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
        .style("font", "600 11px var(--sans)").style("fill", inkOn(k.color)).attr("pointer-events", "none").text(int(v));
    }
  }
}

// ---------------------------------------------------------------- women and men

export function men(data) {
  const el = document.getElementById("men-card");
  const S = setup(data);
  const events = S.events.filter((e) => e.men.length);
  const pts = (e) => e.men;
  let title = "Share of men among people going, as the RSVPs came in";
  if (S.up && pts(S.up).length) {
    const now = last(pts(S.up))[1], before = valueAt(pts(S.up), S.up.now - 7)?.[1];
    const move = before == null ? "" : Math.round(now * 100) === Math.round(before * 100) ? ", the same as a week ago" : `, ${now > before ? "up" : "down"} from ${pct(before)} a week ago`;
    title = `Men are ${pct(now)} of people going to ${S.up.name}${move}`;
  }
  const values = events.flatMap((e) => pts(e).filter((p) => p[0] >= S.daysDomain[0]).map((p) => p[1]));
  const c = card(el, {
    title,
    sub: "Share of men among people going, one line per event, as the RSVPs came in. A line starts once ten people can be placed as a woman or a man.",
  });
  lineLegend(c.legend, events, (e) => pct(last(pts(e))[1]));
  stageTable(c, { ...S, events }, pts, (p) => pct(p[1]));
  lineChart(c.body, {
    ...daysAxis(S.daysDomain), label: "Share of men among people going, by days before each event",
    series: events.map((e) => ({ label: e.name, color: e.color, points: pts(e), emph: e.upcoming })),
    yDomain: [Math.min(0.4, Math.floor(d3.min(values) * 10) / 10), Math.max(0.6, Math.ceil(d3.max(values) * 10) / 10)],
    yLabel: "Share of men among people going", yFormat: pct, ref: { value: 0.5, label: "even" }, nowX: S.up?.now,
    endLabel: (p) => `${pct(p[1])} now`, height: 320,
  });
}

/**
 * A row per event, a dot per group of guests, placed by a share (0 to 1).
 * o: { title, sub, get(event) -> { invited, link, list, going: { share, n } }, of (what the share is of, for labels),
 *      mark: { value, label } an optional reference line, span: [lo, hi] the least the axis should cover }
 */
function groupDots(el, S, o) {
  const P = S.P;
  const GROUPS = [
    { id: "invited", label: "Invited directly", color: P.cat[0] },
    { id: "link", label: "Found the shared link", color: P.cat[1] },
    { id: "list", label: "Whole guest list", color: P.muted },
    { id: "going", label: "Going", color: P.ink },
  ];
  const events = S.events.filter((e) => o.get(e));
  const c = card(el, { title: o.title, sub: o.sub });
  legend(c.legend, GROUPS.map((k) => ({ label: k.label, color: k.color, mark: "dt" })));
  const cell = (m) => (m.share == null ? "–" : `${pct(m.share)} of ${int(m.n)}`);
  c.setTable([{ label: "Event", value: (e) => e.name }, ...GROUPS.map((k) => ({ label: k.label, num: true, value: (e) => cell(o.get(e)[k.id]) }))], events);

  const narrow = isNarrow(el, 440);
  const shares = events.flatMap((e) => GROUPS.map((k) => o.get(e)[k.id].share)).filter((v) => v != null);
  const lo = Math.min(o.span[0], Math.floor(d3.min(shares) * 10) / 10), hi = Math.max(o.span[1], Math.ceil(d3.max(shares) * 10) / 10);
  const f = frame(c.body, { height: events.length * 46 + 54, margin: { left: narrow ? 82 : 150, right: 16, top: 20, bottom: 30 } });
  const { g, w, h: ht } = f;
  const x = d3.scaleLinear().domain([lo, hi]).range([0, w]);
  const y = d3.scalePoint().domain(events.map((e) => e.slug)).range([0, ht]).padding(0.6);
  const ticks = d3.range(Math.round(lo * 10), Math.round(hi * 10) + 1).map((t) => t / 10);
  const ax = g.append("g").attr("class", "axis");
  ax.selectAll("line").data(ticks).join("line").attr("class", "gridline").attr("x1", (t) => Math.round(x(t)) + 0.5).attr("x2", (t) => Math.round(x(t)) + 0.5).attr("y1", 0).attr("y2", ht)
    .style("stroke", (t) => (o.mark && t === o.mark.value ? P.muted : null));
  ax.selectAll("text").data(ticks).join("text").attr("x", (t) => x(t)).attr("y", ht + 17).attr("text-anchor", "middle").text(pct);
  if (o.mark) g.append("text").attr("class", "annot-muted").attr("x", x(o.mark.value)).attr("y", -8).attr("text-anchor", "middle").text(o.mark.label);
  for (const e of events) {
    const yy = y(e.slug);
    const marks = GROUPS.map((k) => ({ k, ...o.get(e)[k.id] })).filter((m) => m.share != null);
    g.append("text").attr("class", "annot").attr("x", -12).attr("y", yy).attr("dy", "0.35em").attr("text-anchor", "end")
      .style("fill", e.upcoming ? P.ink : null).style("font-weight", e.upcoming ? 600 : null).text(narrow ? e.short : e.name);
    g.append("line").attr("x1", x(d3.min(marks, (m) => m.share))).attr("x2", x(d3.max(marks, (m) => m.share))).attr("y1", yy).attr("y2", yy)
      .attr("stroke", P.axis).attr("stroke-width", 2);
    g.append("g").selectAll("circle").data(marks).join("circle").attr("cx", (m) => x(m.share)).attr("cy", yy).attr("r", 6)
      .attr("fill", (m) => m.k.color).attr("stroke", P.surface).attr("stroke-width", 2).attr("tabindex", 0).style("cursor", "pointer")
      .attr("aria-label", (m) => `${e.name}, ${m.k.label}: ${pct(m.share)} ${o.of}`)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, {
          title: `${e.name} · share ${o.of}`,
          rows: marks.map((m) => ({ label: m.k.label, value: cell(m), color: m.k.color })),
        });
      })
      .on("pointerleave blur", () => tooltip.hide());
  }
}

export function mix(data) {
  const S = setup(data), e0 = S.events[0];
  groupDots(document.getElementById("mix-card"), S, {
    get: (e) => e.mix, of: "of women", mark: { value: 0.5, label: "half women" }, span: [0.3, 0.6],
    title: `${pct(e0.mix.invited.share)} of the people invited to ${e0.name} are women, against ${pct(e0.mix.link.share)} of those who found the link themselves`,
    sub: "Share of women in four groups at each event: people invited directly, people who came through a shared link without an invite, the whole guest list, and people going.",
  });
}

// ---------------------------------------------------------------- Venmo

const dollars = (v) => `$${v >= 100 ? Math.round(v) : v.toFixed(v % 1 ? 2 : 0)}`;

function venmoRows(data) {
  const S = setup(data);
  const rows = S.events.filter((e) => data.venmo[e.slug]).map((e) => ({ e, ...data.venmo[e.slug] }));
  if (data.venmo.all) rows.push({ e: { slug: "all", name: "All events together", short: "All", color: S.P.ink }, ...data.venmo.all });
  return { S, rows };
}

export function venmoShare(data) {
  const el = document.getElementById("venmo-share-card");
  const { S, rows } = venmoRows(data), P = S.P;
  if (!rows.length) { el.hidden = true; return; }
  const top = d3.greatest(rows.filter((r) => r.e.slug !== "all"), (r) => r.share);
  const c = card(el, {
    title: `${pct(top.share)} of the people at ${top.e.name} paid on Venmo afterwards`,
    sub: `People who paid Joel within ${data.venmo_days} days of the night, out of everyone who said going, +1s included. It is a floor: one payment often covers a few people. ` +
      "Events where nobody paid (the Mox and Lighthaven nights) are left out, and Nov 21 has not happened yet.",
  });
  c.setTable([{ label: "Event", value: (r) => r.e.name }, { label: "Paid", num: true, value: (r) => int(r.payers) }, { label: "Said going", num: true, value: (r) => int(r.headcount) },
    { label: "Share", num: true, value: (r) => pct(r.share) }, { label: "Total paid", num: true, value: (r) => `$${int(r.total)}` },
    { label: "Per person going", num: true, value: (r) => dollars(r.per_attendee) }], rows);
  const narrow = isNarrow(el, 440);
  const f = frame(c.body, { height: rows.length * 52 + 40, margin: { left: narrow ? 82 : 150, right: 48, top: 8, bottom: 26 } });
  const { g, w, h: ht } = f;
  const hi = Math.max(0.3, Math.ceil(d3.max(rows, (r) => r.share) * 10) / 10);
  const x = d3.scaleLinear().domain([0, hi]).range([0, w]);
  const y = d3.scaleBand().domain(rows.map((r) => r.e.slug)).range([0, rows.length * 52]).paddingInner(0.35);
  const ticks = d3.range(0, Math.round(hi * 10) + 1, 1).map((t) => t / 10);
  const ax = g.append("g").attr("class", "axis");
  ax.selectAll("line").data(ticks).join("line").attr("class", "gridline").attr("x1", (t) => Math.round(x(t)) + 0.5).attr("x2", (t) => Math.round(x(t)) + 0.5).attr("y1", 0).attr("y2", rows.length * 52);
  ax.selectAll("text").data(ticks).join("text").attr("x", (t) => x(t)).attr("y", rows.length * 52 + 17).attr("text-anchor", "middle").text(pct);
  for (const r of rows) {
    const yy = y(r.e.slug);
    g.append("text").attr("class", "annot").attr("x", -12).attr("y", yy + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(narrow ? r.e.short : r.e.name);
    g.append("rect").attr("x", 0).attr("y", yy).attr("width", Math.max(2, x(r.share))).attr("height", y.bandwidth()).attr("rx", 3).attr("fill", r.e.color).attr("tabindex", 0)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: r.e.name, rows: [
          { label: "Paid on Venmo", value: `${int(r.payers)} of ${int(r.headcount)} (${pct(r.share)})`, color: r.e.color },
          { label: "Total paid", value: `$${int(r.total)}` }, { label: "Per person going", value: dollars(r.per_attendee) }] });
      }).on("pointerleave blur", () => tooltip.hide());
    g.append("text").attr("class", "annot").attr("x", x(r.share) + 6).attr("y", yy + y.bandwidth() / 2).attr("dy", "0.35em").style("font-weight", 600).style("fill", P.ink).text(pct(r.share));
  }
}

export function venmoAmounts(data) {
  const el = document.getElementById("venmo-amount-card");
  const { S, rows } = venmoRows(data), P = S.P;
  if (!rows.length) { el.hidden = true; return; }
  const top = d3.greatest(rows.filter((r) => r.e.slug !== "all"), (r) => r.median);
  const c = card(el, {
    title: `The typical person who paid gave ${dollars(top.median)} for ${top.e.name}; the average was ${dollars(top.mean)}`,
    sub: "What each person who paid gave in total: the line runs from the smallest to the largest payment, the box covers the middle half, the bar is the median and the diamond is the average. The scale is logarithmic because a few people gave far more.",
  });
  const cols = [["min", "Smallest"], ["q1", "25th percentile"], ["median", "Median"], ["q3", "75th percentile"], ["max", "Largest"], ["mean", "Average"]];
  c.setTable([{ label: "Event", value: (r) => r.e.name }, ...cols.map(([k, label]) => ({ label, num: true, value: (r) => dollars(r[k]) }))], rows);
  const narrow = isNarrow(el, 440), rh = 56;
  const f = frame(c.body, { height: rows.length * rh + 44, margin: { left: narrow ? 82 : 150, right: 18, top: 8, bottom: 30 } });
  const { g, w } = f;
  const lo = 5, hi = Math.max(100, d3.max(rows, (r) => r.max)), x = d3.scaleLog().domain([lo * 0.8, hi * 1.2]).range([0, w]);
  const ticks = [5, 10, 20, 50, 100, 200, 500, 1000].filter((t) => t >= lo * 0.8 && t <= hi * 1.2);
  const ax = g.append("g").attr("class", "axis");
  ax.selectAll("line").data(ticks).join("line").attr("class", "gridline").attr("x1", (t) => Math.round(x(t)) + 0.5).attr("x2", (t) => Math.round(x(t)) + 0.5).attr("y1", 0).attr("y2", rows.length * rh);
  ax.selectAll("text").data(ticks).join("text").attr("x", (t) => x(t)).attr("y", rows.length * rh + 18).attr("text-anchor", "middle").text((t) => `$${t}`);
  rows.forEach((r, i) => {
    const yy = i * rh + rh / 2;
    g.append("text").attr("class", "annot").attr("x", -12).attr("y", yy).attr("dy", "0.35em").attr("text-anchor", "end").text(narrow ? r.e.short : r.e.name);
    g.append("line").attr("x1", x(r.min)).attr("x2", x(r.max)).attr("y1", yy).attr("y2", yy).attr("stroke", r.e.color).attr("stroke-width", 2);
    for (const v of [r.min, r.max]) g.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", yy - 7).attr("y2", yy + 7).attr("stroke", r.e.color).attr("stroke-width", 2);
    g.append("rect").attr("x", x(r.q1)).attr("y", yy - 12).attr("width", Math.max(2, x(r.q3) - x(r.q1))).attr("height", 24).attr("rx", 3).attr("fill", r.e.color).attr("fill-opacity", 0.35).attr("stroke", r.e.color).attr("stroke-width", 1.5);
    g.append("line").attr("x1", x(r.median)).attr("x2", x(r.median)).attr("y1", yy - 12).attr("y2", yy + 12).attr("stroke", r.e.color).attr("stroke-width", 3.5);
    g.append("path").attr("d", d3.symbol(d3.symbolDiamond, 90)()).attr("transform", `translate(${x(r.mean)},${yy})`).attr("fill", P.ink).attr("stroke", P.surface).attr("stroke-width", 1.5);
    g.append("rect").attr("class", "hit").attr("x", 0).attr("y", yy - rh / 2).attr("width", w).attr("height", rh).attr("tabindex", 0)
      .on("pointerenter pointermove focus", function (ev) {
        tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: `${r.e.name} · ${int(r.payers)} people paid`,
          rows: cols.slice().reverse().map(([k, label]) => ({ label, value: dollars(r[k]) })) });
      }).on("pointerleave blur", () => tooltip.hide());
  });
}

// ---------------------------------------------------------------- Lighthaven and Mox crowd

const plural = (n, word) => `${int(n)} ${word}${n === 1 ? "" : "s"}`;

export function crowdGoing(data) {
  const el = document.getElementById("crowd-going-card");
  const S = setup(data);
  const events = S.events.filter((e) => e.crowd?.going.length);
  if (!events.length) { el.hidden = true; return; }
  const pts = (e) => e.crowd.going;
  let title = "Share of people going who had been to another Lighthaven or Mox event";
  if (S.up && events.includes(S.up)) {
    const now = last(pts(S.up))[1], before = valueAt(pts(S.up), S.up.now - 7)?.[1];
    const move = before == null ? "" : Math.round(now * 100) === Math.round(before * 100) ? ", the same as a week ago" : `, ${now > before ? "up" : "down"} from ${pct(before)} a week ago`;
    title = `${pct(now)} of people going to ${S.up.name} had said going to another Lighthaven or Mox event before${move}`;
  }
  const seen = S.events[0].crowd.events;
  const values = events.flatMap((e) => pts(e).filter((p) => p[0] >= S.daysDomain[0]).map((p) => p[1]));
  const c = card(el, {
    title,
    sub: `Share of people going who had already said going to one of the other events Joel has been to at Lighthaven (${plural(seen.lighthaven || 0, "event")}) or Mox (${int(seen.mox || 0)}), ` +
      "karaoke nights not counted. One line per event, as the RSVPs came in; a line starts once ten people are going.",
  });
  lineLegend(c.legend, events, (e) => pct(last(pts(e))[1]));
  stageTable(c, { ...S, events }, pts, (p) => pct(p[1]));
  lineChart(c.body, {
    ...daysAxis(S.daysDomain), label: "Share of people going who had been to another Lighthaven or Mox event, by days before each event",
    series: events.map((e) => ({ label: e.name, color: e.color, points: pts(e), emph: e.upcoming })),
    yDomain: [0, Math.max(0.6, Math.ceil(d3.max(values) * 10) / 10)],
    yLabel: "Share who had been to another Lighthaven or Mox event", yFormat: pct, nowX: S.up?.now,
    endLabel: (p) => `${pct(p[1])} now`, height: 320,
  });
}

export function crowdMix(data) {
  const el = document.getElementById("crowd-mix-card");
  const S = setup(data), e0 = S.events[0];
  if (!e0.crowd) { el.hidden = true; return; }
  const m = e0.crowd.mix;
  groupDots(el, S, {
    get: (e) => e.crowd?.mix, of: "who had been to another Lighthaven or Mox event", span: [0.2, 0.6],
    title: `${pct(m.going.share)} of people going to ${e0.name} have been to Lighthaven or Mox before, against ${pct(m.list.share)} of the whole guest list`,
    sub: "Share who had already said going to another Lighthaven or Mox event, in four groups at each event: people invited directly, people who came through a shared link, the whole guest list, and people going.",
  });
}

// ---------------------------------------------------------------- replies

const HOURS = [[1, "1 hour"], [6, "6 hours"], [24, "1 day"], [72, "3 days"], [168, "1 week"], [336, "2 weeks"], [672, "4 weeks"]];

export function replies(data) {
  const el = document.getElementById("replies-card");
  const S = setup(data);
  const events = S.events.filter((e) => e.replies?.length);
  const pts = (e) => e.replies;
  const at = (e, hours) => { const p = valueAt(pts(e), hours); return p && last(pts(e))[0] >= hours ? p[1] : null; };
  const e0 = events[0];
  const day = at(e0, 24), week = at(e0, 168);
  const narrow = isNarrow(el);
  const c = card(el, {
    title: day == null ? "How quickly people reply to an invite"
      : `${pct(day)} of people invited to ${e0.name} replied within a day` + (week == null ? "" : `, and ${pct(week)} within a week`),
    sub: "Share of directly-invited people who have replied (going, maybe or can't go), by time since their invite was sent. An invite only counts for as long as it has been out, " +
      "so a batch of fresh invites does not drag a line down. Love Band Karaoke is left out: its timestamps are the host's approvals, not the guests' replies.",
  });
  lineLegend(c.legend, events, (e) => pct(last(pts(e))[1]));
  c.setTable([{ label: "Event", value: (e) => e.name },
    ...[[24, "Within a day"], [72, "Within 3 days"], [168, "Within a week"], [336, "Within 2 weeks"]].map(([hrs, label]) => ({ label, num: true, value: (e) => (at(e, hrs) == null ? "–" : pct(at(e, hrs))) }))], events);
  lineChart(c.body, {
    label: "Share of invited people who have replied, by time since the invite",
    series: events.map((e) => ({ label: e.name, color: e.color, points: pts(e), emph: e.upcoming })),
    xLog: true, xDomain: [0.25, 800], xTicks: HOURS.map((t) => t[0]),
    xFormat: (t) => { const s = HOURS.find((q) => q[0] === t)[1]; return narrow ? s.replace(/ (hour|day|week)s?/, (m, u) => u[0]) : s; },
    xLabel: "Time since the invite was sent",
    tipTitle: (x) => (x < 1 ? `${Math.round(x * 60)} minutes after the invite` : x < 48 ? `${Math.round(x)} hours after the invite` : `${(x / 24).toFixed(1)} days after the invite`),
    yLabel: "Share of invited people who have replied", yFormat: pct, endLabel: (p) => `${pct(p[1])} so far`,
  });
}

// ---------------------------------------------------------------- top of the page and About

export function overview(data) {
  const S = setup(data), t = data.totals, e0 = S.events[0];
  const left = S.meta.days_left;
  document.getElementById("updated").textContent = `RSVPs · updated ${S.meta.updated} Pacific`;
  document.getElementById("dek").textContent =
    `${e0.name}: ${S.meta.night}. How the RSVPs are building up, laid over the ${words(S.past.length)} events before it.`;
  document.getElementById("footer-meta").textContent = `From the Partiful guest lists · updated ${S.meta.updated} Pacific`;
  document.getElementById("hero-figure").replaceChildren(
    h("div", { class: "value" }, int(t.headcount)),
    h("div", { class: "label" }, "going, counting +1s"),
    h("div", { class: "sub" }, left > 1 ? `${left} days to go` : left === 1 ? "one day to go" : left === 0 ? "tonight" : "final count"));
  const g = last(e0.gender);
  const kpis = [
    { label: "Said going", value: int(t.going), sub: "named guests" },
    { label: "Maybe", value: int(t.maybe), sub: "named guests" },
    { label: "Can't go", value: int(t.cant), sub: "have said no" },
    { label: "Replied", value: int(t.replied), sub: `${pct(t.replied / t.list)} of the guest list` },
    { label: "Guest list", value: int(t.list), sub: "invited or replied" },
    { label: "Women : men going", value: `${int(g[1])} : ${int(g[2])}`, sub: "best guess from first names" },
  ];
  document.getElementById("kpis").replaceChildren(...kpis.map((k) =>
    h("div", { class: "kpi" }, h("div", { class: "label" }, k.label), h("div", { class: "value" }, k.value), h("div", { class: "delta" }, k.sub))));
}

export function about(data) {
  const S = setup(data);
  const c = card(document.getElementById("about-card"), { title: "Where this comes from", table: false });
  const items = [
    ["The numbers", `Partiful's guest lists for ${S.events[0].name} and the ${words(S.past.length)} events before it, last read ${S.meta.updated} Pacific. The page shows totals only: no names.`],
    ["Going and headcount", "Going counts everyone who said going plus the +1s they are bringing. The guest list counts each person invited or who replied, and a +1 only when it has a name."],
    ["Love Band Karaoke", `That event approved guests rather than letting them say going, and not every approved guest came. Its going line counts each approved guest as ${S.meta.approved_weight} of a person.`],
    ["Women and men", "A best guess from first names. People whose names can't be placed are left out, and a +1 without a name counts as half a woman and half a man. Read these as rough shares, not a register."],
    ["Lighthaven and Mox crowd", `Someone counts if their Partiful account said going to another event at Lighthaven (Berkeley) or Mox (San Francisco) before the karaoke in question. ` +
      `Only the ${int(d3.sum(Object.values(S.events[0].crowd?.events || {})))} events there that Joel also went to can be seen, so the real share of regulars at those two places is higher. ` +
      "Karaoke nights are not counted, and neither are people without a Partiful account."],
    ["Regulars", "People are matched across events by their Partiful account. Saying going is an RSVP: some people say going and don't come, and some come without saying so."],
  ];
  c.body.append(h("dl", { class: "about-list" }, ...items.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])));
}

// ---------------------------------------------------------------- who keeps coming (flow)

let flowGroup = "all";
const FLOW_GROUPS = [{ id: "all", label: "Everyone" }, { id: "invited", label: "Invited directly" }, { id: "link", label: "Found it via a link" }];

export function flow(data) {
  const el = document.getElementById("flow-card");
  const S = setup(data), P = S.P, F = data.flow, n = F.slugs.length;
  const ev = F.slugs.map((slug) => S.events.find((e) => e.slug === slug));
  const first = (p) => p.indexOf("1");
  // share of first-timers at each finished event who also went to the one after it
  const nextShare = (g) => {
    let from = 0, back = 0;
    for (const r of F.groups[g]) { const f = first(r.p); if (f < n - 2) { from += r.n; if (r.p[f + 1] === "1") back += r.n; } }
    return from ? back / from : null;
  };
  const G = FLOW_GROUPS.find((x) => x.id === flowGroup), rows = F.groups[G.id];

  // cnt[j][state][cohort]: state 0 = said going to event j, 1 = did not; cohort = the event they first said going to
  const zero = () => Array.from({ length: n }, () => [Array(n).fill(0), Array(n).fill(0)]);
  const cnt = zero(), link = Array.from({ length: n }, () => Array.from({ length: n }, () => [[0, 0], [0, 0]]));
  for (const r of rows) {
    const f = first(r.p);
    for (let j = f; j < n; j++) {
      const st = r.p[j] === "1" ? 0 : 1;
      cnt[j][st][f] += r.n;
      if (j < n - 1) link[j][f][st][r.p[j + 1] === "1" ? 0 : 1] += r.n;
    }
  }
  const size = d3.range(n).map((f) => cnt[f][0][f]);
  const wentAt = (j) => d3.sum(cnt[j][0]), didAt = (j) => d3.sum(cnt[j][1]);

  const all = nextShare("all"), inv = nextShare("invited"), lnk = nextShare("link");
  const c = card(el, {
    title: all == null ? "Who keeps coming" : `${pct(all)} of first-timers went to the next event too` +
      (inv != null && lnk != null ? `: ${pct(inv)} of those invited directly, ${pct(lnk)} of those who found it via a link` : ""),
    sub: "Each coloured band follows the people who first said going to one event, event by event: up top the ones who said going again, below the ones who did not. " +
      "People are matched by their Partiful account; saying going is an RSVP, not a check-in. The last column is going so far.",
  });
  const tools = h("div", { class: "seg small", role: "group", "aria-label": "How people got in at their first event" });
  segmented(tools, FLOW_GROUPS, flowGroup, (id) => { flowGroup = id; flow(data); });
  c.head.after(h("div", { style: { margin: "2px 0 10px" } }, tools));
  legend(c.legend, ev.map((e) => ({ label: `First came to ${e.name}`, color: e.color })));
  c.setTable([
    { label: "First came to", value: (f) => ev[f].name },
    { label: "People", num: true, value: (f) => int(size[f]) },
    { label: "Went to the next one", num: true, value: (f) => (f >= n - 1 || !size[f] ? "–" : `${int(link[f][f][0][0])} (${pct(link[f][f][0][0] / size[f])})`) },
    { label: "Went to any later one", num: true, value: (f) => { const back = d3.sum(rows.filter((r) => first(r.p) === f && r.p.slice(f + 1).includes("1")), (r) => r.n); return f >= n - 1 || !size[f] ? "–" : `${int(back)} (${pct(back / size[f])})`; } },
  ], d3.range(n));

  const narrow = isNarrow(el, 520);
  const f0 = frame(c.body, { height: narrow ? 380 : 440, margin: { left: narrow ? 40 : 62, right: 8, top: 44, bottom: 6 } });
  const { g, w, h: ht } = f0, nw = narrow ? 12 : 18, gap = 28;
  const wentMax = d3.max(d3.range(n), wentAt), didMax = d3.max(d3.range(n), didAt);
  const k = (ht - gap) / (wentMax + didMax), didTop = wentMax * k + gap;
  const xs = d3.range(n).map((j) => (j * (w - nw)) / (n - 1));
  const colour = (f) => ev[f].color;

  // where each segment sits
  const seg = zero();
  for (let j = 0; j < n; j++) for (let st = 0; st < 2; st++) {
    let acc = st ? didTop : 0;
    for (let f = 0; f <= j; f++) { seg[j][st][f] = acc; acc += cnt[j][st][f] * k; }
  }
  const outOff = zero(), inOff = zero(), ribbons = g.append("g");
  for (let j = 0; j < n - 1; j++) for (let f = 0; f <= j; f++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const v = link[j][f][a][b];
    if (!v) continue;
    const hh = v * k, y0 = seg[j][a][f] + outOff[j][a][f] ; outOff[j][a][f] += hh;
    const y1 = seg[j + 1][b][f] + inOff[j + 1][b][f]; inOff[j + 1][b][f] += hh;
    const x0 = xs[j] + nw, x1 = xs[j + 1], mx = (x0 + x1) / 2;
    const path = ribbons.append("path").attr("d", `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}L${x1},${y1 + hh}C${mx},${y1 + hh} ${mx},${y0 + hh} ${x0},${y0 + hh}Z`)
      .attr("fill", colour(f)).attr("fill-opacity", b === 0 ? 0.5 : 0.2).attr("stroke", "none").attr("tabindex", 0);
    const tip = (ev_, node) => {
      const from = cnt[j][a][f];
      tooltip.show(ev_.type === "focus" ? focusEvent(node) : ev_, {
        title: `First came to ${ev[f].name}`,
        rows: [{ label: `${a ? "Skipped" : "Went to"} ${ev[j].name}, then ${b ? "skipped" : "went to"} ${ev[j + 1].name}`, value: `${int(v)} (${pct(v / from)} of ${int(from)})`, color: colour(f) }],
      });
    };
    path.on("pointerenter pointermove focus", function (e) { tip(e, this); }).on("pointerleave blur", () => tooltip.hide())
      .on("pointerenter.hl", function () { d3.select(this).attr("fill-opacity", 0.8); }).on("pointerleave.hl", function () { d3.select(this).attr("fill-opacity", b === 0 ? 0.5 : 0.2); });
  }
  // columns, headers and segments
  for (let j = 0; j < n; j++) {
    const e = ev[j];
    g.append("text").attr("x", xs[j] + nw / 2).attr("y", -26).attr("text-anchor", j === 0 ? "start" : j === n - 1 ? "end" : "middle")
      .attr("transform", `translate(${j === 0 ? -nw / 2 : j === n - 1 ? nw / 2 : 0},0)`)
      .style("font", "600 12px var(--sans)").style("fill", e.upcoming ? P.ink : null).text(narrow ? (e.upcoming ? e.short : e.when.replace(/ \d\d(\d\d)$/, " ’$1")) : e.short);
    g.append("text").attr("x", xs[j] + nw / 2).attr("y", -11).attr("text-anchor", j === 0 ? "start" : j === n - 1 ? "end" : "middle")
      .attr("transform", `translate(${j === 0 ? -nw / 2 : j === n - 1 ? nw / 2 : 0},0)`)
      .attr("class", "annot").text(`${int(wentAt(j))} ${e.upcoming ? "so far" : "went"}`);
    for (let st = 0; st < 2; st++) for (let f = 0; f <= j; f++) {
      const v = cnt[j][st][f];
      if (!v) continue;
      const y = seg[j][st][f], hh = Math.max(1, v * k - 1);
      g.append("rect").attr("x", xs[j]).attr("y", y).attr("width", nw).attr("height", hh).attr("rx", 2)
        .attr("fill", colour(f)).attr("fill-opacity", st ? 0.4 : 1).attr("tabindex", 0).attr("aria-label", `${ev[f].name} first-timers`)
        .on("pointerenter pointermove focus", function (e2) {
          tooltip.show(e2.type === "focus" ? focusEvent(this) : e2, { title: `${e.name}`, rows: [{ label: `First came to ${ev[f].name}: ${st ? "did not go" : "went"}`, value: int(v), color: colour(f) }] });
        }).on("pointerleave blur", () => tooltip.hide());
    }
  }
  g.append("text").attr("x", -6).attr("y", 10).attr("text-anchor", "end").attr("class", "annot").text("Went");
  g.append("text").attr("x", -6).attr("y", didTop + 10).attr("text-anchor", "end").attr("class", "annot").text(narrow ? "Not" : "Didn’t go");
}
