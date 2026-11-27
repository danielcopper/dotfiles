// Which tones and tints these helpers take: tones.js.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { layout, notify, panes, settings, spaces } from "herdr";
import { COPPER_HUES, MOD, cardType, firstLine } from "../shared.js";
import { AGENT_STATUS, placed } from "../sessions.js";
import { layers } from "./layer.js";
import { NOTE_TONES, chipBg, headBg, hueTone, namedTone, selectedBg, tint, toneColor, typeLineTone, typeTone } from "./tones.js";
import { stateColor } from "../kinds/states.js";

// What lasts across reloads beside this machine's settings (settings.js):
// the shown context ("context"), each context's tab ("tab:<context>"),
// each team's view ("teamView:<tab>"), each GitHub project's view
// ("projectView:<tab>") and what the board knows of the project
// ("project:<tab>", Board.learnProject), "nur meine" ("mine"), a Sprint's
// folded stories ("folded:<view>", readStoredFolds), the repo a
// view's work item last started in ("repo:<view>", ui/modals/start.js) and
// each view's last good data ("board:data:<view>", loading.js). A full or
// missing localStorage keeps them for this session only.
export const store = {
  get(key) {
    const v = store.text(key);
    try {
      return v === null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  },
  set(key, value) {
    store.setText(key, JSON.stringify(value));
  },
  text(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  // Null, or why the store refused the text.
  setText(key, text) {
    try {
      localStorage.setItem(key, text);
      return null;
    } catch (e) {
      return firstLine(e?.message ?? e) || "refused";
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Gone with the session; see above.
    }
  },
  keys() {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => typeof k === "string");
    } catch {
      return [];
    }
  },
};

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

// GPUI's own 2 px (DRAG_THRESHOLD) is less than a tap on the Deck's touch
// screen may move; 8 px is GTK's drag threshold and Android's touch slop.
export const CLICK_SLOP = 8;

export const inPlace = (from, to) => !from || !to || Math.hypot(to.x - from.x, to.y - from.y) <= CLICK_SLOP;

// herdr before 0.1.18 has no on_window_mouse_up.
export const observesReleases = (el) => typeof el.on_window_mouse_up === "function";

export const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
export const spinner = () => div().frames(SPINNER_FRAMES, 150);

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
export function backdrop(t, id, panel, over = null) {
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
    .child(panel)
    .when(Boolean(over), (el) => el.child(over));
}

export const menu = (t, spec) => backdrop(t, `${spec.id}-backdrop`, menuPanel(t, spec));

export function menuPanel(t, { id, rowId, width, title, rows, at, pick, head = [], digits = true, from = 0, count = from + rows.length, heads = [], wheel = null, foot = [] }) {
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
    .when(Boolean(wheel), (el) => el.on_scroll_wheel((e, cx) => wheel(wheelMove(e), cx)))
    .children(rows.flatMap((kids, n) => [...(heads[n] ? [heading(heads[n], n)] : []), row(kids, n)]))
    .when(count > rows.length, (el) => el.child(
      div().id(`${id}-thumb`).absolute().right(0).top(share(from)).w(3).h(share(rows.length)).map(thumbLook(t)),
    ));
  return v_flex()
    .id(`${id}-menu`)
    .w(width)
    .p(8)
    .gap(2)
    .rounded(10)
    .border_1()
    .border_color(t.input)
    .bg(t.popover)
    .shadow_lg()
    .when(title !== null, (el) => el.child(div().px(8).py(6).text_size(12).text_color(t.muted).child(`${title} · Enter · Esc`)))
    .children(head)
    .child(list)
    .when(below > 0, (el) => el.child(div().id(`${id}-below`).px(8).text_size(11).text_color(t.dim).child(`↓ ${below} weitere`)))
    .children(foot);
}

// A length herdr measured, or a wheel's move, in the script's pixels: herdr
// reports them in the window's pixels and scales a script's lengths by its
// zoom (gpui-kit's crates/shell/src/value.rs, scaled_px).
export const unzoomed = (px) => px / (Number(settings()?.zoom) || 1);

export const wheelMove = (e) => -unzoomed(e.delta?.y ?? 0);

export function sideMove(e) {
  const x = e.delta?.x ?? 0;
  if (Math.abs(x) > Math.abs(e.delta?.y ?? 0)) return -unzoomed(x);
  return e.modifiers?.shift ? wheelMove(e) : 0;
}

export const thumbLook = (t) => (el) => el.rounded(2).bg(t.muted).opacity(0.6);

// How many rows a menu with a filter shows at once (menuWindow).
const MENU_ROWS = 10;
// How far the wheel moves such a menu's window by one row: about a row's
// height in the script's pixels.
export const MENU_ROW_PX = 28;

