// The items related to an item, which the board reads when its details open
// (on GitHub an issue's parent, its sub-issues and the pull requests linked
// to it, on Azure a work item's parent, its children and linked pull
// requests; the same read brings the item's description beside them), what
// of them a view keeps (keptRelated), the lines the details panel walks when
// it has the keyboard, and the heads of their sections. The description as
// drawn is description.js's. The Board reads them (readRelated) and draws
// them (ui/related.js).
//
// Enter on a line shows its item's details in the panel, a level down (the
// Board's drillLine; Esc goes back up): the Board keeps the levels on the
// panel's keyboard (panelOf), reads each level's related items as it reads
// the selected item's, and names the way down at the panel's top
// (pathLabel).
//
// A source that has related items gives `related: { reads(item), load(item,
// view) }`: reads tells whether the item has any to read (no call); load
// reads them (view: the view the item shows in) into { description, format,
// parents, subIssues, prs, warnings, retry }. description is the item's own
// text as the source has it ("" for none), format how it is written:
// "markdown" (the default) or "html". Each of parents (the item's parent,
// one line at most), subIssues and prs is a section { count (how many the
// source has; null when it did not send the section), sent (how many it
// sent), cut (it has more than it sent), hidden (how many it has that cannot
// be read), hiddenAs (what the details say of those: "ohne Zugriff" where it
// is missing), error (why it sent none; null), lines (those that can be
// read) }; a line { source, kind, number, title, url, state (its label),
// draft, and on GitHub repo, repoShort, foreign (itemKey), color (its
// chip's theme color) and done (dimmed); on Azure type, its color and
// whether it is done coming from the view's states when drawn }. warnings:
// what the source said besides, one line each. retry: a part failed that is
// to be read again after the next refresh.
//
// A source whose pull requests the details panel can go down to gives
// `pullRequest: { reads(item), load(item, view) }` the same way: load
// reads the pull request's details as the PR list has a row's (title,
// state, color, done, draft, author, review, branch; on GitHub its checks
// and assignees too, and warnings: what GitHub said besides; on Azure
// azureRepo and azureProject, its repository's name and project), which
// the panel shows as the PR list's details do; the Board keeps them as {
// pr } beside the related items.

import { cardLabel, lineKey, relativeLabel } from "./shared.js";
import { fits, placeKey } from "./sessions.js";

// What a view keeps of its related items after a refresh starts: only
// those of the item whose details show (`openKey`, null when none) and of
// the levels the panel went down to from it (`deeper`, their keys), read
// or still being read, so that a refresh reads nothing for them; a failed
// read, or one with a part to read again (retry), is dropped, so that it
// is tried again; `r` reads them again too (the Board's reload).
export function keptRelated(related, openKey, deeper = []) {
  const keys = openKey === null ? [] : [openKey, ...deeper];
  return new Map(keys.flatMap((key) => {
    const entry = related.get(key);
    return entry && !entry.error && !entry.data?.retry ? [[key, entry]] : [];
  }));
}

// The way the panel went down from `root` (the board's selected item) to
// the items `levels`, as its top shows it: "tender#914 › #2217".
export const pathLabel = (root, levels) => [cardLabel(root), ...levels.map((i) => relativeLabel(root, i))].join(" › ");

// The sections of read related items, in the order of their lines: the
// parent first, then the sub-issues, then the linked pull requests.
export const RELATED_SECTIONS = ["parents", "subIssues", "prs"];

// The lines of read related items (`data`, or null while none are read).
export const relatedLines = (data) => (data ? RELATED_SECTIONS.flatMap((name) => data[name].lines) : []);

// The name of the section of `data` that holds `line` (one of its lines,
// as relatedLines gives them); null for none.
export const sectionOf = (data, line) => RELATED_SECTIONS.find((name) => data?.[name]?.lines.includes(line)) ?? null;

// Whether a section came whole, so that what it lacks is not there: no
// error, not cut short, none it could not read.
export const wholeSection = (section) => Boolean(section) && !section.error && !section.cut && !section.hidden;

// The line one step `dir` (+1 down, -1 up) from `line` (an index, or null
// for none) over `count` lines: down from none to the first, up from the
// first to none; the last stays the last.
export function stepLine(line, dir, count) {
  if (!count) return null;
  if (line === null) return dir > 0 ? 0 : null;
  const next = line + dir;
  return next < 0 ? null : Math.min(next, count - 1);
}

// The details panel's lines are { related (relatedLines), sessions
// (itemSessions) }, walked in that order. The panel keeps its selected line
// by what it is (lineId), not by where it stands: the lines move when the
// related items come, the sessions sort anew or the Claude sessions are
// read again. A session's place may name a tab or pane more or less while
// it stays (a pane's title comes to name the item, a Claude session's
// pane is found or lost): its line is then the one still at its place,
// else the one that holds the Claude session it held, else the one
// session whose place fits the one it had.
export const lineCount = (lines) => lines.related.length + lines.sessions.length;

export function lineAt(lines, n) {
  if (n === null) return null;
  if (n < lines.related.length) return { related: lines.related[n] };
  const session = lines.sessions[n - lines.related.length];
  return session ? { session } : null;
}

export const lineId = (line) =>
  line.session ? { session: placeKey(line.session), place: line.session.place, claudePid: line.session.claudePid } : { related: lineKey(line.related) };

export function lineIndex(lines, id) {
  if (!id) return null;
  if (id.session === undefined) {
    const i = lines.related.findIndex((l) => lineKey(l) === id.related);
    return i < 0 ? null : i;
  }
  const i = lines.sessions.findIndex((s) => placeKey(s) === id.session);
  if (i >= 0) return lines.related.length + i;
  const held = id.claudePid === null ? -1 : lines.sessions.findIndex((s) => s.claudePid === id.claudePid);
  if (held >= 0) return lines.related.length + held;
  const fitting = lines.sessions.flatMap((s, j) => (fits(s, id) ? [j] : []));
  return fitting.length === 1 ? lines.related.length + fitting[0] : null;
}

// The selected line `id` as it stands among `lines` now: a session's by its
// place there, or none where it went, so that Enter is the item's again;
// a related item's line keeps its id while it is gone, until a read brings
// it again.
export function lineNow(lines, id) {
  if (!id || id.session === undefined) return id;
  const at = lineIndex(lines, id);
  return at === null ? null : lineId(lineAt(lines, at));
}

// The line `id` names among `lines` ({ related } or { session }), or null
// where it is not among them.
export const pickedLine = (lines, id) => lineAt(lines, lineIndex(lines, id));

// " · erste <sent> von <count>" for a section with more than it sent.
const cutNote = (section) => (section.cut ? ` · erste ${section.sent} von ${section.count}` : "");

// The heads of the sections: the sub-issues' with how many of them are
// done, as the item says (its sub, the one count the board and the details
// share; none where the item has no sub-issues), the pull requests' with
// how many there are.
export const subIssuesHead = (item, section) => `UNTERAUFGABEN${item.sub ? ` · ${item.sub.done}/${item.sub.total}` : ""}${cutNote(section)}`;
export const prsHead = (section) => `VERKNÜPFTE PRS${section.count === null ? "" : ` · ${section.count}`}${cutNote(section)}`;
