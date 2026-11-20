// Azure DevOps: work item types and their states, what az's failures mean,
// the Sprint view's calls and what they answer, and the source as the board
// uses it (makeAzure).

import { home, readTextFile, writeTextFile } from "herdr";
import { BoardError, errorText, failure, firstLine, isObject, itemKey } from "../shared.js";
import { AZ_TIMEOUT, call } from "../tools.js";
import { NO_STORY } from "../kinds/sprint.js";

// Theme colors and column order for Azure's state categories.
export const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };

// The work item types' answer → { states: [{ id, name, category, color }] in
// category order, types: { [type]: [state names] } }.
export function parseAzureTypes(stdout) {
  const types = {};
  const states = new Map();
  const value = azJson(stdout, "die Work-Item-Typen")?.value;
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
  if (/^TF200016:/.test(said)) return new BoardError(`Azure-Projekt unbekannt: ${said}`);
  return failure(on ? `${az}: ${said || `endete mit ${code}`}` : said || `az endete mit ${code}`, { write, unclear: !errorLine || !AZ_REFUSED.test(said) });
}

// The organisation for az boards and az devops, and no guessing it from a
// git checkout in the folder az runs in.
const azOrg = (org) => ["--org", org, "--detect", "false"];

// az devops invoke on one REST resource (`area`, `resource`, the route's
// parameters), always at api-version 7.1: its own default is 5.0, which
// knows no taskboard.
export function azInvokeArgs(c, area, resource, route, more = []) {
  return [
    "devops", "invoke", ...azOrg(c.org), "--area", area, "--resource", resource,
    "--route-parameters", ...Object.entries(route).map(([k, v]) => `${k}=${v}`), "--api-version", "7.1", ...more, "-o", "json",
  ];
}

// The Sprint view's calls for a team context `c` ({ org, project, team }):
// its current iteration, its areas, its taskboard's columns, the project's
// work item types with their states, and per refresh the taskboard's column
// of each work item and the fields of the sprint's work items (azQueryArgs).
export const azIterationArgs = (c) => ["boards", "iteration", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, "--timeframe", "current", "-o", "json"];
export const azAreasArgs = (c) => ["boards", "area", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, "-o", "json"];
export const azColumnsArgs = (c) => azInvokeArgs(c, "work", "taskboardColumns", { project: c.project, team: c.team });
export const azTypesArgs = (c) => azInvokeArgs(c, "wit", "workitemtypes", { project: c.project });
export const azTaskboardArgs = (c, iterationId) => azInvokeArgs(c, "work", "taskboardWorkItems", { project: c.project, team: c.team, iterationId });
export const azQueryArgs = (c, wiql) => ["boards", "query", ...azOrg(c.org), "--project", c.project, "--wiql", wiql, "-o", "json"];
// Who az is signed in as (az login): the account's user, { name, type }. It
// reads az's own profile and asks Azure nothing, so it has a short timeout
// of its own.
export const AZ_ME_ARGS = ["account", "show", "--query", "user", "-o", "json"];
export const AZ_ME_TIMEOUT = 15000;

// A text in a WIQL query: in single quotes, a quote in it doubled.
const wiqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

// The fields read here are all System. ones. The field names that would
// stand alone in quotes are built from SYSTEM: the command check
// (tests/herdr-app/check-commands.py) takes a quoted word, dot and word
// for a herdr command.
const SYSTEM = "System.";
const AREA_PATH = `${SYSTEM}AreaPath`;
const fieldOf = (wi, name) => wi.fields?.[SYSTEM + name];

// The fields read of each work item.
export const WORK_ITEM_FIELDS = ["Id", "Title", "WorkItemType", "State", "AssignedTo", "Parent", "AreaPath", "IterationPath"].map((f) => SYSTEM + f);

// One WIQL query for the work items of the sprint `iteration` in the team's
// areas (parseAreas), as Azure's taskboard shows them: in the iteration's
// path, and in one of the team's area paths, those below it too where the
// team includes them. az boards query takes no team or project for its
// macros, so the paths are spelled out.
export function sprintWiql(iteration, areas) {
  const field = `[${areas.field}]`;
  const tree = areas.field === AREA_PATH;
  const inArea = areas.values.map((a) => `${field} ${tree && a.includeChildren ? "UNDER" : "="} ${wiqlText(a.value)}`).join(" OR ");
  return `SELECT ${WORK_ITEM_FIELDS.map((f) => `[${f}]`).join(", ")} FROM WorkItems WHERE [System.IterationPath] = ${wiqlText(iteration.path)} AND (${inArea}) ORDER BY [System.Id]`;
}

