// What every part of the board uses: its names, its error and how one is shown,
// small checks and text helpers, an item's key, and labels for times.



export const MOD = "board";
// The config's base name; the extension is added where the path is built.
export const CONFIG_NAME = "views";

export class BoardError extends Error {
  // unavailable: az is missing, not signed in or without its extension;
  // set for the Azure views to tell apart from a failure, which nothing
  // reads yet. unclear: a write may or may not have landed.
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

// An item's key: `<repo>#<number>` on GitHub, `AB#<id>` on Azure (Azure
// Boards' own way to name a work item), null for a draft.
export function itemKey(item) {
  if (item.number === null || item.number === undefined) return null;
  return item.source === "azure" ? `AB#${item.number}` : `${item.repoShort}#${item.number}`;
}

export const itemLabel = (item) => itemKey(item) ?? "Entwurf";

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
