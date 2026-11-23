// A sprint's taskboard: its rows (one per story, and "Ohne Story" for tasks
// whose story is not in the sprint), the items it holds, what shows and how the
// keys walk it, a task's state as shown, a state change laid over the data, its
// warnings (sprintWarnings), which folds hold (foldsOf) and its dates as
// written. The data is a board's (kinds/board.js: its columns hold the tasks, so
// moves, their rollback and H/L work on it as on a board) plus its rows;
// sprintBoard (sources/azure/sprint.js) builds it.

import { lastDayOver } from "../shared.js";
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
// (a task moved in comes last in its column's data). withoutFolded leaves
// the tasks of folded rows out of them.
export function sprintNav(data, filter, mine) {
  const order = new Map(data.rows.map((r, i) => [r.key, i]));
  const stories = { id: STORY_COLUMN, name: "Story", shown: sprintStories(data).filter((s) => shows(s, filter, mine, data.viewer)) };
  const byRow = (a, b) => order.get(rowOf(a)) - order.get(rowOf(b)) || a.number - b.number;
  return [stories, ...shownColumns(data, filter, mine).map((c) => ({ ...c, shown: [...c.shown].sort(byRow) }))];
}

// sprintNav's columns without the tasks of the rows in `folded`.
export const withoutFolded = (nav, folded) => (folded.size ? nav.map((c, i) => (i ? { ...c, shown: c.shown.filter((t) => !folded.has(t.row)) } : c)) : nav);

// Per row key, how many tasks it holds (total) and how many of them show
// in `nav` (sprintNav's columns, none folded: shown).
export function rowCounts(data, nav) {
  const counts = new Map();
  const count = (key) => counts.get(key) ?? counts.set(key, { shown: 0, total: 0 }).get(key);
  for (const t of data.columns.flatMap((c) => c.cards)) count(t.row).total++;
  for (const t of nav.slice(1).flatMap((c) => c.shown)) count(t.row).shown++;
  return counts;
}

// The tasks of the row `key`, in every column.
export const rowTasks = (data, key) => data.columns.flatMap((c) => c.cards.filter((t) => t.row === key));

// Which stories a Sprint view has folded, as the store keeps it
// ("folded:<view>": { sprint: the iteration's id, stories: [story keys] });
// null for anything else.
export function readStoredFolds(v) {
  return typeof v?.sprint === "string" && Array.isArray(v.stories) && v.stories.every((k) => typeof k === "string") ? v : null;
}

// The stories folded in the sprint `data` shows, from what is kept
// (`folds`, readStoredFolds): none where they were folded in another
// sprint.
export const foldedStories = (folds, data) => new Set(folds?.sprint === data.meta.iterationId ? folds.stories : []);

// What a Sprint's data shows, the one place that tells it: "none" where
// the team has no sprint running and none is chosen (meta.iterationId
// null), "current" for the team's current sprint (meta.currentId), and
// "chosen" for another one the sprint picker chose.
export function sprintIs(data) {
  const { iterationId, currentId } = data.meta;
  if (!iterationId) return "none";
  return iterationId === currentId ? "current" : "chosen";
}

// The folds that hold for the sprint `data` shows, of a Sprint view's state
// `st`: for a sprint the sprint picker chose those of this session
// (st.chosenFolds, by the sprint's id), which never replace the stored
// ones; else the stored ones (st.folds).
export const foldsOf = (st, data) => (sprintIs(data) === "chosen" ? st.chosenFolds.get(data.meta.iterationId) ?? null : st.folds);

// `folds` with the story `key` folded, or unfolded where it was, in the
// sprint `data` shows; the folds of another sprint are dropped.
export function toggledFolds(folds, data, key) {
  const now = [...foldedStories(folds, data)];
  return { sprint: data.meta.iterationId, stories: now.includes(key) ? now.filter((k) => k !== key) : [...now, key] };
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

// Keyboard movement over sprintNav's columns: j/k as everywhere (navigate),
// the only keys that change the row; h/l stay in the selected item's row,
// onto that row's item in the next column in their direction that has one
// (the stories' column holds the row's story), past the empty cells; where
// none has one, nothing moves. With no item selected (an empty column) h/l
// move as navigate does.
export function sprintNavigate(nav, sel, dir) {
  if (dir === "up" || dir === "down" || !nav.length) return navigate(nav, sel, dir);
  const ci = Math.min(Math.max(sel?.col ?? 0, 0), nav.length - 1);
  const from = nav[ci].shown.find((i) => i.key === sel?.key);
  if (!from) return navigate(nav, sel, dir);
  const step = dir === "left" ? -1 : 1;
  for (let to = ci + step; to >= 0 && to < nav.length; to += step) {
    const next = nav[to].shown.find((i) => rowOf(i) === rowOf(from));
    if (next) return { col: to, key: next.key };
  }
  return { col: ci, key: from.key };
}

// The data with the story or task `key` replaced by fn(it).
export function mapSprintItem(data, key, fn) {
  const set = (i) => (i.key === key ? fn(i) : i);
  return {
    ...data,
    rows: data.rows.map((r) => (r.story?.key === key ? { ...r, story: set(r.story) } : r)),
    columns: data.columns.map((c) => ({ ...c, cards: c.cards.map(set) })),
  };
}

// The data with the story or task `key`'s fields set to those of `patch`.
export const withSprintItem = (data, key, patch) => mapSprintItem(data, key, (i) => ({ ...i, ...patch }));

// The data with the item `key` in `state`; a task's column then counts as
// read (shownState shows its own state).
export const withItemState = (data, key, state) => mapSprintItem(data, key, (i) => ({ ...i, state, ...(isTask(i) ? { readColumn: i.column } : {}) }));

// A day as the Sprint writes it, from Azure's date (the day's start, in
// UTC): "16.11.", with its year where that is not `year`; null for none.
export function dayText(date, year) {
  const at = new Date(date ?? "");
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getUTCDate()}.${at.getUTCMonth() + 1}.${at.getUTCFullYear() === year ? "" : at.getUTCFullYear()}`;
}

// An iteration's dates as the sprint picker's row says them, `year` the
// year now: "16.11.–27.11.", "ab 16.11.", "bis 27.11.", or "ohne Daten".
export function sprintDates(it, year) {
  const [start, finish] = [dayText(it.start, year), dayText(it.finish, year)];
  if (start && finish) return `${start}–${finish}`;
  if (start) return `ab ${start}`;
  return finish ? `bis ${finish}` : "ohne Daten";
}

// The row the sprint picker marks first among `rows` (in Azure's order,
// each with current, start and finish): the team's current sprint; where
// it has none, the next to start (the first that starts after `now`), else
// the last that ended (its last day over by `now`: lastDayOver),
// else the first.
export function startRow(rows, now) {
  const current = rows.findIndex((r) => r.current);
  if (current >= 0) return current;
  const next = rows.findIndex((r) => Date.parse(r.start ?? "") > now);
  if (next >= 0) return next;
  const ended = rows.map((r) => lastDayOver(r.finish, now)).lastIndexOf(true);
  return Math.max(ended, 0);
}
