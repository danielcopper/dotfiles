// Remembers the focused pane and the one focused before it, across tabs and
// spaces, for the leader's Tab, like tmux.conf's Tab across sessions
// (@alt_cur/@alt_prev). Herdr re-renders every mod on a focus change, so
// render compares the focused pane with the last one it saw and, when it
// changed, moves current to previous in one shared value:
//   shared("focus.history") = { current, previous }   (pane ids)
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
import { focused, shared, setShared, run, nextCommand, checking } from "herdr";

const LEADER_STALE_MS = 10000;

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
    const pane = focused()?.pane;
    const history = shared("focus.history");
    if (pane && history?.current !== pane) {
      setShared("focus.history", { current: pane, previous: history?.current ?? null });
    }
    return div();
  }
}
