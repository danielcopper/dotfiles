// The assignee picker: whom the selected item is assigned to, one person or no
// one, as a menu (helpers.js menu, without digits: typing goes to the filter).
// Its rows are "Ich", "niemand", then the people its source offers (the repo's
// assignable people on GitHub, the team's members on Azure), narrowed by a
// filter that has the keyboard; up/down (or ctrl-j/k, ctrl-n/p) mark a row,
// Enter or a click assigns it (actions/assign.js). Ten rows show at once: the
// window follows the mark, and the mouse wheel moves it (helpers.js,
// followMark and menuWheel). Which row is marked when the rows come and after
// each change of the filter: where the people were read and "Ich" is among
// them, the first row the filter leaves that is no "niemand", and "niemand"
// only where it is all that is left; else (the people could not be read, or
// GitHub named no viewer) none, so that Enter assigns nothing until a row is
// chosen. Board.openAssign opens it as b.modal = { kind: "assign", view, key,
// label, input (the filter's InputState, made for this dialog), field and
// textField ("filter"), inputFocused, filter, at (the marked row, -1 for
// none), top (the first row drawn), wheel (the wheel's move left over:
// menuWheel), list ({ me, people, note }, null while it loads), error }.
// Where the people cannot be read, it says so in the dialog and as a toast,
// and offers what its source can write without them.

import { div } from "gpui-kit";
import { Input, InputState } from "gpui-base";
import { notify } from "herdr";
import { itemLabel, report } from "../../shared.js";
import { wordsMatch } from "../../select.js";
import { assignAtOnce } from "../../actions/assign.js";
import { fieldFrame, followMark, menu, menuWheel, wireTextField } from "../helpers.js";
import { NOTE_TONES, toneColor } from "../tones.js";

// How many rows show at once.
const VISIBLE = 10;

// The rows the filter leaves: { text, sub, person } ("Ich" carries its
// name as `sub`; a person their login), each word of the filter in its
// text, sub or login (wordsMatch).
export function assignRows(list, filter) {
  if (!list) return [];
  const rows = [
    ...(list.me ? [{ text: "Ich", sub: list.me.name, person: list.me }] : []),
    { text: "niemand", sub: null, person: null },
    ...list.people.map((p) => ({ text: p.name, sub: p.login, person: p })),
  ];
  return rows.filter((r) => wordsMatch([r.text, r.sub, r.person?.login], filter));
}

const rowsOf = (m) => assignRows(m.list, m.filter);

// The row marked when the rows come or the filter changes (-1 for none),
// by the rule in the header.
function startAt(m) {
  if (m.error || !m.list?.me) return -1;
  const rows = rowsOf(m);
  const person = rows.findIndex((r) => r.person);
  return person >= 0 ? person : rows.length - 1;
}

// Assigns the row at `i`, where there is one, and closes the dialog.
function assignPick(b, m, i, cx) {
  const row = rowsOf(m)[i];
  if (!row) return;
  b.closeModal(cx);
  assignAtOnce(b, m.view, m.key, row.person, cx);
}

export const assignModal = {
  // Opens the picker for the view's selected item, or says why it cannot
  // be assigned; then asks its source for the people (kept there).
  open(b, view, cx) {
    const item = b.selected(view);
    if (!item) return;
    const source = b.sources[item.source].assign;
    const why = source.refuse(item);
    if (why) return b.say(why, "info", cx);
    const input = InputState.new({ placeholder: "Filter: Name oder Login" });
    const m = { kind: "assign", view, key: item.key, label: itemLabel(item), input, field: "filter", filter: "", at: -1, top: 0, list: null, error: null };
    wireTextField(b, m, input, "filter", (cx) => assignPick(b, m, m.at, cx));
    input.on("change", (_e, cx) => {
      m.filter = input.value();
      m.at = startAt(m);
      m.top = 0;
      cx.notify();
    });
    b.modal = m;
    input.focus();
    cx.spawn(async (cx) => {
      try {
        m.list = await source.people(item, view);
      } catch (e) {
        m.error = `Wer zuweisbar ist, ließ sich nicht lesen: ${report(e)}`;
        m.list = { me: source.fallbackMe(), people: [], note: null };
        notify({ title: "Zuweisen: Personen nicht gelesen", body: m.error, level: "error" });
      } finally {
        m.at = startAt(m);
        cx.notify();
      }
    });
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
    const count = rowsOf(m).length;
    m.at = Math.max(0, Math.min(m.at + by, count - 1));
    followMark(m, count, VISIBLE);
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    const rows = rowsOf(m);
    m.at = Math.max(-1, Math.min(m.at, rows.length - 1));
    m.top = Math.max(0, Math.min(m.top, rows.length - VISIBLE));
    const message = !m.list ? "lädt …" : !rows.length ? "Niemand passt zum Filter" : null;
    const line = (text, color, size = 12) => div().px(8).text_size(size).text_color(color).child(text);
    return menu(t, {
      id: "assign",
      rowId: "assign-row",
      width: 420,
      title: `Zuweisen · ${m.label} · ↑↓ Enter · Esc`,
      head: [
        fieldFrame(t, m, "filter", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground)),
        ...(m.error ? [line(m.error, toneColor(t, NOTE_TONES.error))] : []),
      ],
      digits: false,
      rows: rows.slice(m.top, m.top + VISIBLE).map((r) => [
        div().flex_none().text_color(r.person ? t.foreground : t.muted).child(r.text),
        ...(r.sub ? [div().min_w(0).truncate().text_size(11).text_color(t.dim).child(r.sub)] : []),
      ]),
      from: m.top,
      count: rows.length,
      wheel: (by, cx) => {
        menuWheel(m, by, rows.length, VISIBLE);
        cx.notify();
      },
      at: m.at,
      pick: (i, cx) => assignPick(b, m, i, cx),
      foot: [...(message ? [line(message, t.muted)] : []), ...(m.list?.note ? [line(`Personen: ${m.list.note}`, t.dim, 11)] : [])],
    });
  },
};
