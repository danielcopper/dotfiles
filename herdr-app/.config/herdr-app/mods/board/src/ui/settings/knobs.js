// What the settings page's topics build their rows from (ui/settings/index.js):
// rows, the writes, edits and choices of a knob, rows of switches, and the
// small values they draw. A knob: { id, name, d (the dim lead before its
// name: its place in its list, or a found row's platform or host), key (the
// key it sets, as shown), path (its setting's: its origin, and what u
// resets; none for one without), origin (shown in place of path's),
// value(t, mono), mono (its value at 12 px, as a mono text is), warn, was
// (a dim line; with wasMarked only while marked, editWas in its place while
// edited), loading, top, stripe (a PR section's tone), go (Enter opens a
// list), nav (false: it takes no keys), after(b, cx) (what follows a write
// of its: a scan), add (its own add, its list under the field `field`),
// blockAdd (its block's add: block), enter and remove ({ name, hint?,
// run(b, cx) }), move ({ can(by), run(b, by, cx), which gives write's {
// started, done }, and to(by), its row's id after the move where that is
// not its own }) }, and the keys of a choice (choiceParts: side { hint,
// step(b, by, cx) }, space, enter and field, its list's; a PR section takes
// its side alone) or of a row of switches (switchKnob: side { hint, count
// }, along which ← → move, space and enter, which turn the one they are
// on, and extra(t, b, marked), the switches under the value).

import { div } from "gpui-kit";
import { h_flex, InputState } from "gpui-base";
import { nameKeyAt } from "../../config.js";
import { ORIGIN, valueAt } from "../../settings.js";
import { choiceTrigger, listPopup, openList, steppedEntry } from "../choices.js";
import { fieldFrame, toggleSwitch, wireTextField } from "../helpers.js";

export const LATER = "folgt";
export const WHOLE = "eine Änderung schreibt die ganze Liste in die Datei dieses Rechners";
export const goneFromList = (name) => `„${name}“ steht nicht mehr so in der Liste; Esc verwirft die Änderung`;

export const settingsOf = (b) => b.settingsPage;

// ---- rows ----

export const title = (text, key = null) => ({ row: "title", title: text, key });
export const line = (text, tone = "muted", loading = false) => ({ row: "line", text, tone, loading });
export const knobRow = (knob) => ({ row: "knob", knob });

// A block of rows under its title, its add (where it has one) on each knob,
// then the rows `after` it, the last row marked as its end.
export function block(head, rows, add = null, after = []) {
  const all = [head, ...rows, ...(add ? [{ row: "add", add }] : []), ...after];
  for (const r of all) if (r.row === "knob") r.blockAdd = add;
  all.at(-1).end = true;
  return all;
}

// Marks the row `id` (a knob's or an add's), ← → on its switch `side`
// where given; another mark starts on its first switch, without the last
// change's problem.
export function markRow(b, id, side = null) {
  const state = settingsOf(b);
  if (state.marked !== id) Object.assign(state, { marked: id, side: 0, problem: null });
  if (side !== null) state.side = side;
}

// ---- values and where they come from ----

export const baseAt = (b, path) => valueAt(b.configState.base, path, nameKeyAt);
export const mergedAt = (b, path) => valueAt(b.configState.merged, path, nameKeyAt);

export const originOf = (b, knob) => (knob.origin !== undefined ? knob.origin : knob.path ? b.origin(knob.path) : "");

// What a knob set on this machine says of views.json's value (`base`, as
// shown; null for none) in place of its own words `own`.
export function machineWas(b, knob, base, own) {
  if (originOf(b, knob) !== ORIGIN.machine) return own;
  return base === null ? "views.json: keiner · u setzt auf den Standard zurück" : `views.json: ${base} · u setzt auf ${base} zurück`;
}

export const mono12 = (mono, text, color) => div().font_family(mono).text_size(12).text_color(color).child(text);
export const muted = (t, text) => div().text_color(t.muted).child(text);

// ---- writes ----

export const NOT_STARTED = { started: false, done: Promise.resolve(false) };

export function refuse(b, id, texts, cx) {
  const state = settingsOf(b);
  if (state) state.problem = { row: id, texts };
  cx.notify();
  return NOT_STARTED;
}

