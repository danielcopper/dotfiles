// What the board's modules share: its names, its error and how one is
// shown, its lines for herdr's log, small checks and text helpers, an
// item's key, type and order, and labels for times.



export const MOD = "board";
// The config's base name; the extension is added where the path is built.
export const CONFIG_NAME = "views";

export class BoardError extends Error {
  // unavailable: az is missing, not signed in or without its extension.
  // unclear: a write may or may not have landed (failure), or landed in part (partly).
  constructor(message, { unavailable = false, unclear = false } = {}) {
    super(message);
    this.unavailable = unavailable;
    this.unclear = unclear;
  }
}

// A failure: with `write` and `unclear` (it may have reached the server) one
// whose outcome is unclear, else a plain error. The one place that choice is
// made.
export function failure(text, { write = false, unclear = false } = {}) {
  return write && unclear ? new BoardError(`Ergebnis unklar: ${text}`, { unclear: true }) : new BoardError(text);
}

export const partly = (text) => new BoardError(text, { unclear: true });

export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isText = (v) => typeof v === "string" && v.trim() !== "";
export const textList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
// How many items GitHub sends in one page of a connection at most (its
// `first`).
export const PAGE = 100;

export const firstLine = (text) => String(text ?? "").trim().split("\n")[0];
export const lastLine = (text) => String(text ?? "").trim().split("\n").at(-1);

// The message to show for an error: a BoardError's own, else marked as
// unexpected.
export const errorText = (e) => (e instanceof BoardError ? e.message : `Unerwarteter Fehler: ${firstLine(e?.message ?? e)}`);

// herdr's log gets console.log.
export const boardLog = { write: (line) => console.log(line) };

// An error's message for the UI; an unexpected one is logged with its stack.
export function report(e) {
  if (!(e instanceof BoardError)) boardLog.write(e?.stack ?? String(e));
  return errorText(e);
}

// An item's key: `<repo>#<number>` on GitHub; on Azure `AB#<id>` for a work
// item (Azure Boards' own way to name one) and `!<id>` for a pull request
// (Azure Repos' own); null for a draft.
export function itemKey(item) {
  if (item.number === null || item.number === undefined) return null;
  if (item.source === "azure") return item.kind === "pr" ? `!${item.number}` : `AB#${item.number}`;
  return `${item.repoShort}#${item.number}`;
}

export const itemLabel = (item) => itemKey(item) ?? "Entwurf";

// An item's label on a card or a list's row: an Azure work item's number
// alone (the views that show it hold only work items, so the AB# says
// nothing there), else itemLabel. Its details, notices and toasts keep
// itemLabel.
export const cardLabel = (item) => (item.source === "azure" && item.kind === "workitem" ? String(item.number) : itemLabel(item));