// The window of a menu with a filter over the rows of `list` the filter
// leaves: MENU_ROWS at once from m.top, the marked row m.at (-1 for none).
// Its window follows the mark where a key moves it (followMark); the wheel
// moves it alone (menuWheel). menuWindow keeps both within the rows and gives
// the rows it shows (`shown`) and what menu() takes for them.
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

// A row's name in a menu with a fuzzy filter, the filter's letters in it
// (`at`, fuzzyRank) in the accent color.
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
  if (!by) return false;
  cx.stop_propagation();
  m.at = Math.max(0, Math.min(m.at + by, count - 1));
  followMark(m, count);
  cx.notify();
  return true;
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

// A filter over rows, on `holder` (a menu with a filter, or a list in a
// dialog); the returned mark() is for rows that come later.
export function wireFilter(m, holder, { placeholder, count, startAt, pick }) {
  const mark = () => {
    holder.at = startAt(holder);
    holder.top = 0;
    followMark(holder, count(holder));
  };
  const input = InputState.new({ placeholder });
  Object.assign(holder, { input, filter: "", wheel: 0 });
  mark();
  trackFocus(m, input, "filter");
  input.on("submit", (_e, cx) => pick(holder.at, cx));
  input.on("change", (_e, cx) => {
    holder.filter = input.value();
    mark();
    cx.notify();
  });
  return mark;
}

// A menu with a filter: opens the dialog `m` ({ kind, view, … }) as b.modal
// with its filter (wireFilter, on m itself; field "filter", inputs).
export function openFilterMenu(b, m, spec, cx) {
  const mark = wireFilter(m, m, spec);
  m.field = "filter";
  m.inputs = { filter: m.input };
  b.modal = m;
  m.input.focus();
  cx.notify();
  return mark;
}

