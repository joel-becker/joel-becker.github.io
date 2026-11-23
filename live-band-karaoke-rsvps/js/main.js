// Entry point: load the numbers, draw every card, redraw on a theme change or a resize.
import { h } from "./ui.js?v=fdbdd6a9";
import * as S from "./sections.js?v=fdbdd6a9";

const CARDS = [S.overview, S.leadup, S.goingShare, S.launch, S.guestList, S.experience, S.standing, S.flow, S.crowdGoing, S.crowdMix, S.men, S.mix, S.venmoShare, S.venmoAmounts, S.replies, S.about];
let data = null;

function renderAll() {
  for (const draw of CARDS) {
    try {
      draw(data);
    } catch (err) {
      console.error(err);
    }
  }
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

async function init() {
  data = await (await fetch("data/rsvps.json", { cache: "no-cache" })).json();
  renderAll();
  let lastW = innerWidth, timer;
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; renderAll(); } }, 150);
  });
  setupTheme();
  setupNav();
}

init().catch((err) => {
  console.error(err);
  document.querySelector("main").prepend(h("div", { class: "notice" }, `Couldn't load the data: ${err.message}`));
});
