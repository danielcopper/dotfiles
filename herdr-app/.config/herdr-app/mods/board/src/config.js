// views.json: reading it with this machine's settings over it, what is
// wrong with them, and the start settings for an item.

import { BoardError, CONFIG_NAME, PAGE, SECTION_TONES, SECTION_TONE_ORDER, foldedName, isObject, isText, textList } from "./shared.js";
import { viewDefaults, viewKind } from "./kinds/index.js";
import { entryByName, mergeSettings, pathText, readSettings, valueAt, withSetting } from "./settings.js";

export const START_DEFAULTS = { agent: null, machine: null, checkout: null, message: "", review: "" };
const START_KEYS = Object.keys(START_DEFAULTS);
// Keys of a start that made a worktree or set the status: the agent's own
// skills do both.
const GONE = "gibt es nicht mehr: der Start öffnet eine Sitzung im Checkout, den Worktree legt der Agent an";
const GONE_START = ["branch", "worktree", "base"];
const GONE_OPEN = "gibt es nicht mehr: „Öffnen in“ im Startdialog wählt den Space";
const GONE_STATUS = "„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst";
const TOP_KEYS = ["refreshMinutes", "start", "repos", "sources"];
// What an old views.json, with its views at the top, is told.
const OLD_SHAPE = "views.json hat noch die alte Form: die Ansichten stehen jetzt unter „sources“, die GitHub-Ansichten in " +
  "„sources.github.contexts“, Azure in „sources.azure“ mit „org“ und „contexts“ (Kopf von mods/board/src/main.js)";
// What a views.json from before the contexts is told.
const BEFORE_CONTEXTS = "views.json hat noch die Form vor den Kontexten: die GitHub-Ansichten stehen jetzt je Besitzer in " +
  "„sources.github.contexts“ ({ \"owner\", \"projects\": [die Boards, ohne „source“ und „layout“, „number“, „field“ und „priorityField“ statt „project“], " +
  "\"prs\": der PR-Tab, ohne „source“, „layout“, „sections“ und „limit“, die für alle PR-Tabs in „sources.github.prs“ stehen }), " +
  "die Azure-Teams je Projekt in „sources.azure.contexts“ ({ \"project\", \"teams\": [{ \"team\", \"views\" }] }; den PR-Tab hat jedes Projekt von selbst) " +
  "(Kopf von mods/board/src/main.js)";

function startProblems(start, where) {
  if (start === undefined) return [];
  if (!isObject(start)) return [`„${where}“ muss ein Objekt sein`];
  const out = [];
  for (const [key, value] of Object.entries(start)) {
    if (GONE_START.includes(key)) out.push(`„${where}.${key}“ ${GONE}`);
    else if (key === "open") out.push(`„${where}.open“ ${GONE_OPEN}`);
    else if (!START_KEYS.includes(key)) out.push(`„${where}.${key}“ gibt es nicht`);
    else if (value !== null && typeof value !== "string") out.push(`„${where}.${key}“ muss Text sein`);
  }
  return out;
}

const textProblems = (v, keys) => keys.filter((k) => v[k] !== undefined && v[k] !== null && typeof v[k] !== "string").map((k) => `„${k}“ muss Text sein`);

// Keys every GitHub tab may have; each kind adds its own (VIEW_KINDS).
const COMMON_KEYS = ["id", "name", "hide", "start"];

// The most items a board reads, and its default limit: ten of GitHub's
// pages (PAGE).
const BOARD_LIMIT = 10 * PAGE;

// A repo by its owner and name, as GitHub's nameWithOwner gives it.
const FULL_REPO = /^[^/\s]+\/[^/\s]+$/;

// A list section's keys, and the tones it may take, as an error names them.
const SECTION_KEYS = ["name", "query", "tone"];
const TONE_NAMES = Object.keys(SECTION_TONES).map((n) => `"${n}"`).join(", ").replace(/, ([^,]+)$/, " oder $1");

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

