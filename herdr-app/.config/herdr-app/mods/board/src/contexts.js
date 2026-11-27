// The top bar's order of things: the contexts it switches between, grouped
// by their source, the tabs of each, and the view a tab shows.

import { TEAM_VIEWS, githubTabId } from "./config.js";
import { viewDefaults } from "./kinds/index.js";

// A team view's name, as the switch shows it.
export const teamViewName = (id) => TEAM_VIEWS.find((v) => v.id === id)?.name ?? id;

export const ISSUE_VIEWS = [
  { id: "open", name: "Offen" },
  { id: "closed", name: "Geschlossen" },
];
const issueViewName = (id) => ISSUE_VIEWS.find((v) => v.id === id)?.name ?? id;

// What the board knows of a project from its last read, by its tab's id
// (`known.get(id)`: { title, url, views: [{ number, name, layout, filter }]
// in GitHub's order, layout as parseGithubProject names it (viewLayout:
// "board", "table", "roadmap" or another's name) }, null before any):
// Board.learnProject keeps it.
export const NO_PROJECTS = { get: () => null };

// Where the store keeps what the board knows of a project, by its tab's id,
// and the keys of the projects whose tabs (`tabs`, their ids) are gone.
export const PROJECT_PREFIX = "project:";
export const projectKey = (id) => `${PROJECT_PREFIX}${id}`;
export const goneProjects = (keys, tabs) => keys.filter((k) => k.startsWith(PROJECT_PREFIX) && !tabs.has(k.slice(PROJECT_PREFIX.length)));

// A project's tab, its views.json entry as `entry`: named as GitHub names
// the project, its views GitHub's (their numbers) once the board knows
// them.
function projectTab(entry, known) {
  const meta = known.get(entry.id);
  return { id: entry.id, source: "github", kind: "project", name: meta?.title ?? `Projekt ${entry.number}`, entry, meta, views: (meta?.views ?? []).map((v) => v.number) };
}

// A PR tab: its entry is its view, as GitHub's "list".
const githubPrsTab = (entry) => ({ id: githubTabId(entry.id), source: "github", kind: "view", name: entry.name, view: entry });

const issuesTab = (entry) => ({ id: entry.id, source: "github", kind: "issues", name: entry.name, entry, views: ISSUE_VIEWS.map((v) => v.id) });

const GITHUB_TABS = { project: projectTab, issues: issuesTab, prs: githubPrsTab };
const githubTab = (entry, known) => GITHUB_TABS[entry.entryKind](entry, known);

// The sources in the switch's order, each with its contexts in views.json's.
export const SOURCES = [
  {
    id: "github",
    name: "GitHub",
    contexts: (config, known) => (config?.github?.contexts ?? []).map((c) => ({ id: `github:${c.owner}`, name: c.owner, tabs: c.tabs.map((t) => githubTab(t, known)) })),
  },
  {
    id: "azure",
    name: "Azure",
    contexts: (config) => (config?.azure?.contexts ?? []).map((c) => ({ id: `azure:${c.project}`, name: c.project, tabs: c.tabs })),
  },
];

// The contexts of a config, in the switch's order: { id, source, name,
// tabs }, a tab { id, source, kind (one of TAB_KINDS), name, … } (a team's
// fields, an Azure project's, a GitHub project's views.json entry as
// `entry` with what the board knows of it, `known`, as `meta`, an Issues
// tab's entry as `entry`, or the GitHub PR view as `view`).
export const contextsOf = (config, known = NO_PROJECTS) => SOURCES.flatMap((s) => s.contexts(config, known).map((c) => ({ ...c, source: s.id })));

// Whether a tab shows one of its own views (`views`), a kind with a
// storeKey; and whether it has a switch between them, more than one.
export const hasViews = (tab) => Boolean(TAB_KINDS[tab?.kind]?.storeKey);
export const hasViewSwitch = (tab) => hasViews(tab) && tab.views.length > 1;

export const tabViewName = (tab, id) => TAB_KINDS[tab.kind].viewName(tab, id);

export const tabViewKey = (tab) => `${TAB_KINDS[tab.kind].storeKey}:${tab.id}`;

// The hint line's name for a tab's switch: its views' names, "Sprint/Backlog".
export const viewSwitchHint = (tab) => tab.views.map((v) => tabViewName(tab, v)).join("/");

// The index `by` places on from `at` in a list `length` long, round past
// its end to its start and back: the next or previous tab, context or view.
export const stepIndex = (length, at, by) => (at + by + length) % length;

// The index in `list` of `shown` (by its id), -1 for none: the shown tab
// among the tabs, the shown context among the contexts.
export const shownIndex = (list, shown) => list.findIndex((x) => x.id === shown?.id);

