// Azure DevOps: work item types and states, the WIQL board, the state
// change, and what az's failures mean.

import { BoardError, failure } from "../shared.js";

// Theme colors and column order for Azure's state categories.
export const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };

// The fields read here are all `System.` ones; they are read through this so
// the prefix stays in one place.
const SYSTEM = "System.";
const field = (fields, name) => fields?.[SYSTEM + name];
const FIELDS = ["Id", "Title", "State", "WorkItemType", "AssignedTo", "Tags", "TeamProject"].map((f) => `[${SYSTEM}${f}]`).join(", ");

// --detect false: use az's configured defaults, never the git remote of
// whatever folder herdr runs az in.
const azScope = (view, withProject = true) => [
  "--detect", "false",
  ...(view.organization ? ["--org", view.organization] : []),
  ...(withProject && view.project ? ["--project", view.project] : []),
];

export const azureDefaultsArgs = () => ["devops", "configure", "--list"];

// `az devops configure --list` → { organization, project } (null when unset).
export function parseAzureDefaults(stdout) {
  const value = (name) => String(stdout ?? "").match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, "m"))?.[1] || null;
  return { organization: value("organization"), project: value("project") };
}

export function azureTypesArgs(view, project) {
  return ["devops", "invoke", "--area", "wit", "--resource", "workitemtypes", "--route-parameters", `project=${project}`,
    "-o", "json", ...azScope(view, false)];
}

// The work item types' answer → { states: [{ id, name, category, color }] in
// category order, types: { [type]: [state names] } }.
export function parseAzureTypes(stdout) {
  const types = {};
  const states = new Map();
  const value = JSON.parse(stdout)?.value;
  if (!Array.isArray(value)) throw new BoardError("Azure lieferte keine Work-Item-Typen");
  for (const type of value) {
    types[type.name] = (type.states ?? []).map((s) => s.name);
    for (const s of type.states ?? []) {
      if (!states.has(s.name)) states.set(s.name, { id: s.name, name: s.name, category: s.category, color: CATEGORY_COLORS[s.category] ?? "muted" });
    }
  }
  const order = (s) => (CATEGORIES.indexOf(s.category) + 1 || CATEGORIES.length + 1);
  return { states: [...states.values()].sort((a, b) => order(a) - order(b)), types };
}

const wiqlText = (value) => `'${value.replace(/'/g, "''")}'`;

export function azureQueryArgs(view, hidden) {
  const names = [...hidden];
  const without = names.length ? ` AND [${SYSTEM}State] NOT IN (${names.map(wiqlText).join(", ")})` : "";
  const wiql = `SELECT ${FIELDS} FROM WorkItems WHERE (${view.where})${without} ORDER BY [${SYSTEM}ChangedDate] DESC`;
  return ["boards", "query", "--wiql", wiql, "-o", "json", ...azScope(view)];
}

// The web page of a work item from its API url and project:
// https://dev.azure.com/<org>[/<project id>]/_apis/wit/workItems/<id>
// → https://dev.azure.com/<org>/<project>/_workitems/edit/<id>.
export function azureWebUrl(apiUrl, project, id) {
  if (!apiUrl || !apiUrl.includes("/_apis/")) return null;
  const base = apiUrl.split("/_apis/")[0].replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "");
  return `${base}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}

const personName = (who) => (typeof who === "string" ? who.replace(/\s*<[^>]*>$/, "") : who?.displayName ?? null);

// `az boards query` output → a board whose columns are the states of the work
// item types it found, in category order; without work items it has none. az
// prints nothing at all when nothing matches. meta.types holds each type's
// states, the columns its cards may go to; meta.states all the types' states.
export function parseAzureBoard(stdout, types, hidden) {
  const items = String(stdout ?? "").trim() ? JSON.parse(stdout) : [];
  const cards = items.map((item) => {
    const f = item.fields ?? {};
    const project = field(f, "TeamProject") ?? "";
    const id = field(f, "Id") ?? item.id;
    return {
      key: `az-${id}`,
      source: "azure",
      kind: "workitem",
      number: id,
      repo: project,
      repoShort: project,
      title: field(f, "Title") ?? "",
      url: azureWebUrl(item.url, project, id),
      labels: String(field(f, "Tags") ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      assignees: [personName(field(f, "AssignedTo"))].filter(Boolean),
      type: field(f, "WorkItemType") ?? null,
      parent: null,
      sub: null,
      branch: null,
      column: field(f, "State") ?? "",
    };
  });
  const present = new Set(cards.map((c) => c.type));
  const wanted = new Set(Object.entries(types.types).filter(([t]) => present.has(t)).flatMap(([, s]) => s));
  const columns = types.states
    .filter((s) => wanted.has(s.name))
    .map((s) => ({ ...s, hidden: hidden.has(s.name), count: hidden.has(s.name) ? null : 0, target: true, cards: [] }));
  const byName = new Map(columns.map((c) => [c.name, c]));
  for (const card of cards) {
    let col = byName.get(card.column);
    if (!col) {
      col = { id: card.column, name: card.column, category: null, color: "muted", hidden: false, count: 0, target: true, cards: [] };
      columns.push(col);
      byName.set(col.name, col);
    }
    col.cards.push(card);
    if (!col.hidden) col.count++;
  }
  return { kind: "board", meta: { types: types.types, states: types.states }, columns, total: cards.length, limited: false };
}

export function azureMoveArgs(view, card, column) {
  return ["boards", "work-item", "update", "--id", String(card.number), "--state", column.name, "-o", "json", ...azScope(view, false)];
}

export const AZ_NO_PROJECT = "Azure-Projekt fehlt: „project“ in der Ansicht oder az devops configure --defaults project=…";
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
// sign-in or extension make the view unavailable rather than an error. With
// `write`, a known refusal form (AZ_REFUSED) is a refusal, as are the
// sign-in, extension and project answers below; anything else (a request
// without a clear answer, a server error, az's own crash or interrupt, a
// failure without an ERROR: line) leaves open whether the change landed.
export function azFailure({ code, stderr }, on = null, { write = false } = {}) {
  const lines = String(stderr ?? "").split("\n").filter((l) => l.trim() && !/^WARNING:/.test(l));
  const errorLine = lines.find((l) => /^ERROR:/.test(l));
  const said = (errorLine ?? lines[0] ?? "").replace(/^ERROR:\s*/, "").trim();
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
  if (/^--project must be specified/.test(said)) return new BoardError(AZ_NO_PROJECT);
  if (/^TF200016:/.test(said)) return new BoardError(`Azure-Projekt unbekannt: ${said}`);
  return failure(on ? `${az}: ${said || `endete mit ${code}`}` : said || `az endete mit ${code}`, { write, unclear: !errorLine || !AZ_REFUSED.test(said) });
}
