// The assignee picker: whom the selected item is assigned to, one person or no
// one, as a menu (helpers.js menu, without digits: typing goes to the filter).
// Its rows are "Ich", "niemand", then the people its source offers (the repo's
// assignable people on GitHub, the team's members on Azure), narrowed by a
// filter that has the keyboard; up/down (or ctrl-j/k, ctrl-n/p) mark a row,
// Enter or a click assigns it (actions/assign.js). Its window shows
// MENU_ROWS rows, follows the mark, and the mouse wheel moves it
// (helpers.js: openReadMenu, menuWindow). Which row is marked when the rows
// come and after each change of the filter: where the people were read and
// "Ich" is among them, the first row the filter leaves that is no "niemand",
// and "niemand" only where it is all that is left; else (the people could
// not be read, or GitHub named no viewer) none, so that Enter assigns
// nothing until a row is chosen. Board.openAssign opens it as b.modal = {
// kind: "assign", view, key, label, and openReadMenu's fields, list being {
// me, people, note } }.
// Where the people cannot be read, it says so in the dialog and as a toast,
// and offers what its source can write without them.

import { div } from "gpui-kit";
import { itemLabel, report } from "../../shared.js";
import { wordsMatch } from "../../select.js";
import { assignAtOnce } from "../../actions/assign.js";
import { LOADING, filterMenuHead, filterMenuKey, menu, menuNote, menuWindow, openReadMenu } from "../helpers.js";

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
    const m = { kind: "assign", view, key: item.key, label: itemLabel(item) };
    openReadMenu(b, m, {
      placeholder: "Filter: Name oder Login",
      count: (m) => rowsOf(m).length,
      startAt,
      pick: (i, cx) => assignPick(b, m, i, cx),
      read: () => source.people(item, view),
      failed: (e) => ({ error: `Wer zuweisbar ist, ließ sich nicht lesen: ${report(e)}`, list: { me: source.fallbackMe(), people: [], note: null } }),
      title: "Zuweisen: Personen nicht gelesen",
    }, cx);
  },

  // Every key but Esc (the Board's): filterMenuKey.
  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, rowsOf(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const rows = rowsOf(m);
    const { shown, ...win } = menuWindow(m, rows);
    const message = !m.list ? LOADING : !rows.length ? "Niemand passt zum Filter" : null;
    return menu(t, {
      id: "assign",
      rowId: "assign-row",
      width: 420,
      title: `Zuweisen · ${m.label}`,
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((r) => [
        div().flex_none().text_color(r.person ? t.foreground : t.muted).child(r.text),
        ...(r.sub ? [div().min_w(0).truncate().text_size(11).text_color(t.dim).child(r.sub)] : []),
      ]),
      ...win,
      pick: (i, cx) => assignPick(b, m, i, cx),
      foot: [...(message ? [menuNote(t, message, t.muted)] : []), ...(m.list?.note ? [menuNote(t, `Personen: ${m.list.note}`, t.dim, 11)] : [])],
    });
  },
};
