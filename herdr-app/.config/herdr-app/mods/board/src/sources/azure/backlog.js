// The Azure Backlog: its calls, what they answer, the backlog as the
// backlog shape shows it (backlogList), a create and a parent link, and
// the view as makeAzure uses it (backlogView).

import { BoardError, errorText, failure, isObject } from "../../shared.js";
import { AZ_QUERY_LIMIT, TEAM_KEEP_MS, azFailure, azInvokeArgs, azJson, azList, azOrg, azQueryArgs, azSaid, categoryStates, idsWiql, iterationUntil, jsonOrNull, parseWorkItems, wiqlText } from "./common.js";

// The Backlog view's calls for a team context `c`: the team's backlog
// levels, its backlog configuration (the order field, each type's states
// and their categories), its settings (default and backlog iteration; its
// default area comes from azAreasArgs' defaultValue), and per refresh the
// level's work items in their list (az rest: az devops invoke picks a
// location by area and resource, the first that fits, which does not
// reliably reach backlogs/{id}/workItems) and one WIQL query for their
// fields (azQueryArgs).
export const azLevelsArgs = (c) => azInvokeArgs(c, "work", "backlogs", { project: c.project, team: c.team });
export const azBacklogConfigArgs = (c) => azInvokeArgs(c, "work", "backlogconfiguration", { project: c.project, team: c.team });
export const azTeamSettingsArgs = (c) =>
  ["boards", "iteration", "team", "show-default-iteration", ...azOrg(c.org), "--project", c.project, "--team", c.team, "-o", "json"];
// Azure DevOps' resource for an Entra token (az rest --resource): az rest
// knows no Azure DevOps host of its own.
export const AZ_DEVOPS_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";
export const backlogIdsUrl = (c, levelId) =>
  `${c.org}/${[c.project, c.team].map(encodeURIComponent).join("/")}/_apis/work/backlogs/${encodeURIComponent(levelId)}/workItems?api-version=7.1`;
export const azBacklogIdsArgs = (c, levelId) => ["rest", "--method", "get", "--url", backlogIdsUrl(c, levelId), "--resource", AZ_DEVOPS_RESOURCE, "-o", "json"];

// What a failed az rest says. az rest signs in only with az login (an Entra
// token), never with a PAT, so where az asks for az login, an Entra answer
// (AADSTS…) fails or Azure answers 401, the Backlog says what it needs.
export const BACKLOG_NEEDS_LOGIN = "Der Backlog braucht az login (ein PAT reicht dafür nicht)";
const AZ_REST_LOGIN = /az login|AADSTS\d+|Unauthorized|\b401\b/i;
export function azRestFailure(r, on, options) {
  const { lines, said } = azSaid(r.stderr);
  if (!AZ_REST_LOGIN.test(lines.join("\n"))) return azFailure(r, on, options);
  return new BoardError(`${BACKLOG_NEEDS_LOGIN}: ${said}`, { unavailable: true });
}

// A backlog level of Azure's answer → { id, name, type ("portfolio",
// "requirement" or "task"), types: [names], defaultType }, or null.
function backlogLevel(l) {
  if (!isObject(l) || typeof l.id !== "string" || !l.id) return null;
  const types = (Array.isArray(l.workItemTypes) ? l.workItemTypes : []).map((t) => t?.name).filter((n) => typeof n === "string" && n);
  const defaultType = typeof l.defaultWorkItemType?.name === "string" ? l.defaultWorkItemType.name : types[0] ?? null;
  return { id: l.id, name: typeof l.name === "string" && l.name ? l.name : l.id, type: l.type ?? null, types, defaultType };
}

// The team's backlog levels → [levels] (backlogLevel); none is no answer.
export function parseBacklogLevels(stdout) {
  const list = azList(azJson(stdout, "die Backlog-Ebenen"));
  const levels = (list ?? []).map(backlogLevel).filter(Boolean);
  if (!levels.length) throw new BoardError("Azure lieferte keine Backlog-Ebenen des Teams");
  return levels;
}

