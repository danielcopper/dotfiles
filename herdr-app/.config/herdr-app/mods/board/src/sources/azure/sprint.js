// The Azure Sprint: its calls, what they answer, the sprint as the sprint
// shape shows it (sprintBoard), a task's move on the taskboard, and the
// view as makeAzure uses it (sprintView).

import { home, readTextFile, writeTextFile } from "herdr";
import { BoardError, failure, firstLine, readMemo } from "../../shared.js";
import { NO_STORY } from "../../kinds/sprint.js";
import {
  AREA_PATH, AZ_QUERY_LIMIT, WORK_ITEM_FIELDS, azInvokeArgs, azJson, azList, azOrg, azQueryArgs, categoryStates, dayEnd, iterationUntil, jsonOrNull, parseWorkItems, wiqlText,
} from "./common.js";

// The Sprint view's calls for a team context `c` ({ org, project, team }):
// its current iteration, its areas (azAreasArgs), its taskboard's columns,
// the project's work item types with their states, and per refresh the
// taskboard's column of each work item and the fields of the sprint's work
// items (azQueryArgs); for the sprint picker, all the team's iterations
// (azIterationsArgs without a timeframe).
export const azIterationsArgs = (c, timeframe = null) =>
  ["boards", "iteration", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, ...(timeframe ? ["--timeframe", timeframe] : []), "-o", "json"];
export const azIterationArgs = (c) => azIterationsArgs(c, "current");
export const azColumnsArgs = (c) => azInvokeArgs(c, "work", "taskboardColumns", { project: c.project, team: c.team });
export const azTypesArgs = (c) => azInvokeArgs(c, "wit", "workitemtypes", { project: c.project });
export const azTaskboardArgs = (c, iterationId) => azInvokeArgs(c, "work", "taskboardWorkItems", { project: c.project, team: c.team, iterationId });
// A work item type's color as "#rrggbb", from six hex digits (the form of
// its states' colors in the same answer), with or without #, or eight
// (aarrggbb, Azure's process files' form: the alpha is dropped); null for
// anything else.
export function typeColor(color) {
  const hex = typeof color === "string" ? /^#?(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(color)?.[1] : null;
  return hex ? `#${hex.toLowerCase()}` : null;
}

// The work item types' answer → { states (categoryStates, common.js),
// types: { [type]: [state names] }, colors: { [type]: "#rrggbb" } (each
// type's own color, typeColor; a type without one, or with another form,
// has none), warnings (where the answer names colors but none in a form
// typeColor reads: the views say so beside their data) }.
export function parseAzureTypes(stdout) {
  const value = azJson(stdout, "die Work-Item-Typen")?.value;
  if (!Array.isArray(value)) throw new BoardError("Azure lieferte keine Work-Item-Typen");
  const types = Object.fromEntries(value.map((type) => [type.name, (type.states ?? []).map((s) => s.name)]));
  const colors = Object.fromEntries(value.map((type) => [type.name, typeColor(type.color)]).filter(([, color]) => color));
  const named = [...new Set(value.map((type) => type.color).filter((c) => typeof c === "string" && c))];
  const warnings = named.length && !Object.keys(colors).length ? [`Farben der Work-Item-Typen in unbekannter Form: ${named.slice(0, 3).join(", ")}`] : [];
  return { states: categoryStates(value.flatMap((type) => (type.states ?? []).map((s) => [s.name, s.category]))), types, colors, warnings };
}

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

// An iteration as az lists one (the azure-devops extension's
// get_team_iterations, TeamSettingsIteration: id, name, path, attributes {
// startDate, finishDate, timeFrame }) → { id, name (its path where it has
// none), path, start, finish } (start and finish: the start of its first
// and last day, as Azure gives them, or null).
const iterationOf = (i) => ({ id: i.id, name: i.name ?? i.path, path: i.path, start: i.attributes?.startDate ?? null, finish: i.attributes?.finishDate ?? null });

// The team's current iteration (iterationOf), or null where it has none
// running (az lists none).
export function parseIteration(stdout) {
  const list = azList(azJson(stdout, "den Sprint"));
  if (!list) throw new BoardError("Azure lieferte keinen Sprint");
  const it = list.find((i) => i?.attributes?.timeFrame === "current") ?? list[0];
  if (!it) return null;
  if (!it.id || !it.path) throw new BoardError("Azure nannte den laufenden Sprint ohne Id oder Pfad");
  return iterationOf(it);
}

