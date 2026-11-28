// How the settings page draws (ui/settings/index.js): its top bar, its
// topics on the left and the shown topic's rows on the right.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { CONFIG_NAME } from "../../shared.js";
import { ORIGIN } from "../../settings.js";
import { sourceName } from "../../contexts.js";
import { fieldFrame, loadingLine, selectedLook, toneChip } from "../helpers.js";
import { listPopup } from "../choices.js";
import { NOTE_TONES, toneColor } from "../tones.js";
import { orgName } from "./azure.js";
import { LATER, originOf, settingsOf } from "./knobs.js";
import { markKnob, markedIn, navRows, settingsTopics, showSettingsTopic, shownTopic, topicRows } from "./index.js";

const LABEL_W = 200;
const ORIGIN_W = 100;
const NAV_W = 220;

function originChip(t, origin) {
  if (!origin) return div();
  if (origin === ORIGIN.machine) return toneChip(t, origin, "ansi6").flex_none();
  if (origin === ORIGIN.base) return toneChip(t, origin, "muted").flex_none();
  return div().text_size(11).text_color(t.dim).child(origin);
}

function navRow(b, t, topic, i, marked) {
  return h_flex()
    .id(`topic-${topic.id}`)
    .items_start()
    .gap(8)
    .px(8)
    .py(6)
    .rounded(6)
    .cursor_pointer()
    .when(marked, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => {
      if (!b.modal) showSettingsTopic(b, topic.id, cx);
    })
    .child(div().w(14).flex_none().text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().when(marked, (el) => el.font_semibold()).child(topic.name))
      .child(div().truncate().text_size(11).text_color(t.muted).child(topic.note)));
}

const addLine = (t, add, marked) =>
  h_flex()
    .gap(8)
    .items_center()
    .px(10)
    .py(6)
    .rounded(6)
    .text_size(12)
    .text_color(t.dim)
    .when(marked, (el) => el.bg(t.selected))
    .child(div().font_semibold().text_color(add.run ? t.foreground : t.dim).child("a"))
    .child(div().child(add.text))
    .when(Boolean(add.later), (el) => el.child(div().text_color(t.dim).child(`· ${add.later}`)));

function topicNav(b, t, topics, shown) {
  const heading = (id, text, first) => div().id(id).px(8).pt(first ? 4 : 8).pb(2).truncate().text_size(11).text_color(t.muted).child(text);
  const kids = [];
  let source = null;
  topics.forEach((topic, i) => {
    if (topic.kind === "context" && topic.context.source !== source) {
      source = topic.context.source;
      const name = sourceName(source);
      kids.push(heading(`topic-head-${source}`, source === "azure" ? `${name} · ${orgName(b.config.azure.org)}` : name, !kids.length));
    }
    if (topic.kind !== "context" && source !== "") {
      source = "";
      kids.push(addLine(t, { text: "Kontext hinzufügen …", run: null, later: LATER }, false).id("add-context").px(8));
      kids.push(div().id("topic-rule").h(1).mt(8).mb(4).bg(t.border));
    }
    kids.push(navRow(b, t, topic, i, topic.id === shown.id));
  });
  return v_flex().id("topics").w(NAV_W).flex_none().p(8).gap(2).bg(t.chrome).border_r(1).border_color(t.border).children(kids);
}

// The fields of the edit open in a knob or an add, each with its unit.
function editor(t, m) {
  const field = (id) => h_flex().gap(6).items_center().when(!m.widths[id], (el) => el.flex_1().min_w(0))
    .child(fieldFrame(t, m, id, Input.new(m.inputs[id]).flex_1().text_size(12).text_color(t.foreground)).when(Boolean(m.widths[id]), (el) => el.w(m.widths[id])).when(!m.widths[id], (el) => el.flex_1().min_w(0)))
    .when(Boolean(m.units[id]), (el) => el.child(div().text_size(12).text_color(t.muted).child(m.units[id])));
  return h_flex().id("setting-editor").gap(8).items_center().children(m.fields.map(field));
}

const errorLines = (t, texts) => texts.map((text) => div().text_size(12).text_color(toneColor(t, NOTE_TONES.error)).child(text));

// What the row `id` says why its change was not made: the open edit's
// error, else the page's problem.
function refusals(b, id) {
  const m = b.modal;
  if (m?.kind === "setting" && m.row === id) return m.error ?? [];
  const problem = settingsOf(b).problem;
  return problem?.row === id ? problem.texts : [];
}

