// An item's description as the details hand it to herdr's TextView
// (shownDescription): Markdown or HTML that can load nothing.
//
// Why: TextView loads every http(s) image of its text with the mod's network
// grant, which herdr gives every mod in full (herdr's src/mods.rs,
// capabilities; gpui-kit's crates/shell/src/materialize/text_view.rs), and
// a description is text anyone with access to the item may write. What
// TextView draws as an image (gpui-kit's crates/base/src/text/format): an
// HTML <img> with a src (html.rs), which HTML's parser also reads <image>
// as, in HTML and as raw HTML in Markdown (markdown.rs, Node::Html); and
// Markdown's inline image `![alt](url)` (markdown.rs, Node::Image).
// Markdown's images by reference (`![alt][ref]`, `![alt][]`, `![ref]`,
// Node::ImageReference) it draws as nothing today. Before parsing HTML it
// writes the text through html5minify (html.rs, cleanup_html), which
// writes the text of <pre> and <textarea> and the content of <script> and
// <style> decoded, as it stands (html5minify/mod.rs, preserve_whitespace
// and contains_code): an entity-spelt `&lt;img …&gt;` in them comes out as
// a tag, which the second parse builds into an image. So a list of what may
// stay, not of what must go; HTML comments go, as they do on GitHub and
// Azure:
//
// - HTML keeps only the plain formatting tags of KEPT, each written anew
//   without attributes but an `a`'s http(s) href; none of them is one whose
//   text html5minify writes as it stands, nor one HTML's parser reads as raw
//   text. A <pre> becomes <p><code> (its text then wraps as any other). An
//   <img> or <image> becomes a link "Bild: <alt>" to its http(s) src, or
//   that text alone. Any other tag is dropped and its text kept, as text
//   of the element around it (the content of a <script>, <style> or
//   <textarea> too, which so never stands in one); any other `<` (none of a
//   tag, or a tag left open or longer than MAX_TAG) is written `&lt;`.
// - Markdown keeps no HTML. A comment outside code (codeRanges) goes as
//   CommonMark reads it: one that starts a line (at most 3 spaces in) is an
//   HTML block to its `-->`, across blank lines; one anywhere else goes
//   only where it crosses no blank line; one not closed stays. Every other
//   `<` but that of an http(s) URL in `<…>` gets a zero-width space after
//   it, which no HTML tag starts with, so Markdown reads it as text, and in
//   code it looks unchanged. An http(s) URL in `<…>` stays, as an autolink
//   or a link's or definition's destination (`<https://…>`,
//   `[x](<https://…>)`, `[r]: <https://…>`): HTML has no tag of that name,
//   so it can only be a link, or text. It is written as the WHATWG parser
//   reads it (webUrl), and its `\`, `!`, `[`, `]`, `(`, `)` and backtick
//   are encoded in path, query and fragment (keptUrl), so no link, image or
//   code span can start in it however the span is read; its host stays as
//   it is (an IPv6 one keeps its brackets). An inline image becomes a
//   Markdown link
//   "Bild: <alt>" to its http(s) URL (its text alone for another URL), and
//   an <img> or <image> tag the same; a `![` that starts no inline image
//   the scanner reads (an image by reference, or one longer than
//   MAX_IMAGE) becomes `[Bild: ` (`![]` `[Bild`), so that
//   `![alt][ref]` is a link where `ref` is defined, and `![alt][]` and
//   `![ref]` text. A label's `[`, `]`, `\` and `!` are escaped. Last, every
//   `![` left (a `!` before one of those links, or two pieces of the text
//   that meet) becomes `!`, a zero-width space and `[`: none is left. Text
//   in code changes the same way as any other.
//
// Each step looks at the text once. A tag looks at most MAX_TAG characters
// ahead, an image MAX_IMAGE, a URL in `<…>` up to the next `<`; a
// comment's end is one search, and whether a blank line lies within it one
// binary search (blankWithin); so a long hostile text costs little, and
// the board makes it once per read (the Board's readRelated).

