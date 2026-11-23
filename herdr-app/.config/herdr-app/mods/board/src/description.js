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
// stay, not of what must go; HTML comments go in both formats, as they do on
// GitHub and Azure:
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
// - Markdown keeps no HTML: every `<` gets a zero-width space after it,
//   which no HTML tag starts with, so Markdown reads it as text, and in code
//   it looks unchanged. An http(s) URL in `<…>` stays, as an autolink or a
//   link's or definition's destination (`<https://…>`, `[x](<https://…>)`,
//   `[r]: <https://…>`): HTML has no tag of that name, so it can only be a
//   link, or text; a `\` in it is written %5C. An inline image becomes a
//   Markdown link "Bild: <alt>" to its http(s) URL (its text alone for
//   another URL), and an <img> or <image> tag the same; a `![` that starts
//   no inline image the scanner reads (an image by reference, or one longer
//   than MAX_IMAGE) becomes `[Bild: ` (`![]` `[Bild`), so that
//   `![alt][ref]` is a link where `ref` is defined, and `![alt][]` and
//   `![ref]` text. A label's `[`, `]`, `\` and `!` are escaped. Last, every
//   `![` left (a `!` before one of those links, or two pieces of the text
//   that meet) becomes `!`, a zero-width space and `[`: none is left. Text
//   in code changes the same way.
//
// Each step looks at the text once, and a tag, a comment's end, a URL in
// `<…>` or an image at most MAX_TAG characters, a search, up to the next `<`
// or MAX_IMAGE characters ahead, so a long hostile text costs little; the board makes it once per read (the
// Board's readRelated).

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
// spaces, `<`, `>` and `"`), or null for anything else.
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

// An image as a Markdown link (see the header).
function markdownImage(alt, src) {
  const url = webUrl(src);
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
// the header): { text, end } or null. The search stops at the next `<`, so
// no two of them read the same text.
function webLink(text, at) {
  WEB_LINK.lastIndex = at;
  const m = WEB_LINK.exec(text);
  return m ? { text: `<${m[1].replace(/\\/g, "%5C")}>`, end: at + m[0].length } : null;
}

// Markdown as the details hand it on (see the header).
function keptMarkdown(text) {
  const tagAt = tagReader(text);
  const commentEnd = commentReader(text);
  const marks = /<|!\[/g;
  const out = [];
  let from = 0;
  for (let m = marks.exec(text); m; m = marks.exec(text)) {
    const at = m.index;
    out.push(text.slice(from, at));
    from = at + m[0].length;
    if (m[0] === "<") {
      const end = commentEnd(at);
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
