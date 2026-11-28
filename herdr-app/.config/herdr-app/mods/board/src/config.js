// views.json: reading it with this machine's settings over it, what is
// wrong with them, and the start settings for an item.

import { BoardError, CONFIG_NAME, PAGE, SECTION_TONES, SECTION_TONE_ORDER, foldedName, isObject, isText, textList } from "./shared.js";
import { viewDefaults } from "./kinds/index.js";
import { ORIGIN, entryByName, mergeSettings, pathText, readSettings, valueAt, withSetting } from "./settings.js";

export const START_DEFAULTS = { agent: null, machine: null, message: "", review: "" };
const START_KEYS = Object.keys(START_DEFAULTS);
const REPO_KEYS = [...START_KEYS, "checkout"];
// Keys of a start that made a worktree or set the status: the agent's own
// skills do both.
const GONE = "gibt es nicht mehr: der Start öffnet eine Sitzung im Ordner des Repos, den Worktree legt der Agent an";
const GONE_START = ["branch", "worktree", "base"];
const GONE_OPEN = "gibt es nicht mehr: „Öffnen in“ im Startdialog wählt den Space";
const GONE_STATUS = "„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst";
const REPO_FOLDERS_PLACE = "die Repo-Ordner stehen jetzt oben in views.json unter „repoFolders“, für alle Quellen";
const GONE_CHECKOUT = "gibt es nicht mehr: ein Repo startet in seinem Ordner unter „repoFolders“ oder in dem, den „repos.<Besitzer/Repo>.checkout“ setzt";
const staleText = (where) => `solange es dasteht, gilt „${where}“ nicht`;
const STALE_START = staleText("start");
const STALE_VIEW_START = "solange es dasteht, fehlt der Tab";
const STALE_TEAM = "solange es dasteht, fehlt das Team";
const STALE_AZURE = "es gilt nicht, der Rest von „sources.azure“ schon";
const BLANK_CHECKOUT = "ist der Ordner des Repos (Text, nicht leer), etwa \"~/Repos/<Repo>\"";
const TOP_KEYS = ["refreshMinutes", "language", "start", "repoFolders", "repos", "sources"];

export const LANGUAGES = [{ id: "de", name: "Deutsch" }];
const LANGUAGE_DEFAULT = LANGUAGES[0].id;
const LANGUAGE_TEXT = `„language“ ist ${LANGUAGES.map((l) => `"${l.id}" (${l.name})`).join(" oder ")}; Englisch folgt später`;
// What an old views.json, with its views at the top, is told.
const OLD_SHAPE = "views.json hat noch die alte Form: die Einträge von „views“ stehen jetzt unter „sources“, die von GitHub in " +
  "„sources.github.contexts“, die von Azure in „sources.azure“ mit „org“ und „contexts“ (Kopf von mods/board/src/main.js)";
// What a views.json from before the contexts is told.
const BEFORE_CONTEXTS = "views.json hat noch die Form vor den Kontexten: die Einträge von „sources.github.views“ stehen jetzt je Besitzer in " +
  "„sources.github.contexts“ ({ \"owner\", \"projects\": [die Projects als { \"number\" }, ihre Ansichten von GitHub], " +
  "\"prs\": der PR-Tab, ohne „source“, „layout“, „sections“ und „limit“, die für alle PR-Tabs in „sources.github.prs“ stehen }), " +
  "die Azure-Teams je Projekt in „sources.azure.contexts“ ({ \"project\", \"teams\": [{ \"team\", \"views\" }] }; den PR-Tab hat jedes Projekt von selbst) " +
  "(Kopf von mods/board/src/main.js)";

// inMachineFile: what settingsAlone says of the whole file stands in place
// of what a blank checkout leaves out.
function startProblems(start, where, { keys = START_KEYS, stale = STALE_START, inMachineFile = false } = {}) {
  if (start === undefined) return [];
  if (!isObject(start)) return [`„${where}“ muss ein Objekt sein`];
  const out = [];
  for (const [key, value] of Object.entries(start)) {
    if (GONE_START.includes(key)) out.push(`„${where}.${key}“ ${GONE}`);
    else if (key === "open") out.push(`„${where}.open“ ${GONE_OPEN}`);
    else if (key === "checkout" && !keys.includes(key)) out.push(`„${where}.checkout“ ${GONE_CHECKOUT}; ${stale}`);
    else if (!keys.includes(key)) out.push(`„${where}.${key}“ gibt es nicht`);
    else if (value !== null && typeof value !== "string") out.push(`„${where}.${key}“ muss Text sein`);
    else if (key === "checkout" && value !== null && !isText(value)) out.push(`„${where}.checkout“ ${BLANK_CHECKOUT}${inMachineFile ? "" : `; ${staleText(where)}`}`);
  }
  return out;
}

// Keys every GitHub entry may have; each entry kind adds its own (ENTRY_KINDS).
const COMMON_KEYS = ["start"];

// The most items a board reads, and its default limit: ten of GitHub's
// pages (PAGE).
const BOARD_LIMIT = 10 * PAGE;

// A repo by its owner and name, as GitHub's nameWithOwner gives it.
const FULL_REPO = /^[^/\s]+\/[^/\s]+$/;

