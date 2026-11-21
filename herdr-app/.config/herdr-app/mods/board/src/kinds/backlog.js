// A team's backlog: its rows in backlog order, the item with a key, a state
// change laid over the data, what a new work item may be, and the
// backlog's warnings. backlogList (sources/azure.js) builds the data.

import { shows } from "../select.js";

// The work item with `key`, or null.
export const findBacklogItem = (data, key) => data?.rows.find((r) => r.key === key) ?? null;

// The data with the item `key` in `state`.
export const withBacklogState = (data, key, state) => ({ ...data, rows: data.rows.map((r) => (r.key === key ? { ...r, state } : r)) });

// The rows that show, as one column (navigate walks a list as one).
export const backlogNav = (data, filter, mine) => [{ id: "backlog", name: data.meta.level.name, shown: data.rows.filter((r) => shows(r, filter, mine, data.viewer)) }];

// The types a new work item may have: the level's, its default first, then
// with a selected item of the level (`parent`) the types of the level
// below it, as its children (child: true).
export function createTypes(data, parent) {
  const { level, childLevel } = data.meta;
  const own = [...new Set([level.defaultType, ...level.types].filter(Boolean))].map((name) => ({ name, child: false }));
  const children = parent ? (childLevel?.types ?? []).filter((n) => !own.some((t) => t.name === n)).map((name) => ({ name, child: true })) : [];
  return [...own, ...children];
}

// The warnings of a backlog: ids its query did not find, and a backlog
// longer than one query reads.
export function backlogWarnings(data) {
  const { missing } = data.meta;
  return [
    ...(missing > 0 ? [`${missing} ${missing === 1 ? "Eintrag" : "Einträge"} des Backlogs ohne Felder (nicht gefunden)`] : []),
    ...(data.limited ? [`Nur die ersten ${data.limit} von ${data.total} Einträgen des Backlogs (so viele liest eine Abfrage)`] : []),
  ];
}
