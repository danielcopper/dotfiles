// The sprint picker: which sprint a team's Sprint view shows, as a menu
// like the command menu's (helpers.js menu, without digits: typing goes to
// the filter). Its rows are the team's iterations, past, current and
// future, in Azure's order (the source's iterations; makeAzure says how
// long they are kept), each with its dates, the team's current sprint
// marked "aktuell"; the filter has the keyboard and narrows them by their
// names as the command menu's does (rankByName), its letters in the
// accent color. Up/down, ctrl-j/k and ctrl-n/p mark a row, Enter or a
// click shows that sprint (the sprint shape's showSprint), Esc closes; its
// window shows MENU_ROWS rows, follows the mark, and the mouse wheel moves
// it (helpers.js: openReadMenu, filterMenuKey, menuWindow). Without a
// filter the sprint startRow names is marked (the current one, where the
// team has one); under a filter, the first row it leaves. The command
// menu's "Sprint wählen…" and a click on the sprint's name in the view's
// head open it (the sprint shape's pickSprint) as b.modal = { kind:
// "sprints", view, team, and openReadMenu's fields }. Where the iterations
// cannot be read, it says so in the dialog and as a toast.

import { div } from "gpui-kit";
import { report } from "../../shared.js";
import { rankByName } from "../../select.js";
import { sprintDates, startRow } from "../../kinds/sprint.js";
import { filterMenuHead, filterMenuKey, markedName, menu, menuNote, menuWindow, openReadMenu, toneChip } from "../helpers.js";
import { NOTE_TONES } from "../tones.js";

const sprintRowsOf = (m) => rankByName(m.list ?? [], m.filter);

// The row marked when the rows come or the filter changes (-1 for none),
// by the rule in the header.
function sprintStartAt(m) {
  const rows = sprintRowsOf(m);
  if (!rows.length) return -1;
  return m.filter ? 0 : startRow(rows, Date.now());
}

// Shows the row at `i`, where there is one, and closes the picker; the
// current sprint's row goes back to the current one.
function pickSprintRow(b, m, i, cx) {
  const row = sprintRowsOf(m)[i];
  if (!row) return;
  b.closeModal(cx);
  b.shape(m.view).showSprint(b, m.view, row.current ? null : { id: row.id, name: row.name }, cx, row.id);
}

export const sprintsModal = {
  // Opens the picker for the Sprint view `view`, then asks its source for
  // the team's iterations.
  open(b, view, cx) {
    const m = { kind: "sprints", view, team: view.context?.team ?? view.name };
    openReadMenu(b, m, {
      placeholder: "Filter: Name des Sprints",
      count: (m) => sprintRowsOf(m).length,
      startAt: sprintStartAt,
      pick: (i, cx) => pickSprintRow(b, m, i, cx),
      read: () => b.loader(view).iterations(view),
      failed: (e) => ({ error: `Die Sprints des Teams ließen sich nicht lesen: ${report(e)}`, list: [] }),
      title: "Sprint wählen: Sprints nicht gelesen",
    }, cx);
  },

  // Every key but Esc (the Board's): filterMenuKey.
  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, sprintRowsOf(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const rows = sprintRowsOf(m);
    const { shown, ...win } = menuWindow(m, rows);
    const year = new Date(Date.now()).getUTCFullYear();
    const empty = m.error ? null : m.list?.length ? "Kein Sprint passt zum Filter" : "Das Team hat keine Sprints";
    const message = !m.list ? "lädt …" : !rows.length ? empty : null;
    return menu(t, {
      id: "sprints",
      rowId: "sprint",
      width: 440,
      title: `Sprint · ${m.team} · Enter · Esc`,
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((r) => [
        markedName(t, r.name, r.at),
        ...(r.current ? [toneChip(t, "aktuell", NOTE_TONES.success).flex_none()] : []),
        div().flex_none().text_size(11).text_color(t.dim).child(sprintDates(r, year)),
      ]),
      ...win,
      pick: (i, cx) => pickSprintRow(b, m, i, cx),
      foot: message ? [menuNote(t, message, t.muted)] : [],
    });
  },
};
