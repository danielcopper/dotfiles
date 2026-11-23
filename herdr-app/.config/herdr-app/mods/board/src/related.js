// The items related to an item, which the board reads when its details
// open (on GitHub an issue's sub-issues and the pull requests linked to it,
// on Azure a work item's children and linked pull requests; the same read
// brings the item's description beside them), what of them a view keeps
// (keptRelated), the lines the details panel walks when it has the
// keyboard, and the heads of their sections. The description as drawn is
// description.js's.
// The Board reads them (readRelated) and draws them (ui/related.js).
//
// A source that has related items gives `related: { reads(item), load(item,
// view) }`: reads tells whether the item has any to read (no call); load
// reads them (view: the view the item shows in) into { description,
// format, subIssues, prs, warnings, retry }. description is the item's own
// text as the source has it ("" for none), format how it is written:
// "markdown" (the default) or "html". Each of subIssues and prs is a
// section { count (how many the source has; null when it did not send the
// section), sent (how many it sent), cut (it has more than it sent), hidden
// (how many it has that cannot be read), hiddenAs (what the details say of
// those: "ohne Zugriff" where it is missing), error (why it sent none;
// null), lines (those that can be read) }; a line { source, kind, number,
// title, url, state (its label), draft, and on GitHub repo, repoShort,
// color (its chip's theme color) and done (dimmed); on Azure type, its
// color and whether it is done coming from the view's states when drawn }.
// warnings: what the source said besides, one line each. retry: a part
// failed that is to be read again after the next refresh.

// What a view keeps of its related items after a refresh starts: only
// those of the item whose details show (`openKey`, null when none), read
// or still being read, so that a refresh reads nothing for them; a failed
// read, or one with a part to read again (retry), is dropped, so that it
// is tried again; `r` reads them again too (the Board's reload).
export function keptRelated(related, openKey) {
  const entry = openKey === null ? undefined : related.get(openKey);
  return new Map(entry && !entry.error && !entry.data?.retry ? [[openKey, entry]] : []);
}

// The lines of read related items (`data`, or null while none are read),
// the sub-issues first, then the linked pull requests.
export const relatedLines = (data) => (data ? [...data.subIssues.lines, ...data.prs.lines] : []);

// The line one step `dir` (+1 down, -1 up) from `line` (an index, or null
// for none) over `count` lines: down from none to the first, up from the
// first to none; the last stays the last.
export function stepLine(line, dir, count) {
  if (!count) return null;
  if (line === null) return dir > 0 ? 0 : null;
  const next = line + dir;
  return next < 0 ? null : Math.min(next, count - 1);
}

// " · erste <sent> von <count>" for a section with more than it sent.
const cutNote = (section) => (section.cut ? ` · erste ${section.sent} von ${section.count}` : "");

// The heads of the sections: the sub-issues' with how many of them are
// done, as the item says (its sub, the one count the board and the details
// share; none where the item has no sub-issues), the pull requests' with
// how many there are.
export const subIssuesHead = (item, section) => `UNTERAUFGABEN${item.sub ? ` · ${item.sub.done}/${item.sub.total}` : ""}${cutNote(section)}`;
export const prsHead = (section) => `VERKNÜPFTE PRS${section.count === null ? "" : ` · ${section.count}`}${cutNote(section)}`;
