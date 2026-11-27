// The data: parseGithubTable's (sources/github.js). View fields it reads:
// id and name.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { NOTHING_SHOWS, cardLabel, dayText, findRow, noItemsText } from "../../shared.js";
import { savedTable, tableFromSaved, tableLines, tableNav, tableValue, tableWarnings, withTableRow } from "../../kinds/table.js";
import { itemSessions } from "../../sessions.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import { clampOffset, spanStarts, thumbOf } from "../../scroll.js";
import { linesLeftBand, scrollToLine, windowedLines, windowedState } from "../band.js";
import { ROW_BORDER, ROW_GAP, ROW_PAD, groupHead, labelChip, limitNote, listRow, sessionChip, shownOf, sideMove, thumbLook, toneChip, typeChip, typeLine, unzoomed } from "../helpers.js";

const tableState = (b) => b.shapeState.table;

const TABLE_ASSIGN = { find: findRow, withItem: withTableRow, where: "in der Tabelle" };

// A row's and a group row's height: each is drawn this high, so the band
// needs no measure.
export const TABLE_ROW_H = 32;
export const TABLE_GROUP_H = 28;

// A field's width, its head's and its cells', by the field's kind; the
// title takes the rest, at least TITLE_MIN_W.
export const FIELD_W = {
  SINGLE_SELECT: 120, ITERATION: 120, NUMBER: 70, DATE: 80, TEXT: 160, ASSIGNEES: 150, LABELS: 200, MILESTONE: 120, REPOSITORY: 130,
  PARENT_ISSUE: 180, SUB_ISSUES_PROGRESS: 80, LINKED_PULL_REQUESTS: 70, ISSUE_TYPE: 100,
};
const OTHER_W = 100;
const TITLE_MIN_W = 200;
const fieldWidth = (field) => FIELD_W[field.type] ?? OTHER_W;
const TABLE_PAD = { left: ROW_BORDER + ROW_PAD, right: ROW_PAD };

export function fieldStrip(fields, width) {
  const widths = fields.map(fieldWidth);
  const { starts: lefts, content } = spanStarts(widths, ROW_GAP);
  const start = TABLE_PAD.left + TITLE_MIN_W + ROW_GAP;
  const viewport = width - start - TABLE_PAD.right;
  if (!(viewport > 0) || content <= viewport) return null;
  return { widths, lefts, content, viewport, start };
}

const stripOf = (s, data) => fieldStrip(data.fields.slice(1), s.width);

export function stripRange(strip, offset) {
  const { lefts, widths, viewport } = strip;
  const from = lefts.findIndex((x, i) => x + widths[i] > offset);
  const to = lefts.findIndex((x) => x >= offset + viewport);
  return { from, to: to < 0 ? lefts.length : to };
}

export function stripStep(strip, offset, by) {
  const next = by > 0 ? strip.lefts.find((x) => x > offset) ?? Infinity : strip.lefts.filter((x) => x < offset).at(-1) ?? 0;
  return clampOffset(next, strip.content, strip.viewport);
}

function stripOffset(s, view, strip) {
  const offset = clampOffset(s.stripAt.get(view.id) ?? 0, strip.content, strip.viewport);
  s.stripAt.set(view.id, offset);
  return offset;
}

function stripWheel(s, view, strip) {
  return (e, cx) => {
    const by = sideMove(e);
    if (!by) return;
    // GPUI scrolls a list that scrolls only vertically by a sideways move too.
    cx.stop_propagation();
    const from = stripOffset(s, view, strip);
    const to = clampOffset(from + by, strip.content, strip.viewport);
    if (to === from) return;
    s.stripAt.set(view.id, to);
    cx.notify();
  };
}

const visibleIn = (b, data) => (r) => b.visible(r, data);
const linesOf = (b, data) => tableLines(data, visibleIn(b, data));
const lineHeight = (line) => (line.row ? TABLE_ROW_H : TABLE_GROUP_H);

