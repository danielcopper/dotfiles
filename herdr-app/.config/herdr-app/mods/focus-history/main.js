// Remembers the focused pane and the one focused before it, across tabs and
// spaces, for the leader's Tab, like tmux.conf's Tab across sessions
// (@alt_cur/@alt_prev). Herdr re-renders every mod on a focus change, so
// render compares the focused pane with the last one it saw and, when it
// changed, moves current to previous in one shared value:
//   shared("focus.history") = { current, previous }   (pane ids)
// A copy runs only where something shows it, so the personal layout carries
// an empty block that keeps it running. A focused layout terminal block has
// no pane and is not recorded.

import { View, div } from "gpui-kit";
import { focused, shared, setShared } from "herdr";

export default class FocusHistory extends View {
  render() {
    const pane = focused()?.pane;
    const history = shared("focus.history");
    if (pane && history?.current !== pane) {
      setShared("focus.history", { current: pane, previous: history?.current ?? null });
    }
    return div();
  }
}
