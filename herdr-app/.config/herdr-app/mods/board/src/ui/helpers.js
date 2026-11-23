// UI helpers: lasting settings, colors and machine names, whether the board
// shows, and the pieces that the Board, its shapes and its modals draw
// alike (a button, a backdrop for a dialog, a menu, its keys and its
// window, a menu whose rows a read brings, a row's name marked by the
// filter, a length in the script's pixels, a detail section, a check's
// color, a status pill, a column's color and head, a card's edge, the line
// of its type, a selected card's or row's look, a card's chip in a tone,
// for a label, for its type and for a session). Which tones and tints they
// take: tones.js.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { layout, notify, panes, settings, spaces } from "herdr";
import { MOD, cardType } from "../shared.js";
import { githubContextId } from "../contexts.js";
import { AGENT_STATUS } from "../actions/start.js";
import { layers } from "./layer.js";
import { NOTE_TONES, chipBg, headBg, hueTone, selectedBg, tint, toneColor, typeLineTone, typeTone } from "./tones.js";
import { stateColor } from "../kinds/states.js";

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

// A menu over the board (the status, the column, the assignee, the
// command and the sprint menu): a panel `width` wide, `<id>-menu` on a
// backdrop `<id>-backdrop`, with a title line, `head` (children under it,
// such as a filter), its rows in `<id>-rows`: one per entry of `rows` (its
// own children), each `<rowId>-<i>` and led by its digit (1–9) unless
// `digits` is false, a heading `<id>-head-<i>` before a row where `heads`
// names one (by the row's place in `rows`), then `foot` (children under
// them).
// `rows` may be a window of a longer list of `count` rows whose first row
// is `from`: `i` counts in the whole list; then a thin thumb
// `<id>-thumb` at the rows' right shows where the window is, a line under
// them says how many rows follow ("↓ 3 weitere"), and the mouse wheel over
// them calls `wheel(by, cx)` (by: the script's pixels, down for more than
// 0; menuWindow). The row `at` is marked; a click on a row picks it
// (`pick(i, cx)`); menuKey takes its keys.
export function menu(t, { id, rowId, width, title, rows, at, pick, head = [], digits = true, from = 0, count = from + rows.length, heads = [], wheel = null, foot = [] }) {
  const below = count - from - rows.length;
  const share = (n) => `${((100 * n) / count).toFixed(2)}%`;
  const row = (kids, n) =>
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
      .children(kids);
  const heading = (text, n) => div().id(`${id}-head-${from + n}`).px(8).pt(n ? 8 : 4).pb(2).truncate().text_size(11).text_color(t.muted).child(text);
  const list = v_flex()
    .id(`${id}-rows`)
    .relative()
    .gap(2)
    .when(Boolean(wheel), (el) => el.on_scroll_wheel((e, cx) => wheel(-unzoomed(e.delta?.y ?? 0), cx)))
    .children(rows.flatMap((kids, n) => [...(heads[n] ? [heading(heads[n], n)] : []), row(kids, n)]))
    .when(count > rows.length, (el) => el.child(
      div().id(`${id}-thumb`).absolute().right(0).top(share(from)).w(3).h(share(rows.length)).rounded(2).bg(t.muted).opacity(0.6),
    ));
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
      .child(list)
      .when(below > 0, (el) => el.child(div().id(`${id}-below`).px(8).text_size(11).text_color(t.dim).child(`↓ ${below} weitere`)))
      .children(foot),
  );
}

// A length herdr measured, or a wheel's move, in the script's pixels: herdr
// reports them in the window's pixels and scales a script's lengths by its
// zoom (gpui-kit's crates/shell/src/value.rs, scaled_px).
export const unzoomed = (px) => px / (Number(settings()?.zoom) || 1);

// How many rows a menu with a filter shows at once (menuWindow).
const MENU_ROWS = 10;
// How far the wheel moves such a menu's window by one row: about a row's
// height in the script's pixels.
export const MENU_ROW_PX = 28;

// The window of a menu with a filter (the assignee picker, the command menu,
// the sprint picker) over the rows of `list` the filter leaves: MENU_ROWS at
// once from m.top, the marked row m.at (-1 for none). Its window follows the
// mark where a key moves it (followMark); the wheel moves it alone
// (menuWheel). menuWindow keeps both within the rows and gives the rows it
// shows (`shown`) and what menu() takes for them.
export function menuWindow(m, list) {
  const count = list.length;
  m.at = Math.max(-1, Math.min(m.at, count - 1));
  m.top = Math.max(0, Math.min(m.top, count - MENU_ROWS));
  const wheel = (by, cx) => {
    menuWheel(m, by, count);
    cx.notify();
  };
  return { shown: list.slice(m.top, m.top + MENU_ROWS), from: m.top, count, at: m.at, wheel };
}

// The window moved so that the marked row shows, after a key moved the
// mark.
export function followMark(m, count) {
  if (m.at >= 0 && m.at < m.top) m.top = m.at;
  if (m.at >= m.top + MENU_ROWS) m.top = m.at - MENU_ROWS + 1;
  m.top = Math.max(0, Math.min(m.top, count - MENU_ROWS));
}