// Such a menu whose rows come from a read (the assignee picker, the
// sprint picker): openFilterMenu, then read(), whose rows land in m.list
// (null until then), marked when they come (its mark). A read that fails
// sets m.error and m.list as failed(e) gives them ({ error, list }) and
// says so as a toast titled `title`.
export function openReadMenu(b, m, { read, failed, title, ...menu }, cx) {
  Object.assign(m, { list: null, error: null });
  const mark = openFilterMenu(b, m, menu, cx);
  cx.spawn(async (cx) => {
    try {
      m.list = await read();
    } catch (e) {
      ({ error: m.error, list: m.list } = failed(e));
      notify({ title, body: m.error, level: "error" });
    } finally {
      mark();
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

// A dialog's text field, the text input `input` for the dialog m's field
// `field`, kept as m.inputs[field] (Board.takeKeyboard): a focus moves the
// dialog onto that field (trackFocus), and Enter in it runs `submit(e, cx)`.
export function wireTextField(b, m, input, field, submit) {
  m.inputs = { ...m.inputs, [field]: input };
  trackFocus(m, input, field, () => {
    if (b.modal === m) m.field = field;
  });
  input.on("submit", submit);
}

// m.inputFocused, which Board.boardHasKeyboard reads, follows the focus of
// the dialog m's inputs.
function trackFocus(m, input, name, focused = () => {}) {
  m.inputFocused = false;
  input.on("focus", (_e, cx) => {
    m.inputFocused = true;
    m.focusedField = name;
    focused();
    cx.notify();
  });
  // A blur that comes after another input of the dialog took the focus
  // leaves it.
  input.on("blur", () => {
    if (m.focusedField !== name) return;
    m.inputFocused = false;
    m.focusedField = null;
  });
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
export const fieldBox = (t, m, field) => h_flex().px(10).rounded(6).border_1().border_color(m.field === field ? t.accent : t.input).bg(t.background);
export const fieldFrame = (t, m, field, inner) => fieldBox(t, m, field).h(34).items_center().child(inner);

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

// A note of the detail panel, under its sections: `text` in its note
// `level`'s tone (NOTE_TONES), with the id `id`.
export const detailNote = (t, id, text, level) => div().id(id).px(18).py(8).text_size(12).text_color(toneColor(t, NOTE_TONES[level])).child(text);

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
export const CARD_EDGE = 3;
export const cardEdge = (t, col) => div().w(CARD_EDGE).flex_none().rounded(2).bg(columnColor(t, col));

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

export const ROW_GAP = 12;
export const ROW_PAD = 18;
export const ROW_BORDER = 2;

export const listRow = (b, t, view, st, item, rest = t.background) =>
  h_flex()
    .id(`row-${item.key}`)
    .relative()
    .flex_none()
    .gap(ROW_GAP)
    .px(ROW_PAD)
    .items_center()
    .border_l(ROW_BORDER)
    .map(selectedLook(t, st.sel?.key === item.key, rest))
    .opacity(st.pending[item.key] ? 0.7 : 1)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => {
      if (!b.modal) b.clickItem(view, { col: 0, key: item.key }, cx);
    });

export const groupHead = (t, group, count) =>
  h_flex().flex_none().gap(8).items_center().border_b(1).border_color(t.border)
    .child(div().size(9).flex_none().rounded(5).bg(toneColor(t, group.color)))
    .child(div().text_size(12.5).font_semibold().child(group.name))
    .child(div().text_size(12).text_color(t.muted).child(count));

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

export const foreignChip = (t) => toneChip(t, "fremd", COPPER_HUES.yellow);

// A switch such as „nur meine“: on, on the theme's `selected` as a chosen
// tab is, with the accent border of its own; not as a primary button
// (solid), which it is not. „nur meine“ keeps its text and weight, so its
// size never changes.
export const toggleSwitch = (b, t, id, on, toggle) =>
  h_flex().id(id).flex_none().gap(6).px(10).py(5).rounded(6).text_size(12).cursor_pointer()
    .border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => {
      if (!b.modal) toggle(cx);
    });

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

export const CANDIDATE = "Kandidat";
export const CANDIDATE_CHIP = `○ ${CANDIDATE}`;
export const sessionChip = (t, session) =>
  session.sure ? chip(t, AGENT_STATUS[session.status] ?? "Sitzung", t.background, t[session.status] ?? t.idle) : chip(t, CANDIDATE_CHIP);

// A Claude session's name is its label where it is in no terminal, so not
// again among its reasons.
export const sessionReasons = (s) =>
  [...s.reasons.filter((r) => r !== s.label), ...(placed(s) ? [] : ["kein Terminal gefunden"])].join(" · ");

export function priorityChip(t, item) {
  if (!item.priority) return null;
  return toneChip(t, item.priority.name, namedTone(t, item.priority.color)).id("priority").flex_none();
}

// `kids`: the key, on a story its fold and type too.
export function cardHead(t, kids, item) {
  const priority = priorityChip(t, item);
  return h_flex().gap(6).items_center().children(kids).when(Boolean(priority), (el) => el.child(div().flex_1()).child(priority));
}

// `parent`: partOfText, or null where the card names none.
export const showsMeta = (item, parent) => Boolean(item.milestone || parent);
export function cardMeta(t, item, parent) {
  if (!showsMeta(item, parent)) return null;
  return h_flex()
    .id("card-meta")
    .gap(8)
    .items_center()
    .min_w(0)
    .when(Boolean(item.milestone), (el) => el.child(toneChip(t, item.milestone, "muted").id("milestone").flex_none()))
    .when(Boolean(parent), (el) => el.child(div().id("parent").flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(parent)));
}

// `pending`: a write of the card is under way.
export const cardEnd = (t, item, session, pending) => [
  ...(session ? [sessionChip(t, session).flex_none()] : []),
  ...(pending ? [div().flex_none().text_size(11).text_color(t.dim).child("speichert …")] : []),
  ...(item.assignees.length ? [assigneeText(t, item).min_w(0).truncate()] : []),
];

export const footLines = (chips, progress, ends) => ({ chips: chips > 0 || (!progress?.total && ends > 0), progress: Boolean(progress?.total) });

export function cardFoot(t, chips, progress, end) {
  const shows = footLines(chips.length, progress, end.length);
  const bar = shows.progress ? progressLine(t, progress, end) : null;
  return [shows.chips ? chipLine(chips, bar ? [] : end) : null, bar].filter(Boolean);
}

function chipLine(chips, end) {
  return h_flex().id("card-chips").gap(5).items_center().child(h_flex().flex_1().min_w(0).gap(5).flex_wrap().items_center().children(chips)).children(end);
}

export const PROGRESS_SEGMENTS = 30;
export const PROGRESS_TONE = "ansi2";

export function progressLine(t, progress, end) {
  if (!progress?.total) return null;
  const { done, total } = progress;
  const on = toneColor(t, PROGRESS_TONE);
  const bar = total <= PROGRESS_SEGMENTS
    ? h_flex().id("progress-bar").flex_1().min_w(40).h(6).items_stretch().gap(2).children(Array.from({ length: total }, (_, i) => div().flex_1().rounded(1).bg(i < done ? on : t.border)))
    : div().id("progress-bar").flex_1().min_w(40).h(6).rounded(1).bg(t.border).child(div().h(6).w(`${((100 * done) / total).toFixed(2)}%`).rounded(1).bg(on));
  const number = (text) => div().flex_none().text_size(11).text_color(t.muted).child(text);
  return h_flex().id("card-progress").gap(8).items_center().child(number(`${done} / ${total}`)).child(bar).child(number(`${Math.floor((100 * done) / total)} %`)).children(end);
}
