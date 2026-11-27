// A GitHub project's table: the rows its list walks, the lines it draws
// (group rows and item rows), a row's value of a field, a row placed anew
// after a change, its warnings and the form its saved state takes.
// parseGithubTable (sources/github.js) builds the data.

import { packRows, unpackRows } from "../loading.js";
import { unreadableOrder, withRow } from "../shared.js";
import { cardValue, groupsOf, orderEntry, viewOrder } from "./fields.js";
import { githubRowBack, keptGithubRow } from "./rows.js";

// The rows that `visible` lets through, in the table's order, as one list
// (navigate walks a list as one column).
export const tableNav = (data, visible) => [{ id: "table", name: data.meta.title, shown: data.rows.filter(visible) }];

// The lines of a table's list, in its order: without groups its rows that
// `visible` lets through ({ row }); with groups, before each group that
// holds such a row, its group row ({ group, shown, held: how many rows of
// it show and how many it holds }), then those rows.
export function tableLines(data, visible) {
  if (!data.groups) return data.rows.filter(visible).map((row) => ({ row }));
  const lines = [];
  for (const group of data.groups) {
    const held = data.rows.filter((r) => r.group === group.id);
    const shown = held.filter(visible);
    if (!shown.length) continue;
    lines.push({ group, shown: shown.length, held: held.length });
    lines.push(...shown.map((row) => ({ row })));
  }
  return lines;
}

// A row's value of the table's field `fieldAt` (its index in data.fields):
// its cell where the query read the field by name, else its card's as the
// card is now (cardValue); null for none, also for a field the board does
// not read.
export function tableValue(data, row, fieldAt) {
  const field = data.fields[fieldAt];
  if (field.from === "cell") return row.cells[fieldAt];
  return field.from === "card" ? cardValue(field, row) : null;
}

const fromCard = (field) => field?.from === "card";

// The data with the row `key`'s fields set to those of `patch`; where the
// view groups or sorts by a field the card holds, the rows are grouped and
// ordered anew by the cards as they are now.
export function withTableRow(data, key, patch) {
  const next = withRow(data, key, patch);
  const regroup = fromCard(data.groupBy);
  if (!regroup && !data.sortBy.some((s) => fromCard(s.field))) return next;
  const entries = next.rows.map((row) => {
    const value = (field, k) => (fromCard(field) ? cardValue(field, row) : { rank: row.ranks[k] });
    const entry = orderEntry(row.order, regroup ? data.groupBy : null, data.sortBy, value);
    return { row, ...entry, group: regroup ? entry.group : row.group };
  });
  const groups = regroup ? groupsOf(data.groupBy, entries) : data.groups;
  const rows = viewOrder(entries, groups, data.sortBy).map((e) => ({ ...e.row, ranks: e.ranks, ...(groups ? { group: e.group } : {}) }));
  return { ...next, groups, rows };
}

// The warnings of a table: the fields it shows that the board does not
// read, whose cells stay empty (one line), and its sort keys and group
// field of such a kind.
export function tableWarnings(view, data) {
  const blank = data.meta.blank ?? [];
  const named = blank.map((n) => `„${n}“`).join(", ");
  const shown = blank.length === 1
    ? [`Ansicht „${view.name}“ zeigt ${named}, ein Feld, das das Board nicht liest: es bleibt leer`]
    : blank.length ? [`Ansicht „${view.name}“ zeigt ${named}, Felder, die das Board nicht liest: sie bleiben leer`] : [];
  return [...shown, ...unreadableOrder(view, data.meta.unreadable ?? [])];
}

const spread = (prefix, list) => Object.fromEntries(list.map((v, i) => [`${prefix}${i}`, v]));
const gather = (row, prefix, count) => Array.from({ length: count }, (_, i) => row[`${prefix}${i}`] ?? null);

// A table's data as its saved state keeps it: its rows packed (packRows),
// each as keptGithubRow keeps it, each cell and sort key's rank a trait of
// its own, so that a value many rows hold is kept once; and that form read
// back, each row's itemId its key.
export function savedTable(data) {
  const { rows, ...rest } = data;
  const kept = rows.map(({ cells, ranks, ...row }) => ({ ...keptGithubRow(row), ...spread("cell:", cells), ...spread("rank:", ranks) }));
  return { ...rest, packed: packRows(kept) };
}

export function tableFromSaved(data) {
  const { packed, ...rest } = data;
  const rows = unpackRows(packed).map((kept) => {
    const row = Object.fromEntries(Object.entries(kept).filter(([name]) => !name.includes(":")));
    return { ...githubRowBack(row), itemId: row.key, cells: gather(kept, "cell:", data.fields.length), ranks: gather(kept, "rank:", data.sortBy.length) };
  });
  return { ...rest, rows };
}
