// A square button at the start of the tab row that shows the board
// (mods/board/), as the leader's `b` does. layouts/personal.json puts it in a
// block of its own left of the tabs block, which moves the window like the
// tab bar. It is drawn like the tab bar (mods/tabs/, Herdr's): its background
// and bottom border, and a square button like its window buttons (minimize,
// maximize, close), in the muted colour and with the 14 px icon of its Files
// and Changes buttons.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, run, theme } from "herdr";

// ---- openBoard: the same in leader/main.js and board-button/main.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that both copies match.)
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
// ---- end openBoard ----

export default class BoardButton extends View {
  init() {}

  render() {
    const t = theme();
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
          .text_color(t.muted)
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Board")
          .accessibility_label("Board")
          // The press is the button's, not the start of a window drag.
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => openBoard())
          .child(svg("mods/board-button/board.svg").size(14)),
      );
  }
}
