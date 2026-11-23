// The sprint picker: which sprint a team's Sprint view shows, as a menu
// like the command menu's (helpers.js menu, without digits: typing goes to
// the filter). Its rows are the team's iterations, past, current and
// future, in Azure's order (the source's iterations, read when the picker
// first opens and kept while the board runs), each with its dates and the
// current one marked "aktuell"; the filter has the keyboard and narrows
// them by their names as the command menu's does (fuzzyRank), its letters
// in the accent color. Up/down, ctrl-j/k and ctrl-n/p mark a row, Enter or
// a click shows that sprint (showSprint), Esc closes; its window shows
// MENU_ROWS rows, follows the mark, and the mouse wheel moves it
// (helpers.js: filterMenuKey, menuWindow, followMark). The current sprint
// is marked when the rows come; after a change of the filter, its first
// row. The command menu's "Sprint wählen…" and a click on the sprint's
// name in the view's head open it (the sprint shape's pickSprint) as
// b.modal = { kind: "sprints", view, team, input (the filter's
// InputState, made for this dialog), field and textField ("filter"),
// inputFocused, filter, at (the marked row, -1 for none), top (the first
// row drawn), wheel (the wheel's move left over), list (null while it
// loads), error }. Where the iterations cannot be read, it says so in the
// dialog and as a toast.

import { div } from "gpui-kit";
import { Input, InputState } from "gpui-base";
import { notify } from "herdr";
import { report } from "../../shared.js";
import { fuzzyRank } from "../../select.js";
import { fieldFrame, filterMenuKey, followMark, markedName, menu, menuWindow, toneChip, wireTextField } from "../helpers.js";
import { NOTE_TONES, toneColor } from "../tones.js";

// A day as the picker writes it, from Azure's date (the day's start, in
// UTC): "16.11.", with its year where that is not `year`; null for none.
function dayText(date, year) {
  const at = new Date(date ?? "");
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getUTCDate()}.${at.getUTCMonth() + 1}.${at.getUTCFullYear() === year ? "" : at.getUTCFullYear()}`;
}

// An iteration's dates as its row says them, `year` the year now:
// "16.11.–27.11.", "ab 16.11.", "bis 27.11.", or "ohne Daten".
export function sprintDates(it, year) {
  const [start, finish] = [dayText(it.start, year), dayText(it.finish, year)];
  if (start && finish) return `${start}–${finish}`;
  if (start) return `ab ${start}`;
  return finish ? `bis ${finish}` : "ohne Daten";
}

// The rows the filter leaves (fuzzyRank on their names), each an
// iteration with `at`, where the filter's letters stand in its name.
export const sprintRows = (list, filter) => fuzzyRank(list ?? [], filter, (it) => it.name).map(({ entry, at }) => ({ ...entry, at }));

const sprintRowsOf = (m) => sprintRows(m.list, m.filter);

// The row marked when the rows come (the current sprint, else the first)
// or after a change of the filter (its first); -1 for none.
function sprintStartAt(m) {
  const rows = sprintRowsOf(m);
  if (!rows.length) return -1;
  const current = m.filter ? -1 : rows.findIndex((r) => r.current);
  return Math.max(current, 0);
}

// Shows the sprint `sprint` ({ id, name, path, finish }; null: the
// current one) in the Sprint view `view`, for as long as the board runs,
// and reads it; one that shows already reads nothing.
export function showSprint(b, view, sprint, cx) {
  const st = b.state(view.id);
  if ((st.sprint?.id ?? null) === (sprint?.id ?? null)) return;
  st.sprint = sprint;
  b.refresh(view, cx);
}

// Shows the row at `i`, where there is one, and closes the picker; the
// current sprint's row goes back to the current one.
function pickSprintRow(b, m, i, cx) {
  const row = sprintRowsOf(m)[i];
  if (!row) return;
  b.closeModal(cx);
  showSprint(b, m.view, row.current ? null : { id: row.id, name: row.name, path: row.path, finish: row.finish }, cx);
}

export const sprintsModal = {
  // Opens the picker for the Sprint view `view`, then asks its source for
  // the team's iterations (kept there).
  open(b, view, cx) {
    const input = InputState.new({ placeholder: "Filter: Name des Sprints" });
    const m = { kind: "sprints", view, team: view.context?.team ?? view.name, input, field: "filter", filter: "", at: -1, top: 0, wheel: 0, list: null, error: null };
    wireTextField(b, m, input, "filter", (cx) => pickSprintRow(b, m, m.at, cx));
    input.on("change", (_e, cx) => {
      m.filter = input.value();
      m.at = sprintStartAt(m);
      m.top = 0;
      cx.notify();
    });
    b.modal = m;
    input.focus();
    cx.spawn(async (cx) => {
      try {
        m.list = await b.loader(view).iterations(view);
      } catch (e) {
        m.error = `Die Sprints des Teams ließen sich nicht lesen: ${report(e)}`;
        m.list = [];
        notify({ title: "Sprint wählen: Sprints nicht gelesen", body: m.error, level: "error" });
      } finally {
        m.at = sprintStartAt(m);
        followMark(m, sprintRowsOf(m).length);
        cx.notify();
      }
    });
    cx.notify();
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
    const line = (text, color) => div().px(8).text_size(12).text_color(color).child(text);
    return menu(t, {
      id: "sprints",
      rowId: "sprint",
      width: 440,
      title: `Sprint · ${m.team} · ↑↓ Enter · Esc`,
      head: [
        fieldFrame(t, m, "filter", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground)),
        ...(m.error ? [line(m.error, toneColor(t, NOTE_TONES.error))] : []),
      ],
      digits: false,
      rows: shown.map((r) => [
        markedName(t, r.name, r.at),
        ...(r.current ? [toneChip(t, "aktuell", NOTE_TONES.success).flex_none()] : []),
        div().flex_none().text_size(11).text_color(t.dim).child(sprintDates(r, year)),
      ]),
      ...win,
      pick: (i, cx) => pickSprintRow(b, m, i, cx),
      foot: message ? [line(message, t.muted)] : [],
    });
  },
};
