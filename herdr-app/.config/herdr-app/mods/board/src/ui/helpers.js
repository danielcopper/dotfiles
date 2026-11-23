// UI helpers: lasting settings, colors and machine names, whether the board
// shows, and the pieces that the Board, its shapes and its modals draw
// alike (a button, a backdrop for a dialog, a menu and its keys, a detail
// section, a check's color, a status pill, a column's color and head, a
// card's edge, the line of its type, a selected card's or row's look, a
// card's chip in a tone, for a label, for its type and for a session). Which
// tones and tints they take: tones.js.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { layout, panes, spaces } from "herdr";
import { MOD, cardType } from "../shared.js";
import { githubContextId } from "../contexts.js";
import { AGENT_STATUS } from "../actions/start.js";
import { layers } from "./layer.js";
import { chipBg, headBg, hueTone, selectedBg, tint, toneColor, typeLineTone, typeTone } from "./tones.js";

// Settings that last across reloads: the shown source ("source"), each
// source's tab ("tab:<source>"), each team's view ("teamView:<context>"),
// "nur meine" ("mine"), each view's hidden columns ("hidden:<view>") and a
// Sprint's folded stories ("folded:<view>", readStoredFolds). A
// full or missing localStorage keeps them for this session only.
export const store = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Kept in memory only; see above.
    }
  },
};

// The shown view a board before the top bar kept ("view": a GitHub view's
// id) becomes the GitHub source and that tab, once; what is set already
// stays.
export function migrateShownView() {
  const view = store.get("view");
  if (typeof view !== "string") return;
  if (store.get("source") === null) store.set("source", "github");
  if (store.get("tab:github") === null) store.set("tab:github", githubContextId(view));
  store.set("view", null);
}

export const machineName = (name) => name ?? "Dieser Rechner";
// "auf <machine>", or "auf diesem Rechner" for this one.
export const onMachine = (name) => (name ? `auf ${name}` : "auf diesem Rechner");

// Whether this copy of the board shows. The layer's copy (`isLayer`) shows
// while the board layer shows the board. A copy in a tab shows while a
// board pane is in the shown tab of the shown space, and no board layer
// covers that tab's content. herdr tells a pane mod no id of its own pane,
// so two Board tabs would count as one.
export function boardShown(isLayer) {
  const found = layers.boardLayer(layout());
  if (isLayer) return Boolean(found?.shown);
  if (found?.shown) return false;
  const shownTabs = new Set(spaces().filter((s) => s.active).flatMap((s) => s.tabs.filter((t) => t.active).map((t) => t.id)));
  return panes().some((p) => p.mod === MOD && shownTabs.has(p.tab));
}

// "<shown>/<total>" where the filter or "nur meine" hides some, else the
// total.
export const shownOf = (shown, total) => (shown < total ? `${shown}/${total}` : String(total));

// A button; `primary` is the solid one. A disabled one ignores clicks.
export function button(t, id, label, primary, action, disabled = false) {
  return div()
    .id(id)
    .px(12)
    .py(7)
    .rounded(6)
    .text_size(12)
    .cursor_pointer()
    .opacity(disabled ? 0.5 : 1)
    .bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground)
    .when(primary, (el) => el.font_semibold())
    .hover((s) => s.bg(primary ? t.accent : t.hover))
    .on_click((_e, cx) => {
      if (!disabled) action(cx);
    })
    .child(label);
}

// A backdrop over the whole board that swallows presses, with a panel on
// it.
export function backdrop(t, id, panel) {
  return div()
    .id(id)
    .absolute()
    .inset_0()
    .flex()
    .items_center()
    .justify_center()
    .bg(tint(t.background, "b3"))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
    .child(panel);
}

// A menu over the board (the status, the column and the assignee menu): a
// panel `width` wide, `<id>-menu` on a backdrop `<id>-backdrop`, with a
// title line, `head` (children under it, such as a filter), one row per
// entry of `rows` (its own children), each `<rowId>-<i>` and led by its
// digit (1–9) unless `digits` is false, and `foot` (children under them).
// `rows` may be a window of a longer list whose first row is `from`: `i`
// counts in the whole list. The row `at` is marked; a click on a row picks
// it (`pick(i, cx)`); menuKey takes its keys.
export function menu(t, { id, rowId, width, title, rows, at, pick, head = [], digits = true, from = 0, foot = [] }) {
  return backdrop(
    t,
    `${id}-backdrop`,
    v_flex()
      .id(`${id}-menu`)
      .w(width)
      .p(8)
      .gap(2)
      .rounded(10)
      .border_1()
      .border_color(t.input)
      .bg(t.popover)
      .shadow_lg()
      .child(div().px(8).py(6).text_size(12).text_color(t.muted).child(title))
      .children(head)
      .children(
        rows.map((kids, n) =>
          h_flex()
            .id(`${rowId}-${from + n}`)
            .px(8)
            .py(6)
            .gap(8)
            .items_center()
            .rounded(6)
            .cursor_pointer()
            .when(from + n === at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => pick(from + n, cx))
            .when(digits, (el) => el.child(div().w(14).text_size(11).text_color(t.dim).child(from + n < 9 ? String(from + n + 1) : "")))
            .children(kids),
        ),
      )
      .children(foot),
  );
}

