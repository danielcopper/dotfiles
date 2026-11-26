// How views load beyond one read: each view's last good data kept on disk
// (the saved state, drawn at once after a restart), what a load draws before
// its end, the order the prefetch reads the other views in, and the top
// bar's words for a read and an age.

// herdr's store refuses a value whose JSON string takes more than 1 MiB in
// UTF-8, and a file of more than 8 MiB for all keys (gpui-kit's
// storage.rs).
export const SAVED_MAX = 1000000;
export const SAVED_PREFIX = "board:data:";
// Raised when what a shape draws from changes, so that no older data is drawn.
export const SAVED_VERSION = 1;
export const savedKey = (id) => `${SAVED_PREFIX}${id}`;

// Data read for other hidden columns, another form of the view or another
// organisation, project or team of its tab is not its data; where its
// settings lie and the rest of its tab are not its form. A GitHub view has
// no tab and signs without one, so its data saved before the contexts holds.
const savedSig = (view, hidden) => {
  const { settingsPath, tab, ...form } = view;
  const reads = tab ? [{ org: tab.org, project: tab.project, team: tab.team }] : [];
  return JSON.stringify([SAVED_VERSION, form, ...reads, [...hidden].sort()]);
};

// The size the store measures `text` by.
export function storeBytes(text) {
  const json = JSON.stringify(text);
  let bytes = json.length;
  for (let i = 0; i < json.length; i++) {
    const unit = json.charCodeAt(i);
    if (unit >= 0x80) bytes++;
    // A surrogate is half of a 4-byte character, so 2 bytes.
    if (unit >= 0x800 && (unit < 0xd800 || unit > 0xdfff)) bytes++;
  }
  return bytes;
}

export function savedText(view, hidden, { data, warnings }, at) {
  const text = JSON.stringify({ sig: savedSig(view, hidden), at, data, warnings });
  return storeBytes(text) <= SAVED_MAX ? text : null;
}

export function readSaved(text, view, hidden) {
  let entry;
  try {
    entry = JSON.parse(text);
  } catch {
    return null;
  }
  if (entry?.sig !== savedSig(view, hidden) || !Number.isFinite(entry.at) || typeof entry.data?.shape !== "string") return null;
  return { data: entry.data, warnings: Array.isArray(entry.warnings) ? entry.warnings : [], at: entry.at };
}

export const goneSaved = (keys, ids) => keys.filter((k) => k.startsWith(SAVED_PREFIX) && !ids.has(k.slice(SAVED_PREFIX.length)));

// A load's live: partial(result) draws result() ({ data, warnings }) before
// the end, calling it at once or not at all; page(n, of) names the page
// under way.
export const NO_LIVE = { partial() {}, page() {} };

export const refreshDue = (st, now, every) => now - st.tried >= every;

export function prefetchOrder(views, { shown, contextViewIds, source, now, every, stateOf, loads }) {
  const due = views.filter((v) => {
    if (v.id === shown?.id || !loads(v)) return false;
    const st = stateOf(v.id);
    return !st.loading && !st.unavailable && refreshDue(st, now, every);
  });
  const rank = (v) => [contextViewIds.has(v.id) ? 0 : v.source === source ? 1 : 2, stateOf(v.id).at];
  return due.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1];
  });
}

export function sinceLabel(at, now) {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)} min`;
  if (s < 48 * 3600) return `vor ${Math.floor(s / 3600)} h`;
  return `vor ${Math.floor(s / 86400)} d`;
}

export function readLabels(st, now) {
  if (!st) return { reading: "", age: "" };
  const page = st.progress?.pages > 1 ? ` Seite ${st.progress.page} von ${st.progress.pages}` : "";
  return { reading: st.loading ? `lädt …${page}` : "", age: st.at ? `Stand ${sinceLabel(st.at, now)}` : "" };
}
