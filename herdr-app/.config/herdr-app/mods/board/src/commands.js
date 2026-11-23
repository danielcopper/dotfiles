// The board's actions, their one home: the action table ACTIONS, which the
// keys of its actions (Board.key, through keyName and actionFor), the hint
// line (hintsOf) and the command menu (menuActions; ui/modals/commands.js)
// all read, so a key, its hint and its menu entry run one action and say
// one thing. An action:
// - id, and name: the menu's name for it (a string, or name(c));
// - key: the key that runs it, as keyName names it; null for one the menu
//   (or a button, or a click) alone runs;
// - menu: its place in the menu (lower first: the item's, the details
//   panel's, the view's, the board's); none for one the menu does not list;
//   group: what it acts on (GROUPS: the selected item, the details panel's
//   item, the shown view, or the board), the menu's heading over it;
// - when(c): whether it can run now, which needs what its group acts on;
//   the menu offers only those;
// - takes(c): whether its key is taken (when by default): a few keys are
//   taken where they do nothing, or say why they do nothing;
// - bar: an action of the whole board or of the top bar (the tabs, the
//   source, the team view, nur meine, the filter, reload, the menu), which
//   runs on the moment as it is, without the board keeping its selection
//   first (Board.keptContext);
// - run(b, c, cx); aim(c) and gone(c) where it aims closer than its group
//   (menuActions);
// - hint(c): its text on the hint line, null for none; hintKey: the key
//   the hint line names (its key by default).
// An entry without run is a hint only: a core key the Board handles itself
// (moving, gg/G, Tab, the details panel's keys, Esc).
// `c` is what the Board says of the moment (Board.actionContext): { b,
// view, st, shape, item (the selected one), details (the item whose details
// show: where the panel went down into a related item, that one), related
// (whether those read related items), panel (the details panel's keyboard,
// or null), line (its selected line's index, or null), lines (the related
// items' lines), drilled (whether the panel shows a related item rather
// than the board's selected one), trail (the keys of the items on the
// panel's way down, the board's selected one first) }.

import { spaces } from "herdr";
import { cardType, itemLabel, lineKey } from "./shared.js";
import { hasViewSwitch, shownIndex, sourceAfter, sourcesOf, teamViewAfter, teamViewName, viewSwitchHint } from "./contexts.js";
import { linkedSession } from "./actions/start.js";
import { fuzzyRank } from "./select.js";
import { descriptionFolds } from "./ui/related.js";

// What a key event names (an action's key), or null for one no action has:
// [ ] / and : as typed (with Shift, or with Control+Alt; Control alone
// stays herdr's, and Alt alone is let through: a key herdr binds with Alt
// never reaches a mod), else with no Control, Alt or platform key a digit,
// Enter, or a letter: upper case with Shift alone, so that Caps Lock
// changes no key, and an upper case letter is its own key (Shift+S is no s).
export function keyName(k, ch, mod) {
  const typed = !(mod.control && !mod.alt) && !mod.platform;
  if (typed && ["[", "]", "/", ":"].includes(ch)) return ch;
  if (mod.control || mod.alt || mod.platform) return null;
  if (/^[1-9]$/.test(ch)) return ch;
  if (k === "enter") return "enter";
  if (!/^[a-z]$/.test(k)) return null;
  return mod.shift ? k.toUpperCase() : k;
}

// How the hint line and the menu write a key.
const keyLabel = (key) => (key === "enter" ? "Enter" : key);

// Whether the action `a` is held now: while the details panel shows a
// level it went down to, the actions on the selected item (its group
// "item") take no key and give no hint, since they would act on the
// board's item while another one shows; the menu still offers them, under
// that item's heading.
const held = (a, c) => a.group === "item" && Boolean(c.drilled);

// The action the key `name` runs now: the first in the table that has it
// and takes it, and is not held; null for none.
export const actionFor = (name, c) => ACTIONS.find((a) => a.run && a.key === name && !held(a, c) && (a.takes ?? a.when)(c)) ?? null;

const nameOf = (a, c) => (typeof a.name === "function" ? a.name(c) : a.name);

// The key of the action `id` as the hint line and the menu write it, where
// that key runs it now (actionFor), else null; and its name now. The texts
// that name an action (the description's fold, the hint to the column
// menu) take them from here.
export function keyShown(id, c) {
  const a = ACTIONS.find((x) => x.id === id);
  return a?.key && actionFor(a.key, c) === a ? keyLabel(a.key) : null;
}
export const actionName = (id, c) => nameOf(ACTIONS.find((a) => a.id === id), c);

