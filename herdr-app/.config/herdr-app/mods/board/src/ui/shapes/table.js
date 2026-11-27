// The table shape: a GitHub project's table or roadmap view as GitHub's
// table draws it, walked as one list: a head row with the view's fields
// (Title first, as on GitHub), then one row per item, each cell its field's
// value by the field's kind; where the view groups, a group row before
// each group (its value's color, name and how many of its rows show), which
// nothing selects. Like a long board column it draws whole only the rows
// about its window, the others as empty frames of their height (band.js).
// The data: parseGithubTable's (sources/github.js). View fields it reads:
// id and name.

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { NOTHING_SHOWS, cardLabel, dayText, findRow, noItemsText } from "../../shared.js";
import { savedTable, tableFromSaved, tableLines, tableNav, tableValue, tableWarnings, withTableRow } from "../../kinds/table.js";
import { itemSessions } from "../../sessions.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import { rowTops } from "../../scroll.js";
import { bandState, inBand, leftBand, placeBand, readsScroll, revealCard, scrollOf } from "../band.js";
import { groupHead, labelChip, listRow, sessionChip, shownOf, toneChip, typeChip, typeLine } from "../helpers.js";
import { NOTE_TONES, toneColor } from "../tones.js";

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

const visibleIn = (b, data) => (r) => b.visible(r, data);
const linesOf = (b, data) => tableLines(data, visibleIn(b, data));
const lineHeight = (line) => (line.row ? TABLE_ROW_H : TABLE_GROUP_H);

export const tableShape = {
  state() {
    const scroll = ScrollHandle.new();
    return { scroll, band: bandState(), windowed: readsScroll(scroll) };
  },
  nav: (b, st) => tableNav(st.data, visibleIn(b, st.data)),
  selected: (b, st) => tableNav(st.data, visibleIn(b, st.data))[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo(b, view, sel) {
    const st = b.state(view.id);
    const s = tableState(b);
    const lines = linesOf(b, st.data);
    const at = lines.findIndex((l) => l.row?.key === sel.key);
    if (at < 0) return;
    if (s.windowed) {
      const { tops, content } = rowTops(lines.map(lineHeight), 0);
      revealCard(s.band, scrollOf(s.scroll), content, tops[at], lineHeight(lines[at]));
    }
    s.scroll.scroll_to_item(at);
  },
  bandsLeft(b) {
    const s = tableState(b);
    return s.windowed && leftBand(s.band, scrollOf(s.scroll));
  },
  items: (data) => data.rows,
  count: (b, data) => ({ shown: data.rows.filter(visibleIn(b, data)).length, total: data.rows.length }),
  render: (b, t, mono, view, st) => drawTable(b, t, mono, view, st),
  dirs: ["up", "down"],
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

function drawTable(b, t, mono, view, st) {
  const data = st.data;
  const s = tableState(b);
  const sessions = b.sessionsNow();
  const lines = linesOf(b, data);
  const heights = lines.map(lineHeight);
  const at = s.windowed ? scrollOf(s.scroll) : null;
  const layout = at && rowTops(heights, 0);
  if (at) placeBand(s.band, layout.content, at);
  const rest = data.fields.slice(1);
  const head = h_flex().id("table-head").flex_none().gap(12).pl(20).pr(18).pt(10).pb(6).text_size(11).text_color(t.dim)
    .child(div().flex_1().min_w(TITLE_MIN_W).truncate().child(data.fields[0]?.name ?? "Title"))
    .children(rest.map((f, i) => div().id(`table-field-${i + 1}`).w(fieldWidth(f)).flex_none().truncate().child(f.name)));
  const cell = (f, r, i) => {
    const value = tableValue(data, r, i);
    const content = value ? (CELLS[f.type] ?? nameCell)(t, value, r) : null;
    return h_flex().w(fieldWidth(f)).flex_none().min_w(0).overflow_hidden().items_center().text_size(12).when(Boolean(content), (el) => el.child(content));
  };
  const row = (r) => {
    const session = itemSessions(sessions, r)[0] ?? null;
    const line = typeLine(t, r, null);
    return listRow(b, t, view, st, r)
      .h(TABLE_ROW_H)
      .child(h_flex().flex_1().min_w(TITLE_MIN_W).gap(6).items_center()
        .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
        .child(div().min_w(0).truncate().child(r.title))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session).flex_none())))
      .children(rest.map((f, i) => cell(f, r, i + 1)))
      .when(Boolean(line), (el) => el.child(line));
  };
  const groupRow = (g) => groupHead(t, g.group, shownOf(g.shown, g.held)).id(`group-${g.group.id}`).h(TABLE_GROUP_H).px(20);
  const lineEl = (l, i) => {
    if (layout && !inBand(s.band, layout.tops[i], heights[i])) return div().flex_none().h(heights[i]);
    return l.row ? row(l.row) : groupRow(l);
  };
  const box = v_flex().flex_1().min_h(0).child(head);
  if (!lines.length) {
    const what = data.rows.length ? NOTHING_SHOWS : data.partial ? null : noItemsText(data.meta.filter);
    return box.when(Boolean(what), (el) => el.child(div().p(20).text_color(t.muted).child(what)));
  }
  return box
    .child(v_flex().id("table-rows").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(s.scroll)
      .when(s.windowed, (el) => el.on_scroll_wheel((_e, cx) => {
        // GPUI moved the list before the event reached it.
        if (leftBand(s.band, scrollOf(s.scroll))) cx.notify();
      }))
      .children(lines.map(lineEl)))
    .when(Boolean(data.limited) && !data.partial, (el) =>
      el.child(div().px(16).py(8).text_size(12).text_color(toneColor(t, NOTE_TONES.warning))
        .child(`Nur die ersten ${data.count} von ${data.total} Einträgen; den Filter enger fassen`)));
}
