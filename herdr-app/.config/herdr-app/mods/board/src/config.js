// views.json: reading it with this machine's settings over it, what is
// wrong with them, and the start settings for an item.

import { CONFIG_NAME, PAGE, SECTION_TONES, SECTION_TONE_ORDER, isObject, isText, textList } from "./shared.js";
import { viewDefaults, viewKind } from "./kinds/index.js";
import { entryById, mergeSettings, readSettings } from "./settings.js";

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
  "„sources.github.views“, Azure in „sources.azure“ mit „org“ und „contexts“ (Kopf von mods/board/src/main.js)";

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

// Keys every GitHub view may have; each kind adds its own (VIEW_KINDS).
// "source" may stay from views.json's first form, as "github".
const COMMON_KEYS = ["id", "name", "source", "layout", "hide", "limit", "start"];

// The most items a board reads, and its default limit: ten of GitHub's
// pages (PAGE).
const BOARD_LIMIT = 10 * PAGE;

// A list section's keys, and the tones it may take, as an error names them.
const SECTION_KEYS = ["name", "query", "tone"];
const TONE_NAMES = Object.keys(SECTION_TONES).map((n) => `"${n}"`).join(", ").replace(/, ([^,]+)$/, " oder $1");

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
// kinds/index.js, says how it shows): its own keys, what is wrong with them,
// its fields with their defaults filled in, and the largest `limit` it takes:
// a board's is the most items it reads, in pages of up to PAGE, one gh call
// each, at most as many calls as full pages would take; a list's is each
// search's `first`, one page.
const VIEW_KINDS = {
  "github board": {
    keys: ["project", "filter"],
    maxLimit: BOARD_LIMIT,
    problems(v) {
      const p = v.project;
      const out = [];
      if (!isObject(p) || !isText(p.owner) || !Number.isInteger(p.number) || p.number < 1) {
        out.push("„project“ braucht „owner“ (Text) und „number“ (ganze Zahl)");
      } else {
        out.push(...["field", "priorityField"].filter((k) => p[k] !== undefined && !isText(p[k])).map((k) => `„project.${k}“ muss Text sein`));
      }
      return [...out, ...textProblems(v, ["filter"])];
    },
    defaults: (v) => ({
      project: {
        owner: v.project.owner, number: v.project.number, field: v.project.field ?? "Status", priorityField: v.project.priorityField ?? "Priority",
        // A project may lack the default one: only a named one it lacks is told.
        priorityGiven: v.project.priorityField !== undefined,
      },
      filter: v.filter ?? "",
      limit: v.limit ?? BOARD_LIMIT,
    }),
  },
  "github list": {
    keys: ["sections"],
    maxLimit: PAGE,
    problems(v) {
      if (!(Array.isArray(v.sections) && v.sections.length && v.sections.every((s) => isObject(s) && isText(s.name) && isText(s.query)))) {
        return ["„sections“ braucht Einträge mit „name“ und „query“"];
      }
      return v.sections.flatMap((s) => [
        ...Object.keys(s).filter((k) => !SECTION_KEYS.includes(k)).map((k) => `Abschnitt „${s.name}“: „${k}“ gibt es nicht`),
        ...(s.tone === undefined || Object.hasOwn(SECTION_TONES, s.tone) ? [] : [`Abschnitt „${s.name}“: „tone“ ist ${TONE_NAMES}`]),
      ]);
    },
    defaults: (v) => ({ sections: sectionsWithTones(v.sections), limit: v.limit ?? 50 }),
  },
};

// The layouts a GitHub view may have, from VIEW_KINDS.
const GITHUB_LAYOUTS = Object.keys(VIEW_KINDS).map((k) => k.slice("github ".length));

function viewProblems(v) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const out = [];
  if (!isText(v.id)) out.push("„id“ fehlt");
  if (!isText(v.name)) out.push("„name“ fehlt");
  if (v.source !== undefined && v.source !== "github") out.push("„source“ ist hier \"github\" oder fehlt");
  const kind = VIEW_KINDS[viewKind({ source: "github", layout: v.layout })];
  if (!kind) return [...out, `„layout“ ist ${GITHUB_LAYOUTS.map((l) => `"${l}"`).join(" oder ")}`];
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  if (v.hide !== undefined && !textList(v.hide)) out.push("„hide“ muss eine Liste von Texten sein");
  if (v.limit !== undefined && !(Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= kind.maxLimit)) out.push(`„limit“ ist eine ganze Zahl von 1 bis ${kind.maxLimit}`);
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start")];
}