// A list section's keys, and the tones it may take, as an error names them.
const SECTION_KEYS = ["name", "query", "tone"];
const TONE_NAMES = Object.keys(SECTION_TONES).map((n) => `"${n}"`).join(", ").replace(/, ([^,]+)$/, " oder $1");

const hideReposProblems = (list) =>
  (list === undefined || (textList(list) && list.every((r) => FULL_REPO.test(r))) ? [] : ["„hideRepos“ ist eine Liste von Repos mit Besitzer, etwa [\"owner/repo\"]"]);

const limitProblems = (limit, most, at = "„limit“") =>
  (limit === undefined || (Number.isInteger(limit) && limit >= 1 && limit <= most) ? [] : [`${at} ist eine ganze Zahl von 1 bis ${most}`]);

// What a PR tab's „sections“ or „limit“ is told: the PR tabs of all
// contexts share them.
const SHARED_PRS = "steht jetzt in „sources.github.prs“, für die PR-Tabs aller Kontexte gleich (Kopf von mods/board/src/main.js)";
const SHARED_PRS_KEYS = ["sections", "limit"];
const PRS_LIMIT = 50;

// A list's sections, each with its tone: its own, else the next of
// SECTION_TONE_ORDER by its place among those without one, past the tones
// the others set while any is left.
function sectionsWithTones(sections) {
  const set = new Set(sections.map((s) => s.tone).filter(Boolean));
  const left = SECTION_TONE_ORDER.filter((tone) => !set.has(tone));
  const order = left.length ? left : SECTION_TONE_ORDER;
  let next = 0;
  return sections.map((s) => ({ name: s.name, query: s.query, tone: s.tone ?? order[next++ % order.length] }));
}

// A project's keys of the form before its views came from GitHub, and what
// such a project is told; it is left out.
const PROJECT_BEFORE = ["id", "name", "field", "filter", "priorityField", "hide"];
const PROJECT_SHAPE = "{ \"number\" }, dazu „limit“, „start“ und je Ansicht „views“: { \"<Nummer der Ansicht>\": { \"hide\": [...] } }";
export const GITHUB_ORDER = "github";
const SWITCH_ORDER_TEXT = `„switchOrder“ ist "${GITHUB_ORDER}" (wie auf GitHub) oder eine Liste von Nummern der Ansichten, jede höchstens einmal, etwa [4, 1]`;
const switchOrderOk = (v) =>
  v === undefined || v === GITHUB_ORDER || (Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 1) && new Set(v).size === v.length);

const projectBefore = (keys) =>
  `${keys.map((k) => `„${k}“`).join(", ")} ${keys.length > 1 ? "stammen" : "stammt"} aus der Form vor den Ansichten von GitHub: ein Project ist jetzt ${PROJECT_SHAPE}; ` +
  "Name, Ansichten, Filter, Spalten und Priorität kommen von GitHub (Kopf von mods/board/src/main.js)";

// A project's per-view keys: { "<view number>": { hide } }, its hidden
// board columns, which GitHub's API does not give.
const VIEW_NUMBER = /^[1-9][0-9]*$/;
function projectViewsProblems(views) {
  if (views === undefined) return [];
  if (!isObject(views) || !Object.keys(views).every((n) => VIEW_NUMBER.test(n))) {
    return ["„views“ ist ein Objekt mit den Nummern der Ansichten als Schlüsseln, etwa { \"1\": { \"hide\": [\"Done\"] } }"];
  }
  return Object.entries(views).flatMap(([n, v]) => {
    if (!isObject(v)) return [`„views.${n}“ muss ein Objekt sein`];
    return [
      ...Object.keys(v).filter((k) => k !== "hide").map((k) => `„views.${n}.${k}“ gibt es nicht`),
      ...(v.hide === undefined || textList(v.hide) ? [] : [`„views.${n}.hide“ muss eine Liste von Texten sein`]),
    ];
  });
}