// The wheel over the window (menu's `wheel`): `by` pixels down (up for
// less than 0) move it a row per MENU_ROW_PX, what is left kept for the
// next move (m.wheel), within the rows (at their end nothing is kept); the
// mark stays where it is.
export function menuWheel(m, by, count) {
  m.wheel = (m.wheel ?? 0) + by;
  const step = Math.trunc(m.wheel / MENU_ROW_PX);
  const top = Math.max(0, Math.min(m.top + step, count - MENU_ROWS));
  m.wheel = top === m.top + step ? m.wheel - step * MENU_ROW_PX : 0;
  m.top = top;
}

// A row's name in a menu with a fuzzy filter (the command menu, the sprint
// picker), the filter's letters in it (`at`, fuzzyRank) in the accent
// color.
export function markedName(t, name, at) {
  const hits = new Set(at);
  const runs = [];
  Array.from(name).forEach((ch, i) => {
    const hit = hits.has(i);
    if (runs.length && runs.at(-1).hit === hit) runs.at(-1).text += ch;
    else runs.push({ hit, text: ch });
  });
  return h_flex()
    .flex_1()
    .min_w(0)
    .overflow_hidden()
    .children(runs.map((r) => div().flex_none().text_color(r.hit ? t.accent : t.foreground).when(r.hit, (el) => el.font_semibold()).child(r.text)));
}

// A key in a menu with a filter (every key but Esc, which the Board
// keeps): up/down, ctrl-j/k and ctrl-n/p mark a row of `count`, the
// window following (followMark), and are taken; the rest is the filter's
// (Enter: its submit).
export function filterMenuKey(e, cx, m, count) {
  const k = e.key;
  const ctrl = e.modifiers?.control;
  const by = k === "down" || (ctrl && (k === "j" || k === "n")) ? 1 : k === "up" || (ctrl && (k === "k" || k === "p")) ? -1 : 0;
  if (!by) return;
  cx.stop_propagation();
  m.at = Math.max(0, Math.min(m.at + by, count - 1));
  followMark(m, count);
  cx.notify();
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

// A menu with a filter (the command menu, the assignee picker, the sprint
// picker): opens the dialog `m` ({ kind, view, … }) as b.modal with its
// filter, an InputState with `placeholder` made for it (m.input; field and
// textField "filter", inputFocused, filter; at, the marked row; top and
// wheel, its window). Enter in the filter picks the marked row (pick(i,
// cx)). When it opens and at each change of the filter the row startAt(m)
// gives is marked, and the window, from the top, follows it into view
// (followMark over count(m) rows).
export function openFilterMenu(b, m, { placeholder, count, startAt, pick }, cx) {
  const input = InputState.new({ placeholder });
  Object.assign(m, { input, field: "filter", filter: "", top: 0, wheel: 0 });
  m.at = startAt(m);
  wireTextField(b, m, input, "filter", (cx) => pick(m.at, cx));
  input.on("change", (_e, cx) => {
    m.filter = input.value();
    m.at = startAt(m);
    m.top = 0;
    followMark(m, count(m));
    cx.notify();
  });
  b.modal = m;
  input.focus();
  cx.notify();
}

// Such a menu whose rows come from a read (the assignee picker, the
// sprint picker): openFilterMenu, then read(), whose rows land in m.list
// (null until then); when they come the row startAt(m) gives is marked and
// followed. A read that fails sets m.error and m.list as failed(e) gives
// them ({ error, list }) and says so as a toast titled `title`.
export function openReadMenu(b, m, { read, failed, title, ...menu }, cx) {
  const { startAt, count } = menu;
  Object.assign(m, { list: null, error: null });
  openFilterMenu(b, m, menu, cx);
  cx.spawn(async (cx) => {
    try {
      m.list = await read();
    } catch (e) {
      ({ error: m.error, list: m.list } = failed(e));
      notify({ title, body: m.error, level: "error" });
    } finally {
      m.at = startAt(m);
      followMark(m, count(m));
      cx.notify();
    }
  });
}

// Such a menu's head: its filter, and a read's error where it failed; and
// a line of text under its rows (menuNote).
export const filterMenuHead = (t, m) => [
  fieldFrame(t, m, "filter", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground)),
  ...(m.error ? [menuNote(t, m.error, toneColor(t, NOTE_TONES.error))] : []),
];
export const menuNote = (t, text, color, size = 12) => div().px(8).text_size(size).text_color(color).child(text);

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

// The detail panel's section of a pull request's checks (checksSummary),
// in their state's color.
export const checksSection = (t, checks) => detailSection(t, "CHECKS", div().text_color(checkColor(t, checks.state)).child(checks.text));

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

// The color of a check state: its note level's tone (NOTE_TONES), dim for
// another.
const CHECK_TONES = { failed: NOTE_TONES.error, pending: NOTE_TONES.warning, passed: NOTE_TONES.success };
export const checkColor = (t, state) => toneColor(t, CHECK_TONES[state] ?? "dim");

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

// A state as a chip, in the theme's background on its color: `color` where
// its source names one (GitHub's lines), else its state's in the view's
// `data` (Azure; kinds/states.js), muted before the view is read; "ohne
// Status" for none.
export const stateChip = (t, data, state, color = null) =>
  chip(t, state ?? "ohne Status", t.background, toneColor(t, color ?? (data ? stateColor(data, state) : "muted")));

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
