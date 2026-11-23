// The items related to an item, which the board reads when its details
// open (on GitHub an issue's sub-issues and the pull requests linked to it,
// on Azure a work item's children and linked pull requests; the same read
// brings the item's description beside them), what of them a view keeps
// (keptRelated), the lines the details panel walks when it has the
// keyboard, the description as drawn (shownDescription), and the heads of
// their sections.
// The Board reads them (readRelated) and draws them (ui/related.js).
//
// A source that has related items gives `related: { reads(item), load(item,
// view, data) }`: reads tells whether the item has any to read (no call);
// load reads them (view: the view the item shows in; data: that view's
// data, null before any) into { description, format, subIssues, prs,
// warnings }. description is the item's own text as the source has it (""
// for none), format how it is written: "markdown" (the default) or "html";
// it is drawn formatted, without its images (shownDescription). Each of
// subIssues and prs is a
// section { count (how many the source has; null when it did not send the
// section), sent
// (how many it sent), cut (it has more than it sent), hidden (how many it
// sent that cannot be read), error (why it sent none; null), lines (those
// it sent that can be read) }; a line { source, kind, repo, repoShort,
// number, title, url, state (its label), color (its chip's theme color),
// done (dimmed), draft }. warnings: what the source said besides, one line
// each.

// What a view keeps of its related items after a refresh starts: only
// those of the item whose details show (`openKey`, null when none), read
// or still being read, so that a refresh reads nothing for them; a failed
// read is dropped, so that it is tried again; `r` reads them again too
// (the Board's reload).
export function keptRelated(related, openKey) {
  const entry = openKey === null ? undefined : related.get(openKey);
  return new Map(entry && !entry.error ? [[openKey, entry]] : []);
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

// An image of a description as a link to it, "Bild: <alt>" ("Bild" without
// one), so that nothing loads it: herdr's TextView loads every http(s) image
// a text names with the mod's network grant, which herdr gives every mod in
// full (herdr's src/mods.rs, capabilities; gpui-kit's
// crates/shell/src/materialize/text_view.rs), and a description is text
// anyone with access may write. What TextView draws as an image (gpui-kit's
// crates/base/src/text/format): Markdown's image, and an HTML <img> with a
// src, in HTML and as raw HTML in Markdown; HTML's parser reads <image> as
// <img>. So every <img> and <image> tag becomes a link (its src and alt read
// whatever their case and quoting; without a src, its text alone), and in
// Markdown every `![` becomes `[Bild: ` (`![]` `[Bild]`), which turns an
// image, inline or by reference, into a link. Text in code blocks is changed
// the same way.
const IMAGE_TAG = /<(?:img|image)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE = /(?:^|[\s/])([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
const htmlText = (text) => text.replace(/&(?![a-z]+;|#\d+;|#x[0-9a-f]+;)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function imageLink(tag) {
  const attrs = {};
  const body = tag.replace(/^<[a-z]+/i, "").replace(/\/?>$/, "");
  for (const m of body.matchAll(ATTRIBUTE)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  const label = htmlText(attrs.alt ? `Bild: ${attrs.alt}` : "Bild");
  return attrs.src ? `<a href="${htmlText(attrs.src.trim())}">${label}</a>` : label;
}

// A description as the details draw it (format: "markdown" or "html"): its
// images as links (above); null where it has no text.
export function shownDescription(text, format) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  const tags = raw.replace(IMAGE_TAG, imageLink);
  return format === "html" ? tags : tags.replace(/!\[\]/g, "[Bild]").replace(/!\[/g, "[Bild: ");
}

// " · erste <sent> von <count>" for a section with more than it sent.
const cutNote = (section) => (section.cut ? ` · erste ${section.sent} von ${section.count}` : "");

// The heads of the sections: the sub-issues' with how many of them are
// done, as the item says (its sub, the one count the board and the details
// share; none where the item has no sub-issues), the pull requests' with
// how many there are.
export const subIssuesHead = (item, section) => `UNTERAUFGABEN${item.sub ? ` · ${item.sub.done}/${item.sub.total}` : ""}${cutNote(section)}`;
export const prsHead = (section) => `VERKNÜPFTE PRS${section.count === null ? "" : ` · ${section.count}`}${cutNote(section)}`;