export const tableShape = {
  state: () => ({ ...windowedState(), width: 0, stripAt: new Map() }),
  nav: (b, st) => tableNav(st.data, visibleIn(b, st.data)),
  selected: (b, st) => tableNav(st.data, visibleIn(b, st.data))[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo(b, view, sel) {
    const lines = linesOf(b, b.state(view.id).data);
    const at = lines.findIndex((l) => l.row?.key === sel.key);
    if (at >= 0) scrollToLine(tableState(b), lines.map(lineHeight), at);
  },
  bandsLeft: (b) => linesLeftBand(tableState(b)),
  items: (data) => data.rows,
  count: (b, data) => ({ shown: data.rows.filter(visibleIn(b, data)).length, total: data.rows.length }),
  render: (b, t, mono, view, st) => drawTable(b, t, mono, view, st),
  dirs: ["up", "down"],
  sideways(b, view, by) {
    const s = tableState(b);
    const strip = stripOf(s, b.state(view.id).data);
    if (strip) s.stripAt.set(view.id, stripStep(strip, stripOffset(s, view, strip), by));
  },
  loads: true,
  received: (data) => data,
  toSaved: savedTable,
  fromSaved: tableFromSaved,
  warnings: tableWarnings,
  settle: (b, view, due, data, cx) => tellOutcomes(b, unclearAssignLines(due.filter((u) => u.kind === "assign"), data, TABLE_ASSIGN), cx),
  assign: TABLE_ASSIGN,
};

const textCell = (t, text) => div().min_w(0).truncate().text_color(t.muted).child(text);

// A cell's look by its field's kind, for a value (tableValue); a kind not
// here shows the value's name.
const CELLS = {
  SINGLE_SELECT: (t, value) => toneChip(t, value.name, value.color ?? "muted").min_w(0).truncate(),
  DATE: (t, value) => textCell(t, dayText(value.name, new Date().getFullYear()) ?? value.name),
  LABELS: (t, _value, row) => h_flex().min_w(0).gap(5).overflow_hidden().children(row.labels.map((l) => labelChip(t, row, l).flex_none())),
  MILESTONE: (t, value) => toneChip(t, value.name, "muted").min_w(0).truncate(),
  ISSUE_TYPE: (t, _value, row) => typeChip(t, row),
};
const nameCell = (t, value) => textCell(t, value.name);

function stripBox(strip, offset, kid) {
  const { from, to } = stripRange(strip, offset);
  const kids = Array.from({ length: to - from }, (_, k) => kid(from + k));
  return h_flex().flex_none().w(strip.viewport).overflow_hidden().items_center()
    .child(h_flex().flex_none().relative().left(strip.lefts[from] - offset).gap(ROW_GAP).items_center().children(kids));
}

function stripBar(t, strip, offset, wheel) {
  const thumb = thumbOf({ offset, content: strip.content, viewport: strip.viewport });
  return div().id("table-strip-bar").flex_none().relative().h(3).w(strip.viewport).ml(strip.start).mt(4).mb(6).on_scroll_wheel(wheel)
    .child(div().id("table-strip-thumb").absolute().top(0).left(thumb.start).w(thumb.length).h(3).map(thumbLook(t)));
}

function drawTable(b, t, mono, view, st) {
  const data = st.data;
  const s = tableState(b);
  const sessions = b.sessionsNow();
  const lines = linesOf(b, data);
  const rest = data.fields.slice(1);
  const strip = stripOf(s, data);
  const offset = strip ? stripOffset(s, view, strip) : 0;
  const wheel = strip && stripWheel(s, view, strip);
  const fieldKids = (kid) => (strip ? [stripBox(strip, offset, kid)] : rest.map((_f, i) => kid(i)));
  const titleBox = (el) => (strip ? el.w(TITLE_MIN_W).flex_none() : el.flex_1().min_w(TITLE_MIN_W));
  const takesSideWheel = (el) => el.when(Boolean(wheel), (e) => e.on_scroll_wheel(wheel));
  const head = h_flex().id("table-head").flex_none().gap(ROW_GAP).pl(TABLE_PAD.left).pr(TABLE_PAD.right).pt(10).pb(6).text_size(11).text_color(t.dim)
    .map(takesSideWheel)
    .child(titleBox(div()).truncate().child(data.fields[0]?.name ?? "Title"))
    .children(fieldKids((i) => div().id(`table-field-${i + 1}`).w(fieldWidth(rest[i])).flex_none().truncate().child(rest[i].name)));
  const cell = (i, r) => {
    const f = rest[i];
    const value = tableValue(data, r, i + 1);
    const content = value ? (CELLS[f.type] ?? nameCell)(t, value, r) : null;
    return h_flex().w(fieldWidth(f)).flex_none().min_w(0).overflow_hidden().items_center().text_size(12).when(Boolean(content), (el) => el.child(content));
  };
  const row = (r) => {
    const session = itemSessions(sessions, r)[0] ?? null;
    const line = typeLine(t, r, null);
    return listRow(b, t, view, st, r)
      .h(TABLE_ROW_H)
      .map(takesSideWheel)
      .child(titleBox(h_flex()).gap(6).items_center()
        .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
        .child(div().min_w(0).truncate().child(r.title))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session).flex_none())))
      .children(fieldKids((i) => cell(i, r)))
      .when(Boolean(line), (el) => el.child(line));
  };
  const groupRow = (g) => groupHead(t, g.group, shownOf(g.shown, g.held)).id(`group-${g.group.id}`).h(TABLE_GROUP_H).px(TABLE_PAD.left).map(takesSideWheel);
  const list = windowedLines(s, "table-rows", lines, lines.map(lineHeight), (l) => (l.row ? row(l.row) : groupRow(l)), wheel);
  const box = v_flex().id("table-box").flex_1().min_h(0)
    .on_size_change((size, cx) => {
      const width = unzoomed(size.width);
      if (width === s.width) return;
      s.width = width;
      cx.notify();
    })
    .child(head);
  if (!list) {
    const what = data.rows.length ? NOTHING_SHOWS : data.partial ? null : noItemsText(data.meta.filter);
    return box.when(Boolean(what), (el) => el.child(div().p(20).text_color(t.muted).child(what)));
  }
  const note = limitNote(t, data, `Nur die ersten ${data.count} von ${data.total} Einträgen; den Filter enger fassen`);
  return box
    .child(list)
    .when(Boolean(strip), (el) => el.child(stripBar(t, strip, offset, wheel)))
    .when(Boolean(note), (el) => el.child(note));
}
