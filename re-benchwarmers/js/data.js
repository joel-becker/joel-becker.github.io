// Turns site/data/team.json into the shape the sections read.
//
// The sections in js/sections/ are shared with the training log (~/projects/health-dashboard), so the shape is a
// contract (see CLAUDE.md, "The data the sections read"). Fields that start with an underscore may be missing:
// config.toml [public] can leave names out of team.json, and every card has to cope (it hides, or drops the name).
import { toDate } from "./state.js?v=fe5dbb801b";

export function prepare(raw) {
  const league = (raw.league || []).map((g) => {
    const r = { date: g.date, kickoff: g.kickoff, season: g.season, weekday: g.weekday, result: g.result, gf: g.gf, ga: g.ga,
      format: g.format, level: g.level, _date: toDate(g.date) };
    if (g.forfeit) r.forfeit = true;
    if (g.yes != null) r.yes = g.yes;
    if (g.team) r._team = g.team;
    if (g.opponent) r._opp = g.opponent;
    if (g.venue) r._venue = g.venue;
    if (g.lineup) { r._lineup = g.lineup; r._women = g.women || 0; r._dropins = g.dropins || []; }
    return r;
  });
  const squads = raw.squads || [];
  return {
    meta: raw.meta,
    // `me` is a display name to label "Me" on the player cards; nobody is singled out on the team's own page
    team: { name: raw.meta.team, names: raw.meta.team_names || [], me: null, private: false, always: raw.meta.always_listed || [], show: raw.meta.public || {} },
    _asOf: toDate(raw.meta.as_of),
    soccer: {
      league,
      standings: raw.standings || [],
      _squads: squads.length ? squads : undefined,
      _women: raw.women && raw.women.length ? new Set(raw.women) : undefined,
    },
  };
}
