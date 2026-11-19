// Small UI building blocks: elements, cards with a table view, legends, tooltip.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Text with a smaller unit suffix: 250 <small>lb</small> */
export const withUnit = (value, unit) => [String(value), unit ? h("small", {}, ` ${unit}`) : null];

// ---------------------------------------------------------------- tooltip

const tipEl = () => document.getElementById("tooltip");

export const tooltip = {
  /** rows: [{label, value, color, mark: 'line'|'dot'|'none'}] */
  show(event, { title, rows = [], note }) {
    const el = tipEl();
    el.replaceChildren();
    if (title) el.append(h("div", { class: "tt-title" }, title));
    for (const r of rows) {
      const key = r.color
        ? h("span", { class: r.mark === "line" ? "tt-key" : "tt-dot", style: { background: r.color } })
        : null;
      el.append(h("div", { class: "tt-row" }, h("span", { class: "lab" }, key, r.label), h("span", { class: "v" }, r.value)));
    }
    if (note) el.append(h("div", { class: "tt-note" }, note));
    el.classList.add("show");
    this.move(event);
  },
  move(event) {
    const el = tipEl();
    const pad = 14;
    const { innerWidth: W, innerHeight: H } = window;
    const r = el.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + r.width > W - 8) x = event.clientX - r.width - pad;
    if (y + r.height > H - 8) y = event.clientY - r.height - pad;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  },
  hide() {
    tipEl().classList.remove("show");
  },
};

/** Keyboard/focus support: show a tooltip for an element using its bounding box. */
export function focusEvent(el) {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top };
}

// ---------------------------------------------------------------- cards

/**
 * Build a card into `el`. Returns { body, legend, setTable(columns, rows) }.
 * A "Table" toggle swaps the chart for an accessible data table.
 */
export function card(el, { title, sub, tools = [], table = true } = {}) {
  el.replaceChildren();
  const legend = h("div", { class: "legend" });
  const body = h("div", { class: "chart" });
  const tableBody = h("div", { class: "table-wrap", hidden: true });
  let showingTable = el.dataset.table === "1";
  const toggle = table
    ? h("button", { class: "tool", type: "button", "aria-pressed": String(showingTable), title: "Show the data as a table" }, "Table")
    : null;
  const head = h("div", { class: "card-head" },
    h("div", {}, h("h3", {}, title), sub ? h("p", { class: "sub" }, sub) : null),
    h("div", { class: "card-tools" }, ...tools, toggle));
  el.append(head, legend, body, tableBody);
  const apply = () => {
    body.hidden = showingTable;
    legend.hidden = showingTable || !legend.childElementCount;
    tableBody.hidden = !showingTable;
    toggle?.setAttribute("aria-pressed", String(showingTable));
  };
  toggle?.addEventListener("click", () => {
    showingTable = !showingTable;
    el.dataset.table = showingTable ? "1" : "";
    apply();
  });
  queueMicrotask(apply);
  return {
    body,
    legend,
    head,
    setTable(columns, rows) {
      tableBody.replaceChildren(dataTable(columns, rows));
    },
  };
}

/** columns: [{label, value: row => text, num?: bool}] */
export function dataTable(columns, rows, cls = "data") {
  const thead = h("thead", {}, h("tr", {}, columns.map((c) => h("th", { class: c.num ? "num" : null }, c.label))));
  const tbody = h("tbody", {}, rows.map((r) => h("tr", {}, columns.map((c) => h("td", { class: [c.num ? "num" : "", c.cls || ""].join(" ").trim() || null }, c.value(r))))));
  return h("table", { class: cls }, thead, tbody);
}

/** items: [{label, color, mark: 'sw'|'ln'|'dt', value}] */
export function legend(el, items) {
  el.replaceChildren(...items.map((it) =>
    h("span", { class: "key" }, h("span", { class: it.mark || "sw", style: { background: it.color } }), it.label,
      it.value != null ? h("span", { class: "val" }, it.value) : null)));
  el.hidden = !items.length;
}

export function segmented(el, options, value, onChange) {
  el.replaceChildren(...options.map((o) =>
    h("button", { type: "button", "aria-pressed": String(o.id === value), title: o.title || null, onclick: () => onChange(o.id) }, o.label)));
}

export function notice(el, text) {
  el.replaceChildren();
  if (!text) return;
  el.append(h("div", { class: "notice", role: "note" }, icon("clock"), h("span", {}, text)));
}

const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
export function icon(name, color = "currentColor", size = 14) {
  const span = document.createElement("span");
  span.style.display = "inline-flex";
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}
