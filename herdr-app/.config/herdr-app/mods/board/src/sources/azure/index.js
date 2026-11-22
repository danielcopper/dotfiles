// The Azure source as the board uses it (makeAzure); its team views'
// calls and data are in sprint.js and backlog.js, what both use in
// common.js.

import { BoardError, errorText } from "../../shared.js";
import { AZ_TIMEOUT, call } from "../../tools.js";
import { AZ_ME_ARGS, AZ_ME_TIMEOUT, azFailure, azStateArgs, checkStateResult, parseViewer } from "./common.js";
import { sprintView } from "./sprint.js";
import { backlogView } from "./backlog.js";

// The Azure source for the board: the name of the site `o` opens, why "nur
// meine" cannot tell one's own items, and per layout of an Azure view how
// it loads and writes. az runs by the path `paths` (toolPaths) finds.
//
// What the Sprint keeps, each read once and kept until the sprint ends
// (sprintUntil; one that fails keeps nothing): per team, by organisation,
// project and team, its current sprint, and its areas and taskboard
// columns; per project the work item types, until the sprint of the team
// that read them ends. What is not kept is read at the same time. A
// refresh then reads the taskboard's columns of the work items and the
// sprint's work items, also at the same time. The team's kept settings
// (not the project's types) are dropped, so that they are read again, by
// `r` on the Sprint (forget), by a task in a column the columns read do not
// know, and by a move or state change Azure refuses.
//
// What the Backlog keeps, per team, read at the same time once and kept
// for BACKLOG_KEEP_MS (one that fails keeps nothing): the team's backlog
// levels, its backlog configuration, its settings and its areas (for the
// default area). A refresh then reads the level's ids (az rest) and, after
// them, one query for their fields; a backlog without ids asks no query.
// `r` on the Backlog and a state change or create Azure refuses drop what
// it keeps.
//
// Who az is signed in as is read beside all that, with its own short
// timeout (AZ_ME_TIMEOUT), and kept once read; while that fails it is
// asked again with each refresh, and the data says why (noViewer: the
// source's words and the error).
export function makeAzure(paths) {
  // An az call's output; a failed one throws what `failure` (azFailure by
  // default) makes of it.
  const az = async (args, options = {}, timeout = AZ_TIMEOUT) => {
    const r = await call("az", args, null, timeout, { ...options, paths });
    if (r.code !== 0) throw (options.failure ?? azFailure)(r, null, options);
    return r.stdout;
  };
  const kept = new Map();
  const keptValue = (key) => {
    const entry = kept.get(key);
    return entry && Date.now() < entry.until ? entry : null;
  };
  let viewer = null;
  let viewerError = null;
  const whoAmI = () =>
    viewer
      ? Promise.resolve(viewer)
      : az(AZ_ME_ARGS, {}, AZ_ME_TIMEOUT).then((out) => {
        viewer = parseViewer(out);
        viewerError = viewer ? null : "keinen Benutzer genannt";
        return viewer;
      }, (e) => {
        viewerError = errorText(e);
        return null;
      });
  const noViewer = "az hat nicht gesagt, wer angemeldet ist (az account show; das braucht az login)";
  // What the views share: az, what is kept, who az is (and the data's words
  // for why it is not known), and a state change.
  const shared = {
    az, kept, keptValue, whoAmI,
    teamKey: (c) => `${c.org}\n${c.project}\n${c.team}`,
    noViewerOf(data) {
      if (!data.viewer) data.noViewer = `${noViewer}: ${viewerError}`;
    },
    // A write Azure refused may have met settings that are out of date:
    // `drop` drops them.
    dropOnRefusal: (drop, c) => (e) => {
      if (!(e instanceof BoardError && e.unclear)) drop(c);
      throw e;
    },
    setState: (view, item, state, onRefusal) =>
      az(azStateArgs(view.context, item.number, state), { write: true }).catch(onRefusal(view.context)).then((out) => checkStateResult(out, state)),
  };
  const views = { sprint: sprintView(shared), backlog: backlogView(shared) };
  return {
    site: "Azure",
    noViewer,
    // Drops what the view keeps of its team (r, Board.reload).
    forget(view) {
      if (view.context?.kind === "team") views[view.layout]?.forget(view.context);
    },
    views,
  };
}
