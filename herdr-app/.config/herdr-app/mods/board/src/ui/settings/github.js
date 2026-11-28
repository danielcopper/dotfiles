// The settings page's topic of a GitHub context: its projects with their
// views, its Issues tab, its PR tab and the PR sections all GitHub PR tabs
// share.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SECTION_TONES, foldedName, repoShortName, report } from "../../shared.js";
import { GITHUB_ORDER, hidePath, repoHidePath, sharedSectionsProblems } from "../../config.js";
import { ORIGIN } from "../../settings.js";
import { orderedViews, viewsOfTab } from "../../contexts.js";
import { toggledHidden } from "../../kinds/board.js";
import { hidesRepo, toggledRepos } from "../../kinds/list.js";
import { chip, toneChip } from "../helpers.js";
import {
  LATER, WHOLE, baseAt, block, choiceField, choiceParts, goneFromList, knobRow, line, wholeListChange, mono12, movedIn, muted, openChoice, openEdit, originOf, refuse, replacedAt,
  settingsOf, switchKnob, textEdit, title, withoutAt, write, writeWholeList,
} from "./knobs.js";

// The PR sections the page offers to add, each as views.json writes one
// (OWN_SEARCH: one written by hand).
export const PRESETS = [
  { name: "Alle offenen", query: "is:pr is:open archived:false" },
  { name: "Mir zugewiesen", query: "is:pr is:open archived:false assignee:@me" },
  { name: "Niemandem zugewiesen", query: "is:pr is:open archived:false no:assignee" },
];
export const OWN_SEARCH = "eigene Suche";

const LAYOUT_NAMES = { board: "Board", table: "Tabelle", roadmap: "Roadmap" };
const ORDER_CHOICES = [{ id: GITHUB_ORDER, name: "wie auf GitHub" }, { id: "own", name: "eigene" }];
const SECTION_TONE_NAMES = Object.keys(SECTION_TONES);
const SECTIONS_PATH = ["sources", "github", "prs", "sections"];
const SHARED_LIMIT_PATH = ["sources", "github", "prs", "limit"];

const ownerKey = (owner, issues) => `${issues ? "issues" : "all"}:${foldedName(owner)}`;

// The owner's repos: those its Issues tab reads (`issues`), or all but the
// archived ones (OWNER_REPOS_QUERY).
export function readOwner(b, owner, issues, cx) {
  const owners = settingsOf(b).owners;
  const key = ownerKey(owner, issues);
  if (owners.has(key)) return;
  const entry = { state: "loading", org: null, repos: [], error: null };
  owners.set(key, entry);
  cx.spawn(async (cx) => {
    try {
      const { org, repos } = await b.sources.github.ownerRepos(owner, { issues });
      Object.assign(entry, { state: "ready", org, repos });
    } catch (e) {
      Object.assign(entry, { state: "error", error: report(e) });
    }
    cx.notify();
  });
}

const NOT_ASKED = { state: "unasked", org: null, repos: [], error: null };
const ownerOf = (b, owner, issues) => settingsOf(b).owners.get(ownerKey(owner, issues)) ?? NOT_ASKED;

// The repos a GitHub tab of `owner` may show (readOwner's, `issues` as
// there), then those `entry` turns off that are no longer the owner's; each
// with its name (short where it is the owner's) and whether `entry` turns
// it off.
function ownerRepoList(b, owner, issues, entry) {
  const repos = ownerOf(b, owner, issues).repos;
  const gone = entry.hideRepos.filter((r) => !repos.some((o) => foldedName(o) === foldedName(r)));
  return [...repos, ...gone].map((repo) => ({ repo, name: foldedName(repo.split("/")[0]) === foldedName(owner) ? repoShortName(repo) : repo, hidden: hidesRepo(entry, repo) }));
}

// A board view's column switches: its columns as its data has them (those
// that can be hidden), then the hidden ones it does not have.
function columnSwitches(b, view) {
  const columns = (b.views[view.id]?.data?.columns ?? []).filter((c) => c.target);
  const names = columns.map((c) => c.name);
  return [
    ...columns.map((c) => ({ name: c.name, on: !view.hide.includes(c.name), column: c })),
    ...view.hide.filter((n) => !names.includes(n)).map((n) => ({ name: n, on: false, column: { name: n, target: true } })),
  ];
}

