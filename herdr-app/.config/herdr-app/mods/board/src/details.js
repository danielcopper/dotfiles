// The details the board reads for an item when they open (on GitHub an
// issue's sub-issues and the pull requests linked to it; the source says
// which items have any: its details.reads): kept per view and item until the
// view's next refresh, and the lines of them the detail panel walks when it
// has the keyboard. The Board reads them (readDetails) and draws them
// (ui/details.js).

// The key the read details of an item are kept under in its view's state.
export const detailsKey = (item) => `${item.source}\n${item.repo}\n${item.number}`;

// What is kept of a view's details after a refresh starts: only those of
// the item whose details show (`openKey`, null when none), so that a refresh
// reads nothing for them (`r` reads them again: the Board's reload).
export function keptDetails(details, openKey) {
  const entry = openKey === null ? undefined : details.get(openKey);
  return new Map(entry ? [[openKey, entry]] : []);
}

// The lines of read details (`data`, or null while none are read), the
// sub-issues first, then the linked pull requests.
export const detailLines = (data) => (data ? [...data.subIssues.lines, ...data.prs.lines] : []);

// The line one step `dir` (+1 down, -1 up) from `line` (an index, or null
// for none) over `count` lines: down from none to the first, up from the
// first to none; the last stays the last.
export function stepLine(line, dir, count) {
  if (!count) return null;
  if (line === null) return dir > 0 ? 0 : null;
  const next = line + dir;
  return next < 0 ? null : Math.min(next, count - 1);
}

// The item of a line among the columns that show (as navigate takes them),
// as a selection { col, key }, or null when none of them holds it: the same
// source, kind, repo and number.
export function placeOf(columns, line) {
  for (const [col, c] of columns.entries()) {
    const item = c.shown.find((i) => i.source === line.source && i.kind === line.kind && i.repo === line.repo && i.number === line.number);
    if (item) return { col, key: item.key };
  }
  return null;
}

// A line's state as the details show it.
const STATE_LABELS = { open: "offen", closed: "geschlossen", merged: "gemerged" };
export const lineState = (line) => STATE_LABELS[line.state] ?? line.state;

// The head of the sub-issues' section: "UNTERAUFGABEN · <completed>/<total>",
// and " · erste <sent> von <all>" where GitHub has more than it sent.
export function subIssuesHead(subIssues) {
  const cut = subIssues.count > subIssues.lines.length ? ` · erste ${subIssues.lines.length} von ${subIssues.count}` : "";
  return `UNTERAUFGABEN · ${subIssues.completed}/${subIssues.total}${cut}`;
}
