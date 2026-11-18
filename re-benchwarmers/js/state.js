// Global state: data, selected period and units. Every section re-renders on change.

export const state = {
  data: null,
  period: "all",
  units: { weight: "lb", distance: "km" },
};

const subscribers = new Set();
export const subscribe = (fn) => subscribers.add(fn);

export function setState(patch) {
  Object.assign(state, patch);
  try {
    localStorage.setItem("se-units", JSON.stringify(state.units));
  } catch (e) { /* private mode */ }
  const hash = state.period === "all" ? "" : `#p=${state.period}`;
  if (hash !== location.hash && (hash || location.hash.startsWith("#p="))) {
    history.replaceState(null, "", hash || location.pathname);
  }
  subscribers.forEach((fn) => fn());
}

export function restoreState() {
  try {
    const u = JSON.parse(localStorage.getItem("se-units"));
    if (u && u.weight && u.distance) state.units = u;
  } catch (e) { /* ignore */ }
  const m = location.hash.match(/^#p=(\w+)$/);
  if (m) state.period = m[1];
}

// ---------------------------------------------------------------- dates

const dateCache = new Map();
export function toDate(s) {
  let d = dateCache.get(s);
  if (!d) {
    const [y, m, day] = s.split("-").map(Number);
    d = new Date(y, m - 1, day);
    dateCache.set(s, d);
  }
  return d;
}
export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------- periods

export function periods(data) {
  const asOf = toDate(data.meta.as_of);
  const first = toDate(data.meta.first || data.meta.strong.first);
  const out = [
    { id: "all", label: "All time", start: first, end: asOf },
    { id: "12m", label: "Last 12 months", short: "12 mo", start: d3.timeDay.offset(asOf, -364), end: asOf },
  ];
  for (let y = asOf.getFullYear(); y >= first.getFullYear(); y--) {
    out.push({ id: `y${y}`, label: String(y), start: new Date(y, 0, 1), end: y === asOf.getFullYear() ? asOf : new Date(y, 11, 31), year: y });
  }
  return out.map((p) => ({ ...p, startIso: iso(p.start), endIso: iso(p.end) }));
}

export function currentPeriod() {
  const ps = periods(state.data);
  return ps.find((p) => p.id === state.period) || ps[0];
}

/** The same-length period immediately before p (for deltas), or null for "all". */
export function previousPeriod(p) {
  if (p.id === "all") return null;
  if (p.year) {
    const span = d3.timeDay.count(p.start, p.end);
    const start = new Date(p.year - 1, 0, 1);
    const end = d3.timeDay.offset(start, span);
    const partial = p.end < new Date(p.year, 11, 31);
    return { start, end, startIso: iso(start), endIso: iso(end), label: partial ? `${p.year - 1} to date` : String(p.year - 1) };
  }
  const end = d3.timeDay.offset(p.start, -1);
  const start = d3.timeDay.offset(end, -364);
  return { start, end, startIso: iso(start), endIso: iso(end), label: "previous 12 months" };
}

export const inPeriod = (dateStr, p) => dateStr >= p.startIso && dateStr <= p.endIso;
export const filterPeriod = (rows, p, key = "date") => rows.filter((r) => inPeriod(r[key], p));

/** Bin by month when the period is long, by week otherwise. */
export function binInterval(p) {
  return d3.timeMonth.count(p.start, p.end) > 20 ? d3.timeMonth : d3.timeMonday;
}

/** "YYYY-MM" -> Date (first of the month). Used by the Body clock section. */
export const toMonth = (s) => d3.timeParse("%Y-%m")(String(s).slice(0, 7));
