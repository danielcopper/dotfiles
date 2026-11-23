// The command menu: the actions that can run now, each by its name with its
// key at the right where that key runs it now, under a heading for what
// they act on (commands.js, menuActions), as a menu like the assignee
// picker's (helpers.js menu, without digits: typing goes to the filter).
// The filter has the keyboard and narrows them as one types, in the order
// shownCommands gives, the filter's letters in the accent color. Up/down,
// ctrl-j/k and ctrl-n/p mark one, Enter or a click runs it on what it
// aimed at when the menu opened (Board.runAction), Esc closes; its window
// shows MENU_ROWS rows (helpers.js: filterMenuKey, menuWindow). `:` opens it
// (Board.openCommands) as b.modal = { kind: "commands", view (the view it
// opened on, so that a reload of views.json that drops it, or makes it
// another kind, closes it), entries (the actions as it opened), input (the
// filter's InputState, made for this dialog), field and textField
// ("filter"), inputFocused, filter, at (the marked row, -1 for none), top
// (the first row drawn), wheel (the wheel's move left over) }.

import { div } from "gpui-kit";
import { Input, InputState } from "gpui-base";
import { menuActions } from "../../commands.js";
import { rankByName } from "../../select.js";
import { fieldFrame, filterMenuKey, markedName, menu, menuWindow, wireTextField } from "../helpers.js";

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
    const input = InputState.new({ placeholder: "Befehl: tippen, um zu filtern" });
    const m = { kind: "commands", view: c.view, entries: menuActions(c), input, field: "filter", filter: "", at: 0, top: 0, wheel: 0 };
    wireTextField(b, m, input, "filter", (cx) => runEntry(b, m, m.at, cx));
    input.on("change", (_e, cx) => {
      m.filter = input.value();
      m.at = entriesOf(m).length ? 0 : -1;
      m.top = 0;
      cx.notify();
    });
    b.modal = m;
    input.focus();
    cx.notify();
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
      head: [fieldFrame(t, m, "filter", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))],
      digits: false,
      rows: shown.map((e) => [
        markedName(t, e.name, e.at),
        ...(e.key ? [div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(e.key)] : []),
      ]),
      // A group's heading over its first row, and over the window's first.
      heads: shown.map((e, n) => (n === 0 || shown[n - 1].group !== e.group ? e.head : null)),
      ...win,
      pick: (i, cx) => runEntry(b, m, i, cx),
      foot: entries.length ? [] : [div().px(8).text_size(12).text_color(t.muted).child("Kein Befehl passt zum Filter")],
    });
  },
};