function knobLine(b, t, mono, knob, marked) {
  const m = b.modal;
  const editing = m?.kind === "setting" && m.row === knob.id && m.topic === settingsOf(b).topic;
  const was = editing ? knob.editWas ?? knob.was : knob.wasMarked && !marked ? null : knob.was;
  const value = editing ? editor(t, m) : knob.value(t, mono);
  return h_flex()
    .id(`knob-${knob.id}`)
    .gap(12)
    .px(10)
    .py(8)
    .rounded(8)
    .border_1()
    .map(selectedLook(t, marked, t.border, t.background))
    .map((el) => (knob.top ? el.items_start() : el.items_center()))
    .on_click((_e, cx) => {
      if (!b.modal) markKnob(b, knob.id, cx);
    })
    .when(Boolean(knob.stripe), (el) => el.child(div().w(2).self_stretch().flex_none().rounded(1).bg(toneColor(t, knob.stripe ?? "muted"))))
    .child(v_flex().w(LABEL_W).flex_none().min_w(0)
      .child(h_flex().gap(6).items_center().min_w(0)
        .when(knob.d !== undefined, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(String(knob.d))))
        .child(div().min_w(0).truncate().child(knob.name)))
      .when(Boolean(knob.key), (el) => el.child(div().truncate().font_family(mono).text_size(11).text_color(t.dim).child(knob.key ?? ""))))
    .child(v_flex().flex_1().min_w(0).gap(4)
      .child(h_flex().gap(6).items_center().flex_wrap().min_w(0).text_size(knob.mono ? 12 : 13).child(value).when(Boolean(knob.loading), (el) => el.child(loadingLine(t))))
      .when(Boolean(knob.extra), (el) => el.child(knob.extra?.(t, b, marked) ?? div()))
      .children(errorLines(t, refusals(b, knob.id)))
      .children((knob.warn ?? []).map((text) => div().text_size(12).text_color(toneColor(t, NOTE_TONES.warning)).child(text)))
      .when(Boolean(was), (el) => el.child(div().text_size(11).text_color(t.dim).child(was ?? ""))))
    .child(h_flex().w(ORIGIN_W).flex_none().child(originChip(t, originOf(b, knob))))
    .child(div().w(12).flex_none().text_color(t.dim).child(knob.go ? "›" : ""));
}

function rowElement(b, t, mono, r, marked) {
  if (r.row === "head") {
    return v_flex().id("settings-head").px(18).py(14).gap(8).border_b(1).border_color(t.border)
      .child(div().font_family(mono).text_size(11.5).text_color(t.muted).child(r.path))
      .child(div().text_size(15).font_semibold().line_height("20px").child(r.title))
      .child(div().text_size(12).text_color(t.muted).child(r.small));
  }
  const frame = (el) => el.px(18).pb(r.end ? 12 : 6).when(Boolean(r.end), (e) => e.border_b(1).border_color(t.border));
  if (r.row === "title") {
    return frame(h_flex().pt(12).gap(10).items_center().text_size(11).text_color(t.muted)
      .child(div().child(r.title))
      .when(Boolean(r.key), (el) => el.child(div().font_family(mono).text_color(t.dim).child(r.key ?? ""))));
  }
  if (r.row === "line") {
    if (r.loading) return frame(loadingLine(t, r.text));
    return frame(div().child(div().text_size(12).text_color(r.tone === "muted" ? t.muted : toneColor(t, NOTE_TONES[r.tone])).child(r.text)));
  }
  const choosing = b.modal?.kind === "settingChoice";
  if (r.row === "add") {
    const m = b.modal;
    const shown = m?.kind === "setting" && m.row === r.add.id
      ? v_flex().id(r.add.id).gap(4).px(10).py(6).child(editor(t, m)).children(errorLines(t, m.error ?? []))
      : v_flex().id(r.add.id).gap(4).child(addLine(t, r.add, marked)).children(errorLines(t, refusals(b, r.add.id)).map((el) => el.px(10)));
    return frame(div().child(r.add.field ? listPopup(b, t, r.add.field, "top_left", shown, choosing) : shown));
  }
  const line = knobLine(b, t, mono, r.knob, marked);
  return frame(div().child(r.knob.add ? listPopup(b, t, r.knob.field, "top_left", line, choosing) : line));
}

// The page in place of the board's top bar and content: its own top bar
// and body (the board's banner, hint line and dialogs go with them).
export function drawSettingsPage(b, t, mono) {
  const topic = shownTopic(b);
  const rows = topicRows(b, topic);
  const marked = markedIn(b, navRows(rows));
  const top = v_flex().id("top-bar").flex_none().border_b(1).border_color(t.border).child(
    h_flex().px(16).py(8).gap(12).items_center()
      .child(div().flex_none().text_size(15).font_semibold().child("Einstellungen"))
      .child(div().flex_none().text_size(12).text_color(t.muted).child(`${CONFIG_NAME}.json, darüber dieser Rechner: ${b.settingsName()}`)),
  );
  const pane = v_flex().id("settings-pane").flex_1().min_w(0).min_h(0).overflow_y_scrollbar().track_scroll(b.settingsScroll)
    .children(rows.map((r) => rowElement(b, t, mono, r, r === marked)))
    .child(div().h(12));
  const body = h_flex().id("settings").flex_1().min_h(0).items_stretch().child(topicNav(b, t, settingsTopics(b), topic)).child(pane);
  return { top, body };
}
