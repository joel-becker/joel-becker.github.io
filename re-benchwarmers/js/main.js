// Entry point: load the team's data, wire the controls, draw every section.
import { state, setState, subscribe, restoreState, periods, currentPeriod } from "./state.js?v=e2d29b3696";
import { segmented, h } from "./ui.js?v=e2d29b3696";
import { prepare } from "./data.js?v=e2d29b3696";
import * as F from "./format.js?v=e2d29b3696";
import * as overview from "./overview.js?v=e2d29b3696";
import * as about from "./about.js?v=e2d29b3696";
import * as league from "./sections/league.js?v=e2d29b3696";
import * as snake from "./sections/snake.js?v=e2d29b3696";
import * as standings from "./sections/standings.js?v=e2d29b3696";
import * as playoffs from "./sections/playoffs.js?v=e2d29b3696";
import * as lineups from "./sections/lineups.js?v=e2d29b3696";
import * as nights from "./sections/nights.js?v=e2d29b3696";
import * as squads from "./sections/squads.js?v=e2d29b3696";

const SECTIONS = [overview, league, snake, standings, playoffs, lineups, nights, squads, about];

function renderControls() {
  const ps = periods(state.data);
  segmented(document.getElementById("period-toggle"), ps.map((p) => ({ id: p.id, label: p.short || p.label })), state.period,
    (id) => setState({ period: id }));
  const p = currentPeriod();
  document.getElementById("period-range").textContent = `${F.fmtDate(p.start)} – ${F.fmtDate(p.end)}`;
}

function renderAll() {
  const p = currentPeriod();
  for (const s of SECTIONS) {
    try {
      s.render(state.data, p);
    } catch (err) {
      console.error(err);
    }
  }
  // a section whose cards are all hidden (names left out of the data) goes too, and the rest are renumbered
  document.querySelectorAll("main section.block").forEach((sec) => {
    const cards = [...sec.querySelectorAll(".card")];
    sec.hidden = cards.length > 0 && cards.every((c) => c.hidden);
    const link = document.querySelector(`.nav a[href="#${sec.id}"]`);
    if (link) link.hidden = sec.hidden;
  });
  [...document.querySelectorAll("main section.block:not([hidden]) [data-num]")].forEach((el, i) => { el.textContent = String(i + 1).padStart(2, "0"); });
}

function setupTheme() {
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("se-theme", root.dataset.theme); } catch (e) { /* ignore */ }
    renderAll();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderAll());
}

function setupNav() {
  const links = [...document.querySelectorAll(".nav a")];
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${e.target.id}`));
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main section").forEach((s) => obs.observe(s));
}

function debounce(fn, ms) {
  let t;
  return () => { clearTimeout(t); t = setTimeout(fn, ms); };
}

async function init() {
  const raw = await (await fetch("data/team.json", { cache: "no-cache" })).json();
  state.data = prepare(raw);
  // config.toml [public] player_comparisons = false: the with/without cards are not drawn at all
  if (state.data.team.show.player_comparisons === false) {
    for (const id of ["ppg-pair-card", "ppg-diff-card", "gd-pair-card", "gd-diff-card"]) document.getElementById(id)?.remove();
  }
  restoreState();
  if (!periods(state.data).some((p) => p.id === state.period)) state.period = "all";
  renderControls();
  renderAll();
  subscribe(() => { renderControls(); renderAll(); });
  let lastW = innerWidth;
  addEventListener("resize", debounce(() => { if (innerWidth !== lastW) { lastW = innerWidth; renderAll(); } }, 150));
  setupTheme();
  setupNav();
}

init().catch((err) => {
  console.error(err);
  document.querySelector("main").prepend(h("div", { class: "notice" }, `Couldn't load the data: ${err.message}`));
});