// Per GitHub view kind ("github <layout>", viewKind; its entry in KINDS,
// kinds/index.js, says how it shows): the tab of a context it is (a
// project's board, or the context's PR list), its own keys, what is wrong
// with them, and its fields with their defaults filled in (`owner`: the
// context's; `shared`: the PR sections of sources.github.prs).
const VIEW_KINDS = {
  "github board": {
    keys: ["number", "field", "priorityField", "filter", "limit"],
    problems(v) {
      const out = limitProblems(v.limit, BOARD_LIMIT);
      if (!(Number.isInteger(v.number) && v.number >= 1)) out.push("„number“ ist die Nummer des Projects, eine ganze Zahl ab 1");
      out.push(...["field", "priorityField"].filter((k) => v[k] !== undefined && !isText(v[k])).map((k) => `„${k}“ muss Text sein`));
      return [...out, ...textProblems(v, ["filter"])];
    },
    defaults: (v, owner) => ({
      project: {
        owner, number: v.number, field: v.field ?? "Status", priorityField: v.priorityField ?? "Priority",
        // A project may lack the default one: only a named one it lacks is told.
        priorityGiven: v.priorityField !== undefined,
      },
      filter: v.filter ?? "",
      limit: v.limit ?? BOARD_LIMIT,
    }),
  },
  "github list": {
    keys: ["hideRepos", ...SHARED_PRS_KEYS],
    problems: (v) => [
      ...SHARED_PRS_KEYS.filter((k) => v[k] !== undefined).map((k) => `„${k}“ ${SHARED_PRS}`),
      ...(v.hideRepos === undefined || (textList(v.hideRepos) && v.hideRepos.every((r) => FULL_REPO.test(r)))
        ? []
        : ["„hideRepos“ ist eine Liste von Repos mit Besitzer, etwa [\"owner/repo\"]"]),
    ],
    defaults: (v, _owner, shared) => ({ ...shared, hideRepos: v.hideRepos ?? [] }),
  },
};

const PRS_NAME = "PRs";

function tabProblems(v, layout) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const kind = VIEW_KINDS[viewKind({ source: "github", layout })];
  const out = [];
  if (!isText(v.id)) out.push("„id“ fehlt");
  if (layout === "board" && !isText(v.name)) out.push("„name“ fehlt");
  else if (v.name !== undefined && !isText(v.name)) out.push("„name“ muss Text sein");
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  if (v.hide !== undefined && !textList(v.hide)) out.push("„hide“ muss eine Liste von Texten sein");
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start")];
}

function normalizeView(v, layout, owner, shared) {
  const context = [...GITHUB_CONTEXTS, owner];
  const settingsPath = layout === "board" ? [...context, "projects", v.id] : [...context, "prs"];
  const common = { ...viewDefaults(), id: v.id, name: v.name ?? PRS_NAME, source: "github", layout, settingsPath };
  if (v.hide !== undefined) common.hide = v.hide;
  if (v.start !== undefined) common.start = v.start;
  return { ...common, ...VIEW_KINDS[viewKind(common)].defaults(v, owner, shared) };
}

const GITHUB_CONTEXT_KEYS = ["owner", "projects", "prs"];
const GITHUB_CONTEXTS = ["sources", "github", "contexts"];
const AZURE_CONTEXTS = ["sources", "azure", "contexts"];

const LIST_NAMES = [[GITHUB_CONTEXTS, "owner"], [AZURE_CONTEXTS, "project"], [[...GITHUB_CONTEXTS, "*", "projects"], "id"]];
export const nameKeyAt = (path) => LIST_NAMES.find(([at]) => at.length === path.length && at.every((k, i) => k === "*" || k === path[i]))?.[1] ?? null;

