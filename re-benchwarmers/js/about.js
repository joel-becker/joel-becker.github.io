// About: where the numbers come from and how to read them.
import { h, card } from "./ui.js";
import * as F from "./format.js";

export function render(data) {
  const el = document.getElementById("about-card");
  if (!el) return;
  const show = data.team.show || {};
  const c = card(el, { title: "Where this comes from", table: false });
  const withLineup = data.soccer.league.filter((r) => r._lineup).length;
  const items = [
    ["Results, tables and squads", `Copied from the league's own site (Volo Sports) for the ${F.int(data.soccer.league.length)} league games this team has played, ` +
      `under every name it has had${data.team.names.length > 1 ? ` (${data.team.names.join(", ")})` : ""}. League tables are the league's own and include play-off games.`],
    ["Who said yes", `For ${F.int(withLineup)} of the games the league's site records who said they were coming. That is an RSVP, not a register: ` +
      "people say yes and don't turn up, and turn up without saying yes. Every “said yes” figure on this page should be read that way."],
    ["Player comparisons", "The Players section compares the games someone said yes to with the games they missed in the seasons they were in. " +
      "The groups are small, the other nine people on the pitch change too, and who is free on which night is not random. It is a curiosity, not a rating."],
    ["Lower cut-offs for women", "This is a coed league with far fewer women than men on each squad, so wherever a card needs a minimum number of seasons or shared games to list someone, " +
      "women need half as many. The league's own M/F marks decide who that applies to."],
    ["Names", show.names === "hidden" ? "Team-mates appear as Player A, Player B and so on."
      : show.names === "first" ? "Team-mates appear by first name." : "Team-mates appear as the league shows them: first name and last initial."],
  ];
  c.body.append(h("dl", { class: "about-list" }, ...items.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])));
}