const KIND_NAMES = { issue: "Issue", pr: "PR" };

// The menu's groups by what they act on: the heading over each (title:
// "Task AB#311 · Export als CSV", "Detailfenster · tender#2217 …", the
// view's name such as "Sprint", or "Board"); `aim`, which of that an
// action opened for (its view and item, its view and details, its view;
// the board has none); and `gone`, what the menu says where an action
// would run on another (Board.runAction).
// The details' aim is the way the panel went down to them (trail), so that
// an action opened on one level does not run on another.
const GROUPS = {
  item: {
    title: (c) => `${[cardType(c.item) ?? KIND_NAMES[c.item.kind], itemLabel(c.item)].filter(Boolean).join(" ")} · ${c.item.title}`,
    aim: (c) => [c.view?.id, c.item?.key],
    gone: (c) => `${itemLabel(c.item)} ist nicht mehr ausgewählt`,
  },
  details: {
    title: (c) => `Detailfenster · ${itemLabel(c.details)} ${c.details.title}`,
    aim: (c) => [c.view?.id, ...(c.trail ?? [c.details?.key])],
    gone: (c) => `Die Details von ${itemLabel(c.details)} sind nicht mehr offen`,
  },
  view: { title: (c) => c.view.name, aim: (c) => [c.view?.id], gone: (c) => `„${c.view.name}“ wird nicht mehr gezeigt` },
  board: { title: () => "Board", aim: () => [], gone: () => "" },
};

// The command menu's entries now: { action, name, key, group, head, aim,
// gone, groupAim, groupGone } for each action the menu lists that can run,
// in the menu's order, with its key where that key runs it now
// (actionFor), else none; its group's heading; and what it aims at and
// what is said where that has gone (GROUPS; an action may aim closer, as
// "Spalte ausblenden" at its column, and what its group aims at, and says,
// apart: where that has gone, the menu says so first).
export function menuActions(c) {
  return ACTIONS.filter((a) => a.menu != null && a.when(c))
    .sort((x, y) => x.menu - y.menu)
    .map((a) => {
      const group = GROUPS[a.group];
      return {
        action: a, name: nameOf(a, c), key: keyShown(a.id, c), group: a.group, head: group.title(c),
        aim: aimOf(a, c), gone: a.gone?.(c) ?? group.gone(c), groupAim: groupAimOf(a, c), groupGone: group.gone(c),
      };
    });
}

// What the action `a` acts on now, as a text to compare (menuActions), and
// what its group does.
export const aimOf = (a, c) => JSON.stringify([...GROUPS[a.group].aim(c), ...(a.aim?.(c) ?? [])]);
export const groupAimOf = (a, c) => JSON.stringify(GROUPS[a.group].aim(c));

// The menu's entries its filter leaves, best first (fuzzyRank), each with
// `at`, where the filter's letters stand in its name.
export const filterActions = (entries, query) => fuzzyRank(entries, query, (e) => e.name).map(({ entry, at }) => ({ ...entry, at }));

// The hint line's entries now: [key, text], in the table's order.
export function hintsOf(c) {
  return ACTIONS.filter((a) => a.hint && !held(a, c))
    .map((a) => [a.hintKey ?? keyLabel(a.key), a.hint(c)])
    .filter(([, text]) => text);
}

// The shown source's tabs, and the shown one's index.
const tabsOf = (c) => c.b.contexts();
const tabAt = (c) => shownIndex(tabsOf(c), c.b.context());

// The source after the shown one, and the shown team's next view.
const nextSource = (c) => sourceAfter(sourcesOf(c.b.config), c.b.source());
const nextView = (c) => teamViewAfter(c.b.context(), c.b.teamViewOf(c.b.context()));

// Whether the shown view has items to move over (none: the placeholder).
const walks = (c) => Boolean(c.shape?.dirs.length);
// Whether an item is selected and no line of the details panel, which
// takes Enter and o while one is, and the panel shows that item's details
// (held while drilled).
const onItem = (c) => Boolean(c.item) && c.line === null;
// Whether the panel shows a related item it went down to, and whether no
// line of it is selected, when Enter and o act on that item.
const onLevel = (c) => Boolean(c.details) && Boolean(c.drilled);
const onLevelItem = (c) => onLevel(c) && c.line === null;
// Whether the line hints name the line's keys: the panel has the keyboard
// and, on a level, a line is selected (else Enter and o are the level's
// item's; a pull request's level has none).
const lineHints = (c) => Boolean(c.panel) && (!c.drilled || c.line !== null);
// What the marked line's actions aim at: that line's item, so that a read
// that shifts the lines while the menu is open runs none on another.
const lineAim = (c) => [c.lines[c.line] ? lineKey(c.lines[c.line]) : null];
const lineGone = (c) => `${itemLabel(c.lines[c.line])} ist nicht mehr markiert`;
// Whether a line of the details panel is selected and still there.
const onLine = (c) => Boolean(c.details) && c.line !== null && Boolean(c.lines[c.line]);
// Whether a view shows, its data is read, and its shape has `what`.
const has = (c, what) => Boolean(c.view && c.st?.data && c.shape?.[what]);

