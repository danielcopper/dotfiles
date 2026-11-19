// The top bar's order of things: the sources it toggles between, the
// contexts of each, one tab apiece, and the view a context shows. On Azure a
// context is a team, with its views (Sprint, Backlog), or a project's pull
// requests; on GitHub each view of views.json is one.

import { TEAM_VIEWS, githubViews } from "./config.js";

// The sources in the toggle's order.
export const SOURCES = [
  { id: "azure", name: "Azure" },
  { id: "github", name: "GitHub" },
];

// A team view's name, as the switch shows it.
export const teamViewName = (id) => TEAM_VIEWS.find((v) => v.id === id)?.name ?? id;

// The contexts of a source in a config, in views.json's order: { id, source,
// kind: "team" | "prs" | "view", name, … } (a team's fields, a project's, or
// the GitHub view as `view`).
export function contextsOf(config, source) {
  if (source === "azure") return config?.azure?.contexts ?? [];
  if (source === "github") return githubViews(config).map((v) => ({ id: `github:${v.id}`, source: "github", kind: "view", name: v.name, view: v }));
  return [];
}

// The sources of a config that have a context, in the toggle's order.
export const sourcesOf = (config) => SOURCES.filter((s) => contextsOf(config, s.id).length);

// The entry of `list` whose id is `id`, else the first; null in an empty
// list. A remembered choice that views.json no longer has falls back so.
export const pick = (list, id) => list.find((x) => x.id === id) ?? list[0] ?? null;

// The view a team context shows: the remembered one where it has it, else
// its first.
export const teamView = (context, remembered) => (context.views.includes(remembered) ? remembered : context.views[0]);

// The view a context shows (a team: its view `teamViewId`): a GitHub view
// as views.json has it, an Azure one { id, source: "azure", layout:
// "sprint" | "backlog" | "prs", name, context }. Its kind is viewKind(view).
export function viewOf(context, teamViewId) {
  if (context.kind === "view") return context.view;
  if (context.kind === "team") {
    return { id: `${context.id}:${teamViewId}`, source: "azure", layout: teamViewId, name: teamViewName(teamViewId), context };
  }
  return { id: context.id, source: "azure", layout: "prs", name: context.name, context };
}

// Every view of a config: one per context, one per view of a team.
export function viewsOf(config) {
  const contexts = SOURCES.flatMap((s) => contextsOf(config, s.id));
  return contexts.flatMap((c) => (c.kind === "team" ? c.views.map((v) => viewOf(c, v)) : [viewOf(c)]));
}
