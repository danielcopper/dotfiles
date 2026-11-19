// A square button at the start of the tab row that shows the board
// (mods/board/), as the leader's `b` does. layouts/personal.json puts it in a
// block of its own left of the tabs block, which moves the window like the
// tab bar. It is drawn like the tab bar (mods/tabs/, Herdr's): its background
// and bottom border, and a square button like its window buttons (minimize,
// maximize, close), in the muted colour and with the 14 px icon of its Files
// and Changes buttons.
//
// In the personal layout the button is the board's tab: the work area is a
// stack of the shown tab's content and the board, a click switches it, and
// while the board shows the button is highlighted as the tab bar highlights
// an open Files or Changes. While the board shows, the tab's content comes
// back on a second click, on any press in the tab bar, and on a change of
// focus: another tab, space or pane, or a new tab such as one with an agent
// the board started. herdr tells a mod of no click on a tab, and a click on
// the shown tab changes nothing a mod sees, so every press right of the
// button counts, on +, Files, Changes, the window buttons and an empty
// stretch too. herdr's tab bar keeps highlighting the last shown tab while
// the board shows. In a layout without that stack a click shows the board's
// tab.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { focused, layout, panes, run, theme } from "herdr";

// ---- board: the same in leader/main.js and board-button/main.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that both copies match.)
// layouts/personal.json shows the board as a layer of the work area: the
// stack BOARD_STACK holds the shown tab's content (TAB_CHILD) and the board
// (BOARD_CHILD), and layout.select switches it. The board reads the same
// ids (boardShown, mods/board/src/ui/helpers.js).
const BOARD_STACK = "work-stack";
const BOARD_CHILD = "board";
const TAB_CHILD = "main";

// The work area's stack in the shown layout, or null in a layout without it.
function boardStack(node = layout()) {
  if (!node || typeof node !== "object") return null;
  if (node.id === BOARD_STACK) return node;
  for (const child of node.children ?? []) {
    const found = boardStack(child);
    if (found) return found;
  }
  return null;
}

// Shows the shown tab's content in the work area again.
function showTab() {
  run("layout.select", { stack: BOARD_STACK, child: TAB_CHILD });
}

// Shows the board in the work area and gives it the keyboard (its "focus"
// command; layout.select leaves the keyboard where it was), or the tab's
// content again when the board shows. A layout without the stack shows the
// board's tab instead (openBoard).
function toggleBoard() {
  const stack = boardStack();
  if (!stack) return openBoard();
  if (stack.active === BOARD_CHILD) return showTab();
  run("layout.select", { stack: BOARD_STACK, child: BOARD_CHILD });
  run("board.focus");
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

// Where the focus is: its space, tab, pane and terminal.
function focusKey() {
  const f = focused();
  return JSON.stringify(f ? [f.space, f.tab, f.pane, f.terminal] : null);
}

export default class BoardButton extends View {
  init() {
    // The focus the board was shown with, while it shows; null while the
    // tab's content shows.
    this.seen = null;
  }

  // On every render, which herdr runs when the focus or the layout changes:
  // while the board shows, a focus other than the one it was shown with
  // shows the tab's content again.
  followFocus(shown) {
    if (!shown) {
      this.seen = null;
      return;
    }
    const now = focusKey();
    if (this.seen === null) this.seen = now;
    else if (now !== this.seen) {
      this.seen = now;
      showTab();
    }
  }

  // A press outside the button's block (herdr reports every press in the
  // window, its place relative to the block): one in the tab bar, right of
  // the block and within its height, shows the tab's content again while
  // the board shows.
  pressOutside(e) {
    const at = e.local_position, box = e.bounds;
    if (!at || !box || at.x < box.width || at.y < 0 || at.y >= box.height) return;
    if (boardStack()?.active === BOARD_CHILD) showTab();
  }

  render() {
    const t = theme();
    const shown = boardStack()?.active === BOARD_CHILD;
    this.followFocus(shown);
    return h_flex()
      .id("board-button")
      .size_full()
      .pl(10)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .on_mouse_down_out((e) => this.pressOutside(e))
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
          // The press is the button's, not the start of a window drag.
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => toggleBoard())
          .child(svg("mods/board-button/board.svg").size(14)),
      );
  }
}