// Writes `changes` at once where views.json and this machine's file take
// them (`checked`: Board.settingsChecked's, strict). Where they would not
// apply, or the file cannot hold them (it is no JSON object, or holds a
// value or a list where they need an object), the row `id` says why; where
// the file is unread or does not apply, the banner does (changeSettings);
// either way nothing is written. after(b, cx) once the file has them. →
// changeSettings's { started, done }.
export function write(b, id, changes, cx, after = null, checked = b.settingsChecked(changes, true)) {
  if (checked.refused) return refuse(b, id, checked.refused, cx);
  const state = settingsOf(b);
  if (state) state.problem = null;
  const { started, done } = b.changeSettings(changes, cx, null, checked);
  if (after) {
    cx.spawn(async (cx) => {
      if (await done) after(b, cx);
    });
  }
  return { started, done };
}

// `list` with its entry at `at` moved `by` places (1 on, -1 back); null where
// that leaves the list.
export function movedIn(list, at, by) {
  const to = at + by;
  if (at < 0 || at >= list.length || to < 0 || to >= list.length) return null;
  const out = [...list];
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

export const withoutAt = (list, at) => list.filter((_, i) => i !== at);
export const replacedAt = (list, at, value) => list.map((v, i) => (i === at ? value : v));

// A list written whole, as views.json and this machine's file give it now:
// the change change(list) makes of it ({ changes }; null for none), where
// config.js takes the list as it stands (problems(value) names nothing; a
// list not there is empty), else { refused: config.js's words }.
export function wholeListChange(b, path, problems, change) {
  const value = mergedAt(b, path);
  const refused = problems(value);
  if (refused.length) return { refused };
  const next = change(value ?? []);
  return next ? { changes: [[path, next]] } : null;
}

export function writeWholeList(b, id, path, problems, change, cx, after = null) {
  const proposal = wholeListChange(b, path, problems, change);
  if (!proposal) return NOT_STARTED;
  return proposal.refused ? refuse(b, id, proposal.refused, cx) : write(b, id, proposal.changes, cx, after);
}

export function resetKnob(b, knob, cx) {
  if (b.origin(knob.path) !== ORIGIN.machine) return b.say(`„${knob.name}“ steht nicht in der Datei dieses Rechners`, "info", cx);
  write(b, knob.id, [[knob.path, undefined]], cx, knob.after ?? null);
}

// ---- edits ----

// A text typed for a number, as the number it stands for; any other text
// stays as typed, which config.js then names.
const typed = (text, number) => {
  const trimmed = text.trim();
  return number && trimmed !== "" && Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
};

// The edit of the knob `knob` in place (an add gives its id, and its name
// where its row can go), the dialog "setting", its fields [{ id, value,
// unit, width, placeholder }]: Enter saves what save(b, texts, cx) gives for
// the texts by field: { changes, after? } to write, { refused } to stay and
// say why (or to close, where its row is gone: dropRowDialog), { next(b, cx) } to
// go on to another edit, or null to stay; Esc drops it.
export function openEdit(b, knob, fields, save, cx) {
  const state = settingsOf(b);
  const m = { kind: "setting", topic: state.topic, row: knob.id, name: knob.name, field: fields[0].id, fields: fields.map((f) => f.id), inputs: {}, units: {}, widths: {}, error: null };
  for (const f of fields) {
    const input = InputState.new({ placeholder: f.placeholder ?? "" });
    input.set_value(f.value ?? "");
    wireTextField(b, m, input, f.id, (_e, cx) => submitEdit(b, m, save, cx));
    m.units[f.id] = f.unit ?? null;
    m.widths[f.id] = f.width ?? null;
  }
  b.modal = m;
  state.problem = null;
  b.takeKeyboard();
  cx.notify();
}

function dropRowDialog(b, m, cx, refusal = null) {
  const gone = `„${m.name}“ steht nicht mehr auf der Seite${m.kind === "setting" ? "; die Änderung ist verworfen" : ""}`;
  b.closeModal(cx);
  b.say(refusal ? `${refusal}; ${gone}` : gone, refusal ? "error" : "warning", cx);
}

// The page's dialog of a row (its edit, a choice's list, a PR tab's list of
// repos: the dialogs with a `row`) closes where its row has left the page,
// the banner saying so, after `refusal` (a refused write's words) where that
// took the row away.
export function dropGoneDialog(b, cx, refusal = null) {
  const m = b.modal;
  if (m?.row !== undefined && !b.settingsRowShown(m.row)) dropRowDialog(b, m, cx, refusal);
}

function submitEdit(b, m, save, cx) {
  if (b.modal !== m) return;
  const proposal = save(b, Object.fromEntries(m.fields.map((f) => [f, m.inputs[f].value()])), cx);
  if (proposal?.next) return proposal.next(b, cx);
  const checked = proposal?.changes ? b.settingsChecked(proposal.changes, true) : null;
  const refused = proposal?.refused ?? checked?.refused;
  if (refused && !b.settingsRowShown(m.row)) return dropRowDialog(b, m, cx);
  if (!checked || refused) {
    if (refused) m.error = refused;
    return cx.notify();
  }
  b.closeModal(cx);
  write(b, m.row, proposal.changes, cx, proposal.after ?? null, checked);
}

// Enter on `knob`: its value at `path` in a field.
export const textEdit = (knob, path, { value, number = false, unit = null, width = null, placeholder = null }) => ({
  name: "Ändern…",
  hint: "ändern",
  run: (b, cx) => openEdit(b, knob, [{ id: "value", value: value ?? "", unit, width, placeholder }], (_b, texts) => ({ changes: [[path, typed(texts.value, number)]], after: knob.after }), cx),
});

// ---- choices ----

// The list of a choice (choices.js) under the field `field` of the row of
// `knob` ({ id, name }), as the dialog "settingChoice", which a pick, Esc or
// a press beside the list closes.
export function openChoice(b, knob, field, spec, cx) {
  b.modal = { kind: "settingChoice", topic: settingsOf(b).topic, row: knob.id, name: knob.name, field, list: null };
  openList(b, { [field]: { anchor: "top_left", width: 300, none: "Nichts passt zum Filter", ...spec, closes: true } }, field, cx);
}

// A choice knob's keys over `entries()` ([{ id, name, aside }]): ← → take
// the next at once (take(b, row, cx)), space and Enter open their list.
export function choiceParts(knob, { field, entries, current, take, placeholder, loading = null, empty = null }) {
  const open = (b, cx) =>
    openChoice(b, knob, field, {
      entries: () => entries(), current: () => current(), value: () => "", take, placeholder,
      ...(loading && { loading }), ...(empty && { empty }),
    }, cx);
  return {
    side: {
      hint: "wählt",
      step: (b, by, cx) => {
        const next = steppedEntry(entries(), current(), by);
        if (next) take(b, next, cx);
      },
    },
    space: { name: "Liste öffnen", hint: "öffnet die Liste", run: open },
    enter: { name: "Liste öffnen", hint: "ändern", run: open },
    field,
  };
}

// A choice knob's field (choiceBox's look), its list under it while open; a
// click marks the knob and opens the list.
export function choiceField(b, t, knob, text, aside = null, width = 240) {
  const m = b.modal;
  const trigger = choiceTrigger(t, knob.field, text, aside, (cx) => {
    if (b.modal) return;
    markRow(b, knob.id);
    knob.space.run(b, cx);
  });
  const frame = fieldFrame(t, m?.kind === "settingChoice" ? m : {}, knob.field, trigger).w(width).flex_none();
  return listPopup(b, t, knob.field, "top_left", frame, m?.kind === "settingChoice");
}

// ---- switches ----

// Makes `knob` a row of switches, `items` [{ name, on }]: ← → move along
// them, space and Enter turn the one they are on (turn(b, item, cx)), a
// click marks the knob on one and turns it; `hint` names what a switch is,
// `name` the menu's entry.
export function switchKnob(knob, items, { hint, name }, turn) {
  const turnAt = (b, at, cx) => {
    if (!items[at]) return;
    markRow(b, knob.id, at);
    turn(b, items[at], cx);
  };
  knob.value ??= () => div();
  knob.side = { hint, count: items.length };
  knob.space = { name, hint: "ein/aus", run: (b, cx) => turnAt(b, settingsOf(b).side, cx) };
  knob.enter = knob.space;
  knob.extra = (t, b, marked) =>
    items.length
      ? h_flex().id(`${knob.id}-switches`).flex_wrap().gap(4).children(items.map((s, i) =>
        toggleSwitch(b, t, `${knob.id}-switch-${i}`, s.on, (cx) => turnAt(b, i, cx), marked && i === settingsOf(b).side).child(s.name)))
      : div();
  return knob;
}
