// What the board's modules share: its names, its error and how one is
// shown, small checks and text helpers, an item's key and type, and labels
// for times.



export const MOD = "board";
// The config's base name; the extension is added where the path is built.
export const CONFIG_NAME = "views";

export class BoardError extends Error {
  // unavailable: az is missing, not signed in or without its extension. It
  // is set for the Azure views, to tell this apart from a failure; nothing
  // reads it yet. unclear: a write may or may not have landed.
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

export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isText = (v) => typeof v === "string" && v.trim() !== "";
export const textList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
export const firstLine = (text) => String(text ?? "").trim().split("\n")[0];
export const lastLine = (text) => String(text ?? "").trim().split("\n").at(-1);

// The message to show for an error: a BoardError's own, else marked as
// unexpected.
export const errorText = (e) => (e instanceof BoardError ? e.message : `Unerwarteter Fehler: ${firstLine(e?.message ?? e)}`);

// An error's message for the UI; an unexpected one is logged with its stack.
export function report(e) {
  if (!(e instanceof BoardError)) console.log(e?.stack ?? String(e));
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

// The label of an item's parent, an issue or work item of the same source
// and repo: "tender#3002", "AB#7".
export const parentLabel = (item) => itemLabel({ ...item, kind: "issue", number: item.parent });

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

export function updatedLabel(at, now) {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)} min`;
  return `vor ${Math.floor(s / 3600)} h`;
}

// A day label for a past moment, by local calendar days.
export function ageLabel(iso, now) {
  const then = new Date(iso), today = new Date(now);
  if (Number.isNaN(then.getTime())) return "";
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(today) - day(then)) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return `${then.getDate()}.${then.getMonth() + 1}.`;
}