// The selected column, where the shape hides columns and can hide it
// (its canHide).
function hideableColumn(c) {
  if (!has(c, "toggleColumn")) return null;
  const col = c.b.navColumns(c.view)[c.st.sel?.col];
  return col && c.shape.canHide(col) ? col : null;
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
  when: (c) => has(c, "move") && Boolean(c.item) && c.shape.canMove(c.st, c.item, by),
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
    when: (c) => Boolean(c.view) && hasViewSwitch(c.b.context()), takes: () => true,
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
  // On a pull request's level, which reads no related items, the panel
  // still has the keyboard.
  { id: "tab-hint", hint: (c) => (c.related || c.panel ? (c.panel ? "Board" : "Details") : null), hintKey: "Tab" },
  { id: "lines-hint", hint: (c) => (c.panel && c.related ? "Zeilen" : null), hintKey: "j/k" },
  { id: "page-hint", hint: (c) => (c.panel ? "halbe Seite" : null), hintKey: "ctrl-d/u" },
  { id: "panel-edge-hint", hint: (c) => (c.panel ? "oben/unten" : null), hintKey: "gg/G" },
  {
    id: "fold-description", group: "details", key: "z", menu: 9,
    name: (c) => (c.b.relatedUi.unfolded === c.details.key ? "Beschreibung weniger" : "Beschreibung mehr"),
    when: (c) => Boolean(c.details) && c.related && descriptionFolds(c.b.relatedUi, c.details),
    run: (b, c, cx) => b.toggleFold(cx),
    hint: (c) => (keyShown("fold-description", c) ? (c.b.relatedUi.unfolded === c.details.key ? "weniger" : "mehr") : null),
  },
  // The details panel's selected line (a line selected before `r` read the
  // related items again is gone until they come: its key does nothing).
  {
    id: "line-details", group: "details", name: "Zeile im Detailfenster zeigen", key: "enter", menu: 10,
    when: onLine, takes: (c) => c.line !== null, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => c.lines[c.line] && b.drillLine(c.view, c.lines[c.line], cx),
    hint: (c) => (lineHints(c) ? "Zeile zeigen" : null),
  },
  {
    id: "line-board", group: "details", name: "Zeile auf dem Board", key: null, menu: 11,
    when: onLine, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => b.enterLine(c.view, c.lines[c.line], cx),
  },
  {
    id: "line-open", group: "details", name: "Zeile im Browser öffnen", key: "o", menu: 12,
    when: onLine, takes: (c) => c.line !== null, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => c.lines[c.line] && b.open(c.lines[c.line], cx),
    hint: (c) => (lineHints(c) ? "Zeile öffnen" : null),
  },
  // The item the panel went down to: Enter and o act on it where no line
  // is selected (the line's actions come first in the table and take them
  // while one is).
  {
    id: "level-start", group: "details", name: (c) => startName(c.details), key: "enter", menu: 13,
    when: onLevel,
    run: (b, c, cx) => b.startSession(c.view, c.details, cx),
    hint: (c) => (onLevelItem(c) ? (c.details.kind === "pr" ? "Review" : "Agent") : null),
  },
  {
    id: "level-open", group: "details", name: "Im Browser öffnen", key: "o", menu: 14,
    when: onLevel,
    run: (b, c, cx) => b.open(c.details, cx),
    hint: (c) => (onLevelItem(c) ? "öffnen" : null),
  },
  {
    id: "hide-column", group: "view", name: (c) => `Spalte ausblenden: ${hideableColumn(c).name}`, key: null, menu: 21,
    when: (c) => Boolean(hideableColumn(c)),
    run: (b, c, cx) => b.toggleColumn(c.view, hideableColumn(c), cx),
    aim: (c) => [hideableColumn(c)?.id ?? null],
    gone: (c) => `Spalte „${hideableColumn(c).name}“ ist nicht mehr ausgewählt`,
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
