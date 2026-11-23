// The Azure source as the board uses it (makeAzure); its team views'
// calls and data are in sprint.js and backlog.js, a work item's related
// items' in related.js, what they share in common.js.

import { BoardError, errorText, readMemo } from "../../shared.js";
import { AZ_TIMEOUT, call } from "../../tools.js";
import {
  AZ_ME_ARGS, AZ_ME_TIMEOUT, TEAM_KEEP_MS, azAreasArgs, azAssignArgs, azFailure, azMembersArgs, azStateArgs, checkAzAssigned, checkStateResult, membersFor,
  parseAreas, parseMemberList, parseViewer,
} from "./common.js";
import { azTypesArgs, parseAzureTypes, sprintView } from "./sprint.js";
import { backlogView } from "./backlog.js";
import { azureRelated } from "./related.js";

// The Azure source for the board: the name of the site `o` opens, why "nur
// meine" cannot tell one's own items, per layout of an Azure view how it
// loads and writes, and a work item's related items (related: its
// description, children and linked pull requests, related.js). az runs by
// the path `paths` (toolPaths) finds.
//
// What the Sprint keeps, each read once and kept until the sprint ends
// (iterationUntil; one that fails keeps nothing): per team, by organisation,
// project and team, its current sprint and taskboard columns. The
// project's work item types, one entry for both views (typesOf), are kept
// TEAM_KEEP_MS from their read (even where another read of the Sprint's
// settings fails), or, where a Sprint's whole settings read brought them,
// until its sprint ends.
// What is not kept is read at the same time. A refresh then reads the
// taskboard's columns of the work items and the sprint's work items, also
// at the same time. The team's kept settings (not the project's types) are
// dropped, so that they are read again, by `r` on the Sprint (forget), by
// a task in a column the columns read do not know, and by a move or state
// change Azure refuses.
//
// What the Backlog keeps, per team, read at the same time once and kept
// for BACKLOG_KEEP_MS (one that fails keeps nothing), or until the
// iteration ends that the team's default iteration follows, where that is
// sooner (backlogUntil): the team's backlog levels, its backlog
// configuration and its settings. A refresh then reads the level's ids (az
// rest) and, after them, one query for their fields; a backlog without
// ids asks no query. `r` on the Backlog and a state change or create Azure
// refuses drop what it keeps (not the project's types). Beside the ids, a
// refresh reads the project's work item types (for their colors) where
// neither view keeps them, and keeps them TEAM_KEEP_MS (typesOf); one that
// fails is a warning, keeps nothing and is read again with the next
// refresh.
//
// Both views read the team's areas (the Backlog for its default area) and
// keep them as one, for the shorter of their times (areasOf); `r` on
// either, or a refusal there, drops them.
//
// Who az is signed in as is read beside all that, with its own short
// timeout (AZ_ME_TIMEOUT), and kept once read; while that fails it is
// asked again with each refresh, and the data says why (noViewer: the
// source's words and the error).
//
// A team's members, whom the assignee picker offers (assign:
// actions/assign.js says what it holds), are read once per team and kept
// while the board runs; a read that fails is not kept.
export function makeAzure(paths) {
  // An az call's output; a failed one throws what `failure` (azFailure by
  // default) makes of it.
  const az = async (args, options = {}, timeout = AZ_TIMEOUT) => {
    const r = await call("az", args, null, timeout, { ...options, paths });
    if (r.code !== 0) throw (options.failure ?? azFailure)(r, null, options);
    return r.stdout;
  };
  // What the views keep: by key, a value until a time (ms).
  const kept = new Map();
  const keep = (key, value, until) => kept.set(key, { value, until });
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
  const teamKey = (c) => `${c.org}\n${c.project}\n${c.team}`;
  // The key of a project's work item types, which both views keep.
  const typesKey = (c) => `types\n${c.org}\n${c.project}`;
  const areasKey = (c) => `areas\n${teamKey(c)}`;
  // What the views share: az, what is kept, who az is (and the data's words
  // for why it is not known), a project's work item types (typesOf), and a
  // state change.
  const shared = {
    az, keptValue, whoAmI, teamKey,
    // The project's work item types (parseAzureTypes), one entry for both
    // views: read where it is not kept and kept TEAM_KEEP_MS from their read
    // (even where another read of the Sprint's settings fails), or, where a
    // Sprint's whole settings read brought them, until its sprint ends
    // (keepTypesUntil); no forget drops it.
    async typesOf(c) {
      const held = keptValue(typesKey(c));
      if (held) return { types: held.value, fresh: false };
      const types = parseAzureTypes(await az(azTypesArgs(c)));
      keep(typesKey(c), types, Date.now() + TEAM_KEEP_MS);
      return { types, fresh: true };
    },
    keepTypesUntil(c, until) {
      const entry = kept.get(typesKey(c));
      if (entry) entry.until = until;
    },
    // The team's areas (parseAreas), one entry for both views: read where
    // it is not kept, kept TEAM_KEEP_MS, and shorter where a view keeps
    // its own settings for a shorter time (keepAreasUntil: the Sprint's
    // until its sprint ends, the Backlog's until backlogUntil); either
    // view's forget drops it.
    async areasOf(c) {
      const held = keptValue(areasKey(c));
      if (held) return held.value;
      const value = parseAreas(await az(azAreasArgs(c)));
      keep(areasKey(c), value, Date.now() + TEAM_KEEP_MS);
      return value;
    },
    keepAreasUntil(c, until) {
      const entry = kept.get(areasKey(c));
      if (entry) entry.until = Math.min(entry.until, until);
    },
    forgetAreas: (c) => kept.delete(areasKey(c)),
    keep,
    drop: (key) => kept.delete(key),
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
  const members = readMemo();
  return {
    site: "Azure",
    noViewer,
    // A work item's description, children and linked pull requests
    // (related.js).
    related: azureRelated(az),
    assign: {
      refuse: (item) => (item.kind === "workitem" ? null : "Hier lässt sich niemand zuweisen"),
      // The team's members, kept (parseMemberList); who az is is asked
      // each time, so a viewer read since counts.
      async people(item, view) {
        const c = view.context;
        const [list, me] = await Promise.all([members.get(teamKey(c), () => az(azMembersArgs(c)).then(parseMemberList)), whoAmI()]);
        return membersFor(list, me);
      },
      // Without the list, az still knows its own account: "me".
      fallbackMe: () => ({ login: viewer, name: null, me: true }),
      write: async (view, item, person) => checkAzAssigned(await az(azAssignArgs(view.context, item.number, person), { write: true }), item.number, person),
    },
    // Drops what the view keeps of its team (r, Board.reload).
    forget(view) {
      if (view.context?.kind === "team") views[view.layout]?.forget(view.context);
    },
    views,
  };
}
