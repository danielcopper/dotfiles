// The sources as the Board uses them, by id: each source's module makes its
// own (makeGithub, makeAzure).

import { makeAzure } from "./azure/index.js";
import { makeGithub } from "./github.js";

export const makeSources = (paths) => ({ azure: makeAzure(paths), github: makeGithub(paths) });