// A comparator of items by their `order` (an Azure backlog's order field,
// lowest first), those without one after the rest, ties by `tie`.
export const byOrder = (tie) => (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || tie(a, b);

// A person as the board names one, in every source alike: by name where
// there is one, else by login; null for neither. Logins are kept apart
// (assigneeLogins: select.js isMine).
export const personName = ({ name, login }) => name || login || null;

// What names an issue, pull request or work item wherever it shows (on
// the board, as a line of the details, as a level the details panel went
// down to): its source, kind, repo (none on Azure) and number. Its
// identity, for comparing (sameItem) and for keying a level; unlike
// itemKey, a label to show ("tender#3004", null for a draft), and unlike
// an item's `key`, the board's own for a card or row (a Projects item's id
// on GitHub).
export const lineKey = (item) => `${item.source}:${item.kind}:${item.repo ?? ""}#${item.number}`;

// Whether `a` and `b` are the same issue, pull request or work item.
export const sameItem = (a, b) => lineKey(a) === lineKey(b);

// How an issue's or pull request's state shows on a line and a level of
// the details (GitHub's states and Azure's pull request statuses map onto
// them): its label, its chip's theme color, and whether it is done
// (dimmed); otherLook for a state none is known for.
export const STATE_LOOKS = {
  open: { state: "offen", color: "ansi2", done: false },
  closed: { state: "geschlossen", color: "muted", done: true },
  merged: { state: "gemerged", color: "ansi5", done: true },
};
export const otherLook = (state) => ({ state: String(state ?? "?").toLowerCase(), color: "muted", done: false });

// A draft pull request's review, on either source: a draft asks for none
// yet.
export const DRAFT_REVIEW = "Entwurf";

export const NOTIFIED = "ungelesen";

// copper's hues by its names, each as the theme name the board draws it in
// (ui/tones.js takes those to copper's colors and says who takes orange's
// ansi11).
export const COPPER_HUES = { red: "ansi1", green: "ansi2", yellow: "ansi3", blue: "ansi4", violet: "ansi5", teal: "ansi6", orange: "ansi11" };

// The tones a PR list's section may take (views.json, a section's "tone"):
// copper's hues but orange, the mark's (ui/tones.js, markColor); and the
// order in which sections without one take them, by their place, past the
// ones other sections set (config.js).
export const SECTION_TONES = Object.fromEntries(Object.entries(COPPER_HUES).filter(([name]) => name !== "orange"));
export const SECTION_TONE_ORDER = ["blue", "violet", "teal", "green", "yellow", "red"];

// The label of an item's parent, an issue or work item of the same source
// and repo: "tender#3002", "AB#7".
export const parentLabel = (item) => itemLabel({ ...item, kind: "issue", number: item.parent });

export const relativeLabel = (root, item) => (item.source === "github" && item.repo === root.repo ? `#${item.number}` : cardLabel(item));

export function partOfText(item) {
  if (!Number.isInteger(item.parent)) return null;
  const repo = item.parentRepo ?? item.repo;
  const parent = { source: item.source, kind: item.source === "azure" ? "workitem" : "issue", number: item.parent, repo, repoShort: repo?.split("/").pop() };
  return ["Teil von", relativeLabel(item, parent), item.parentTitle].filter(Boolean).join(" ");
}

// An item that is an Epic by its title alone: "[Epic] …", the convention of
// a project without issue types.
const EPIC_TITLE = /^\[epic\]/i;

// An item's type as the board names it: its own (an issue type, a work item
// type), else "Epic" for an Epic by its title; null for none.
export const cardType = (item) => item.type ?? (EPIC_TITLE.test(item.title ?? "") ? "Epic" : null);

// The label whose color an Epic by its title alone takes for its type's
// marker: its "epic" label, whatever its case; null for another item.
export const epicLabel = (item) =>
  (!item.type && cardType(item) ? (item.labels ?? []).find((l) => l.toLowerCase() === "epic") ?? null : null);

// Reads kept by key as their promises: get(key, read) gives the one kept
// for `key`, else starts read() and keeps that; a read that fails is
// dropped (where no newer one has taken its place), so the next get reads
// again. forget(key, promise) drops `promise` where it is still the one
// kept; drop(key) whatever is kept for `key`; clear() drops all.
export function readMemo() {
  const kept = new Map();
  const forget = (key, promise) => kept.get(key) === promise && kept.delete(key);
  return {
    get(key, read) {
      if (!kept.has(key)) {
        const promise = read();
        kept.set(key, promise);
        promise.catch(() => forget(key, promise));
      }
      return kept.get(key);
    },
    forget,
    drop: (key) => kept.delete(key),
    clear: () => kept.clear(),
  };
}

// A day in ms, and the end of an iteration's last day from Azure's
// finishDate (that day's start, in UTC; NaN for none), and whether that
// day is over by `now`: what keeps a sprint (iterationUntil) and what the
// sprint picker counts as ended (startRow) go by it.
export const DAY_MS = 86400000;
export const lastDayEnd = (finish) => Date.parse(finish ?? "") + DAY_MS;
export const lastDayOver = (finish, now) => lastDayEnd(finish) <= now;

// A day label for a past moment, by local calendar days.
export function ageLabel(iso, now) {
  const then = new Date(iso), today = new Date(now);
  if (Number.isNaN(then.getTime())) return "";
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(today) - day(then)) / DAY_MS);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return `${then.getDate()}.${then.getMonth() + 1}.`;
}
