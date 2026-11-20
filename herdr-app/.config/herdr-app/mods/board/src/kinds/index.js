// View kinds, "<source> <layout>" (viewKind), and what the board shows for
// a view of each: `shape`, how its data is drawn and walked (ui/shapes/),
// or for a view whose source reads nothing for it yet the `text` it shows.
// A new view kind is: an entry here; its loading in its source's module
// (make<Source>().views[layout]); for a GitHub view, what views.json may say
// about it (VIEW_KINDS in config.js); for an Azure team view, its entry in
// TEAM_VIEWS (config.js); and for a new way to draw, a shape.

// A view's kind: the key of KINDS (and of VIEW_KINDS for a GitHub view).
export const viewKind = (v) => `${v.source} ${v.layout}`;

// What every view carries with its defaults, fresh for each view: the
// columns hidden by default (none) and its own start settings (none).
export const viewDefaults = () => ({ hide: [], start: {} });

export const KINDS = {
  "github board": { shape: "board" },
  "github list": { shape: "prs" },
  "azure sprint": { shape: "sprint" },
  "azure backlog": { text: "Backlog folgt" },
  "azure prs": { text: "PR-Ansicht folgt" },
};

// A view's entry in KINDS (null for a kind it does not have).
export const kindOf = (view) => KINDS[viewKind(view)] ?? null;