// Per kind of a GitHub context's entry (its `entryKind`: a project, whose
// views come from GitHub, the context's Issues tab, with a view of kind
// "github issues" per state, or its PR list, a view of kind "github
// list"): its own keys, the keys of an older form that leave it out
// (`before`), what is wrong with its keys, the key that names it (`name`;
// `named`: whether a value of it names one; `nameIn`: whose entries it is
// its own among, its context's or all contexts' of its kind), its place as
// an error names it (`at`), its id (and its tab's, `tabId`, where that is
// another; a tab's is its own among all contexts' tabs) and its settings'
// path, whether it needs the PR sections of sources.github.prs
// (`needsShared`), and its fields with their defaults filled in (`owner`:
// the context's; `shared`: those sections).
const ENTRY_KINDS = {
  project: {
    keys: ["number", "limit", "views", "switchOrder"],
    before: PROJECT_BEFORE,
    problems(v) {
      const out = limitProblems(v.limit, BOARD_LIMIT);
      if (!(Number.isInteger(v.number) && v.number >= 1)) out.push("„number“ ist die Nummer des Projects, eine ganze Zahl ab 1");
      if (!switchOrderOk(v.switchOrder)) out.push(SWITCH_ORDER_TEXT);
      return [...out, ...projectViewsProblems(v.views)];
    },
    name: "number",
    named: Number.isInteger,
    nameIn: "context",
    at: (v, j) => `Project ${j + 1}${Number.isInteger(v?.number) ? ` (${v.number})` : ""}`,
    id: (v, owner) => projectTabId(owner, v.number),
    settingsPath: (v, context) => [...context, "projects", String(v.number)],
    defaults: (v, owner) => ({
      owner, number: v.number, limit: v.limit ?? BOARD_LIMIT, start: v.start ?? {}, views: v.views ?? {}, switchOrder: v.switchOrder ?? GITHUB_ORDER,
    }),
  },
  issues: {
    keys: ["id", "name", "limit", "hideRepos"],
    before: [],
    problems: (v) => [
      ...(isText(v.id) ? [] : ["„id“ fehlt"]),
      ...(v.name === undefined || isText(v.name) ? [] : ["„name“ muss Text sein"]),
      ...limitProblems(v.limit, ISSUES_LIMIT),
      ...hideReposProblems(v.hideRepos),
    ],
    name: "id",
    named: isText,
    nameIn: "kind",
    at: () => "Issues-Tab",
    id: (v) => issuesTabId(v.id),
    settingsPath: (v, context) => [...context, "issues"],
    defaults: (v, owner) => ({
      ...viewDefaults(), ...(v.start && { start: v.start }),
      owner, name: v.name ?? ISSUES_NAME, limit: v.limit ?? ISSUES_LIMIT, hideRepos: v.hideRepos ?? [],
    }),
  },
  prs: {
    keys: ["id", "name", "hide", "hideRepos", ...SHARED_PRS_KEYS],
    before: [],
    problems: (v) => [
      ...(isText(v.id) ? [] : ["„id“ fehlt"]),
      ...(v.name === undefined || isText(v.name) ? [] : ["„name“ muss Text sein"]),
      ...(v.hide === undefined || textList(v.hide) ? [] : ["„hide“ muss eine Liste von Texten sein"]),
      ...SHARED_PRS_KEYS.filter((k) => v[k] !== undefined).map((k) => `„${k}“ ${SHARED_PRS}`),
      ...hideReposProblems(v.hideRepos),
    ],
    name: "id",
    named: isText,
    nameIn: "kind",
    at: () => "PR-Tab",
    id: (v) => v.id,
    tabId: (v) => githubTabId(v.id),
    settingsPath: (v, context) => [...context, "prs"],
    needsShared: true,
    defaults: (v, _owner, shared) => ({
      ...viewDefaults(), ...(v.hide && { hide: v.hide }), ...(v.start && { start: v.start }),
      layout: "list", name: v.name ?? PRS_NAME, ...shared, hideRepos: v.hideRepos ?? [],
    }),
  },
};

const PRS_NAME = "PRs";
const ISSUES_NAME = "Issues";

// GitHub's search finds a thousand results at most.
const ISSUES_LIMIT = 10 * PAGE;

export const issuesTabId = (id) => `github:issues:${id}`;

// The id of a GitHub PR tab.
export const githubTabId = (viewId) => `github:${viewId}`;

function tabProblems(v, entryKind) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const kind = ENTRY_KINDS[entryKind];
  const before = kind.before.filter((k) => Object.hasOwn(v, k));
  if (before.length) return [projectBefore(before)];
  const out = [];
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start", { stale: STALE_VIEW_START })];
}

// A project's tab id: its owner's and its number, which name it on GitHub.
export const projectTabId = (owner, number) => `github:project:${owner}/${number}`;

function normalizeTab(v, entryKind, owner, shared) {
  const kind = ENTRY_KINDS[entryKind];
  const common = { entryKind, id: kind.id(v, owner), source: "github", settingsPath: kind.settingsPath(v, [...GITHUB_CONTEXTS, owner]) };
  return { ...common, ...kind.defaults(v, owner, shared) };
}

const GITHUB_CONTEXT_KEYS = ["owner", "projects", "issues", "prs"];
const GITHUB_CONTEXTS = ["sources", "github", "contexts"];
const AZURE_CONTEXTS = ["sources", "azure", "contexts"];

const LIST_NAMES = [[GITHUB_CONTEXTS, "owner"], [AZURE_CONTEXTS, "project"], [[...GITHUB_CONTEXTS, "*", "projects"], "number"]];
export const nameKeyAt = (path) => LIST_NAMES.find(([at]) => at.length === path.length && at.every((k, i) => k === "*" || k === path[i]))?.[1] ?? null;