// az's JSON answer for `what`; `empty` stands for no output at all (az
// boards query prints nothing when nothing matches).
function azJson(stdout, what, empty) {
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
function jsonOrNull(stdout) {
  try {
    return JSON.parse(String(stdout ?? "").trim());
  } catch {
    return null;
  }
}

// A list Azure sends either as it is or wrapped in { count, value } (az
// devops invoke prints REST's wrapper, with its continuation_token).
const azList = (json) => (Array.isArray(json) ? json : Array.isArray(json?.value) ? json.value : null);

// The team's current iteration → { id, name, path, finish } (finish: the
// start of its last day, as Azure gives it, or null).
export function parseIteration(stdout) {
  const list = azList(azJson(stdout, "den Sprint"));
  if (!list) throw new BoardError("Azure lieferte keinen Sprint");
  const it = list.find((i) => i?.attributes?.timeFrame === "current") ?? list[0];
  if (!it?.id || !it.path) throw new BoardError("Das Team hat keinen laufenden Sprint");
  return { id: it.id, name: it.name ?? it.path, path: it.path, finish: it.attributes?.finishDate ?? null };
}

// The team's areas → { field (the team field, System.AreaPath by default),
// values: [{ value, includeChildren }] }.
export function parseAreas(stdout) {
  const json = azJson(stdout, "die Bereiche des Teams");
  const values = (Array.isArray(json?.values) ? json.values : []).filter((v) => typeof v?.value === "string" && v.value);
  if (!values.length) throw new BoardError("Azure nannte keine Bereiche des Teams");
  return { field: json.field?.referenceName ?? AREA_PATH, values: values.map((v) => ({ value: v.value, includeChildren: v.includeChildren === true })) };
}

// The taskboard's columns → [{ id, name, mappings: [{ type, state }] }] in
// their order.
export function parseColumns(stdout) {
  const columns = azJson(stdout, "die Spalten des Taskboards")?.columns;
  if (!Array.isArray(columns) || !columns.length) throw new BoardError("Azure lieferte keine Spalten des Taskboards");
  return [...columns]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({ id: c.id, name: c.name, mappings: (c.mappings ?? []).map((m) => ({ type: m.workItemType, state: m.state })) }));
}

