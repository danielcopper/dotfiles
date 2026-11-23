// The board's actions, their one home: the action table ACTIONS, which the
// keys (Board.key, through keyName and actionFor), the hint line (hintsOf)
// and the command menu (menuActions; ui/modals/commands.js) all read, so a
// key, its hint and its menu entry run one action and say one thing. An
// action:
// - id, and name: the menu's name for it (a string, or name(c));
// - key: the key that runs it, as keyName names it; null for one the menu
//   (or a button, or a click) alone runs;
// - menu: its place in the menu (lower first: the item's, the details
//   panel's, the view's, the board's); none for one the menu does not list;
//   group: what it acts on, the menu's heading over it (groupTitle): the
//   selected item, the details panel, the shown view or the board;
// - when(c): whether it can run now; the menu offers only those;
// - takes(c): whether its key is taken (when by default): a few keys are
//   taken where they do nothing, or say why they do nothing;
// - bar: the top bar's keys (tabs, sources, views, nur meine, filter,
//   reload, the menu), which run before the board keeps its selection
//   (Board.key);
// - run(b, c, cx);
// - hint(c): its text on the hint line, null for none; hintKey: the key
//   the hint line names (its key by default).
// An entry without run is a hint only: a core key the Board handles itself
// (moving, gg/G, Tab, the details panel's keys, Esc).
// `c` is what the Board says of the moment (Board.actionContext): { b,
// view, st, shape, item (the selected one), details (the item whose details
// show), related (whether those read related items), panel (the details
// panel's keyboard, or null), line (its selected line's index, or null),
// lines (the related items' lines) }.

import { spaces } from "herdr";
import { cardType, itemLabel } from "./shared.js";
import { hasViewSwitch, sourcesOf, teamViewName, viewSwitchHint } from "./contexts.js";
import { linkedSession } from "./actions/start.js";
import { stepTarget } from "./kinds/board.js";
import { fuzzyRank } from "./select.js";
import { descriptionFolds } from "./ui/related.js";

// What a key event names (an action's key), or null for one no action has:
// [ ] / and : as typed (with Shift, or with Control+Alt; Control alone
// stays herdr's, and Alt alone is let through: a key herdr binds with Alt
// never reaches a mod), else with no Control, Alt or platform key a digit,
// Enter, or a letter (upper case with Shift).
export function keyName(k, ch, mod) {
  const typed = !(mod.control && !mod.alt) && !mod.platform;
  if (typed && ["[", "]", "/", ":"].includes(ch)) return ch;
  if (mod.control || mod.alt || mod.platform) return null;
  if (/^[1-9]$/.test(ch)) return ch;
  if (k === "enter") return "enter";
  if (!/^[a-z]$/.test(k)) return null;
  return mod.shift || ch === k.toUpperCase() ? k.toUpperCase() : k;
}

// How the hint line and the menu write a key.
const keyLabel = (key) => (key === "enter" ? "Enter" : key);

// The action the key `name` runs now: the first in the table that has it
// and takes it; null for none.
export const actionFor = (name, c) => ACTIONS.find((a) => a.run && a.key === name && (a.takes ?? a.when)(c)) ?? null;

const nameOf = (a, c) => (typeof a.name === "function" ? a.name(c) : a.name);

const KIND_NAMES = { issue: "Issue", pr: "PR" };

// The heading of a group of the menu: the item it acts on ("Task AB#311 ·
// Export als CSV"), the details panel's item ("Detailfenster · #2217 …"),
// the view's name ("Sprint"), or "Board".
export function groupTitle(group, c) {
  if (group === "item") return `${[cardType(c.item) ?? KIND_NAMES[c.item.kind], itemLabel(c.item)].filter(Boolean).join(" ")} · ${c.item.title}`;
  if (group === "details") return `Detailfenster · ${itemLabel(c.details)} ${c.details.title}`;
  if (group === "view") return c.view.name;
  return "Board";
}

