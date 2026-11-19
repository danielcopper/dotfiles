// views.json: reading it, what is wrong with it, and the start settings for
// an item.

import { CONFIG_NAME, isObject, isText, textList } from "./shared.js";

export const START_DEFAULTS = { agent: null, machine: null, open: "space", checkout: null, message: "", review: "" };
const START_KEYS = Object.keys(START_DEFAULTS);
// Keys of the start that made a worktree or set the status; the agent's own
// skills do both now.
const GONE = "gibt es nicht mehr: der Start öffnet eine Sitzung im Checkout, den Worktree legt der Agent an";
const GONE_START = ["branch", "worktree", "base"];
const GONE_STATUS = "„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst";
const TOP_KEYS = ["refreshMinutes", "start", "repos", "views"];

function startProblems(start, where) {
  if (start === undefined) return [];
  if (!isObject(start)) return [`„${where}“ muss ein Objekt sein`];
  const out = [];
  for (const [key, value] of Object.entries(start)) {
    if (GONE_START.includes(key)) out.push(`„${where}.${key}“ ${GONE}`);
    else if (!START_KEYS.includes(key)) out.push(`„${where}.${key}“ gibt es nicht`);
    else if (value !== null && typeof value !== "string") out.push(`„${where}.${key}“ muss Text sein`);
  }
  if (start.open !== undefined && start.open !== "space" && start.open !== "tab") out.push(`„${where}.open“ ist "space" oder "tab"`);
  return out;
}

const textProblems = (v, keys) => keys.filter((k) => v[k] !== undefined && v[k] !== null && typeof v[k] !== "string").map((k) => `„${k}“ muss Text sein`);

// Keys every view may have; each kind adds its own (VIEW_KINDS).
const COMMON_KEYS = ["id", "name", "source", "layout", "hide", "limit", "start"];

// Per view kind ("<source> <layout>"): its own keys, what is wrong with them,
// and its fields with their defaults filled in.
const VIEW_KINDS = {
  "github board": {
    keys: ["project", "filter"],
    problems(v) {
      const p = v.project;
      const out = [];
      if (!isObject(p) || !isText(p.owner) || !Number.isInteger(p.number) || p.number < 1) {
        out.push("„project“ braucht „owner“ (Text) und „number“ (ganze Zahl)");
      } else if (p.field !== undefined && !isText(p.field)) out.push("„project.field“ muss Text sein");
      return [...out, ...textProblems(v, ["filter"])];
    },
    defaults: (v) => ({
      project: { owner: v.project.owner, number: v.project.number, field: v.project.field ?? "Status" },
      filter: v.filter ?? "",
      limit: v.limit ?? 100,
    }),
  },
  "github list": {
    keys: ["sections"],
    problems: (v) =>
      Array.isArray(v.sections) && v.sections.length && v.sections.every((s) => isObject(s) && isText(s.name) && isText(s.query))
        ? []
        : ["„sections“ braucht Einträge mit „name“ und „query“"],
    defaults: (v) => ({ sections: v.sections.map((s) => ({ name: s.name, query: s.query })), limit: v.limit ?? 50 }),
  },
  "azure board": {
    keys: ["where", "hideCategories", "organization", "project", "on"],
    problems: (v) => textProblems(v, ["where", "organization", "project", "on"]),
    defaults: (v) => ({
      where: v.where ?? "[System.AssignedTo] = @Me",
      hideCategories: v.hideCategories ?? [],
      organization: v.organization ?? null,
      project: v.project ?? null,
      on: v.on ?? null,
      limit: v.limit ?? 100,
    }),
  },
};

// A view's kind, the key of VIEW_KINDS.
export const viewKind = (v) => `${v.source} ${v.layout}`;

function viewProblems(v) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const out = [];
  if (!isText(v.id)) out.push("„id“ fehlt");
  if (!isText(v.name)) out.push("„name“ fehlt");
  if (v.source !== "github" && v.source !== "azure") out.push("„source“ ist \"github\" oder \"azure\"");
  if (v.layout !== "board" && v.layout !== "list") out.push("„layout“ ist \"board\" oder \"list\"");
  if (v.source === "azure" && v.layout === "list") out.push("Azure-Ansichten sind Boards (\"layout\": \"board\")");
  const kind = VIEW_KINDS[viewKind(v)];
  if (!kind) return out;
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (key === "on" && v.source === "github") out.push("„on“ gilt nur für Azure-Ansichten");
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  for (const key of ["hide", "hideCategories"]) {
    if (v[key] !== undefined && !textList(v[key])) out.push(`„${key}“ muss eine Liste von Texten sein`);
  }
  if (v.limit !== undefined && !(Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= 100)) out.push("„limit“ ist eine ganze Zahl von 1 bis 100");
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start")];
}

function normalizeView(v) {
  const common = { id: v.id, name: v.name, source: v.source, layout: v.layout, hide: v.hide ?? [], start: v.start ?? {}, hideCategories: [], on: null };
  return { ...common, ...VIEW_KINDS[viewKind(v)].defaults(v) };
}

// views.json as text (null: there is none) → { config, errors }. A view with
// problems is left out and each problem is listed; config is null only when
// nothing usable is left.
export function readConfig(text) {
  if (text === null || text === undefined) return { config: null, errors: [`${CONFIG_NAME}.json fehlt im Ordner der Mod`] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { config: null, errors: [`${CONFIG_NAME}.json ist kein gültiges JSON: ${e.message}`] };
  }
  return validateConfig(raw);
}

export function validateConfig(raw) {
  if (!isObject(raw)) return { config: null, errors: ["Oben muss ein Objekt stehen"] };
  const errors = Object.keys(raw).filter((k) => !TOP_KEYS.includes(k)).map((k) => `„${k}“ gibt es nicht`);
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
  const views = [];
  if (!Array.isArray(raw.views) || !raw.views.length) errors.push("„views“ braucht mindestens eine Ansicht");
  const ids = new Set();
  (Array.isArray(raw.views) ? raw.views : []).forEach((v, i) => {
    const where = `Ansicht ${i + 1}${isText(v?.name) ? ` („${v.name}“)` : ""}`;
    const problems = viewProblems(v);
    if (!problems.length && ids.has(v.id)) problems.push(`„id“ ${v.id} gibt es schon`);
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    ids.add(v.id);
    views.push(normalizeView(v));
  });
  const start = startErrors.length ? {} : raw.start ?? {};
  return { config: views.length ? { refreshMinutes, start, repos, views } : null, errors };
}

// The start for an item: the defaults, then views.json's start, then the
// view's start, then the repo's entry in repos; a later one wins.
export function startSettings(config, view, repo) {
  return { ...START_DEFAULTS, ...config.start, ...view.start, ...(config.repos[repo] ?? {}) };
}