// The level the Backlog shows: the team's requirement level (Stories; by
// the process for example User Stories, Product Backlog Items,
// Requirements or Issues in Basic), and the
// level below it, whose types (Tasks) may be created under one of its
// items: the team's task level, else the configuration's.
export function backlogLevels(levels, config) {
  const level = levels.find((l) => l.type === "requirement");
  if (!level) throw new BoardError("Das Team hat keine Backlog-Ebene für Anforderungen (Stories)");
  return { level, childLevel: levels.find((l) => l.type === "task") ?? config.taskLevel ?? null };
}

// A field's reference name, as a WIQL query may name it; anything else is
// none.
const fieldName = (name) => (typeof name === "string" && /^[A-Za-z][\w.]*$/.test(name) ? name : null);

// The team's backlog configuration → { orderField (the field the backlog
// is ordered by: Microsoft.VSTS.Common.StackRank or …BacklogPriority, by
// the process; null where it names none), typeStates: { [type]: [state
// names] in Azure's order }, states (categoryStates, common.js),
// taskLevel }.
export function parseBacklogConfig(stdout) {
  const json = azJson(stdout, "die Backlog-Einstellungen");
  if (!isObject(json)) throw new BoardError("Azure lieferte keine Backlog-Einstellungen");
  const infos = (Array.isArray(json.workItemTypeMappedStates) ? json.workItemTypeMappedStates : [])
    .filter((info) => typeof info?.workItemTypeName === "string" && isObject(info.states));
  return {
    orderField: fieldName(json.backlogFields?.typeFields?.Order),
    typeStates: Object.fromEntries(infos.map((info) => [info.workItemTypeName, Object.keys(info.states)])),
    states: categoryStates(infos.flatMap((info) => Object.entries(info.states))),
    taskLevel: backlogLevel(json.taskBacklog),
  };
}

// The team's settings → { defaultIteration, backlogIteration, follows }:
// the paths of the iteration a new work item gets and of the backlog's own
// (the root of the team's iterations), each null where Azure names none;
// follows: the default iteration is a macro (defaultIterationMacro, such
// as @CurrentIteration), so the path Azure names is good only until that
// iteration ends (its finishDate, or null where it names none).
export function parseTeamSettings(stdout) {
  const json = azJson(stdout, "die Einstellungen des Teams");
  const path = (it) => (typeof it?.path === "string" && it.path ? it.path : null);
  const macro = typeof json?.defaultIterationMacro === "string" && json.defaultIterationMacro !== "";
  return {
    defaultIteration: path(json?.defaultIteration),
    backlogIteration: path(json?.backlogIteration),
    follows: macro ? { finish: json.defaultIteration?.attributes?.finishDate ?? null } : null,
  };
}

// The ids of the level's work items, in the list's order, each once.
export function parseBacklogIds(stdout) {
  const list = azJson(stdout, "die Work Items des Backlogs")?.workItems;
  if (!Array.isArray(list)) throw new BoardError("Azure lieferte keine Work Items des Backlogs");
  return [...new Set(list.map((l) => l?.target?.id).filter(Number.isInteger))];
}

// The sprint a work item is in, as the Backlog shows it: the last part of
// its iteration's path, or null for none, which is the backlog's own
// iteration (the root of the team's iterations) or the project's root (a
// path without a level below).
export function sprintName(path, backlogIteration) {
  if (typeof path !== "string" || !path || path === backlogIteration || !path.includes("\\")) return null;
  return path.split("\\").at(-1);
}