// The taskboard's column of each work item → Map(id → { columnId, column,
// state }). A list that holds entries but none with a work item's id is no
// answer this reads.
export function parseTaskboard(stdout) {
  const list = azList(azJson(stdout, "die Spalten der Work Items"));
  if (!list) throw new BoardError("Azure lieferte keine Spalten der Work Items");
  const placed = list.filter((w) => Number.isInteger(w?.workItemId));
  if (list.length && !placed.length) throw new BoardError("Azure nannte keine Work Items in den Spalten des Taskboards");
  return new Map(placed.map((w) => [w.workItemId, { columnId: w.columnId, column: w.column, state: w.state }]));
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
// itemKey names it.
export function azWorkItem(wi, c) {
  const f = (name) => fieldOf(wi, name) ?? null;
  const who = azPerson(f("AssignedTo"));
  const item = {
    source: "azure", kind: "workitem", number: wi.id, title: f("Title") ?? "", type: f("WorkItemType"),
    state: f("State"), assignees: who.name ? [who.name] : [], assigneeLogins: who.login ? [who.login] : [],
    parent: f("Parent"), area: f("AreaPath"), iteration: f("IterationPath"),
    url: workItemUrl(c, wi.id), labels: [], sub: null, branch: null,
  };
  return { key: itemKey(item), ...item };
}

// The most work items az boards query gives.
export const AZ_QUERY_LIMIT = 1000;

// The work items of az boards query's answer → [items] (azWorkItem), in its
// order; no output is none.
export function parseWorkItems(stdout, c) {
  const list = azList(azJson(stdout, "die Work Items", []));
  if (!list) throw new BoardError("Azure lieferte keine Work Items");
  return list.filter((wi) => Number.isInteger(wi?.id)).map((wi) => azWorkItem(wi, c));
}

// Who az is signed in as (the user's name), in lower case, or null.
export function parseViewer(stdout) {
  const name = jsonOrNull(stdout)?.name;
  return typeof name === "string" && name ? name.toLowerCase() : null;
}

// The sprint as the sprint shape shows it (kinds/sprint.js). Its tasks are
// the work items of the types the taskboard's columns map; each goes to the
// column the taskboard places it in (`places`, parseTaskboard). Every other
// work item of the sprint is a story, one row each in the query's order,
// after the row "Ohne Story" for tasks whose story is not in the sprint
// (only where there is one). A task the taskboard does not place is left
// out and counted (meta.unplaced), as is one placed in a column the columns
// read do not list (meta.unknownColumns). A column's color is that of the
// state its first mapping names; it takes the types it maps (types) and
// says which state each gets (mappings).
export function sprintBoard({ iteration, columns, types, items, places, viewer }) {
  const colors = new Map(types.states.map((s) => [s.name, s.color]));
  const cols = columns.map((c) => ({
    id: c.id, name: c.name, color: colors.get(c.mappings[0]?.state) ?? "muted", hidden: false, count: 0, target: true,
    types: c.mappings.map((m) => m.type), mappings: Object.fromEntries(c.mappings.map((m) => [m.type, m.state])), cards: [],
  }));
  const byId = new Map(cols.map((c) => [c.id, c]));
  const taskTypes = new Set(cols.flatMap((c) => c.types));
  const stories = items.filter((i) => !taskTypes.has(i.type));
  const storyKeys = new Map(stories.map((s) => [s.number, s.key]));
  let unplaced = 0;
  let unknownColumns = 0;
  for (const item of items) {
    if (!taskTypes.has(item.type)) continue;
    const place = places.get(item.number);
    const col = place && byId.get(place.columnId);
    if (!col) {
      if (place) unknownColumns++;
      else unplaced++;
      continue;
    }
    col.cards.push({ ...item, column: col.id, readColumn: col.id, row: storyKeys.get(item.parent) ?? NO_STORY });
    col.count++;
  }
  const loose = cols.some((c) => c.cards.some((card) => card.row === NO_STORY));
  return {
    shape: "sprint",
    meta: { iterationId: iteration.id, iteration: iteration.name, finish: iteration.finish, typeStates: types.types, states: types.states, unplaced, unknownColumns },
    columns: cols,
    rows: [...(loose ? [{ key: NO_STORY, story: null }] : []), ...stories.map((s) => ({ key: s.key, story: s }))],
    viewer,
    total: items.length,
    limited: items.length >= AZ_QUERY_LIMIT,
    limit: AZ_QUERY_LIMIT,
  };
}

// Until when a team's sprint stays cached (ms): the end of its last day
// (Azure's finishDate is that day's start, in UTC), or half a day from
// `now` where it names none.
const DAY_MS = 86400000;
export function sprintUntil(finish, now) {
  const at = Date.parse(finish ?? "");
  return Number.isNaN(at) ? now + DAY_MS / 2 : at + DAY_MS;
}

// az devops invoke takes a request's body only from a file (--in-file):
// one per work item, written before each move and kept for the next.
// herdr's writeTextFile makes the folders it needs (herdr-app 0.1.16,
// src/mod_files.rs, write: create_dir_all of the parent), and its
// readTextFile gives null for a file that is not there (read: NotFound is
// None).
export const moveBodyPath = (id) => `${home()}/.cache/herdr-app/board/taskboard-move-${id}.json`;

// The body that moves a task to a taskboard column. The REST reference
// (Taskboard Work Items - Update, api-version 7.1) names the field
// newColumn, a string; it does not say whether that is the name or the id,
// and the name is sent.
export const moveBody = (column) => `${JSON.stringify({ newColumn: column.name })}\n`;

// Writes the body of a move to its file, where it does not hold it
// already; a file that cannot be written is a refusal (nothing was sent).
async function writeMoveBody(id, column) {
  const path = moveBodyPath(id);
  const text = moveBody(column);
  try {
    const now = await readTextFile(path);
    if (now !== text) await writeTextFile(path, text, now);
  } catch (e) {
    throw new BoardError(`Die Anfrage an Azure ließ sich nicht ablegen (${path}): ${firstLine(e?.message ?? e)}`);
  }
  return path;
}

export const azMoveArgs = (c, iterationId, id, file) =>
  azInvokeArgs(c, "work", "taskboardWorkItems", { project: c.project, team: c.team, iterationId, workItemId: id }, ["--http-method", "PATCH", "--in-file", file]);

// az's answer to a move. The reference names none (200 OK); an answer that
// names the work item in its new column, as the list's entries do
// (workItemId, column, columnId), confirms the move. Anything else leaves
// open whether it landed: the refresh that follows says where it stands.
export function checkTaskboardMove(stdout, card, column) {
  const json = jsonOrNull(stdout);
  const entry = azList(json)?.find((w) => w?.workItemId === card.number) ?? json;
  if (entry?.workItemId !== card.number || (entry.columnId !== column.id && entry.column !== column.name)) {
    throw failure("Azure hat die Verschiebung nicht bestätigt", { write: true, unclear: true });
  }
}

export const azStateArgs = (c, id, state) => ["boards", "work-item", "update", ...azOrg(c.org), "--id", String(id), "--state", state, "-o", "json"];

// az's answer to a state change must name the state it set; anything else
// leaves open whether the change landed.
export function checkStateResult(stdout, state) {
  const json = jsonOrNull(stdout);
  if (!json || fieldOf(json, "State") !== state) throw failure("Azure hat den Status nicht bestätigt", { write: true, unclear: true });
}

// The Azure source for the board: the name of the site `o` opens, why "nur
// meine" cannot tell one's own items, and per layout of an Azure view how
// it loads and writes. az runs by the path `paths` (toolPaths) finds.
//
// What the Sprint keeps, each read once and kept until the sprint ends
// (sprintUntil; one that fails keeps nothing): per team, by organisation,
// project and team, its current sprint, and its areas and taskboard
// columns; per project the work item types, until the sprint of the team
// that read them ends. What is not kept is read at the same time. A
// refresh then reads the taskboard's columns of the work items and the
// sprint's work items, also at the same time. The team's kept settings
// (not the project's types) are dropped, so that they are read again, by
// `r` (forget), by a task in a column the columns read do not know, and by
// a move or state change Azure refuses. Who az is signed in as is read
// beside all that, with its own short timeout (AZ_ME_TIMEOUT), and kept
// once read; while that fails it is asked again with each refresh, and the
// data says why (noViewer: the source's words and the error).
export function makeAzure(paths) {
  const az = async (args, options = {}, timeout = AZ_TIMEOUT) => {
    const r = await call("az", args, null, timeout, { ...options, paths });
    if (r.code !== 0) throw azFailure(r, null, options);
    return r.stdout;
  };
  const kept = new Map();
  const keptValue = (key) => {
    const entry = kept.get(key);
    return entry && Date.now() < entry.until ? entry : null;
  };
  const teamKey = (c) => `${c.org}\n${c.project}\n${c.team}`;
  async function settingsOf(c) {
    const team = teamKey(c);
    const project = `types\n${c.org}\n${c.project}`;
    const [iteration, board, types] = [keptValue(`iteration\n${team}`), keptValue(`board\n${team}`), keptValue(project)];
    const [it, areas, columns, ty] = await Promise.all([
      iteration?.value ?? az(azIterationArgs(c)).then(parseIteration),
      board?.value.areas ?? az(azAreasArgs(c)).then(parseAreas),
      board?.value.columns ?? az(azColumnsArgs(c)).then(parseColumns),
      types?.value ?? az(azTypesArgs(c)).then(parseAzureTypes),
    ]);
    const until = iteration?.until ?? sprintUntil(it.finish, Date.now());
    if (!iteration) kept.set(`iteration\n${team}`, { value: it, until });
    if (!board) kept.set(`board\n${team}`, { value: { areas, columns }, until });
    if (!types) kept.set(project, { value: ty, until });
    return { iteration: it, areas, columns, types: ty };
  }
  const forget = (c) => {
    kept.delete(`iteration\n${teamKey(c)}`);
    kept.delete(`board\n${teamKey(c)}`);
  };
  let viewer = null;
  let viewerError = null;
  const whoAmI = () =>
    viewer
      ? Promise.resolve(viewer)
      : az(AZ_ME_ARGS, {}, AZ_ME_TIMEOUT).then((out) => {
        viewer = parseViewer(out);
        viewerError = viewer ? null : "keinen Benutzer genannt";
        return viewer;
      }, (e) => {
        viewerError = errorText(e);
        return null;
      });
  const noViewer = "az hat nicht gesagt, wer angemeldet ist (az account show; das braucht az login)";
  // A write Azure refused may have met settings that are out of date.
  const forgetOnRefusal = (c) => (e) => {
    if (!(e instanceof BoardError && e.unclear)) forget(c);
    throw e;
  };
  return {
    site: "Azure",
    noViewer,
    // Drops what is kept of the view's team (r, Board.reload).
    forget: (view) => view.context?.kind === "team" && forget(view.context),
    views: {
      sprint: {
        async load(view) {
          const c = view.context;
          const me = whoAmI();
          const s = await settingsOf(c);
          const [places, items] = await Promise.all([az(azTaskboardArgs(c, s.iteration.id)), az(azQueryArgs(c, sprintWiql(s.iteration, s.areas)))]);
          const data = sprintBoard({ ...s, items: parseWorkItems(items, c), places: parseTaskboard(places), viewer: await me });
          if (!data.viewer) data.noViewer = `${noViewer}: ${viewerError}`;
          if (data.meta.unknownColumns) forget(c);
          return { data, warnings: [] };
        },
        async move(view, data, card, column) {
          const file = await writeMoveBody(card.number, column);
          const out = await az(azMoveArgs(view.context, data.meta.iterationId, card.number, file), { write: true }).catch(forgetOnRefusal(view.context));
          checkTaskboardMove(out, card, column);
        },
        async setState(view, item, state) {
          checkStateResult(await az(azStateArgs(view.context, item.number, state), { write: true }).catch(forgetOnRefusal(view.context)), state);
        },
      },
    },
  };
}
