// Units and number/date formatting. Data is stored in lb and km.
import { state, toDate } from "./state.js?v=69bd236a68";

const LB_TO_KG = 0.45359237;
const KM_TO_MI = 1 / 1.609344;

export const wUnit = () => state.units.weight;
export const dUnit = () => state.units.distance;
export const weight = (lb) => (lb == null ? null : state.units.weight === "kg" ? lb * LB_TO_KG : lb);
export const dist = (km) => (km == null ? null : state.units.distance === "mi" ? km * KM_TO_MI : km);
/** seconds per km -> seconds per current distance unit */
export const paceS = (sPerKm) => (sPerKm == null ? null : state.units.distance === "mi" ? sPerKm / KM_TO_MI : sPerKm);

const comma = d3.format(",");
export const int = (n) => (n == null ? "–" : comma(Math.round(n)));
export const num = (n, digits = 1) => (n == null ? "–" : d3.format(`,.${digits}f`)(n));
export const pct = (x, digits = 0) => (x == null ? "–" : `${(x * 100).toFixed(digits)}%`);

export function fmtWeight(lb, { unit = true, digits = 0 } = {}) {
  if (lb == null) return "–";
  const v = weight(lb);
  const step = state.units.weight === "kg" ? 0.5 : 1;
  const r = digits ? v : Math.round(v / step) * step;
  return `${digits ? num(r, digits) : (r % 1 ? r.toFixed(1) : comma(r))}${unit ? ` ${wUnit()}` : ""}`;
}

export function fmtDist(km, { unit = true, digits = 1 } = {}) {
  if (km == null) return "–";
  return `${num(dist(km), digits)}${unit ? ` ${dUnit()}` : ""}`;
}

export function fmtClock(seconds) {
  if (seconds == null || !isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
export const fmtPace = (sPerKm, unit = true) => (sPerKm == null ? "–" : `${fmtClock(paceS(sPerKm))}${unit ? ` /${dUnit()}` : ""}`);

export function fmtMinutes(min) {
  if (min == null) return "–";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

const fDay = d3.timeFormat("%-d %b %Y");
const fDayShort = d3.timeFormat("%-d %b");
const fMonth = d3.timeFormat("%b %Y");
const fWeek = d3.timeFormat("Week of %-d %b %Y");
export const fmtDate = (s) => (s ? fDay(typeof s === "string" ? toDate(s) : s) : "–");
export const fmtDateShort = (s) => (s ? fDayShort(typeof s === "string" ? toDate(s) : s) : "–");
export const fmtMonth = (d) => fMonth(d);
export const fmtBin = (d, interval) => (interval === d3.timeMonth ? fMonth(d) : fWeek(d));

/** compact number for tiles: 1,284 / 12.9K */
export function compact(n) {
  if (n == null) return "–";
  if (Math.abs(n) >= 10000) return d3.format(".3~s")(n).replace("k", "K");
  return comma(Math.round(n));
}

export const CAT_LABEL = { lift: "Lifting", run: "Running", soccer: "Soccer", other: "Other", cardio: "Other cardio", mobility: "Mobility" };
export const CAT_VAR = { lift: "var(--lift)", run: "var(--run)", soccer: "var(--soccer)", other: "var(--other)", cardio: "var(--other)", mobility: "var(--other)" };
export const catGroup = (c) => (c === "cardio" || c === "mobility" ? "other" : c);

/** minutes after midnight (may be negative or over 1440 for times around midnight) -> "00:23" */
export function clock(min) {
  if (min == null) return "–";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
/** minutes -> "7h 29m" */
export function hours(min) {
  if (min == null) return "–";
  const hh = Math.floor(min / 60), mm = Math.round(min % 60);
  return hh ? `${hh}h ${String(mm).padStart(2, "0")}m` : `${mm} min`;
}