// The backlog as the backlog shape shows it (kinds/backlog.js): one row
// per work item of the level (`items`, parseWorkItems on the ids' query
// with the order field: each item's `order`), each with its sprint
// (sprintName). The rows are sorted by the order field, as Azure's backlog
// is: the REST reference does not say whether the list of ids
// (parseBacklogIds) comes in backlog order, so it is not relied on; it
// orders only what has no order value, after all that has one. Ids the
// query did not find are counted (meta.missing); `limited` says the ids
// were more than one query reads (AZ_QUERY_LIMIT). `typeColors` are the
// colors of the project's work item types (parseAzureTypes), none where
// they were not read.
export function backlogList({ level, childLevel, config, settings, area, ids, items, viewer, typeColors = {} }) {
  const at = new Map(ids.map((id, i) => [id, i]));
  const rank = (i) => i.order ?? Infinity;
  const rows = items
    .filter((i) => at.has(i.number))
    .map((i) => ({ ...i, sprint: sprintName(i.iteration, settings.backlogIteration) }))
    .sort((a, b) => rank(a) - rank(b) || at.get(a.number) - at.get(b.number));
  const read = Math.min(ids.length, AZ_QUERY_LIMIT);
  return {
    shape: "backlog",
    meta: {
      level, childLevel, typeStates: config.typeStates, states: config.states, typeColors, orderField: config.orderField,
      area, iteration: settings.defaultIteration, follows: Boolean(settings.follows), missing: read - rows.length,
    },
    rows,
    viewer,
    total: ids.length,
    limited: ids.length > AZ_QUERY_LIMIT,
    limit: AZ_QUERY_LIMIT,
  };
}

// Creating a work item: of `type` with `title`, in the team's default area
// and iteration (az applies no team defaults), assigned to the account az
// is signed in as (az resolves "me"). The title is given as --title=…, so
// one that starts with a dash is no option.
export const azCreateArgs = (c, { type, title, area, iteration }) => [
  "boards", "work-item", "create", ...azOrg(c.org), "--project", c.project, "--type", type, `--title=${title}`,
  "--area", area, "--iteration", iteration, "--assigned-to", "me", "-o", "json",
];

// az's answer to a create: the new work item's id. Without one it is open
// whether, and as what, it was created.
export function parseCreated(stdout) {
  const id = jsonOrNull(stdout)?.id;
  if (!Number.isInteger(id)) throw failure("Azure hat keine Nummer des neuen Work Items genannt", { write: true, unclear: true });
  return id;
}

// Making the work item `id` a child of `parent`.
export const azParentArgs = (c, id, parent) =>
  ["boards", "work-item", "relation", "add", ...azOrg(c.org), "--id", String(id), "--relation-type", "parent", "--target-id", String(parent), "-o", "json"];

// az's answer to the parent link: the work item with its relations, which
// az names by their friendly names ("Parent"); one to the parent's address
// confirms the link, anything else leaves it open.
export function checkParentLink(stdout, parent) {
  const relations = jsonOrNull(stdout)?.relations;
  const linked = Array.isArray(relations) && relations.some((r) => /^parent$|Hierarchy-Reverse$/i.test(r?.rel ?? "") && new RegExp(`/workItems/${parent}$`, "i").test(r?.url ?? ""));
  if (!linked) throw failure("Azure hat die Verknüpfung nicht bestätigt", { write: true, unclear: true });
}

// How long the Backlog keeps a team's settings (ms): they change rarely.
export const BACKLOG_KEEP_MS = TEAM_KEEP_MS;

// Until when the Backlog keeps a team's settings read at `now`:
// BACKLOG_KEEP_MS, or sooner where the default iteration follows one that
// ends before (settings.follows, iterationUntil).
export function backlogUntil(settings, now) {
  const keep = now + BACKLOG_KEEP_MS;
  return settings.follows ? Math.min(keep, iterationUntil(settings.follows.finish, now)) : keep;
}

// One WIQL query for the work items of the project `project` and the type
// `type`, titled `title`, that the account az is signed in as created
// today, with their parent where `child` asks for it. The project is
// spelled out: az boards query gives @project nothing to stand for.
export function createdWiql({ project, type, title, child = false }) {
  const fields = child ? "[System.Id], [System.Parent]" : "[System.Id]";
  return `SELECT ${fields} FROM WorkItems WHERE [System.TeamProject] = ${wiqlText(project)} AND [System.WorkItemType] = ${wiqlText(type)} ` +
    `AND [System.Title] = ${wiqlText(title)} AND [System.CreatedBy] = @Me AND [System.CreatedDate] = @Today ORDER BY [System.Id]`;
}

