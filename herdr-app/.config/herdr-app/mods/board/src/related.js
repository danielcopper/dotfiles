// The items related to an item, which the board reads when its details
// open (on GitHub an issue's description, its sub-issues and the pull
// requests linked to it), what of them a view keeps (keptRelated), the
// lines the details panel walks when it has the keyboard, the lines of the
// description, and the heads of their sections.
// The Board reads them (readRelated) and draws them (ui/related.js).
//
// A source that has related items gives `related: { reads(item), load(item)
// }`: reads tells whether the item has any to read (no call); load reads
// them, one call, into { description, subIssues, prs, warnings }.
// description is the item's own text as the source has it ("" for none;
// shown as written: descriptionLines). Each of subIssues and prs is a
// section { count (how many the source has; null when it sent none), sent
// (how many it sent), cut (it has more than it sent), hidden (how many it
// sent that cannot be read), error (why it sent none; null), lines (those
// it sent that can be read) }; a line { source, kind, repo, repoShort,
// number, title, url, state (its label), color (its chip's theme color),
// done (dimmed), draft }. warnings: what the source said besides, one line
// each.

// What a view keeps of its related items after a refresh starts: only
// those read without failure of the item whose details show (`openKey`,
// null when none), so that a refresh reads nothing for them, while a failed
// read is tried again; `r` reads them again too (the Board's reload).
export function keptRelated(related, openKey) {
  const entry = openKey === null ? undefined : related.get(openKey);
  return new Map(entry?.data ? [[openKey, entry]] : []);
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

// A description as the details show it, one entry per line: line breaks
// kept (any of \r\n, \r, \n), trailing blanks cut, a run of empty lines
// as one "", none at the start or end; [] for an empty one. Markdown stays
// as written.
export function descriptionLines(text) {
  const lines = String(text ?? "").split(/\r\n|\r|\n/).map((l) => l.trimEnd());
  const out = [];
  for (const line of lines) if (line || (out.length && out.at(-1))) out.push(line);
  while (out.length && !out.at(-1)) out.pop();
  return out;
}

// " · erste <sent> von <count>" for a section with more than it sent.
const cutNote = (section) => (section.cut ? ` · erste ${section.sent} von ${section.count}` : "");

// The heads of the sections: the sub-issues' with how many of them are
// done, as the item says (its sub, the one count the board and the details
// share; none where the item has no sub-issues), the pull requests' with
// how many there are.
export const subIssuesHead = (item, section) => `UNTERAUFGABEN${item.sub ? ` · ${item.sub.done}/${item.sub.total}` : ""}${cutNote(section)}`;
export const prsHead = (section) => `VERKNÜPFTE PRS${section.count === null ? "" : ` · ${section.count}`}${cutNote(section)}`;