function viewKnob(b, tab, view, meta, i, own) {
  const path = hidePath(view);
  const layout = LAYOUT_NAMES[meta.layout] ?? meta.layout;
  const knob = { id: `view-${tab.id}-${meta.number}`, name: meta.name, d: i + 1, key: `views.${meta.number}.hide`, path, top: true };
  knob.value = (t, mono) => h_flex().gap(6).items_center().child(chip(t, layout)).when(Boolean(meta.filter), (el) => el.child(div().text_size(12).text_color(t.muted).child("Filter")).child(mono12(mono, meta.filter, t.foreground)));
  if (meta.layout === "board") {
    switchKnob(knob, columnSwitches(b, view), { hint: "Spalte", name: "Spalte ein/aus" }, (b, s, cx) => write(b, knob.id, [[path, toggledHidden(view, s.column)]], cx));
    const hidden = view.hide.join(", ");
    knob.was = !b.views[view.id]?.data?.columns
      ? "die Spalten zeigt das Board, sobald es die Ansicht gelesen hat"
      : originOf(b, knob) === ORIGIN.machine
        ? `${hidden ? `${hidden} ausgeblendet` : "keine ausgeblendet"} auf diesem Rechner · views.json: ${(baseAt(b, path) ?? []).join(", ") || "keine"} · u setzt zurück`
        : hidden ? `${hidden} ausgeblendet` : "keine ausgeblendet";
  } else {
    knob.origin = "";
    knob.was = meta.layout === "roadmap" ? "zeigt das Board als Tabelle: GitHubs API nennt keine Daten einer Roadmap" : "eine Tabelle blendet keine Spalten aus";
  }
  if (own) {
    const numbers = tab.views;
    const at = numbers.indexOf(meta.number);
    const orderPath = [...tab.entry.settingsPath, "switchOrder"];
    knob.move = { can: (by) => Boolean(movedIn(numbers, at, by)), run: (b, by, cx) => write(b, knob.id, [[orderPath, movedIn(numbers, at, by)]], cx) };
  }
  return knobRow(knob);
}

function projectRows(b, tab) {
  const entry = tab.entry;
  const own = Array.isArray(entry.switchOrder);
  const path = [...entry.settingsPath, "switchOrder"];
  const order = { id: `order-${tab.id}`, name: "Reihenfolge", key: "switchOrder", path, was: "„eigene“: J/K schiebt die markierte Ansicht; eine neue Ansicht von GitHub kommt ans Ende" };
  Object.assign(order, choiceParts(order, {
    field: `setting-order-${tab.id}`,
    entries: () => ORDER_CHOICES,
    current: () => (own ? "own" : GITHUB_ORDER),
    take: (b, row, cx) => {
      if ((row.id === "own") === own) return;
      if (row.id === "own" && !tab.meta) return refuse(b, order.id, ["„eigene“ geht, sobald das Board die Ansichten des Projects gelesen hat"], cx);
      write(b, order.id, [[path, row.id === "own" ? [...tab.views] : GITHUB_ORDER]], cx);
    },
    placeholder: "Filter: Reihenfolge",
  }));
  order.value = (t) => choiceField(b, t, order, own ? "eigene" : "wie auf GitHub", null, 200);
  const views = orderedViews(tab.meta?.views ?? [], entry.switchOrder);
  const knobs = views.map((meta, i) => viewKnob(b, tab, viewsOfTab(tab).find((v) => v.address?.view === meta.number), meta, i, own));
  return block(
    title(`${tab.name.toUpperCase()} · ANSICHTEN, in dieser Reihenfolge im Schalter v`, `projects.${entry.number}`),
    [knobRow(order), ...(knobs.length ? knobs : [line("die Ansichten zeigt das Board, sobald es das Project gelesen hat")])],
  );
}

function nameKnob(tab, entry) {
  const knob = { id: `name-${tab.id}`, name: "Name", key: "name", path: [...entry.settingsPath, "name"], value: () => entry.name };
  knob.enter = textEdit(knob, knob.path, { value: entry.name });
  return knobRow(knob);
}

