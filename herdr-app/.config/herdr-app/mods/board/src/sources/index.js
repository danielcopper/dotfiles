// The sources as the Board uses them: one run of a program, gh by the path
// found, and per source loading a view and writing a move.

import { exec } from "herdr";
import { BoardError } from "../shared.js";
import { githubBoardArgs, parseGithubBoard, MOVE_PATH, githubMoveArgs, checkMoveResult, githubListArgs, parseGithubList, readGh } from "./github.js";
import { execRejection } from "../tools.js";

const GH_TIMEOUT = 30000;

// One run of a program: its result, or a BoardError when it could not run.
// With `paths` (toolPaths) it runs by what that finds. `write` is for calls
// that change something (see execRejection).
export async function call(tool, args, on, timeout, { write = false, paths = null } = {}) {
  const start = (program) => exec(program, args, { on, timeout });
  try {
    return await (paths ? paths.run(tool, on, timeout, start) : start(tool));
  } catch (e) {
    throw e instanceof BoardError ? e : execRejection(tool, e, timeout, on, { write });
  }
}

const gh = async (paths, args, options = {}) => readGh(await call("gh", args, null, GH_TIMEOUT, { ...options, paths }), options);

// What a source does for the Board, one set per Board: loading a view
// (`hiddenFor(view)` gives its hidden columns), writing a move, the name of
// the site `o` opens, and what `r` forgets (`reset`). gh runs by the path `paths` (toolPaths) finds.
export function makeSources(paths) {
  return {
    github: {
      site: "GitHub",
      reset() {},
      async load(view, hiddenFor) {
        if (view.layout === "list") {
          const { json, warnings, errors } = await gh(paths, githubListArgs(view));
          return { data: parseGithubList(json, view, errors), warnings };
        }
        const hidden = hiddenFor(view);
        const { json, warnings, errors } = await gh(paths, githubBoardArgs(view, hidden));
        return { data: parseGithubBoard(json, view, hidden, errors), warnings };
      },
      async move(view, data, card, column) {
        checkMoveResult((await gh(paths, githubMoveArgs(data.meta, card, column), { write: true, path: MOVE_PATH })).json, card);
      },
    },
  };
}
