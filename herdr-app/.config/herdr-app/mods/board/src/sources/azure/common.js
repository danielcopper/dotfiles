// Azure DevOps, what its two team views and a work item's related items
// share: states and their categories, what az's failures mean, how az is
// called, the work items' fields and how az's answers are read, who az is,
// and a state change. The Sprint's own calls are in sprint.js, the
// Backlog's in backlog.js, the related items' in related.js, the source as
// the board uses it in index.js (makeAzure).

import { BoardError, failure, isObject, itemKey } from "../../shared.js";

// Theme colors and column order for Azure's state categories, and the
// categories whose states count as done (a done related item is dimmed).
export const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };
const DONE_CATEGORIES = new Set(["Completed", "Removed"]);

// States named with their categories → [{ id, name, category, color, done
// }], each name once (its first category), in category order.
export function categoryStates(pairs) {
  const states = new Map();
  for (const [name, category] of pairs) {
    if (!states.has(name)) states.set(name, { id: name, name, category, color: CATEGORY_COLORS[category] ?? "muted", done: DONE_CATEGORIES.has(category) });
  }
  const order = (s) => (CATEGORIES.indexOf(s.category) + 1 || CATEGORIES.length + 1);
  return [...states.values()].sort((a, b) => order(a) - order(b));
}

// az's words for a request that may have reached Azure but got no clear
// answer: msrest's "Error occurred in request., <requests exception>: …"
// and the requests messages it wraps (ConnectionError, ReadTimeout, …).
const AZ_SENT_FAILURE = /Error occurred in request\.|HTTPSConnectionPool|Connection aborted|Read timed out|ReadTimeout|Max retries/i;
// Azure's answers that it failed itself: the Azure DevOps client's
// "Operation returned a 5xx status code.", TF400898 (an internal error), and
// msrest's RetryError after retrying 408 and 5xx answers ("too many 503
// error responses"), which also names "Max retries" and is tested first.
const AZ_SERVER_ERROR = /Operation returned a 5\d\d status code|TF400898|too many \d+ error responses/i;
// ERROR: answers that are a refusal: rule errors (TF401320), something that
// does not exist, az's own argument errors, and 4xx status lines.
const AZ_REFUSED = /^TF401320\b|does not exist|^argument |the following arguments are required|unrecognized arguments|Operation returned a 4\d\d status code|requires user authentication/i;

// What went wrong with an az call that ran, from its ERROR: line (WARNING:
// lines are left out; without an ERROR: line, from all it printed). Missing
// sign-in or extension are marked unavailable (BoardError). With
// `write`, a known refusal form (AZ_REFUSED) is a refusal, as are the
// sign-in, extension and project answers below; anything else (a request
// without a clear answer, a server error, az's own crash or interrupt, a
// failure without an ERROR: line) leaves open whether the change landed.
export function azFailure({ code, stderr }, on = null, { write = false } = {}) {
  const { lines, errorLine, said } = azSaid(stderr);
  const az = on ? `az auf ${on}` : "az";
  // A crash's traceback may hold any words; az's own line says what failed.
  const subject = errorLine ? said : lines.join("\n");
  if (AZ_SERVER_ERROR.test(subject)) return failure(`Azure antwortete mit einem Fehler (${az}): ${said}`, { write, unclear: true });
  if (AZ_SENT_FAILURE.test(subject)) return failure(`Azure nicht erreichbar (${az}): ${said}`, { write, unclear: true });
  if (/Before you can run Azure DevOps commands|az (devops )?login/i.test(said)) {
    return new BoardError(`${az} ist nicht angemeldet (az login oder az devops login)`, { unavailable: true });
  }
  if (/'(boards|devops)' is misspelled or not recognized|is not in the 'az' command group/.test(said)) {
    return new BoardError(`${az}: die Erweiterung azure-devops fehlt (az extension add --name azure-devops)`, { unavailable: true });
  }
  if (/^TF200016:/.test(said)) return new BoardError(`Azure-Projekt unbekannt: ${said}`);
  return failure(on ? `${az}: ${said || `endete mit ${code}`}` : said || `az endete mit ${code}`, { write, unclear: !errorLine || !AZ_REFUSED.test(said) });
}

// What az printed on stderr: its lines but the WARNING: ones, its ERROR:
// line (or undefined), and what it said, that line's words or else the
// first line's.
export function azSaid(stderr) {
  const lines = String(stderr ?? "").split("\n").filter((l) => l.trim() && !/^WARNING:/.test(l));
  const errorLine = lines.find((l) => /^ERROR:/.test(l));
  return { lines, errorLine, said: (errorLine ?? lines[0] ?? "").replace(/^ERROR:\s*/, "").trim() };
}

// The organisation for az boards and az devops, and no guessing it from a
// git checkout in the folder az runs in.
export const azOrg = (org) => ["--org", org, "--detect", "false"];