function issuesRows(b, tab, owner) {
  const entry = tab.entry;
  const read = ownerOf(b, owner, true);
  const shown = { id: `repos-${tab.id}`, name: "Repos", key: "hideRepos", path: repoHidePath(entry), top: true, loading: read.state === "loading" };
  const items = ownerRepoList(b, owner, true, entry).map((r) => ({ name: r.name, on: !r.hidden, repo: r.repo }));
  switchKnob(shown, items, { hint: "Repo", name: "Repo ein/aus" }, (b, s, cx) => write(b, shown.id, [[shown.path, toggledRepos(entry.hideRepos, s.repo)]], cx));
  shown.warn = read.state === "error" ? [read.error] : [];
  shown.was = read.state === "ready" ? `${read.repos.length} Repos von ${owner} mit Issues, aus GitHub gelesen · ein ausgeschaltetes fehlt in der Suche · auch über R` : null;
  const limit = { id: `limit-${tab.id}`, name: "Höchstens", key: "limit", path: [...entry.settingsPath, "limit"], value: () => `${entry.limit} Issues je Ansicht` };
  limit.enter = textEdit(limit, limit.path, { value: String(entry.limit), number: true, unit: "Issues", width: 120 });
  return block(title("ISSUES-TAB", "issues"), [nameKnob(tab, entry), knobRow(shown), knobRow(limit)]);
}

function prsTabRows(b, tab, owner) {
  const entry = tab.view;
  const read = ownerOf(b, owner, false);
  const path = repoHidePath(entry);
  const now = () => b.tabById(tab.id)?.view ?? entry;
  const shown = { id: `repos-${tab.id}`, name: "Repos", key: "hideRepos", path, go: true, loading: read.state === "loading" };
  const off = read.repos.filter((r) => hidesRepo(entry, r)).length;
  shown.value = (t) => muted(t, read.state !== "ready" ? "" : off ? `${read.repos.length - off} von ${read.repos.length} Repos von ${owner} an` : `alle ${read.repos.length} Repos von ${owner} an`);
  shown.warn = read.state === "error" ? [read.error] : [];
  shown.was = "Enter öffnet die Liste wie R: ✓, gezeigt / ausgeblendet";
  shown.enter = {
    name: "Repos…",
    hint: "Liste",
    run: (b, cx) => b.openSettingRepos({
      row: shown.id,
      name: shown.name,
      rows: () => ownerRepoList(b, owner, false, now()).map((r) => ({ id: r.repo, name: r.name, hidden: r.hidden })),
      read: () => ownerOf(b, owner, false),
      empty: `Keine Repos von ${owner}`,
      toggle: (b, repo, cx) => write(b, shown.id, [[path, toggledRepos(now().hideRepos, repo)]], cx),
    }, cx),
  };
  return block(title("PR-TAB · der letzte Tab", "prs"), [nameKnob(tab, entry), knobRow(shown)]);
}

function sectionRows(b, prsTab) {
  const change = (b, id, edit, cx) => writeWholeList(b, id, SECTIONS_PATH, sharedSectionsProblems, edit, cx);
  const origin = b.origin(SECTIONS_PATH);
  const knobs = prsTab.view.sections.map((s, i) => {
    // By its place: two sections may share a name.
    const knob = { id: `section-${i}`, name: s.name, d: i + 1, key: "name · query · tone", path: SECTIONS_PATH, mono: true, stripe: SECTION_TONES[s.tone] };
    knob.value = (t, mono) => h_flex().gap(6).items_center().child(mono12(mono, s.query, t.foreground)).child(toneChip(t, s.tone, SECTION_TONES[s.tone]));
    knob.was = origin === ORIGIN.machine ? "u setzt alle Abschnitte auf views.json zurück" : WHOLE;
    knob.wasMarked = true;
    knob.enter = {
      name: "Ändern…",
      hint: "ändern",
      run: (b, cx) => openEdit(b, knob, [{ id: "name", value: s.name, width: 200 }, { id: "query", value: s.query }], (b, texts) => {
        const proposal = wholeListChange(b, SECTIONS_PATH, sharedSectionsProblems, (list) =>
          (list[i]?.name === s.name && list[i]?.query === s.query ? replacedAt(list, i, { ...list[i], name: texts.name.trim(), query: texts.query.trim() }) : null));
        return proposal ?? { refused: [goneFromList(s.name)] };
      }, cx),
    };
    knob.side = {
      ...choiceParts(knob, {
        field: `setting-tone-${i}`,
        entries: () => SECTION_TONE_NAMES.map((n) => ({ id: n, name: n })),
        current: () => s.tone,
        take: (b, row, cx) => row.id !== s.tone && change(b, knob.id, (list) => replacedAt(list, i, { ...list[i], tone: row.id }), cx),
        placeholder: "Filter: Farbe",
      }).side,
      hint: "Farbe",
    };
    knob.remove = { name: "Abschnitt entfernen", run: (b, cx) => change(b, knob.id, (list) => withoutAt(list, i), cx) };
    knob.move = {
      can: (by) => Boolean(movedIn(prsTab.view.sections, i, by)),
      run: (b, by, cx) => change(b, knob.id, (list) => movedIn(list, i, by), cx),
      to: (by) => `section-${i + by}`,
    };
    return knobRow(knob);
  });
  const add = { id: "add-section", text: `Abschnitt hinzufügen … Vorlagen: ${[...PRESETS.map((p) => p.name), OWN_SEARCH].join(" · ")}`, field: "setting-presets" };
  const ownSearch = (b, cx) =>
    openEdit(b, { id: add.id, name: OWN_SEARCH }, [{ id: "name", placeholder: "Name", width: 200 }, { id: "query", placeholder: "Suche, etwa is:pr is:open archived:false" }], (b, texts) =>
      wholeListChange(b, SECTIONS_PATH, sharedSectionsProblems, (list) => [...list, { name: texts.name.trim(), query: texts.query.trim() }]), cx);
  add.run = (b, cx) =>
    openChoice(b, { id: add.id, name: "Abschnitt hinzufügen" }, add.field, {
      entries: () => [...PRESETS.map((p) => ({ id: p.name, name: p.name, aside: [p.query] })), { id: OWN_SEARCH, name: OWN_SEARCH }],
      current: () => PRESETS[0].name,
      value: () => "",
      take: (b, row, cx) => {
        const preset = PRESETS.find((p) => p.name === row.id);
        if (preset) change(b, add.id, (list) => [...list, { ...preset }], cx);
        else ownSearch(b, cx);
      },
      placeholder: "Filter: Vorlage",
      width: 440,
    }, cx);
  const limit = { id: "prs-limit", name: "Je Suche höchstens", key: SHARED_LIMIT_PATH.join("."), path: SHARED_LIMIT_PATH, value: () => `${prsTab.view.limit} PRs` };
  limit.enter = textEdit(limit, SHARED_LIMIT_PATH, { value: String(prsTab.view.limit), number: true, unit: "PRs", width: 120 });
  return block(title("PR-ABSCHNITTE · für alle GitHub-PR-Tabs, in dieser Reihenfolge", SECTIONS_PATH.join(".")), knobs, add, [knobRow(limit)]);
}

