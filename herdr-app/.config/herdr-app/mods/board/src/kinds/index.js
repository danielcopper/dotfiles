// View kinds, "<source> <layout>" (viewKind), and what the board shows for
// a view of each: `shape`, how its data is drawn and walked (SHAPES in
// src/main.js), or for a view whose source reads nothing for it yet the
// `text` it shows.
// A new view is an entry here, its loading in its source's module
// (make<Source>().views[layout]) and, for a new way to draw, a shape.

import { viewKind } from "../config.js";

export const KINDS = {
  "github board": { shape: "board" },
  "github list": { shape: "list" },
  "azure sprint": { text: "Sprint-Ansicht folgt" },
  "azure backlog": { text: "Backlog folgt" },
  "azure prs": { text: "PR-Ansicht folgt" },
};

// A view's entry in KINDS (null for a kind it does not have).
export const kindOf = (view) => KINDS[viewKind(view)] ?? null;