const KEPT = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "del", "strike", "mark", "code", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr", "div", "span", "sub", "sup",
]);
const IMAGES = new Set(["img", "image"]);
export const MAX_TAG = 2048;
export const MAX_IMAGE = 1024;
// How deep the brackets of an image's alt and the parentheses of its
// destination may nest (the latter markdown-rs's limit,
// RESOURCE_DESTINATION_BALANCE_MAX in its util/constant.rs).
const MAX_PARENS = 32;
const ZWSP = "\u200b";
const ATTRIBUTE = /(?:^|[\s/])([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
const TAG_START = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)/y;
const WEB_LINK = /<(https?:\/\/[^<>\n\r]*)>/iy;
const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

// A text with its entities read (&amp; &lt; &gt; &quot; &apos;, &#n;,
// &#xn;); any other stays as written.
function decoded(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()];
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

// A text as HTML writes it, as text or in a quoted attribute.
const htmlText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// An http(s) URL as the WHATWG URL parser writes it (which percent-encodes
// spaces, `<` and `>`, and `"` in its path and query; one may stay in a
// host, which htmlText escapes), or null for anything else.
export function webUrl(text) {
  try {
    const url = new URL(String(text).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// The tag starting at `at` (its `<`): { close, name (in lower case), body
// (what stands between the name and the `>`), end (after the `>`) }, or
// null where none starts there or it does not end within MAX_TAG. `nextGt`
// gives the next `>` from a position (tagReader).
function readTag(text, at, nextGt) {
  TAG_START.lastIndex = at;
  const m = TAG_START.exec(text);
  if (!m) return null;
  const from = at + m[0].length;
  if (from < text.length && !/[\s/>]/.test(text[from])) return null;
  const end = nextGt(from);
  if (end < 0 || end - at > MAX_TAG) return null;
  return { close: m[1] === "/", name: m[2].toLowerCase(), body: text.slice(from, end), end: end + 1 };
}

// The next `what` at or after a position, for positions that only grow:
// each search starts where the last one ended, so all of them read the text
// once; -1 for none.
function finder(text, what) {
  let found = -2;
  return (p) => {
    if (found === -1) return -1;
    if (found < p) found = text.indexOf(what, p);
    return found;
  };
}

// The tag at a position (readTag), and the end of the comment starting
// there (after its `-->`, which may follow its `<!` at once: `<!-->`), or
// -1 where none starts there or it is not closed.
function tagReader(text) {
  const nextGt = finder(text, ">");
  return (at) => readTag(text, at, nextGt);
}
function commentReader(text) {
  const nextEnd = finder(text, "-->");
  return (at) => {
    if (!text.startsWith("<!--", at)) return -1;
    const end = nextEnd(at + 2);
    return end < 0 ? -1 : end + 3;
  };
}

// A tag's attributes by name, in lower case, each its first value, read.
function attributesOf(body) {
  const attrs = {};
  for (const m of body.matchAll(ATTRIBUTE)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decoded(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

// An image's label: "Bild: <alt>", "Bild" without one.
const imageLabel = (alt) => {
  const text = String(alt ?? "").replace(/\s+/g, " ").trim();
  return text ? `Bild: ${text}` : "Bild";
};

// The tag `tag` as the HTML keeps it (see the header).
function htmlTag(tag) {
  if (tag.name === "pre") return tag.close ? "</code></p>" : "<p><code>";
  if (IMAGES.has(tag.name)) {
    if (tag.close) return "";
    const attrs = attributesOf(tag.body);
    const url = webUrl(attrs.src ?? "");
    const label = htmlText(imageLabel(attrs.alt));
    return url ? `<a href="${htmlText(url)}">${label}</a>` : label;
  }
  if (tag.close) return `</${tag.name}>`;
  if (tag.name !== "a") return `<${tag.name}>`;
  const url = webUrl(attributesOf(tag.body).href ?? "");
  return url ? `<a href="${htmlText(url)}">` : "<a>";
}

// HTML as the details hand it on (see the header).
function keptHtml(text) {
  const tagAt = tagReader(text);
  const commentEnd = commentReader(text);
  const out = [];
  let from = 0;
  for (let at = text.indexOf("<"); at >= 0; at = text.indexOf("<", from)) {
    out.push(text.slice(from, at));
    const end = commentEnd(at);
    const tag = end < 0 ? tagAt(at) : null;
    if (end >= 0) from = end;
    else if (tag) {
      if (KEPT.has(tag.name) || IMAGES.has(tag.name) || tag.name === "pre") out.push(htmlTag(tag));
      from = tag.end;
    } else {
      out.push("&lt;");
      from = at + 1;
    }
  }
  out.push(text.slice(from));
  return out.join("");
}

// A text as Markdown shows it in a link's label: its `\`, `[`, `]` and `!`
// escaped, each `<` followed by a zero-width space.
const markdownLabel = (text) => text.replace(/[\\[\]!]/g, "\\$&").replace(/</g, `<${ZWSP}`);

// An http(s) URL as the Markdown keeps it in `<…>` (see the header): as
// the WHATWG parser writes it (webUrl), a `\` left in it, which there would
// escape the next character, and each character that could start Markdown
// (`!`, `[`, `]`, `(`, `)`, backtick) percent-encoded outside its host;
// null for no http(s) URL.
const URL_ESCAPES = { "\\": "%5C", "!": "%21", "[": "%5B", "]": "%5D", "(": "%28", ")": "%29", "`": "%60" };
const urlText = (text) => text.replace(/[\\![\]()`]/g, (c) => URL_ESCAPES[c]);
export function keptUrl(text) {
  const href = webUrl(text);
  if (!href) return null;
  const url = new URL(href);
  const user = url.username ? `${url.username}${url.password ? `:${url.password}` : ""}@` : "";
  const head = `${url.protocol}//${user}${url.host}`;
  return `${url.protocol}//${urlText(user)}${url.host}${urlText(href.slice(head.length))}`;
}

// An image as a Markdown link (see the header).
function markdownImage(alt, src) {
  const url = keptUrl(src);
  const label = markdownLabel(imageLabel(alt));
  return url ? `[${label}](<${url}>)` : label;
}

// The inline image `![alt](destination "title")` starting at `at`, read as
// CommonMark does, within MAX_IMAGE characters, without a blank line and
// nested at most MAX_PARENS deep: { alt, src, end } or null.
function inlineImage(text, at) {
  const limit = Math.min(text.length, at + MAX_IMAGE);
  let i = at + 2;
  let depth = 0;
  for (; i < limit; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "[" && ++depth > MAX_PARENS) return null;
    else if (c === "]" && depth-- === 0) break;
    else if (c === "\n" && text[i + 1] === "\n") return null;
  }
  if (i >= limit || text[i + 1] !== "(") return null;
  const alt = text.slice(at + 2, i);
  i += 2;
  const skip = () => {
    while (i < limit && (text[i] === " " || text[i] === "\t" || text[i] === "\n")) i++;
  };
  skip();
  let src = "";
  if (text[i] === "<") {
    const start = ++i;
    while (i < limit && text[i] !== ">" && text[i] !== "\n") i += text[i] === "\\" ? 2 : 1;
    if (text[i] !== ">") return null;
    src = text.slice(start, i++);
  } else {
    // Up to a space or control character, its parentheses balanced.
    const start = i;
    let parens = 0;
    for (; i < limit && text.charCodeAt(i) > 32; i++) {
      if (text[i] === "\\") i++;
      else if (text[i] === "(" && ++parens > MAX_PARENS) return null;
      else if (text[i] === ")" && parens-- === 0) break;
    }
    src = text.slice(start, i);
  }
  skip();
  const close = { "\"": "\"", "'": "'", "(": ")" }[text[i]];
  if (close) {
    for (i++; i < limit && text[i] !== close; i++) if (text[i] === "\\") i++;
    if (i >= limit) return null;
    i++;
    skip();
  }
  if (i >= limit || text[i] !== ")") return null;
  return { alt: decoded(alt.replace(/\\(.)/g, "$1")), src: decoded(src.replace(/\\(.)/g, "$1")), end: i + 1 };
}

// The http(s) URL in `<…>` at `at`, written as the Markdown keeps it (see
// the header): { text, end } or null, also where the parser takes it for no
// URL. The search stops at the next `<`, so no two of them read the same
// text.
function webLink(text, at) {
  WEB_LINK.lastIndex = at;
  const m = WEB_LINK.exec(text);
  const url = m ? keptUrl(m[1]) : null;
  return url ? { text: `<${url}>`, end: at + m[0].length } : null;
}

// The blank lines of a text: for each, where its line break before stands
// and where the one after it ends, in order (both grow together).
function blankLines(text) {
  const starts = [];
  const ends = [];
  for (let p = text.indexOf("\n"); p >= 0;) {
    const next = text.indexOf("\n", p + 1);
    if (next < 0) break;
    if (/^[ \t]*\r?$/.test(text.slice(p + 1, next))) {
      starts.push(p);
      ends.push(next + 1);
    }
    p = next;
  }
  return { starts, ends };
}

// Whether a blank line lies wholly within [from, to): the first one that
// starts at or after `from` ends first, so it alone needs a look.
function blankWithin(blanks, from, to) {
  let lo = 0;
  let hi = blanks.starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (blanks.starts[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  return lo < blanks.starts.length && blanks.ends[lo] <= to;
}

// Where Markdown has code, as [start, end) spans in order: fenced blocks
// (``` or ~~~ at most 3 spaces in, to their closing fence or the end),
// indented blocks (lines 4 spaces or a tab in, where no paragraph goes on)
// and code spans (a run of backticks to the next run
// of the same length within its paragraph, not after a backslash). It
// reads code as CommonMark does in the plain cases; where it misses some,
// a comment in it goes as one outside code would, and where it takes too
// much, a comment stays as text: neither loads anything.
export function codeRanges(text) {
  const ranges = [];
  let pos = 0;
  let fence = null;
  let para = null;
  const endPara = (end) => {
    if (para !== null) codeSpans(text, para, end, ranges);
    para = null;
  };
  for (const line of text.split("\n")) {
    const start = pos;
    const end = pos + line.length;
    pos = end + 1;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line);
      if (close && close[1][0] === fence.mark && close[1].length >= fence.size) {
        ranges.push([fence.start, end]);
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      endPara(start);
      fence = { mark: open[1][0], size: open[1].length, start };
    } else if (/^[ \t]*\r?$/.test(line)) endPara(start);
    else if (para === null && /^( {4}|\t)/.test(line)) ranges.push([start, end]);
    else if (para === null) para = start;
  }
  if (fence) ranges.push([fence.start, text.length]);
  endPara(text.length);
  return ranges;
}

// The code spans of the paragraph text [from, to), into `ranges`: each run
// of backticks not after a backslash, to the next run of its length; the
// runs between are inside it. Each length's runs are walked once.
function codeSpans(text, from, to, ranges) {
  const runs = [];
  for (let i = from; i < to;) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let j = i;
    while (j < to && text[j] === "`") j++;
    runs.push({ at: i, size: j - i, opens: text[i - 1] !== "\\" });
    i = j;
  }
  const bySize = new Map();
  runs.forEach((r, k) => (bySize.get(r.size) ?? bySize.set(r.size, []).get(r.size)).push(k));
  const next = new Map();
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    if (!r.opens) continue;
    const same = bySize.get(r.size);
    let p = next.get(r.size) ?? 0;
    while (p < same.length && same[p] <= k) p++;
    next.set(r.size, p);
    if (p < same.length) {
      ranges.push([r.at, runs[same[p]].at + r.size]);
      k = same[p];
    }
  }
}

// Markdown as the details hand it on (see the header).
function keptMarkdown(text) {
  const tagAt = tagReader(text);
  const commentEnd = commentReader(text);
  const code = codeRanges(text);
  const blanks = blankLines(text);
  let c = 0;
  // Whether a position, growing from call to call, is in code.
  const inCode = (at) => {
    while (c < code.length && code[c][1] <= at) c++;
    return c < code.length && code[c][0] <= at;
  };
  let line = 0;
  let lineEnd = text.indexOf("\n");
  // Whether a position, growing from call to call, starts its line after
  // at most 3 spaces, where a comment starts an HTML block.
  const startsLine = (at) => {
    while (lineEnd >= 0 && lineEnd < at) {
      line = lineEnd + 1;
      lineEnd = text.indexOf("\n", line);
    }
    return at - line <= 3 && /^ *$/.test(text.slice(line, at));
  };
  const marks = /<|!\[/g;
  const out = [];
  let from = 0;
  for (let m = marks.exec(text); m; m = marks.exec(text)) {
    const at = m.index;
    out.push(text.slice(from, at));
    from = at + m[0].length;
    if (m[0] === "<") {
      let end = commentEnd(at);
      if (end >= 0 && (inCode(at) || (!startsLine(at) && blankWithin(blanks, at, end)))) end = -1;
      const link = end < 0 ? webLink(text, at) : null;
      const tag = end < 0 && !link ? tagAt(at) : null;
      if (end >= 0) from = end;
      else if (link) {
        out.push(link.text);
        from = link.end;
      } else if (tag && !tag.close && IMAGES.has(tag.name)) {
        const attrs = attributesOf(tag.body);
        out.push(markdownImage(attrs.alt, attrs.src ?? ""));
        from = tag.end;
      } else out.push(`<${ZWSP}`);
    } else {
      const image = inlineImage(text, at);
      if (image) {
        out.push(markdownImage(image.alt, image.src));
        from = image.end;
      } else if (text[from] === "]") out.push("[Bild");
      else out.push("[Bild: ");
    }
    marks.lastIndex = from;
  }
  out.push(text.slice(from));
  return out.join("").replace(/!\[/g, `!${ZWSP}[`);
}

// A description as the details hand it to TextView (format: "markdown" or
// "html"), see the header; null where it has no text.
export function shownDescription(text, format) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  return format === "html" ? keptHtml(raw) : keptMarkdown(raw);
}
