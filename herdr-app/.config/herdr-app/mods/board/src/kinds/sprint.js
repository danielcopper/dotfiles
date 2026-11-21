// A sprint's taskboard: its rows (one per story, and "Ohne Story" for tasks
// whose story is not in the sprint), the items it holds, what shows and how the
// keys walk it, a task's state as shown, a state change laid over the data, and
// its warnings (sprintWarnings). The data is a board's (kinds/board.js: its
// columns hold the tasks, so moves, their rollback and H/L work on it as on a
// board) plus its rows; sprintBoard (sources/azure.js) builds it.

import { navigate, shows } from "../select.js";
import { findCard, shownColumns } from "./board.js";

// The key of the row "Ohne Story", and the id of the column of stories the
// keys walk first.
export const NO_STORY = "none";
export const STORY_COLUMN = "stories";

// The stories of a sprint, in row order.
export const sprintStories = (data) => data.rows.map((r) => r.story).filter(Boolean);

// Every story and task of a sprint.
export const sprintItems = (data) => [...sprintStories(data), ...data.columns.flatMap((c) => c.cards)];

// The story or task with `key`, or null.
export function findSprintItem(data, key) {
  return data?.rows.find((r) => r.story?.key === key)?.story ?? findCard(data, key)?.card ?? null;
}

// The row an item stands in: a story its own, a task its story's (or
// NO_STORY).
export const rowOf = (item) => item.row ?? item.key;

// Whether an item is a task (a card in a column) rather than a story.
export const isTask = (item) => Boolean(item?.row);

// A task's state as shown: moved since it was read, the state its new
// column maps its type to (Azure sets that state with the move), until a
// refresh reads it; else its own.
export function shownState(item, column) {
  if (!isTask(item) || !column || item.column === item.readColumn) return item.state;
  return column.mappings?.[item.type] ?? item.state;
}

// The columns keyboard movement and selection walk: the stories that show,
// then the taskboard's columns with the tasks that show, each in row order
// (a task moved in comes last in its column's data).
export function sprintNav(data, filter, mine) {
  const order = new Map(data.rows.map((r, i) => [r.key, i]));
  const stories = { id: STORY_COLUMN, name: "Story", shown: sprintStories(data).filter((s) => shows(s, filter, mine, data.viewer)) };
  const byRow = (a, b) => order.get(rowOf(a)) - order.get(rowOf(b)) || a.number - b.number;
  return [stories, ...shownColumns(data, filter, mine).map((c) => ({ ...c, shown: [...c.shown].sort(byRow) }))];
}

// The rows that show: those with a story or a task that shows (`nav`,
// sprintNav), in the data's order.
export function shownRows(data, nav) {
  const used = new Set(nav.flatMap((c) => c.shown.map(rowOf)));
  return data.rows.filter((r) => used.has(r.key));
}

// The warnings of a sprint: tasks left out (sprintBoard counts them), and
// a query az may have cut at data.limit.
export function sprintWarnings(data) {
  const { unplaced, unknownColumns } = data.meta;
  return [
    ...(unplaced ? [`${unplaced} ${unplaced === 1 ? "Task" : "Tasks"} ohne Platz auf dem Taskboard`] : []),
    ...(unknownColumns ? [`${unknownColumns} ${unknownColumns === 1 ? "Task steht" : "Tasks stehen"} in einer Spalte, die das Board nicht kennt; die Spalten werden beim nächsten Neuladen neu gelesen`] : []),
    ...(data.limited ? [`Nur die ersten ${data.limit} Work Items des Sprints (so viele gibt az boards query)`] : []),
  ];
}

// Keyboard movement over sprintNav's columns: j/k as everywhere (navigate);
// h/l to the next column, onto the item of the same row there, else the
// first one below it, else the last; an empty column is selected as such.
export function sprintNavigate(nav, sel, dir, rows) {
  if (dir === "up" || dir === "down" || !nav.length) return navigate(nav, sel, dir);
  const ci = Math.min(Math.max(sel?.col ?? 0, 0), nav.length - 1);
  const from = nav[ci].shown.find((i) => i.key === sel?.key);
  const to = Math.min(Math.max(ci + (dir === "left" ? -1 : 1), 0), nav.length - 1);
  if (!from || to === ci) return navigate(nav, sel, dir);
  const list = nav[to].shown;
  if (!list.length) return { col: to, key: null };
  const order = new Map(rows.map((r, i) => [r.key, i]));
  const at = order.get(rowOf(from));
  const next = list.find((i) => rowOf(i) === rowOf(from)) ?? list.find((i) => order.get(rowOf(i)) > at) ?? list.at(-1);
  return { col: to, key: next.key };
}

// The data with the item `key` in `state`; a task's column then counts as
// read (shownState shows its own state).
export function withItemState(data, key, state) {
  const set = (i) => (i.key === key ? { ...i, state, ...(isTask(i) ? { readColumn: i.column } : {}) } : i);
  return {
    ...data,
    rows: data.rows.map((r) => (r.story?.key === key ? { ...r, story: set(r.story) } : r)),
    columns: data.columns.map((c) => ({ ...c, cards: c.cards.map(set) })),
  };
}
