// One chart used by most cards: a step line per event, the upcoming event drawn on top and labelled,
// a crosshair that reads every line at the pointer. Built on the shared helpers in charts.js / ui.js.
import { tooltip } from "./ui.js?v=1116d95e";
import { palette, frame, yGrid } from "./charts.js?v=1116d95e";

/** The last point at or before x on a step line ([[x, y, ...], ...] sorted by x), or null before it starts. */
export function valueAt(points, x) {
  const i = d3.bisector((p) => p[0]).right(points, x);
  return i ? points[i - 1] : null;
}

/** The part of a step line inside [a, b], with its value carried to both edges. */
function clip(points, [a, b]) {
  const inside = points.filter((p) => p[0] >= a && p[0] <= b);
  const before = valueAt(points, a);
  if (before && before[0] < a) inside.unshift([a, ...before.slice(1)]);
  if (points.length && points[points.length - 1][0] > b) inside.push([b, ...valueAt(points, b).slice(1)]);
  return inside;
}

/**
 * series: [{ label, color, points, emph }]   (emph: the upcoming event, drawn thicker and on top)
 * xDomain, xTicks, xFormat, xLabel, xLog; yLabel, yFormat, yDomain (else from the data, including zero unless yZero is false)
 * ref: { value, label } a horizontal reference line; nowX: a "today" marker
 * endLabel(point): text beside the upcoming event's last point; tipTitle(x); tipValue(point, series)
 */
export function lineChart(el, o) {
  const P = palette();
  const narrow = (el.getBoundingClientRect().width || 900) < 520;
  const f = frame(el, { height: o.height || (narrow ? 290 : 350), margin: { left: o.left || 40, right: 18, top: 32, bottom: 46 } });
  const { svg, g, w, h } = f;
  if (o.label) svg.attr("aria-label", o.label);
  const series = o.series.map((s) => ({ ...s, pts: clip(s.points, o.xDomain) })).filter((s) => s.pts.length);
  const x = (o.xLog ? d3.scaleLog() : d3.scaleLinear()).domain(o.xDomain).range([0, w]).clamp(true);
  const values = series.flatMap((s) => s.pts.map((p) => p[1]));
  const y = d3.scaleLinear().range([h, 0]);
  if (o.yDomain) y.domain(o.yDomain);
  else y.domain(d3.extent([...(o.yZero === false ? [] : [0]), ...values])).nice(5);

  // a gridline that lands on the x axis would double it up: the axis line stands in for it
  yGrid(g, y, w, { ticks: 5, format: o.yFormat }).selectAll("line").filter((d) => y(d) > h - 5).remove();
  g.append("text").attr("class", "annot-muted").attr("x", -f.m.left).attr("y", -16).text(o.yLabel);
  const ax = g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`);
  ax.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", 0.5).attr("y2", 0.5);
  const ticks = o.xTicks.filter((t) => t >= o.xDomain[0] && t <= o.xDomain[1]);
  const shown = narrow && ticks.length > 7 ? ticks.filter((t, i) => (ticks.length - 1 - i) % 2 === 0) : ticks;
  ax.selectAll("text").data(shown).join("text").attr("x", (t) => x(t)).attr("y", 17).attr("text-anchor", "middle").text(o.xFormat);
  g.append("text").attr("class", "annot-muted").attr("x", w / 2).attr("y", h + 37).attr("text-anchor", "middle").text(o.xLabel);

  if (y.domain()[0] < 0) {
    const y0 = Math.round(y(0)) + 0.5;
    g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y0).attr("y2", y0).attr("stroke", P.muted).attr("shape-rendering", "crispEdges");
  }
  if (o.ref) {
    const yr = Math.round(y(o.ref.value)) + 0.5;
    g.append("line").attr("x1", 0).attr("x2", w).attr("y1", yr).attr("y2", yr).attr("stroke", P.muted).attr("shape-rendering", "crispEdges");
    g.append("text").attr("class", "annot-muted halo").attr("x", 4).attr("y", yr - 6).style("font-weight", 500).text(o.ref.label);
  }
  if (o.nowX != null && o.nowX > o.xDomain[0] && o.nowX < o.xDomain[1]) {
    const xn = Math.round(x(o.nowX)) + 0.5;
    g.append("line").attr("x1", xn).attr("x2", xn).attr("y1", -6).attr("y2", h).attr("stroke", P.muted).attr("stroke-dasharray", "3 3");
    g.append("text").attr("class", "annot-muted").attr("x", xn).attr("y", -12).attr("text-anchor", "middle").text("today");
  }

  const line = d3.line().x((p) => x(p[0])).y((p) => y(p[1])).curve(d3.curveStepAfter);
  const plot = g.append("g").attr("pointer-events", "none");
  for (const s of [...series.filter((q) => !q.emph), ...series.filter((q) => q.emph)]) {
    plot.append("path").attr("d", line(s.pts)).attr("fill", "none").attr("stroke", s.color)
      .attr("stroke-width", s.emph ? 3 : 1.75).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    const end = s.pts[s.pts.length - 1];
    plot.append("circle").attr("cx", x(end[0])).attr("cy", y(end[1])).attr("r", s.emph ? 4.5 : 3)
      .attr("fill", s.color).attr("stroke", P.surface).attr("stroke-width", s.emph ? 2 : 1.5);
    if (s.emph && o.endLabel) {
      const left = x(end[0]) > 90;
      // the label goes on the side the line did not come from: below a falling line, above a rising one
      const earlier = valueAt(s.pts, x.invert(Math.max(0, x(end[0]) - 60)));
      const below = earlier && earlier[1] > end[1];
      plot.append("text").attr("class", "annot halo").attr("x", x(end[0]) + (left ? -9 : 9)).attr("y", y(end[1]) + (below ? 19 : -10))
        .attr("text-anchor", left ? "end" : "start").style("fill", P.ink).style("font-weight", 700).text(o.endLabel(end));
    }
  }

  // hover: a crosshair, a dot on every line it crosses, and one tooltip row per event
  const cross = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).attr("visibility", "hidden");
  const dots = g.append("g").attr("pointer-events", "none");
  const hide = () => { cross.attr("visibility", "hidden"); dots.selectAll("*").remove(); tooltip.hide(); };
  g.append("rect").attr("class", "hit").attr("width", w).attr("height", h)
    .on("pointermove", (ev) => {
      const xv = x.invert(d3.pointer(ev)[0]);
      const hits = series.map((s) => ({ s, p: xv <= s.pts[s.pts.length - 1][0] ? valueAt(s.pts, xv) : null })).filter((d) => d.p)
        .sort((a, b) => d3.descending(a.p[1], b.p[1]));
      if (!hits.length) return hide();
      cross.attr("visibility", "visible").attr("x1", x(xv)).attr("x2", x(xv));
      dots.selectAll("circle").data(hits).join("circle").attr("cx", x(xv)).attr("cy", (d) => y(d.p[1])).attr("r", 4)
        .attr("fill", (d) => d.s.color).attr("stroke", P.surface).attr("stroke-width", 1.5);
      tooltip.show(ev, {
        title: o.tipTitle(xv),
        rows: hits.map((d) => ({ label: d.s.label, value: (o.tipValue || ((p) => o.yFormat(p[1])))(d.p, d.s), color: d.s.color, mark: "line" })),
      });
    })
    .on("pointerleave", hide);
}
