// The start dialog's space picker ("Öffnen in"): where the session opens,
// as a menu like the assignee picker's (helpers.js menu, without digits:
// typing goes to the filter). Its rows are "Neuer Space …" and the spaces
// of the machine the dialog has chosen, in herdr's order, narrowed by
// their names (rankByName). Without a filter the dialog's current choice
// is marked, under a filter the first row it leaves. Enter or a click
// takes the row and goes back to the dialog, on the new space's name for
// "Neuer Space …"; Esc goes back without a choice (Board.closeModal, by
// m.back). Enter or a click on "Öffnen in" opens it as b.modal = { kind:
// "openIn", view, back (the start dialog), and openFilterMenu's fields }.

import { div } from "gpui-kit";
import { machines, spaces } from "herdr";
import { rankByName } from "../../select.js";
import { preselectedSpace, spacesOn } from "../../actions/start.js";
import { filterMenuHead, filterMenuKey, machineName, markedName, menu, menuNote, menuWindow, onMachine, openFilterMenu } from "../helpers.js";

// Not a text: a space's id, herdr's text, can never equal it.
export const NEW_SPACE = Symbol("new space");
export const NEW_SPACE_LABEL = "Neuer Space …";

// Where the start dialog `m` opens the session, from the spaces herdr
// knows now: { on, layout (the machine's, machines()), readable, here (its
// spaces where readable), space (null for a new space) }. A chosen space
// that is gone, and no choice since the machine changed (m.target null),
// fall back to preselectedSpace.
export function openIn(m) {
  const on = m.machines[m.machine];
  const layout = machines().find((x) => (x.name ?? null) === (on ?? null))?.layout ?? (on ? "unavailable" : "ready");
  const readable = layout === "ready";
  const here = readable ? spacesOn(spaces(), on) : [];
  const space = m.target === NEW_SPACE ? null : here.find((s) => s.id === m.target) ?? preselectedSpace(here, m.spaceName);
  return { on, layout, readable, here, space };
}

export function spacesNote({ on, layout }) {
  const why = layout === "loading" ? "noch nicht gelesen" : "nicht lesbar";
  return `Die Spaces ${onMachine(on)} sind ${why}; „${NEW_SPACE_LABEL}“ geht trotzdem`;
}

function openInRows(m) {
  const rows = [{ id: NEW_SPACE, name: NEW_SPACE_LABEL, folder: null }, ...openIn(m.back).here.map((s) => ({ id: s.id, name: s.name, folder: s.folder }))];
  return rankByName(rows, m.filter);
}

function openInStartAt(m) {
  const rows = openInRows(m);
  if (m.filter) return rows.length ? 0 : -1;
  const chosen = openIn(m.back).space?.id ?? NEW_SPACE;
  return Math.max(0, rows.findIndex((r) => r.id === chosen));
}

function pickOpenIn(b, m, i, cx) {
  const row = openInRows(m)[i];
  if (!row) return;
  const start = m.back;
  start.target = row.id;
  start.field = row.id === NEW_SPACE ? "name" : "open";
  start.error = null;
  b.modal = start;
  b.takeKeyboard();
  cx.notify();
}

export const openInModal = {
  open(b, start, cx) {
    const m = { kind: "openIn", view: start.view, back: start };
    openFilterMenu(b, m, {
      placeholder: "Filter: Name des Space",
      count: (m) => openInRows(m).length,
      startAt: openInStartAt,
      pick: (i, cx) => pickOpenIn(b, m, i, cx),
    }, cx);
  },

  // Every key but Esc (the Board's): filterMenuKey.
  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, openInRows(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const target = openIn(m.back);
    const rows = openInRows(m);
    const { shown, ...win } = menuWindow(m, rows);
    return menu(t, {
      id: "open-in",
      rowId: "open-in-row",
      width: 440,
      title: `Öffnen in · ${machineName(target.on)}`,
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((r) => [
        markedName(t, r.name, r.at),
        ...(r.folder ? [div().flex_none().max_w(200).truncate().text_size(11).text_color(t.dim).child(r.folder)] : []),
      ]),
      ...win,
      pick: (i, cx) => pickOpenIn(b, m, i, cx),
      foot: [
        ...(rows.length ? [] : [menuNote(t, "Kein Space passt zum Filter", t.muted)]),
        ...(target.readable ? [] : [menuNote(t, spacesNote(target), t.muted)]),
      ],
    });
  },
};