// The Backlog as makeAzure uses it, on the source's shared parts `s` (see
// makeAzure): what it keeps per team (backlogSettingsOf), how it loads and
// writes, and what `r` or a refused write drops (forget).
export function backlogView(s) {
  const key = (c) => `backlog\n${s.teamKey(c)}`;
  async function backlogSettingsOf(c) {
    const held = s.keptValue(key(c));
    if (held) return held.value;
    const [levels, config, settings, areas] = await Promise.all([
      s.az(azLevelsArgs(c)).then(parseBacklogLevels),
      s.az(azBacklogConfigArgs(c)).then(parseBacklogConfig),
      s.az(azTeamSettingsArgs(c)).then(parseTeamSettings),
      s.areasOf(c),
    ]);
    const value = { ...backlogLevels(levels, config), config, settings, area: areas.default };
    const until = backlogUntil(settings, Date.now());
    s.keep(key(c), value, until);
    s.keepAreasUntil(c, until);
    return value;
  }
  const forget = (c) => {
    s.drop(key(c));
    s.forgetAreas(c);
  };
  const onRefusal = (c) => s.dropOnRefusal(forget, c);
  // The colors of the project's work item types (s.typesOf, which keeps
  // them) and their warnings; a read that fails gives none and the warning
  // that says so.
  async function typeColorsOf(c) {
    try {
      const { types } = await s.typesOf(c);
      return { colors: types.colors, warnings: types.warnings };
    } catch (e) {
      return { colors: {}, warnings: [`Farben der Work-Item-Typen nicht gelesen: ${errorText(e)}`] };
    }
  }
  return {
    forget,
    async load(view) {
      const c = view.context;
      const me = s.whoAmI();
      const kept = await backlogSettingsOf(c);
      const types = typeColorsOf(c);
      const ids = parseBacklogIds(await s.az(azBacklogIdsArgs(c, kept.level.id), { failure: azRestFailure }));
      const read = ids.slice(0, AZ_QUERY_LIMIT);
      const out = read.length ? await s.az(azQueryArgs(c, idsWiql(read, kept.config.orderField ? [kept.config.orderField] : []))) : "";
      const { colors, warnings } = await types;
      const data = backlogList({ ...kept, ids, items: parseWorkItems(out, c, kept.config.orderField), viewer: await me, typeColors: colors });
      s.noViewerOf(data);
      return { data, warnings };
    },
    setState: (view, item, state) => s.setState(view, item, state, onRefusal),
    // Creates a work item ({ type, title }) in the team's default area and
    // iteration (data.meta), assigned to me; its id. A default iteration
    // that follows the current one (data.meta.follows) is read again first:
    // the one kept may have ended since, and Azure names no end for it.
    async create(view, data, { type, title }) {
      const c = view.context;
      let iteration = data.meta.iteration;
      if (data.meta.follows) {
        iteration = parseTeamSettings(await s.az(azTeamSettingsArgs(c))).defaultIteration;
        if (!iteration) throw new BoardError("Das Team nennt gerade keine Standard-Iteration (Team-Einstellungen in Azure)");
      }
      const args = azCreateArgs(c, { type, title, area: data.meta.area, iteration });
      return parseCreated(await s.az(args, { write: true }).catch(onRefusal(c)));
    },
    // Makes the work item `id` a child of `parent`.
    async addParent(view, id, parent) {
      checkParentLink(await s.az(azParentArgs(view.context, id, parent), { write: true }), parent);
    },
    // The work items createdWiql finds for a create ({ type, title,
    // child }) in the view's project, as parseWorkItems reads them.
    async findCreated(view, { type, title, child }) {
      const c = view.context;
      return parseWorkItems(await s.az(azQueryArgs(c, createdWiql({ project: c.project, type, title, child }))), c);
    },
  };
}