// sources.github → { github: { contexts: [{ owner, tabs }] } or null,
// errors }: tabs are the context's projects (entryKind "project", whose
// views GitHub names: contexts.js), its Issues tab (entryKind "issues") and
// its PR list (entryKind "prs", layout "list"). A context or a tab with
// problems is left out and each problem is listed; a project's number is the
// first of its context's that has it, an Issues or PR tab's id the first of
// all contexts' tabs of its kind. Each tab carries `owners`
// (repoOwnership, kinds/list.js), folded. The PR tabs all take the sections
// of sources.github.prs (readSharedPrs); without valid ones there are none.
function readGithub(raw) {
  if (!isObject(raw)) return { github: null, errors: ["„sources.github“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => !["contexts", "views", "prs"].includes(k)).map((k) => `„sources.github.${k}“ gibt es nicht`);
  if ((!Array.isArray(raw.contexts) || !raw.contexts.length) && raw.views === undefined) {
    errors.push("„sources.github.contexts“ braucht mindestens einen Kontext: { \"owner\", \"projects\": [...], \"prs\": { \"id\" } }");
  }
  const list = Array.isArray(raw.contexts) ? raw.contexts : [];
  const wanted = raw.prs !== undefined || list.some((a) => isObject(a) && a.prs !== undefined);
  const { shared, errors: sharedErrors } = wanted ? readSharedPrs(raw.prs) : { shared: null, errors: [] };
  errors.push(...sharedErrors);
  const names = {};
  const tabIds = new Set();
  const contexts = [];
  list.forEach((a, i) => {
    const where = `GitHub-Kontext ${i + 1}${isText(a?.owner) ? ` („${a.owner}“)` : ""}`;
    const problems = contextProblems(a, list, GITHUB_CONTEXT_KEYS, nameKeyAt(GITHUB_CONTEXTS), "„owner“ fehlt: der Benutzer oder die Organisation auf GitHub, der die Projects gehören");
    if (!problems.length) {
      const first = list.find((o) => isObject(o) && isText(o.owner) && foldedName(o.owner) === foldedName(a.owner));
      if (first !== a) problems.push(`„owner“ ${a.owner} gibt es schon als „${first.owner}“`);
    }
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    if (a.projects !== undefined && !Array.isArray(a.projects)) errors.push(`${where}: „projects“ ist eine Liste von Projects`);
    if (a.prs === undefined) errors.push(`${where}: „prs“ fehlt: der PR-Tab, der letzte Tab des Kontexts, mit „id“`);
    const entries = [
      ...(Array.isArray(a.projects) ? a.projects : []).map((v) => ({ v, entryKind: "project" })),
      ...(a.issues === undefined ? [] : [{ v: a.issues, entryKind: "issues" }]),
      ...(a.prs === undefined ? [] : [{ v: a.prs, entryKind: "prs" }]),
    ];
    const tabs = [];
    names.context = new Set();
    entries.forEach(({ v, entryKind }, j) => {
      const kind = ENTRY_KINDS[entryKind];
      const problems = tabProblems(v, entryKind);
      const seen = kind.nameIn === "kind" ? (names[entryKind] ??= new Set()) : names.context;
      const name = v?.[kind.name];
      if (!problems.length && seen.has(name)) problems.push(`„${kind.name}“ ${name} gibt es schon`);
      if (kind.named(name)) seen.add(name);
      const id = problems.length ? null : (kind.tabId ?? kind.id)(v, a.owner);
      if (id !== null && tabIds.has(id)) problems.push(`„${kind.name}“ ${name} ergibt die Kennung „${id}“, die schon ein anderer Tab hat`);
      if (id !== null) tabIds.add(id);
      if (problems.length) errors.push(...problems.map((p) => `${where}, ${kind.at(v, j)}: ${p}`));
      else if (!kind.needsShared || shared) tabs.push(normalizeTab(v, entryKind, a.owner, shared));
    });
    if (tabs.length) contexts.push({ owner: a.owner, tabs });
  });
  const withPrs = contexts.filter((c) => c.tabs.some((t) => t.entryKind === "prs")).map((c) => foldedName(c.owner));
  for (const c of contexts) {
    const tabOwner = foldedName(c.owner);
    const owners = { tabOwner, otherOwners: withPrs.filter((o) => o !== tabOwner) };
    c.tabs = c.tabs.map((t) => ({ ...t, owners }));
  }
  return { github: contexts.length ? { contexts } : null, errors };
}

const SHARED_PRS_AT = "„sources.github.prs“";

function sectionsProblems(sections) {
  if (!(Array.isArray(sections) && sections.length && sections.every((s) => isObject(s) && isText(s.name) && isText(s.query)))) {
    return ["„sections“ braucht Einträge mit „name“ und „query“"];
  }
  return sections.flatMap((s) => [
    ...Object.keys(s).filter((k) => !SECTION_KEYS.includes(k)).map((k) => `Abschnitt „${s.name}“: „${k}“ gibt es nicht`),
    ...(s.tone === undefined || Object.hasOwn(SECTION_TONES, s.tone) ? [] : [`Abschnitt „${s.name}“: „tone“ ist ${TONE_NAMES}`]),
  ]);
}

export const sharedSectionsProblems = (sections) => sectionsProblems(sections).map((p) => `${SHARED_PRS_AT}: ${p}`);

// sources.github.prs → { shared: { sections (each with its tone), limit
// (each search's `first`) } or null, errors }.
function readSharedPrs(raw) {
  const at = SHARED_PRS_AT;
  if (raw === undefined) return { shared: null, errors: [`${at} fehlt: die Abschnitte der PR-Tabs aller Kontexte, { \"sections\": [{ \"name\", \"query\" }] }`] };
  if (!isObject(raw)) return { shared: null, errors: [`${at} muss ein Objekt sein`] };
  const errors = [
    ...Object.keys(raw).filter((k) => !SHARED_PRS_KEYS.includes(k)).map((k) => `„sources.github.prs.${k}“ gibt es nicht`),
    ...sharedSectionsProblems(raw.sections),
    ...limitProblems(raw.limit, PAGE, "„sources.github.prs.limit“"),
  ];
  return errors.length ? { shared: null, errors } : { shared: { sections: sectionsWithTones(raw.sections), limit: raw.limit ?? PRS_LIMIT }, errors };
}

function contextProblems(a, list, keys, nameKey, missing) {
  if (!isObject(a)) return ["muss ein Objekt sein"];
  const out = Object.keys(a).filter((k) => !keys.includes(k)).map((k) => `„${k}“ gibt es nicht`);
  if (!isText(a[nameKey])) out.push(missing);
  else if (entryByName(list, a[nameKey], nameKey) !== a) out.push(`„${nameKey}“ ${a[nameKey]} gibt es schon`);
  return out;
}

// The views a team tab may show, in the order of its switch: the id
// views.json names, and the name the switch shows.
export const TEAM_VIEWS = [
  { id: "sprint", name: "Sprint" },
  { id: "backlog", name: "Backlog" },
];
const TEAM_VIEW_IDS = TEAM_VIEWS.map((v) => v.id);
const TEAM_VIEWS_TEXT = TEAM_VIEW_IDS.map((v) => `"${v}"`).join(" und ");

const REPO_FOLDERS_TEXT = "ist eine Liste aus mindestens einem Ordner (Text), jeder höchstens einmal, etwa [\"~/Repos\"]";
export const trimFolder = (f) => f.replace(/(.)\/+$/, "$1");
const trimFolders = (v) => v.map(trimFolder);
const repoFoldersOk = (v) => v === undefined || (Array.isArray(v) && v.length > 0 && v.every(isText) && new Set(trimFolders(v)).size === v.length);
export const repoFoldersProblems = (v) => (repoFoldersOk(v) ? [] : [`„repoFolders“ ${REPO_FOLDERS_TEXT}`]);

const TEAM_KEYS = ["team", "views"];

// What is wrong with a team of an Azure context: { "team", "views"?: [...] }.
function teamProblems(t) {
  if (!isObject(t)) return ["muss ein Objekt sein"];
  const out = Object.keys(t).filter((k) => !TEAM_KEYS.includes(k)).map((k) => (k === "repoFolders" ? `„repoFolders“ gibt es hier nicht mehr: ${REPO_FOLDERS_PLACE}; ${STALE_TEAM}` : `„${k}“ gibt es nicht`));
  if (!isText(t.team)) out.push("„team“ fehlt: der Name des Teams im Projekt");
  const views = t.views;
  if (views !== undefined && !(textList(views) && views.length && views.every((v) => TEAM_VIEW_IDS.includes(v)) && new Set(views).size === views.length)) {
    out.push(`„views“ ist eine Liste aus ${TEAM_VIEWS_TEXT}, jede höchstens einmal`);
  }
  return out;
}

// An Azure context's teams as readAzure takes them, `where` the context's
// place in its words: { teams (those without problems), errors }.
function readTeams(teams, where) {
  if (teams === undefined) return { teams: [], errors: [] };
  if (!Array.isArray(teams)) return { teams: [], errors: [`${where}: „teams“ ist eine Liste von Teams`] };
  const taken = [];
  const errors = [];
  teams.forEach((t, j) => {
    const at = `${where}, Team ${j + 1}${isText(t?.team) ? ` („${t.team}“)` : ""}`;
    const problems = teamProblems(t);
    if (!problems.length && taken.some((c) => c.team === t.team)) problems.push("gibt es schon");
    if (problems.length) return errors.push(...problems.map((p) => `${at}: ${p}`));
    taken.push(t);
  });
  return { teams: taken, errors };
}

export const teamsProblems = (teams, where) => readTeams(teams, where).errors;

const azureWhere = (a, i) => `Azure-Kontext ${i + 1}${isText(a?.project) ? ` („${a.project}“)` : ""}`;

// The place readAzure names for the context of `project` in `azure`
// (sources.azure as views.json and this machine's file give it).
export function azureContextWhere(azure, project) {
  const list = azureContextList(azure);
  const i = list.findIndex((c) => isObject(c) && c.project === project);
  return azureWhere(list[i], i);
}

// The tabs of an Azure context: { id, source: "azure", kind: "team", name,
// org, project, team, views } per team, views in the switch's order, then {
// id, source: "azure", kind: "prs", name, org, project } for the project's
// pull requests; org the organisation's address (orgUrl).
function teamTab(t, project, org) {
  const views = t.views ?? TEAM_VIEW_IDS;
  return { id: `azure:team:${project}/${t.team}`, source: "azure", kind: "team", name: t.team, org, project, team: t.team, views: TEAM_VIEW_IDS.filter((v) => views.includes(v)) };
}
const prsTab = (project, org) => ({ id: `azure:prs:${project}`, source: "azure", kind: "prs", name: PRS_NAME, org, project });

// An organisation's address: https://<host>/<organisation>, a trailing /
// dropped; null for anything else.
function orgUrl(value) {
  const url = isText(value) ? value.trim().replace(/\/+$/, "") : "";
  return /^https:\/\/[^/\s]+\/[^/\s]+$/.test(url) ? url : null;
}

const AZURE_CONTEXT_KEYS = ["project", "teams"];

// An entry of sources.azure.contexts in the form before the contexts: { team:
// { project, team }, … } or { prs: { project } }.
const beforeContexts = (entry) => isObject(entry) && (Object.hasOwn(entry, "team") || Object.hasOwn(entry, "prs"));
const holdsBeforeContexts = (contexts) => Array.isArray(contexts) && contexts.some(beforeContexts);
// The contexts of sources.azure that readAzure reads: those not of that form.
const azureContextList = (raw) => (Array.isArray(raw?.contexts) ? raw.contexts.filter((c) => !beforeContexts(c)) : []);

// sources.azure → { azure: { org, contexts: [{ project, tabs }] } or null,
// errors }. Without a valid org (orgUrl) nothing of it is usable; a context
// or a team with problems is left out and each problem is listed.
function readAzure(raw) {
  if (!isObject(raw)) return { azure: null, errors: ["„sources.azure“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => !["org", "contexts"].includes(k))
    .map((k) => (k === "repoFolders" ? `„sources.azure.repoFolders“ gibt es nicht mehr: ${REPO_FOLDERS_PLACE}; ${STALE_AZURE}` : `„sources.azure.${k}“ gibt es nicht`));
  const org = orgUrl(raw.org);
  if (!org) errors.push("„sources.azure.org“ ist die Adresse der Organisation, etwa https://dev.azure.com/<Organisation>");
  const list = azureContextList(raw);
  if (!list.length && !holdsBeforeContexts(raw.contexts)) {
    errors.push("„sources.azure.contexts“ braucht mindestens einen Kontext: { \"project\", \"teams\": [{ \"team\" }] }");
  }
  const contexts = [];
  list.forEach((a, i) => {
    const where = azureWhere(a, i);
    const problems = contextProblems(a, list, AZURE_CONTEXT_KEYS, nameKeyAt(AZURE_CONTEXTS), "„project“ fehlt: der Name des Projekts in der Organisation");
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    const { teams, errors: teamErrors } = readTeams(a.teams, where);
    errors.push(...teamErrors);
    contexts.push({ project: a.project, tabs: [...teams.map((t) => teamTab(t, a.project, org)), prsTab(a.project, org)] });
  });
  return { azure: org && contexts.length ? { org, contexts } : null, errors };
}

// views.json as text (null: there is none) and this machine's settings as
// read (`settingsRead`: { name, text }, text null for no file, or { name,
// error }) → { config, errors, settings, origin, base, merged, refused?,
// moving? }: config is { refreshMinutes, language, start, repoFolders,
// repos, azure: { org, contexts } or null, github: { contexts } or null },
// settings those applied (null: none), origin mergeSettings's, base
// views.json as read, merged that with the settings applied over it (both
// null where views.json is missing or no JSON), refused why the settings do
// not apply (where readSettings read them, without the file's name),
// moving settingsForContexts's move where the settings can move. A context
// or a tab with problems is left out and each problem is listed; config is
// null only when nothing usable is left.
export function readConfig(text, settingsRead = null) {
  const none = (error) => ({ config: null, errors: [error], settings: null, origin: mergeSettings(null, {}, nameKeyAt).origin, merged: null, base: null });
  if (text === null || text === undefined) return none(`${CONFIG_NAME}.json fehlt im Ordner der Mod`);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return none(`${CONFIG_NAME}.json ist kein gültiges JSON: ${e.message}`);
  }
  const alone = { ...validateConfig(raw), settings: null, origin: mergeSettings(raw, {}, nameKeyAt).origin, merged: raw, base: raw };
  if (!settingsRead) return alone;
  const { name } = settingsRead;
  const named = (errors) => errors.map((e) => `${name}: ${e}`);
  const unused = (errors, refused = errors) => ({ ...alone, errors: [...alone.errors, ...errors, settingsAlone(name)], refused });
  if (settingsRead.error !== undefined) return unused([`${name} ließ sich nicht lesen: ${settingsRead.error}`]);
  const { settings, errors } = readSettings(settingsRead.text, name);
  if (!settings) return unused(errors);
  const moving = settingsForContexts(raw, settings);
  if (moving?.problems) return unused(named(moving.problems), moving.problems);
  const notMoved = (subject) => `${subject} hat noch die Form vor den Kontexten und ist nicht umgestellt; ${MOVE_AGAIN}`;
  if (moving) return { ...unused([notMoved(name)], [notMoved("die Datei")]), moving };
  const { settings: applied, errors: before } = withoutProjectsBefore(settings);
  const { merged, errors: unmatched, origin } = mergeSettings(raw, applied, nameKeyAt);
  const read = validateConfig(merged, origin);
  const added = read.errors.filter((e) => !alone.errors.includes(e));
  const problems = [...before, ...unmatched, ...added];
  if (added.length) return unused(named(problems), problems);
  return { ...read, errors: [...read.errors, ...named([...before, ...unmatched])], settings: applied, origin, merged, base: raw };
}

// This machine's settings of a project in the form before its views came
// from GitHub: an entry named by its id, or one by its number with keys of
// that form. Each is named and left out of what applies; it stays in the
// file. Lists set whole are left to the check of views.json.
const VIEW_HIDE_PATH = "„sources.github.contexts.<owner>.projects.<Nummer>.views.<Nummer der Ansicht>.hide“";
const BEFORE_VIEWS = `gilt nicht, aus der Form vor den Ansichten von GitHub: ein Project heißt jetzt nach seiner Nummer, die ausgeblendeten Spalten stehen je Ansicht in ${VIEW_HIDE_PATH}; bitte von Hand übertragen`;
// What a GitHub view's settings from before the contexts are told where no
// PR tab has their id.
const PROJECT_NO_ID = `ein Project hat keine „id“ mehr, seine ausgeblendeten Spalten stehen je Ansicht in ${VIEW_HIDE_PATH}; bitte von Hand übertragen`;
function withoutProjectsBefore(settings) {
  const contexts = settings.sources?.github?.contexts;
  if (!isObject(contexts)) return { settings, errors: [] };
  const errors = [];
  let next = settings;
  for (const [owner, context] of Object.entries(contexts)) {
    const projects = isObject(context) ? context.projects : undefined;
    if (!isObject(projects)) continue;
    const at = [...GITHUB_CONTEXTS, owner, "projects"];
    for (const [name, project] of Object.entries(projects)) {
      const keys = VIEW_NUMBER.test(name) ? (isObject(project) ? PROJECT_BEFORE.filter((k) => Object.hasOwn(project, k)) : []).map((k) => [name, k]) : [[name]];
      for (const path of keys) {
        errors.push(`${pathText([...at, ...path])} ${BEFORE_VIEWS}`);
        next = withSetting(next, [...at, ...path], undefined, () => null);
      }
    }
  }
  return { settings: next, errors };
}

export const MOVE_AGAIN = "das nächste Lesen (r) versucht es noch einmal";

export const settingsAlone = (subject) => `${subject} gilt nicht: das Board zeigt ${CONFIG_NAME}.json allein`;

export function validateConfig(raw, origin = null) {
  if (!isObject(raw)) return { config: null, errors: ["Oben muss ein Objekt stehen"] };
  // Views at the top are views.json's old form, also beside sources.
  const old = raw.views !== undefined;
  const errors = old ? [OLD_SHAPE] : [];
  errors.push(...Object.keys(raw).filter((k) => !TOP_KEYS.includes(k) && k !== "views").map((k) => `„${k}“ gibt es nicht`));
  let refreshMinutes = raw.refreshMinutes ?? 3;
  if (typeof refreshMinutes !== "number" || !(refreshMinutes >= 1)) {
    errors.push("„refreshMinutes“ ist eine Zahl ab 1");
    refreshMinutes = 3;
  }
  let language = raw.language ?? LANGUAGE_DEFAULT;
  if (!LANGUAGES.some((l) => l.id === language)) {
    errors.push(LANGUAGE_TEXT);
    language = LANGUAGE_DEFAULT;
  }
  const startErrors = startProblems(raw.start, "start");
  errors.push(...startErrors);
  const folderProblems = repoFoldersProblems(raw.repoFolders);
  errors.push(...folderProblems);
  const repoFolders = !folderProblems.length && raw.repoFolders ? trimFolders(raw.repoFolders) : [];
  const repos = {};
  if (raw.repos !== undefined && !isObject(raw.repos)) errors.push("„repos“ muss ein Objekt sein");
  for (const [name, entry] of Object.entries(isObject(raw.repos) ? raw.repos : {})) {
    const inMachineFile = origin?.(["repos", name, "checkout"]) === ORIGIN.machine;
    const problems = startProblems(entry, `repos.${name}`, { keys: REPO_KEYS, inMachineFile });
    if (problems.length) errors.push(...problems);
    else repos[name] = entry;
  }
  let azure = null;
  let github = null;
  if (isObject(raw.sources)) {
    const sources = raw.sources;
    if ((isObject(sources.github) && sources.github.views !== undefined) || (isObject(sources.azure) && holdsBeforeContexts(sources.azure.contexts))) errors.push(BEFORE_CONTEXTS);
    errors.push(...Object.keys(sources).filter((k) => k !== "azure" && k !== "github").map((k) => `„sources.${k}“ gibt es nicht (nur „azure“ und „github“)`));
    if (sources.azure !== undefined) {
      const read = readAzure(sources.azure);
      azure = read.azure;
      errors.push(...read.errors);
    }
    if (sources.github !== undefined) {
      const read = readGithub(sources.github);
      github = read.github;
      errors.push(...read.errors);
    }
    if (!azure && !github) errors.push("„sources“ braucht mindestens einen Kontext: in „sources.github.contexts“ oder „sources.azure.contexts“");
  } else if (raw.sources !== undefined) errors.push("„sources“ muss ein Objekt sein");
  else if (!old) errors.push("„sources“ fehlt: „sources.azure“ oder „sources.github“");
  const start = startErrors.length ? {} : raw.start ?? {};
  return { config: azure || github ? { refreshMinutes, language, start, repoFolders, repos, azure, github } : null, errors };
}

export const hidePath = (view) => [...view.settingsPath, "hide"];
export const repoHidePath = (view) => [...view.settingsPath, "hideRepos"];

const viewPath = (...id) => ["sources", "github", "views", ...id];
const SHARED_PRS_PATH = ["sources", "github", "prs"];

// The keys of a GitHub PR view of the form before the contexts that its tab
// holds as they were (value), those that are the PR tabs' together now
// (shared: its sections and limit), and those it says through its context:
// its source and its layout.
function tabSettings(value, owner) {
  if (!isObject(value)) return { problem: "ist kein Objekt" };
  const kind = ENTRY_KINDS.prs;
  const out = {};
  const shared = {};
  for (const [key, v] of Object.entries(value)) {
    if ((key === "source" && v === "github") || (key === "layout" && v === "list")) continue;
    if (SHARED_PRS_KEYS.includes(key)) shared[key] = v;
    else if (COMMON_KEYS.includes(key) || kind.keys.includes(key)) out[key] = v;
    else return { problem: `„${key}“ hat im Kontext ${owner} keinen Platz` };
  }
  return { value: out, shared };
}

function partsBeforeContexts(settings) {
  const sources = isObject(settings) && isObject(settings.sources) ? settings.sources : {};
  return { sources, views: isObject(sources.github) ? sources.github.views : undefined, teams: isObject(sources.azure) && holdsBeforeContexts(sources.azure.contexts) };
}

export function settingsBeforeContexts(settings) {
  const { views, teams } = partsBeforeContexts(settings);
  return views !== undefined || teams;
}

// → null, { problems }, or { settings, moved: [[from, to]] }. Where any
// value has no place in the contexts, two differ for one place, or
// views.json has problems, nothing moves.
export function settingsForContexts(raw, settings) {
  if (!settingsBeforeContexts(settings)) return null;
  const { sources, views, teams } = partsBeforeContexts(settings);
  const { config, errors } = validateConfig(raw);
  if (errors.length) return { problems: [`noch in der Form vor den Kontexten; erst ${CONFIG_NAME}.json berichtigen, dann werden die Einstellungen umgestellt`] };
  const cannot = (path, why) => `${pathText(path)} lässt sich nicht auf die Kontexte umstellen: ${why}`;
  const problems = [];
  if (teams) problems.push(cannot(AZURE_CONTEXTS, "die Teams stehen jetzt je Projekt in „sources.azure.contexts“ ({ \"project\", \"teams\" }); bitte von Hand übertragen"));
  if (views !== undefined && !isObject(views)) problems.push(cannot(viewPath(), "hier eine ganze Liste; bitte von Hand nach „sources.github.contexts“ übertragen"));
  if (sources.github?.contexts !== undefined && !isObject(sources.github.contexts)) problems.push(cannot(GITHUB_CONTEXTS, "hier eine ganze Liste"));
  // Only a PR tab's id stands in views.json, so only a PR tab takes a view's settings.
  const tabs = new Map((config.github?.contexts ?? []).flatMap((c) => c.tabs.filter((t) => t.entryKind === "prs").map((t) => [t.id, { entry: t, owner: c.owner }])));
  let next = isObject(views) ? withSetting(settings, viewPath(), undefined, nameKeyAt) : settings;
  const moved = [];
  for (const [id, value] of Object.entries(isObject(views) ? views : {})) {
    const from = viewPath(id);
    const tab = tabs.get(id);
    if (!tab) {
      problems.push(cannot(from, `${CONFIG_NAME}.json hat keinen PR-Tab mit „id“ „${id}“; ${PROJECT_NO_ID}`));
      continue;
    }
    const kept = tabSettings(value, tab.owner);
    if (kept.problem) {
      problems.push(cannot(from, kept.problem));
      continue;
    }
    const moves = Object.entries(kept.shared).map(([key, v]) => ({ at: [...from, key], to: [...SHARED_PRS_PATH, key], v, shared: true }));
    if (Object.keys(kept.value).length || !moves.length) moves.unshift({ at: from, to: tab.entry.settingsPath, v: kept.value, shared: false });
    for (const { at, to, v, shared } of moves) {
      const there = valueAt(next, to, nameKeyAt);
      if (there !== undefined && !(shared && JSON.stringify(there) === JSON.stringify(v))) {
        problems.push(cannot(at, `${pathText(to)} steht hier schon${shared ? " anders" : ""}`));
      } else if (there !== undefined) moved.push([at, to]);
      else if (!problems.length) {
        try {
          next = withSetting(next, to, v, nameKeyAt);
          moved.push([at, to]);
        } catch (e) {
          if (!(e instanceof BoardError)) throw e;
          problems.push(cannot(at, e.message));
        }
      }
    }
  }
  return problems.length ? { problems } : { settings: next, moved };
}

// The start for an item: the defaults, then views.json's start, then the
// view's start, then the repo's entry in repos; a later one wins. Where a
// repo lies is the start dialog's (repoExceptions).
export function startSettings(config, view, repo) {
  const own = { ...config.repos[repo] };
  delete own.checkout;
  return { ...START_DEFAULTS, ...config.start, ...view.start, ...own };
}

export const repoExceptions = (config) => Object.entries(config.repos).filter(([, e]) => isText(e.checkout));
