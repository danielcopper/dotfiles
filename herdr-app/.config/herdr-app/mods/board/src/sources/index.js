// The sources as the Board uses them: one run of a program, gh and az by
// the paths found, and per source loading a view and writing a move.

import { exec } from "herdr";
import { BoardError } from "../shared.js";
import { githubBoardArgs, parseGithubBoard, MOVE_PATH, githubMoveArgs, checkMoveResult, githubListArgs, parseGithubList, readGh } from "./github.js";
import { azureDefaultsArgs, parseAzureDefaults, azureTypesArgs, parseAzureTypes, azureQueryArgs, parseAzureBoard, azureMoveArgs, AZ_NO_PROJECT, azFailure } from "./azure.js";
import { execRejection } from "../tools.js";

const GH_TIMEOUT = 30000;
const AZ_TIMEOUT = 60000;

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

async function az(paths, view, args, options = {}) {
  const r = await call("az", args, view.on, AZ_TIMEOUT, { ...options, paths });
  if (r.code !== 0) throw azFailure(r, view.on, options);
  return r.stdout;
}

// What differs between GitHub and Azure, one set per Board: loading a view
// (`hiddenFor(view, columns)` gives its hidden columns), writing a move, the
// sidebar's tag, the name of the site `o` opens, whether `r` and opening the
// board try its views while not shown (`probe`), and what `r` forgets
// (`reset`). Azure keeps each view's work item types (parseAzureTypes) until
// then. gh and az run by the paths `paths` (toolPaths) finds.
export function makeSources(paths) {
  let azureTypes = {};
  return {
    github: {
      tag: (view) => (view.layout === "list" ? "PR" : "GH"),
      site: "GitHub",
      probe: false,
      reset() {},
      async load(view, hiddenFor) {
        if (view.layout === "list") {
          const { json, warnings, errors } = await gh(paths, githubListArgs(view));
          return { data: parseGithubList(json, view, errors), warnings };
        }
        const hidden = hiddenFor(view, []);
        const { json, warnings, errors } = await gh(paths, githubBoardArgs(view, hidden));
        return { data: parseGithubBoard(json, view, hidden, errors), warnings };
      },
      async move(view, data, card, column) {
        checkMoveResult((await gh(paths, githubMoveArgs(data.meta, card, column), { write: true, path: MOVE_PATH })).json, card);
      },
    },
    azure: {
      tag: () => "AZ",
      site: "Azure",
      probe: true,
      reset() {
        azureTypes = {};
      },
      async load(view, hiddenFor) {
        if (!azureTypes[view.id]) {
          const project = view.project ?? parseAzureDefaults(await az(paths, view, azureDefaultsArgs())).project;
          if (!project) throw new BoardError(AZ_NO_PROJECT);
          azureTypes[view.id] = parseAzureTypes(await az(paths, view, azureTypesArgs(view, project)));
        }
        const types = azureTypes[view.id];
        const hidden = hiddenFor(view, types.states);
        return { data: parseAzureBoard(await az(paths, view, azureQueryArgs(view, hidden)), types, hidden), warnings: [] };
      },
      async move(view, _data, card, column) {
        await az(paths, view, azureMoveArgs(view, card, column), { write: true });
      },
    },
  };
}
