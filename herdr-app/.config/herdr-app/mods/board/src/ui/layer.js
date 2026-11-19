// The board layer: how the board finds the stack that shows it in place of
// the shown tab's content, and how it shows that content again. The leader
// and the board button hold the same block.

import { focused, notify, run } from "herdr";

// ---- layer: the same in leader/main.js, board-button/main.js and board/src/ui/layer.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that the copies match.)
// The board layer (README, "herdr app") is a stack in the layout with a
// block that shows the board mod and a block that shows the shown tab. It
// is found by that shape, so its ids live in the layout alone.

// The first node of a layout tree, depth first, that `test` accepts, or
// null.
function findNode(node, test) {
  if (!node || typeof node !== "object") return null;
  if (test(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, test);
    if (found) return found;
  }
  return null;
}

// The board layer of a layout tree as { stack, board, tab, shown }: the
// stack's id, its board child's and its tab child's, and whether it shows
// the board; null for a layout without one.
function boardLayer(root) {
  const isBoard = (n) => n.content?.mod === "board";
  const isTab = (n) => n.content?.tab === "active";
  const stack = findNode(root, (n) => n.type === "stack" && (n.children ?? []).some(isBoard) && n.children.some(isTab));
  if (!stack) return null;
  const board = stack.children.find(isBoard).id;
  return { stack: stack.id, board, tab: stack.children.find(isTab).id, shown: stack.active === board };
}

// Shows the shown tab's content in place of the board and gives the
// keyboard back to the focused pane, since layout.select leaves the
// keyboard where it was. A failure says which stack and child.
function showTab(layer) {
  try {
    run("layout.select", { stack: layer.stack, child: layer.tab });
    const pane = focused()?.pane;
    if (pane) run("pane.focus", { pane });
  } catch (e) {
    notify({ title: `Could not show "${layer.tab}" in "${layer.stack}"`, body: String(e?.message ?? e), level: "error" });
  }
}
// ---- end layer ----

// The block's functions for the board's other modules. In main.js all
// modules share one scope; run from src/ each module is one of its own.
export const layers = { boardLayer, showTab };