// sources.github → { github: { contexts: [{ owner, views }] } or null,
// errors }. A context or a tab with problems is left out and each problem is
// listed; a tab's id is the first tab's of all contexts that has it. Each
// view carries `owners` (repoOwnership, kinds/list.js), folded. The PR tabs
// all take the sections of sources.github.prs (readSharedPrs); without
// valid ones there are none.
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
  const ids = new Set();
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
    const tabs = [
      ...(Array.isArray(a.projects) ? a.projects : []).map((p, j) => ({ v: p, layout: "board", at: `Project ${j + 1}${isText(p?.name) ? ` („${p.name}“)` : ""}` })),
      ...(a.prs === undefined ? [] : [{ v: a.prs, layout: "list", at: "PR-Tab" }]),
    ];
    const views = [];
    for (const { v, layout, at } of tabs) {
      const tab = tabProblems(v, layout);
      if (!tab.length && ids.has(v.id)) tab.push(`„id“ ${v.id} gibt es schon`);
      if (isObject(v) && isText(v.id)) ids.add(v.id);
      if (tab.length) errors.push(...tab.map((p) => `${where}, ${at}: ${p}`));
      else if (layout === "board" || shared) views.push(normalizeView(v, layout, a.owner, shared));
    }
    if (views.length) contexts.push({ owner: a.owner, views });
  });
  const withPrs = contexts.filter((c) => c.views.some((v) => v.layout === "list")).map((c) => foldedName(c.owner));
  for (const c of contexts) {
    const tabOwner = foldedName(c.owner);
    const owners = { tabOwner, otherOwners: withPrs.filter((o) => o !== tabOwner) };
    c.views = c.views.map((v) => ({ ...v, owners }));
  }
  return { github: contexts.length ? { contexts } : null, errors };
}

function sectionsProblems(sections) {
  if (!(Array.isArray(sections) && sections.length && sections.every((s) => isObject(s) && isText(s.name) && isText(s.query)))) {
    return ["„sections“ braucht Einträge mit „name“ und „query“"];
  }
  return sections.flatMap((s) => [
    ...Object.keys(s).filter((k) => !SECTION_KEYS.includes(k)).map((k) => `Abschnitt „${s.name}“: „${k}“ gibt es nicht`),
    ...(s.tone === undefined || Object.hasOwn(SECTION_TONES, s.tone) ? [] : [`Abschnitt „${s.name}“: „tone“ ist ${TONE_NAMES}`]),
  ]);
}

