// The Azure Sprint: its calls, what they answer, the sprint as the sprint
// shape shows it (sprintBoard), a task's move on the taskboard, and the
// view as makeAzure uses it (sprintView).

import { home, readTextFile, writeTextFile } from "herdr";
import { BoardError, failure, firstLine } from "../../shared.js";
import { NO_STORY } from "../../kinds/sprint.js";
import { AREA_PATH, AZ_QUERY_LIMIT, WORK_ITEM_FIELDS, azInvokeArgs, azJson, azList, azOrg, azQueryArgs, jsonOrNull, parseAzureTypes, parseWorkItems, wiqlText } from "./common.js";

// The Sprint view's calls for a team context `c` ({ org, project, team }):
// its current iteration, its areas (azAreasArgs), its taskboard's columns,
// the project's work item types with their states, and per refresh the
// taskboard's column of each work item and the fields of the sprint's work
// items (azQueryArgs).
export const azIterationArgs = (c) => ["boards", "iteration", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, "--timeframe", "current", "-o", "json"];
export const azColumnsArgs = (c) => azInvokeArgs(c, "work", "taskboardColumns", { project: c.project, team: c.team });
export const azTypesArgs = (c) => azInvokeArgs(c, "wit", "workitemtypes", { project: c.project });
export const azTaskboardArgs = (c, iterationId) => azInvokeArgs(c, "work", "taskboardWorkItems", { project: c.project, team: c.team, iterationId });
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

// The team's current iteration → { id, name, path, finish } (finish: the
// start of its last day, as Azure gives it, or null).
export function parseIteration(stdout) {
  const list = azList(azJson(stdout, "den Sprint"));
  if (!list) throw new BoardError("Azure lieferte keinen Sprint");
  const it = list.find((i) => i?.attributes?.timeFrame === "current") ?? list[0];
  if (!it?.id || !it.path) throw new BoardError("Das Team hat keinen laufenden Sprint");
  return { id: it.id, name: it.name ?? it.path, path: it.path, finish: it.attributes?.finishDate ?? null };
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

// The Sprint as makeAzure uses it, on the source's shared parts `s` (see
// makeAzure): what it keeps per team and project (settingsOf; the team's
// areas are the source's, s.areasOf), how it loads and writes, and what
// `r` or a refused write drops (forget: the team's sprint, areas and
// columns, not the project's types).
export function sprintView(s) {
  async function settingsOf(c) {
    const team = s.teamKey(c);
    const project = `types\n${c.org}\n${c.project}`;
    const [iteration, board, types] = [s.keptValue(`iteration\n${team}`), s.keptValue(`board\n${team}`), s.keptValue(project)];
    const [it, areas, columns, ty] = await Promise.all([
      iteration?.value ?? s.az(azIterationArgs(c)).then(parseIteration),
      s.areasOf(c),
      board?.value.columns ?? s.az(azColumnsArgs(c)).then(parseColumns),
      types?.value ?? s.az(azTypesArgs(c)).then(parseAzureTypes),
    ]);
    const until = iteration?.until ?? sprintUntil(it.finish, Date.now());
    s.keepAreasUntil(c, until);
    if (!iteration) s.kept.set(`iteration\n${team}`, { value: it, until });
    if (!board) s.kept.set(`board\n${team}`, { value: { columns }, until });
    if (!types) s.kept.set(project, { value: ty, until });
    return { iteration: it, areas, columns, types: ty };
  }
  const forget = (c) => {
    s.kept.delete(`iteration\n${s.teamKey(c)}`);
    s.kept.delete(`board\n${s.teamKey(c)}`);
    s.forgetAreas(c);
  };
  const onRefusal = (c) => s.dropOnRefusal(forget, c);
  return {
    forget,
    async load(view) {
      const c = view.context;
      const me = s.whoAmI();
      const kept = await settingsOf(c);
      const [places, items] = await Promise.all([s.az(azTaskboardArgs(c, kept.iteration.id)), s.az(azQueryArgs(c, sprintWiql(kept.iteration, kept.areas)))]);
      const data = sprintBoard({ ...kept, items: parseWorkItems(items, c), places: parseTaskboard(places), viewer: await me });
      s.noViewerOf(data);
      if (data.meta.unknownColumns) forget(c);
      return { data, warnings: [] };
    },
    async move(view, data, card, column) {
      const file = await writeMoveBody(card.number, column);
      const out = await s.az(azMoveArgs(view.context, data.meta.iterationId, card.number, file), { write: true }).catch(onRefusal(view.context));
      checkTaskboardMove(out, card, column);
    },
    setState: (view, item, state) => s.setState(view, item, state, onRefusal),
  };
}
