// A square button at the start of the tab row that shows the board
// (mods/board/), as the leader's `b` does. layouts/personal.json puts it in a
// block of its own left of the tabs block, which moves the window like the
// tab bar. It is drawn like the tab bar (mods/tabs/, Herdr's): its background
// and bottom border, and a square button like its window buttons (minimize,
// maximize, close), in the muted colour and with the 14 px icon of its Files
// and Changes buttons. Where the layout has a board layer, the button is the
// board's tab, highlighted while the board shows; README, "herdr app", says
// how the board shows and what brings the tab's content back.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { focused, layout, notify, panes, run, shared, theme } from "herdr";

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

// ---- board: the same in leader/main.js and board-button/main.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that both copies match.)

// Shows the board layer's board, or the tab's content again when it shows
// the board. The personal layout without a board layer says so; another
// layout shows the board's tab instead (openBoard).
function toggleBoard() {
  const layer = boardLayer(layout());
  if (layer?.shown) return showTab(layer);
  if (layer) return showBoard(layer);
  if (shared("layout") === "personal") {
    notify({ title: "The personal layout has no board layer", body: "layouts/personal.json needs a stack with the board and the shown tab", level: "error" });
    return;
  }
  openBoard();
}

// Shows the board in place of the tab's content and gives it the keyboard
// (its "focus" command), since layout.select leaves the keyboard where it
// was. A failure says which stack and child.
function showBoard(layer) {
  try {
    run("layout.select", { stack: layer.stack, child: layer.board });
    run("board.focus");
  } catch (e) {
    notify({ title: `Could not show "${layer.board}" in "${layer.stack}"`, body: String(e?.message ?? e), level: "error" });
  }
}

// Shows the board's tab ("Board", the board mod as its only pane) wherever
// it is, found by its pane, so a renamed tab is found too; or opens one in
// the shown space. pane.focus also shows its space and tab; a pane zoomed in
// that tab is unzoomed first, so the board shows.
function openBoard() {
  const board = panes().find((p) => p.mod === "board");
  if (!board) {
    run("tab.new", { name: "Board", mod: "board" });
    return;
  }
  const zoomed = panes().find((p) => p.tab === board.tab && p.zoomed);
  if (zoomed && zoomed.pane !== board.pane) run("pane.zoom", { pane: zoomed.pane });
  run("pane.focus", { pane: board.pane });
}
// ---- end board ----

export default class BoardButton extends View {
  init() {
    // The focus the board was shown with, while it shows; null while the
    // tab's content shows or before a first focus.
    this.seen = null;
  }

  // On every render, which herdr runs when the focus or the layout changes:
  // while the board shows, a focus on another space, tab or pane than the
  // one it was shown with shows the tab's content again. The terminal is
  // left out, so an agent that restarts or exits in the same pane keeps the
  // board. No focus at all changes nothing; the first focus after it is
  // the one compared with. The switch waits until after the render.
  followFocus(layer, cx) {
    if (!layer?.shown) {
      this.seen = null;
      return;
    }
    const f = focused();
    if (!f) return;
    const now = JSON.stringify([f.space, f.tab, f.pane]);
    if (this.seen === null) this.seen = now;
    else if (now !== this.seen) {
      this.seen = now;
      cx.timer.after(0, () => {
        const current = boardLayer(layout());
        if (current?.shown) showTab(current);
      });
    }
  }

  render(cx) {
    const t = theme();
    const layer = boardLayer(layout());
    this.followFocus(layer, cx);
    const shown = Boolean(layer?.shown);
    return h_flex()
      .size_full()
      .pl(10)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(
        div()
          .id("board-open")
          .size(26)
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .rounded(6)
          .text_color(shown ? t.foreground : t.muted)
          .when(shown, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Board")
          .accessibility_label("Board")
          // The press is the button's, not the start of a window drag. It
          // switches at once, on the press: the shown board takes any
          // press outside it, this one too, as one that shows the tab's
          // content after the press (mods/board/, pressOutside), which a
          // switch on the release would undo.
          .on_mouse_down("left", (_e, cx) => {
            cx.stop_propagation();
            toggleBoard();
          })
          .child(svg("mods/board-button/board.svg").size(14)),
      );
  }
}