// The command menu's entries now: { action, name, key, head } for each
// action the menu lists that can run, in the menu's order, with its key
// where that key runs it now (actionFor), else none, and its group's
// heading.
export function menuActions(c) {
  return ACTIONS.filter((a) => a.menu && a.when(c))
    .sort((x, y) => x.menu - y.menu)
    .map((a) => ({ action: a, name: nameOf(a, c), key: a.key && actionFor(a.key, c) === a ? keyLabel(a.key) : null, head: groupTitle(a.group, c) }));
}

// The menu's entries its filter leaves, best first (fuzzyRank).
export const filterActions = (entries, query) => fuzzyRank(entries, query, (e) => e.name);

// The hint line's entries now: [key, text], in the table's order.
export function hintsOf(c) {
  return ACTIONS.filter((a) => a.hint)
    .map((a) => [a.hintKey ?? keyLabel(a.key), a.hint(c)])
    .filter(([, text]) => text);
}

// The shown source's tabs, and the shown one's index.
const tabsOf = (c) => c.b.contexts();
const tabAt = (c) => tabsOf(c).findIndex((x) => x.id === c.b.context()?.id);

// The source after the shown one in the toggle's order.
function nextSource(c) {
  const list = sourcesOf(c.b.config);
  return list[(list.findIndex((s) => s.id === c.b.source()?.id) + 1) % list.length];
}

// The shown team's next view.
function nextView(c) {
  const context = c.b.context();
  const views = context.views;
  return views[(views.indexOf(c.b.teamViewOf(context)) + 1) % views.length];
}

// Whether the shown view has items to move over (none: the placeholder).
const walks = (c) => Boolean(c.shape?.dirs.length);
// Whether an item is selected and no line of the details panel, which
// takes Enter and o while one is.
const onItem = (c) => Boolean(c.item) && c.line === null;
// Whether the shown view's data is read, and its shape has `what`.
const has = (c, what) => Boolean(c.st?.data && c.shape?.[what]);

// The selected column, where the shape hides columns and it can be hidden.
function hideableColumn(c) {
  if (!has(c, "toggleColumn")) return null;
  const col = c.b.navColumns(c.view)[c.st.sel?.col];
  return col?.target ? col : null;
}

// What the second Enter does with the item: go to its session, or start one.
function startName(item) {
  if (linkedSession(item, spaces())) return "Zur Sitzung";
  return item.kind === "pr" ? "Review starten…" : "Agent starten…";
}

// The digit keys' tabs; the first carries the hint for them all.
const tabAction = (n) => ({
  id: `tab-${n}`,
  group: "board",
  name: (c) => `Tab ${n}: ${tabsOf(c)[n - 1].name}`,
  key: String(n),
  menu: 30 + n,
  bar: true,
  when: (c) => Boolean(tabsOf(c)[n - 1]) && n - 1 !== tabAt(c),
  takes: () => true,
  run: (b, c, cx) => b.switchTab(n - 1, cx),
  ...(n === 1 ? { hint: () => "Tab", hintKey: "1 2 3 [ ]" } : {}),
});

// A move of the selected card or task one column on (`by` 1) or back (-1).
const moveAction = (id, key, by, name) => ({
  id,
  group: "item",
  name,
  key,
  menu: by < 0 ? 5 : 6,
  when: (c) => has(c, "move") && Boolean(c.item) && Boolean(stepTarget(c.st.data, c.item.key, by)),
  takes: (c) => has(c, "move"),
  run: (b, c, cx) => c.shape.move(b, c.view, c.st, by, cx),
  ...(by < 0 ? { hint: (c) => (c.shape?.move ? c.shape.moveHint ?? "verschieben" : null), hintKey: "H/L" } : {}),
});

