// The command menu: the actions that can run now, each by its name with its
// key at the right where that key runs it now, under a heading for what
// they act on (commands.js, menuActions), as a menu like the assignee
// picker's (helpers.js menu, without digits: typing goes to the filter).
// The filter has the keyboard and narrows them as one types, in the order
// shownCommands gives, the filter's letters in the accent color. Up/down,
// ctrl-j/k and ctrl-n/p mark one, Enter or a click runs it on what it
// aimed at when the menu opened (Board.runAction), Esc closes; its window
// shows MENU_ROWS rows (helpers.js: openFilterMenu, filterMenuKey,
// menuWindow). `:` opens it (Board.openCommands) as b.modal = { kind:
// "commands", view (the view it opened on, so that a reload of views.json
// that drops it, or makes it another kind, closes it), entries (the
// actions as it opened), and openFilterMenu's fields }; its first row is
// marked, -1 where the filter leaves none.

import { div } from "gpui-kit";
import { menuActions } from "../../commands.js";
import { rankByName } from "../../select.js";
import { filterMenuHead, filterMenuKey, markedName, menu, menuNote, menuWindow, openFilterMenu } from "../helpers.js";

// The entries the filter leaves (rankByName), best first, each group
// (an action's group, not its heading's text) together after its best;
// with no filter, in the menu's order.
export function shownCommands(entries, filter) {
  const ranked = rankByName(entries, filter);
  const groups = [...new Set(ranked.map((e) => e.group))];
  return groups.flatMap((group) => ranked.filter((e) => e.group === group));
}

const entriesOf = (m) => shownCommands(m.entries, m.filter);

// Runs the row at `i`, where there is one, after the menu closed.
function runEntry(b, m, i, cx) {
  const entry = entriesOf(m)[i];
  if (!entry) return;
  b.closeModal(cx);
  b.runAction(entry, cx);
}

export const commandsModal = {
  // Opens the menu on the moment `c` (Board.openCommands).
  open(b, c, cx) {
    const m = { kind: "commands", view: c.view, entries: menuActions(c) };
    openFilterMenu(b, m, {
      placeholder: "Befehl: tippen, um zu filtern",
      count: (m) => entriesOf(m).length,
      startAt: (m) => (entriesOf(m).length ? 0 : -1),
      pick: (i, cx) => runEntry(b, m, i, cx),
    }, cx);
  },

  // Every key but Esc (the Board's): filterMenuKey.
  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, entriesOf(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const entries = entriesOf(m);
    const { shown, ...win } = menuWindow(m, entries);
    return menu(t, {
      id: "commands",
      rowId: "command",
      width: 440,
      title: "Befehle · ↑↓ Enter · Esc",
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((e) => [
        markedName(t, e.name, e.at),
        ...(e.key ? [div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(e.key)] : []),
      ]),
      // A group's heading over its first row, and over the window's first.
      heads: shown.map((e, n) => (n === 0 || shown[n - 1].group !== e.group ? e.head : null)),
      ...win,
      pick: (i, cx) => runEntry(b, m, i, cx),
      foot: entries.length ? [] : [menuNote(t, "Kein Befehl passt zum Filter", t.muted)],
    });
  },
};
