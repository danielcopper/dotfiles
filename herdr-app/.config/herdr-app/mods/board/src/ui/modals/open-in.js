// The start dialog's space picker ("Öffnen in"), a menu without digits:
// typing goes to the filter. Esc goes back to the dialog it was opened from
// (m.back, Board.closeModal).

import { div } from "gpui-kit";
import { rankByName } from "../../select.js";
import { filterMenuHead, filterMenuKey, machineName, markedName, menu, menuNote, menuWindow, onMachine, openFilterMenu } from "../helpers.js";

// Not a text: a space's id, herdr's text, can never equal it.
export const NEW_SPACE = Symbol("new space");
export const NEW_SPACE_LABEL = "Neuer Space …";

export function spacesNote({ on, layout }) {
  const why = layout === "loading" ? "noch nicht gelesen" : "nicht lesbar";
  return `Die Spaces ${onMachine(on)} sind ${why}; „${NEW_SPACE_LABEL}“ geht trotzdem`;
}

function openInRows(m) {
  const rows = [{ id: NEW_SPACE, name: NEW_SPACE_LABEL, folder: null }, ...m.where().here.map((s) => ({ id: s.id, name: s.name, folder: s.folder }))];
  return rankByName(rows, m.filter);
}

function openInStartAt(m) {
  const rows = openInRows(m);
  if (m.filter) return rows.length ? 0 : -1;
  const chosen = m.where().space?.id ?? NEW_SPACE;
  return Math.max(0, rows.findIndex((r) => r.id === chosen));
}

function pickOpenIn(b, m, i, cx) {
  const row = openInRows(m)[i];
  if (!row) return;
  b.modal = m.back;
  m.choose(row);
  b.takeKeyboard();
  cx.notify();
}

export const openInModal = {
  open(b, back, { where, choose }, cx) {
    const m = { kind: "openIn", view: back.view, back, where, choose };
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
    const where = m.where();
    const rows = openInRows(m);
    const { shown, ...win } = menuWindow(m, rows);
    return menu(t, {
      id: "open-in",
      rowId: "open-in-row",
      width: 440,
      title: `Öffnen in · ${machineName(where.on)}`,
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
        ...(where.readable ? [] : [menuNote(t, spacesNote(where), t.muted)]),
      ],
    });
  },
};