export const ACTIONS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(tabAction),
  {
    id: "tab-next", group: "board", name: "Nächster Tab", key: "]", menu: 40, bar: true,
    when: (c) => tabsOf(c).length > 1, takes: () => true,
    run: (b, c, cx) => b.stepTab(1, cx),
  },
  {
    id: "tab-previous", group: "board", name: "Vorheriger Tab", key: "[", menu: 41, bar: true,
    when: (c) => tabsOf(c).length > 1, takes: () => true,
    run: (b, c, cx) => b.stepTab(-1, cx),
  },
  {
    id: "source", group: "board", name: (c) => `Quelle wechseln: ${nextSource(c).name}`, key: null, menu: 42, bar: true,
    when: (c) => sourcesOf(c.b.config).length > 1,
    run: (b, c, cx) => b.switchSource(nextSource(c).id, cx),
  },
  {
    id: "team-view", group: "view", name: (c) => `Ansicht wechseln: ${teamViewName(nextView(c))}`, key: "v", menu: 23, bar: true,
    when: (c) => hasViewSwitch(c.b.context()), takes: () => true,
    run: (b, c, cx) => b.nextTeamView(cx),
    hint: (c) => (hasViewSwitch(c.b.context()) ? viewSwitchHint(c.b.context()) : null),
  },
  { id: "move-hint", hint: (c) => (c.shape?.dirs.length === 4 ? "bewegen" : null), hintKey: "h/l j/k" },
  { id: "move-list-hint", hint: (c) => (c.shape?.dirs.length === 2 ? "bewegen" : null), hintKey: "j/k" },
  { id: "edge-hint", hint: (c) => (walks(c) ? "erste/letzte" : null), hintKey: "gg/G" },
  moveAction("move-left", "H", -1, "Nach links verschieben"),
  moveAction("move-right", "L", 1, "Nach rechts verschieben"),
  {
    id: "create", group: "view", name: "Neu…", key: "n", menu: 20,
    when: (c) => has(c, "create"),
    run: (b, c, cx) => c.shape.create(b, c.view, cx),
    hint: (c) => (c.shape?.create ? "neu" : null),
  },
  {
    id: "status", group: "item", name: "Status ändern…", key: "s", menu: 3,
    when: (c) => has(c, "openStatusMenu") && Boolean(c.item), takes: (c) => has(c, "openStatusMenu"),
    run: (b, c, cx) => b.openStatusMenu(c.view, cx),
    hint: (c) => (c.shape?.openStatusMenu ? "Status" : null),
  },
  {
    id: "assign", group: "item", name: "Zuweisen…", key: "a", menu: 4,
    when: (c) => has(c, "assign") && Boolean(c.item), takes: (c) => Boolean(c.st?.data),
    run: (b, c, cx) => b.openAssign(c.view, cx),
    hint: (c) => (c.shape?.assign ? "zuweisen" : null),
  },
  // z folds what is where the keyboard is: on a Sprint the selected
  // story's tasks while the board has it, the description while the details
  // panel has it, and on a view whose shape folds nothing of its own the
  // description whenever the details show one that folds (the story's comes
  // first in the table, so it wins while it takes z). The menu offers both
  // where they can run, z beside the one it runs.
  {
    id: "fold-story", group: "item", name: "Story zu-/aufklappen", key: "z", menu: 8,
    when: (c) => has(c, "fold") && Boolean(c.item), takes: (c) => !c.panel && has(c, "fold"),
    run: (b, c, cx) => c.shape.fold(b, c.view, c.st, cx),
    hint: (c) => (!c.panel && c.shape?.fold ? "Story zuklappen" : null),
  },
  {
    id: "details", group: "item", name: "Details zeigen", key: "enter", menu: 1,
    when: (c) => Boolean(c.item) && !c.st.detail,
    run: (b, c, cx) => b.enter(c.view, cx),
    hint: (c) => (walks(c) ? c.shape.enterHint ?? "Detail · Agent" : null),
  },
  {
    id: "start", group: "item", name: (c) => startName(c.item), key: "enter", menu: 2,
    when: (c) => Boolean(c.item) && c.st.detail, takes: (c) => onItem(c) && c.st.detail,
    run: (b, c, cx) => b.enter(c.view, cx),
  },
  {
    id: "open", group: "item", name: "Im Browser öffnen", key: "o", menu: 7,
    when: (c) => Boolean(c.item), takes: onItem,
    run: (b, c, cx) => b.open(c.item, cx),
    hint: (c) => (walks(c) ? "öffnen" : null),
  },
  { id: "tab-hint", hint: (c) => (c.related ? (c.panel ? "Board" : "Details") : null), hintKey: "Tab" },
  { id: "lines-hint", hint: (c) => (c.panel ? "Zeilen" : null), hintKey: "j/k" },
  { id: "page-hint", hint: (c) => (c.panel ? "halbe Seite" : null), hintKey: "ctrl-d/u" },
  { id: "panel-edge-hint", hint: (c) => (c.panel ? "oben/unten" : null), hintKey: "gg/G" },
  {
    id: "fold-description", group: "details", key: "z", menu: 9,
    name: (c) => (c.b.relatedUi.unfolded === c.details.key ? "Beschreibung weniger" : "Beschreibung mehr"),
    when: (c) => c.related && descriptionFolds(c.b.relatedUi, c.details),
    run: (b, c, cx) => b.toggleFold(cx),
    hint: (c) => (actionFor("z", c)?.id === "fold-description" ? (c.b.relatedUi.unfolded === c.details.key ? "weniger" : "mehr") : null),
  },
  // The details panel's selected line (a line selected before `r` read the
  // related items again is gone until they come: its key does nothing).
  {
    id: "line-board", group: "details", name: "Zeile auf dem Board", key: "enter", menu: 10,
    when: (c) => c.line !== null && Boolean(c.lines[c.line]), takes: (c) => c.line !== null,
    run: (b, c, cx) => c.lines[c.line] && b.enterLine(c.view, c.lines[c.line], cx),
    hint: (c) => (c.panel ? "Zeile auf dem Board" : null),
  },
  {
    id: "line-open", group: "details", name: "Zeile im Browser öffnen", key: "o", menu: 11,
    when: (c) => c.line !== null && Boolean(c.lines[c.line]), takes: (c) => c.line !== null,
    run: (b, c, cx) => c.lines[c.line] && b.open(c.lines[c.line], cx),
    hint: (c) => (c.panel ? "Zeile öffnen" : null),
  },
  {
    id: "hide-column", group: "view", name: (c) => `Spalte ausblenden: ${hideableColumn(c).name}`, key: null, menu: 21,
    when: (c) => Boolean(hideableColumn(c)),
    run: (b, c, cx) => b.toggleColumn(c.view, hideableColumn(c), cx),
  },
  {
    id: "columns", group: "view", name: "Spalten…", key: null, menu: 22,
    when: (c) => has(c, "toggleColumn"),
    run: (b, c, cx) => b.openColumns(c.view, cx),
  },
  {
    id: "mine", group: "board", name: (c) => (c.b.mine ? "Nur meine aus" : "Nur meine an"), key: "m", menu: 24, bar: true,
    when: (c) => Boolean(c.b.source()), takes: () => true,
    run: (b, c, cx) => b.toggleMine(cx),
    hint: (c) => (c.b.source() ? "nur meine" : null),
  },
  {
    id: "filter", group: "board", name: "Filter", key: "/", menu: 25, bar: true,
    when: () => true,
    run: (b) => b.filterInput.focus(),
    hint: () => "Filter",
  },
  {
    id: "reload", group: "board", name: "Neu laden", key: "r", menu: 26, bar: true,
    when: () => true,
    run: (b, c, cx) => b.reload(cx),
    hint: () => "neu laden",
  },
  {
    id: "commands", name: "Befehle", key: ":", bar: true,
    when: () => true,
    run: (b, c, cx) => b.openCommands(cx),
    hint: () => "Befehle",
  },
  { id: "escape-hint", hint: (c) => (c.panel ? "zurück" : "schließen"), hintKey: "Esc" },
];
