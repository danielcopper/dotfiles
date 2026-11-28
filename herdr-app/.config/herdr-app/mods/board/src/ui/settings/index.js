// The settings page (README, "herdr app"), in place of the board while
// b.settingsPage is { topic (the shown topic's id), marked (the id of the
// marked row, a knob's or an add's; null for the first), at (its place among
// the rows that take keys, as last found: the mark stays there where its
// row is gone), side (the switch ← → are on), problem ({ row, texts }: why
// the last change of that row was not made), scan ({ state, folders, found,
// error }: the repo folders as read), agents ({ state, list, error }: this
// machine's installed agents), owners (by owner: its repos, those its
// Issues tab reads or all but the archived ones, { state, org, repos, error
// }: readOwner), knobMoves (the last J/K's series: moveKnob) }. A topic's
// rows: its module here, from knobs.js's pieces; drawn: draw.js; its
// actions: commands.js. What it reads, it reads once while it shows, what a
// change of the config adds as that comes (followSettingsPage), never in a
// render: Calls in the header of main.js.

import { azureRows } from "./azure.js";
import { generalNote, generalRows } from "./general.js";
import { githubRows, readGithubTopic } from "./github.js";
import { dropGoneDialog, markRow, settingsOf } from "./knobs.js";
import { reposNote, reposRows, scanFolders } from "./repos.js";
import { readAgents, startNote, startRows } from "./start.js";

// What the hint line and the menu call a topic.
export const TOPIC_WORD = "Kategorie";

// The page's topics, in the order of its left side and its digits.
export function settingsTopics(b) {
  return [
    ...b.contexts().map((context) => ({ id: `context:${context.id}`, kind: "context", name: context.name, note: context.tabs.map((t) => t.name).join(" · "), context })),
    { id: "repos", kind: "repos", name: "Repos auf diesem Rechner", note: reposNote(b) },
    { id: "start", kind: "start", name: "Start", note: startNote(b) },
    { id: "general", kind: "general", name: "Allgemein", note: generalNote(b) },
  ];
}

export const shownTopic = (b) => settingsTopics(b).find((t) => t.id === settingsOf(b).topic) ?? settingsTopics(b).at(-1);

const TOPIC_ROWS = { general: generalRows, start: startRows, repos: reposRows, github: githubRows, azure: azureRows };

export const topicRows = (b, topic) => TOPIC_ROWS[topic.kind === "context" ? topic.context.source : topic.kind](b, topic);

export const navRows = (rows) => rows.filter((r) => (r.row === "knob" && r.knob.nav !== false) || (r.row === "add" && r.add.run));

const settingsRowId = (r) => (r.row === "knob" ? r.knob.id : r.add.id);

export const rowShown = (b, id) => topicRows(b, shownTopic(b)).some((r) => (r.row === "knob" || r.row === "add") && settingsRowId(r) === id);

// The marked row among `nav` (null in none), its place kept.
export function markedIn(b, nav) {
  const state = settingsOf(b);
  const found = nav.findIndex((r) => settingsRowId(r) === state.marked);
  const at = found >= 0 ? found : Math.max(0, Math.min(state.at, nav.length - 1));
  const row = nav[at] ?? null;
  if (row) Object.assign(state, { marked: settingsRowId(row), at });
  return row;
}

// The page's part of the situation (Board.situation): its state, its
// topic, the marked row's knob (an add's: Enter adds) and the add it
// reaches (its own, its block's, or the marked add itself).
export function settingsSituation(b) {
  const state = settingsOf(b);
  if (!state) return { settingsPage: null, topic: null, knob: null, add: null };
  const topic = shownTopic(b);
  const row = markedIn(b, navRows(topicRows(b, topic)));
  const knob = row?.row === "knob" ? row.knob : row ? { id: row.add.id, name: row.add.text, enter: { name: row.add.text, hint: "hinzufügen", run: row.add.run } } : null;
  const add = row?.row === "add" ? row.add : row?.knob.add ?? row?.blockAdd ?? null;
  return { settingsPage: state, topic, knob, add: add?.run ? add : null };
}

function readFor(b, topic, cx) {
  const state = settingsOf(b);
  if (topic.kind === "start" && !state.agents) readAgents(b, cx);
  if (topic.kind === "context" && topic.context.source === "github") readGithubTopic(b, topic.context, cx);
}

// After the config changed while the page shows: a dialog whose row is gone
// closes (dropGoneDialog, `refusal` as there) unless `keepDialogs` (a change
// still to come says whether it is), and the shown topic reads what it has
// not read yet of what it shows now.
export function followSettingsPage(b, cx, { refusal = null, keepDialogs = false } = {}) {
  if (!settingsOf(b)) return;
  if (!keepDialogs) dropGoneDialog(b, cx, refusal);
  readFor(b, shownTopic(b), cx);
}

// e: the page on the shown context, the repo folders read for the left
// side's note, and each owner's repos but the archived ones
// (OWNER_REPOS_QUERY) read again where it shows them.
export function openSettingsPage(b, cx) {
  const context = b.context();
  b.settingsPage = { topic: null, marked: null, at: 0, side: 0, problem: null, scan: null, agents: null, owners: new Map(), knobMoves: null };
  scanFolders(b, cx);
  showSettingsTopic(b, context ? `context:${context.id}` : "general", cx);
}

export function showSettingsTopic(b, id, cx) {
  Object.assign(settingsOf(b), { topic: id, marked: null, at: 0, side: 0, problem: null });
  readFor(b, shownTopic(b), cx);
  b.settingsScroll.scroll_to_item(0);
  b.takeKeyboard();
  cx.notify();
}

export function leaveSettingsPage(b, cx) {
  b.settingsPage = null;
  b.takeKeyboard();
  cx.notify();
}

export function markKnob(b, id, cx) {
  markRow(b, id);
  cx.notify();
}

export function walkKnobs(b, by) {
  const rows = topicRows(b, shownTopic(b));
  const nav = navRows(rows);
  if (!markedIn(b, nav)) return;
  const at = Math.max(0, Math.min(settingsOf(b).at + by, nav.length - 1));
  markRow(b, settingsRowId(nav[at]));
  settingsOf(b).at = at;
  b.settingsScroll.scroll_to_item(rows.indexOf(nav[at]));
}

export function sideKey(b, knob, by, cx) {
  const side = knob?.side;
  const state = settingsOf(b);
  if (side?.step) side.step(b, by, cx);
  else if (side?.count) state.side = (state.side + by + side.count) % side.count;
}

// J/K: the marked knob one place on or back in its list, the mark with it
// at once where the write started. Moves of one entry one after the other,
// each from where the last put the mark, are a series (knobMoves); where the
// file does not take one and the mark is still where it put it, the mark
// goes back to the row of the entry as the file holds it.
export function moveKnob(b, knob, by, cx) {
  if (!knob.move.can(by)) return;
  const { started, done } = knob.move.run(b, by, cx);
  if (!started) return;
  const state = settingsOf(b);
  const to = knob.move.to?.(by) ?? knob.id;
  const series = state.knobMoves?.to === knob.id && state.knobMoves.pending ? state.knobMoves : { at: knob.id, pending: 0 };
  Object.assign(series, { to, pending: series.pending + 1 });
  state.knobMoves = series;
  markRow(b, to);
  cx.spawn(async (cx) => {
    const moved = await done;
    series.pending -= 1;
    if (moved) series.at = to;
    if (moved || settingsOf(b) !== state || state.marked !== to) return;
    markRow(b, series.at);
    cx.notify();
  });
}