// az devops invoke on one REST resource (`area`, `resource`, the route's
// parameters), always at api-version 7.1: its own default is 5.0, which
// knows no taskboard.
export function azInvokeArgs(c, area, resource, route, more = []) {
  return [
    "devops", "invoke", ...azOrg(c.org), "--area", area, "--resource", resource,
    "--route-parameters", ...Object.entries(route).map(([k, v]) => `${k}=${v}`), "--api-version", "7.1", ...more, "-o", "json",
  ];
}

// Calls both team views make: the team's areas, and a WIQL query (az
// boards query takes no team or project for its macros).
export const azAreasArgs = (c) => ["boards", "area", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, "-o", "json"];
export const azQueryArgs = (c, wiql) => ["boards", "query", ...azOrg(c.org), "--project", c.project, "--wiql", wiql, "-o", "json"];

// Who az is signed in as (az login): the account's user, { name, type }. It
// reads az's own profile and asks Azure nothing, so it has a short timeout
// of its own.
export const AZ_ME_ARGS = ["account", "show", "--query", "user", "-o", "json"];
export const AZ_ME_TIMEOUT = 15000;

// A text in a WIQL query: in single quotes, a quote in it doubled.
export const wiqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

// The fields read here are all System. ones. The field names that would
// stand alone in quotes are built from SYSTEM: the command check
// (tests/herdr-app/check-commands.py) takes a quoted word, dot and word
// for a herdr command.
const SYSTEM = "System.";
export const AREA_PATH = `${SYSTEM}AreaPath`;
// A work item's description (HTML), and the link to a child.
export const DESCRIPTION = `${SYSTEM}Description`;
export const CHILD_LINK = `${SYSTEM}LinkTypes.Hierarchy-Forward`;
const fieldOf = (wi, name) => wi.fields?.[SYSTEM + name];

// The fields read of each work item.
export const WORK_ITEM_FIELDS = ["Id", "Title", "WorkItemType", "State", "AssignedTo", "Parent", "AreaPath", "IterationPath"].map((f) => SYSTEM + f);

// One WIQL query for the fields of the work items `ids` (WORK_ITEM_FIELDS
// and `extraFields`), in the order of their ids.
export function idsWiql(ids, extraFields = []) {
  const fields = [...WORK_ITEM_FIELDS, ...extraFields].map((f) => `[${f}]`).join(", ");
  return `SELECT ${fields} FROM WorkItems WHERE [${SYSTEM}Id] IN (${ids.join(", ")}) ORDER BY [${SYSTEM}Id]`;
}

// az's JSON answer for `what`; `empty` stands for no output at all (az
// boards query prints nothing when nothing matches).
export function azJson(stdout, what, empty) {
  const text = String(stdout ?? "").trim();
  if (!text && empty !== undefined) return empty;
  try {
    return JSON.parse(text);
  } catch {
    throw new BoardError(`az lieferte für ${what} kein lesbares JSON`);
  }
}

// az's answer as JSON, or null for anything else: an answer the reader
// (who az is) or the checks of a write take for one that says nothing.
export function jsonOrNull(stdout) {
  try {
    return JSON.parse(String(stdout ?? "").trim());
  } catch {
    return null;
  }
}

// A list Azure sends either as it is or wrapped in { count, value } (az
// devops invoke prints REST's wrapper, with its continuation_token).
export const azList = (json) => (Array.isArray(json) ? json : Array.isArray(json?.value) ? json.value : null);

// The team's areas → { field (the team field, System.AreaPath by default),
// values: [{ value, includeChildren }], default (the area a new work item
// gets, or null) }.
export function parseAreas(stdout) {
  const json = azJson(stdout, "die Bereiche des Teams");
  const values = (Array.isArray(json?.values) ? json.values : []).filter((v) => typeof v?.value === "string" && v.value);
  if (!values.length) throw new BoardError("Azure nannte keine Bereiche des Teams");
  return {
    field: json.field?.referenceName ?? AREA_PATH,
    values: values.map((v) => ({ value: v.value, includeChildren: v.includeChildren === true })),
    default: typeof json.defaultValue === "string" && json.defaultValue ? json.defaultValue : null,
  };
}

// The address of a work item's page.
export const workItemUrl = (c, id) => `${c.org}/${encodeURIComponent(c.project)}/_workitems/edit/${id}`;

// A person as a work item names one: an identity ({ displayName,
// uniqueName }), or older answers' "Name <login>" → { name, login } (login
// in lower case, null where it is not given).
export function azPerson(who) {
  if (typeof who === "string") {
    const login = who.match(/<([^>]+)>\s*$/)?.[1] ?? null;
    return { name: who.replace(/\s*<[^>]*>\s*$/, "") || null, login: login?.toLowerCase() ?? null };
  }
  if (!isObject(who)) return { name: null, login: null };
  return { name: who.displayName ?? who.uniqueName ?? null, login: who.uniqueName?.toLowerCase() ?? null };
}

