// The top bar's order of things: the sources it toggles between and the
// contexts of each, one tab apiece. On Azure a context is a team, with its
// views (Sprint, Backlog), or a project's pull requests; on GitHub each view
// of views.json is one.

import { githubViews } from "./config.js";

// The sources in the toggle's order.
export const SOURCES = [
  { id: "azure", name: "Azure" },
  { id: "github", name: "GitHub" },
];

// A team context's views by name, as its switch shows them.
export const TEAM_VIEW_NAMES = { sprint: "Sprint", backlog: "Backlog" };

// The contexts of a source in a config, in views.json's order: { id, source,
// kind: "team" | "prs" | "view", name, … } (a team's fields, a project's, or
// the GitHub view as `view`).
export function contextsOf(config, source) {
  if (source === "azure") {
    return (config?.azure?.contexts ?? []).map((c) => ({ ...c, name: c.kind === "team" ? c.team : `PRs · ${c.project}` }));
  }
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

// What an Azure context shows while its view is not there yet.
export function placeholder(context, view) {
  if (context.kind === "prs") return "PR-Ansicht folgt";
  return view === "backlog" ? "Backlog folgt" : "Sprint-Ansicht folgt";
}
