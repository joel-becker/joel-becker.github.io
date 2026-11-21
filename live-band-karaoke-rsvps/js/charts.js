// Reusable chart primitives (d3 v7, global). Marks follow the dataviz spec:
// thin bars (<=24px) with 4px rounded data-ends, 2px lines, >=8px markers with a
// surface ring, hairline recessive grid, crosshair/tooltip hover on everything.
import { tooltip, focusEvent } from "./ui.js?v=f58683f2";

export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Resolved colours for the current theme (SVG attributes can't use var()). */
/** True in dark mode, where the sequential scales run light = more. */
export function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/** "Darker" in light mode, "Lighter" in dark mode: how "more" looks on a heatmap. */
export const moreShade = () => (isDark() ? "Lighter" : "Darker");

export function palette() {
  return {
    lift: css("--lift"), run: css("--run"), soccer: css("--soccer"), other: css("--other"),
    ink: css("--ink"), ink2: css("--ink-2"), muted: css("--muted"), grid: css("--grid"), axis: css("--axis"),
    surface: css("--surface"), wash: css("--wash"),
    win: css("--win"), loss: css("--loss"), tie: css("--tie"),
    seq: d3.range(8).map((i) => css(`--seq-${i}`)),
    zones: d3.range(1, 6).map((i) => css(`--zone-${i}`)),
    cat: d3.range(1, 9).map((i) => css(`--cat-${i}`)),
  };
}

/** White or near-black label for text drawn inside a fill. */
export function inkOn(fill) {
  const c = d3.rgb(fill);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return (1.05 / (L + 0.05)) >= 4.5 ? "#ffffff" : "#0b0b0b";
}

let clipId = 0;

export function frame(el, { height = 220, margin = {} } = {}) {
  el.replaceChildren();
  const width = Math.max(260, Math.floor(el.getBoundingClientRect().width || el.clientWidth || 600));
  const m = { top: 10, right: 14, bottom: 26, left: 40, ...margin };
  const svg = d3.select(el).append("svg").attr("width", width).attr("height", height).attr("role", "img");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
  return { svg, g, w: width - m.left - m.right, h: height - m.top - m.bottom, m, width, height };
}

export function emptyMessage(g, w, h, text) {
  g.append("text").attr("class", "annot-muted").attr("x", w / 2).attr("y", h / 2)
    .attr("text-anchor", "middle").text(text);
}

/** Rounded data-end, square at the baseline. */
export function barPath(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
/** Rounded on the right end (horizontal bars), square at the left baseline. */
export function hbarPath(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return "";
  r = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

export function yGrid(g, y, w, { ticks = 4, format = d3.format(",") } = {}) {
  const t = y.ticks(ticks);
  const gg = g.append("g").attr("class", "axis");
  gg.selectAll("line").data(t).join("line").attr("class", "gridline")
    .attr("x1", 0).attr("x2", w).attr("y1", (d) => Math.round(y(d)) + 0.5).attr("y2", (d) => Math.round(y(d)) + 0.5);
  gg.selectAll("text").data(t).join("text")
    .attr("x", -8).attr("y", (d) => y(d)).attr("dy", "0.32em").attr("text-anchor", "end").text(format);
  return gg;
}

export function timeTickFormat(start, end, width = 800) {
  const years = (end - start) / (365.25 * 864e5);
  if (years > 2.2) return { ticks: d3.timeYear.every(years > 5 && width < 420 ? 2 : 1), fmt: d3.timeFormat("%Y") };
  if (years > 1.05) return { ticks: d3.timeMonth.every(width < 420 ? 6 : 3), fmt: (d) => (d.getMonth() === 0 ? d3.timeFormat("%Y")(d) : d3.timeFormat("%b")(d)) };
  return { ticks: d3.timeMonth.every(width < 420 ? 2 : 1), fmt: (d) => (d.getMonth() === 0 ? d3.timeFormat("%b ’%y")(d) : d3.timeFormat("%b")(d)) };
}

export function xTime(g, x, h, { minGap = 34 } = {}) {
  const [a, b] = x.domain();
  const { ticks, fmt } = timeTickFormat(a, b, x.range()[1]);
  const keep = [];
  for (const d of x.ticks(ticks)) if (!keep.length || x(d) - x(keep[keep.length - 1]) >= minGap) keep.push(d);
  const gg = g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`);
  gg.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", x.range()[1]).attr("y1", 0.5).attr("y2", 0.5);
  gg.selectAll("text").data(keep).join("text").attr("x", (d) => x(d)).attr("y", 17).attr("text-anchor", "middle").text(fmt);
  return gg;
}

/** A quiet band marking a period with missing source data. */
export function gapBand(g, x, h, w, { from, label }) {
  const x0 = Math.max(0, x(from));
  if (x0 >= w) return;
  g.append("rect").attr("x", x0).attr("y", 0).attr("width", w - x0).attr("height", h)
    .attr("fill", css("--wash")).attr("rx", 4);
  g.append("line").attr("x1", x0).attr("x2", x0).attr("y1", 0).attr("y2", h).attr("stroke", css("--axis"));
  if (w - x0 > 110 && label) {
    const t = g.append("text").attr("class", "annot-muted").attr("y", 14);
    label.split("\n").forEach((line, i) => t.append("tspan").attr("x", x0 + 8).attr("dy", i ? 14 : 0).text(line));
  }
}

/**
 * Stacked columns over contiguous time bins.
 * bins: [{date, end, values: {key: number}}]; keys bottom->top; colors: key -> colour
 */
export function stackedColumns(el, { bins, keys, colors, labels, height = 240, yFormat = d3.format(","), valueFormat = yFormat,
  binLabel = (d) => d, refLine = null, emphasize = null, gap: dataGap = null, note = null }) {
  const f = frame(el, { height, margin: { left: 44 } });
  const { g, w, h } = f;
  if (!bins.length) return f;
  const P = palette();
  const x = d3.scaleTime().domain([bins[0].date, bins[bins.length - 1].end]).range([0, w]);
  if (dataGap && dataGap.from < bins[bins.length - 1].end) gapBand(g, x, h, w, dataGap);
  const totals = bins.map((b) => keys.reduce((s, k) => s + (b.values[k] || 0), 0));
  const ymax = d3.max([...totals, refLine?.value || 0]) || 1;
  const y = d3.scaleLinear().domain([0, ymax]).nice(4).range([h, 0]);
  yGrid(g, y, w, { ticks: 4, format: yFormat });

  const gap = 2;
  const cols = g.append("g");
  bins.forEach((b) => {
    const x0 = x(b.date);
    const step = x(b.end) - x0;
    const bw = Math.max(1, Math.min(24, step - gap));
    const bx = x0 + (step - bw) / 2;
    let acc = 0;
    const present = keys.filter((k) => (b.values[k] || 0) > 0);
    present.forEach((k, j) => {
      const v = b.values[k];
      const y0 = y(acc), y1 = y(acc + v);
      acc += v;
      const top = j === present.length - 1;
      const segH = Math.max(0, y0 - y1 - (j === 0 ? 0 : gap));
      const fill = emphasize ? (emphasize(b, k) ? colors[k] : P.other) : colors[k];
      cols.append("path").attr("d", top ? barPath(bx, y1, bw, segH, Math.min(4, bw / 2)) : `M${bx},${y1}h${bw}v${segH}h${-bw}Z`)
        .attr("fill", fill);
    });
  });

  let refLabel = null;
  if (refLine) {
    const rx0 = refLine.from ? Math.max(0, x(refLine.from)) : 0;
    const rx1 = refLine.to ? Math.min(w, x(refLine.to)) : w;
    if (rx1 > rx0) {
      g.append("line").attr("x1", rx0).attr("x2", rx1).attr("y1", Math.round(y(refLine.value)) + 0.5).attr("y2", Math.round(y(refLine.value)) + 0.5)
        .attr("stroke", P.ink2).attr("stroke-width", 1.5);
      refLabel = () => {
        const t = g.append("text").attr("class", "annot halo").attr("x", rx0 + 4).attr("y", y(refLine.value) - 6).text(refLine.label);
        // a line that starts near the right edge gets its label right-aligned instead of cut off
        if (rx0 + 4 + t.node().getComputedTextLength() > w) t.attr("x", w).attr("text-anchor", "end");
      };
    }
  }
  xTime(g, x, h);
  if (refLabel) refLabel();

  const hl = g.insert("rect", ":first-child").attr("fill", P.wash).attr("rx", 3).attr("visibility", "hidden").attr("y", 0).attr("height", h);
  g.append("g").selectAll("rect").data(bins).join("rect").attr("class", "hit")
    .attr("x", (b) => x(b.date)).attr("width", (b) => Math.max(1, x(b.end) - x(b.date))).attr("y", 0).attr("height", h)
    .attr("tabindex", 0).attr("aria-label", (b) => binLabel(b.date))
    .on("pointerenter pointermove focus", function (ev, b) {
      const i = bins.indexOf(b);
      hl.attr("visibility", "visible").attr("x", x(b.date)).attr("width", x(b.end) - x(b.date));
      const rows = keys.slice().reverse().filter((k) => b.values[k]).map((k) => ({ label: labels[k], value: valueFormat(b.values[k]), color: colors[k] }));
      if (keys.length > 1 && rows.length > 1) rows.push({ label: "Total", value: valueFormat(totals[i]) });
      if (!rows.length) rows.push({ label: "Nothing logged", value: "" });
      tooltip.show(ev.type === "focus" ? focusEvent(this) : ev, { title: binLabel(b.date), rows, note: note ? note(b) : null });
    })
    .on("pointerleave blur", () => { hl.attr("visibility", "hidden"); tooltip.hide(); });
  return { ...f, x, y };
}

/** Bin rows (each with a `_date`) into an interval (d3.timeMonth / d3.timeMonday). */
export function binRows(rows, p, interval, valueOf) {
  const start = interval.floor(p.start);
  const dates = interval.range(start, d3.timeDay.offset(p.end, 1));
  const idx = new Map(dates.map((d, i) => [+d, i]));
  const bins = dates.map((d) => ({ date: d, end: interval.offset(d, 1), values: {}, rows: [] }));
  for (const r of rows) {
    const i = idx.get(+interval.floor(r._date));
    if (i == null) continue;
    bins[i].rows.push(r);
    for (const [k, v] of Object.entries(valueOf(r))) bins[i].values[k] = (bins[i].values[k] || 0) + (v || 0);
  }
  return bins;
}

/**
 * Time trend: faint per-observation dots, a 2px trend line, an end marker,
 * optional ringed highlight points and target line. Crosshair hover.
 * points: [{date, value, highlight?, hollow?}] line: [{date, value|null}]
 */
export function trendChart(el, { points = [], line = [], color, domain, height = 160, yFormat = d3.format(","),
  tip = null, target = null, gap = null, dotR = 2.2, dotOpacity = 0.5, reverse = false, yZero = false, empty = "No data in this period",
  margin = {}, robust = false, yPad = 0.1, yTicks = 4 }) {
  const f = frame(el, { height, margin: { left: 42, right: 14, ...margin } });
  const { svg, g, w, h } = f;
  const P = palette();
  const x = d3.scaleTime().domain(domain).range([0, w]);
  const within = (d) => d.date >= domain[0] && d.date <= domain[1];
  const pts = points.filter(within);
  const ln = line.filter(within);
  const vals = [...pts.map((d) => d.value), ...ln.map((d) => d.value).filter((v) => v != null), ...(target ? [target.value] : [])];
  if (gap) gapBand(g, x, h, w, gap);
  if (!vals.length) {
    xTime(g, x, h);
    emptyMessage(g, w, h, empty);
    return { ...f, x, y: null };
  }
  let [lo, hi] = d3.extent(vals);
  if (robust && pts.length > 20) {
    // fit the bulk: 2nd–98th percentile of observations, plus the whole trend line
    const pv = pts.map((d) => d.value).sort(d3.ascending);
    const lv = ln.map((d) => d.value).filter((v) => v != null);
    lo = Math.min(d3.quantileSorted(pv, 0.02), d3.min(lv) ?? Infinity);
    hi = Math.max(d3.quantileSorted(pv, 0.98), d3.max(lv) ?? -Infinity);
  }
  if (yZero) lo = 0;
  const pad = (hi - lo || Math.abs(hi) || 1) * yPad;
  const y = d3.scaleLinear().domain([yZero ? 0 : lo - pad, hi + pad]).nice(yTicks).range(reverse ? [0, h] : [h, 0]);
  yGrid(g, y, w, { ticks: yTicks, format: yFormat });
  xTime(g, x, h);

  const id = `clip-${++clipId}`;
  svg.append("clipPath").attr("id", id).append("rect").attr("x", -6).attr("y", -6).attr("width", w + 12).attr("height", h + 12);
  const plot = g.append("g").attr("clip-path", `url(#${id})`);
  let targetLabel = null;

  if (target) {
    // A goal only applies to its own period (e.g. one calendar year): draw it there.
    const ty = Math.round(y(target.value)) + 0.5;
    const x0 = target.from ? Math.max(0, x(target.from)) : 0;
    const x1 = target.to ? Math.min(w, x(target.to)) : w;
    if (x1 > x0) {
      plot.append("line").attr("x1", x0).attr("x2", x1).attr("y1", ty).attr("y2", ty).attr("stroke", P.ink2).attr("stroke-width", 1.5);
      plot.append("line").attr("x1", x0).attr("x2", x0).attr("y1", ty - 4).attr("y2", ty + 4).attr("stroke", P.ink2);
      targetLabel = () => g.append("text").attr("class", "annot halo").attr("x", x1)
        .attr("y", ty - 6).attr("text-anchor", "end").text(target.label);
    }
  }
  if (robust) {
    // observations beyond the fitted range sit on the edge as small open triangles
    const [d0, d1] = y.domain();
    const off = pts.filter((d) => d.value > d1 || d.value < d0);
    g.append("g").selectAll("path").data(off).join("path")
      .attr("d", d3.symbol(d3.symbolTriangle, 22)())
      .attr("transform", (d) => `translate(${x(d.date)},${d.value > d1 ? 4 : h - 4}) rotate(${d.value > d1 ? 0 : 180})`)
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.2).attr("opacity", 0.7);
  }
  // faint points (e.g. a session's other hard sets) sit behind everything
  plot.append("g").selectAll("circle").data(pts.filter((d) => d.faint)).join("circle")
    .attr("cx", (d) => x(d.date)).attr("cy", (d) => y(d.value)).attr("r", Math.max(1.6, dotR * 0.7))
    .attr("fill", color).attr("opacity", dotOpacity * 0.45);
  plot.append("g").selectAll("circle").data(pts.filter((d) => !d.highlight && !d.faint)).join("circle")
    .attr("cx", (d) => x(d.date)).attr("cy", (d) => y(d.value)).attr("r", dotR)
    .attr("fill", (d) => (d.hollow ? "none" : color)).attr("stroke", (d) => (d.hollow ? color : "none")).attr("stroke-width", 1.2)
    .attr("opacity", dotOpacity);
  if (ln.length) {
    plot.append("path").datum(ln).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
      .attr("d", d3.line().defined((d) => d.value != null).x((d) => x(d.date)).y((d) => y(d.value)));
  }
  plot.append("g").selectAll("circle").data(pts.filter((d) => d.highlight)).join("circle")
    .attr("cx", (d) => x(d.date)).attr("cy", (d) => y(d.value)).attr("r", 4)
    .attr("fill", color).attr("stroke", P.surface).attr("stroke-width", 2);
  const lastLine = [...ln].reverse().find((d) => d.value != null);
  if (lastLine) {
    plot.append("circle").attr("cx", x(lastLine.date)).attr("cy", y(lastLine.value)).attr("r", 4)
      .attr("fill", color).attr("stroke", P.surface).attr("stroke-width", 2);
  }

  if (targetLabel) targetLabel(); // drawn above the data so the halo keeps it legible

  // hover
  const main = pts.filter((d) => !d.faint);
  const targets = main.length ? main : ln.filter((d) => d.value != null);
  if (tip && targets.length) {
    const cross = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).attr("visibility", "hidden");
    const ring = g.append("circle").attr("r", 5).attr("fill", color).attr("stroke", P.surface).attr("stroke-width", 2).attr("visibility", "hidden");
    let idx = targets.length - 1;
    const showAt = (i, ev) => {
      idx = Math.max(0, Math.min(targets.length - 1, i));
      const d = targets[idx];
      cross.attr("visibility", "visible").attr("x1", x(d.date)).attr("x2", x(d.date));
      ring.attr("visibility", "visible").attr("cx", x(d.date)).attr("cy", y(d.value));
      tooltip.show(ev, tip(d));
    };
    const hide = () => { cross.attr("visibility", "hidden"); ring.attr("visibility", "hidden"); tooltip.hide(); };
    const bis = d3.bisector((d) => d.date).center;
    g.append("rect").attr("class", "hit").attr("width", w).attr("height", h)
      .on("pointermove", (ev) => showAt(bis(targets, x.invert(d3.pointer(ev)[0])), ev))
      .on("pointerleave", hide);
    svg.attr("tabindex", 0).attr("aria-label", "Chart: use arrow keys to step through values")
      .on("focus", function () { showAt(idx, focusEvent(this)); })
      .on("blur", hide)
      .on("keydown", function (ev) {
        if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
          ev.preventDefault();
          showAt(idx + (ev.key === "ArrowLeft" ? -1 : 1), focusEvent(ring.node()));
        }
      });
  }
  return { ...f, x, y };
}

/** Trailing-window maximum on a daily grid. hist: [{date, value}] sorted. */
export function rollingBest(hist, end, windowDays = 90) {
  if (!hist.length) return [];
  const dates = hist.map((d) => +d.date);
  const out = [];
  const ms = windowDays * 864e5;
  let lo = 0, hi = 0;
  for (let d = hist[0].date; d <= end; d = d3.timeDay.offset(d, 1)) {
    const t = +d;
    while (hi < hist.length && dates[hi] <= t) hi++;
    while (lo < hi && dates[lo] <= t - ms) lo++;
    let best = null;
    for (let i = lo; i < hi; i++) if (hist[i].value != null && (best == null || hist[i].value > best)) best = hist[i].value;
    out.push({ date: d, value: best });
  }
  return out;
}

/** Trailing rolling median over an array of {date, value}. */
export function rollingMedian(rows, n) {
  return rows.map((r, i) => {
    const s = rows.slice(Math.max(0, i - n + 1), i + 1).map((d) => d.value).filter((v) => v != null);
    return { date: r.date, value: s.length >= Math.min(3, n) ? d3.median(s) : null };
  });
}

/** Trailing rolling mean over an array of {date, value}. */
export function rollingMean(rows, n) {
  return rows.map((r, i) => {
    const s = rows.slice(Math.max(0, i - n + 1), i + 1).map((d) => d.value).filter((v) => v != null);
    return { date: r.date, value: s.length >= Math.min(3, n) ? d3.mean(s) : null };
  });
}

export function sparkline(values, { width = 120, height = 26, color } = {}) {
  const P = palette();
  const svg = d3.create("svg").attr("width", width).attr("height", height).attr("aria-hidden", "true");
  const vs = values.map((v) => v ?? 0);
  if (vs.length < 2) return svg.node();
  const x = d3.scaleLinear().domain([0, vs.length - 1]).range([2, width - 5]);
  const y = d3.scaleLinear().domain([0, d3.max(vs) || 1]).range([height - 3, 4]);
  svg.append("path").datum(vs).attr("fill", "none").attr("stroke", P.muted).attr("stroke-width", 1.5)
    .attr("stroke-linejoin", "round").attr("d", d3.line().x((_, i) => x(i)).y((d) => y(d)).curve(d3.curveMonotoneX));
  const last = vs.length - 1;
  svg.append("circle").attr("cx", x(last)).attr("cy", y(vs[last])).attr("r", 3.5)
    .attr("fill", color || P.ink).attr("stroke", P.surface).attr("stroke-width", 1.5);
  return svg.node();
}
