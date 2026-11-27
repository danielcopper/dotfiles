// View kinds, "<source> <layout>" (viewKind), and what the board shows for
// a view of each: `shape`, how its data is drawn and walked (ui/shapes/),
// or for a view whose source reads nothing for it yet the `text` it shows
// (text(view)). A new view kind is: an entry here; its loading in its
// source's module (make<Source>().views[layout]); for an Azure team view,
// its entry in TEAM_VIEWS (config.js); and for a new way to draw, a shape.
// A GitHub project's views take their layout from GitHub; what views.json
// says of a GitHub tab follows its entry kind in ENTRY_KINDS (config.js).

// A view's kind: the key of KINDS.
export const viewKind = (v) => `${v.source} ${v.layout}`;

// What every view carries with its defaults, fresh for each view: the
// columns hidden by default (none) and its own start settings (none).
export const viewDefaults = () => ({ hide: [], start: {} });

export const KINDS = {
  "github board": { shape: "board" },
  "github table": { shape: "table" },
  // GitHub's API names no dates or zoom a roadmap shows: it draws as a table.
  "github roadmap": { shape: "table" },
  "github list": { shape: "prs" },
  "azure sprint": { shape: "sprint" },
  "azure backlog": { shape: "backlog" },
  "azure prs": { text: () => "PR-Ansicht folgt" },
};

// A view's entry in KINDS (null for a kind it does not have).
export const kindOf = (view) => KINDS[viewKind(view)] ?? null;
