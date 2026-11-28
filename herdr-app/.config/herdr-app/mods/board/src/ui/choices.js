// A dialog's choice fields (the start dialog's Repo, Agent, Rechner and
// Öffnen in, the create dialog's Typ; the Issues tab's field „Repo:“ opens
// its list as a dialog of its own, ui/modals/solo.js), from a table of the
// dialog's, by field: { entries(m), each { id, name, aside (the texts at its
// right: a space's folder, a repo's count) }; current(m), the id of the
// entry the field is on; value(m), the text the field shows, and
// valueAside(m), the one beside it (null: none); take(b, row, cx), which
// puts the field on that entry; fieldAfter(row), the field the dialog goes
// on to once the list took `row` (by default it stays); closes (the dialog
// ends before take runs, or as a press beside the list closes it); the
// list's placeholder, none (said where the filter leaves no row), empty(m)
// (said instead where no filter is typed), loading(m) (whether the entries
// are still read: the spinner instead), notes(m) (said under the rows),
// width and anchor }. The open list is the dialog's m.list.

import { div } from "gpui-kit";
import { h_flex, Popup } from "gpui-base";
import { rankByName } from "../select.js";
import { fieldFrame, filterMenuHead, filterMenuKey, followMark, loadingLine, markedName, menuNote, menuPanel, menuWindow, wireFilter } from "./helpers.js";

export const LIST_HINT = "Tippen filtert · ↑ ↓ wählt · ↵ übernimmt · Esc schließt die Liste";
export const choiceHint = (enter) => `← → wählt · Leertaste öffnet die Liste · ↵ ${enter} · Tab wechselt das Feld`;

export function choiceBox(b, t, choices, field) {
  const m = b.modal;
  const trigger = choiceTrigger(t, field, choices[field].value(m), choices[field].valueAside?.(m), (cx) => {
    m.field = field;
    b.handle.focus();
    openList(b, choices, field, cx);
  });
  return listPopup(b, t, field, choices[field].anchor, fieldFrame(t, m, field, trigger));
}

// What a choice field shows: `text`, `aside` beside it (null: none) and ▾;
// a click runs open(cx).
export const choiceTrigger = (t, field, text, aside, open) =>
  h_flex()
    .id(`choice-${field}`)
    .flex_1()
    .min_w(0)
    .gap(6)
    .cursor_pointer()
    .on_click((_e, cx) => open(cx))
    .child(div().flex_1().min_w(0).truncate().child(text))
    .when(Boolean(aside), (el) => el.child(div().flex_none().max_w(240).truncate().text_size(11).text_color(t.dim).child(aside ?? "")))
    .child(div().text_color(t.dim).child("▾"));

// The frame of the choice `field`, its list under it while that list is
// open and `here` (the open dialog is the field's own).
export const listPopup = (b, t, field, anchor, frame, here = true) =>
  Popup.new(`choice-${field}-list`, frame).anchor(anchor).when(here && b.modal?.list?.choice === field, (el) => el.content(listPanel(b, t)));

export function choiceKey(b, choices, k, cx) {
  const field = b.modal.field;
  if (k === "space") return openList(b, choices, field, cx);
  if (k === "h" || k === "left") return step(b, choices[field], -1, cx);
  if (k === "l" || k === "right") return step(b, choices[field], 1, cx);
}

function step(b, spec, by, cx) {
  const m = b.modal;
  if (m.busy) return;
  const next = steppedEntry(spec.entries(m), spec.current(m), by);
  if (next) spec.take(b, next, cx);
  cx.notify();
}

// The entry of `rows` ← (by -1) or → (1) goes to from the one whose id is
// `current`, round; null in an empty list. An entry the field is on but
// does not list (a chosen space that is gone, or on a machine whose spaces
// are not read) stands before the first.
export function steppedEntry(rows, current, by) {
  if (!rows.length) return null;
  const now = rows.findIndex((r) => r.id === current);
  return rows[now < 0 ? (by > 0 ? 0 : rows.length - 1) : (now + by + rows.length) % rows.length];
}

