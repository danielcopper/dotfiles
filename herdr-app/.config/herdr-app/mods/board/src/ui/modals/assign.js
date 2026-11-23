// The assignee picker: whom the selected item is assigned to, one person or
// no one. Its rows are "Ich", "niemand", then the people its source offers
// (the repo's assignable people on GitHub, the team's members on Azure),
// narrowed by a filter that has the keyboard; up/down (or ctrl-j/k,
// ctrl-n/p) mark a row, Enter or a click assigns it (actions/assign.js).
// a opens it (Board.key) as b.modal = { kind: "assign", view, key, label,
// input (the filter's InputState, made for this dialog), field and
// textField ("filter"), inputFocused, filter, at (the marked row), top
// (the first row drawn), list ({ me, people, note }, null while it loads),
// error }. Where the people cannot be read, it says so in the dialog and
// as a toast, and offers what its source can write without them.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { notify } from "herdr";
import { itemLabel, report } from "../../shared.js";
import { assignAtOnce } from "../../actions/assign.js";
import { backdrop, fieldFrame, wireTextField } from "../helpers.js";

// How many rows show at once.
const VISIBLE = 10;

// The rows the filter leaves: { text, sub, person } ("Ich" carries its
// name as `sub`; a person their login), each word of the filter in its
// text, sub or login.
export function assignRows(list, filter) {
  if (!list) return [];
  const rows = [
    ...(list.me ? [{ text: "Ich", sub: list.me.name, person: list.me }] : []),
    { text: "niemand", sub: null, person: null },
    ...list.people.map((p) => ({ text: p.name, sub: p.login, person: p })),
  ];
  const words = String(filter ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (r) => [r.text, r.sub, r.person?.login].filter(Boolean).join("\n").toLowerCase();
  return rows.filter((r) => words.every((w) => hay(r).includes(w)));
}

const rowsOf = (m) => assignRows(m.list, m.filter);

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
    const source = b.sources[item.source]?.assign;
    if (!source || !b.shape(view).withItem) return;
    const why = source.refuse(item);
    if (why) return b.say(why, "info", cx);
    const input = InputState.new({ placeholder: "Filter: Name oder Login" });
    const m = { kind: "assign", view, key: item.key, label: itemLabel(item), input, field: "filter", filter: "", at: 0, top: 0, list: null, error: null };
    wireTextField(b, m, input, "filter", (cx) => assignPick(b, m, m.at, cx));
    input.on("change", (_e, cx) => {
      m.filter = input.value();
      m.at = 0;
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
        cx.notify();
      }
    });
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
    m.at = Math.max(0, Math.min(m.at + by, rowsOf(m).length - 1));
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    const rows = rowsOf(m);
    m.at = Math.max(0, Math.min(m.at, rows.length - 1));
    if (m.at < m.top) m.top = m.at;
    if (m.at >= m.top + VISIBLE) m.top = m.at - VISIBLE + 1;
    const message = !m.list ? "lädt …" : !rows.length ? "Niemand passt zum Filter" : null;
    const row = (r, i) =>
      h_flex()
        .id(`assign-row-${i}`)
        .px(8)
        .py(6)
        .gap(8)
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .when(i === m.at, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => assignPick(b, m, i, cx))
        .child(div().flex_none().text_color(r.person ? t.foreground : t.muted).child(r.text))
        .when(Boolean(r.sub), (el) => el.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(r.sub ?? "")));
    return backdrop(
      t,
      "assign-backdrop",
      v_flex()
        .id("assign-dialog")
        .w(420)
        .p(12)
        .gap(8)
        .rounded(10)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(div().px(4).text_size(12).text_color(t.muted).child(`Zuweisen · ${m.label} · ↑↓ Enter · Esc`))
        .child(fieldFrame(t, m, "filter", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground)))
        .when(Boolean(m.error), (el) => el.child(div().px(4).text_size(12).text_color(t.ansi1).child(m.error ?? "")))
        .child(v_flex().id("assign-rows").gap(2).children(rows.slice(m.top, m.top + VISIBLE).map((r, i) => row(r, m.top + i))))
        .when(Boolean(message), (el) => el.child(div().px(8).py(6).text_size(12).text_color(t.muted).child(message ?? "")))
        .when(Boolean(m.list?.note), (el) => el.child(div().px(4).text_size(11).text_color(t.dim).child(`Personen: ${m.list?.note}`))),
    );
  },
};
