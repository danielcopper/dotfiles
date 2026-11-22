// Remembers the place the focus is and the one before it, across tabs and
// spaces, for the leader's Tab, like tmux.conf's Tab across sessions
// (@alt_cur/@alt_prev). A place is the focused pane, or the board while the
// layout's board layer shows it (place), since showing the board leaves
// herdr's focused pane where it was. Herdr re-renders a mod when live data
// it read changes, the focus and the layout among it (AGENTS.md, live
// data), so render compares the place with the last one it saw and, when
// it changed, moves current to previous in one shared value:
//   shared("focus.history") = { current, previous }
//   (pane ids, or the id of the layer's board child)
// So it records the board however it comes to show or goes away (the board
// button, the leader's b or Tab, a focus change that brings the tab's
// content back): showing it makes the pane under it previous, and the pane
// shown again after it has the board as previous.
// A copy runs only where something shows it, so the personal layout carries
// an empty block that keeps it running. A focused layout terminal block has
// no pane and is not recorded.
//
// Being always there, it also takes ctrl-space in the personal layout
// (keys.json "layout:personal": focus-history.leader). Pressed twice fast,
// the second ctrl-space can come before the leader has the keyboard, where
// the global mod.open:leader would close the leader again. So it keeps
// shared("leader.state") = { at, ready, pending } for the leader:
// - no leader open: it opens one and notes { at, ready: false };
// - that leader still starting: each press adds to `pending` (the leader's
//   init says what it does with them);
// - leader ready: it hands the press on as leader.send_prefix, however long
//   the leader has been open, since herdr's AGENTS.md doesn't say whether
//   "mod:leader" or "layout:personal" wins while the leader has the keyboard.
// The leader clears the state when it closes. A state still not ready after
// LEADER_STALE_MS keeps the leader from opening for at most that long, and a
// start of this mod (herdr started, a file saved, the layout shown again)
// drops whatever state was left.

import { View, div } from "gpui-kit";
import { focused, shared, setShared, run, nextCommand, checking, layout } from "herdr";

const LEADER_STALE_MS = 10000;

// ---- place: the same in leader/main.js and focus-history/main.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that both copies match.)
// The place the focus is in, as focus-history records it for the leader's
// Tab: the board layer's board child (its id in the layout) while the layer
// `layer` shows the board, else the focused pane; null for a focused layout
// terminal block, which has no pane.
function place(layer) {
  return layer?.shown ? layer.board : (focused()?.pane ?? null);
}
// ---- end place ----

// The board layer's shape, a part of the leader's layer block (a mod here
// is one main.js: README, "herdr app"; board.test.mjs checks that the
// copies match).
// ---- layer shape: the same in leader/main.js, board-button/main.js, focus-history/main.js and board/src/ui/layer.js ----
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
// ---- end layer shape ----

function leaderKey() {
  const state = shared("leader.state");
  if (state?.ready) return run("leader.send_prefix");
  if (state && Date.now() - state.at < LEADER_STALE_MS) {
    setShared("leader.state", { ...state, pending: (state.pending ?? 0) + 1 });
    return;
  }
  setShared("leader.state", { at: Date.now(), ready: false });
  run("mod.open", { name: "leader" });
}

export default class FocusHistory extends View {
  init(_props, cx) {
    if (checking()) return;
    if (shared("leader.state")) setShared("leader.state", null);
    // A loop of an older build ends at its next cx use (AGENTS.md), hence
    // the notify on every command.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        cx.notify();
        if (command === "leader") leaderKey();
      }
    });
  }

  render() {
    const here = place(boardLayer(layout()));
    const history = shared("focus.history");
    if (here && history?.current !== here) {
      setShared("focus.history", { current: here, previous: history?.current ?? null });
    }
    return div();
  }
}