export function openList(b, choices, field, cx) {
  const m = b.modal;
  const spec = choices[field];
  if (m.busy || !spec) return;
  const list = { choice: field, spec, field: "filter", mark: NOT_MOVED };
  m.field = field;
  m.list = list;
  wireFilter(m, list, {
    placeholder: spec.placeholder,
    count: () => listRows(m).length,
    startAt: () => {
      list.mark = NOT_MOVED;
      return markedAt(m, listRows(m));
    },
    pick: (_at, cx) => {
      if (m.list === list) takeRow(b, syncedRows(m)[list.at], cx);
    },
  });
  list.input.focus();
  cx.notify();
}

export function closeList(b, cx) {
  b.modal.list = null;
  b.takeKeyboard();
  cx.notify();
}

export function escapeList(b, cx) {
  if (!b.modal.list) return false;
  closeList(b, cx);
  return true;
}

export const listKeyboard = (m) => m.list?.input ?? null;

const listRows = (m) => rankByName(m.list.spec.entries(m), m.list.filter);

// The list's mark (the id of the entry ↑ ↓ moved to) before they move it:
// an entry's id may be null („Alle“ of the field „Repo:“).
const NOT_MOVED = undefined;

function markedAt(m, rows) {
  const { list } = m;
  const moved = list.mark === NOT_MOVED ? -1 : rows.findIndex((r) => r.id === list.mark);
  if (moved >= 0) return moved;
  if (!rows.length) return -1;
  if (list.filter) return 0;
  return rows.findIndex((r) => r.id === list.spec.current(m));
}

// Entries that come after the list opened (agents read, spaces herdr read)
// move the mark to where markedAt puts it now.
function syncedRows(m) {
  const rows = listRows(m);
  const at = markedAt(m, rows);
  if (at !== m.list.at) {
    m.list.at = at;
    followMark(m.list, rows.length);
  }
  return rows;
}

// herdr hands the filter's Enter to its submit as well, which then finds
// the list closed.
export function listKey(b, e, cx) {
  const list = b.modal.list;
  const rows = syncedRows(b.modal);
  if (e.key === "enter") {
    cx.stop_propagation();
    return takeRow(b, rows[list.at], cx);
  }
  if (!filterMenuKey(e, cx, list, rows.length)) return;
  const row = rows[list.at];
  list.mark = row ? row.id : NOT_MOVED;
}

// Still open, the dialog would close as gone where what the take writes
// takes its row off the page.
function takeRow(b, row, cx) {
  const m = b.modal;
  if (!row) return;
  const { spec, choice } = m.list;
  m.list = null;
  if (spec.closes) {
    b.closeModal(cx);
    return spec.take(b, row, cx);
  }
  spec.take(b, row, cx);
  m.field = spec.fieldAfter?.(row) ?? choice;
  b.takeKeyboard();
  cx.notify();
}

function listPanel(b, t) {
  const m = b.modal;
  const { spec } = m.list;
  const rows = syncedRows(m);
  const { shown, ...win } = menuWindow(m.list, rows);
  const none = m.list.filter || !spec.empty ? spec.none : spec.empty(m);
  return div()
    .id("choice-list")
    .mt(4)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(menuPanel(t, {
      id: "choice-list",
      rowId: "choice-list-row",
      width: spec.width,
      title: null,
      head: filterMenuHead(t, m.list),
      digits: false,
      rows: shown.map((r) => [
        markedName(t, r.name, r.at),
        ...(r.aside ?? []).filter(Boolean).map((text) => div().flex_none().max_w(160).truncate().text_size(11).text_color(t.dim).child(text)),
      ]),
      ...win,
      pick: (i, cx) => takeRow(b, rows[i], cx),
      foot: [
        ...(rows.length ? [] : [spec.loading?.(m) ? loadingLine(t).px(8) : menuNote(t, none, t.muted)]),
        ...(spec.notes?.(m) ?? []).map((n) => menuNote(t, n, t.muted)),
      ],
    }));
}

// A press beside the open list closes it.
export const listShield = (b) =>
  b.modal.list
    ? div().id("choice-list-shield").absolute().inset_0().on_mouse_down("left", (_e, cx) => {
      cx.stop_propagation();
      const spec = b.modal?.list?.spec;
      if (!spec) return;
      if (spec.closes) b.closeModal(cx);
      else closeList(b, cx);
    })
    : null;