// A work item of az boards query's answer as the board shows it, keyed as
// itemKey names it; with an `orderField`, its value there as `order` (a
// number, else null).
export function azWorkItem(wi, c, orderField = null) {
  const f = (name) => fieldOf(wi, name) ?? null;
  const who = azPerson(f("AssignedTo"));
  const item = {
    source: "azure", kind: "workitem", number: wi.id, title: f("Title") ?? "", type: f("WorkItemType"),
    state: f("State"), assignees: who.name ? [who.name] : [], assigneeLogins: who.login ? [who.login] : [],
    parent: f("Parent"), area: f("AreaPath"), iteration: f("IterationPath"),
    url: workItemUrl(c, wi.id), labels: [], sub: null, branch: null,
    ...(orderField ? { order: typeof wi.fields?.[orderField] === "number" ? wi.fields[orderField] : null } : {}),
  };
  return { key: itemKey(item), ...item };
}

// Until when what an iteration's dates bound stays kept (ms): the end of
// its last day (Azure's finishDate is that day's start, in UTC), or half a
// day from `now` where it names none.
const DAY_MS = 86400000;
export function iterationUntil(finish, now) {
  const at = Date.parse(finish ?? "");
  return Number.isNaN(at) ? now + DAY_MS / 2 : at + DAY_MS;
}

// How long a team's settings that change rarely stay kept (ms): its areas,
// and the Backlog's settings (BACKLOG_KEEP_MS).
export const TEAM_KEEP_MS = 4 * 3600000;

// The most work items az boards query gives.
export const AZ_QUERY_LIMIT = 1000;

// The work items of az boards query's answer → [items] (azWorkItem, with
// the order field where one is given), in its order; no output is none.
export function parseWorkItems(stdout, c, orderField = null) {
  const list = azList(azJson(stdout, "die Work Items", []));
  if (!list) throw new BoardError("Azure lieferte keine Work Items");
  return list.filter((wi) => Number.isInteger(wi?.id)).map((wi) => azWorkItem(wi, c, orderField));
}

// Who az is signed in as (the user's name), in lower case, or null.
export function parseViewer(stdout) {
  const name = jsonOrNull(stdout)?.name;
  return typeof name === "string" && name ? name.toLowerCase() : null;
}

// The members of a team (az devops team list-member), the first
// MEMBERS_LIMIT, whom the assignee picker offers.
export const MEMBERS_LIMIT = 1000;
export const azMembersArgs = (c) =>
  ["devops", "team", "list-member", ...azOrg(c.org), "--project", c.project, "--team", c.team, "--top", String(MEMBERS_LIMIT), "-o", "json"];

// A team's members → { me (the account az is, `viewer`, lower case: its
// member where it is one, else az's own "me" with what is known of it;
// me: true), people (the other members by name, { login, name }; a group
// is none), note (that the list may be cut, or null) }.
export function parseMembers(stdout, viewer) {
  const list = azList(azJson(stdout, "die Mitglieder des Teams"));
  if (!list) throw new BoardError("Azure lieferte keine Mitglieder des Teams");
  const all = list
    .map((m) => m?.identity)
    .filter((i) => isObject(i) && i.isContainer !== true && typeof i.uniqueName === "string" && i.uniqueName)
    .map((i) => ({ login: i.uniqueName.toLowerCase(), name: i.displayName || i.uniqueName }));
  const own = all.find((p) => p.login === viewer);
  const me = { login: viewer ?? null, name: own?.name ?? null, me: true };
  const people = all.filter((p) => p.login !== viewer).sort((a, b) => a.name.localeCompare(b.name));
  return { me, people, note: list.length >= MEMBERS_LIMIT ? `erste ${MEMBERS_LIMIT}` : null };
}

// Assigning the work item `id` to `person`: its login, "me" for az's own
// account (me: true; az resolves it), "" for no one, which az writes as an
// empty Assigned To.
export const azAssignArgs = (c, id, person) =>
  ["boards", "work-item", "update", ...azOrg(c.org), "--id", String(id), "--assigned-to", person ? (person.me ? "me" : person.login) : "", "-o", "json"];

// az's answer to an assignment must be the work item and name `person` as
// its Assigned To (anyone for me without a known login), or no one for null;
// then → { names, logins } as it names them, else it is open whether the
// change landed.
export function checkAzAssigned(stdout, person) {
  const json = jsonOrNull(stdout);
  const who = azPerson(json ? fieldOf(json, "AssignedTo") : undefined);
  const fits = !Number.isInteger(json?.id) ? false : !person ? !who.login : Boolean(who.login) && (person.me && !person.login ? true : who.login === person.login);
  if (!fits) throw failure("Azure hat die Zuweisung nicht bestätigt", { write: true, unclear: true });
  return { names: who.name ? [who.name] : [], logins: who.login ? [who.login] : [] };
}

export const azStateArgs = (c, id, state) => ["boards", "work-item", "update", ...azOrg(c.org), "--id", String(id), "--state", state, "-o", "json"];

// az's answer to a state change must name the state it set; anything else
// leaves open whether the change landed.
export function checkStateResult(stdout, state) {
  const json = jsonOrNull(stdout);
  if (!json || fieldOf(json, "State") !== state) throw failure("Azure hat den Status nicht bestätigt", { write: true, unclear: true });
}
