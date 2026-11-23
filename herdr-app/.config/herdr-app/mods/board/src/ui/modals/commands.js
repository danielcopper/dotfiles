// The command menu: the actions that can run now (commands.js,
// menuActions: by the selected item or row, the view's kind, the details
// and whether their panel has the keyboard, the source), each by its name
// with its key at the right where it has one, under a heading for what
// they act on (the item, the details panel, the view, the board), as a
// menu like the assignee picker's (helpers.js menu, without digits: typing
// goes to the filter). The filter has the keyboard and narrows them as one
// types (filterActions): best first, each group under its best entry, the
// filter's letters in the accent color (fuzzyMatch). Up/down, ctrl-j/k and
// ctrl-n/p mark one, Enter or a click runs it (Board.runAction), Esc
// closes. COMMAND_ROWS rows show at once: the window follows the mark, and
// the mouse wheel moves it (helpers.js, followMark and menuWheel). `:`
// opens it (Board.openCommands) as b.modal = { kind: "commands", entries
// (the actions as it opened), input (the filter's InputState, made for
// this dialog), field and textField ("filter"), inputFocused, filter, at
// (the marked row, -1 for none), top (the first row drawn), wheel (the
// wheel's move left over: menuWheel) }.

import { div } from "gpui-kit";
import { h_flex, Input, InputState } from "gpui-base";
import { filterActions, menuActions } from "../../commands.js";
import { fuzzyMatch } from "../../select.js";
import { fieldFrame, followMark, menu, menuWheel, wireTextField } from "../helpers.js";

// How many of its rows show at once.
const COMMAND_ROWS = 10;

// The entries the filter leaves, best first, each group together after the
// group's best (with no filter, in the menu's order).
export function shownCommands(entries, filter) {
  const ranked = filterActions(entries, filter);
  const heads = [...new Set(ranked.map((e) => e.head))];
  return heads.flatMap((head) => ranked.filter((e) => e.head === head));
}

const entriesOf = (m) => shownCommands(m.entries, m.filter);

// Runs the row at `i`, where there is one, after the menu closed.
function runEntry(b, m, i, cx) {
  const entry = entriesOf(m)[i];
  if (!entry) return;
  b.closeModal(cx);
  b.runAction(entry.action, cx);
}

// An entry's name, the letters the filter found in it in the accent color.
function markedName(t, name, filter) {
  const at = new Set(fuzzyMatch(name, filter)?.at ?? []);
  const runs = [];
  Array.from(name).forEach((ch, i) => {
    const hit = at.has(i);
    if (runs.length && runs.at(-1).hit === hit) runs.at(-1).text += ch;
    else runs.push({ hit, text: ch });
  });
  return h_flex()
    .flex_1()
    .min_w(0)
    .overflow_hidden()
    .children(runs.map((r) => div().flex_none().text_color(r.hit ? t.accent : t.foreground).when(r.hit, (el) => el.font_semibold()).child(r.text)));
}

export const commandsModal = {
  open(b, cx) {
    const input = InputState.new({ placeholder: "Befehl: tippen, um zu filtern" });
    const m = { kind: "commands", entries: menuActions(b.actionContext()), input, field: "filter", filter: "", at: 0, top: 0, wheel: 0 };
    wireTextField(b, m, input, "filter", (cx) => runEntry(b, m, m.at, cx));
    input.on("change", (_e, cx) => {
      m.filter = input.value();
      m.at = entriesOf(m).length ? 0 : -1;
      m.top = 0;
      cx.notify();
    });
    if (!m.entries.length) m.at = -1;
    b.modal = m;
    input.focus();
    cx.notify();
  },

  // Every key but Esc (the Board's): up/down, ctrl-j/k and ctrl-n/p mark
  // a row; the rest is the filter's (Enter: its submit).
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    const ctrl = e.modifiers?.control;
    const by = k === "down" || (ctrl && (k === "j" || k === "n")) ? 1 : k === "up" || (ctrl && (k === "k" || k === "p")) ? -1 : 0;
    if (!by) return;
    cx.stop_propagation();
    const count = entriesOf(m).length;
    m.at = Math.max(0, Math.min(m.at + by, count - 1));
    followMark(m, count, COMMAND_ROWS);
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    const entries = entriesOf(m);
    m.at = Math.max(-1, Math.min(m.at, entries.length - 1));
    m.top = Math.max(0, Math.min(m.top, entries.length - COMMAND_ROWS));
    const shown = entries.slice(m.top, m.top + COMMAND_ROWS);
    return menu(t, {
      id: "commands",
      rowId: "command",
      width: 440,
      title: "Befehle · ↑↓ Enter · Esc",
      head: [fieldFrame(t, m, "filter", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))],
      digits: false,
      rows: shown.map((e) => [
        markedName(t, e.name, m.filter),
        ...(e.key ? [div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(e.key)] : []),
      ]),
      // A group's heading over its first row, and over the window's first.
      heads: shown.map((e, n) => (n === 0 || shown[n - 1].head !== e.head ? e.head : null)),
      from: m.top,
      count: entries.length,
      wheel: (by, cx) => {
        menuWheel(m, by, entries.length, COMMAND_ROWS);
        cx.notify();
      },
      at: m.at,
      pick: (i, cx) => runEntry(b, m, i, cx),
      foot: entries.length ? [] : [div().px(8).text_size(12).text_color(t.muted).child(m.entries.length ? "Kein Befehl passt zum Filter" : "Hier gibt es nichts zu tun")],
    });
  },
};