// The view a team's or a project's tab shows after `shown`, one of its
// views.
export const tabViewAfter = (tab, shown) => tab.views[stepIndex(tab.views.length, tab.views.indexOf(shown), 1)];

// The entry of `list` whose id is `id`, else the first; null in an empty
// list. A remembered choice that views.json no longer has falls back so.
export const pick = (list, id) => list.find((x) => x.id === id) ?? list[0] ?? null;

// The view a team's or a project's tab shows: the remembered one where it
// has it, else its first (null for a project whose views are not known yet).
export const tabView = (tab, remembered) => (tab.views.includes(remembered) ? remembered : tab.views[0] ?? null);

// The id of the view that reads a project's views (projectView without
// one shown).
export const firstViewId = (tab) => `${tab.id}:first`;

// A project's view as the board shows it: { id, source: "github", layout,
// name, tab, address: { owner, number, view } (the project's and the
// view's number on GitHub), limit, start, hide (this view's hidden
// columns), settingsPath (the view's own, under the project's), owners },
// for `shown`, one of its tab's meta.views. Without one, the view whose
// read learns the project's views and then reads the view `wanted` (the
// one remembered, where the project still has it) or else the first: a
// board with address.view null that hides nothing and has no settings of
// its own (settingsPath null).
export function projectView(tab, shown, wanted = null) {
  const p = tab.entry;
  const common = { source: "github", tab, limit: p.limit, start: p.start, owners: p.owners };
  const address = (view) => ({ owner: p.owner, number: p.number, view });
  if (!shown) return { ...common, id: firstViewId(tab), layout: "board", name: tab.name, address: address(null), wanted, hide: [], settingsPath: null };
  const settingsPath = [...p.settingsPath, "views", String(shown.number)];
  return { ...common, id: `${tab.id}:${shown.number}`, layout: shown.layout, name: shown.name, address: address(shown.number), hide: p.views[shown.number]?.hide ?? [], settingsPath };
}

// Per kind of tab (a tab's `kind`): for one with views of its own, where
// the store keeps the one it shows (storeKey, tabViewKey) and a view's name
// (viewName: an Azure team's, an Issues tab's, a project's as GitHub names
// it); and the view it shows (viewOf, of its view `viewId` where it has
// views): a GitHub PR view as views.json has it ("view"), a project's
// (projectView), an Issues tab's { id, source: "github", layout: "issues",
// issueState ("open" or "closed"), name, tab, owner, limit, hideRepos,
// start, hide, settingsPath (its tab's), owners }, an Azure one { id,
// source: "azure", layout: "sprint" | "backlog" | "prs", name, tab, hide,
// start }. A view's kind is viewKind(view).
const TAB_KINDS = {
  team: {
    storeKey: "teamView",
    viewName: (_tab, id) => teamViewName(id),
    viewOf: (tab, viewId) => ({ id: `${tab.id}:${viewId}`, source: "azure", layout: viewId, name: teamViewName(viewId), tab, ...viewDefaults() }),
  },
  project: {
    storeKey: "projectView",
    viewName: (tab, id) => tab.meta?.views.find((v) => v.number === id)?.name ?? String(id),
    viewOf(tab, viewId) {
      const shown = tab.meta?.views.find((v) => v.number === viewId);
      return shown ? projectView(tab, shown) : projectView(tab, null, viewId ?? null);
    },
  },
  issues: {
    storeKey: "issuesView",
    viewName: (_tab, id) => issueViewName(id),
    viewOf(tab, viewId) {
      const { owner, limit, hideRepos, start, hide, settingsPath, owners } = tab.entry;
      return { id: `${tab.id}:${viewId}`, source: "github", layout: "issues", issueState: viewId, name: issueViewName(viewId), tab, owner, limit, hideRepos, start, hide, settingsPath, owners };
    },
  },
  view: { viewOf: (tab) => tab.view },
  prs: { viewOf: (tab) => ({ id: tab.id, source: "azure", layout: "prs", name: tab.name, tab, ...viewDefaults() }) },
};

export const viewOf = (tab, viewId) => TAB_KINDS[tab.kind].viewOf(tab, viewId);

// A project the board knows no views of has one view: the one that learns them.
export const viewsOfTab = (t) => (hasViews(t) && t.views.length ? t.views.map((v) => viewOf(t, v)) : [viewOf(t, null)]);
export const contextViews = (context) => context.tabs.flatMap(viewsOfTab);
export const viewsOf = (config, known = NO_PROJECTS) => contextsOf(config, known).flatMap(contextViews);

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