function normalizeView(v) {
  const common = { ...viewDefaults(), id: v.id, name: v.name, source: "github", layout: v.layout };
  if (v.hide !== undefined) common.hide = v.hide;
  if (v.start !== undefined) common.start = v.start;
  return { ...common, ...VIEW_KINDS[viewKind(common)].defaults(v) };
}

// sources.github → { github: { views } or null, errors }. A view with
// problems is left out and each problem is listed.
function readGithub(raw) {
  if (!isObject(raw)) return { github: null, errors: ["„sources.github“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => k !== "views").map((k) => `„sources.github.${k}“ gibt es nicht`);
  if (!Array.isArray(raw.views) || !raw.views.length) errors.push("„sources.github.views“ braucht mindestens eine Ansicht");
  const views = [];
  (Array.isArray(raw.views) ? raw.views : []).forEach((v, i) => {
    const where = `GitHub-Ansicht ${i + 1}${isText(v?.name) ? ` („${v.name}“)` : ""}`;
    const problems = viewProblems(v);
    if (!problems.length && entryById(raw.views, v.id) !== v) problems.push(`„id“ ${v.id} gibt es schon`);
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    views.push(normalizeView(v));
  });
  return { github: views.length ? { views } : null, errors };
}

// The views a team context may show, in the order of its switch: the id
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

// What is wrong with an entry of sources.azure.contexts: { "team": {
// project, team }, "views"?: [...], "repoFolders"?: [...] } or { "prs": {
// project } }.
function contextProblems(c) {
  if (!isObject(c)) return ["muss ein Objekt sein"];
  const kinds = ["team", "prs"].filter((k) => c[k] !== undefined);
  if (kinds.length !== 1) return ["braucht genau eins von „team“ und „prs“"];
  const kind = kinds[0];
  const keys = kind === "team" ? ["team", "views", "repoFolders"] : ["prs"];
  const fields = kind === "team" ? ["project", "team"] : ["project"];
  const out = Object.keys(c).filter((k) => !keys.includes(k)).map((k) => `„${k}“ gibt es nicht`);
  const inner = c[kind];
  if (!isObject(inner) || !fields.every((f) => isText(inner[f]))) out.push(`„${kind}“ braucht ${fields.map((f) => `„${f}“`).join(" und ")} (Text)`);
  else out.push(...Object.keys(inner).filter((k) => !fields.includes(k)).map((k) => `„${kind}.${k}“ gibt es nicht`));
  const views = c.views;
  if (views !== undefined && !(textList(views) && views.length && views.every((v) => TEAM_VIEW_IDS.includes(v)) && new Set(views).size === views.length)) {
    out.push(`„views“ ist eine Liste aus ${TEAM_VIEWS_TEXT}, jede höchstens einmal`);
  }
  if (kind === "team" && !repoFoldersOk(c.repoFolders)) out.push(`„repoFolders“ ${REPO_FOLDERS_TEXT}`);
  return out;
}

// The name of a context's tab, from an entry of sources.azure.contexts as
// it stands ("" when it names neither): the team, or "PRs · <project>".
function contextName(c) {
  if (isObject(c?.team) && isText(c.team.team)) return c.team.team;
  return isObject(c?.prs) && isText(c.prs.project) ? `PRs · ${c.prs.project}` : "";
}

// A context as the board uses it: { id, source: "azure", kind: "team",
// name, org, project, team, views, repoFolders } or { id, source: "azure",
// kind: "prs", name, org, project }; views in the switch's order, org the
// organisation's address (orgUrl).
function normalizeContext(c, org, folders) {
  const name = contextName(c);
  if (c.team) {
    const views = c.views ?? TEAM_VIEW_IDS;
    const { project, team } = c.team;
    const repoFolders = c.repoFolders ? trimFolders(c.repoFolders) : folders;
    return { id: `azure:team:${project}/${team}`, source: "azure", kind: "team", name, org, project, team, views: TEAM_VIEW_IDS.filter((v) => views.includes(v)), repoFolders };
  }
  return { id: `azure:prs:${c.prs.project}`, source: "azure", kind: "prs", name, org, project: c.prs.project };
}

// An organisation's address: https://<host>/<organisation>, a trailing /
// dropped; null for anything else.
function orgUrl(value) {
  const url = isText(value) ? value.trim().replace(/\/+$/, "") : "";
  return /^https:\/\/[^/\s]+\/[^/\s]+$/.test(url) ? url : null;
}

// sources.azure → { azure: { org, contexts } or null, errors }. Without a
// valid org (orgUrl) nothing of it is usable; a context with problems is left out and
// each problem is listed.
function readAzure(raw) {
  if (!isObject(raw)) return { azure: null, errors: ["„sources.azure“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => !["org", "contexts", "repoFolders"].includes(k)).map((k) => `„sources.azure.${k}“ gibt es nicht`);
  const org = orgUrl(raw.org);
  const foldersOk = repoFoldersOk(raw.repoFolders);
  if (!foldersOk) errors.push(`„sources.azure.repoFolders“ ${REPO_FOLDERS_TEXT}`);
  const folders = foldersOk && raw.repoFolders ? trimFolders(raw.repoFolders) : [];
  if (!org) errors.push("„sources.azure.org“ ist die Adresse der Organisation, etwa https://dev.azure.com/<Organisation>");
  if (!Array.isArray(raw.contexts) || !raw.contexts.length) {
    errors.push("„sources.azure.contexts“ braucht mindestens einen Eintrag: { \"team\": { \"project\", \"team\" } } oder { \"prs\": { \"project\" } }");
  }
  const contexts = [];
  (Array.isArray(raw.contexts) ? raw.contexts : []).forEach((c, i) => {
    const name = contextName(c);
    const where = `Azure-Kontext ${i + 1}${name ? ` („${name}“)` : ""}`;
    const problems = contextProblems(c);
    const context = problems.length ? null : normalizeContext(c, org, folders);
    if (context && contexts.some((x) => x.id === context.id)) problems.push("gibt es schon");
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    contexts.push(context);
  });
  // Teams of one name in different projects: their tabs name the project.
  for (const c of contexts) {
    if (c.kind === "team" && contexts.some((x) => x !== c && x.kind === "team" && x.team === c.team)) c.name = `${c.team} · ${c.project}`;
  }
  return { azure: org && contexts.length ? { org, contexts } : null, errors };
}

// views.json as text (null: there is none) and this machine's settings as
// read (`settingsRead`: { name, text }, text null for no file, or { name,
// error }) → { config, errors, settings, origin }: config is {
// refreshMinutes, start, repos, azure: { org, contexts } or null, github: {
// views } or null }, settings those applied (null: none), origin
// mergeSettings's. A view or context with problems is left out and each
// problem is listed; config is null only when nothing usable is left.
export function readConfig(text, settingsRead = null) {
  const none = (error) => ({ config: null, errors: [error], settings: null, origin: mergeSettings(null, {}).origin });
  if (text === null || text === undefined) return none(`${CONFIG_NAME}.json fehlt im Ordner der Mod`);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return none(`${CONFIG_NAME}.json ist kein gültiges JSON: ${e.message}`);
  }
  const alone = { ...validateConfig(raw), settings: null, origin: mergeSettings(raw, {}).origin };
  if (!settingsRead) return alone;
  const { name } = settingsRead;
  const named = (errors) => errors.map((e) => `${name}: ${e}`);
  const unused = (errors) => ({ ...alone, errors: [...alone.errors, ...errors, settingsAlone(name)] });
  if (settingsRead.error !== undefined) return unused([`${name} ließ sich nicht lesen: ${settingsRead.error}`]);
  const { settings, errors } = readSettings(settingsRead.text, name);
  if (!settings) return unused(errors);
  const { merged, errors: unmatched, origin } = mergeSettings(raw, settings);
  const read = validateConfig(merged);
  const added = read.errors.filter((e) => !alone.errors.includes(e));
  if (added.length) return unused(named([...unmatched, ...added]));
  return { ...read, errors: [...read.errors, ...named(unmatched)], settings, origin };
}

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
    if (!azure && !github) errors.push("„sources“ braucht mindestens eine Ansicht: in „sources.azure.contexts“ oder „sources.github.views“");
  } else if (raw.sources !== undefined) errors.push("„sources“ muss ein Objekt sein");
  else if (!old) errors.push("„sources“ fehlt: „sources.azure“ oder „sources.github“");
  const start = startErrors.length ? {} : raw.start ?? {};
  return { config: azure || github ? { refreshMinutes, start, repos, azure, github } : null, errors };
}

// The GitHub views of a config (none without one).
export const githubViews = (config) => config?.github?.views ?? [];

export const hidePath = (view) => ["sources", "github", "views", view.id, "hide"];

// The start for an item: the defaults, then views.json's start, then the
// view's start, then the repo's entry in repos; a later one wins.
export function startSettings(config, view, repo) {
  return { ...START_DEFAULTS, ...config.start, ...view.start, ...(config.repos[repo] ?? {}) };
}