// A card's line of who it is assigned to (by name), in every shape alike;
// its callers draw it where the item has assignees.
export const assigneeText = (t, item) => div().text_size(11).text_color(t.dim).child(item.assignees.join(", "));

// A menu's keys (every key but Esc, which the Board keeps; all are taken):
// j/k or the arrows move m.at over `count` rows, Enter picks the row at
// m.at, a digit picks its row (`pick(i, cx)`); a digit beyond the rows does
// nothing.
export function menuKey(e, cx, m, count, pick) {
  const k = e.key;
  const ch = e.key_char ?? "";
  cx.stop_propagation();
  if (k === "j" || k === "down") m.at = Math.max(0, Math.min(m.at + 1, count - 1));
  else if (k === "k" || k === "up") m.at = Math.max(m.at - 1, 0);
  else if (k === "enter") return pick(m.at, cx);
  else if (/^[1-9]$/.test(ch) && Number(ch) <= count) {
    m.at = Number(ch) - 1;
    return pick(m.at, cx);
  }
  cx.notify();
}

// A dialog's text field, the InputState `input` for the dialog m's field
// `field`: m.inputFocused follows its focus (Board.boardHasKeyboard), a
// focus moves the dialog onto that field, and Enter in it runs
// `submit(cx)`.
export function wireTextField(b, m, input, field, submit) {
  m.textField = field;
  m.inputFocused = false;
  input.on("focus", (_e, cx) => {
    m.inputFocused = true;
    if (b.modal === m) m.field = field;
    cx.notify();
  });
  input.on("blur", () => {
    m.inputFocused = false;
  });
  input.on("submit", (_e, cx) => submit(cx));
}

// Tab and shift-Tab (`back`) in the open dialog: the next or previous of
// its `fields`, the keyboard where that field wants it (Board.takeKeyboard).
export function cycleField(b, fields, back, cx) {
  const m = b.modal;
  const at = fields.indexOf(m.field);
  m.field = fields[(at + (back ? -1 : 1) + fields.length) % fields.length];
  b.takeKeyboard();
  cx.notify();
}

// A dialog field's label, and its frame, marked while the dialog is on it.
export const fieldLabel = (t, text) => div().text_size(12).text_color(t.muted).child(text);
export const fieldFrame = (t, m, field, inner) =>
  h_flex().h(34).px(10).items_center().rounded(6).border_1().border_color(m.field === field ? t.accent : t.input).bg(t.background).child(inner);

// The detail panel's width, its one home, from the number of columns that
// share the rest of the board area with it (its shape's columnCount; none
// for a list): a third of that area (the row it shares with the view's
// content), and no narrower than one of those columns, as a share of that
// area (gaps and padding left out). The pixel bounds DETAIL_MIN_W and
// DETAIL_MAX_W come last, so a wide area's 720 px can leave it narrower
// than a column.
export const DETAIL_MIN_W = 420;
export const DETAIL_MAX_W = 720;
export const detailWidth = (columns) => `${(100 * (columns > 0 ? Math.max(1 / 3, 1 / (columns + 1)) : 1 / 3)).toFixed(2)}%`;

// A section of the detail panel: its frame (sectionFrame), a title
// (sectionTitle) over its rows.
// A detail section's padding and the gap between its rows; the related
// items' block (ui/related.js) lays its rows out by them too.
export const FRAME = { px: 18, py: 12, gap: 6 };
export const sectionFrame = (t) => v_flex().px(FRAME.px).py(FRAME.py).gap(FRAME.gap).border_b(1).border_color(t.border);
export const sectionTitle = (t, title) => div().text_size(11).text_color(t.muted).child(title);
export const detailSection = (t, title, ...kids) => sectionFrame(t).child(sectionTitle(t, title)).children(kids);