// The team's iterations, as az lists them without --timeframe →
// [iterationOf] in Azure's order (the team's iterations by their dates).
// One without an id or path is left out. Which one is current, they do
// not say: Azure's timeFrame is that of the moment they were read, while
// they are kept longer (sprintView, iterations).
export function parseIterations(stdout) {
  const list = azList(azJson(stdout, "die Sprints des Teams"));
  if (!list) throw new BoardError("Azure lieferte keine Sprints des Teams");
  return list.filter((i) => i?.id && i.path).map(iterationOf);
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
// meta.current says whether the sprint shown is the team's current one
// (true where nothing else is chosen), meta.currentId that one's id (null
// where the team has none running), meta.gone ({ id, name }) a chosen
// sprint the team no longer has, which the current one stands in for
// (sprintView). Without an `iteration` (the team has no sprint running
// and none is chosen) it holds no work items and meta.iterationId is null.
export function sprintBoard({ iteration, current = true, currentId = iteration?.id ?? null, gone = null, columns, types, items, places, viewer }) {
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
    meta: {
      iterationId: iteration?.id ?? null, iteration: iteration?.name ?? null, finish: iteration?.finish ?? null, current, currentId, gone,
      typeStates: types.types, states: types.states, typeColors: types.colors, unplaced, unknownColumns,
    },
    columns: cols,
    rows: [...(loose ? [{ key: NO_STORY, story: null }] : []), ...stories.map((s) => ({ key: s.key, story: s }))],
    viewer,
    total: items.length,
    limited: items.length >= AZ_QUERY_LIMIT,
    limit: AZ_QUERY_LIMIT,
  };
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
// makeAzure, which says what is kept and for how long): what it keeps per
// team and project (settingsOf; the team's areas are the source's,
// s.areasOf), how it loads and writes, the team's iterations for the
// sprint picker (iterations: each with `current`, whether it is the
// team's current iteration as the Sprint keeps it, so that a kept list
// never names a sprint current that has ended), and what a refused write
// or a task in a column the columns read do not know drops (forgetSettings:
// the team's sprint, areas and columns, not the project's types); `r`
// drops the team's iterations too (forget).
//
// load(view, hiddenFor, chosen) shows the sprint `chosen` ({ id, name };
// null: the current one), looked up by its id among the team's
// iterations: its taskboard and query by its id and path, the team's
// settings as for the current one. Where the team no longer has it, the
// current sprint shows, meta.gone names it and the load says so (notice);
// a read of it that fails names it. Where the team has no sprint running
// (the answer kept until the day ends, dayEnd) and none is chosen, it
// reads no work items (sprintBoard without an iteration).
export function sprintView(s) {
  const iterations = readMemo();
  const iterationsOf = (c) => iterations.get(s.teamKey(c), () => s.az(azIterationsArgs(c)).then(parseIterations));
  const currentKey = (c) => `iteration\n${s.teamKey(c)}`;
  async function settingsOf(c) {
    const team = s.teamKey(c);
    const [iteration, board] = [s.keptValue(currentKey(c)), s.keptValue(`board\n${team}`)];
    const [it, areas, columns, { types: ty, fresh }] = await Promise.all([
      iteration ? iteration.value : s.az(azIterationArgs(c)).then(parseIteration),
      s.areasOf(c),
      board?.value.columns ?? s.az(azColumnsArgs(c)).then(parseColumns),
      s.typesOf(c),
    ]);
    const until = iteration?.until ?? (it ? iterationUntil(it.finish, Date.now()) : dayEnd(Date.now()));
    s.keepAreasUntil(c, until);
    if (!iteration) s.keep(currentKey(c), it, until);
    if (!board) s.keep(`board\n${team}`, { columns }, until);
    if (fresh) s.keepTypesUntil(c, until);
    return { iteration: it, areas, columns, types: ty };
  }
  const forgetSettings = (c) => {
    s.drop(currentKey(c));
    s.drop(`board\n${s.teamKey(c)}`);
    s.forgetAreas(c);
  };
  const onRefusal = (c) => s.dropOnRefusal(forgetSettings, c);
  // The team's current iteration's id: as the Sprint keeps it, else read
  // (and not kept: settingsOf keeps it with the settings it belongs to).
  async function currentIdOf(c) {
    const kept = s.keptValue(currentKey(c));
    return (kept ? kept.value : parseIteration(await s.az(azIterationArgs(c))))?.id ?? null;
  }
  async function loadSprint(view, chosen) {
    const c = view.context;
    const me = s.whoAmI();
    const [kept, listed] = await Promise.all([settingsOf(c), chosen ? iterationsOf(c) : null]);
    const found = listed?.find((i) => i.id === chosen.id) ?? null;
    const iteration = found ?? kept.iteration;
    const [places, items] = iteration
      ? await Promise.all([s.az(azTaskboardArgs(c, iteration.id)), s.az(azQueryArgs(c, sprintWiql(iteration, kept.areas)))])
      : [null, null];
    const gone = chosen && !found ? { id: chosen.id, name: chosen.name } : null;
    const currentId = kept.iteration?.id ?? null;
    const data = sprintBoard({
      ...kept, iteration, current: Boolean(iteration) && iteration.id === currentId, currentId, gone,
      items: items === null ? [] : parseWorkItems(items, c), places: places === null ? new Map() : parseTaskboard(places), viewer: await me,
    });
    s.noViewerOf(data);
    if (data.meta.unknownColumns) forgetSettings(c);
    const instead = currentId ? "der aktuelle Sprint wird gezeigt" : "das Team hat keinen laufenden Sprint";
    return { data, warnings: kept.types.warnings, notice: gone ? `${gone.name} gibt es im Team nicht mehr: ${instead}` : null };
  }
  return {
    forget: (c) => {
      forgetSettings(c);
      iterations.drop(s.teamKey(c));
    },
    async iterations(view) {
      const c = view.context;
      const [list, current] = await Promise.all([iterationsOf(c), currentIdOf(c)]);
      return list.map((i) => ({ ...i, current: i.id === current }));
    },
    load: (view, hiddenFor, chosen = null) =>
      loadSprint(view, chosen).catch((e) => {
        throw chosen && e instanceof BoardError ? new BoardError(`${chosen.name} ließ sich nicht lesen: ${e.message}`, e) : e;
      }),
    async move(view, data, card, column) {
      const file = await writeMoveBody(card.number, column);
      const out = await s.az(azMoveArgs(view.context, data.meta.iterationId, card.number, file), { write: true }).catch(onRefusal(view.context));
      checkTaskboardMove(out, card, column);
    },
    setState: (view, item, state) => s.setState(view, item, state, onRefusal),
  };
}
