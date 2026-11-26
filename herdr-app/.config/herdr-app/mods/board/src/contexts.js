// The top bar's order of things: the contexts it switches between, grouped
// by their source, the tabs of each, and the view a tab shows.

import { TEAM_VIEWS } from "./config.js";
import { viewDefaults } from "./kinds/index.js";

// A team view's name, as the switch shows it.
export const teamViewName = (id) => TEAM_VIEWS.find((v) => v.id === id)?.name ?? id;

// The id of a GitHub view's tab.
export const githubTabId = (viewId) => `github:${viewId}`;

const githubTab = (v) => ({ id: githubTabId(v.id), source: "github", kind: "view", name: v.name, view: v });

// The sources in the switch's order, each with its contexts in views.json's.
export const SOURCES = [
  {
    id: "github",
    name: "GitHub",
    contexts: (config) => (config?.github?.contexts ?? []).map((c) => ({ id: `github:${c.owner}`, name: c.owner, tabs: c.views.map(githubTab) })),
  },
  {
    id: "azure",
    name: "Azure",
    contexts: (config) => (config?.azure?.contexts ?? []).map((c) => ({ id: `azure:${c.project}`, name: c.project, tabs: c.tabs })),
  },
];

// The contexts of a config, in the switch's order: { id, source, name,
// tabs }, a tab { id, source, kind: "team" | "prs" | "view", name, … } (a
// team's fields, a project's, or the GitHub view as `view`).
export const contextsOf = (config) => SOURCES.flatMap((s) => s.contexts(config).map((c) => ({ ...c, source: s.id })));

// Whether a tab has a switch between views: a team with more than one.
export const hasViewSwitch = (tab) => tab?.kind === "team" && tab.views.length > 1;

// The hint line's name for a team's switch: its views' names, "Sprint/Backlog".
export const viewSwitchHint = (tab) => tab.views.map(teamViewName).join("/");

// The index `by` places on from `at` in a list `length` long, round past
// its end to its start and back: the next or previous tab, context or view.
export const stepIndex = (length, at, by) => (at + by + length) % length;

// The index in `list` of `shown` (by its id), -1 for none: the shown tab
// among the tabs, the shown context among the contexts.
export const shownIndex = (list, shown) => list.findIndex((x) => x.id === shown?.id);

// The view a team tab shows after `shown`, one of its views.
export const teamViewAfter = (tab, shown) => tab.views[stepIndex(tab.views.length, tab.views.indexOf(shown), 1)];

// The entry of `list` whose id is `id`, else the first; null in an empty
// list. A remembered choice that views.json no longer has falls back so.
export const pick = (list, id) => list.find((x) => x.id === id) ?? list[0] ?? null;

// The view a team tab shows: the remembered one where it has it, else its
// first.
export const teamView = (tab, remembered) => (tab.views.includes(remembered) ? remembered : tab.views[0]);

// The view a tab shows (a team: its view `teamViewId`): a GitHub view as
// views.json has it, an Azure one { id, source: "azure", layout: "sprint" |
// "backlog" | "prs", name, tab, hide, start }. Its kind is viewKind(view).
export function viewOf(tab, teamViewId) {
  if (tab.kind === "view") return tab.view;
  if (tab.kind === "team") {
    return { id: `${tab.id}:${teamViewId}`, source: "azure", layout: teamViewId, name: teamViewName(teamViewId), tab, ...viewDefaults() };
  }
  return { id: tab.id, source: "azure", layout: "prs", name: tab.name, tab, ...viewDefaults() };
}

// Every view of a context or a config: one per tab, one per view of a
// team.
export const contextViews = (context) => context.tabs.flatMap((t) => (t.kind === "team" ? t.views.map((v) => viewOf(t, v)) : [viewOf(t)]));
export const viewsOf = (config) => contextsOf(config).flatMap(contextViews);

// The first context of `source`, which a source alone names.
export const firstContextOf = (contexts, source) => contexts.find((c) => c.source === source) ?? null;

// While `complete` is false (views.json has problems), a key that names no
// context stays, and so does a source whose tab names none.
export function shownContextMoves(contexts, get, complete) {
  const set = [];
  const gone = new Set();
  const view = get("view");
  const before = typeof view === "string" ? { source: "github", "tab:github": githubTabId(view) } : {};
  const old = (key) => get(key) ?? before[key] ?? null;
  const contextOf = (tab) => contexts.find((c) => c.tabs.some((t) => t.id === tab)) ?? null;
  const move = (key, context, to, value) => {
    if (context && get(to) === null) set.push([to, value]);
    if (context || complete) gone.add(key);
  };
  for (const s of SOURCES) {
    const tab = old(`tab:${s.id}`);
    const context = tab === null ? null : contextOf(tab);
    if (tab !== null) move(`tab:${s.id}`, context, `tab:${context?.id}`, tab);
  }
  const source = old("source");
  const tab = source === null ? null : old(`tab:${source}`);
  const named = tab === null ? null : contextOf(tab);
  if (source !== null && (complete || tab === null || named)) {
    const context = (named?.source === source ? named : null) ?? firstContextOf(contexts, source);
    move("source", context, "context", context?.id);
  }
  const remove = [...gone].filter((key) => get(key) !== null);
  if (Object.keys(before).length && Object.keys(before).every((key) => get(key) !== null || gone.has(key))) remove.push("view");
  return { set, remove };
}