export function githubRows(b, topic) {
  const context = topic.context;
  const owner = context.name;
  const owned = [true, false].map((issues) => ownerOf(b, owner, issues)).find((r) => r.state === "ready");
  const kind = !owned ? "GitHub-Konto" : owned.org ? "GitHub-Organisation" : "GitHub-Benutzer";
  const at = b.contexts().findIndex((c) => c.id === context.id) + 1;
  const projects = context.tabs.filter((t) => t.kind === "project");
  const issues = context.tabs.find((t) => t.kind === "issues");
  const prs = context.tabs.find((t) => t.kind === "view");
  const projectKnobs = projects.map((tab, i) => knobRow({
    id: `project-${tab.id}`, name: tab.name, d: i + 1, key: `projects.${tab.entry.number}`, nav: false, origin: "",
    value: (t) => h_flex().gap(6).items_center().child(chip(t, `Project ${tab.entry.number}`)).child(div().child(tab.meta ? `${tab.meta.views.length} ${tab.meta.views.length === 1 ? "Ansicht" : "Ansichten"}, Name und Filter von GitHub` : "noch nicht gelesen")),
  }));
  return [
    { row: "head", path: `GitHub › ${owner}`, title: owner, small: `${kind} · Kontext ${at} der Kopfzeile · Tabs: ${context.tabs.map((t) => t.name).join(", ")}` },
    ...block(title(`PROJECTS · ${projects.length}, je ein Tab`, "projects"), projectKnobs, { id: "add-project", text: `Project hinzufügen … (liest die Projects von ${owner} aus GitHub)`, run: null, later: LATER }),
    ...projects.flatMap((tab) => projectRows(b, tab)),
    ...(issues ? issuesRows(b, issues, owner) : []),
    ...(prs ? [...prsTabRows(b, prs, owner), ...sectionRows(b, prs)] : []),
  ];
}

// What a GitHub context's topic reads while it shows: the owner's repos for
// its Issues tab and for its PR tab, and the saved state of its projects'
// views, whose columns their switches show.
export function readGithubTopic(b, context, cx) {
  if (context.tabs.some((t) => t.kind === "issues")) readOwner(b, context.name, true, cx);
  if (context.tabs.some((t) => t.kind === "view")) readOwner(b, context.name, false, cx);
  for (const tab of context.tabs.filter((t) => t.kind === "project")) viewsOfTab(tab).forEach((v) => b.restore(v));
}