// sources.github.prs → { shared: { sections (each with its tone), limit
// (each search's `first`) } or null, errors }.
function readSharedPrs(raw) {
  const at = "„sources.github.prs“";
  if (raw === undefined) return { shared: null, errors: [`${at} fehlt: die Abschnitte der PR-Tabs aller Kontexte, { \"sections\": [{ \"name\", \"query\" }] }`] };
  if (!isObject(raw)) return { shared: null, errors: [`${at} muss ein Objekt sein`] };
  const errors = [
    ...Object.keys(raw).filter((k) => !SHARED_PRS_KEYS.includes(k)).map((k) => `„sources.github.prs.${k}“ gibt es nicht`),
    ...sectionsProblems(raw.sections).map((p) => `${at}: ${p}`),
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
const trimFolders = (v) => v.map((f) => f.replace(/(.)\/+$/, "$1"));
const repoFoldersOk = (v) => v === undefined || (Array.isArray(v) && v.length > 0 && v.every(isText) && new Set(trimFolders(v)).size === v.length);

const TEAM_KEYS = ["team", "views", "repoFolders"];

// What is wrong with a team of an Azure context: { "team", "views"?: [...],
// "repoFolders"?: [...] }.
function teamProblems(t) {
  if (!isObject(t)) return ["muss ein Objekt sein"];
  const out = Object.keys(t).filter((k) => !TEAM_KEYS.includes(k)).map((k) => `„${k}“ gibt es nicht`);
  if (!isText(t.team)) out.push("„team“ fehlt: der Name des Teams im Projekt");
  const views = t.views;
  if (views !== undefined && !(textList(views) && views.length && views.every((v) => TEAM_VIEW_IDS.includes(v)) && new Set(views).size === views.length)) {
    out.push(`„views“ ist eine Liste aus ${TEAM_VIEWS_TEXT}, jede höchstens einmal`);
  }
  if (!repoFoldersOk(t.repoFolders)) out.push(`„repoFolders“ ${REPO_FOLDERS_TEXT}`);
  return out;
}

// The tabs of an Azure context: { id, source: "azure", kind: "team", name,
// org, project, team, views, repoFolders } per team, views in the switch's
// order, then { id, source: "azure", kind: "prs", name, org, project } for
// the project's pull requests; org the organisation's address (orgUrl).
function teamTab(t, project, org, folders) {
  const views = t.views ?? TEAM_VIEW_IDS;
  const repoFolders = t.repoFolders ? trimFolders(t.repoFolders) : folders;
  return { id: `azure:team:${project}/${t.team}`, source: "azure", kind: "team", name: t.team, org, project, team: t.team, views: TEAM_VIEW_IDS.filter((v) => views.includes(v)), repoFolders };
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

// sources.azure → { azure: { org, contexts: [{ project, tabs }] } or null,
// errors }. Without a valid org (orgUrl) nothing of it is usable; a context
// or a team with problems is left out and each problem is listed.
function readAzure(raw) {
  if (!isObject(raw)) return { azure: null, errors: ["„sources.azure“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => !["org", "contexts", "repoFolders"].includes(k)).map((k) => `„sources.azure.${k}“ gibt es nicht`);
  const org = orgUrl(raw.org);
  const foldersOk = repoFoldersOk(raw.repoFolders);
  if (!foldersOk) errors.push(`„sources.azure.repoFolders“ ${REPO_FOLDERS_TEXT}`);
  const folders = foldersOk && raw.repoFolders ? trimFolders(raw.repoFolders) : [];
  if (!org) errors.push("„sources.azure.org“ ist die Adresse der Organisation, etwa https://dev.azure.com/<Organisation>");
  const list = Array.isArray(raw.contexts) ? raw.contexts.filter((c) => !beforeContexts(c)) : [];
  if (!list.length && !holdsBeforeContexts(raw.contexts)) {
    errors.push("„sources.azure.contexts“ braucht mindestens einen Kontext: { \"project\", \"teams\": [{ \"team\" }] }");
  }
  const contexts = [];
  list.forEach((a, i) => {
    const where = `Azure-Kontext ${i + 1}${isText(a?.project) ? ` („${a.project}“)` : ""}`;
    const problems = contextProblems(a, list, AZURE_CONTEXT_KEYS, nameKeyAt(AZURE_CONTEXTS), "„project“ fehlt: der Name des Projekts in der Organisation");
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    if (a.teams !== undefined && !Array.isArray(a.teams)) errors.push(`${where}: „teams“ ist eine Liste von Teams`);
    const tabs = [];
    (Array.isArray(a.teams) ? a.teams : []).forEach((t, j) => {
      const at = `${where}, Team ${j + 1}${isText(t?.team) ? ` („${t.team}“)` : ""}`;
      const team = teamProblems(t);
      if (!team.length && tabs.some((c) => c.team === t.team)) team.push("gibt es schon");
      if (team.length) return errors.push(...team.map((p) => `${at}: ${p}`));
      tabs.push(teamTab(t, a.project, org, folders));
    });
    contexts.push({ project: a.project, tabs: [...tabs, prsTab(a.project, org)] });
  });
  return { azure: org && contexts.length ? { org, contexts } : null, errors };
}

// views.json as text (null: there is none) and this machine's settings as
// read (`settingsRead`: { name, text }, text null for no file, or { name,
// error }) → { config, errors, settings, origin, moving? }: config is {
// refreshMinutes, start, repos, azure: { org, contexts } or null, github: {
// contexts } or null }, settings those applied (null: none), origin
// mergeSettings's, moving settingsForContexts's move where the settings can
// move. A context or a tab with problems is left out and each problem is
// listed; config is null only when nothing usable is left.
export function readConfig(text, settingsRead = null) {
  const none = (error) => ({ config: null, errors: [error], settings: null, origin: mergeSettings(null, {}, nameKeyAt).origin });
  if (text === null || text === undefined) return none(`${CONFIG_NAME}.json fehlt im Ordner der Mod`);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return none(`${CONFIG_NAME}.json ist kein gültiges JSON: ${e.message}`);
  }
  const alone = { ...validateConfig(raw), settings: null, origin: mergeSettings(raw, {}, nameKeyAt).origin };
  if (!settingsRead) return alone;
  const { name } = settingsRead;
  const named = (errors) => errors.map((e) => `${name}: ${e}`);
  const unused = (errors) => ({ ...alone, errors: [...alone.errors, ...errors, settingsAlone(name)] });
  if (settingsRead.error !== undefined) return unused([`${name} ließ sich nicht lesen: ${settingsRead.error}`]);
  const { settings, errors } = readSettings(settingsRead.text, name);
  if (!settings) return unused(errors);
  const moving = settingsForContexts(raw, settings);
  if (moving?.problems) return unused(named(moving.problems));
  if (moving) return { ...unused([`${name} hat noch die Form vor den Kontexten und ist nicht umgestellt; ${MOVE_AGAIN}`]), moving };
  const { merged, errors: unmatched, origin } = mergeSettings(raw, settings, nameKeyAt);
  const read = validateConfig(merged);
  const added = read.errors.filter((e) => !alone.errors.includes(e));
  if (added.length) return unused(named([...unmatched, ...added]));
  return { ...read, errors: [...read.errors, ...named(unmatched)], settings, origin };
}

export const MOVE_AGAIN = "das nächste Lesen (r) versucht es noch einmal";

export const settingsAlone = (subject) => `${subject} gilt nicht: das Board zeigt ${CONFIG_NAME}.json allein`;

export function validateConfig(raw) {
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
  const startErrors = startProblems(raw.start, "start");
  errors.push(...startErrors);
  const repos = {};
  if (raw.repos !== undefined && !isObject(raw.repos)) errors.push("„repos“ muss ein Objekt sein");
  for (const [name, entry] of Object.entries(isObject(raw.repos) ? raw.repos : {})) {
    const problems = startProblems(entry, `repos.${name}`);
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
  return { config: azure || github ? { refreshMinutes, start, repos, azure, github } : null, errors };
}

export const githubViews = (config) => (config?.github?.contexts ?? []).flatMap((c) => c.views);

export const hidePath = (view) => [...view.settingsPath, "hide"];
export const repoHidePath = (view) => [...view.settingsPath, "hideRepos"];

const viewPath = (...id) => ["sources", "github", "views", ...id];
const SHARED_PRS_PATH = ["sources", "github", "prs"];

// The keys of a GitHub view of the form before the contexts that its tab
// holds as they were (value), those that are the PR tabs' together now
// (shared: a list's sections and limit), and those it says through its
// context: its source, its layout and its project's owner.
function tabSettings(value, layout, owner) {
  if (!isObject(value)) return { problem: "ist kein Objekt" };
  const kind = VIEW_KINDS[viewKind({ source: "github", layout })];
  const out = {};
  const shared = {};
  for (const [key, v] of Object.entries(value)) {
    if ((key === "source" && v === "github") || (key === "layout" && v === layout)) continue;
    if (layout === "list" && SHARED_PRS_KEYS.includes(key)) shared[key] = v;
    else if (key === "project" && layout === "board" && isObject(v)) {
      for (const [inner, w] of Object.entries(v)) {
        if (inner === "owner" && w === owner) continue;
        if (!kind.keys.includes(inner) || inner === "filter") return { problem: `„project.${inner}“ hat im Kontext ${owner} keinen Platz` };
        out[inner] = w;
      }
    } else if (COMMON_KEYS.includes(key) || kind.keys.includes(key)) out[key] = v;
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
  const tabs = new Map((config.github?.contexts ?? []).flatMap((c) => c.views.map((v) => [v.id, { view: v, owner: c.owner }])));
  let next = isObject(views) ? withSetting(settings, viewPath(), undefined, nameKeyAt) : settings;
  const moved = [];
  for (const [id, value] of Object.entries(isObject(views) ? views : {})) {
    const from = viewPath(id);
    const tab = tabs.get(id);
    if (!tab) {
      problems.push(cannot(from, `${CONFIG_NAME}.json hat keinen Tab mit „id“ „${id}“`));
      continue;
    }
    const kept = tabSettings(value, tab.view.layout, tab.owner);
    if (kept.problem) {
      problems.push(cannot(from, kept.problem));
      continue;
    }
    const moves = Object.entries(kept.shared).map(([key, v]) => ({ at: [...from, key], to: [...SHARED_PRS_PATH, key], v, shared: true }));
    if (Object.keys(kept.value).length || !moves.length) moves.unshift({ at: from, to: tab.view.settingsPath, v: kept.value, shared: false });
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
// view's start, then the repo's entry in repos; a later one wins.
export function startSettings(config, view, repo) {
  return { ...START_DEFAULTS, ...config.start, ...view.start, ...(config.repos[repo] ?? {}) };
}