// The detail panel's parts of a work item (the sprint and the backlog
// shape): its `state` as a pill on its theme `color`, a click opening the
// status menu; a section `title` with `rows` ([label, value]) where there
// are any; and Status s.
export function workItemDetail(b, t, view, { state, color, title, rows }) {
  const openStatus = (cx) => {
    if (!b.modal) b.openStatusMenu(view, cx);
  };
  const line = ([label, value]) => div().text_size(12).text_color(t.muted).child(`${label}: ${value}`);
  return {
    chips: [statusPill(t, state ?? "ohne Status", color, openStatus)],
    sections: rows.length ? [detailSection(t, title, ...rows.map(line))] : [],
    buttons: [button(t, "act-status", "Status s", false, openStatus)],
  };
}

// The color of a check state: its tone's (toneColor), dim for another.
const CHECK_TONES = { failed: "ansi1", pending: "ansi3", passed: "ansi2" };
export const checkColor = (t, state) => (CHECK_TONES[state] ? toneColor(t, CHECK_TONES[state]) : t.dim);

// The detail panel's status pill: `label` on its tone `color`'s color
// (toneColor); a click opens the status menu (`open(cx)`).
export function statusPill(t, label, color, open) {
  return div()
    .id("status-pill")
    .px(10)
    .py(2)
    .rounded(12)
    .text_size(12)
    .font_semibold()
    .cursor_pointer()
    .bg(toneColor(t, color))
    .text_color(t.background)
    .on_click((_e, cx) => open(cx))
    .child(`${label} ▾`);
}

// A column's color (a column of a board or a Sprint, a status menu's
// target): its tone's color (toneColor).
export const columnColor = (t, col) => toneColor(t, col.color);

// A column's head, on a tint of its color for the `ground` it stands on
// (headBg): its color as a dot, its name and `count`.
export const columnHead = (t, col, count, ground) =>
  h_flex()
    .gap(6)
    .px(8)
    .py(4)
    .rounded(6)
    .items_center()
    .bg(headBg(t, col.color, ground))
    .child(div().size(9).flex_none().rounded(5).bg(columnColor(t, col)))
    .child(div().flex_1().min_w(0).truncate().font_semibold().child(col.name))
    .child(div().flex_none().text_size(12).text_color(t.muted).child(count));

// A card's left edge: a narrow bar in its column's color, as tall as the
// card's content beside it.
export const cardEdge = (t, col) => div().w(3).flex_none().rounded(2).bg(columnColor(t, col));

// A thin line across the top of a card or row in its type's color
// (typeLineTone: `hex`, an Azure type's color, or a GitHub issue type's),
// laid over its top edge, `inset` from each side (a rounded card's corner);
// null where its type has no color. The card or row it stands in is
// relative(), so it is placed in that one.
export function typeLine(t, item, hex, inset = 0) {
  const tone = typeLineTone(t, item, hex);
  if (!tone) return null;
  return div().id("type-line").absolute().top(0).left(inset).right(inset).h(2).rounded(1).bg(toneColor(t, tone));
}

// A card's or row's look as selected or not, in every shape alike, for an
// element's map(): a selected one has the accent border and selectedBg; one
// that is not has the border `rest` and the background `restBg` (none: it
// keeps its own).
export const selectedLook = (t, selected, rest, restBg = null) => (el) =>
  el.border_color(selected ? t.accent : rest).when(selected || Boolean(restBg), (e) => e.bg(selected ? selectedBg(t) : restBg));

// A card's chip: `text` in `fg` on `bg`.
export const chip = (t, text, fg = t.muted, bg = t.raised) => div().px(7).rounded(9).text_size(11).text_color(fg).bg(bg).child(text);

// A chip in a `tone` (a theme name): `text` in the tone's color
// (toneColor) on the tone's chip background (chipBg).
export const toneChip = (t, text, tone) => chip(t, text, toneColor(t, tone), chipBg(t, tone));

// A card's chip for its label `name`, in the label's color brought onto the
// theme (hueTone).
export const labelChip = (t, item, name) => toneChip(t, name, hueTone(t, item.labelColors?.[name]));

// A card's chip for its type (cardType), in its color (typeTone); a type
// without one keeps the plain chip in the foreground. Null for no type.
export function typeChip(t, item) {
  const type = cardType(item);
  if (!type) return null;
  const tone = typeTone(t, item);
  return tone ? toneChip(t, type, tone) : chip(t, type, t.foreground);
}

// A card's chip for its session (linkedSession): what its agent does.
export const sessionChip = (t, session) => chip(t, AGENT_STATUS[session.status] ?? "Sitzung", t.background, t[session.status] ?? t.idle);
