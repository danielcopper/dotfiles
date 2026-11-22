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

// ---- layer: the same in leader/main.js, board-button/main.js, focus-history/main.js and board/src/ui/layer.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that the copies match.)
// The board layer (README, "herdr app") is a stack in the layout with a
// block that shows the board mod with props { layer: true } and a block
// that shows the shown tab. It is found by that shape, so its ids live in
// the layout alone.

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
  const isBoard = (n) => n.content?.mod === "board" && n.content.props?.layer === true;
  const isTab = (n) => n.content?.tab === "active";
  const stack = findNode(root, (n) => n.type === "stack" && (n.children ?? []).some(isBoard) && n.children.some(isTab));
  if (!stack) return null;
  const board = stack.children.find(isBoard).id;
  return { stack: stack.id, board, tab: stack.children.find(isTab).id, shown: stack.active === board };
}

// Shows the shown tab's content in place of the board. With `keyboard`, it
// also gives the keyboard to the focused pane, or the focused terminal
// outside a pane, since layout.select leaves the keyboard where it was.
// Each failure says what failed.
function showTab(layer, { keyboard = true } = {}) {
  try {
    run("layout.select", { stack: layer.stack, child: layer.tab });
  } catch (e) {
    notify({ title: `Could not show "${layer.tab}" in "${layer.stack}"`, body: String(e?.message ?? e), level: "error" });
    return;
  }
  if (!keyboard) return;
  const f = focused();
  const target = f?.pane ? { pane: f.pane } : f?.terminal ? { terminal: f.terminal } : null;
  if (!target) return;
  try {
    run("pane.focus", target);
  } catch (e) {
    const [kind, id] = Object.entries(target)[0];
    notify({ title: `Could not give ${kind} ${id} the keyboard`, body: String(e?.message ?? e), level: "error" });
  }
}

// Shows the tab's content again where the layout's board layer shows the
// board (showTab).
function leaveLayer(options) {
  const layer = boardLayer(layout());
  if (layer?.shown) showTab(layer, options);
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
  if (layer?.shown) return leaveLayer();
  if (layer) return showBoard(layer);
  if (shared("layout") === "personal") {
    notify({ title: "The personal layout has no board layer", body: "layouts/personal.json needs a stack with the shown tab and a board block whose props say layer", level: "error" });
    return;
  }
  openBoard();
}

// Shows the board in place of the tab's content and gives it the keyboard
// (its "focus" command), since layout.select leaves the keyboard where it
// was. Each failure says what failed.
function showBoard(layer) {
  try {
    run("layout.select", { stack: layer.stack, child: layer.board });
  } catch (e) {
    notify({ title: `Could not show "${layer.board}" in "${layer.stack}"`, body: String(e?.message ?? e), level: "error" });
    return;
  }
  try {
    run("board.focus");
  } catch (e) {
    notify({ title: "Could not give the board the keyboard", body: String(e?.message ?? e), level: "error" });
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

// A press on the button, whichever mouse button: it switches at once, on
// the press. It starts no window drag, and a failure says so in a toast.
// The shown board takes any press outside it, this one too, as one that
// shows the tab's content after the press (mods/board/, pressOutside); a
// switch on the release would undo that.
function press(_e, cx) {
  cx.stop_propagation();
  try {
    toggleBoard();
  } catch (e) {
    console.log(e?.stack ?? String(e));
    notify({ title: "Board button failed", body: String(e?.message ?? e), level: "error" });
  }
}

export default class BoardButton extends View {
  init() {}

  render() {
    const t = theme();
    const shown = Boolean(boardLayer(layout())?.shown);
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
          .on_mouse_down("left", press)
          .on_mouse_down("right", press)
          .on_mouse_down("middle", press)
          .child(svg("mods/board-button/board.svg").size(14)),
      );
  }
}
