// Tests for the herdr board mod (herdr-app/.config/herdr-app/mods/board/main.js,
// built from its modules in src/ by build.mjs): the build, the mod's data
// functions, and a few UI paths driven through the Board class with a fake
// herdr; also the board button (mods/board-button/) and its place in
// layouts/personal.json. They import the built main.js, the file herdr
// loads. Run with `mise run herdr-board-test` (README, "herdr app"), or from
// the repo root with `node --test tests/herdr-app/board.test.mjs`.
//
// The mod imports "gpui-kit", "gpui-base" and "herdr", which only herdr
// provides. A resolve/load hook hands node a stand-in for each that exports
// every name the mod imports: View as an empty class, everything else as a
// function (with `.new` and any other member) that calls the fake host a test
// puts in globalThis.__boardHost, and throws when there is none. HOME points
// at an empty temporary folder before the mod is imported (removed after the
// run). BOARD_MAIN points
// the tests at another copy of main.js (to see a test fail against a broken
// one, or to run them against src/main.js).
//
// Fixtures in board-fixtures/:
// - recorded from gh 2.96 and GitHub's GraphQL API, then reduced to six items
//   and rewritten as sample data: github-board.json (the query
//   githubBoardArgs builds from the shipped views.json), github-not-found.json
//   (a project number that does not exist), gh-no-login.txt (gh's stderr
//   without a login);
// - built by hand in the shapes GitHub returns: github-board-cases.json (a
//   pull request, a draft, an item without access, an item in an option that
//   is gone), github-list.json, github-move.json, github-rate-limited.json,
//   github-scope-error.json; added the same way: the viewer's login in
//   github-board.json, github-board-cases.json and github-list.json, the
//   items' authors (a draft's creator) in the first two, the pull requests'
//   assignees and review requests in github-list.json and the pull
//   request's in github-board-cases.json, a review request whose reviewer
//   is gone (null) and an issue whose author is gone (null), and each issue's
//   and pull request's own id (I_sample<number>, PR_sample<number>);
// - written from GitHub's GraphQL reference (Label's color, IssueType's
//   color), with colors from GitHub's default labels and its label
//   palette, and made-up titles, not recorded: github-board-colors.json
//   (labels with colors, one without, issue types with colors, and Epics
//   by their "[Epic]" title);
// - written from GitHub's GraphQL reference (Issue's subIssues and
//   closedByPullRequestsReferences), with made-up names, not recorded:
//   github-related.json (an issue's sub-issues and linked pull requests)
//   and github-related-not-found.json (an issue GitHub does not find; the
//   error in the shape of the other NOT_FOUND answers);
// - written from GitHub's GraphQL reference (Repository's assignableUsers,
//   Query's viewer), with made-up names, not recorded:
//   github-assignable.json (one person without a name);
// - written from the azure-devops extension's az devops team list-member
//   (core's TeamMember: identity, isTeamAdmin), with made-up names, not
//   recorded: azure-team-members.json (one group among the members);
// - written from az's documentation (`az devops invoke` for work item
//   types), not recorded: azure-types.json;
// - written in the shapes az prints for the Sprint view's calls (the REST
//   reference at api-version 7.1 and the azure-devops extension's models),
//   with made-up names, not recorded: azure-sprint-iteration.json (az
//   boards iteration team list --timeframe current),
//   azure-sprint-areas.json (az boards area team list),
//   azure-sprint-columns.json (taskboardColumns), azure-sprint-types.json
//   (workitemtypes; each type's color, which the REST reference only names,
//   written as its states' colors are, six hex digits without #, with the
//   values of Azure's Agile process),
//   azure-sprint-taskboard.json (taskboardWorkItems, with
//   one work item the query does not find), azure-sprint-items.json (az
//   boards query) and azure-sprint-account.json (az account show --query
//   user);
// - written the same way for the Backlog's calls (the REST reference at
//   api-version 7.1 and the extension's vendored SDK models), with made-up
//   names, not recorded: azure-backlog-levels.json (backlogs),
//   azure-backlog-config.json (backlogconfiguration),
//   azure-backlog-settings.json (az boards iteration team
//   show-default-iteration), azure-backlog-ids.json (az rest on
//   backlogs/<level>/workItems, in another order than the order field's),
//   azure-backlog-items.json (az boards query, with the order field; one
//   item without it), azure-backlog-created.json (az boards work-item
//   create) and azure-backlog-related.json (az boards work-item relation
//   add); the team's areas are azure-sprint-areas.json;
// - written the same way for a work item's related items (the REST
//   reference's Work Items - Get Work Item with $expand=relations, and the
//   pull request link az repos pr work-item add writes), with made-up
//   names, not recorded: azure-related-item.json (az boards work-item show
//   --expand relations: a description in HTML with an image, children, a
//   parent, a pull request, a branch and a related link) and
//   azure-related-children.json (az boards query for the children, one of
//   them not found).

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const modDir = resolve(here, "../../herdr-app/.config/herdr-app/mods/board");
const mainPath = process.env.BOARD_MAIN ? resolve(process.env.BOARD_MAIN) : join(modDir, "main.js");
const STUBBED = new Set(["gpui-kit", "gpui-base", "herdr"]);
const realHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "board-home-"));
process.env.HOME = tempHome;
after(() => rmSync(tempHome, { recursive: true, force: true }));

registerHooks({
  resolve(specifier, context, next) {
    if (!STUBBED.has(specifier)) return next(specifier, context);
    const parent = context.parentURL ? readFileSync(fileURLToPath(context.parentURL), "utf8") : "";
    const clause = parent.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${specifier}["']`))?.[1] ?? "";
    const names = clause.split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    return { url: `stub:${specifier}?${names.join(",")}`, shortCircuit: true };
  },
  load(url, context, next) {
    if (!url.startsWith("stub:")) return next(url, context);
    const [specifier, list] = url.slice(5).split("?");
    const source = [
      `const call = (name) => (...a) => {
        const h = globalThis.__boardHost?.[name];
        if (!h) throw new Error(\`${specifier} \${name} is not available under node\`);
        return h(...a);
      };`,
      ...list
        .split(",")
        .filter(Boolean)
        .map((n) =>
          n === "View"
            ? "export class View {}"
            : `export const ${n} = new Proxy(call("${n}"), { get: (t, p) => (typeof p === "string" ? call("${n}." + p) : t[p]) });`,
        ),
    ].join("\n");
    return { format: "module", source, shortCircuit: true };
  },
});

const board = await import(pathToFileURL(mainPath).href);
// Every render marks the fake host as drawing, as herdr does (ScrollHandle).
// herdr draws, and so renders, only a copy that shows (a stack draws only
// its shown child, a tab only while shown), so rendering one that does not
// is refused.
const realRender = board.default.prototype.render;
board.default.prototype.render = function render(...args) {
  const host = globalThis.__boardHost;
  if (host && !host.checking() && !board.boardShown(this.isLayer())) throw new Error("herdr renders only a board copy that shows");
  if (host) host.drawing = true;
  try {
    return realRender.apply(this, args);
  } finally {
    if (host) host.drawing = false;
  }
};
const fixture = (name) => readFileSync(join(here, "board-fixtures", name), "utf8");
const json = (name) => JSON.parse(fixture(name));
const shippedConfig = () => readFileSync(join(modDir, "views.json"), "utf8");

// A config with an Azure team and its project's pull requests, and one
// GitHub view of each kind plus one with its own start, for the functions
// that take views.
function sampleConfig() {
  const { config, errors } = board.validateConfig({
    start: { message: "/work {number}", review: "/look {number}" },
    repos: { "example/tender": { checkout: "~/src/tender", machine: "server" } },
    sources: {
      azure: { org: "https://dev.azure.com/example-org", contexts: [{ team: { project: "Example Project", team: "Example Team" } }, { prs: { project: "Example Project" } }] },
      github: {
        views: [
          { id: "mine", name: "Mine", source: "github", layout: "board", project: { owner: "sample-user", number: 7 }, filter: "assignee:@me", hide: ["Backlog", "Done"] },
          { id: "prs", name: "PRs", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] },
          { id: "other", name: "Other", layout: "board", project: { owner: "sample-user", number: 8 }, start: { checkout: "~/src/work", message: "OT {number}" } },
        ],
      },
    },
  });
  assert.deepEqual(errors, []);
  return config;
}

const githubView = () => sampleConfig().github.views[0];
const listView = () => sampleConfig().github.views[1];
const otherView = () => sampleConfig().github.views[2];
const HIDDEN = new Set(["Backlog", "Done"]);
const githubBoard = () => board.parseGithubBoard(json("github-board.json"), githubView(), HIDDEN);
const casesBoard = () => board.parseGithubBoard(json("github-board-cases.json"), githubView(), HIDDEN);
const azureTypes = () => board.parseAzureTypes(fixture("azure-types.json"));
// A work item as the Azure views will show one.
const azureItem = () => ({
  key: "w101", source: "azure", kind: "workitem", number: 101, repo: "Example Project", repoShort: "Example Project", title: "Write the sample importer",
  url: null, labels: [], assignees: [], type: "Task", parent: null, sub: null, branch: null,
});
const names = (b) => b.columns.map((c) => c.name);
const numbersIn = (b, name) => b.columns.find((c) => c.name === name).cards.map((c) => c.number);

// herdr's words when exec rejects (src/mods.rs, herdr 0.1.16): a program
// that does not start here, one stopped at its timeout (here or on another
// machine), and one the core on another machine cannot start (the core's
// own words, as src/programs.rs reads them).
const notRun = (program) => new Error(`cannot run ${program}: No such file or directory (os error 2)`);
const stopped = (program, s = 30, on = null) => new Error(`${program} took longer than ${s} s${on ? ` on ${on}` : ""} and was stopped`);
const notThere = (program) => new Error(`cannot start ${program}: program not found`);

// mise run herdr-board-test sets BOARD_TEST_PERMISSION; then node must run
// under its permission model, and this test fails rather than skips.
const underTask = Boolean(process.env.BOARD_TEST_PERMISSION);
test("under mise run herdr-board-test nothing of the real home outside the repo can be read", { skip: !underTask && !process.permission && "node runs without --permission" }, () => {
  assert.ok(process.permission, "BOARD_TEST_PERMISSION is set but node runs without --permission");
  assert.equal(process.permission.has("fs.read", join(realHome, ".bashrc")), false);
  assert.equal(process.permission.has("fs.write", realHome), false);
  assert.equal(process.permission.has("fs.write", modDir), false, "the mod's folder is read-only");
  assert.equal(process.permission.has("fs.read", mainPath), true);
});

// ---- The build (mods/board/build.mjs) ----

const builder = await import(pathToFileURL(join(modDir, "build.mjs")).href);

test("main.js is what build.mjs builds from src/", () => {
  const shipped = readFileSync(join(modDir, "main.js"), "utf8");
  const fresh = builder.build();
  const a = shipped.split("\n"), b = fresh.split("\n");
  const at = a.findIndex((line, i) => line !== b[i]);
  assert.ok(shipped === fresh, `main.js differs from a fresh build at line ${(at < 0 ? a.length : at) + 1}: node ${join(modDir, "build.mjs")}`);
});

test("src/main.js exports what main.js does", async () => {
  const fromSource = await import(pathToFileURL(join(modDir, "src/main.js")).href);
  assert.deepEqual(Object.keys(fromSource).sort(), Object.keys(board).sort());
});

// A src/ folder in the temporary folder with the given modules (name → text).
function sourceTree(files) {
  const dir = mkdtempSync(join(tmpdir(), "board-src-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
const buildOf = (files) => {
  const dir = sourceTree(files);
  try {
    return builder.build(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("the build puts the entry's comment first, merges the host imports and lists each module after those it imports", () => {
  const out = buildOf({
    "main.js": '// The board.\n\nimport { div } from "gpui-kit";\nimport { a } from "./x/a.js";\nimport { b } from "./b.js";\nexport * from "./b.js";\n\nexport default class Board {}\n',
    "x/a.js": '// Module a.\n\nimport { exec } from "herdr";\nimport { b } from "../b.js";\n\nexport const a = () => b + exec;\n',
    "b.js": 'import { div, View } from "gpui-kit";\nimport { run } from "herdr";\n\nexport const b = 1;\n',
  });
  assert.equal(out, [
    builder.BANNER, "", "// The board.", "",
    'import { View, div } from "gpui-kit";', 'import { exec, run } from "herdr";', "",
    "// ==== src/b.js ====", "", "export const b = 1;", "",
    "// ==== src/x/a.js ====", "", "// Module a.", "", "export const a = () => b + exec;", "",
    "// ==== src/main.js ====", "", "export default class Board {}", "",
  ].join("\n"));
});

test("a parse check that cannot run, or fails above the first module, says so plainly", () => {
  const refused = (result, message) => assert.throws(() => builder.checkParses("export const a = 1;\n", () => result), message);
  refused({ error: new Error("spawn node ENOENT"), status: null }, /^Error: node --check did not run: spawn node ENOENT$/);
  refused({ signal: "SIGKILL", status: null }, /node --check did not run: stopped by SIGKILL$/);
  refused({ status: null }, /node --check did not run: no exit status$/);
  refused({ status: 1, stderr: "something odd" }, /^Error: node --check failed without naming a line: exit 1$/);
  assert.throws(() => buildOf({ "main.js": '// Entry.\n\nimport { class } from "herdr";\n\nexport default class Board {}\n' }), /main\.js header \(main\.js line \d+\): SyntaxError/);
});

test("the build refuses what main.js cannot hold: other import forms, imports below the top, names not exported, cycles, export * or default outside the entry", () => {
  const entry = (body) => ({ "main.js": `// Entry.\n\n${body}\nexport default class Board {}\n` });
  const refused = (files, message) => assert.throws(() => buildOf(files), message);
  refused({ ...entry('import { a as b } from "./a.js";'), "a.js": "export const a = 1;\n" }, /plain names only/);
  refused(entry('import x from "./a.js";'), /in the forms build\.mjs names/);
  refused(entry('import { a } from "node:fs";'), /only modules in src\/ and gpui-kit, gpui-base, herdr/);
  refused(entry('import { a } from "./a";'), /name the file with its \.js/);
  refused(entry('import { a } from "../a.js";'), /leaves src\//);
  refused(entry('import { a } from "./missing.js";'), /src\/missing\.js: not readable/);
  refused({ ...entry('import { a } from "./a.js";'), "a.js": "export const b = 1;\n" }, /src\/a\.js does not export a/);
  refused({ ...entry('import { a } from "./a.js";'), "a.js": 'import { b } from "./b.js";\nexport const a = 1;\n', "b.js": 'import { a } from "./a.js";\nexport const b = 1;\n' },
    /import cycle: src\/a\.js → src\/b\.js → src\/a\.js/);
  refused({ ...entry('import { a } from "./a.js";'), "a.js": 'export const a = 1;\nimport { b } from "./b.js";\n' }, /imports belong at the top/);
  refused({ ...entry('import { a } from "./a.js";'), "a.js": 'export * from "./b.js";\nexport const a = 1;\n', "b.js": "export const b = 1;\n" }, /export \* only in the entry/);
  refused({ ...entry('import { a } from "./a.js";'), "a.js": "export const a = 1;\nexport default 2;\n" }, /export default only in the entry/);
  refused({ "main.js": "export default class Board {}\r\n" }, /CRLF/);
  refused({ ...entry('import { a } from "./a.js";\nimport { b } from "./b.js";'), "a.js": "export const a = 1;\nconst same = 1;\n", "b.js": "export const b = 1;\nconst same = 2;\n" },
    /src\/b\.js \(main\.js line \d+\): SyntaxError: Identifier 'same' has already been declared$/);
  refused({ ...entry('import { a } from "./a.js";'), "a.js": "export const a = 1;\nfunction (((\n" }, /src\/a\.js \(main\.js line \d+\): SyntaxError/);
  refused({ ...entry('import { a } from "./a.js";'), "a.js": "export const a = 1;\n", "x/unused.js": "export const u = 1;\n" },
    /src\/x\/unused\.js: no module imports it/);
});

test("the build script writes main.js only when the build succeeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "board-build-"));
  try {
    writeFileSync(join(dir, "build.mjs"), readFileSync(join(modDir, "build.mjs")));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/main.js"), "export default class Board {}\nconst x = 1;\nconst x = 2;\n");
    const failed = spawnSync(process.execPath, [join(dir, "build.mjs")], { encoding: "utf8" });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /herdr-board-build: src\/main\.js \(main\.js line \d+\): SyntaxError: Identifier 'x' has already been declared/);
    assert.throws(() => readFileSync(join(dir, "main.js")), { code: "ENOENT" }, "nothing written");
    writeFileSync(join(dir, "src/main.js"), "export default class Board {}\n");
    const built = spawnSync(process.execPath, [join(dir, "build.mjs")], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
    assert.match(readFileSync(join(dir, "main.js"), "utf8"), /^\/\/ Built from src\//);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- views.json ----

test("the shipped views.json is valid: Azure teams with Sprint and Backlog, each followed by its project's pull requests, and the two GitHub views", () => {
  const { config, errors } = board.readConfig(shippedConfig());
  assert.deepEqual(errors, []);
  assert.match(config.azure.org, /^https:\/\/dev\.azure\.com\/[^/]+$/);
  const contexts = config.azure.contexts;
  assert.ok(contexts.length >= 2 && contexts.length % 2 === 0, "pairs of a team and its pull requests");
  for (let i = 0; i < contexts.length; i += 2) {
    assert.deepEqual([contexts[i].kind, contexts[i].views, contexts[i + 1].kind], ["team", ["sprint", "backlog"], "prs"]);
    assert.equal(contexts[i + 1].project, contexts[i].project, "the pull requests of the team's project");
  }
  assert.deepEqual(config.github.views.map((v) => [v.name, v.source, v.layout]), [
    ["Meine Aufgaben", "github", "board"],
    ["PRs", "github", "list"],
  ]);
  const [mine, prs] = config.github.views;
  assert.deepEqual(mine.hide, ["Backlog", "Done"]);
  assert.match(prs.sections.map((s) => s.query).join(" "), /author:@me/);
  assert.match(prs.sections.map((s) => s.query).join(" "), /review-requested:@me/);
});

test("no person-specific value of views.json appears in main.js", () => {
  const raw = JSON.parse(shippedConfig());
  const values = new Set();
  const add = (v) => typeof v === "string" && v.length > 3 && values.add(v);
  for (const v of raw.sources.github.views) {
    add(v.project?.owner);
    if (v.project?.number) values.add(`number: ${v.project.number}`);
  }
  add(raw.sources.azure.org);
  add(raw.sources.azure.org.split("/").pop());
  for (const c of raw.sources.azure.contexts) {
    add(c.team?.project ?? c.prs?.project);
    add(c.team?.team);
  }
  for (const [repo, entry] of Object.entries(raw.repos ?? {})) {
    add(repo);
    add(repo.split("/")[0]);
    Object.values(entry).forEach(add);
  }
  for (const key of ["message", "review", "agent", "machine"]) add(raw.start?.[key]);
  const code = readFileSync(mainPath, "utf8");
  assert.ok(values.size >= 8, "the config names the person's values");
  for (const value of values) assert.ok(!code.includes(value), `main.js holds ${JSON.stringify(value)}`);
});

test("readConfig reports a missing file and invalid JSON", () => {
  assert.match(board.readConfig(null).errors[0], /fehlt/);
  const bad = board.readConfig("{ views: [");
  assert.equal(bad.config, null);
  assert.match(bad.errors[0], /kein gültiges JSON/);
});

test("validateConfig keeps valid GitHub views and names each problem of the others", () => {
  const ok = { source: "github", layout: "list", sections: [{ name: "A", query: "is:pr" }] };
  const { config, errors } = board.validateConfig({
    refreshMinutes: 0,
    colour: "blue",
    start: { colour: "x", open: "window" },
    sources: { github: { views: [
      { id: "ok", name: "Ok", ...ok },
      { id: "ok", name: "Twice", ...ok },
      { name: "No id", ...ok },
      { id: "b", name: "Bad source", source: "azure", layout: "board", project: { owner: "o", number: 1 } },
      { id: "c", name: "No project", layout: "board" },
      { id: "d", name: "Bad layout", layout: "table" },
      { id: "e", name: "No sections", source: "github", layout: "list" },
      { id: "f", name: "Bad hide", source: "github", layout: "board", project: { owner: "o", number: 1 }, hide: "Done" },
      { id: "g", name: "Typo", ...ok, hidden: ["Done"] },
      { id: "h", name: "On", layout: "board", project: { owner: "o", number: 1 }, on: "server" },
      { id: "i", name: "No source", layout: "board", project: { owner: "o", number: 1 } },
    ] } },
  });
  assert.deepEqual(config.github.views.map((v) => [v.id, v.source]), [["ok", "github"], ["i", "github"]]);
  assert.equal(config.azure, null);
  assert.equal(config.refreshMinutes, 3);
  const text = errors.join("\n");
  for (const expected of [/refreshMinutes/, /„colour“ gibt es nicht/, /„start\.colour“ gibt es nicht/, /„start\.open“ ist "space" oder "tab"/,
    /„id“ ok gibt es schon/, /GitHub-Ansicht 3 \(„No id“\): „id“ fehlt/, /GitHub-Ansicht 4 \(„Bad source“\): „source“ ist hier "github" oder fehlt/,
    /„project“ braucht/, /GitHub-Ansicht 6 \(„Bad layout“\): „layout“ ist "board" oder "list"/,
    /„sections“ braucht/, /„hide“ muss eine Liste/, /GitHub-Ansicht 9 \(„Typo“\): „hidden“ gibt es nicht/, /GitHub-Ansicht 10 \(„On“\): „on“ gibt es nicht/]) {
    assert.match(text, expected);
  }
  assert.equal(errors.length, 13);
});

test("validateConfig reads sources.azure: contexts of a team, with its views, or of a project's pull requests, and names each problem", () => {
  const team = (name, more = {}) => ({ team: { project: "P", team: name }, ...more });
  const { config, errors } = board.validateConfig({ sources: { azure: { org: " https://dev.azure.com/example-org/ ", colour: 1, contexts: [
    team("T"),
    team("U", { views: ["backlog"] }),
    team("Z", { views: ["backlog", "sprint"] }),
    { prs: { project: "P" } },
    team("T"),
    { team: { project: "P" } },
    { prs: { project: "P" }, team: { project: "P", team: "V" } },
    {},
    team("W", { views: ["kanban"] }),
    team("X", { views: ["sprint", "sprint"] }),
    team("X2", { views: [] }),
    { prs: { project: "Q", repo: "r" } },
    team("Y", { extra: true }),
    "x",
  ] } } });
  assert.equal(config.azure.org, "https://dev.azure.com/example-org");
  assert.deepEqual(config.azure.contexts.map((c) => [c.id, c.kind, c.views ?? null]), [
    ["azure:team:P/T", "team", ["sprint", "backlog"]],
    ["azure:team:P/U", "team", ["backlog"]],
    ["azure:team:P/Z", "team", ["sprint", "backlog"]],
    ["azure:prs:P", "prs", null],
  ]);
  assert.deepEqual([config.azure.contexts[0].project, config.azure.contexts[0].team, config.azure.contexts[3].project], ["P", "T", "P"]);
  assert.equal(config.github, null);
  const text = errors.join("\n");
  for (const expected of [/„sources\.azure\.colour“ gibt es nicht/, /Azure-Kontext 5 \(„T“\): gibt es schon/, /Azure-Kontext 6: „team“ braucht „project“ und „team“ \(Text\)/,
    /Azure-Kontext 7 \(„V“\): braucht genau eins von „team“ und „prs“/, /Azure-Kontext 8: braucht genau eins von „team“ und „prs“/,
    /Azure-Kontext 9 \(„W“\): „views“ ist eine Liste aus "sprint" und "backlog", jede höchstens einmal/, /Azure-Kontext 10 \(„X“\): „views“ ist/,
    /Azure-Kontext 11 \(„X2“\): „views“ ist/, /Azure-Kontext 12 \(„PRs · Q“\): „prs\.repo“ gibt es nicht/, /Azure-Kontext 13 \(„Y“\): „extra“ gibt es nicht/,
    /Azure-Kontext 14: muss ein Objekt sein/]) {
    assert.match(text, expected);
  }
  assert.equal(errors.length, 11);
});

test("without a valid org or any context nothing of sources.azure is used, and the board says why", () => {
  const contexts = [{ prs: { project: "P" } }];
  const none = "„sources“ braucht mindestens eine Ansicht: in „sources.azure.contexts“ oder „sources.github.views“";
  for (const org of [undefined, "", "dev.azure.com/example-org", "http://dev.azure.com/example-org", "https://dev.azure.com", "https://dev.azure.com/o/p", 7]) {
    const { config, errors } = board.validateConfig({ sources: { azure: { org, contexts } } });
    assert.equal(config, null, String(org));
    assert.deepEqual(errors, ["„sources.azure.org“ ist die Adresse der Organisation, etwa https://dev.azure.com/<Organisation>", none], String(org));
  }
  assert.equal(board.validateConfig({ sources: { azure: { org: "https://dev.azure.com/o/", contexts } } }).config.azure.org, "https://dev.azure.com/o");
  for (const bad of [undefined, [], "x"]) {
    const { config, errors } = board.validateConfig({ sources: { azure: { org: "https://dev.azure.com/o", contexts: bad } } });
    assert.equal(config, null);
    assert.match(errors.join("\n"), /„sources\.azure\.contexts“ braucht mindestens einen Eintrag/);
  }
  assert.deepEqual(board.validateConfig({ sources: { azure: [] } }).errors, ["„sources.azure“ muss ein Objekt sein", none]);
  assert.deepEqual(board.validateConfig({ sources: { github: "x" } }).errors, ["„sources.github“ muss ein Objekt sein", none]);
  const list = { id: "a", name: "A", layout: "list", sections: [{ name: "A", query: "is:pr" }] };
  assert.deepEqual(board.validateConfig({ sources: { github: { views: [list], colour: 1 } } }).errors, ["„sources.github.colour“ gibt es nicht"]);
});

test("an old views.json with its views at the top is not read; the board says where they go now", () => {
  const old = { refreshMinutes: 3, views: [{ id: "a", name: "A", source: "github", layout: "list", sections: [{ name: "A", query: "is:pr" }] }] };
  const { config, errors } = board.validateConfig(old);
  assert.equal(config, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /alte Form: die Ansichten stehen jetzt unter „sources“, die GitHub-Ansichten in „sources\.github\.views“, Azure in „sources\.azure“ mit „org“ und „contexts“/);
  const beside = board.validateConfig({ ...old, sources: { azure: { org: "https://dev.azure.com/o", contexts: [{ prs: { project: "P" } }] } } });
  assert.deepEqual(beside.errors, [errors[0]], "beside sources too, views gets the same message");
  assert.deepEqual(beside.config.azure.contexts.map((c) => c.id), ["azure:prs:P"]);
});

test("sources must be an object of azure and github, with at least one view", () => {
  assert.deepEqual(board.validateConfig({}).errors, ["„sources“ fehlt: „sources.azure“ oder „sources.github“"]);
  assert.deepEqual(board.validateConfig({ sources: [] }).errors, ["„sources“ muss ein Objekt sein"]);
  const old = board.validateConfig({ views: [], sources: "x" }).errors;
  assert.equal(old.length, 2, "beside an old top-level views, both are said");
  assert.match(old[0], /alte Form/);
  assert.equal(old[1], "„sources“ muss ein Objekt sein");
  assert.deepEqual(board.validateConfig({ sources: {} }).errors, ["„sources“ braucht mindestens eine Ansicht: in „sources.azure.contexts“ oder „sources.github.views“"]);
  const { config, errors } = board.validateConfig({ sources: { jira: {}, azure: { org: "https://dev.azure.com/o", contexts: [{ prs: { project: "P" } }] } } });
  assert.deepEqual(errors, ["„sources.jira“ gibt es nicht (nur „azure“ und „github“)"]);
  assert.deepEqual(config.azure.contexts.map((c) => c.id), ["azure:prs:P"]);
});

test("validateConfig rejects the keys of the worktree start with a clear message", () => {
  const { config, errors } = board.validateConfig({
    start: { worktree: "{checkout}.worktrees/{branch}", branch: "{type}/{number}-{slug}", base: "main" },
    repos: { "o/r": { checkout: "~/r", worktree: "x" } },
    sources: { github: { views: [{ id: "a", name: "A", source: "github", layout: "board", project: { owner: "o", number: 1 }, startColumn: "In progress" }] } },
  });
  assert.equal(config, null);
  const text = errors.join("\n");
  for (const key of ["start.worktree", "start.branch", "start.base", "repos.o/r.worktree"]) {
    assert.match(text, new RegExp(`„${key.replace(/\./g, "\\.")}“ gibt es nicht mehr: der Start öffnet eine Sitzung im Checkout`));
  }
  assert.match(text, /„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst/);
});

test("validateConfig without any usable view gives no config", () => {
  const { config, errors } = board.validateConfig({ sources: { github: { views: [] } } });
  assert.equal(config, null);
  assert.deepEqual(errors, ["„sources.github.views“ braucht mindestens eine Ansicht", "„sources“ braucht mindestens eine Ansicht: in „sources.azure.contexts“ oder „sources.github.views“"]);
});

test("tabs carry their names from views.json: a team's, or PRs · <project>; teams of one name name their projects", () => {
  const team = (project, name) => ({ team: { project, team: name } });
  const { config } = board.validateConfig({ sources: { azure: { org: "https://dev.azure.com/o", contexts: [team("P", "T"), team("Q", "T"), team("P", "U"), { prs: { project: "P" } }] } } });
  assert.deepEqual(board.contextsOf(config, "azure").map((c) => c.name), ["T · P", "T · Q", "U", "PRs · P"]);
  assert.deepEqual(board.TEAM_VIEWS.map((v) => [v.id, board.teamViewName(v.id)]), [["sprint", "Sprint"], ["backlog", "Backlog"]]);
});

test("start settings: defaults < start < the view's start < the repo's entry", () => {
  const config = sampleConfig();
  const [mine, , other] = config.github.views;
  const s = board.startSettings(config, mine, "example/tender");
  assert.deepEqual([s.message, s.review, s.checkout, s.machine, s.open], ["/work {number}", "/look {number}", "~/src/tender", "server", "space"]);
  assert.equal(board.startSettings(config, other, "other/repo").checkout, "~/src/work");
  assert.equal(board.startSettings(config, other, "other/repo").message, "OT {number}");
  assert.equal(board.startSettings(config, other, "example/tender").checkout, "~/src/tender", "the repo's entry wins over the view's start");
  assert.equal(board.startSettings(config, mine, "other/repo").checkout, null);
});

// ---- The top bar's sources and contexts ----

test("the sources come in the toggle's order, GitHub first, each with its contexts in views.json's order", () => {
  const config = sampleConfig();
  assert.deepEqual(board.sourcesOf(config).map((s) => s.id), ["github", "azure"]);
  assert.deepEqual(board.contextsOf(config, "azure").map((c) => [c.id, c.kind, c.name]), [
    ["azure:team:Example Project/Example Team", "team", "Example Team"],
    ["azure:prs:Example Project", "prs", "PRs · Example Project"],
  ]);
  assert.deepEqual(board.contextsOf(config, "github").map((c) => [c.id, c.kind, c.name, c.view.id]), [
    ["github:mine", "view", "Mine", "mine"], ["github:prs", "view", "PRs", "prs"], ["github:other", "view", "Other", "other"],
  ]);
  assert.deepEqual(board.sourcesOf({ ...config, azure: null }).map((s) => s.id), ["github"]);
  assert.deepEqual([board.sourcesOf(null), board.contextsOf(null, "azure"), board.contextsOf(config, "jira")], [[], [], []]);
});

test("a remembered choice falls back to the first one when views.json no longer has it", () => {
  const list = [{ id: "a" }, { id: "b" }];
  assert.deepEqual([board.pick(list, "b"), board.pick(list, "gone"), board.pick(list, null), board.pick([], "a")], [list[1], list[0], list[0], null]);
  const team = { views: ["sprint", "backlog"] };
  assert.deepEqual([board.teamView(team, "backlog"), board.teamView(team, null), board.teamView({ views: ["backlog"] }, "sprint")], ["backlog", "sprint", "backlog"]);
});

test("each context shows one view, with an id and a kind; an Azure view's kind says which view it will be", () => {
  const config = sampleConfig();
  const [team, prs] = board.contextsOf(config, "azure");
  const [mine] = board.contextsOf(config, "github");
  const views = [board.viewOf(team, "sprint"), board.viewOf(team, "backlog"), board.viewOf(prs), board.viewOf(mine)];
  assert.deepEqual(views.map((v) => [v.id, board.viewKind(v)]), [
    ["azure:team:Example Project/Example Team:sprint", "azure sprint"],
    ["azure:team:Example Project/Example Team:backlog", "azure backlog"],
    ["azure:prs:Example Project", "azure prs"],
    ["mine", "github board"],
  ]);
  assert.deepEqual(views.map((v) => board.kindOf(v)), [
    { shape: "sprint" }, { shape: "backlog" }, { text: "PR-Ansicht folgt" }, { shape: "board" },
  ]);
  assert.deepEqual(board.viewsOf(config).map((v) => v.id), [
    "mine", "prs", "other", "azure:team:Example Project/Example Team:sprint", "azure:team:Example Project/Example Team:backlog", "azure:prs:Example Project",
  ]);
  assert.equal(board.kindOf({ source: "jira", layout: "board" }), null);
});

// ---- Hidden columns ----

test("hidden columns: the view's hide plus what the person hid, minus what they showed", () => {
  const view = githubView();
  assert.deepEqual([...board.hiddenColumns(view, null)], ["Backlog", "Done"]);
  assert.deepEqual([...board.hiddenColumns(view, { hide: ["Ready"], show: ["Done"] })].sort(), ["Backlog", "Ready"]);
  const later = { ...view, hide: ["Done", "In review"] };
  assert.deepEqual([...board.hiddenColumns(later, { hide: [], show: ["Backlog"] })].sort(), ["Done", "In review"], "a later edit to hide takes effect");
});

test("a stored hidden set is read only when it is lists of names", () => {
  assert.deepEqual(board.readStoredHidden({ hide: ["A"], show: [] }), { hide: ["A"], show: [] });
  for (const bad of [null, ["A"], { hide: [1], show: [] }, { hide: ["A"] }, "x"]) assert.equal(board.readStoredHidden(bad), null);
});

test("toggling stores only the difference to the view's hide; a column that takes no drops is never stored", () => {
  const view = githubView();
  const cols = casesBoard().columns;
  const col = (name) => cols.find((c) => c.name === name);
  let stored = board.toggleHidden(view, null, col("Done"));
  assert.deepEqual(stored, { hide: [], show: ["Done"] });
  stored = board.toggleHidden(view, stored, col("Done"));
  assert.deepEqual(stored, { hide: [], show: [] });
  stored = board.toggleHidden(view, stored, col("Ready"));
  assert.deepEqual(stored, { hide: ["Ready"], show: [] });
  assert.equal(board.toggleHidden(view, stored, col("Ohne Status")), stored);
});

test("names in hide that match no column are reported", () => {
  const view = { ...githubView(), hide: ["Backlog", "Doen"] };
  assert.deepEqual(board.unknownHidden(view, githubBoard().columns), ["Doen"]);
});

// ---- GitHub board ----

test("the board query leaves hidden columns out and counts them in the same request", () => {
  const args = board.githubBoardArgs(githubView(), HIDDEN);
  const value = (name) => args.find((a) => a.startsWith(`${name}=`)).slice(name.length + 1);
  assert.equal(value("filter"), 'assignee:@me -status:"Backlog","Done"');
  assert.equal(value("h0"), 'assignee:@me status:"Backlog"');
  assert.equal(value("h1"), 'assignee:@me status:"Done"');
  assert.ok(args.includes("-F") && args.includes("number=7"));
  const doc = value("query");
  assert.match(doc, /h0: items\(first: 0, query: \$h0\)/);
  assert.match(doc, /items\(first: 100, query: \$filter\)/);
  assert.match(doc, /\$h1: String!/);
  assert.doesNotMatch(board.githubBoardArgs({ ...githubView(), filter: "" }, new Set()).find((a) => a.startsWith("query=")), /\$h0/);
  assert.match(doc, /^query\([^)]*\) \{\n  viewer \{ login \}\n/, "and who gh runs as, for „nur meine“");
});

test("columns come from the project's field options, in order, with theme colors", () => {
  const b = githubBoard();
  assert.deepEqual(names(b), ["Backlog", "Ready", "In progress", "In review", "Done"]);
  assert.deepEqual(b.columns.map((c) => c.color), ["ansi2", "ansi4", "ansi3", "ansi5", "ansi11"]);
  assert.deepEqual(b.meta, { projectId: "PVT_sample", fieldId: "PVTSSF_sample", title: "Sample", url: "https://github.com/users/sample-user/projects/7" });
});

test("a board and a list carry the login gh read them as, null when GitHub did not say", () => {
  assert.equal(githubBoard().viewer, "sample-user");
  assert.equal(board.parseGithubList(json("github-list.json"), listView()).viewer, "sample-user");
  const without = json("github-board.json");
  delete without.data.viewer;
  assert.equal(board.parseGithubBoard(without, githubView(), HIDDEN).viewer, null);
  const list = json("github-list.json");
  delete list.data.viewer;
  assert.equal(board.parseGithubList(list, listView()).viewer, null);
});

test("hidden columns carry the server's count; shown ones their cards", () => {
  const b = githubBoard();
  const col = (name) => b.columns.find((c) => c.name === name);
  assert.deepEqual([col("Backlog").hidden, col("Backlog").count, col("Backlog").cards.length], [true, 265, 0]);
  assert.deepEqual([col("Done").hidden, col("Done").count], [true, 957]);
  assert.deepEqual(numbersIn(b, "In progress"), [3000, 3001, 3003]);
  assert.deepEqual(numbersIn(b, "Ready"), [3004, 3005, 3007]);
  assert.equal(col("In progress").count, 3);
  assert.equal(b.limited, false);
});

test("a card carries repo, number, title, labels, assignees, author, parent and sub-issues", () => {
  const b = githubBoard();
  const epic = board.findCard(b, "PVTI_rec1").card;
  assert.deepEqual([epic.repo, epic.repoShort, epic.labels, epic.assignees, epic.author, epic.sub],
    ["example/tender", "tender", ["enhancement", "area:architecture", "epic"], ["sample-user"], "sample-contributor", { total: 22, done: 15 }]);
  assert.equal(board.findCard(b, "PVTI_rec2").card.parent, 3002);
  const cases = casesBoard();
  assert.deepEqual(["PVTI_case1", "PVTI_case2"].map((k) => board.findCard(cases, k).card.author), ["sample-contributor", "sample-contributor"], "a pull request's author, a draft's creator");
  const doc = board.githubBoardArgs(githubView(), HIDDEN).find((a) => a.startsWith("query="));
  assert.equal(doc.match(/author \{ login \}/g).length, 2, "asked of issues and pull requests");
  assert.match(doc, /DraftIssue \{ title creator \{ login \}/);
});

test("items without a status, or in an option that is gone, share a column that takes no drops", () => {
  const b = casesBoard();
  const none = b.columns[0];
  assert.deepEqual([none.name, none.target], ["Ohne Status", false]);
  assert.deepEqual(none.cards.map((c) => [c.kind, c.title]), [["draft", "Draft: sort the release notes"], ["issue", "chore: an item in an option that no longer exists"]]);
  assert.deepEqual(board.findCard(b, "PVTI_case3").card.title, "(kein Zugriff)");
  const pr = board.findCard(b, "PVTI_case1").card;
  assert.deepEqual([pr.kind, pr.branch, pr.number], ["pr", "feat/3000-retry-once", 3050]);
});

test("parseGithubBoard says when the owner, project or field is missing", () => {
  const view = githubView();
  assert.throws(() => board.parseGithubBoard({ data: { repositoryOwner: null } }, view, new Set()), /kennt „sample-user“ nicht/);
  assert.throws(() => board.parseGithubBoard({ data: { repositoryOwner: { projectV2: null } } }, view, new Set()), /Projekt 7 von sample-user nicht gefunden/);
  const noField = json("github-board.json");
  noField.data.repositoryOwner.projectV2.field = null;
  assert.throws(() => board.parseGithubBoard(noField, view, new Set()), /kein Auswahlfeld „Status“/);
});

test("a part missing from GitHub's answer is explained by the error at its path", () => {
  const view = githubView();
  const parse = (data, errors) => () => board.parseGithubBoard({ data }, view, HIDDEN, errors);
  const notFound = json("github-not-found.json");
  assert.throws(() => board.parseGithubBoard(notFound, view, HIDDEN, notFound.errors), { message: "Projekt 7 von sample-user nicht gefunden – project.number in views.json prüfen" });
  const saml = "Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.";
  assert.throws(parse({ repositoryOwner: { projectV2: null } }, [{ type: "FORBIDDEN", path: ["repositoryOwner", "projectV2"], message: saml }]),
    { message: `Projekt 7 von sample-user: ${saml}` });
  assert.throws(parse({ repositoryOwner: { projectV2: null } }, [{ type: "NOT_FOUND", path: ["viewer", "repository"], message: "x" }]),
    { message: "Projekt 7 von sample-user nicht gefunden oder kein Zugriff" }, "NOT_FOUND counts only at the project's path");
  const project = { ...json("github-board.json").data.repositoryOwner.projectV2, items: null };
  assert.throws(parse({ repositoryOwner: { projectV2: project } }, [{ type: "FORBIDDEN", path: ["repositoryOwner", "projectV2", "items", "nodes", 0], message: "no access to a repository" }]),
    { message: "Projekt „Sample“: no access to a repository" });
  assert.throws(parse({ repositoryOwner: { projectV2: project } }, []), { message: "Projekt „Sample“ lieferte keine Einträge" });
  const noField = { ...json("github-board.json").data.repositoryOwner.projectV2, field: null };
  assert.throws(parse({ repositoryOwner: { projectV2: noField } }, [{ type: "FORBIDDEN", path: ["repositoryOwner", "projectV2", "field"], message: "field hidden" }]),
    { message: "Projekt „Sample“: field hidden" });
});

test("a board with more items than one page says it is cut", () => {
  const data = json("github-board.json");
  data.data.repositoryOwner.projectV2.items.pageInfo.hasNextPage = true;
  data.data.repositoryOwner.projectV2.items.totalCount = 290;
  const b = board.parseGithubBoard(data, githubView(), HIDDEN);
  assert.deepEqual([b.limited, b.total], [true, 290]);
});

// ---- gh's answers ----

test("gh exiting 1 with an error next to data gives the data and the error to the parser", () => {
  const r = { code: 1, stdout: fixture("github-not-found.json"), stderr: "gh: Could not resolve to a ProjectV2 with the number 99.\n" };
  const got = board.readGh(r);
  assert.deepEqual(got.json.data, { repositoryOwner: { projectV2: null } });
  assert.deepEqual(got.errors.map((e) => e.type), ["NOT_FOUND"]);
  assert.throws(() => board.readGh({ code: 1, stdout: '{"errors":[{"message":"Something broke"}]}', stderr: "" }), { message: "Something broke" });
});

test("gh exiting 1 with data and other errors gives the data and the errors as warnings", () => {
  const partial = { data: { s0: { issueCount: 0, nodes: [] } }, errors: [{ type: "FORBIDDEN", message: "Resource not accessible by integration" }] };
  const got = board.readGh({ code: 1, stdout: JSON.stringify(partial), stderr: "gh: Resource not accessible by integration" });
  assert.deepEqual(got.json.data, partial.data);
  assert.deepEqual(got.warnings, ["Resource not accessible by integration"]);
  assert.deepEqual(board.readGh({ code: 0, stdout: fixture("github-move.json"), stderr: "" }).warnings, []);
});

// gh's output for a failed DNS lookup (internal/ghcmd/cmd.go printError).
const GH_DNS = "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n";
// GitHub's answer when it ran out of time on a GraphQL request, and gh's line for it.
const GH_SERVER_TIMEOUT = "Something went wrong while executing your query. This may be the result of a timeout, or it could be a GitHub bug. Please include `0400:3A1B:1C2D3E:4F5061:63A0B1C2` when reporting this issue.";

test("gh's failures become messages: not signed in, missing scope, rate limit, network, others without gh's prefix", () => {
  const fail = (r) => {
    try {
      board.readGh(r);
    } catch (e) {
      return e;
    }
    return assert.fail("no error");
  };
  assert.match(fail({ code: 4, stdout: "", stderr: fixture("gh-no-login.txt") }).message, /nicht angemeldet: gh auth login/);
  assert.match(fail({ code: 1, stdout: fixture("github-scope-error.json"), stderr: "gh: Your token has not been granted the required scopes" }).message, /Scope „project“/);
  assert.match(fail({ code: 1, stdout: fixture("github-rate-limited.json"), stderr: "" }).message, /Ratenlimit/);
  assert.match(fail({ code: 1, stdout: "", stderr: "HTTP 403: API rate limit exceeded for user" }).message, /Ratenlimit/);
  // gh prints a transport error as is, and a failed DNS lookup in two lines of its own.
  for (const net of [GH_DNS, "Post \"https://api.github.com/graphql\": dial tcp 140.82.121.6:443: connect: connection refused",
    "Post \"https://api.github.com/graphql\": read tcp 10.0.0.2:5000->140.82.121.6:443: read: connection reset by peer"]) {
    assert.match(fail({ code: 1, stdout: "", stderr: net }).message, /^GitHub nicht erreichbar: /, net);
  }
  assert.equal(fail({ code: 1, stdout: "", stderr: GH_DNS }).message, "GitHub nicht erreichbar: error connecting to api.github.com");
  assert.equal(fail({ code: 1, stdout: "", stderr: "gh: the connection to a field was reshaped" }).message, "the connection to a field was reshaped");
  assert.equal(fail({ code: 2, stdout: "", stderr: "" }).message, "gh endete mit 2");
  const garbled = fail({ code: 0, stdout: "<html>", stderr: "" });
  assert.deepEqual([garbled.unclear, garbled.message], [false, "gh antwortete ohne lesbares JSON"]);
});

test("on a write, a GraphQL error with a type or code is a refusal with its message, the mutation's own first; one without either is unclear", () => {
  const write = { write: true, path: board.MOVE_PATH };
  const answer = (errors) => ({ code: 1, stdout: JSON.stringify({ data: null, errors }), stderr: `gh: ${errors.map((e) => e.message).join("\n")}` });
  const refused = { code: 1, stdout: '{"data":{"updateProjectV2ItemFieldValue":null},"errors":[{"type":"FORBIDDEN","path":["updateProjectV2ItemFieldValue"],"locations":[{"line":2,"column":3}],"message":"Resource not accessible by integration"}]}', stderr: "gh: Resource not accessible by integration" };
  assert.throws(() => board.readGh(refused, write), (e) => !e.unclear && e.message === "Resource not accessible by integration");
  const three = answer([{ type: "FORBIDDEN", message: "first", path: ["a"] }, { type: "UNPROCESSABLE", message: "mine", path: board.MOVE_PATH }, { type: "NOT_FOUND", message: "third", path: ["b"] }]);
  assert.throws(() => board.readGh(three, write), (e) => !e.unclear && e.message === "mine");
  assert.throws(() => board.readGh(answer([{ message: "by code", extensions: { code: "argumentLiteralsIncompatible" } }]), write), (e) => !e.unclear);
  assert.throws(() => board.readGh(answer([{ message: GH_SERVER_TIMEOUT }]), write), (e) => e.unclear && e.message === `Ergebnis unklar: ${GH_SERVER_TIMEOUT}`);
  assert.throws(() => board.readGh(answer([{ type: "INTERNAL", message: GH_SERVER_TIMEOUT }]), write), (e) => e.unclear, "a server timeout even with a type");
  assert.throws(() => board.readGh(answer([{ message: "Something else" }]), write), (e) => e.unclear, "an error without type or code");
  assert.throws(() => board.readGh(answer([{ message: "" }]), write), { message: "Ergebnis unklar: GitHub meldete einen Fehler ohne Text" });
  assert.throws(() => board.readGh(answer([{ type: "FORBIDDEN", message: "" }]), write), (e) => !e.unclear && e.message === "GitHub hat die Änderung abgelehnt");
});

test("on a write, a failure that may have reached GitHub is unclear; one that never left, or that GitHub refused (4xx), is a refusal", () => {
  const error = (stderr, code = 1) => {
    try {
      board.readGh({ code, stdout: "", stderr }, { write: true });
    } catch (e) {
      return e;
    }
    return assert.fail("no error");
  };
  const outcome = (stderr, code = 1) => (error(stderr, code).unclear ? "unclear" : "refused");
  const post = 'Post "https://api.github.com/graphql": ';
  for (const err of [`${post}read tcp 10.0.0.2:5000->140.82.121.6:443: read: connection reset by peer`, `${post}net/http: i/o timeout`,
    `${post}net/http: request canceled (Client.Timeout exceeded while awaiting headers)`, `${post}unexpected EOF`,
    `${post}http2: client connection lost`, `${post}http2: server sent GOAWAY and closed the connection`, `${post}stream error: stream ID 3; INTERNAL_ERROR`,
    `${post}context deadline exceeded`, "gh: HTTP 502", "gh: HTTP 504",
    "gh: We couldn't respond to your request in time. Sorry about that. Please try resubmitting your request and contact us if the problem persists. (HTTP 504)",
    `gh: ${GH_SERVER_TIMEOUT}`, "some failure gh does not explain", ""]) {
    assert.equal(outcome(err), "unclear", err);
  }
  for (const err of [GH_DNS, `${post}dial tcp 140.82.121.6:443: connect: connection refused`,
    `${post}dial tcp 140.82.121.6:443: i/o timeout`, "gh: Validation Failed (HTTP 422)", "gh: Not Found (HTTP 404)"]) {
    assert.equal(outcome(err), "refused", err);
  }
  for (const err of ["connection reset by peer", "i/o timeout", "Client.Timeout exceeded", "unexpected EOF", "http2: client connection lost",
    "http2: server sent GOAWAY", "stream error: stream ID 3", "context deadline exceeded"]) {
    assert.equal(error(`${post}${err}`).message, `Ergebnis unklar: GitHub nicht erreichbar: ${post}${err}`, err);
  }
  assert.equal(error(`gh: ${GH_SERVER_TIMEOUT}`).message, `Ergebnis unklar: GitHub antwortete mit ${GH_SERVER_TIMEOUT}`);
  assert.equal(outcome("", 0), "unclear", "an unreadable answer to a write");
  assert.throws(() => board.readGh({ code: 1, stdout: "", stderr: "gh: HTTP 502" }), (e) => !e.unclear && e.message === "GitHub antwortete mit HTTP 502");
});

// ---- Status changes ----

test("a GitHub status change is one GraphQL mutation with the project, item, field and option ids", () => {
  const b = githubBoard();
  const card = board.findCard(b, "PVTI_rec4").card;
  const args = board.githubMoveArgs(b.meta, card, b.columns.find((c) => c.name === "In progress"));
  assert.deepEqual(args.slice(0, 2), ["api", "graphql"]);
  assert.ok(args.includes(`query=${board.MOVE_MUTATION}`));
  assert.match(board.MOVE_MUTATION, /updateProjectV2ItemFieldValue/);
  assert.deepEqual(args.filter((a, i) => args[i - 1] === "-f" && !a.startsWith("query=")),
    ["project=PVT_sample", "item=PVTI_rec4", "field=PVTSSF_sample", "option=opt-in-progress"]);
});

test("a mutation's answer must name the item it changed, else the outcome is unclear", () => {
  const card = { itemId: "PVTI_sample2" };
  board.checkMoveResult(json("github-move.json"), card);
  assert.throws(() => board.checkMoveResult({}, card), (e) => e.unclear && /Ergebnis unklar/.test(e.message));
});

test("moving a card changes its column and the counts, and rollback restores them", () => {
  const before = githubBoard();
  const move = { key: "PVTI_rec4", from: "opt-ready", to: "opt-in-progress" };
  const moved = board.moveCard(before, move.key, move.to);
  assert.deepEqual(numbersIn(moved, "In progress"), [3000, 3001, 3003, 3004]);
  assert.deepEqual([moved.columns[1].count, moved.columns[2].count], [2, 4]);
  assert.equal(board.findCard(moved, move.key).card.column, "opt-in-progress");
  assert.equal(before.columns[1].count, 3, "the board moved from stays as it was");
  const back = board.rollback(moved, move);
  assert.deepEqual([back.columns[1].count, back.columns[2].count], [3, 3]);
  assert.equal(board.rollback(board.moveCard(moved, move.key, "opt-in-review"), move).columns[3].cards[0].key, move.key,
    "a rollback leaves a card that moved on since");
});

test("a card moved into a hidden column adds to its count and can come back", () => {
  const moved = board.moveCard(githubBoard(), "PVTI_rec1", "opt-done");
  assert.equal(moved.columns.find((c) => c.name === "Done").count, 958);
  assert.equal(board.shownColumns(moved, "").some((c) => c.name === "Done"), false, "and stays out of the columns shown");
  const back = board.moveCard(moved, "PVTI_rec1", "opt-in-progress");
  assert.equal(back.columns.find((c) => c.name === "Done").count, 957);
});

test("moving to an unknown column, an unknown card or the same column changes nothing", () => {
  const b = githubBoard();
  assert.equal(board.moveCard(b, "PVTI_rec4", "nope"), b);
  assert.equal(board.moveCard(b, "nope", "opt-done"), b);
  assert.equal(board.moveCard(b, "PVTI_rec4", "opt-ready"), b);
});

test("a move stays laid over refreshes until it is confirmed and a refresh started after that", () => {
  const unconfirmed = { key: "a", to: "x", at: 100, confirmedAt: null };
  const confirmedEarly = { key: "b", to: "x", at: 100, confirmedAt: 150 };
  const confirmedLate = { key: "c", to: "x", at: 100, confirmedAt: 250 };
  assert.deepEqual(board.pendingMoves([unconfirmed, confirmedEarly, confirmedLate], 200), [unconfirmed, confirmedLate]);
  const b = board.applyMoves(githubBoard(), [{ key: "PVTI_rec4", to: "opt-in-review" }, { key: "PVTI_rec1", to: "opt-ready" }]);
  assert.equal(board.findCard(b, "PVTI_rec4").column.name, "In review");
  assert.equal(board.findCard(b, "PVTI_rec1").column.name, "Ready");
});

// A board whose meta names the states of each type: a task may go to To
// Do, In Progress and Done, a bug to New, Committed and Done (hidden).
function typedBoard() {
  const card = (key, type, column) => ({ key, source: "azure", number: Number(key.slice(1)), type, title: key, labels: [], assignees: [], column });
  const col = (name, cards, hidden = false) => ({ id: name, name, color: "muted", hidden, count: hidden ? null : cards.length, target: true, cards });
  return {
    shape: "board",
    meta: { types: { Task: ["To Do", "In Progress", "Done"], Bug: ["New", "Committed", "Done"] } },
    columns: [col("To Do", []), col("New", [card("w102", "Bug", "New")]), col("In Progress", [card("w101", "Task", "In Progress")]), col("Committed", []), col("Done", [], true)],
    total: 2,
    limited: false,
  };
}

test("where a board names its types' states, a card can only go to its own type's", () => {
  const b = typedBoard();
  const task = board.findCard(b, "w101").card;
  assert.deepEqual(board.targetsFor(b, task).map((c) => c.name), ["To Do", "In Progress", "Done"]);
  assert.equal(board.canDrop(b, task, b.columns.find((c) => c.name === "Committed")), false);
  const cases = casesBoard();
  assert.equal(board.canDrop(cases, board.findCard(cases, "PVTI_case1").card, cases.columns[0]), false, "never into Ohne Status");
});

test("H/L step to the next column the card may go to, hidden ones included", () => {
  const b = typedBoard();
  assert.equal(board.stepTarget(b, "w101", 1)?.name, "Done", "Committed is skipped, the hidden Done taken");
  assert.equal(board.stepTarget(b, "w101", -1)?.name, "To Do", "New is skipped");
  assert.equal(board.stepTarget(b, "w102", -1), null, "nothing left of the first state");
  const gh = casesBoard();
  assert.equal(board.stepTarget(gh, "PVTI_case3", -1)?.name, "Backlog", "the hidden Backlog taken");
});

// ---- Filter and keyboard ----

test("the filter keeps cards holding every word, in title, key, repo, labels or assignee", () => {
  const all = (text) => board.shownColumns(githubBoard(), text).flatMap((c) => c.shown.map((x) => x.number));
  assert.deepEqual(all("#3004 epic"), []);
  assert.deepEqual(all("tender#3004"), [3004]);
  assert.deepEqual(all("BUG input"), [3007]);
  assert.deepEqual(all("EPIC area:arch"), [3000]);
  assert.equal(all("").length, 6);
});

test("„nur meine“ keeps the items assigned to, opened by or asking a review of the login the data was read as, with the filter", () => {
  const data = json("github-board.json");
  const nodes = data.data.repositoryOwner.projectV2.items.nodes;
  nodes[0].content.assignees.nodes = [{ login: "someone-else" }];
  nodes[1].content.assignees.nodes = [];
  nodes[2].content.assignees.nodes = [];
  nodes[2].content.author.login = "sample-user";
  const b = board.parseGithubBoard(data, githubView(), HIDDEN);
  const all = (text, mine) => board.shownColumns(b, text, mine).flatMap((c) => c.shown.map((x) => x.number));
  assert.deepEqual(all("", true), [3004, 3005, 3007, 3003], "not 3000 (someone else's) nor 3001 (no one's); 3003 unassigned but opened by sample-user");
  assert.deepEqual(all("BUG input", true), [3007], "with the filter");
  assert.deepEqual(all("", false).length, 6);
  const pr = { assignees: [], author: "sample-user" };
  assert.deepEqual([board.isMine(pr, "sample-user"), board.isMine(pr, "other"), board.isMine({ assignees: ["x"] }, "x"), board.isMine({ assigneeLogins: ["x"] }, "x"), board.isMine({}, "x")], [true, false, false, true, false]);
  assert.equal(board.isMine({ assignees: [null], author: null }, null), false, "without a login nothing is one's own");
  assert.deepEqual([board.isMine({ reviewers: ["x"] }, "x"), board.isMine({ reviewers: ["y"] }, "x")], [true, false], "a reviewer asked for");
  assert.deepEqual([board.shows(pr, "", true, "sample-user"), board.shows(pr, "nothing", true, "sample-user"), board.shows(pr, "", true, null), board.shows(pr, "", false, null)],
    [true, false, false, true]);
});

test("j/k move within a column, h/l across the columns shown, skipping hidden ones, keeping the row", () => {
  const cols = board.shownColumns(githubBoard(), "");
  // Backlog and Done are hidden.
  assert.deepEqual(cols.map((c) => c.name), ["Ready", "In progress", "In review"]);
  let sel = { col: 1, key: "PVTI_rec1" };
  sel = board.navigate(cols, sel, "down");
  assert.deepEqual(sel, { col: 1, key: "PVTI_rec2" });
  sel = board.navigate(cols, board.navigate(cols, sel, "down"), "down");
  assert.deepEqual(sel, { col: 1, key: "PVTI_rec3" }, "stops at the last card");
  assert.deepEqual(board.navigate(cols, sel, "left"), { col: 0, key: "PVTI_rec6" });
  assert.deepEqual(board.navigate(cols, { col: 0, key: "PVTI_rec4" }, "left"), { col: 0, key: "PVTI_rec4" }, "the hidden Backlog is skipped");
  assert.deepEqual(board.navigate(cols, { col: 1, key: "PVTI_rec1" }, "right"), { col: 2, key: null }, "an empty column takes the selection without a card");
  assert.deepEqual(board.navigate(cols, { col: 2, key: null }, "up"), { col: 2, key: null });
  assert.deepEqual(board.navigate(cols, { col: 2, key: null }, "right"), { col: 2, key: null }, "the hidden Done is skipped");
  assert.deepEqual(board.navigate([], null, "down"), { col: 0, key: null });
  const list = [{ shown: [{ key: "a" }, { key: "b" }] }];
  assert.deepEqual(board.navigate(list, { col: 0, key: "a" }, "down"), { col: 0, key: "b" }, "a list is one column");
});

test("after the columns change the selection keeps its column by id, else the column now at its index or the last, on its card or the card in its row", () => {
  const col = (id, ...keys) => ({ id, shown: keys.map((key) => ({ key })) });
  const before = [col("a", "a1"), col("b", "b1", "b2", "b3"), col("c")];
  assert.deepEqual(board.selectionInColumns(before, [col("z"), ...before], { col: 1, key: "b2" }), { col: 2, key: "b2" }, "a column shown before it");
  assert.deepEqual(board.selectionInColumns(before, [col("a", "a1"), col("b", "b1", "b3"), col("c")], { col: 1, key: "b2" }), { col: 1, key: "b3" }, "its card gone: the card in its row");
  assert.deepEqual(board.selectionInColumns(before, [col("a", "a1"), col("b", "b1"), col("c")], { col: 1, key: "b3" }), { col: 1, key: "b1" }, "past the end: the last card");
  assert.deepEqual(board.selectionInColumns(before, [col("a", "a1"), col("c", "c1", "c2")], { col: 1, key: "b2" }), { col: 1, key: "c2" }, "its column hidden: the one at its index, same row");
  assert.deepEqual(board.selectionInColumns(before, [col("a", "a1")], { col: 2, key: null }), { col: 0, key: "a1" }, "past the last column: the last");
  assert.deepEqual(board.selectionInColumns(before, [col("a"), col("c")], { col: 0, key: "a1" }), { col: 0, key: null }, "an empty column");
  assert.deepEqual(board.selectionInColumns(before, [], { col: 1, key: "b1" }), { col: 0, key: null }, "no column");
  assert.deepEqual(board.selectionInColumns(before, before.slice(1), { col: 1, key: "b1" }), { col: 0, key: "b1" }, "a column hidden before it");
  assert.deepEqual(board.selectionInColumns([], [col("a", "a1")], null), { col: 0, key: "a1" }, "no selection before");
  assert.deepEqual(board.selectionInColumns(before, [col("a", "a1"), col("b", "b2", "b3", "b4")], { col: 1, key: "b3" }), { col: 1, key: "b3" },
    "its card in another row: the card, not the row");
});

test("after new data the selection follows its card, else falls to the first card", () => {
  const cols = board.shownColumns(githubBoard(), "");
  assert.deepEqual(board.selectionAfter(cols, { col: 2, key: "PVTI_rec4" }), { col: 0, key: "PVTI_rec4" });
  assert.deepEqual(board.selectionAfter(cols, { col: 1, key: "gone" }), { col: 0, key: "PVTI_rec4" });
  assert.deepEqual(board.selectionAfter(cols, { col: 2, key: null }), { col: 2, key: null }, "a selected empty column stays");
  assert.deepEqual(board.selectionAfter([], { col: 3, key: "x" }), { col: 0, key: null });
});

// ---- PR list ----

test("the PR list is one GraphQL request with one search per section", () => {
  const args = board.githubListArgs(listView());
  assert.equal(args.filter((a) => a.startsWith("query=")).length, 1);
  assert.match(args.find((a) => a.startsWith("query=")), /s0: search\(type: ISSUE, first: 50, query: \$q0\)[\s\S]*s1: search/);
  assert.ok(args.includes("q0=is:pr review-requested:@me"));
  assert.ok(args.includes("q1=is:pr author:@me"));
  assert.match(args.find((a) => a.startsWith("query=")), /^query=query\([^)]*\) \{\nviewer \{ login \}\n/, "and who gh runs as");
  assert.match(args.find((a) => a.startsWith("query=")), /assignees\(first: 10\) \{ nodes \{ login name \} \}\s+reviewRequests\(first: 20\) \{ nodes \{ requestedReviewer \{ \.\.\. on User \{ login \} \} \} \}/,
    "and each pull request's assignees and the people asked to review it");
});

test("PR sections hold their rows once, with checks, review state and branch", () => {
  const list = board.parseGithubList(json("github-list.json"), listView());
  assert.deepEqual(list.sections.map((s) => [s.name, s.count, s.rows.map((r) => r.number)]), [["Review", 1, [2820]], ["Mine", 4, [1921, 808, 77]]]);
  assert.deepEqual(list.sections.flatMap((s) => s.rows.map((r) => [r.number, r.assigneeLogins, r.reviewers])), [
    [2820, [], ["sample-user"]], [1921, [], []], [808, ["sample-user"], []], [77, [], []],
  ], "a team's review request names no one");
  const [review] = list.sections[0].rows;
  assert.deepEqual([review.repoShort, review.author, review.review, review.branch, review.checks.short, review.checks.text],
    ["tender", "sample-contributor", "noch kein Review", "pr/summary-card", "✓ 15", "15 bestanden · 3 übersprungen"]);
  const [release, draft, failing] = list.sections[1].rows;
  assert.deepEqual([release.review, release.checks.state, release.checks.short], ["", "pending", "◷ 2"]);
  assert.deepEqual([draft.review, draft.checks.state, draft.checks.text], ["Entwurf", "none", "keine Checks"]);
  assert.deepEqual([failing.review, failing.checks.state, failing.checks.text], ["Änderungen gewünscht", "failed", "3 bestanden · 2 fehlgeschlagen"]);
});

test("a search result that is no pull request is counted, not dropped silently", () => {
  const data = json("github-list.json");
  data.data.s0.nodes.push({}, {});
  const list = board.parseGithubList(data, listView());
  assert.equal(list.sections[0].skipped, 2);
  assert.equal(list.sections[1].skipped, 0);
});

test("a section missing from GitHub's answer is an error, explained by the error at its alias", () => {
  assert.throws(() => board.parseGithubList({ data: { s0: { issueCount: 0, nodes: [] } } }, listView()), /Die Suche „is:pr author:@me“ fehlt in GitHubs Antwort/);
  assert.throws(() => board.parseGithubList({ data: { s0: { issueCount: 0, nodes: [] }, s1: null } }, listView(), [{ path: ["s1"], message: "Invalid search query" }]),
    { message: "Die Suche „is:pr author:@me“: Invalid search query" });
});

// ---- Tools that cannot run ----

test("a tool that cannot run, or runs out of time, says so; only a missing az is marked unavailable, for the Azure views", () => {
  const missing = board.execRejection("az", notRun("az"), 60000, null);
  assert.deepEqual([missing.message, missing.unavailable], ["az ist nicht installiert", true]);
  const gh = board.execRejection("gh", notThere("gh"), 30000, "server");
  assert.deepEqual([gh.message, gh.unavailable], ["gh auf server ist nicht installiert", false]);
  const late = board.execRejection("gh", stopped("/opt/bin/gh"), 30000, null);
  assert.deepEqual([late.message, late.unclear], ["gh antwortete nicht in 30 s", false]);
  assert.equal(board.execRejection("az", stopped("az", 60, "server"), 60000, "server").message, "az auf server antwortete nicht in 60 s");
  assert.equal(board.execRejection("gh", new Error("operation timed out"), 30000, null).message, "gh antwortete nicht in 30 s", "other words for a timeout");
  const away = board.execRejection("az", new Error("machine server is unreachable"), 60000, "server");
  assert.deepEqual([away.message, away.unavailable], ["az auf server ließ sich nicht starten: machine server is unreachable", false]);
  assert.equal(board.execRejection("gh", new Error("boom"), 30000, null).message, "gh ließ sich nicht starten: boom");
});

test("on a write, a timeout or a lost remote call is unclear; a missing program or a local start failure is a refusal", () => {
  const write = { write: true };
  const late = board.execRejection("gh", stopped("/opt/bin/gh"), 30000, null, write);
  assert.deepEqual([late.unclear, late.message], [true, "Ergebnis unklar: gh antwortete nicht in 30 s"]);
  const lateThere = board.execRejection("az", stopped("az", 60, "server"), 60000, "server", write);
  assert.deepEqual([lateThere.unclear, lateThere.message], [true, "Ergebnis unklar: az auf server antwortete nicht in 60 s"]);
  const lost = board.execRejection("az", new Error("connection to server lost"), 60000, "server", write);
  assert.deepEqual([lost.unclear, lost.message], [true, "Ergebnis unklar: az auf server: connection to server lost"]);
  assert.equal(board.execRejection("az", notThere("az"), 60000, "server", write).unclear, false);
  assert.equal(board.execRejection("gh", new Error("boom"), 30000, null, write).unclear, false);
});

// ---- Finding gh and az ----

// What a shell prints around the answer: an interactive bash's colour banner
// on stdout (as on the Deck).
const BANNER = "\u001b[40m   \u001b[41m   \u001b[m\n  Welcome back\n";
// What the path script prints: the shell it asked and the person's own, the
// shell's banner, the answer, and `after` it.
const answered = (answer, { after = "", asked = "/bin/bash", own = asked } = {}) => ({
  code: 0,
  stdout: `${board.SHELL_START}${asked}\t${own}${board.SHELL_END}${BANNER}${board.WHICH_START}${answer}\n${board.WHICH_END}${after}`,
  stderr: "",
});

// A run (herdr's exec) that answers each call from `answers` in turn (the
// last one again and again) and records it.
function fakeRun(...answers) {
  const calls = [];
  const run = async (program, args, options) => {
    calls.push({ program, args, options });
    const a = answers.length > 1 ? answers.shift() : answers[0];
    if (a instanceof Error) throw a;
    return a;
  };
  return { run, calls };
}

test("the shell's answer and the shell asked are read between their markers, whatever its startup files print around them", () => {
  assert.equal(board.readWhich(answered("/home/linuxbrew/.linuxbrew/bin/gh", { after: "\nlogout\n" }).stdout), "/home/linuxbrew/.linuxbrew/bin/gh");
  assert.equal(board.readWhich(`${board.WHICH_START}/a/gh${board.WHICH_END}`), "/a/gh");
  assert.equal(board.readWhich(answered("").stdout), "", "found nothing");
  assert.equal(board.readWhich(`${BANNER}${board.WHICH_START}`), null, "cut off before the end marker");
  assert.equal(board.readWhich(`${board.WHICH_END}${board.WHICH_START}`), null, "no start before the end");
  assert.equal(board.readWhich(BANNER), null);
  assert.deepEqual(board.readShell(answered("", { asked: "/bin/sh", own: "/usr/bin/nu" }).stdout), { asked: "/bin/sh", own: "/usr/bin/nu" });
  assert.deepEqual(board.readShell(`${board.SHELL_START}/bin/sh\t${board.SHELL_END}`), { asked: "/bin/sh", own: "" });
  assert.equal(board.readShell(BANNER), null);
});

test("a program's path is asked of the shell: interactive here, also login on another machine", async () => {
  const here = fakeRun(answered("/home/linuxbrew/.linuxbrew/bin/gh"));
  assert.deepEqual(await board.findTool(here.run, "gh", null, 30000), { program: "/home/linuxbrew/.linuxbrew/bin/gh", bare: false });
  assert.deepEqual(here.calls, [{ program: "sh", args: ["-c", board.WHICH_SCRIPT, "board-which", "gh", ""], options: { on: null, timeout: 30000 } }]);
  const there = fakeRun(answered("/usr/bin/az"));
  assert.deepEqual(await board.findTool(there.run, "az", "server", 60000), { program: "/usr/bin/az", bare: false });
  assert.deepEqual(there.calls[0].args.slice(-2), ["az", "login"]);
  assert.deepEqual(there.calls[0].options, { on: "server", timeout: 60000 });
});

test("a program the shell does not find is not installed; only a missing az is marked unavailable, for the Azure views", async () => {
  const gh = await board.findTool(fakeRun(answered("")).run, "gh", null, 30000).catch((e) => e);
  assert.deepEqual([gh instanceof board.BoardError, gh.message, gh.unavailable], [true, "gh ist nicht installiert", false]);
  const az = await board.findTool(fakeRun(answered("")).run, "az", "server", 60000).catch((e) => e);
  assert.deepEqual([az.message, az.unavailable], ["az auf server ist nicht installiert", true]);
});

test("not installed names /bin/sh when it was asked in place of the person's shell", async () => {
  const find = (answer) => board.findTool(fakeRun(answer).run, "gh", null, 30000).catch((e) => e.message);
  assert.equal(await find(answered("", { asked: "/bin/sh", own: "/usr/bin/nu" })), "gh ist nicht installiert (gefragt: /bin/sh statt nu)");
  assert.equal(await find(answered("", { asked: "/bin/sh", own: "" })), "gh ist nicht installiert (gefragt: /bin/sh, keine Shell eingetragen)");
  assert.equal(await find(answered("", { asked: "/bin/sh", own: "/bin/sh" })), "gh ist nicht installiert", "sh asked as itself");
});

// What an interactive bash without a terminal prints on stderr at every start.
const JOB_NOISE = "bash: cannot set terminal process group (-1): Inappropriate ioctl for device\nbash: no job control in this shell\n";

test("a shell that cannot be asked, or gives no answer or no path, says so, not that the program is missing", async () => {
  const fail = (answer, tool = "az", on = "server") => board.findTool(fakeRun(answer).run, tool, on, 60000).catch((e) => e);
  const away = await fail(new Error("machine server is unreachable"));
  assert.deepEqual([away instanceof board.BoardError, away.message, away.unavailable], [true, "Pfad von az auf server nicht ermittelt: machine server is unreachable", false]);
  assert.equal((await fail(stopped("sh", 60, "server"))).message, "Pfad von az auf server nicht ermittelt: die Shell antwortete nicht in 60 s");
  const asked = `${board.SHELL_START}/bin/bash\t/bin/bash${board.SHELL_END}${BANNER}`;
  const stderr = `${JOB_NOISE}bash: /home/me/.bashrc: line 3: brew: command not found\nbash: line 1: exec: zsh: not found\n`;
  const silent = await fail({ code: 1, stdout: asked, stderr }, "gh", null);
  assert.deepEqual([silent.message, silent.unavailable], ["Pfad von gh nicht ermittelt: /bin/bash endete mit 1 ohne Antwort (bash: line 1: exec: zsh: not found)", false]);
  const quiet = await fail({ code: 3, stdout: asked, stderr: JOB_NOISE }, "gh", null);
  assert.equal(quiet.message, "Pfad von gh nicht ermittelt: /bin/bash endete mit 3 ohne Antwort", "bash's own notice is no reason");
  assert.equal((await fail({ code: 127, stdout: "", stderr: "" }, "gh", null)).message, "Pfad von gh nicht ermittelt: die Shell endete mit 127 ohne Antwort");
  assert.equal((await fail(answered("bin/gh"), "gh", null)).message, "Pfad von gh nicht ermittelt: die Shell kennt nur „bin/gh“, kein Programm");
});

test("another machine where herdr cannot start sh (Windows) runs the program by its bare name; this one says sh is missing", async () => {
  // herdr's words, as its own Files mod reads them.
  const noSh = notThere("sh");
  assert.deepEqual(await board.findTool(fakeRun(noSh).run, "az", "win", 60000), { program: "az", bare: true });
  const here = await board.findTool(fakeRun(noSh).run, "gh", null, 30000).catch((e) => e);
  assert.deepEqual([here instanceof board.BoardError, here.message], [true, "Pfad von gh nicht ermittelt: cannot start sh: program not found"]);
  const missing = await board.findTool(fakeRun(new Error('cannot start "sh": No such file or directory')).run, "az", "server", 60000).catch((e) => e);
  assert.equal(missing.message, 'Pfad von az auf server nicht ermittelt: cannot start "sh": No such file or directory', "only herdr's words for that");
});

// A run's start that answers with the program it was given.
const echo = async (program) => program;

test("a found program is asked for once per machine and program, until reset; a failed question is not kept", async () => {
  const { run, calls } = fakeRun(answered("/x/gh"));
  const paths = board.toolPaths(run);
  const [a, b] = await Promise.all([paths.run("gh", null, 30000, echo), paths.run("gh", null, 30000, echo)]);
  assert.deepEqual([a, b, calls.length], ["/x/gh", "/x/gh", 1], "one question for two runs at once");
  assert.equal(await paths.run("gh", null, 30000, echo), "/x/gh");
  assert.equal(calls.length, 1, "reused");
  await paths.run("gh", "server", 30000, echo);
  await paths.run("az", null, 30000, echo);
  assert.equal(calls.length, 3, "another machine and another program are asked of their own");
  paths.reset();
  await paths.run("gh", null, 30000, echo);
  await paths.run("gh", "server", 30000, echo);
  assert.equal(calls.length, 5, "reset drops all");
  const missing = fakeRun(answered(""), answered("/y/az"));
  const later = board.toolPaths(missing.run);
  await assert.rejects(later.run("az", null, 60000, echo), /az ist nicht installiert/);
  assert.equal(await later.run("az", null, 60000, echo), "/y/az", "asked again after it was not found");
});

test("a program gone from its path is asked for once more and run from the new one; gone again, the run fails", async () => {
  const { run, calls } = fakeRun(answered("/old/gh"), answered("/new/gh"));
  const paths = board.toolPaths(run);
  const fromNew = async (program) => {
    if (program === "/old/gh") throw notRun(program);
    return program;
  };
  assert.equal(await paths.run("gh", null, 30000, fromNew), "/new/gh");
  assert.equal(calls.length, 2);
  const late = stopped("/x/gh");
  await assert.rejects(paths.run("gh", null, 30000, async () => { throw late; }), (e) => e === late, "any other failure passes on as it is");
  assert.equal(calls.length, 2, "and keeps the path");
  // A start that fails some other way once it has run too often, so asking
  // again and again ends instead of hanging the test.
  let starts = 0;
  const alwaysGone = async (program) => {
    if (++starts > 3) throw new Error("started more than three times");
    throw notRun(program);
  };
  const lost = await paths.run("gh", null, 30000, alwaysGone).catch((e) => e);
  assert.deepEqual([lost instanceof board.BoardError, lost.message], [true, "gh ließ sich nicht starten: cannot run /new/gh: No such file or directory (os error 2)"]);
  assert.equal(calls.length, 3, "asked once more, not again and again");
});

test("a gone program forgets only its own machine's and program's lookup", async () => {
  const { run, calls } = fakeRun(answered("/x/gh"));
  const paths = board.toolPaths(run);
  await paths.run("gh", null, 30000, echo);
  await paths.run("gh", "server", 30000, echo);
  await paths.run("az", null, 60000, echo);
  assert.equal(calls.length, 3);
  let starts = 0;
  await paths.run("gh", null, 30000, async (program) => {
    if (starts++ === 0) throw notRun(program);
    return program;
  });
  assert.equal(calls.length, 4, "gh here is asked for again");
  await paths.run("gh", "server", 30000, echo);
  await paths.run("az", null, 60000, echo);
  assert.equal(calls.length, 4, "gh on the server and az here are kept");
});

test("a bare name that does not start is not asked for again", async () => {
  const { run, calls } = fakeRun(notThere("sh"));
  const paths = board.toolPaths(run);
  const error = notThere("az");
  await assert.rejects(paths.run("az", "win", 60000, async () => { throw error; }), (e) => e === error);
  assert.equal(calls.length, 1);
});

test("a run that finds its program gone forgets only its own lookup, not a newer one", async () => {
  // A third answer, should the run ask again, so that shows as a wrong path.
  const answers = [answered("/old/gh"), answered("/new/gh"), answered("/third/gh")];
  let asked = 0;
  const paths = board.toolPaths(async () => answers[asked++]);
  const held = deferred();
  let starts = 0;
  const first = paths.run("gh", null, 30000, (program) => (starts++ === 0 ? held.promise : echo(program)));
  await settle();
  paths.reset();
  assert.equal(await paths.run("gh", null, 30000, echo), "/new/gh");
  held.reject(notRun("/old/gh"));
  assert.equal(await first, "/new/gh", "run again from the newer lookup");
  assert.equal(asked, 2, "which it did not drop");
});

test("a question that fails after reset leaves the answer of the one asked since", async () => {
  const answers = [deferred(), deferred()];
  let asked = 0;
  const paths = board.toolPaths(() => answers[asked++].promise);
  const first = paths.run("gh", null, 30000, echo);
  paths.reset();
  const second = paths.run("gh", null, 30000, echo);
  answers[1].resolve(answered("/new/gh"));
  answers[0].reject(stopped("sh"));
  await assert.rejects(first, /die Shell antwortete nicht/);
  assert.equal(await second, "/new/gh");
  // Counted first: a third question would fail on the fake's missing answer,
  // which says less than the count.
  const third = paths.run("gh", null, 30000, echo);
  assert.equal(asked, 2, "the answer since is kept");
  assert.equal(await third, "/new/gh");
});

// The real script under sh, with a bare environment as herdr's service has
// (a PATH without Homebrew), in a home where each shell's startup files
// print a banner and add one folder when interactive (bash with an alias,
// zsh and fish with a function of the same name as its program) and another
// when a login shell, each folder with a program of its own. bash's
// .bash_profile sources a .bashrc that returns early when not interactive,
// as Debian's does. run's `shell` is $SHELL (null: unset; "": empty); `sh`
// runs the script.
const shellAt = (name) => spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
const [bash, dash, zsh, fish] = ["bash", "dash", "zsh", "fish"].map(shellAt);
function inShellHome(fn) {
  const home = mkdtempSync(join(tmpdir(), "board-which-"));
  try {
    const rc = join(home, "brew/bin"), login = join(home, "login/bin");
    for (const [dir, tool] of [[rc, "board-rc-tool"], [login, "board-login-tool"]]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, tool), "#!/bin/sh\n", { mode: 0o755 });
    }
    writeFileSync(join(home, ".bashrc"), [
      "case $- in *i*) ;; *) return ;; esac",
      "printf '\\033[40m banner \\033[m\\n'", "echo noise >&2", `PATH=$PATH:${rc}`, "alias board-rc-tool='board-rc-tool --alias'", "",
    ].join("\n"));
    writeFileSync(join(home, ".bash_profile"), `echo profile\nPATH=$PATH:${login}\n. ~/.bashrc\n`);
    writeFileSync(join(home, ".zshrc"), `echo zsh banner\nPATH=$PATH:${rc}\nboard-rc-tool() { :; }\n`);
    writeFileSync(join(home, ".zprofile"), `PATH=$PATH:${login}\n`);
    mkdirSync(join(home, ".config/fish"), { recursive: true });
    writeFileSync(join(home, ".config/fish/config.fish"), [
      "if status is-interactive", "  echo fish banner", `  set -gx PATH $PATH ${rc}`, "  function board-rc-tool; end", "end",
      "if status is-login", `  set -gx PATH $PATH ${login}`, "end", "",
    ].join("\n"));
    const run = (tool, on, shell = bash, sh = "sh") => {
      const env = { HOME: home, PATH: "/usr/local/bin:/usr/bin:/bin", ...(shell === null ? {} : { SHELL: shell }) };
      // stdin from /dev/null: on a socket, as node's pipes are, bash reads
      // .bashrc even when not interactive (as under sshd).
      const r = spawnSync(sh, board.whichArgs(tool, on), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000, env });
      return { answer: board.readWhich(r.stdout), shell: board.readShell(r.stdout), said: `${r.stdout} ${r.stderr}` };
    };
    return fn(run, { rc: join(rc, "board-rc-tool"), login: join(login, "board-login-tool") });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// What each shell must answer: the interactive folder here and on another
// machine (whatever alias or function shadows the program there), the login
// folder only on another machine, nothing for a program that is nowhere.
function answersOfShell(shell) {
  inShellHome((run, want) => {
    const here = run("board-rc-tool", null, shell);
    assert.equal(here.answer, want.rc, here.said);
    assert.deepEqual(here.shell, { asked: shell, own: shell });
    assert.equal(run("board-login-tool", null, shell).answer, "", "here no login shell");
    const there = run("board-rc-tool", "server", shell);
    assert.equal(there.answer, want.rc, `a login shell is interactive too: ${there.said}`);
    const login = run("board-login-tool", "server", shell);
    assert.equal(login.answer, want.login, login.said);
    assert.equal(run("board-no-such-tool", null, shell).answer, "");
    assert.equal(run("board-no-such-tool", "server", shell).answer, "");
  });
}

test("the path script asks bash interactive here, login and interactive on another machine", { skip: !bash && "no bash on this machine" }, () => answersOfShell(bash));
test("the path script asks zsh the same way", { skip: !zsh && "no zsh on this machine" }, () => answersOfShell(zsh));
test("the path script asks fish the same way", { skip: !fish && "no fish on this machine" }, () => answersOfShell(fish));

test("the path script asks /bin/sh for any other shell and says so", () => {
  inShellHome((run) => {
    const other = run("sh", null, "/usr/bin/board-no-such-shell");
    assert.match(other.answer, /^\/.*\/sh$/);
    assert.deepEqual(other.shell, { asked: "/bin/sh", own: "/usr/bin/board-no-such-shell" });
  });
});

// The account's line runs only when $SHELL is empty, or unset under a sh
// that does not set it itself: dash does not, bash as sh does.
const accountShell = spawnSync("sh", ["-c", 'getent passwd "$(id -un)" | cut -d: -f7'], { encoding: "utf8" }).stdout.trim();
const accountBash = /\/bash$/.test(accountShell);
test("with $SHELL empty the path script asks the account's shell", { skip: !accountBash && "the account's shell is no bash" }, () => {
  inShellHome((run, want) => {
    const empty = run("board-rc-tool", null, "");
    assert.equal(empty.answer, want.rc, empty.said);
    assert.equal(empty.shell.own, accountShell);
  });
});

test("with $SHELL unset under dash the path script asks the account's shell", { skip: !(accountBash && dash) && "no dash, or the account's shell is no bash" }, () => {
  inShellHome((run, want) => assert.equal(run("board-rc-tool", null, null, dash).answer, want.rc));
});

test("az's failures: login and a missing extension are marked unavailable, for the Azure views; others are errors without az's WARNING lines", () => {
  const login = board.azFailure({ code: 1, stderr: "WARNING: a notice\nERROR: Before you can run Azure DevOps commands, you need to run the login command(az login if using AAD/MSA identity else az devops login if using PAT token) to setup credentials." });
  assert.deepEqual([login.unavailable, login.message], [true, "az ist nicht angemeldet (az login oder az devops login)"]);
  for (const err of ["ERROR: 'boards' is misspelled or not recognized by the system.", "ERROR: az: 'devops' is not in the 'az' command group."]) {
    const ext = board.azFailure({ code: 2, stderr: err });
    assert.deepEqual([ext.unavailable, /azure-devops/.test(ext.message)], [true, true], err);
  }
  const other = board.azFailure({ code: 1, stderr: "WARNING: The behavior of this command will change\nERROR: TF401232: Work item 9 does not exist." });
  assert.deepEqual([other.unavailable, other.message], [false, "TF401232: Work item 9 does not exist."]);
  assert.equal(board.azFailure({ code: 1, stderr: "WARNING: The behavior of this command will change\nThe request failed" }).message, "The request failed");
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: TF200016: The following project does not exist: Nope." }).message,
    "Azure-Projekt unbekannt: TF200016: The following project does not exist: Nope.");
  const wiql = "ERROR: TF51005: The query references a field that does not exist. The error is caused by «[System.Project]».";
  assert.equal(board.azFailure({ code: 1, stderr: wiql }).message, wiql.slice(7), "a WIQL error naming a project field is no unknown project");
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: boom" }, "server").message, "az auf server: boom");
});

test("az's RetryError after repeated 5xx answers is a server error, on reads and writes", () => {
  // msrest retries 408, 500, 502, 503, 504 and from 506 on, then gives up with this line.
  const retried = "ERROR: Error occurred in request., RetryError: HTTPSConnectionPool(host='dev.azure.com', port=443): Max retries exceeded with url: /example-org/_apis/wit/workitems/102 (Caused by ResponseError('too many 503 error responses'))";
  const server = `Azure antwortete mit einem Fehler (az): ${retried.slice(7)}`;
  assert.deepEqual([board.azFailure({ code: 1, stderr: retried }).message, board.azFailure({ code: 1, stderr: retried }).unclear], [server, false]);
  const write = board.azFailure({ code: 1, stderr: retried }, null, { write: true });
  assert.deepEqual([write.message, write.unclear], [`Ergebnis unklar: ${server}`, true]);
});

test("az's own ERROR: line decides, not the words of a crash's traceback", () => {
  const crash = "ERROR: The command failed with an unexpected error. Here is the traceback:\nTraceback (most recent call last):\nurllib3.exceptions.MaxRetryError: Max retries exceeded with url: /x\nValueError: x";
  const e = board.azFailure({ code: 1, stderr: crash });
  assert.equal(e.message, "The command failed with an unexpected error. Here is the traceback:");
  assert.equal(board.azFailure({ code: 1, stderr: crash }, null, { write: true }).message, "Ergebnis unklar: The command failed with an unexpected error. Here is the traceback:");
  assert.equal(board.azFailure({ code: 1, stderr: "Traceback (most recent call last):\nMax retries exceeded" }).message, "Azure nicht erreichbar (az): Traceback (most recent call last):",
    "without an ERROR: line all az printed counts");
});

test("az says a request without a clear answer and a server error apart, on reads and writes", () => {
  // msrest wraps a requests exception as "Error occurred in request., <type>: <message>".
  const timedOut = "ERROR: Error occurred in request., ReadTimeout: HTTPSConnectionPool(host='dev.azure.com', port=443): Read timed out. (read timeout=30)";
  const lost = "Azure nicht erreichbar (az): Error occurred in request., ReadTimeout: HTTPSConnectionPool(host='dev.azure.com', port=443): Read timed out. (read timeout=30)";
  assert.deepEqual([board.azFailure({ code: 1, stderr: timedOut }).message, board.azFailure({ code: 1, stderr: timedOut }).unclear], [lost, false]);
  assert.equal(board.azFailure({ code: 1, stderr: timedOut }, null, { write: true }).message, `Ergebnis unklar: ${lost}`);
  const broken = "ERROR: Error occurred in request., ChunkedEncodingError: (\"Connection broken: InvalidChunkLength(got length b'', 0 bytes read)\", InvalidChunkLength(got length b'', 0 bytes read))";
  assert.equal(board.azFailure({ code: 1, stderr: broken }).message, `Azure nicht erreichbar (az): ${broken.slice(7)}`, "msrest's prefix alone says so");
  // The Azure DevOps client's line for a failed answer without a message of its own.
  const server = "Azure antwortete mit einem Fehler (az): Operation returned a 503 status code.";
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: Operation returned a 503 status code." }).message, server);
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: Operation returned a 503 status code." }, null, { write: true }).message, `Ergebnis unklar: ${server}`);
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: TF400898: An Internal Error Occurred. Activity Id: 1." }, "server").message,
    "Azure antwortete mit einem Fehler (az auf server): TF400898: An Internal Error Occurred. Activity Id: 1.");
});

test("on a write, only az's known refusal forms are refusals; any other failure is unclear", () => {
  const write = { write: true };
  const unclear = (stderr, code = 1) => board.azFailure({ code, stderr }, null, write).unclear;
  for (const err of [
    "ERROR: Error occurred in request., ConnectionError: HTTPSConnectionPool(host='dev.azure.com', port=443): Max retries exceeded with url: /example-org/_apis/wit/workitems/102 (Caused by NewConnectionError('<urllib3.connection.HTTPSConnection object>: Failed to establish a new connection: [Errno 101] Network is unreachable'))",
    "ERROR: Error occurred in request., ConnectionError: ('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))",
    "ERROR: Error occurred in request., ChunkedEncodingError: (\"Connection broken: InvalidChunkLength(got length b'', 0 bytes read)\", InvalidChunkLength(got length b'', 0 bytes read))",
    "ERROR: Operation returned a 503 status code.",
    "ERROR: TF400898: An Internal Error Occurred. Activity Id: 0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.",
    "ERROR: TF246017: Team Foundation Server could not connect to the database.",
    // az's handle_exception for a crash and for Ctrl-C.
    "ERROR: The command failed with an unexpected error. Here is the traceback:\nTraceback (most recent call last):\nValueError: x",
    "ERROR: Keyboard interrupt is captured.",
    "", // killed, or az's silent Ctrl-C (knack exits 1 without output)
    "The work item does not exist", // a refusal's words, but no ERROR: line
    // azure-devops-cli-extension, azext_devops/dev/boards/work_item.py: a query helper's, not a write's.
    "ERROR: Work Item 102 was not found in the original query results.",
  ]) {
    assert.equal(unclear(err), true, err);
  }
  for (const err of [
    "ERROR: TF401320: Rule Error for field State. Error code: Required, InvalidEmpty.",
    "ERROR: TF401232: Work item 9 does not exist, or you do not have permissions to read it.",
    "ERROR: argument --state: expected one argument",
    "ERROR: the following arguments are required: --id",
    "ERROR: unrecognized arguments: --stat New",
    "ERROR: Operation returned a 400 status code.",
    "ERROR: Operation returned a 404 status code.",
    "ERROR: The requested resource requires user authentication: https://dev.azure.com/example-org/_apis/wit/workitems/102",
  ]) {
    assert.equal(unclear(err), false, err);
  }
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: TF401320: Rule Error for field State." }, null, write).message, "TF401320: Rule Error for field State.");
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: Keyboard interrupt is captured." }).unclear, false, "a read is just an error");
});

// ---- Azure ----

test("Azure states come from the work item types, in category order", () => {
  const { states, types } = azureTypes();
  assert.deepEqual(states.map((s) => s.name), ["To Do", "New", "Approved", "In Planning", "In Progress", "Committed", "Active", "Done", "Inactive", "Removed"]);
  assert.deepEqual(types.Task, ["To Do", "In Progress", "Done", "Removed"]);
  assert.equal(states.find((s) => s.name === "Committed").color, "ansi4");
});

test("work item types without a list are an error, not an empty board", () => {
  assert.throws(() => board.parseAzureTypes('{"count":0}'), { message: "Azure lieferte keine Work-Item-Typen" });
  assert.throws(() => board.parseAzureTypes('{"value":{}}'), { message: "Azure lieferte keine Work-Item-Typen" });
});

// ---- Sessions ----

test("an item's key names it on every source; a draft has none", () => {
  assert.equal(board.itemKey(board.findCard(githubBoard(), "PVTI_rec1").card), "tender#3000");
  assert.equal(board.itemKey(azureItem()), "AB#101");
  const draft = board.findCard(casesBoard(), "PVTI_case2").card;
  assert.equal(board.itemKey(draft), null);
  assert.equal(board.itemLabel(draft), "Entwurf");
  assert.equal(board.itemLabel(azureItem()), "AB#101");
});

test("a card or row names an Azure work item by its number alone, anything else as itemLabel does", () => {
  assert.equal(board.cardLabel(azureItem()), "101");
  assert.equal(board.cardLabel({ ...azureItem(), kind: "pr" }), "!101", "an Azure pull request keeps its mark");
  assert.equal(board.cardLabel(board.findCard(githubBoard(), "PVTI_rec1").card), "tender#3000");
  assert.equal(board.cardLabel(board.findCard(casesBoard(), "PVTI_case2").card), "Entwurf");
});

test("a session is named after its item, the title cut to fit", () => {
  const card = board.findCard(githubBoard(), "PVTI_rec6").card;
  assert.equal(board.sessionName(card), "tender#3007 fix(input): pass the key map to the viewer");
  assert.equal(board.sessionName({ ...card, title: "x".repeat(80) }), `tender#3007 ${"x".repeat(47)}…`);
  assert.equal(board.sessionName(board.findCard(casesBoard(), "PVTI_case2").card), "Draft: sort the release notes");
});

test("an item's session is the tab or space named after it; a branch with its number is the fallback", () => {
  const card = board.findCard(githubBoard(), "PVTI_rec1").card;
  const tab = (id, name, status = null) => ({ id, name, status });
  const spaces = [
    { id: "s1", name: "atlas", folder: "/r/atlas", branch: "main", status: "blocked", tabs: [tab("t1", "atlas#3000 other")] },
    { id: "s2", name: "work", folder: "/r/tender", branch: "main", status: "working", tabs: [tab("t2", "1"), tab("t3", "tender#3000 sample…", "working")] },
  ];
  assert.deepEqual(board.linkedSession(card, spaces), { space: "s2", tab: "t3", status: "working", label: "tender#3000 sample…" });
  const two = [{ id: "s7", name: "x", folder: "/r/tender", branch: "main", status: null,
    tabs: [tab("t7", "tender#3000 a", "idle"), tab("t8", "tender#3000 b", "blocked"), tab("t9", "tender#30001 c", "blocked")] }];
  assert.equal(board.linkedSession(card, two).tab, "t8", "the most urgent first; tender#30001 is another item");
  assert.equal(board.linkedSession(card, [{ ...two[0], tabs: [two[0].tabs[2]] }]), null);
  const named = [{ id: "s3", name: "tender#3000 sample…", folder: "/r/tender", branch: "main", status: "done", tabs: [tab("t4", "1", "done")] }];
  assert.deepEqual(board.linkedSession(card, named), { space: "s3", tab: null, status: "done", label: "tender#3000 sample…" });
  const branch = [{ id: "s4", name: "x", folder: "/r/tender.worktrees/feat/3000-x", branch: "feat/3000-x", status: "idle", tabs: [tab("t5", "1")] }];
  assert.deepEqual(board.linkedSession(card, branch), { space: "s4", tab: null, status: "idle", label: "feat/3000-x" });
  const elsewhere = [{ id: "s5", name: "x", folder: "/r/atlas.worktrees/feat/3000-x", branch: "feat/3000-x", status: "idle", tabs: [] }];
  assert.equal(board.linkedSession(card, elsewhere), null, "the same number in another repo is not this item's");
  assert.equal(board.linkedSession(azureItem(), [{ id: "s6", name: "w", folder: "/w", branch: null, status: null, tabs: [tab("t6", "AB#101 Write the sample importer", "blocked")] }]).tab, "t6");
  const pr = board.parseGithubList(json("github-list.json"), listView()).sections[0].rows[0];
  assert.equal(board.linkedSession(pr, [{ id: "p", name: "p", folder: "/x", branch: "pr/summary-card", status: "idle", tabs: [] }]).space, "p");
});

test("templates take the item's number, title, url, owner, repo and key", () => {
  const card = board.findCard(githubBoard(), "PVTI_rec4").card;
  const vars = board.templateVars(card);
  assert.deepEqual(vars, { number: 3004, title: card.title, url: "https://github.com/example/tender/issues/3004", owner: "example", repo: "tender", key: "tender#3004" });
  assert.equal(board.renderTemplate("/implement {number} {nope}", vars), "/implement 3004 {nope}");
  assert.equal(board.templateVars(azureItem()).repo, "Example Project");
});

test("the checkout script expands ~ on the machine, checks the folder and prints it", () => {
  const home = process.env.HOME;
  mkdirSync(join(home, "src/tender"), { recursive: true });
  const run = (checkout) => spawnSync("sh", board.checkoutArgs(checkout), { encoding: "utf8", env: { PATH: process.env.PATH, HOME: home } });
  const ok = run("~/src/tender");
  assert.deepEqual([ok.status, ok.stdout], [0, `${join(home, "src/tender")}\n`]);
  assert.equal(run(join(home, "src/tender")).stdout, `${join(home, "src/tender")}\n`);
  const missing = run("~/src/none");
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /Kein Checkout unter .*src\/none/);
  assert.equal(board.checkoutArgs("~/x; rm -rf ~").at(-1), "~/x; rm -rf ~", "the checkout is an argument, never part of the script");
});

test("the checkout script works under dash too", { skip: !dash && "no dash on this machine" }, () => {
  const home = process.env.HOME;
  mkdirSync(join(home, "src/dash"), { recursive: true });
  const run = (checkout) => spawnSync(dash, board.checkoutArgs(checkout), { encoding: "utf8", env: { PATH: process.env.PATH, HOME: home } });
  assert.equal(run("~/src/dash").stdout, `${join(home, "src/dash")}\n`);
  assert.equal(run("~/src/none").status, 3);
});

test("a session opens as a new space on its machine or a tab in a space there", () => {
  assert.deepEqual(board.startCommand({ open: "space", on: "server", folder: "/w", argv: ["claude"], task: "/work 1", name: "tender#1 t" }),
    ["space.new", { name: "tender#1 t", tab: "tender#1 t", machine: "server", folder: "/w", argv: ["claude"], task: "/work 1" }]);
  assert.deepEqual(board.startCommand({ open: "space", on: null, folder: "/w", argv: ["claude"], task: "", name: "n" }),
    ["space.new", { name: "n", tab: "n", machine: "", folder: "/w", argv: ["claude"] }]);
  assert.deepEqual(board.startCommand({ open: "tab", on: null, folder: "/w", argv: ["claude"], task: "go", name: "n", space: "s2" }),
    ["tab.new", { name: "n", space: "s2", folder: "/w", argv: ["claude"], task: "go" }]);
});

test("a new tab goes to a space in the checkout or below it on that machine, else the shown one there", () => {
  const spaces = [
    { id: "a", machine: null, folder: "/home/me/src/other", active: true },
    { id: "b", machine: "server", folder: "/home/me/src/tender/docs", active: false },
    { id: "c", machine: null, folder: "/home/me/src/tender", active: false },
    { id: "d", machine: "laptop", folder: "/home/me/src/tender.worktrees/feat/9-x", active: false },
  ];
  assert.equal(board.spaceForTab(spaces, null, "/home/me/src/tender").id, "c");
  assert.equal(board.spaceForTab(spaces, "server", "/home/me/src/tender").id, "b");
  assert.equal(board.spaceForTab(spaces, null, "/home/me/src/none").id, "a");
  assert.equal(board.spaceForTab(spaces, "laptop", "/home/me/src/tender"), null, "a worktree beside the checkout is not in it");
});

// ---- Labels ----

test("the refresh time and PR ages read as German labels", () => {
  const now = Date.parse("2026-11-18T12:00:00");
  assert.equal(board.updatedLabel(0, now), "");
  assert.equal(board.updatedLabel(now - 40000, now), "vor 40 s");
  assert.equal(board.updatedLabel(now - 3 * 60000 - 5000, now), "vor 3 min");
  assert.equal(board.updatedLabel(now - 2 * 3600000, now), "vor 2 h");
  assert.equal(board.ageLabel("2026-11-18T08:00:00", now), "heute");
  assert.equal(board.ageLabel("2026-11-17T23:00:00", now), "gestern");
  assert.equal(board.ageLabel("2026-11-14T10:00:00", now), "vor 4 Tagen");
  assert.equal(board.ageLabel("2026-11-02T10:00:00", now), "2.11.");
});

// ---- UI paths through a fake herdr ----

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

// The UI tests' own views.json: on Azure a team and its project's pull
// requests, and three GitHub views. hide: the first view's hidden columns;
// repos: more repos entries.
function testConfig({ start = {}, filter = "assignee:@me", hide = ["Backlog", "Done"], repos = {} } = {}) {
  return JSON.stringify({
    refreshMinutes: 3,
    start: { agent: "claude", message: "/work {number}", review: "/look {number}", ...start },
    repos: { "example/tender": { checkout: "~/src/tender" }, ...repos },
    sources: {
      azure: { org: "https://dev.azure.com/example-org", contexts: [{ team: { project: "Example Project", team: "Example Team" } }, { prs: { project: "Example Project" } }] },
      github: {
        views: [
          { id: "mine", name: "Mine", source: "github", layout: "board", project: { owner: "sample-user", number: 7 }, filter, hide },
          { id: "prs", name: "PRs", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] },
          { id: "other", name: "Other", source: "github", layout: "board", project: { owner: "sample-user", number: 8 }, hide: ["Done"] },
        ],
      },
    },
  });
}

// testConfig without the view "mine".
function withoutMine() {
  const config = JSON.parse(testConfig());
  config.sources.github.views = config.sources.github.views.filter((v) => v.id !== "mine");
  return JSON.stringify(config);
}

// A clock the tests can move: the mod reads Date.now().
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const advance = (ms) => (clockOffset += ms);

// An element of the fake gpui: it records the styling calls by name (each
// one's last arguments in `with`, every call in `calls`) and keeps its
// children; when(cond, fn) applies fn when cond holds, map(fn) applies fn.
function element(kind) {
  const el = { kind, styles: [], with: {}, calls: [], kids: [] };
  const proxy = new Proxy(el, {
    get(target, p) {
      if (p in target) return target[p];
      return (...args) => {
        if (p === "child") target.kids.push(args[0]);
        else if (p === "children") target.kids.push(...args[0]);
        else if (p === "when") return args[0] ? args[1](proxy) : proxy;
        else if (p === "map") return args[0](proxy);
        else {
          target.styles.push(p);
          target.with[p] = args;
          target.calls.push([p, ...args]);
        }
        return proxy;
      };
    },
  });
  return proxy;
}

// herdr's TextView as the fake gpui draws it (TextView.markdown and
// TextView.html): an element of kind "textview" with its `format`, `viewId`
// and text (`source`), which it also holds as its one child.
function textView(format, id, text) {
  const el = element("textview");
  Object.assign(el, { format, viewId: id, source: text });
  el.kids.push(text);
  return el;
}

// The fake herdr: exec calls wait until the test answers them, except the
// questions for gh's and az's paths: those are answered at once from
// which(tool, on) (a path, "" for not found, an Error, or exec's result;
// by default gh is found and az is not) and recorded in asked. spaces() is
// spaceList, which a test may change.
// layout() is `tree` (the shown layout; none by default), focused() is
// `focus`, props() is `copyProps` (the copy's own props, as herdr gives
// them: `props`), and shared() reads `sharedValues`; a test may change each.
// focusCalls counts the calls of a focus handle's focus().
const found = (tool) => `/opt/fake/bin/${tool}`;
function fakeHost({ config = testConfig(), shown = true, tree = null, props = {}, which = (tool) => (tool === "az" ? "" : found(tool)) } = {}) {
  const calls = [];
  const host = {
    calls,
    asked: [],
    which,
    runs: [],
    notes: [],
    focusCalls: 0,
    focus: { space: "s1", tab: "t1", pane: "p1", terminal: "t1" },
    focused: () => host.focus,
    inputs: [],
    config,
    spaceList: [{ id: "s1", name: "x", folder: "/r/tender", machine: null, branch: "main", active: true, status: null, tabs: [{ id: "t1", name: "Board", active: true }] }],
    spaces: () => host.spaceList,
    exec: (tool, args, options) => {
      if (tool === "sh" && args[1] === board.WHICH_SCRIPT) {
        host.asked.push({ tool: args[3], on: options.on, timeout: options.timeout });
        const a = host.which(args[3], options.on);
        if (a instanceof Error) return Promise.reject(a);
        return Promise.resolve(typeof a === "string" ? answered(a) : a);
      }
      const d = deferred();
      calls.push({ tool, args, options, ...d });
      return d.promise;
    },
    // views.json is `config`; any other file is in `files` (path → text),
    // which writeTextFile writes as herdr's does: only where the file still
    // holds `expected` (null: there is none). `failWrite` makes it fail.
    files: {},
    failWrite: null,
    readTextFile: async (path) => (path.endsWith("/views.json") ? host.config : host.files[path] ?? null),
    writeTextFile: async (path, text, expected) => {
      if (host.failWrite) throw host.failWrite;
      if ((host.files[path] ?? null) !== expected) throw new Error(`stale snapshot of ${path}`);
      host.files[path] = text;
      return null;
    },
    appHome: () => "/fake-home",
    home: () => "/home/sample",
    checking: () => false,
    nextCommand: () => new Promise(() => {}),
    notify: (n) => host.notes.push(n),
    run: (name, args) => host.runs.push([name, args]),
    panes: () => (shown ? [{ pane: "p1", mod: "board", tab: "t1" }] : []),
    tree,
    layout: () => host.tree,
    sharedValues: {},
    handles: [],
    copyProps: props,
    props: () => host.copyProps,
    shared: (key) => host.sharedValues[key] ?? null,
    machines: () => [{ name: null, layout: "ready" }, { name: "server", layout: "ready" }],
    knownAgents: async () => [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }],
    settings: () => ({}),
    theme: () => ({}),
    // An input whose focus() tells its "focus" handler, and whose "blur"
    // handler hears when the board takes the keyboard back, as herdr's do.
    "InputState.new": (opts) => {
      let value = opts?.value ?? "";
      const on = {};
      // Its focus() takes the keyboard from the board's handles and the
      // other inputs, as herdr's does.
      const input = {
        on: (event, fn) => ((on[event] = fn), true), value: () => value, set_value: (v) => (value = v),
        // Enter in the field, with the cx of the key's call.
        submit: (cx) => on.submit?.({}, cx),
        // Typing: the value, and its "change" handler told.
        type: (text) => {
          value = text;
          on.change?.({}, { notify() {} });
        },
        focus: () => {
          for (const h of host.handles) h.held = false;
          for (const other of host.inputs) if (other !== input) other.blur();
          on.focus?.({}, { notify() {} });
        },
        blur: () => on.blur?.({}, { notify() {} }),
      };
      host.inputs.push(input);
      return input;
    },
    // herdr refuses a ScrollHandle made while a view draws. Each handle's
    // scroll_to_item(row) is recorded in `scrolled` as { handle, row }.
    scrolled: [],
    "ScrollHandle.new": () => {
      if (host.drawing) throw new Error("ScrollHandle.new() cannot run during render; create state in init() or in an event handler and keep it on the view");
      const handle = { scroll_to_item: (row) => host.scrolled.push({ handle, row }) };
      return handle;
    },
    div: () => element("div"),
    h_flex: () => element("h_flex"),
    v_flex: () => element("v_flex"),
    "Input.new": () => element("input"),
    // A TextView: its format, id and text, the text as its one child.
    "TextView.markdown": (id, text) => textView("markdown", id, text),
    "TextView.html": (id, text) => textView("html", id, text),
    svg: (path) => element("svg").path(path),
  };
  // A call of a tool: by its name, or by the path which gave for it.
  const named = (c, tool) => c.tool === tool || c.tool.endsWith(`/${tool}`);
  // Answers the oldest open call of a tool (whose arguments hold `has`, or
  // that `has` takes, given its arguments).
  host.answer = async (tool, result, has) => {
    const fits = (c) => (typeof has === "function" ? has(c.args) : c.args.some((a) => String(a).includes(has)));
    const at = calls.findIndex((c) => named(c, tool) && !c.done && (!has || fits(c)));
    assert.ok(at >= 0, `no open ${tool} call${has ? ` with ${has}` : ""}`);
    calls[at].done = true;
    if (result instanceof Error) calls[at].reject(result);
    else calls[at].resolve(result);
    await settle();
  };
  host.open = (tool) => calls.filter((c) => named(c, tool) && !c.done);
  return host;
}

async function settle() {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
}

// herdr's words for a cx used after the call it came with returned
// (gpui-kit, crates/shell/src/scope.rs, StaleContext).
const STALE_CX = "cx is no longer valid: it was captured during an earlier call and used later. Use cx.spawn or take cx from the callback arguments instead.";

// A fake cx; its timers run when a test calls fire(), tick() or look().
// bind_keys records the bindings in `bound` and gives what `bindKeys` (by
// default: how many it got) gives or throws.
//
// herdr's rule for a cx (gpui-kit, crates/shell/src/typings.rs,
// AsyncContext; scope.rs, with_context): a handler (a key, a click, an
// action, an input's event) gets a cx for that one call, which is stale
// once the call returns; init, cx.spawn's body and a cx.timer callback get
// an AsyncContext, which names no call and stays valid. So call(fn) runs a
// handler `fn` with a cx of its own that goes stale when it returns, and
// every use of a stale cx throws herdr's words; the timers fire(), tick()
// and look() run, and every spawn, get a lasting one, as does the cx this
// returns, which init gets.
function fakeCx({ bindKeys = (bindings) => bindings.length } = {}) {
  const cx = { later: [], every: [], bound: [], stopped: 0 };
  // A cx for one call; `lasting`: an AsyncContext, which never goes stale.
  const scope = (lasting) => {
    let valid = true;
    const live = (fn) => (...args) => {
      if (!valid) throw new Error(STALE_CX);
      return fn(...args);
    };
    return {
      end: () => {
        if (!lasting) valid = false;
      },
      bind_keys: live((bindings) => (cx.bound.push(...bindings), bindKeys(bindings))),
      // A handle that knows whether it has the keyboard: from its focus()
      // until a test says otherwise (handle.held = false).
      // The board's handle, one of the host's handles: its focus() takes the
      // keyboard from the others and from every input.
      focus_handle: live(() => {
        const host = globalThis.__boardHost;
        const handle = {
          held: false,
          focus: () => {
            for (const h of host.handles) h.held = false;
            handle.held = true;
            host.focusCalls++;
            for (const input of host.inputs ?? []) input.blur();
          },
          is_focused: () => handle.held,
        };
        host.handles.push(handle);
        return handle;
      }),
      spawn: live((fn) => Promise.resolve().then(() => fn(scope(true)))),
      timer: {
        after: live((ms, fn) => cx.later.push(fn)),
        every: live((ms, fn) => cx.every.push(Object.assign(fn, { ms }))),
      },
      notify: live(() => {}),
      stop_propagation: live(() => {
        cx.stopped++;
      }),
      open_url: live((url) => {
        (cx.opened ??= []).push(url);
      }),
    };
  };
  Object.assign(cx, scope(true), {
    // Runs the handler fn with a cx of its own, stale once fn returns.
    call(fn) {
      const own = scope(false);
      try {
        return fn(own);
      } finally {
        own.end();
      }
    },
    async fire() {
      for (const fn of cx.later.splice(0)) fn(scope(true));
      await settle();
    },
    async tick() {
      for (const fn of cx.every) fn(scope(true));
      await settle();
    },
    // One look of the copy's WATCH_MS timer, then what it queued.
    async look() {
      for (const fn of cx.every.filter((f) => f.ms === board.WATCH_MS)) fn(scope(true));
      for (const fn of cx.later.splice(0)) fn(scope(true));
      await settle();
    },
  });
  return cx;
}

// ---- The board layer (layouts/personal.json) ----

const findById = (node, id) => (node?.id === id ? node : (node?.children ?? []).map((c) => findById(c, id)).find(Boolean) ?? null);
const personalLayout = () => JSON.parse(readFileSync(resolve(modDir, "../../layouts/personal.json"), "utf8"));
// The personal layout as layout() gives it, its board layer showing
// `active` ("main": the tab's content, "board": the board).
const layerLayout = (active) => {
  const tree = personalLayout();
  findById(tree, "work-stack").active = active;
  return tree;
};
const SHOW_BOARD = [["layout.select", { stack: "work-stack", child: "board" }], ["board.focus", undefined]];
// The tab's content again, the keyboard back to the focused pane (the fake
// host's p1).
const SHOW_TAB = [["layout.select", { stack: "work-stack", child: "main" }], ["pane.focus", { pane: "p1" }]];

// A space whose tab is the session of the board's first card.
const sessionSpace = { id: "s5", name: "y", folder: "/r/tender", machine: null, branch: "main", active: false, status: "working",
  tabs: [{ id: "t5", name: "tender#3004 feat(api): page through long lists", status: "working" }] };

const memory = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)) },
});

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });

// A Board on the fake host, started with `props`, its calls not answered
// yet. `stored`:
// what the store holds before (by default the GitHub source as the one last
// shown, so the board opens on its first view).
async function bootBoard(options = {}) {
  memory.clear();
  for (const [key, value] of Object.entries(options.stored ?? { source: "github" })) memory.set(key, JSON.stringify(value));
  clockOffset = 0;
  const host = fakeHost(options);
  globalThis.__boardHost = host;
  const b = new board.default();
  const cx = fakeCx(options);
  b.init(options.props ?? {}, cx);
  await settle();
  return { b, cx, host, st: () => b.views.mine };
}

// A Board on the fake host, its first view loaded from github-board.json
// (or `answer`).
async function openBoard(options = {}) {
  const { b, cx, host } = await bootBoard(options);
  await host.answer("gh", ok(options.answer ?? fixture("github-board.json")));
  cx.later.splice(0); // init's focus retry
  return { b, cx, host, st: () => b.views.mine };
}

const key = (k, extra = {}) => ({ key: k, key_char: extra.char ?? (k.length === 1 ? k : undefined), keystroke: k, modifiers: extra.modifiers ?? {} });
async function press(b, cx, k, extra) {
  cx.call((own) => b.key(key(k, extra), own));
  await settle();
}
const shiftL = { char: "L", modifiers: { shift: true } };
// A gh call for a board view's items, and one for an issue's related items.
const isBoardCall = (args) => args.some((a) => String(a).includes("projectV2(number"));
const isRelatedCall = (args) => args.some((a) => String(a).includes("closedByPullRequestsReferences"));
const confirmed = (id) => ok(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id } } } }));

test("UI: on the shipped views.json, with nothing remembered, the board opens on GitHub, its first view", async () => {
  const { b, host } = await bootBoard({ config: shippedConfig(), stored: {} });
  assert.deepEqual([b.source().id, b.context().id], ["github", "github:mine"]);
  assert.equal(host.open("gh").length, 1, "and loads it");
  assert.deepEqual(byId(b.render(), "source").kids.map((k) => k.with.id[0]), ["source-github", "source-azure"], "the toggle's order");
});

test("UI: on the shipped views.json with Azure remembered, the board opens on its team's Sprint and reads it with az, not gh", async () => {
  const { b, host } = await bootBoard({ config: shippedConfig(), stored: { source: "azure" } });
  assert.deepEqual([b.source().id, b.context().kind, b.teamViewOf(b.context())], ["azure", "team", "sprint"]);
  assert.deepEqual(b.contexts().map((c) => c.kind).slice(0, 2), ["team", "prs"]);
  assert.deepEqual([host.calls, host.asked.map((a) => a.tool)], [[], ["az"]], "az is asked for (and not found here), gh is not");
  assert.equal(b.state(b.view().id).error, "az ist nicht installiert");
  assert.ok(host.focusCalls > 0);
});

test("UI: on the shipped views.json the GitHub source loads its first view", async () => {
  const { b, st, host } = await openBoard({ config: shippedConfig() });
  assert.equal(st().data.columns.length, 5);
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec4" });
  assert.deepEqual(b.contexts().map((c) => c.view.id), ["mine", "prs"]);
  assert.deepEqual(host.asked.filter((a) => a.tool === "az"), []);
});

test("UI: a board copy that is not shown does not take the keyboard", async () => {
  memory.clear();
  const host = fakeHost({ shown: false });
  globalThis.__boardHost = host;
  new board.default().init({}, fakeCx());
  await settle();
  assert.equal(host.focusCalls, 0);
});

// Two board copies on one fake host, each loaded: the board layer's
// (props { layer: true }) and one in a Board tab, the tab shown or not, in
// the personal layout whose board layer shows `active`. `focused`: whether
// the copy took the keyboard when it started; `as()` makes props() the
// copy's own before the test drives it.
async function twoCopies(active, tabShown) {
  memory.clear();
  memory.set("source", JSON.stringify("github"));
  clockOffset = 0;
  const host = fakeHost({ shown: tabShown, tree: layerLayout(active) });
  globalThis.__boardHost = host;
  const copies = { host };
  for (const [name, props] of [["layer", { layer: true }], ["tab", {}]]) {
    host.copyProps = props;
    const before = host.focusCalls;
    const b = new board.default();
    const cx = fakeCx();
    b.init(props, cx);
    await settle();
    await host.answer("gh", ok(fixture("github-board.json")));
    copies[name] = { b, cx, focused: host.focusCalls > before, as: () => (host.copyProps = props) };
  }
  return copies;
}

test("UI: side by side, the layer's copy shows only while the layer shows the board, a Board tab's copy only while its tab shows uncovered", async () => {
  for (const [active, tabShown, want] of [
    ["board", true, { layer: true, tab: false }],
    ["main", true, { layer: false, tab: true }],
    ["main", false, { layer: false, tab: false }],
    ["board", false, { layer: true, tab: false }],
  ]) {
    const what = `the layer showing ${active}, the Board tab ${tabShown ? "shown" : "not shown"}`;
    const { host, layer, tab } = await twoCopies(active, tabShown);
    assert.deepEqual({ layer: layer.focused, tab: tab.focused }, want, `who takes the keyboard: ${what}`);
    advance(3 * 60000);
    layer.as();
    await layer.cx.tick();
    assert.equal(host.open("gh").length, Number(want.layer), `the layer's copy refreshes: ${what}`);
    while (host.open("gh").length) await host.answer("gh", ok(fixture("github-board.json")));
    tab.as();
    await tab.cx.tick();
    assert.equal(host.open("gh").length, Number(want.tab), `the tab's copy refreshes: ${what}`);
  }
});

test("UI: the board's focus command gives the keyboard to a copy that shows, not to one that does not", async () => {
  // herdr hands the command only to a copy that shows; the cases where none
  // shows model the defence against a command that arrives after a switch.
  for (const [what, options, takes] of [
    ["a Board tab shown", { shown: true }, 1],
    ["a Board tab not shown", { shown: false }, 0],
    ["the layer's copy, the layer showing the board", { shown: false, tree: layerLayout("board"), props: { layer: true } }, 1],
    ["the layer's copy behind the tab's content", { shown: false, tree: layerLayout("main"), props: { layer: true } }, 0],
    ["a Board tab shown under the layer's board", { shown: true, tree: layerLayout("board") }, 0],
  ]) {
    memory.clear();
    const host = fakeHost(options);
    let sent = false;
    host.nextCommand = () => (sent ? new Promise(() => {}) : ((sent = true), Promise.resolve("focus")));
    globalThis.__boardHost = host;
    new board.default().init(options.props ?? {}, fakeCx());
    await settle();
    // A copy that shows also took the keyboard when it started.
    assert.equal(host.focusCalls, 2 * takes, what);
  }
});

test("UI: a throw while the board handles a command, or in its timers, is said once while it repeats and ends neither", async () => {
  memory.clear();
  const host = fakeHost({ shown: true });
  const commands = ["focus", "focus", "focus"];
  host.nextCommand = () => (commands.length ? Promise.resolve(commands.shift()) : new Promise(() => {}));
  globalThis.__boardHost = host;
  const b = new board.default();
  const cx = fakeCx();
  b.init({}, cx);
  b.handle.focus = () => {
    throw new Error("focus broke");
  };
  await settle();
  assert.equal(commands.length, 0, "every command was taken");
  assert.deepEqual(host.notes.map((n) => [n.title, /focus broke/.test(n.body)]), [["Board: Befehl fehlgeschlagen", true]], "said once");
  host.layout = () => {
    throw new Error("layout broke");
  };
  await cx.look();
  await cx.look();
  const said = () => host.notes.filter((n) => n.title === "Board: Anzeige fehlgeschlagen").length;
  assert.equal(said(), 1, "the timer, said once");
  host.layout = () => null;
  await cx.look();
  host.layout = () => {
    throw new Error("layout broke");
  };
  await cx.look();
  assert.equal(said(), 2, "and again after a look that worked");
  host.layout = () => {
    throw new Error("layout broke");
  };
  await cx.tick();
  await cx.tick();
  assert.equal(host.notes.filter((n) => n.title === "Board: Neuladen fehlgeschlagen").length, 1, "the refresh timer too");
});

test("UI: herdr's props() say which copy is the layer's; the props init got stand in only where it gives none", async () => {
  const { b, host } = await openBoard({ shown: false, tree: layerLayout("board"), props: { layer: true } });
  assert.equal(b.isLayer(), true);
  host.copyProps = undefined;
  assert.equal(b.isLayer(), true, "props() give none");
  const tab = await openBoard({ tree: layerLayout("main") });
  assert.equal(tab.b.isLayer(), false);
});

test("UI: the board's keyboard goes to the start dialog's message, else the filter being typed, else the board, whose keys a status menu takes", async () => {
  const { b, cx } = await openBoard();
  const taken = () => (b.handle.held ? "board" : b.modal?.inputFocused ? "message" : b.filtering ? "filter" : "none");
  await press(b, cx, "s");
  b.handle.held = false;
  b.takeKeyboard();
  assert.deepEqual([b.modal.kind, taken()], ["status", "board"], "the status menu");
  await press(b, cx, "escape");
  await openStart(b, cx);
  b.handle.focus();
  b.takeKeyboard();
  assert.deepEqual([b.modal.field, taken()], ["message", "message"], "the start dialog on its message");
  await press(b, cx, "tab");
  b.takeKeyboard();
  assert.deepEqual([b.modal.field, taken()], ["agent", "board"], "the start dialog on another field");
  await press(b, cx, "tab", { modifiers: { shift: true } });
  assert.deepEqual([b.modal.field, taken()], ["message", "message"], "Tab back to the message gives it the keys");
  b.modal = null;
  b.filterInput.focus();
  b.handle.held = false;
  b.takeKeyboard();
  assert.equal(taken(), "filter", "the filter");
  b.filterInput.blur();
  b.takeKeyboard();
  assert.equal(taken(), "board");
});

test("UI: a copy that comes to show takes the keyboard once, after its timer or its render saw it, whoever showed it, never rendered while hidden", async () => {
  // A Board tab's copy: its tab away and back.
  const tab = await openBoard({ shown: false });
  const shownTab = (on) => (tab.host.panes = () => (on ? [{ pane: "p1", mod: "board", tab: "t1" }] : []));
  const before = tab.host.focusCalls;
  await tab.cx.look();
  shownTab(true);
  await tab.cx.look();
  assert.equal(tab.host.focusCalls, before + 1, "the timer saw it");
  await tab.cx.look();
  tab.b.render(tab.cx);
  await tab.cx.fire();
  assert.equal(tab.host.focusCalls, before + 1, "once");
  shownTab(false);
  await tab.cx.look();
  shownTab(true);
  tab.b.render(tab.cx);
  await tab.cx.fire();
  assert.equal(tab.host.focusCalls, before + 2, "or the render, back again");
  shownTab(false);
  await tab.cx.look();
  shownTab(true);
  tab.b.render(tab.cx);
  shownTab(false);
  await tab.cx.fire();
  assert.equal(tab.host.focusCalls, before + 2, "only where it still shows");
  // The layer's copy shown by a layout change, with no board.focus.
  const layer = await openBoard({ shown: false, tree: layerLayout("main"), props: { layer: true } });
  const at = layer.host.focusCalls;
  await layer.cx.look();
  layer.host.tree = layerLayout("board");
  await layer.cx.look();
  await layer.cx.look();
  assert.equal(layer.host.focusCalls, at + 1, "the layer's copy, once");
  // With the status menu open the board takes its keys; with the start
  // dialog on its message, the message; the filter, the filter.
  for (const [what, open, where] of [
    ["the status menu", (b, cx) => press(b, cx, "s"), (b) => b.handle.held],
    ["the start dialog", (b, cx) => openStart(b, cx), (b) => b.modal.inputFocused && !b.handle.held],
    ["the filter", (b) => b.filterInput.focus(), (b) => b.filtering && !b.handle.held],
  ]) {
    const copy = await openBoard({ shown: true, tree: layerLayout("main") });
    const show = (on) => (copy.host.panes = () => (on ? [{ pane: "p1", mod: "board", tab: "t1" }] : []));
    await open(copy.b, copy.cx);
    show(false);
    for (const h of copy.host.handles) h.held = false;
    await copy.cx.look();
    show(true);
    await copy.cx.look();
    assert.ok(where(copy.b), what);
  }
});

test("UI: shown again after a focus moved while it was hidden, the layer's board stays: b, b, another tab, b", async () => {
  const { host, cx, b } = await openBoard({ props: { layer: true }, shown: false, tree: layerLayout("board") });
  b.render(cx);
  await cx.fire();
  host.tree = layerLayout("main");
  await cx.look();
  host.focus = { ...host.focus, tab: "t2", pane: "p2" };
  host.tree = layerLayout("board");
  b.render(cx);
  await cx.fire();
  assert.deepEqual(host.runs, [], "shown by a render first");
  host.tree = layerLayout("main");
  await cx.look();
  host.focus = { ...host.focus, tab: "t3", pane: "p3" };
  host.tree = layerLayout("board");
  await cx.look();
  b.render(cx);
  await cx.fire();
  assert.deepEqual(host.runs, [], "or seen by the timer first");
  host.focus = { ...host.focus, tab: "t4", pane: "p4" };
  b.render(cx);
  await cx.fire();
  assert.deepEqual(host.runs, tabAgain("p4"), "a change after that still leaves");
});

test("UI: Enter to a session from the shown layer's board shows the tab's content before going to the session; behind the tab or in a tab it only goes", async () => {
  for (const [props, active, tabShown, before] of [
    [{ layer: true }, "board", false, SHOW_TAB],
    [{ layer: true }, "main", false, []],
    [{}, "main", true, []],
  ]) {
    const { b, cx, host } = await openBoard({ props, shown: tabShown, tree: layerLayout(active) });
    host.spaceList = [...host.spaceList, sessionSpace];
    await press(b, cx, "enter");
    await press(b, cx, "enter");
    assert.deepEqual(host.runs, [...before, ["space.select", { id: "s5" }], ["tab.select", { id: "t5" }]], `${props.layer ? "the layer's copy" : "a tab's copy"}, the layer showing ${active}`);
  }
});

test("UI: Enter to a session that cannot be shown names its space and tab as one sees them, else by id", async () => {
  for (const [what, gone, title] of [
    ["names", false, "Sitzung nicht gezeigt: Space „y“, Tab „tender#3004 feat(api): page through long lists“"],
    ["ids", true, "Sitzung nicht gezeigt: Space „s5“, Tab „t5“"],
  ]) {
    const { b, cx, host } = await openBoard();
    host.spaceList = [...host.spaceList, sessionSpace];
    host.run = (name) => {
      if (gone) host.spaceList = [];
      throw new Error(`${name} broke`);
    };
    await press(b, cx, "enter");
    await press(b, cx, "enter");
    assert.deepEqual(host.notes.map((n) => [n.title, n.level]), [[title, "error"]], what);
    assert.match(host.notes[0].body, /space.select broke/);
  }
});

test("UI: Esc closes the details, then the notice, then clears the filter, and then shows the tab's content again from the shown layer's board; in a tab it does nothing", async () => {
  const { b, cx, host } = await openBoard({ props: { layer: true }, shown: false, tree: layerLayout("board") });
  await press(b, cx, "enter");
  b.notice = { text: "x", level: "info" };
  b.filterInput.set_value("x");
  b.filterText = "x";
  await press(b, cx, "escape");
  assert.deepEqual([host.runs.splice(0), b.views.mine.detail, b.notice?.text], [[], false, "x"], "the details");
  await press(b, cx, "escape");
  assert.deepEqual([host.runs.splice(0), b.notice, b.filterText], [[], null, "x"], "the notice");
  await press(b, cx, "escape");
  assert.deepEqual([host.runs.splice(0), b.filterText], [[], ""], "the filter");
  await press(b, cx, "escape");
  assert.deepEqual(host.runs.splice(0), SHOW_TAB, "the tab's content");
  const inTab = await openBoard({ tree: layerLayout("main") });
  await press(inTab.b, inTab.cx, "escape");
  assert.deepEqual(inTab.host.runs, [], "a Board tab's board stays");
});

test("UI: a press outside the shown layer's board shows the tab's content after the press, any button; the pane gets the keyboard if the board still has it then", async () => {
  const { b, cx, host } = await openBoard({ props: { layer: true }, shown: false, tree: layerLayout("board") });
  const root = byId(b.render(cx), "board");
  await cx.fire();
  const [outside] = root.with.on_mouse_down_out;
  const press = (button = "left") => outside({ button, position: { x: 150, y: 300 } }, cx);
  for (const button of ["left", "right", "middle"]) {
    press(button);
    assert.deepEqual(host.runs, [], "not during the press");
    await cx.fire();
    assert.deepEqual(host.runs.splice(0), SHOW_TAB, `after a ${button} press, the board having the keyboard`);
  }
  b.filterInput.focus();
  press();
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), SHOW_TAB, "its filter having it");
  b.filterInput.blur();
  await openStart(b, cx);
  press();
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), SHOW_TAB, "the start dialog's message having it (a press on the tab bar)");
  b.modal.input.blur();
  press();
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [SHOW_TAB[0]], "the start dialog's message, left before the press: what took it keeps it");
  b.modal = null;
  b.handle.focus();
  press();
  b.handle.held = false;
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [SHOW_TAB[0]], "the press took the keyboard (Files, Changes, the leader's popup): it keeps it");
  b.handle.focus();
  press();
  host.tree = layerLayout("main");
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "the board button's press already showed the tab");
  press();
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "behind the tab's content");
  host.tree = layerLayout("board");
  root.with.on_mouse_down[1]({ button: "left" }, cx);
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "a press inside");
  const inTab = await openBoard({ tree: layerLayout("main") });
  byId(inTab.b.render(inTab.cx), "board").with.on_mouse_down_out[0]({ button: "left", position: { x: 150, y: 300 } }, inTab.cx);
  await inTab.cx.fire();
  assert.deepEqual(inTab.host.runs, [], "a Board tab's board");
});

// The layer's shown board on the fake host; render() draws it, after()
// runs what it queued and returns the commands run since.
async function shownLayerBoard() {
  const opened = await openBoard({ props: { layer: true }, shown: false, tree: layerLayout("board") });
  const after = async () => {
    await opened.cx.fire();
    return opened.host.runs.splice(0);
  };
  return { ...opened, render: () => opened.b.render(opened.cx), after };
}
const tabAgain = (pane) => [["layout.select", { stack: "work-stack", child: "main" }], ["pane.focus", { pane }]];

test("UI: while the layer's board shows, a focus on another space, tab or pane shows the tab's content after the render; the terminal and other fields do not count", async () => {
  const { host, cx, render, after } = await shownLayerBoard();
  host.focus = { space: "s1", tab: "t1", pane: "p1", terminal: "t1", cwd: "/a", agent: null, shown: null, selection: null };
  render();
  render();
  assert.deepEqual(await after(), [], "the focus the board was shown with");
  for (const change of [{ terminal: "t9" }, { cwd: "/b" }, { agent: "t9" }, { shown: "t8" }, { selection: { start: { row: 0, col: 0 }, end: { row: 0, col: 1 } } }]) {
    host.focus = { ...host.focus, ...change };
    render();
    assert.deepEqual(await after(), [], `no switch on a change of ${Object.keys(change)}`);
  }
  for (const change of [{ tab: "t2", pane: "p2" }, { space: "s2" }, { pane: "p3" }, { tab: "t3" }]) {
    host.focus = { ...host.focus, ...change };
    render();
    assert.deepEqual(host.runs, [], "not from the render itself");
    assert.deepEqual(await after(), tabAgain(host.focus.pane), `on a change of ${Object.keys(change)}`);
    render();
    assert.deepEqual(await after(), [], "once");
  }
  host.focus = { ...host.focus, tab: "t4" };
  render();
  assert.equal(cx.later.length, 1, "a switch is queued");
  host.tree = layerLayout("main");
  assert.deepEqual(await after(), [], "and goes only where the layer still shows the board");
});

test("UI: no focus at all is never the one compared with; before a first focus, the first focus becomes it", async () => {
  const { host, cx, render, after } = await shownLayerBoard();
  host.tree = layerLayout("main");
  await cx.look();
  host.tree = layerLayout("board");
  host.focus = null;
  render();
  host.focus = { space: "s1", tab: "t1", pane: "p1", terminal: "t1" };
  render();
  assert.deepEqual(await after(), [], "the first focus is the one compared with");
  host.focus = null;
  render();
  assert.deepEqual(await after(), [], "a focus gone");
  host.focus = { space: "s1", tab: "t1", pane: "p1", terminal: "t1" };
  render();
  assert.deepEqual(await after(), [], "and back");
  host.focus = { ...host.focus, pane: "p2" };
  render();
  assert.deepEqual(await after(), tabAgain("p2"));
});

test("UI: a copy started under herdr-app check takes no keyboard when it draws", async () => {
  memory.clear();
  const host = fakeHost({ shown: true });
  host.checking = () => true;
  globalThis.__boardHost = host;
  const b = new board.default();
  const cx = fakeCx();
  b.init({}, cx);
  b.render(cx);
  await cx.fire();
  assert.equal(host.focusCalls, 0);
});

test("UI: a hidden board copy is never rendered in these tests, as herdr draws only a copy that shows", async () => {
  const { b, cx } = await openBoard({ shown: false });
  assert.throws(() => b.render(cx), /herdr renders only a board copy that shows/);
});

test("UI: number keys beyond the views do nothing; [ and ] go back and forth, also with Control+Alt, not with Control alone", async () => {
  const { b, cx } = await openBoard();
  await press(b, cx, "[");
  assert.equal(b.view().id, "other", "[ from the first view wraps to the last");
  await press(b, cx, "]");
  assert.equal(b.view().id, "mine");
  await press(b, cx, "]", { modifiers: { control: true } });
  assert.equal(b.view().id, "mine");
  await press(b, cx, "]", { modifiers: { control: true, alt: true } });
  assert.equal(b.view().id, "prs");
  await press(b, cx, "4");
  assert.equal(b.view().id, "prs", "4 names no view");
  await press(b, cx, "9");
  assert.equal(b.view().id, "prs");
  await press(b, cx, "3");
  assert.equal(b.view().id, "other");
});

test("UI: a digit beyond the status menu's rows does nothing; a valid one moves the card", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "s");
  assert.equal(b.modal?.kind, "status");
  await press(b, cx, "9");
  assert.equal(b.modal?.kind, "status");
  assert.equal(host.open("gh").length, 0);
  await press(b, cx, "3");
  assert.equal(b.modal, null);
  assert.equal(host.open("gh").length, 1);
  assert.ok(host.open("gh")[0].args.includes("option=opt-in-progress"));
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "In progress");
});

test("UI: the command menu offers no „Spalte ausblenden“ on the column without status", async () => {
  const { b, cx, st, host } = await openBoard({ answer: fixture("github-board-cases.json") });
  st().sel = { col: 0, key: null };
  const entries = await openMenu(b, cx);
  assert.equal(entries.some(([name]) => name.startsWith("Spalte ausblenden")), false);
  assert.ok(entries.some(([name]) => name === "Spalten…"), "the column menu it does offer");
  await press(b, cx, "escape");
  assert.equal(memory.has("hidden:mine"), false);
  assert.equal(st().data.columns[0].hidden, false);
  assert.equal(host.open("gh").length, 0, "no refresh");
});

test("UI: a click on a hidden column's name shows it and keeps it shown when storage fails", async () => {
  const { b, cx, st, host } = await openBoard();
  const setItem = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error("full");
  };
  try {
    await click(b, cx, "show-opt-done");
  } finally {
    localStorage.setItem = setItem;
  }
  assert.equal(st().hidden.has("Done"), false);
  assert.equal(st().data.columns[4].hidden, false);
  assert.deepEqual(b.navColumns(b.view()).map((c) => c.name), ["Ready", "In progress", "In review", "Done"]);
  assert.deepEqual(texts(byId(b.render(), "hidden-columns")), ["ausgeblendet:", "Backlog"]);
  assert.ok(host.open("gh").at(-1).args.includes('filter=assignee:@me -status:"Backlog"'), "the refresh asks for Done again");
});

test("UI: hidden columns are not drawn; the line above the columns names them, h/l skip them", async () => {
  const { b, cx, st } = await openBoard();
  const root = b.render();
  assert.deepEqual(texts(byId(root, "hidden-columns")), ["ausgeblendet:", "Backlog", "Done"]);
  const drawn = texts(byId(root, "columns"));
  assert.deepEqual(["Ready", "In progress", "In review"].map((n) => drawn.includes(n)), [true, true, true]);
  assert.deepEqual(["Backlog", "Done"].map((n) => drawn.includes(n)), [false, false], "no stub");
  assert.equal(byId(root, "col-3"), null, "three columns drawn");
  await press(b, cx, "h");
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec4" }, "h stops at Ready");
  for (const k of ["l", "l", "l"]) await press(b, cx, k);
  assert.deepEqual(st().sel, { col: 2, key: null }, "l stops at In review");
  const all = await openBoard({ config: testConfig({ hide: [] }) });
  assert.equal(byId(all.b.render(), "hidden-columns"), null, "nothing hidden: no line");
});

const ALL_HIDDEN = "Alle Spalten sind ausgeblendet: ein Name oben oder „Spalten…“ im Befehlsmenü (:) zeigt eine wieder";

test("UI: with every column hidden the board says how to show one", async () => {
  const { b, cx, st } = await openBoard({ config: testConfig({ hide: ["Backlog", "Ready", "In progress", "In review", "Done"] }) });
  assert.deepEqual(st().sel, { col: 0, key: null });
  assert.equal(byId(b.render(), "columns"), null);
  assert.ok(texts(b.render()).includes(ALL_HIDDEN));
  await press(b, cx, "l");
  await press(b, cx, "enter");
  assert.equal(st().detail, false);
});

test("UI: the command menu's „Spalte ausblenden“ hides the selected column; the selection goes to the column taking its place", async () => {
  const { b, cx, st, host } = await openBoard();
  st().sel = { col: 1, key: "PVTI_rec1" };
  await runCommand(b, cx, "Spalte ausblenden: In progress");
  assert.deepEqual(b.navColumns(b.view()).map((c) => c.name), ["Ready", "In review"]);
  assert.deepEqual(texts(byId(b.render(), "hidden-columns")), ["ausgeblendet:", "Backlog", "In progress", "Done"]);
  assert.deepEqual(st().sel, { col: 1, key: null }, "In review, empty");
  assert.ok(host.open("gh").at(-1).args.includes('filter=assignee:@me -status:"Backlog","Done","In progress"'), "the refresh leaves it out");
  await host.answer("gh", ok(fixture("github-board.json")));
  await runCommand(b, cx, "Spalte ausblenden: In review");
  assert.deepEqual(b.navColumns(b.view()).map((c) => c.name), ["Ready"]);
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec4" }, "the last column hidden: the one before it, on the card in the same row");
  assert.ok(byId(b.render(), "col-0"), "one column shown is drawn");
  assert.equal(texts(b.render()).includes(ALL_HIDDEN), false);
  await click(b, cx, "show-opt-backlog");
  assert.deepEqual(st().sel, { col: 1, key: "PVTI_rec4" }, "a column shown before the selected one keeps the selection on its card");
  await runCommand(b, cx, "Spalte ausblenden: Ready");
  assert.deepEqual([b.navColumns(b.view()).map((c) => c.name), st().sel], [["Backlog"], { col: 0, key: null }]);
  await runCommand(b, cx, "Spalte ausblenden: Backlog");
  assert.deepEqual(b.navColumns(b.view()), [], "the last column shown hidden");
  assert.deepEqual(st().sel, { col: 0, key: null });
  assert.ok(texts(b.render()).includes(ALL_HIDDEN));
});

test("UI: H/L and the status menu move a card into a hidden column, and the notice says it is hidden; counts leave it out", async () => {
  const { b, cx, host, st } = await openBoard();
  const tab = () => texts(byId(b.render(), "tab-github:mine")).at(-1);
  assert.equal(tab(), "6");
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "Backlog");
  assert.equal(b.notice.text, "tender#3004 → Backlog (ausgeblendet) …");
  assert.equal(tab(), "5", "a card in a hidden column does not count");
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec5" }, "the selection stays in its column, on the card now in its row");
  assert.equal(b.selected(b.view()).key, "PVTI_rec5");
  await host.answer("gh", confirmed("PVTI_rec4"), "updateProjectV2ItemFieldValue");
  assert.equal(b.notice.text, "tender#3004 steht jetzt in „Backlog“ (ausgeblendet)");
  await press(b, cx, "s");
  assert.deepEqual(b.modal.targets.map((c) => c.name), ["Backlog", "Ready", "In progress", "In review", "Done"]);
  assert.deepEqual([0, 1].map((i) => texts(byId(b.render(), `status-${i}`)).includes("ausgeblendet")), [true, false], "the menu marks a hidden target");
  await click(b, cx, "status-4");
  assert.equal(b.modal, null);
  assert.equal(board.findCard(st().data, "PVTI_rec5").column.name, "Done", "a click on a row moves the card there");
  assert.equal(b.notice.text, "tender#3005 → Done (ausgeblendet) …");
  assert.equal(tab(), "4");
  await press(b, cx, "l", shiftL);
  assert.equal(board.findCard(st().data, "PVTI_rec6").column.name, "In progress");
  assert.equal(b.notice.text, "tender#3007 → In progress …", "a shown target is said as before");
  assert.equal(st().sel.key, "PVTI_rec6", "and the selection goes with its card");
});

test("UI: the last card of a column moved into a hidden column leaves the selection on the card now last", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "j");
  await press(b, cx, "j");
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec6" });
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec5" });
});

test("UI: a card moved into a hidden column closes its details; a move of another card leaves the selection", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "enter");
  assert.equal(st().detail, true);
  byId(b.render(), "act-status").with.on_click[0]({}, cx);
  await settle();
  assert.equal(b.modal?.kind, "status", "the detail's Status button opens the menu");
  await press(b, cx, "5");
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "Done");
  assert.deepEqual([st().sel, st().detail], [{ col: 0, key: "PVTI_rec5" }, false], "the panel shows no other card unasked");
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual([st().sel, st().detail], [{ col: 0, key: "PVTI_rec6" }, true]);
  b.moveTo(b.view(), "PVTI_rec5", "opt-done", cx);
  await settle();
  assert.deepEqual([st().sel, st().detail], [{ col: 0, key: "PVTI_rec6" }, true], "a card before the selected one moved out of sight changes nothing");
  await click(b, cx, "show-opt-backlog");
  assert.deepEqual([st().sel, st().detail], [{ col: 1, key: "PVTI_rec6" }, true], "nor a column shown: the details stay on their card");
});

test("UI: the command menu's „Spalten…“ opens the column menu: every column, shown or hidden; Enter, a digit or a click hides or shows one, and it stays open until Esc", async () => {
  const { b, cx, st, host } = await openBoard();
  await runCommand(b, cx, "Spalten…");
  assert.equal(b.modal?.kind, "columns");
  assert.deepEqual([0, 1].map((i) => byId(b.render(), `column-${i}`).styles.includes("bg")), [true, false], "the row at the cursor is marked");
  assert.ok(texts(byId(b.render(), "columns-menu")).includes("Spalten zeigen · j/k Enter · Esc"), "under its title");
  const rows = () => [0, 1, 2, 3, 4].map((i) => texts(byId(b.render(), `column-${i}`)).filter(Boolean));
  assert.deepEqual(rows(), [
    ["1", "Backlog", "265", "ausgeblendet"],
    ["2", "✓", "Ready", "3", "gezeigt"],
    ["3", "✓", "In progress", "3", "gezeigt"],
    ["4", "✓", "In review", "0", "gezeigt"],
    ["5", "Done", "957", "ausgeblendet"],
  ]);
  await press(b, cx, "enter");
  assert.equal(st().hidden.has("Backlog"), false, "Enter shows Backlog");
  assert.equal(rows()[0].at(-1), "gezeigt");
  assert.equal(b.modal?.kind, "columns", "the menu stays open");
  assert.equal(host.open("gh").length, 1, "and the board refreshes");
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.equal(st().hidden.has("Ready"), true, "j, Enter hides Ready");
  await press(b, cx, "5");
  assert.equal(st().hidden.has("Done"), false, "5 shows Done");
  assert.equal(b.modal.at, 4);
  await press(b, cx, "j");
  assert.equal(b.modal.at, 4, "j stops at the last row");
  await press(b, cx, "k");
  assert.equal(b.modal.at, 3, "k moves up");
  byId(b.render(), "column-1").with.on_click[0]({}, cx);
  await settle();
  assert.equal(st().hidden.has("Ready"), false, "a click shows Ready again");
  await press(b, cx, "9");
  assert.equal(b.modal.at, 1, "a digit beyond the rows does nothing");
  assert.deepEqual(b.navColumns(b.view()).map((c) => c.name), ["Backlog", "Ready", "In progress", "In review", "Done"]);
  await press(b, cx, "escape");
  assert.equal(b.modal, null);
  assert.deepEqual(st().sel, { col: 2, key: "PVTI_rec1" }, "Ready hidden took the selection to In progress, which kept it");
  await runCommand(b, cx, "Spalte ausblenden: In progress");
  assert.equal(st().hidden.has("In progress"), true, "„Spalte ausblenden“ still hides the selected column");
});

test("UI: the column menu says the column without status is always shown, and leaves it so", async () => {
  const { b, cx, st } = await openBoard({ answer: fixture("github-board-cases.json") });
  await runCommand(b, cx, "Spalten…");
  assert.equal(b.modal?.kind, "columns");
  assert.deepEqual(texts(byId(b.render(), "column-0")).filter(Boolean).at(-1), "immer gezeigt");
  await press(b, cx, "enter");
  assert.equal(st().data.columns[0].hidden, false);
  assert.equal(b.notice.text, "„Ohne Status“ lässt sich nicht ausblenden");
});

test("UI: a second move of a card is refused while the first is written; a refusal moves it back", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "In progress");
  await press(b, cx, "l", shiftL);
  assert.equal(host.open("gh").length, 1, "no second write");
  assert.match(b.notice.text, /wird noch gespeichert/);
  const refused = '{"data":{"updateProjectV2ItemFieldValue":null},"errors":[{"type":"FORBIDDEN","path":["updateProjectV2ItemFieldValue"],"message":"Resource not accessible by integration"}]}';
  await host.answer("gh", { code: 1, stdout: refused, stderr: "gh: Resource not accessible by integration" });
  assert.equal(host.open("gh").length, 0, "a plain refusal asks GitHub nothing more");
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "Ready");
  assert.equal(st().pending.PVTI_rec4, undefined);
  assert.equal(b.notice.text, "tender#3004 bleibt in „Ready“: Resource not accessible by integration");
  assert.equal(host.notes.at(-1).level, "error");
});

test("UI: a write without a clear answer keeps the card, says „Ergebnis unklar“ once, and the next refresh says where it is", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "In progress");
  assert.equal(b.notice.text, "tender#3004 → In progress: Ergebnis unklar: gh antwortete nicht in 30 s; lädt neu");
  assert.deepEqual(host.notes.at(-1), { title: "Status von tender#3004", body: "Ergebnis unklar: gh antwortete nicht in 30 s", level: "warning" });
  assert.equal(host.open("gh").length, 1, "a refresh asks GitHub");
  await host.answer("gh", ok(fixture("github-board.json")));
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“");
  assert.equal(b.notice.level, "warning");
  assert.deepEqual(host.notes.at(-1), { title: "Status nach dem Neuladen", body: "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“", level: "warning" });
});

// github-board.json with a card moved to another option, or left out.
function boardWith(change) {
  const data = json("github-board.json");
  change(data.data.repositoryOwner.projectV2.items.nodes);
  return JSON.stringify(data);
}

test("UI: after an unclear write, a card in its target is said as landed; one in a hidden target as not shown", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await host.answer("gh", ok(boardWith((nodes) => (nodes.find((n) => n.id === "PVTI_rec4").fieldValueByName.optionId = "opt-in-progress"))));
  assert.deepEqual([b.notice.text, b.notice.level], ["tender#3004 steht nach dem Neuladen in „In progress“", "info"]);
  await press(b, cx, "s");
  await press(b, cx, "5");
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await host.answer("gh", ok(boardWith((nodes) => nodes.splice(nodes.findIndex((n) => n.id === "PVTI_rec4"), 1))));
  assert.deepEqual([b.notice.text, b.notice.level], ["tender#3004 steht nicht in den gezeigten Spalten („Done“ ist ausgeblendet)", "info"]);
});

test("UI: a refresh that read before an unclear write ended says nothing about it; the one after does", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "r");
  advance(5);
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  const unclear = b.notice.text;
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, unclear, "the refresh that started before the outcome settles nothing");
  assert.equal(host.open("gh").length, 1, "the follow-up refresh");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“");
});
test("UI: a card gone from its shown target is said as not shown while columns are hidden, else as not on the board", async () => {
  const gone = ok(boardWith((nodes) => nodes.splice(nodes.findIndex((n) => n.id === "PVTI_rec4"), 1)));
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await host.answer("gh", gone);
  assert.deepEqual([b.notice.text, b.notice.level], ["tender#3004 steht nicht in den gezeigten Spalten (ausgeblendet: „Backlog“, „Done“)", "warning"]);
  const all = await openBoard({ config: testConfig({ hide: [] }) });
  await press(all.b, all.cx, "l", shiftL);
  await all.host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await all.host.answer("gh", gone);
  assert.deepEqual([all.b.notice.text, all.b.notice.level], ["tender#3004 ist nach dem Neuladen nicht auf dem Board", "warning"]);
  assert.deepEqual(all.host.notes.at(-1), { title: "Status nach dem Neuladen", body: "tender#3004 ist nach dem Neuladen nicht auf dem Board", level: "warning" });
});

test("UI: a new move of a card that lands drops the open outcome of its earlier one", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  assert.equal(st().unclear.length, 1, "kept while the new write is under way");
  await host.answer("gh", confirmed("PVTI_rec4"), "updateProjectV2ItemFieldValue");
  assert.deepEqual(st().unclear, []);
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 steht jetzt in „Ready“", "no word on the earlier move");
});

test("UI: a new move of a card that is unclear too replaces the open outcome of its earlier one", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  assert.deepEqual(st().unclear.map((u) => u.to.name), ["Ready"]);
});

test("UI: a new move of a card that is refused keeps the open outcome of its earlier one", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  const refused = '{"data":{"updateProjectV2ItemFieldValue":null},"errors":[{"type":"FORBIDDEN","path":["updateProjectV2ItemFieldValue"],"message":"Resource not accessible by integration"}]}';
  await host.answer("gh", { code: 1, stdout: refused, stderr: "gh: Resource not accessible by integration" }, "updateProjectV2ItemFieldValue");
  assert.equal(st().unclear.length, 1);
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“");
});

test("UI: r with views.json unchanged, or after an invalid one was fixed, keeps an open outcome for the next refresh", async () => {
  for (const broken of [false, true]) {
    const { b, cx, host, st } = await openBoard();
    await press(b, cx, "l", shiftL);
    await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
    if (broken) {
      host.config = "{ views: [";
      await press(b, cx, "r");
      assert.equal(b.config, null);
      host.config = testConfig();
    }
    await press(b, cx, "r");
    assert.equal(st().unclear.length, 1, broken ? "after a fixed views.json" : "after r");
    await host.answer("gh", ok(fixture("github-board.json")), "items(first");
    assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“");
  }
});

test("UI: a write under way while r makes its view a list leaves nothing open", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  const config = JSON.parse(testConfig());
  config.sources.github.views[0] = { id: "mine", name: "Mine", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] };
  host.config = JSON.stringify(config);
  await press(b, cx, "r");
  assert.ok(texts(b.render()).includes("In progress"), "until the list is read, the board's data is drawn as a board");
  await host.answer("gh", ok(fixture("github-list.json")), "search(");
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  assert.equal(b.notice.text, "tender#3004 → In progress: Ergebnis unklar: gh antwortete nicht in 30 s", "no follow-up promised");
  assert.deepEqual(b.views.mine.unclear, []);
  assert.equal(host.open("gh").length, 0, "no refresh of a board that is gone");
  assert.equal(b.views.mine.error, null);
});

test("UI: a write under way while r removes its view promises no follow-up", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  host.config = withoutMine();
  await press(b, cx, "r");
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  assert.equal(b.notice.text, "tender#3004 → In progress: Ergebnis unklar: gh antwortete nicht in 30 s");
  assert.deepEqual(b.views.mine.unclear, []);
});

test("UI: a write that ends unclear after r read an invalid views.json is told once views.json is fixed", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  host.config = "{ views: [";
  await press(b, cx, "r");
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  assert.equal(b.notice.text, "tender#3004 → In progress: Ergebnis unklar: gh antwortete nicht in 30 s; wird nach dem nächsten Neuladen gemeldet");
  assert.equal(st().unclear.length, 1);
  assert.equal(host.open("gh").length, 0, "nothing reloads while views.json is invalid");
  host.config = testConfig();
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“");
});

test("UI: an unclear outcome waits for a later write of its card and is then told by the server's answer", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await press(b, cx, "l", shiftL);
  assert.equal(st().pending.PVTI_rec4, true, "the second write is under way");
  const notes = host.notes.length;
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 → In review …", "no word while the second write is open");
  assert.equal(host.notes.length, notes);
  assert.equal(st().unclear.length, 1);
  const refused = '{"data":{"updateProjectV2ItemFieldValue":null},"errors":[{"type":"FORBIDDEN","path":["updateProjectV2ItemFieldValue"],"message":"Resource not accessible by integration"}]}';
  await host.answer("gh", { code: 1, stdout: refused, stderr: "gh: Resource not accessible by integration" }, "updateProjectV2ItemFieldValue");
  assert.equal(b.notice.text, "tender#3004 → In review nicht gespeichert: Resource not accessible by integration", "no column claimed while the first outcome is open");
  assert.equal(host.open("gh").length, 1, "the refusal asks GitHub for the first write's outcome");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“", "by the server, not by the overlay");
});

test("UI: a refresh that fails while a later write of the card is under way leaves its open outcome unsaid", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await press(b, cx, "l", shiftL);
  await host.answer("gh", { code: 1, stdout: "", stderr: GH_DNS }, "items(first");
  assert.equal(b.notice.text, "tender#3004 → In review …", "no „weiter offen“ for an outcome that is not due");
  assert.equal(st().unclear.length, 1);
  const refused = '{"data":{"updateProjectV2ItemFieldValue":null},"errors":[{"type":"FORBIDDEN","path":["updateProjectV2ItemFieldValue"],"message":"Resource not accessible by integration"}]}';
  await host.answer("gh", { code: 1, stdout: refused, stderr: "gh: Resource not accessible by integration" }, "updateProjectV2ItemFieldValue");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“");
});

test("UI: a later write refused while views.json is invalid starts no refresh", async () => {
  const { b, cx, host, st } = await openBoard();
  const view = b.view();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  // Its refresh stays unanswered, so the outcome stays open.
  host.config = "{ views: [";
  await press(b, cx, "r");
  const calls = host.calls.length;
  b.moveTo(view, "PVTI_rec4", "opt-in-review", cx);
  await settle();
  const refused = '{"data":{"updateProjectV2ItemFieldValue":null},"errors":[{"type":"FORBIDDEN","path":["updateProjectV2ItemFieldValue"],"message":"Resource not accessible by integration"}]}';
  await host.answer("gh", { code: 1, stdout: refused, stderr: "gh: Resource not accessible by integration" }, "updateProjectV2ItemFieldValue");
  assert.equal(host.calls.length, calls + 1, "only the write");
  assert.equal(st().error, null);
  assert.equal(st().unclear.length, 1);
});

test("UI: open outcomes of a view that is no board any more are dropped without a word", async () => {
  const { b, cx } = await openBoard();
  const st = b.views.mine;
  st.data = board.parseGithubList(json("github-list.json"), listView());
  st.unclear = [{ key: "PVTI_rec4", label: "tender#3004", kind: "move", to: { id: "opt-in-progress", name: "In progress" }, at: 0 }];
  b.notice = null;
  b.settleUnclear(b.config.github.views[0], 1, st.data, cx);
  assert.deepEqual([st.unclear, b.notice], [[], null]);
});

test("UI: r drops the open outcomes of a view that became a list", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  const config = JSON.parse(testConfig());
  config.sources.github.views[0] = { id: "mine", name: "Mine", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] };
  host.config = JSON.stringify(config);
  await press(b, cx, "r");
  assert.deepEqual(b.views.mine.unclear, []);
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  await host.answer("gh", ok(fixture("github-list.json")), "search(");
  assert.equal(b.views.mine.error, null);
  assert.equal(b.views.mine.data.shape, "prs");
});

test("UI: a refresh settles the outcomes that came before it started and keeps the later ones for the next", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  advance(5);
  b.views.mine.sel = { col: 2, key: "PVTI_rec1" };
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“, nicht in „In progress“", "only the first write's outcome");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(b.notice.text, "tender#3000 steht nach dem Neuladen in „In progress“, nicht in „In review“");
});

test("UI: a refresh that read before an unclear write ended and then failed says nothing about it", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "r");
  advance(5);
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  const unclear = b.notice.text;
  await host.answer("gh", { code: 1, stdout: "", stderr: GH_DNS }, "items(first");
  assert.equal(b.notice.text, unclear);
});

test("UI: a refresh that fails after an unclear write says the outcome is still open", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  await host.answer("gh", { code: 1, stdout: "", stderr: GH_DNS });
  assert.equal(b.notice.text, "tender#3004: Ergebnis weiter offen, Neuladen fehlgeschlagen (GitHub nicht erreichbar: error connecting to api.github.com)");
});

test("UI: r forgets the open outcomes of views no longer in views.json", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", stopped(found("gh")), "updateProjectV2ItemFieldValue");
  assert.equal(b.views.mine.unclear.length, 1);
  host.config = withoutMine();
  await press(b, cx, "r");
  assert.deepEqual(b.views.mine.unclear, []);
});
test("UI: a refresh during a write keeps the move until the write is confirmed", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await new Promise((r) => setTimeout(r, 5)); // the refresh starts after the move, not in its millisecond
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "In progress", "the old server state does not undo the move");
  await host.answer("gh", confirmed("PVTI_rec4"));
  assert.match(b.notice.text, /steht jetzt in „In progress“/);
  assert.equal(st().moves.length, 1, "kept until a refresh starts after the confirmation");
});

test("UI: the refresh that follows a running one reads the view from the config as it is now", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "r");
  host.config = testConfig({ filter: "assignee:@me label:urgent" });
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  const follow = host.open("gh").find((c) => c.args.some((a) => a.startsWith("filter=")));
  assert.ok(follow.args.includes('filter=assignee:@me label:urgent -status:"Backlog","Done"'));
});

// Opens the start dialog for the selected card with Enter twice.
async function openStart(b, cx) {
  await press(b, cx, "enter");
  await press(b, cx, "enter");
  assert.equal(b.modal?.kind, "start");
}

test("UI: Enter in the dialog opens the session in the checkout; Esc does nothing while it starts", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  assert.equal(b.modal.input.value(), "/work 3004");
  await press(b, cx, "tab");
  assert.equal(b.modal.field, "agent");
  await press(b, cx, "enter");
  assert.equal(b.modal.busy, "Sitzung wird geöffnet …");
  await press(b, cx, "escape");
  assert.equal(b.modal?.kind, "start", "Esc does nothing while it starts");
  assert.deepEqual(host.open("sh")[0].args.slice(-1), ["~/src/tender"]);
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(b.modal, null);
  const name = "tender#3004 feat(api): page through long lists";
  assert.deepEqual(host.runs.at(-1), ["space.new", { name, tab: name, machine: "", folder: "/home/me/src/tender", argv: ["claude"], task: "/work 3004" }]);
  assert.equal(b.notice.text, `Sitzung wird geöffnet: ${name}`);
  await cx.fire();
  assert.equal(b.notice.text, `Sitzung wird geöffnet: ${name}`, "not there at the first check");
  host.spaceList = [...host.spaceList, { id: "s9", name, folder: "/home/me/src/tender", machine: null, branch: "main", active: false, status: null, tabs: [{ id: "t9", name }] }];
  await cx.fire();
  assert.equal(b.notice.text, `Sitzung geöffnet: ${name}`);
});

test("UI: a session that does not appear is warned about after the last check only", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  board.startModal.start(b, cx);
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  const notes = host.notes.length;
  await cx.fire();
  await cx.fire();
  assert.match(b.notice.text, /^Sitzung wird geöffnet/, "no warning before the last check");
  assert.equal(host.notes.length, notes);
  await cx.fire();
  assert.equal(b.notice.text, "Kein Space und kein Tab „tender#3004 feat(api): page through long lists“ erschienen; die Sitzung ist wohl nicht gestartet");
  assert.equal(host.notes.at(-1).level, "warning");
});
test("UI: a checkout that is missing, or no space for a tab, is said in the dialog, which stays", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  board.startModal.start(b, cx);
  await settle();
  await host.answer("sh", { code: 3, stdout: "", stderr: "Kein Checkout unter /home/me/src/tender\n" });
  assert.equal(b.modal?.kind, "start");
  assert.equal(b.modal.error, "Kein Checkout unter /home/me/src/tender");
  assert.equal(b.modal.busy, null);
  assert.equal(host.runs.length, 0);
  board.startModal.start(b, cx);
  await settle();
  await host.answer("sh", ok(""));
  assert.equal(b.modal.error, "Checkout-Ordner nicht gelesen");
});

test("UI: another machine in the dialog runs the checkout there; a tab needs a space on it", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  assert.equal(b.modal.field, "machine");
  await press(b, cx, "l");
  await settle();
  await press(b, cx, "tab");
  await press(b, cx, "l");
  assert.equal(b.modal.open, "tab");
  await press(b, cx, "enter");
  assert.equal(host.open("sh")[0].options.on, "server");
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(b.modal.error, "Kein Space auf server für einen neuen Tab; als neuer Space öffnen");
  assert.equal(host.runs.length, 0);
});

test("UI: a tab on this machine needs a space here; one in the same folder on another machine does not count", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ id: "s2", name: "y", folder: "/home/me/src/tender", machine: "server", branch: "main", active: true, status: null, tabs: [{ id: "t1", name: "Board", active: true }] }];
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  await press(b, cx, "l");
  assert.equal(b.modal.open, "tab");
  await press(b, cx, "enter");
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(b.modal.error, "Kein Space auf diesem Rechner für einen neuen Tab; als neuer Space öffnen");
  assert.deepEqual(host.runs, []);
});

test("UI: Enter twice on a card with a session goes to it", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [...host.spaceList, { id: "s5", name: "y", folder: "/r/tender", machine: null, branch: "main", active: false, status: "working",
    tabs: [{ id: "t5", name: "tender#3004 feat(api): page through long lists", status: "working" }] }];
  await press(b, cx, "enter");
  await press(b, cx, "enter");
  assert.equal(b.modal, null);
  assert.deepEqual(host.runs, [["space.select", { id: "s5" }], ["tab.select", { id: "t5" }]]);
});

test("UI: a card whose repo has no checkout names where to set one", async () => {
  const config = JSON.parse(testConfig());
  config.repos = {};
  const { b, cx } = await openBoard({ config: JSON.stringify(config) });
  await press(b, cx, "enter");
  await press(b, cx, "enter");
  assert.equal(b.modal, null);
  assert.equal(b.notice.text, "Für example/tender steht kein „checkout“ in views.json: „repos“ → „example/tender“ oder „start.checkout“ der Ansicht „Mine“");
});

test("UI: Enter on a draft says it needs an issue first", async () => {
  const { b, cx, st } = await openBoard({ answer: fixture("github-board-cases.json") });
  st().sel = { col: 0, key: "PVTI_case2" };
  await press(b, cx, "enter");
  await press(b, cx, "enter");
  assert.equal(b.modal, null);
  assert.equal(b.notice.text, "Entwurf ohne Repo: erst in ein Issue umwandeln");
});

test("UI: a configured machine or agent that is missing is said in the dialog", async () => {
  const { b, cx } = await openBoard({ config: testConfig({ start: { agent: "codex", machine: "laptop" } }) });
  await openStart(b, cx);
  await settle();
  assert.match(b.modal.notes.join("\n"), /Rechner „laptop“ ist nicht verbunden/);
  assert.match(b.modal.notes.join("\n"), /Agent „codex“ ist auf diesem Rechner nicht installiert/);
});

test("UI: agents that cannot be read are said for the machine they were asked on", async () => {
  const { b, cx, host } = await openBoard();
  host.knownAgents = async () => {
    throw new Error("agent check failed\nmore");
  };
  await openStart(b, cx);
  assert.equal(b.modal.agentsError, "Agents auf diesem Rechner nicht lesbar: agent check failed");
});

test("UI: agents asked of a machine no longer chosen are ignored, also when the ask fails", async () => {
  const { b, cx, host } = await openBoard();
  const asks = [];
  host.knownAgents = ({ on }) => {
    const d = deferred();
    asks.push({ on, ...d });
    return d.promise;
  };
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  await press(b, cx, "l");
  assert.deepEqual(asks.map((a) => a.on), [null, "server"]);
  asks[0].reject(new Error("too late"));
  await settle();
  assert.equal(b.modal.agentsError, null);
  asks[1].resolve([{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }]);
  await settle();
  assert.equal(b.modal.agents.length, 1);
});
// ---- UI: gh by the shell's path ----

test("UI: gh runs by the path the shell gives, asked once per machine until r", async () => {
  const which = (tool) => (tool === "gh" ? "/home/linuxbrew/.linuxbrew/bin/gh" : "/opt/az/bin/az");
  const { b, cx, host, st } = await bootBoard({ which });
  await host.answer("gh", ok(fixture("github-board.json")));
  assert.deepEqual([...new Set(host.calls.map((c) => c.tool))], ["/home/linuxbrew/.linuxbrew/bin/gh"]);
  assert.deepEqual(host.asked.filter((a) => a.tool === "gh"), [{ tool: "gh", on: null, timeout: 30000 }]);
  assert.ok(st().data, "loaded");
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(fixture("github-board.json")));
  assert.equal(host.asked.filter((a) => a.tool === "gh").length, 1, "a refresh runs the path found before");
  await press(b, cx, "r");
  assert.equal(host.asked.filter((a) => a.tool === "gh").length, 2, "r asks the shell again");
  assert.equal(host.open("gh")[0].tool, "/home/linuxbrew/.linuxbrew/bin/gh");
});

test("UI: gh that the shell does not find is not installed", async () => {
  const { host, st } = await bootBoard({ which: () => "" });
  assert.deepEqual(host.calls, [], "nothing runs");
  assert.equal(st().error, "gh ist nicht installiert");
});

test("UI: a shell that cannot be asked says so, not that gh is missing", async () => {
  const { st } = await bootBoard({ which: (tool) => (tool === "gh" ? stopped("sh") : "") });
  assert.equal(st().error, "Pfad von gh nicht ermittelt: die Shell antwortete nicht in 30 s");
});

test("UI: a read that herdr stops at its timeout says gh did not answer", async () => {
  const { b, cx, host, st } = await openBoard();
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", stopped(found("gh")));
  assert.equal(st().error, "gh antwortete nicht in 30 s");
});

test("UI: a program gone from the path found is asked for again and run in the same call; a timeout keeps the path", async () => {
  const { b, cx, host, st } = await openBoard();
  const asks = () => host.asked.filter((a) => a.tool === "gh").length;
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", stopped(found("gh")));
  b.refresh(b.view(), cx);
  await settle();
  assert.equal(asks(), 1, "kept after a timeout");
  host.which = () => "/home/linuxbrew/.linuxbrew/bin/gh";
  await host.answer("gh", notRun(found("gh")));
  assert.equal(asks(), 2, "asked again at once");
  assert.equal(host.open("gh")[0].tool, "/home/linuxbrew/.linuxbrew/bin/gh", "and run from the new path");
  await host.answer("gh", ok(fixture("github-board.json")));
  assert.equal(st().error, null);
});

test("UI: a program the shell no longer finds is not installed at once; one it finds but that does not start says so", async () => {
  const { b, cx, host } = await openBoard();
  host.which = () => "";
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", notRun(found("gh")));
  assert.equal(b.views.mine.error, "gh ist nicht installiert");
  assert.equal(host.open("gh").length, 0, "not run again");
  host.which = found;
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", notRun(found("gh")));
  await host.answer("gh", notRun(found("gh")));
  assert.equal(b.views.mine.error, "gh ließ sich nicht starten: cannot run /opt/fake/bin/gh: No such file or directory (os error 2)");
});

test("UI: a move whose lookup fails is a plain refusal: the card goes back, nothing is unclear", async () => {
  const { b, cx, host, st } = await openBoard();
  b.paths.reset();
  host.which = () => stopped("sh");
  const before = board.findCard(st().data, "PVTI_rec4").column.id;
  await press(b, cx, "l", shiftL);
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.id, before, "moved back");
  assert.deepEqual(st().unclear, []);
  assert.match(b.notice.text, /Pfad von gh nicht ermittelt: die Shell antwortete nicht in 30 s/);
  assert.doesNotMatch(b.notice.text, /Ergebnis unklar/);
});

// ---- UI: drawing ----

// The elements from `el` down to the first element `pick` takes, or null.
function chainTo(el, pick) {
  if (!el || typeof el === "string") return null;
  if (pick(el)) return [el];
  for (const kid of el.kids) {
    const below = chainTo(kid, pick);
    if (below) return [el, ...below];
  }
  return null;
}

// Picks the element with the id `id`.
const hasId = (id) => (el) => el.with.id?.[0] === id;
// The element with the id `id` under `el`, or null.
const byId = (el, id) => chainTo(el, hasId(id))?.at(-1) ?? null;

// The elements from `el` down to the first text `match` (a function, or a
// text it holds), or null.
function pathTo(el, match) {
  const hit = typeof match === "function" ? match : (s) => s.includes(match);
  if (typeof el === "string") return hit(el) ? [] : null;
  for (const kid of el?.kids ?? []) {
    const below = pathTo(kid, hit);
    if (below) return [el, ...below];
  }
  return null;
}

test("the board is named Board: its mod, the tab the leader opens and its header without a view", async () => {
  assert.equal(JSON.parse(readFileSync(join(modDir, "mod.json"), "utf8")).title, "Board");
  const leader = readFileSync(resolve(modDir, "../leader/main.js"), "utf8");
  assert.ok(leader.includes('run("tab.new", { name: "Board", mod: "board" });'), "the leader opens the tab as Board");
  const { b } = await bootBoard({ config: "{" });
  assert.ok(pathTo(b.render(), (s) => s === "Board"), "the header names the board");
});

// How an element lines up its children across its axis: its last items_*,
// else h_flex's own items_center (gpui-base), else stretched.
const crossAlign = (el) => el.styles.filter((s) => s.startsWith("items_")).at(-1) ?? (el.kind === "h_flex" ? "items_center" : "items_stretch");
// A row: an h_flex, or a div made flex without flex_col.
const isRow = (el) => el.kind === "h_flex" || (el.kind === "div" && el.styles.includes("flex") && !el.styles.includes("flex_col"));
// Whether `parent` centres `child` in the height: a row whose items line up
// in the centre, unless the child takes the full height; a v_flex that
// justifies its children to the centre; or a child that centres itself
// (counted under any parent, the safe side).
const centres = (parent, child) =>
  (isRow(parent) && crossAlign(parent) === "items_center" && !child.styles.includes("h_full")) ||
  (parent.kind === "v_flex" && parent.styles.includes("justify_center")) ||
  child.styles.includes("self_center");
// The elements of a chain (root first) that centre the next one in it.
const centring = (chain) => chain.slice(0, -1).filter((el, i) => centres(el, chain[i + 1])).map((el) => el.kind);

test("UI: no sidebar: the content fills the width under the top bar, and it and its error start at the top", async () => {
  const { b, st } = await bootBoard({ which: (tool) => (tool === "gh" ? "" : "/opt/fake/bin/az") });
  assert.equal(st().error, "gh ist nicht installiert");
  const root = b.render();
  assert.equal(pathTo(root, "ANSICHTEN"), null, "no sidebar");
  const chain = pathTo(root, "gh ist nicht installiert");
  assert.ok(chain);
  assert.deepEqual(centring(chain), [], "no row centres the error");
  const row = chain.filter((el) => el.kind === "h_flex").at(-1);
  assert.equal(crossAlign(row), "items_stretch", "the content's row stretches it to the full height");
  assert.equal(row.kids.length, 1, "the content alone in its row, without the detail");
  assert.ok(chainTo(root, hasId("tabs")), "the tabs stand in the top bar");
});

test("UI: the board, the line naming its hidden columns and the detail beside it start at the top", async () => {
  const { b, cx } = await openBoard();
  await press(b, cx, "enter");
  assert.equal(b.views.mine.detail, true);
  const root = b.render();
  const detail = pathTo(root, "SITZUNG");
  assert.ok(detail);
  assert.deepEqual(centring(detail), [], "no row centres the detail");
  // A column's name sits in its head, a centring row of its own.
  const name = b.views.mine.data.columns.find((c) => !c.hidden).name;
  const column = pathTo(root, (s) => s === name);
  assert.ok(column, name);
  assert.deepEqual(centring(column.slice(0, -2)), [], "no row centres the columns");
  const line = chainTo(root, hasId("hidden-columns"));
  assert.ok(line, "the line naming the hidden columns");
  assert.deepEqual(centring(line), [], "no row centres it");
});

// A column: a v_flex, or a div made flex with flex_col.
const isColumn = (el) => el.kind === "v_flex" || (el.kind === "div" && el.styles.includes("flex") && el.styles.includes("flex_col"));
// Whether `child` takes its height from `parent`: in a column by flex_1 and
// min_h(0) (it may be lower than its content), in a row by the row's
// stretch or its own h_full, in a plain block by its own h_full.
const heightFrom = (parent, child) => {
  if (isColumn(parent)) return child.styles.includes("flex_1") && child.with.min_h?.[0] === 0;
  if (isRow(parent)) return crossAlign(parent) === "items_stretch" || child.styles.includes("h_full");
  return child.styles.includes("h_full");
};

test("UI: a column's card list takes its height from the board, step by step, and scrolls in it", async () => {
  const { b } = await openBoard();
  const root = b.render();
  const at = b.navColumns(b.view()).findIndex((c) => !c.hidden && c.shown.length);
  assert.ok(root.styles.includes("size_full"), "the board fills its block");
  const chain = chainTo(root, hasId(`cards-${at}`));
  assert.ok(chain, "a card list");
  chain.slice(1).forEach((child, i) => assert.ok(heightFrom(chain[i], child), `step ${i + 1}: a ${child.kind} in a ${chain[i].kind}`));
  const list = chain.at(-1);
  assert.ok(list.styles.includes("overflow_y_scrollbar"), "the list scrolls");
  assert.deepEqual(list.with.min_h, [0], "and may be lower than its cards");
  const column = byId(root, `col-${at}`);
  assert.ok(chain.includes(column), "the list is in its column");
  assert.deepEqual(column.with.min_h, [0], "which may be lower than its content");
});

// ---- UI: the top bar ----

// Every text under `el`, in order.
const texts = (el) => (typeof el === "string" ? [el] : (el?.kids ?? []).flatMap(texts));
// The hint line's keys, as it names them.
const hintKeys = (b) => {
  const line = b.render().kids.at(-1);
  return line.kids.map((h) => texts(h)[0]);
};
// Clicks the element with the id `id` in what the board draws now.
async function click(b, cx, id) {
  const el = byId(b.render(), id);
  assert.ok(el, `no ${id}`);
  cx.call((own) => el.with.on_click[0]({}, own));
  await settle();
}

// The open command menu's entries as its filter leaves them, in its
// order: [name, key] (key null where it shows none).
const menuEntries = (b) => board.shownCommands(b.modal.entries, b.modal.filter).map((e) => [e.name, e.key]);
// Opens the command menu with `:`, as herdr sends it whatever the layout:
// key and character ":", Shift cleared (herdr 0.1.17's keystroke_from_xkb
// clears it for a key that types one symbol; its quickjs bridge hands key
// and key_char on as they are); its entries.
async function openMenu(b, cx) {
  await press(b, cx, ":");
  assert.equal(b.modal?.kind, "commands");
  return menuEntries(b);
}
// Runs the command menu's action `name`: typed into its filter, where it
// comes first, then Enter.
async function runCommand(b, cx, name) {
  await openMenu(b, cx);
  b.modal.input.type(name);
  assert.equal(menuEntries(b)[0]?.[0], name, `${name} comes first`);
  cx.call((own) => b.modal.input.submit(own));
  await settle();
}

test("UI: the top bar has two rows, toggle, tabs and switch above, „nur meine“, filter and refresh below; the hint line wraps", async () => {
  const { b } = await bootBoard({ stored: { source: "azure" } });
  const root = b.render();
  const bar = byId(root, "top-bar");
  assert.equal(bar.kids.length, 2);
  const [nav, tools] = bar.kids;
  assert.deepEqual(nav.kids.map((k) => k.with.id?.[0]), ["source", "tabs", "team-view"]);
  assert.deepEqual(tools.kids.map((k) => k.with.id?.[0]).filter(Boolean), ["mine", "filter", "refresh"]);
  assert.ok(root.kids.at(-1).styles.includes("flex_wrap"), "a narrow screen wraps the keys rather than cut them off");
});

test("UI: the command menu's „Quelle wechseln“ and a click on a source switch between Azure and GitHub, each keeping its tab, without reading a fresh view again", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "2");
  assert.equal(b.context().id, "github:prs");
  await host.answer("gh", ok(fixture("github-list.json")));
  await runCommand(b, cx, "Quelle wechseln: Azure");
  assert.deepEqual([b.source().id, b.context().id], ["azure", "azure:team:Example Project/Example Team"]);
  await press(b, cx, "]");
  assert.equal(b.context().id, "azure:prs:Example Project");
  await runCommand(b, cx, "Quelle wechseln: GitHub");
  assert.deepEqual([b.source().id, b.context().id], ["github", "github:prs"]);
  assert.equal(host.open("gh").length, 0, "the list is fresh");
  await click(b, cx, "source-azure");
  assert.deepEqual([b.source().id, b.context().id], ["azure", "azure:prs:Example Project"], "a click on the source's name");
});

test("UI: a new board opens on the source, tab and team view shown last; ones views.json no longer has fall back to the first", async () => {
  const { b, cx, host } = await openBoard();
  await click(b, cx, "source-azure");
  await press(b, cx, "v");
  await press(b, cx, "2");
  const again = new board.default();
  const cx2 = fakeCx();
  again.init({}, cx2);
  await settle();
  assert.deepEqual([again.source().id, again.context().id], ["azure", "azure:prs:Example Project"]);
  await press(again, cx2, "1");
  assert.equal(again.teamViewOf(again.context()), "backlog");
  assert.deepEqual(host.open("gh"), [], "an Azure tab reads nothing");
  memory.set("tab:azure", JSON.stringify("azure:team:Gone/Team"));
  memory.set("teamView:azure:team:Example Project/Example Team", JSON.stringify("kanban"));
  const third = new board.default();
  third.init({}, fakeCx());
  await settle();
  assert.deepEqual([third.context().id, third.teamViewOf(third.context())], ["azure:team:Example Project/Example Team", "sprint"]);
});

test("UI: a board that kept the old shown view opens on that GitHub view, once; later choices stay", async () => {
  const { b, host } = await bootBoard({ stored: { view: "prs" } });
  assert.deepEqual([b.source().id, b.context().id], ["github", "github:prs"]);
  await host.answer("gh", ok(fixture("github-list.json")));
  assert.equal(memory.get("view"), "null", "migrated once");
  const { b: kept } = await bootBoard({ stored: { view: "prs", source: "azure", "tab:github": "github:other" } });
  assert.equal(kept.source().id, "azure", "a source chosen since stays");
  assert.equal(JSON.parse(memory.get("tab:github")), "github:other");
});

test("UI: „nur meine“ lasts across reloads; without a valid views.json m does nothing and has no hint", async () => {
  const { b, cx } = await bootBoard({ stored: { source: "azure" } });
  await press(b, cx, "m");
  const again = new board.default();
  again.init({}, fakeCx());
  await settle();
  assert.equal(again.mine, true);
  const { b: broken, cx: cx2 } = await bootBoard({ config: "{" });
  await press(broken, cx2, "m");
  assert.equal(broken.mine, false);
  assert.equal(hintKeys(broken).includes("m"), false);
});

test("UI: digits and [ ] pick the shown source's tabs; a digit beyond them does nothing", async () => {
  const { b, cx } = await bootBoard({ stored: { source: "azure" } });
  await press(b, cx, "3");
  assert.equal(b.context().kind, "team", "3 names no Azure tab");
  await press(b, cx, "[");
  assert.equal(b.context().kind, "prs", "[ from the first tab wraps to the last");
  await press(b, cx, "]");
  assert.equal(b.context().kind, "team");
});

test("UI: an Azure team tab shows its Sprint or its Backlog, and v switches them; the PRs tab its list to come; the hints follow", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" } });
  const shown = () => texts(b.render());
  const layout = () => b.view().layout;
  assert.ok(shown().includes("az ist nicht installiert"), "the Sprint reads with az, which is not found here");
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "v", "h/l j/k", "gg/G", "H/L", "s", "a", "z", "Enter", "o", "m", "/", "r", ":", "Esc"], "the Sprint's keys");
  await press(b, cx, "v");
  assert.deepEqual([layout(), shown().includes("az ist nicht installiert")], ["backlog", true], "the Backlog reads with az too");
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "v", "j/k", "gg/G", "n", "s", "a", "Enter", "o", "m", "/", "r", ":", "Esc"], "the Backlog's keys");
  await press(b, cx, "v");
  assert.equal(layout(), "sprint");
  await click(b, cx, "team-view-backlog");
  assert.equal(layout(), "backlog", "a click on the switch");
  await press(b, cx, "2");
  assert.ok(shown().includes("PR-Ansicht folgt"));
  assert.equal(byId(b.render(), "team-view"), null, "no view switch on the PRs tab");
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "m", "/", "r", ":", "Esc"]);
  await press(b, cx, "v");
  assert.ok(shown().includes("PR-Ansicht folgt"), "v does nothing there");
  await press(b, cx, "1");
  assert.equal(layout(), "backlog", "the team kept its view");
  assert.deepEqual(host.calls, []);
});

test("UI: a team with one view shows it without a switch; a config with one source offers no source switch", async () => {
  const config = JSON.parse(testConfig());
  config.sources.azure.contexts[0].views = ["backlog"];
  delete config.sources.github;
  const { b, cx } = await bootBoard({ config: JSON.stringify(config), stored: {} });
  assert.equal(b.view().layout, "backlog");
  assert.equal(byId(b.render(), "team-view"), null);
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "j/k", "gg/G", "n", "s", "a", "Enter", "o", "m", "/", "r", ":", "Esc"]);
  const entries = await openMenu(b, cx);
  assert.equal(entries.some(([name]) => name.startsWith("Quelle wechseln") || name.startsWith("Ansicht wechseln")), false);
  await press(b, cx, "escape");
  await press(b, cx, "v");
  assert.deepEqual([b.source().id, b.teamViewOf(b.context())], ["azure", "backlog"]);
});

test("UI: an Azure view drawn as a board has what the board shape and the start read, and draws without an error", async () => {
  const { b } = await bootBoard({ stored: { source: "azure" } });
  const view = b.view();
  assert.deepEqual([view.hide, view.start], [[], {}]);
  b.state(view.id).data = typedBoard();
  const root = b.render();
  assert.ok(texts(root).includes("In Progress"), "the board's columns");
  assert.equal(b.shape(view), board.SHAPES.board, "the data's shape wins over the placeholder");
  b.state(view.id).data = { ...typedBoard(), limited: true, total: 9, limit: 5 };
  assert.ok(texts(b.render()).some((s) => s.startsWith("Nur die ersten 5 von 9 Einträgen")), "the cut names the data's limit; the view has none");
});

test("UI: switching a team's view loads the view now shown, where its source reads one", async () => {
  const { b, cx } = await bootBoard({ stored: { source: "azure" } });
  const loads = [];
  b.sources.azure.views.backlog = { load: async (view) => (loads.push(view.id), { data: { shape: "prs", sections: [], viewer: null }, warnings: [] }) };
  await press(b, cx, "v");
  assert.deepEqual(loads, ["azure:team:Example Project/Example Team:backlog"]);
  await click(b, cx, "team-view-sprint");
  await click(b, cx, "team-view-backlog");
  assert.equal(loads.length, 1, "not again while it is fresh");
});

test("UI: on a shape without items (the placeholder) Enter, o and the arrows stay herdr's", async () => {
  const { b, cx } = await bootBoard({ stored: { source: "azure" } });
  await press(b, cx, "2");
  assert.equal(b.shape(b.view()), board.SHAPES.placeholder, "the PR view to come");
  const stopped = cx.stopped;
  for (const k of ["enter", "o", "j", "down"]) await press(b, cx, k);
  assert.equal(cx.stopped, stopped, "none was taken");
  assert.equal(b.notice, null, "no „Dazu gibt es keine Seite“");
});

// Key events as the board logged them in herdr 0.1.16 (gpui on Linux,
// xdotool into an isolated window): a key herdr binds with Alt (alt-9,
// alt-h, alt-[, alt-]) never arrived; an unbound one did, with Alt set.
const LOGGED = {
  altQ: { key: "q", key_char: "q", keystroke: "alt-q", modifiers: { shift: false, control: false, alt: true, platform: false, function: false } },
  ctrlAlt9: { key: "9", key_char: "9", keystroke: "ctrl-alt-9", modifiers: { shift: false, control: true, alt: true, platform: false, function: false } },
};

test("UI: Alt+] and Control+Alt+[ switch tabs; Control+] and a logged Alt with a letter stay herdr's", async () => {
  const { b, cx } = await openBoard();
  b.key(LOGGED.altQ, cx);
  await settle();
  assert.deepEqual([b.source().id, cx.stopped], ["github", 0], "the logged Alt with a letter: not taken");
  await press(b, cx, "]", { modifiers: { alt: true } });
  assert.equal(b.context().id, "github:prs", "Alt+]");
  await press(b, cx, "[", { modifiers: { ...LOGGED.ctrlAlt9.modifiers } });
  assert.equal(b.context().id, "github:mine", "Control+Alt+[");
  const stopped = cx.stopped;
  await press(b, cx, "]", { modifiers: { control: true } });
  assert.deepEqual([b.context().id, cx.stopped], ["github:mine", stopped], "Control+]");
});

test("the GitHub tab id, a team's switch and its hint: githubContextId, hasViewSwitch, viewSwitchHint", () => {
  assert.equal(board.githubContextId("mine"), "github:mine");
  const [team] = board.contextsOf(sampleConfig(), "azure");
  assert.deepEqual([board.hasViewSwitch(team), board.viewSwitchHint(team)], [true, "Sprint/Backlog"]);
  assert.deepEqual([board.hasViewSwitch({ ...team, views: ["backlog"] }), board.hasViewSwitch({ kind: "prs" }), board.hasViewSwitch(null)], [false, false, false]);
});

test("UI: while one types in the filter, m, :, v and digits are text, not keys", async () => {
  const { b, cx } = await bootBoard({ stored: { source: "azure" } });
  await press(b, cx, "/");
  assert.equal(b.filtering, true);
  for (const k of ["m", ":", "v", "2", "]"]) await press(b, cx, k);
  assert.deepEqual([b.mine, b.modal, b.teamViewOf(b.context()), b.context().kind], [false, null, "sprint", "team"]);
  await press(b, cx, "escape");
  await press(b, cx, "m");
  assert.equal(b.mine, true, "after Esc they are keys again");
});

test("UI: the shown GitHub view refreshes every refreshMinutes while the board shows; an Azure tab without a loader and a hidden board read nothing", async () => {
  let shown = true;
  const { b, cx, host } = await openBoard();
  host.panes = () => (shown ? [{ pane: "p1", mod: "board", tab: "t1" }] : []);
  advance(2 * 60000);
  await cx.tick();
  assert.equal(host.open("gh").length, 0, "not before refreshMinutes");
  advance(60000);
  await cx.tick();
  assert.equal(host.open("gh").length, 1, "after refreshMinutes");
  await host.answer("gh", ok(fixture("github-board.json")));
  shown = false;
  advance(10 * 60000);
  await cx.tick();
  assert.equal(host.open("gh").length, 0, "not while the board is not shown");
  shown = true;
  await runCommand(b, cx, "Quelle wechseln: Azure");
  await press(b, cx, "2");
  advance(10 * 60000);
  await cx.tick();
  assert.deepEqual([host.open("gh").length, host.open("az").length], [0, 0], "the PR view to come reads nothing");
});

test("UI: the GitHub tabs keep their keys and hints: a board's, a list's", async () => {
  const { b, cx, host } = await openBoard();
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "h/l j/k", "gg/G", "H/L", "s", "a", "Enter", "o", "m", "/", "r", ":", "Esc"]);
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "j/k", "gg/G", "Enter", "o", "m", "/", "r", ":", "Esc"]);
});

// Fires the left button's `event` ("on_mouse_down" or "on_mouse_up") on the
// element with the id `id`, as the board draws it now.
async function mouse(b, cx, id, event) {
  const el = byId(b.render(), id);
  assert.ok(el, `no ${id}`);
  el.with[event][1]({}, cx);
  await settle();
}
const clickCard = async (b, cx, key) => {
  await mouse(b, cx, `card-${key}`, "on_mouse_down");
  await mouse(b, cx, `card-${key}`, "on_mouse_up");
};

test("UI: a click on a card selects it; a click on the card the person chose opens its details", async () => {
  const { b, cx, st, host } = await openBoard();
  assert.equal(st().sel.key, "PVTI_rec4", "the board selected the first card by itself");
  await clickCard(b, cx, "PVTI_rec4");
  assert.equal(st().detail, false, "a click on it only selects it");
  await clickCard(b, cx, "PVTI_rec4");
  assert.equal(st().detail, true, "a second opens the details");
  await press(b, cx, "escape");
  await press(b, cx, "j");
  await clickCard(b, cx, "PVTI_rec5");
  assert.equal(st().detail, true, "a card moved to with keys is chosen: one click opens it");
  await press(b, cx, "escape");
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  assert.equal(st().sel.key, "PVTI_rec6", "the board selected the card taking the moved one's row");
  await clickCard(b, cx, "PVTI_rec6");
  assert.equal(st().detail, false, "which is not chosen: a click selects it");
  await clickCard(b, cx, "PVTI_rec1");
  assert.deepEqual([st().sel, st().detail], [{ col: 1, key: "PVTI_rec1" }, false], "the first click selects");
  assert.equal(b.drag, null);
  await clickCard(b, cx, "PVTI_rec1");
  assert.equal(st().detail, true, "the second opens the details");
  await clickCard(b, cx, "PVTI_rec2");
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec2", true], "another card: selected, the details follow it as with the keys");
  await clickCard(b, cx, "PVTI_rec2");
  assert.equal(b.modal, null, "a click on the selected card with its details open starts nothing");
  await press(b, cx, "escape");
  await mouse(b, cx, "card-PVTI_rec2", "on_mouse_up");
  assert.equal(st().detail, false, "a release without a press on the card is no click");
  assert.equal(host.open("gh").filter((c) => !isRelatedCall(c.args)).length, 1, "only H wrote");
});

test("UI: a selection the board sets on another card closes open details: after a filter or a refresh; on the same card they stay", async () => {
  const { b, cx, st, host } = await openBoard();
  await press(b, cx, "enter");
  b.filterText = "BUG input";
  await press(b, cx, "z");
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec6", false], "the filter");
  b.filterText = "";
  await press(b, cx, "enter");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec6", true], "a refresh keeping the card keeps the details");
  await press(b, cx, "r");
  await host.answer("gh", ok(boardWith((nodes) => nodes.splice(nodes.findIndex((n) => n.id === "PVTI_rec6"), 1))), isBoardCall);
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec4", false], "a refresh without the card");
});

test("UI: a chosen item and one the board selects in its place are scrolled into view; a selection that stays put is not", async () => {
  const { b, cx, host } = await openBoard();
  const list = (col) => b.shapeState.board.scrolls[col];
  host.scrolled.splice(0);
  await press(b, cx, "l");
  assert.deepEqual(host.scrolled.splice(0), [{ handle: list(1), row: 0 }], "l: 3000, In progress's first row, in its own list");
  await press(b, cx, "h");
  await press(b, cx, "j");
  assert.deepEqual(host.scrolled.splice(0), [{ handle: list(0), row: 0 }, { handle: list(0), row: 1 }], "h, j: 3004, then 3005, Ready's second row");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")));
  assert.deepEqual(host.scrolled.splice(0), [], "a refresh keeping the card");
  b.filterText = "BUG input";
  await press(b, cx, "z");
  assert.deepEqual(host.scrolled.splice(0), [{ handle: list(0), row: 0 }], "the filter: 3007, now Ready's first row");
});

test("UI: hiding the column of a card whose details are open closes them", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "l");
  await press(b, cx, "enter");
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec1", true]);
  await runCommand(b, cx, "Spalte ausblenden: In progress");
  assert.deepEqual([st().sel, st().detail], [{ col: 1, key: null }, false]);
});

test("UI: the column menu hiding a column before the selected one keeps the selection on its card", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "l");
  await runCommand(b, cx, "Spalten…");
  await press(b, cx, "2");
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec1" });
});

test("UI: a choice the board's own selection replaced is gone: a click on that card again selects it only", async () => {
  const { b, cx, st } = await openBoard();
  await clickCard(b, cx, "PVTI_rec4");
  assert.equal(st().picked, "PVTI_rec4");
  b.filterText = "BUG input";
  await press(b, cx, "z");
  assert.equal(st().sel.key, "PVTI_rec6", "the filter left only 3007: the board selected it");
  b.filterText = "";
  await press(b, cx, "z");
  await clickCard(b, cx, "PVTI_rec4");
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec4", false]);
});

test("UI: a card dragged onto another column moves there, chosen, without opening its details", async () => {
  const { b, cx, st, host } = await openBoard();
  await mouse(b, cx, "card-PVTI_rec4", "on_mouse_down");
  byId(b.render(), "col-1").with.on_hover[0](true, cx);
  await mouse(b, cx, "col-1", "on_mouse_up");
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "In progress");
  assert.ok(host.open("gh")[0].args.includes("option=opt-in-progress"));
  assert.deepEqual([st().sel.key, st().detail, b.drag], ["PVTI_rec4", false, null]);
  await mouse(b, cx, "card-PVTI_rec4", "on_mouse_down");
  byId(b.render(), "col-2").with.on_hover[0](true, cx);
  await mouse(b, cx, "col-2", "on_mouse_up");
  assert.equal(st().detail, false, "nor a drag of the selected card");
  await clickCard(b, cx, "PVTI_rec4");
  assert.equal(st().detail, true, "a dragged card is chosen: one click opens it");
  await press(b, cx, "escape");
  await mouse(b, cx, "card-PVTI_rec1", "on_mouse_down");
  assert.equal(st().sel.key, "PVTI_rec4", "a press selects nothing");
  await mouse(b, cx, "col-1", "on_mouse_up");
  assert.deepEqual([board.findCard(st().data, "PVTI_rec1").column.name, st().sel.key], ["In progress", "PVTI_rec4"], "nor a press released in its own column");
  await clickCard(b, cx, "PVTI_rec1");
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec1", false], "so a click on that card only selects it");
});

test("UI: a card dragged onto a column it may not go to stays there, chosen in its own column", async () => {
  const { b, cx, st, host } = await openBoard({ answer: fixture("github-board-cases.json") });
  const ready = b.navColumns(b.view()).findIndex((c) => c.name === "Ready");
  assert.equal(b.navColumns(b.view())[0].name, "Ohne Status");
  await mouse(b, cx, "card-PVTI_case3", "on_mouse_down");
  await mouse(b, cx, "col-0", "on_mouse_up");
  assert.match(b.notice.text, /kann nicht nach „Ohne Status“/);
  assert.equal(host.open("gh").length, 0);
  assert.deepEqual(st().sel, { col: ready, key: "PVTI_case3" });
  await clickCard(b, cx, "PVTI_case3");
  assert.equal(st().detail, true, "chosen: one click opens it");
});

test("UI: a click on a pull request's row selects it; a click on the row the person chose opens its details", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  const list = b.views.prs;
  const [first, second] = b.navColumns(b.view())[0].shown;
  assert.equal(list.sel.key, first.key, "the board selected the first row by itself");
  await click(b, cx, `row-${first.key}`);
  assert.equal(list.detail, false, "a click on it only selects it");
  await press(b, cx, "j");
  await click(b, cx, `row-${second.key}`);
  assert.equal(list.detail, true, "a row moved to with keys is chosen: one click opens it");
  await press(b, cx, "escape");
  await press(b, cx, "k");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-list.json")));
  await click(b, cx, `row-${first.key}`);
  assert.equal(list.detail, true, "a refresh that keeps the selection keeps the choice: one click opens it");
  await press(b, cx, "escape");
  await click(b, cx, `row-${second.key}`);
  assert.deepEqual([list.sel, list.detail], [{ col: 0, key: second.key }, false], "the first click selects");
  await click(b, cx, `row-${second.key}`);
  assert.equal(list.detail, true, "the second opens the details");
  await click(b, cx, `row-${first.key}`);
  assert.deepEqual([list.sel.key, list.detail], [first.key, true], "another row: selected, the details follow it");
  assert.equal(st().detail, false, "the board's view keeps its own");
});

test("UI: clicks on the source toggle, a tab and „nur meine“ do what their keys do, not while a dialog is open", async () => {
  const { b, cx, host } = await openBoard();
  await click(b, cx, "source-azure");
  assert.equal(b.source().id, "azure");
  await click(b, cx, "tab-azure:prs:Example Project");
  assert.equal(b.context().kind, "prs");
  await click(b, cx, "source-github");
  await click(b, cx, "tab-github:other");
  assert.equal(b.context().id, "github:other");
  await host.answer("gh", ok(fixture("github-board.json")));
  await click(b, cx, "mine");
  assert.equal(b.mine, true);
  await press(b, cx, "s");
  assert.equal(b.modal?.kind, "status");
  await click(b, cx, "mine");
  await click(b, cx, "source-azure");
  await click(b, cx, "tab-github:mine");
  assert.deepEqual([b.mine, b.source().id, b.context().id], [true, "github", "github:other"], "the dialog keeps them");
});

test("UI: m shows only one's own items on a board and a list, without reading again, and says so in the top bar", async () => {
  const data = json("github-board.json");
  data.data.repositoryOwner.projectV2.items.nodes[0].content.assignees.nodes = [{ login: "someone-else" }];
  // The list's second section searches without @me: its rows count one by one.
  const config = JSON.parse(testConfig());
  config.sources.github.views[1].sections[1] = { name: "Mine", query: "is:pr repo:example/tender" };
  const { b, cx, host, st } = await openBoard({ answer: JSON.stringify(data), config: JSON.stringify(config) });
  const cards = () => b.navColumns(b.view()).flatMap((c) => c.shown.map((x) => x.number));
  assert.equal(cards().length, 6);
  b.choose(b.view(), { col: b.navColumns(b.view()).findIndex((c) => c.name === "In progress"), key: "PVTI_rec1" });
  assert.ok(texts(byId(b.render(), "mine")).includes("nur meine"));
  await press(b, cx, "m");
  assert.equal(cards().includes(3000), false);
  assert.equal(cards().length, 5);
  assert.ok(texts(byId(b.render(), "mine")).includes("✓ nur meine"), "said when on");
  assert.equal(host.open("gh").length, 0, "nothing read again");
  assert.notEqual(st().sel.key, null);
  assert.ok(cards().includes(board.findCard(st().data, st().sel.key).card.number), "the selection leaves the card no longer shown");
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  assert.deepEqual(b.navColumns(b.view())[0].shown.map((r) => r.number), [2820, 808, 77],
    "the list: from a search of one's own, assigned, opened by sample-user; not the bot's own 1921");
  assert.ok(texts(b.render()).includes("REVIEW · 1"), "the review section, a search of one's own, keeps its row");
  assert.ok(texts(b.render()).includes("MINE · 2/3"), "and says what is hidden");
  assert.equal(texts(byId(b.render(), "tab-github:prs")).at(-1), "3/4", "so does the tab");
  await press(b, cx, "m");
  assert.deepEqual(b.navColumns(b.view())[0].shown.map((r) => r.number), [2820, 1921, 808, 77]);
});

test("a search of one's own is one with author, assignee or (user-)review-requested set to @me, not negated", () => {
  const own = (q) => board.ownSearch(q);
  for (const q of ["is:pr author:@me", "is:pr assignee:@me", "is:pr review-requested:@me archived:false", "user-review-requested:@me is:open", "is:pr Author:@me"]) {
    assert.equal(own(q), true, q);
  }
  for (const q of ["is:pr -author:@me", "is:pr NOT author:@me", "is:pr not review-requested:@me", "involves:@me", "mentions:@me", "commenter:@me",
    "reviewed-by:@me", "user:@me", "is:pr author:someone", "is:pr", "", "author:@meow"]) {
    assert.equal(own(q), false, q);
  }
  assert.equal(own("NOT author:@me assignee:@me"), true, "one positive qualifier is enough");
});

test("a list section counts the rows it holds: each pull request once; GitHub's cut carries how many it sent", () => {
  const list = board.parseGithubList(json("github-list.json"), listView());
  const mine = list.sections[1];
  assert.deepEqual([mine.count, mine.fetched, mine.rows.length, mine.limited], [4, 4, 3, false], "one pull request is the first section's");
  assert.equal(board.sectionCount(mine, 3), "3");
  assert.equal(board.sectionCount(mine, 1), "1/3");
  const cut = { ...mine, count: 120, limited: true };
  assert.deepEqual([board.sectionCount(cut, 3), board.sectionCount(cut, 2)], ["3 · erste 4 von 120", "2/3 · erste 4 von 120"]);
});

test("a board pull request asking only for one's review counts as one's own; an empty review request node names no one", () => {
  const data = json("github-board-cases.json");
  const node = data.data.repositoryOwner.projectV2.items.nodes.find((n) => n.id === "PVTI_case1");
  node.content.assignees.nodes = [];
  node.content.author = { login: "someone-else" };
  node.content.reviewRequests.nodes = [null, { requestedReviewer: { login: "sample-user" } }];
  const pr = board.findCard(board.parseGithubBoard(data, githubView(), HIDDEN), "PVTI_case1").card;
  assert.deepEqual([pr.assignees, pr.reviewers, board.isMine(pr, "sample-user")], [[], ["sample-user"], true]);
});

test("„nur meine“ counts a search of one's own whole, and a pull request on a board that asks one's review", () => {
  const list = board.parseGithubList(json("github-list.json"), listView());
  assert.deepEqual(list.sections.map((s) => s.rows.map((r) => r.ownByQuery)), [[true], [true, true, true]], "review-requested:@me, author:@me");
  const other = { ...listView(), sections: [{ name: "A", query: "is:pr repo:example/tender" }, { name: "B", query: "is:pr repo:example/atlas" }] };
  const rows = board.parseGithubList(json("github-list.json"), other).sections.flatMap((s) => s.rows);
  assert.deepEqual(rows.map((r) => [r.number, r.ownByQuery, board.isMine(r, "sample-user")]), [[2820, false, true], [1921, false, false], [808, false, true], [77, false, true]]);
  assert.deepEqual(rows.find((r) => r.number === 808).reviewers, [], "a reviewer that is gone names no one");
  assert.equal(board.isMine({ ownByQuery: true }, null), true, "also without the viewer's login");
  const cases = casesBoard();
  const pr = board.findCard(cases, "PVTI_case1").card;
  assert.deepEqual([pr.reviewers, board.isMine(pr, "sample-user")], [["sample-user"], true], "a pull request on the board asking sample-user's review");
  const issue = cases.columns.flatMap((c) => c.cards).find((c) => c.kind === "issue" && c.author === null);
  assert.ok(issue, "an issue whose author is gone");
  assert.equal(board.isMine(issue, "sample-user"), issue.assignees.includes("sample-user"));
  assert.match(board.githubBoardArgs(githubView(), HIDDEN).find((a) => a.startsWith("query=")), /PullRequest \{[^}]*\}[^]*?reviewRequests\(first: 20\)/);
});

test("UI: what the filter or „nur meine“ hides is said: in the column, its count and the tab's", async () => {
  const data = json("github-board.json");
  for (const n of data.data.repositoryOwner.projectV2.items.nodes) {
    if (n.fieldValueByName.name === "In progress") n.content.assignees.nodes = [{ login: "someone-else" }];
  }
  const { b, cx } = await openBoard({ answer: JSON.stringify(data) });
  const tab = () => texts(byId(b.render(), "tab-github:mine"));
  const column = (name) => texts(byId(b.render(), `col-${b.navColumns(b.view()).findIndex((c) => c.name === name)}`));
  assert.deepEqual([tab().at(-1), column("In progress")[1]], ["6", "3"]);
  await press(b, cx, "m");
  assert.equal(tab().at(-1), "3/6");
  assert.deepEqual(column("In progress").slice(1), ["0/3", "keine Karten (3 ausgeblendet)"]);
  const head = pathTo(byId(b.render(), `col-${b.navColumns(b.view()).findIndex((c) => c.name === "In progress")}`), (s) => s === "0/3").at(-1);
  assert.ok(head.styles.includes("flex_none"), "the count keeps its width; the name gives way");
  assert.deepEqual(column("Ready").slice(1, 2), ["3"], "nothing hidden: the count alone");
  await press(b, cx, "m");
  b.filterText = "input";
  assert.equal(tab().at(-1), "1/6", "the text filter too");
  assert.deepEqual(column("Ready").slice(1, 2), ["1/3"]);
});

test("UI: without the viewer's login, „nur meine“ on a list still shows a search of one's own, and does not say it shows nothing", async () => {
  const data = json("github-list.json");
  delete data.data.viewer;
  const { b, cx, host } = await openBoard();
  await press(b, cx, "2");
  await host.answer("gh", ok(JSON.stringify(data)));
  await press(b, cx, "m");
  assert.deepEqual(b.navColumns(b.view())[0].shown.map((r) => r.number), [2820, 1921, 808, 77]);
  assert.equal(texts(b.render()).some((s) => s.startsWith("„nur meine“ zeigt nichts")), false);
});

test("UI: without the viewer's login, „nur meine“ says what it cannot tell whenever it hides an item for that, but not when the filter empties the view", async () => {
  const data = json("github-list.json");
  delete data.data.viewer;
  const config = JSON.parse(testConfig());
  config.sources.github.views[1].sections[1] = { name: "Mine", query: "is:pr repo:example/tender" };
  const { b, cx, host } = await openBoard({ config: JSON.stringify(config) });
  await press(b, cx, "2");
  await host.answer("gh", ok(JSON.stringify(data)));
  await press(b, cx, "m");
  const warning = () => texts(b.render()).filter((s) => s.startsWith("„nur meine“"));
  assert.deepEqual(b.navColumns(b.view())[0].shown.map((r) => r.number), [2820], "only the search of one's own");
  assert.deepEqual(warning(), ["„nur meine“ zeigt nur Treffer eigener Suchen: GitHub hat nicht gesagt, als wer gh angemeldet ist"]);
  b.filterText = "release";
  assert.deepEqual(warning(), ["„nur meine“ zeigt nichts: GitHub hat nicht gesagt, als wer gh angemeldet ist"], "the filter leaves only rows it cannot tell");
  b.filterText = "summary";
  assert.deepEqual(warning(), [], "the filter leaves only the search of one's own");
  b.filterText = "no such words";
  assert.deepEqual(warning(), [], "the filter alone empties the view");
});

test("UI: Enter and o with nothing selected stay herdr's: while loading, on an empty view", async () => {
  const { b, cx, host } = await bootBoard();
  for (const k of ["enter", "o"]) await press(b, cx, k);
  assert.deepEqual([cx.stopped, b.notice], [0, null], "loading");
  await host.answer("gh", ok(JSON.stringify({ data: { viewer: { login: "sample-user" }, repositoryOwner: { projectV2: { ...json("github-board.json").data.repositoryOwner.projectV2, items: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] } } } } })));
  assert.equal(b.selected(b.view()), null);
  for (const k of ["enter", "o"]) await press(b, cx, k);
  assert.deepEqual([cx.stopped, b.notice], [0, null], "empty");
});

test("UI: a column operation on a view without columns is said; a reload that finishes while a dialog is open closes it when views.json no longer has its view of that kind", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  const list = b.view();
  b.moveTo(list, "x", "y", cx);
  assert.equal(b.notice.text, "Die Karte oder Spalte gibt es nicht mehr");
  b.toggleColumn(list, { name: "x" }, cx);
  assert.equal(b.notice.text, "Diese Ansicht hat keine Spalten");
  b.openStatusMenu(list, cx);
  assert.deepEqual([b.notice.text, b.modal], ["Hier gibt es keinen Status zu ändern", null]);
  await press(b, cx, "1");
  await press(b, cx, "s");
  assert.equal(b.modal?.kind, "status");
  const config = JSON.parse(testConfig());
  config.sources.github.views[0] = { ...config.sources.github.views[1], id: "mine", name: "Mine" };
  host.config = JSON.stringify(config);
  b.reload(cx);
  await settle();
  assert.equal(b.modal, null, "the status menu closed: its view is a list now");
  host.config = testConfig();
  b.reload(cx);
  await settle();
  await host.answer("gh", ok(fixture("github-board.json")));
  await press(b, cx, "enter");
  await press(b, cx, "enter");
  assert.equal(b.modal?.kind, "start");
  host.config = withoutMine();
  b.reload(cx);
  await settle();
  assert.equal(b.modal, null, "the start dialog closed: its view is gone");
});

test("UI: an Azure-like item without a repo has its key, its parent's label, and a detail that draws", async () => {
  const item = { ...azureItem(), parent: 7 };
  delete item.repo;
  assert.deepEqual(board.templateVars(item), { number: 101, title: item.title, url: "", owner: "", repo: "", key: "AB#101" });
  assert.deepEqual([board.parentLabel(item), board.itemKey({ ...item, kind: "pr" }), board.parentLabel({ ...githubBoard().columns[2].cards[0], parent: 3002 })],
    ["AB#7", "!101", "tender#3002"]);
  const { b } = await bootBoard({ stored: { source: "azure" } });
  const view = b.view();
  const data = typedBoard();
  data.columns[2].cards[0] = { ...data.columns[2].cards[0], parent: 7, url: null };
  delete data.columns[2].cards[0].repo;
  b.state(view.id).data = data;
  b.state(view.id).sel = { col: 2, key: "w101" };
  b.state(view.id).detail = true;
  const shown = texts(b.render());
  assert.ok(shown.includes("Teil von AB#7"), "the parent's label");
  assert.ok(shown.some((s) => s.startsWith("In Progress")), "the board's status pill");
  assert.ok(byId(b.render(), "act-status"), "and its Status button");
});

test("UI: a prs row draws without checks or author; a draft mark is its own cell; the board cut names its limit from the data", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "2");
  const data = json("github-list.json");
  await host.answer("gh", ok(JSON.stringify(data)));
  const st = b.views.prs;
  const row = st.data.sections[0].rows[0];
  st.data.sections[0].rows[0] = { ...row, checks: null, author: null, draft: true };
  const cells = byId(b.render(), `row-${row.key}`).kids.map((k) => texts(k).join(""));
  assert.equal(cells.length, 4, "label, title, draft mark, age");
  assert.deepEqual(cells.slice(0, 3), ["tender#2820", "build(ui): draw the summary card", "Entwurf"]);
  // Rows with and without the mark keep their cells in line.
  const widths = (r) => byId(b.render(), `row-${r.key}`).kids.map((k) => k.with.w?.[0] ?? null);
  const [plain, draft] = [st.data.sections[1].rows[0], st.data.sections[1].rows.find((r) => r.draft)];
  assert.deepEqual(widths(plain), widths(draft), "the same cells on a draft row and on another");
  assert.equal(texts(byId(b.render(), `row-${plain.key}`)).includes("Entwurf"), false);
  assert.equal(texts(b.render()).some((s) => s.includes("undefined")), false);
  assert.equal(board.parseGithubBoard(json("github-board.json"), { ...githubView(), limit: 3 }, HIDDEN).limit, 3, "the cut names the data's own limit");
});

test("every view gets its own default fields; the Board imports no shape module but the index", () => {
  const [a, b2] = [board.viewDefaults(), board.viewDefaults()];
  assert.notEqual(a.hide, b2.hide);
  const [team] = board.contextsOf(sampleConfig(), "azure");
  assert.notEqual(board.viewOf(team, "sprint").hide, board.viewOf(team, "backlog").hide);
  const main = readFileSync(join(modDir, "src/main.js"), "utf8");
  assert.deepEqual(main.match(/^import .* from "\.\/ui\/shapes\/[^"]+";$/gm), ['import { SHAPES } from "./ui/shapes/index.js";']);
});

test("UI: a capped list section keeps its true total while the filter or „nur meine“ thins it", async () => {
  const data = json("github-list.json");
  data.data.s1.issueCount = 120;
  const config = JSON.parse(testConfig());
  config.sources.github.views[1].sections[1] = { name: "Mine", query: "is:pr repo:example/tender" };
  const { b, cx, host } = await openBoard({ config: JSON.stringify(config) });
  await press(b, cx, "2");
  await host.answer("gh", ok(JSON.stringify(data)));
  assert.ok(texts(b.render()).includes("MINE · 3 · erste 4 von 120"), "held (each pull request once), and sent of found");
  await press(b, cx, "m");
  assert.ok(texts(b.render()).includes("MINE · 2/3 · erste 4 von 120"), "shown of held, and sent of found");
});

test("UI: „nur meine“ over data without the viewer's login shows nothing and says why", async () => {
  const data = json("github-board.json");
  delete data.data.viewer;
  const { b, cx } = await openBoard({ answer: JSON.stringify(data) });
  await press(b, cx, "m");
  assert.equal(b.navColumns(b.view()).flatMap((c) => c.shown).length, 0);
  assert.ok(texts(b.render()).includes("„nur meine“ zeigt nichts: GitHub hat nicht gesagt, als wer gh angemeldet ist"));
});

// ---- The board button (mods/board-button/) ----

const buttonDir = resolve(modDir, "../board-button");
// The text between a file's markers for `block` ("layer", "board").
const markedCopy = (file, block) => {
  const src = readFileSync(file, "utf8");
  const at = src.indexOf(`// ---- ${block}:`);
  return at < 0 ? null : src.slice(at, src.indexOf(`// ---- end ${block} ----`, at));
};
const THEME = {
  chrome: "#chrome", border: "#border", muted: "#muted", foreground: "#fg", hover: "#hover", selected: "#selected",
  accent: "#accent", accent_foreground: "#onaccent",
};

// A board button on a fake host whose layout() is `tree()`; render() draws
// it as herdr does after a change, and press(button) presses it.
async function boardButton({ tree = () => null } = {}) {
  const { default: BoardButton } = await import(pathToFileURL(join(buttonDir, "main.js")).href);
  const host = fakeHost();
  host.layout = () => tree();
  host.theme = () => THEME;
  globalThis.__boardHost = host;
  const view = new BoardButton();
  const cx = fakeCx();
  view.init({}, cx);
  const render = () => view.render(cx);
  const press = (button = "left") => {
    const handler = byId(render(), "board-open").calls.find((c) => c[0] === "on_mouse_down" && c[1] === button)?.[2];
    assert.ok(handler, `a handler for a ${button} press`);
    handler({ button }, fakeCx());
  };
  return { host, view, cx, render, press };
}

test("the leader, the board button and the board hold the same board layer block, focus-history its layer shape, the leader and the button the same toggle, the leader and focus-history the same place", () => {
  const history = resolve(modDir, "../focus-history/main.js");
  const files = [join(buttonDir, "main.js"), resolve(modDir, "../leader/main.js"), join(modDir, "src/ui/layer.js")];
  const layer = markedCopy(files[0], "layer");
  assert.ok(layer?.includes("function boardLayer(root) {") && layer.includes("function leaveLayer(options) {"), "the button has the layer block");
  for (const file of files.slice(1)) assert.equal(markedCopy(file, "layer"), layer, file);
  const shape = markedCopy(files[0], "layer shape");
  assert.ok(shape?.includes("function boardLayer(root) {") && !shape.includes("function showTab("), "the button's layer block has the layer shape");
  for (const file of [...files.slice(1), history]) assert.equal(markedCopy(file, "layer shape"), shape, file);
  assert.equal(markedCopy(history, "layer"), null, "focus-history has the layer shape alone");
  const toggle = markedCopy(files[0], "board");
  assert.ok(toggle?.includes("function toggleBoard() {") && toggle.includes("function openBoard() {"), "the button has the board block");
  assert.equal(markedCopy(files[1], "board"), toggle, "the leader's");
  const place = markedCopy(files[1], "place");
  assert.ok(place?.includes("function place(layer) {"), "the leader has the place block");
  assert.equal(markedCopy(history, "place"), place, "focus-history's");
});

test("UI: in a layout without a board layer a press on the board button shows the board's tab wherever it is, else opens one named Board", async () => {
  const { host, press } = await boardButton();
  host.panes = () => [];
  press();
  assert.deepEqual(host.runs.splice(0), [["tab.new", { name: "Board", mod: "board" }]]);
  host.panes = () => [{ pane: "p1", mod: "board", tab: "t1" }];
  press();
  assert.deepEqual(host.runs.splice(0), [["pane.focus", { pane: "p1" }]]);
  host.panes = () => [{ pane: "p2", tab: "t1", zoomed: true }, { pane: "p1", mod: "board", tab: "t1" }];
  press();
  assert.deepEqual(host.runs.splice(0), [["pane.zoom", { pane: "p2" }], ["pane.focus", { pane: "p1" }]]);
});

test("UI: the personal layout without a board layer says so on a press of the board button and opens no Board tab", async () => {
  const { host, press } = await boardButton();
  host.sharedValues.layout = "personal";
  host.panes = () => [];
  press();
  assert.deepEqual(host.runs, []);
  assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [
    ["The personal layout has no board layer", "layouts/personal.json needs a stack with the shown tab and a board block whose props say layer", "error"],
  ]);
});

test("UI: a press of any mouse button on the board button shows the layer's board and gives it the keyboard, the next the tab's content with the keyboard back", async () => {
  let active = "main";
  const { host, press } = await boardButton({ tree: () => layerLayout(active) });
  for (const button of ["left", "right", "middle"]) {
    active = "main";
    press(button);
    assert.deepEqual(host.runs.splice(0), SHOW_BOARD, `${button}: no Board tab`);
    active = "board";
    press(button);
    assert.deepEqual(host.runs.splice(0), SHOW_TAB, button);
  }
  host.focus = { space: "s1", tab: "t1", pane: null, terminal: "t7" };
  press();
  assert.deepEqual(host.runs.splice(0), [SHOW_TAB[0], ["pane.focus", { terminal: "t7" }]], "a focused terminal outside a pane");
  host.focus = null;
  press();
  assert.deepEqual(host.runs.splice(0), [SHOW_TAB[0]], "without a focus, only the layer");
});

test("UI: the board layer is found by its shape: a stack with a board block whose props say layer and one of the shown tab, whatever their ids", async () => {
  let active = "b";
  const renamed = () => {
    const tree = layerLayout("main");
    const stack = findById(tree, "work-stack");
    stack.id = "s";
    stack.children[0].id = "t";
    stack.children[1].id = "b";
    stack.active = active;
    stack.children.reverse();
    return tree;
  };
  const { host, press } = await boardButton({ tree: renamed });
  press();
  assert.deepEqual(host.runs.splice(0), [["layout.select", { stack: "s", child: "t" }], ["pane.focus", { pane: "p1" }]]);
  active = "t";
  press();
  assert.deepEqual(host.runs.splice(0), [["layout.select", { stack: "s", child: "b" }], ["board.focus", undefined]]);
  for (const broken of [
    (stack) => (stack.children[0].content = { mod: "files", props: { layer: true } }),
    (stack) => (stack.children[0].content = { mod: "board" }),
    (stack) => (stack.children[0].content = { mod: "board", props: { layer: "yes" } }),
    (stack) => (stack.children[1].content = { mod: "pane" }),
    (stack) => (stack.type = "row"),
  ]) {
    const { host: other, press: pressOther } = await boardButton({ tree: () => {
      const tree = renamed();
      broken(findById(tree, "s"));
      return tree;
    } });
    other.panes = () => [];
    pressOther();
    assert.deepEqual(other.runs, [["tab.new", { name: "Board", mod: "board" }]], `no layer: ${broken}`);
  }
});

test("UI: a failed switch of the board layer says which stack and child; a failed hand-over of the keyboard says so apart", async () => {
  let active = "main";
  let failing = "layout.select";
  const { host, press } = await boardButton({ tree: () => layerLayout(active) });
  const run = host.run;
  host.run = (name, args) => {
    if (name === failing) throw new Error(`${name} broke`);
    run(name, args);
  };
  press();
  active = "board";
  press();
  failing = "board.focus";
  active = "main";
  press();
  failing = "pane.focus";
  active = "board";
  press();
  host.focus = { space: "s1", tab: "t1", pane: null, terminal: "t7" };
  press();
  assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [
    ['Could not show "board" in "work-stack"', "layout.select broke", "error"],
    ['Could not show "main" in "work-stack"', "layout.select broke", "error"],
    ["Could not give the board the keyboard", "board.focus broke", "error"],
    ["Could not give pane p1 the keyboard", "pane.focus broke", "error"],
    ["Could not give terminal t7 the keyboard", "pane.focus broke", "error"],
  ]);
  assert.deepEqual(host.runs, [SHOW_BOARD[0], SHOW_TAB[0], SHOW_TAB[0]], "the switches that did not fail");
});

test("UI: a press on the board button whose switch throws says so", async () => {
  const { host, press } = await boardButton();
  host.panes = () => {
    throw new Error("panes broke");
  };
  press("right");
  assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [["Board button failed", "panes broke", "error"]]);
});

test("UI: the board button is on the accent while the board layer shows the board, since the tab row keeps its tab marked, and plain otherwise", async () => {
  let tree = () => layerLayout("main");
  const { render } = await boardButton({ tree: () => tree() });
  const look = () => {
    const el = byId(render(), "board-open");
    return [el.with.bg?.[0] ?? null, el.with.text_color[0]];
  };
  const hovered = () => {
    const style = { with: {} };
    const proxy = { bg: (c) => ((style.with.bg = c), proxy), text_color: (c) => ((style.with.text_color = c), proxy) };
    byId(render(), "board-open").with.hover[0](proxy);
    return style.with;
  };
  assert.deepEqual(look(), [null, "#muted"], "the tab's content shows");
  assert.deepEqual(hovered(), { bg: "#hover", text_color: "#fg" }, "hovered while the tab's content shows");
  tree = () => layerLayout("board");
  assert.deepEqual(look(), ["#accent", "#onaccent"], "the board shows");
  assert.deepEqual(hovered(), {}, "hovered while the board shows: it stays on the accent");
  tree = () => null;
  assert.deepEqual(look(), [null, "#muted"], "a layout without the layer");
});

test("UI: the board button is an icon, named Board for the pointer and screen readers, that switches on the press of any mouse button and starts no window drag", async () => {
  const { host, render } = await boardButton();
  host.panes = () => [];
  const el = byId(render(), "board-open");
  assert.deepEqual([el.with.tooltip, el.with.accessibility_label], [["Board"], ["Board"]]);
  const presses = el.calls.filter((c) => c[0] === "on_mouse_down");
  assert.deepEqual(presses.map((c) => c[1]), ["left", "right", "middle"]);
  for (const [, button, handler] of presses) {
    let stopped = 0;
    handler({ button }, { stop_propagation: () => stopped++ });
    assert.equal(stopped, 1, `a ${button} press starts no window drag`);
  }
  assert.equal(host.runs.length, 3, "each press switches");
  assert.equal(el.with.on_click, undefined, "the release does not switch back");
  assert.deepEqual(el.kids.map((k) => k.with.path?.[0]), ["mods/board-button/board.svg"]);
  assert.match(readFileSync(join(buttonDir, "board.svg"), "utf8"), /^<svg [^>]*stroke="currentColor"/, "tinted with the text color");
});

test("the personal layout puts the board button left of the tabs, in a row as high as the tab bar", () => {
  const layout = personalLayout();
  const row = findById(layout, "tab-row");
  assert.ok(row, "a tab-row");
  assert.deepEqual([row.type, row.size, row.resizable], ["row", { px: 42 }, false]);
  assert.deepEqual(row.children.map((c) => [c.id, c.content?.mod, c.size, c.window_drag]), [
    ["board-button", "board-button", { px: 36 }, true],
    ["tabs", "tabs", { weight: 1 }, true],
  ], "both move the window, as the tab bar did");
  assert.equal(findById(layout, "work").children[0], row, "first in the work column");
});

test("the personal layout's work area is the board layer: a stack of the shown tab's content, shown first, and the board as the layer's copy", () => {
  const layout = personalLayout();
  const body = findById(layout, "work-body");
  const stack = body.children[0];
  assert.equal(stack.type, "stack", "where the tab's content was");
  const [tab, boardBlock] = stack.children;
  assert.equal(stack.active, tab.id, "the tab's content shows first");
  assert.deepEqual([tab.type, tab.content.tab, boardBlock.type, boardBlock.content], ["block", "active", "block", { mod: "board", props: { layer: true } }]);
  assert.equal(stack.children.length, 2);
});

// ---- Azure: the Sprint view ----

const DAY = 86400000;
const ORG = "https://dev.azure.com/example-org";
const ITERATION_ID = "7d1c8f0e-3b5a-4c2e-9f61-2a4b8c0d1e23";
const sprintTeam = () => board.contextsOf(sampleConfig(), "azure")[0];
// The fixture's sprint, its last day starting `days` days after the test
// clock's now (Azure's finishDate is that day's start).
function iterationAnswer(days = 3) {
  const list = json("azure-sprint-iteration.json");
  list[0].attributes.finishDate = `${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T00:00:00Z`;
  return JSON.stringify(list);
}
// The Sprint's az calls, told apart by their arguments.
const AZ = {
  iteration: (a) => a.includes("--timeframe"),
  areas: (a) => a[0] === "boards" && a[1] === "area",
  columns: (a) => a.includes("taskboardColumns"),
  types: (a) => a.includes("workitemtypes"),
  places: (a) => a.includes("taskboardWorkItems") && !a.includes("PATCH"),
  query: (a) => a[0] === "boards" && a[1] === "query",
  me: (a) => a[0] === "account",
  move: (a) => a.includes("PATCH"),
  state: (a) => a[1] === "work-item",
};
const openAz = (host, kind) => host.open("az").filter((c) => AZ[kind](c.args));
const SETTINGS = ["iteration", "areas", "columns", "types"];
const openCounts = (host, kinds) => kinds.map((k) => openAz(host, k).length);
// The fixture's taskboard columns' ids.
const COLUMN = { todo: "5b0c1e2a-0d4f-4a8e-9c31-7e6f2a9b1c01", prog: "5b0c1e2a-0d4f-4a8e-9c31-7e6f2a9b1c02", pr: "5b0c1e2a-0d4f-4a8e-9c31-7e6f2a9b1c03", done: "5b0c1e2a-0d4f-4a8e-9c31-7e6f2a9b1c04" };
// An answer to a move that names the work item in its new column.
const moved = (id, column, name) => ok(JSON.stringify({ workItemId: id, column: name, columnId: COLUMN[column], state: "In Progress" }));
// The fixture's taskboard answer, work items placed as `places` says (id →
// [column, name]); `drop`: ids it does not place.
function taskboardAnswer(places = {}, drop = []) {
  const answer = json("azure-sprint-taskboard.json");
  answer.value = answer.value.filter((w) => !drop.includes(w.workItemId));
  for (const w of answer.value) if (places[w.workItemId]) [w.columnId, w.column] = [COLUMN[places[w.workItemId][0]], places[w.workItemId][1]];
  return JSON.stringify(answer);
}
const azRefused = (text) => ({ code: 1, stdout: "", stderr: `ERROR: ${text}\n` });
// Answers the settings calls that are open (the types may be kept).
async function answerSettings(host, iteration = iterationAnswer()) {
  const answers = { iteration, areas: fixture("azure-sprint-areas.json"), columns: fixture("azure-sprint-columns.json"), types: fixture("azure-sprint-types.json") };
  for (const [kind, out] of Object.entries(answers)) if (openAz(host, kind).length) await host.answer("az", ok(out), AZ[kind]);
}
// A refresh of the shown Sprint, as its timer starts one (not r, which
// drops what is kept of the team first).
async function refreshSprint(b, cx) {
  b.refresh(b.view(), cx);
  await settle();
}
// One refresh's answers; `me`: the account's answer (true: the fixture's,
// false: none is asked).
async function answerRefresh(host, { me = true, items = fixture("azure-sprint-items.json"), places = fixture("azure-sprint-taskboard.json") } = {}) {
  await host.answer("az", ok(places), AZ.places);
  await host.answer("az", ok(items), AZ.query);
  if (me) await host.answer("az", me === true ? ok(fixture("azure-sprint-account.json")) : me, AZ.me);
}
// A Board on the Azure team's Sprint, read from the fixtures (az found).
async function openSprint(options = {}) {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found, ...options });
  await answerSettings(host, options.iteration);
  await answerRefresh(host, options);
  cx.later.splice(0);
  return { b, cx, host, view: b.view(), st: () => b.state(b.view().id) };
}
// The Sprint's data as sprintBoard builds it from the fixtures; `drop`:
// numbers of work items the query does not find.
const sprintParts = () => ({
  iteration: board.parseIteration(iterationAnswer()), columns: board.parseColumns(fixture("azure-sprint-columns.json")),
  types: board.parseAzureTypes(fixture("azure-sprint-types.json")), items: board.parseWorkItems(fixture("azure-sprint-items.json"), sprintTeam()),
  places: board.parseTaskboard(fixture("azure-sprint-taskboard.json")), viewer: "alex.sample@example.com",
});
function sprintData({ viewer = "alex.sample@example.com", drop = [] } = {}) {
  const parts = sprintParts();
  return board.sprintBoard({ ...parts, items: parts.items.filter((i) => !drop.includes(i.number)), viewer });
}
const columnId = (data, name) => data.columns.find((c) => c.name === name).id;
// The cards in each column cell of a drawn row.
const rowCells = (root, key) => byId(root, `row-${key}`).kids.slice(1).map((cell) => cell.kids.map((k) => k.with.id[0]));
const drawnRows = (root) => byId(root, "sprint-rows").kids.map((k) => k.with.id[0]);

test("the Sprint's az calls name the organisation without detection and the team; az devops invoke asks for api-version 7.1", () => {
  const c = sprintTeam();
  const org = ["--org", ORG, "--detect", "false"];
  const team = ["--project", "Example Project", "--team", "Example Team"];
  assert.deepEqual(board.azIterationArgs(c), ["boards", "iteration", "team", "list", ...org, ...team, "--timeframe", "current", "-o", "json"]);
  assert.deepEqual(board.azAreasArgs(c), ["boards", "area", "team", "list", ...org, ...team, "-o", "json"]);
  const invoke = (resource, route, more = []) => ["devops", "invoke", ...org, "--area", resource === "workitemtypes" ? "wit" : "work", "--resource", resource,
    "--route-parameters", ...route, "--api-version", "7.1", ...more, "-o", "json"];
  const route = ["project=Example Project", "team=Example Team"];
  assert.deepEqual(board.azColumnsArgs(c), invoke("taskboardColumns", route));
  assert.deepEqual(board.azTypesArgs(c), invoke("workitemtypes", ["project=Example Project"]));
  assert.deepEqual(board.azTaskboardArgs(c, ITERATION_ID), invoke("taskboardWorkItems", [...route, `iterationId=${ITERATION_ID}`]));
  assert.deepEqual(board.azMoveArgs(c, ITERATION_ID, 312, "/f.json"),
    invoke("taskboardWorkItems", [...route, `iterationId=${ITERATION_ID}`, "workItemId=312"], ["--http-method", "PATCH", "--in-file", "/f.json"]));
  assert.deepEqual(board.azQueryArgs(c, "SELECT 1"), ["boards", "query", ...org, "--project", "Example Project", "--wiql", "SELECT 1", "-o", "json"]);
  assert.deepEqual(board.azStateArgs(sprintTeam(), 311, "Done"), ["boards", "work-item", "update", ...org, "--id", "311", "--state", "Done", "-o", "json"]);
  assert.deepEqual(board.AZ_ME_ARGS, ["account", "show", "--query", "user", "-o", "json"]);
});

test("the Sprint's one query asks for the fields of the work items in the sprint's path and the team's areas, below one where the team includes them", () => {
  const wiql = board.sprintWiql(board.parseIteration(iterationAnswer()), board.parseAreas(fixture("azure-sprint-areas.json")));
  assert.equal(wiql, "SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo], [System.Parent], [System.AreaPath], [System.IterationPath] " +
    "FROM WorkItems WHERE [System.IterationPath] = 'Example Project\\Sprint 12' AND ([System.AreaPath] UNDER 'Example Project\\Core' OR [System.AreaPath] = 'Example Project\\Shared') " +
    "ORDER BY [System.Id]");
  const quoted = board.sprintWiql({ path: "P\\Sprint 'x'" }, { field: "System.AreaPath", values: [{ value: "P\\O'Neil", includeChildren: true }] });
  assert.match(quoted, /\[System\.IterationPath\] = 'P\\Sprint ''x''' AND \(\[System\.AreaPath\] UNDER 'P\\O''Neil'\)/);
  assert.match(board.sprintWiql({ path: "P" }, { field: "Custom.Team", values: [{ value: "Core", includeChildren: true }] }), /AND \(\[Custom\.Team\] = 'Core'\)/,
    "a team field that is no area path has no level below");
});

test("the Sprint's answers: the current sprint, the team's areas, the columns in their order, each work item's column, the work items, who az is", () => {
  assert.deepEqual(board.parseIteration(fixture("azure-sprint-iteration.json")),
    { id: ITERATION_ID, name: "Sprint 12", path: "Example Project\\Sprint 12", finish: "2026-11-27T00:00:00Z" });
  const past = { id: "old", name: "Sprint 11", path: "Example Project\\Sprint 11", attributes: { timeFrame: "past" } };
  assert.equal(board.parseIteration(JSON.stringify([past, ...json("azure-sprint-iteration.json")])).id, ITERATION_ID, "the current one");
  assert.throws(() => board.parseIteration("[]"), /^Error: Das Team hat keinen laufenden Sprint$/);
  assert.throws(() => board.parseIteration("not json"), /az lieferte für den Sprint kein lesbares JSON/);
  assert.deepEqual(board.parseAreas(fixture("azure-sprint-areas.json")), {
    field: "System.AreaPath", values: [{ value: "Example Project\\Core", includeChildren: true }, { value: "Example Project\\Shared", includeChildren: false }],
    default: "Example Project\\Core",
  });
  assert.deepEqual(board.parseAreas('{"field": {"referenceName": "Custom.Team"}, "values": [{"value": "Core", "includeChildren": false}]}'),
    { field: "Custom.Team", values: [{ value: "Core", includeChildren: false }], default: null }, "the team's own field, no default area");
  assert.throws(() => board.parseAreas('{"values": []}'), /keine Bereiche/);
  const columns = board.parseColumns(fixture("azure-sprint-columns.json"));
  assert.deepEqual(columns.map((c) => c.name), ["To Do", "In Progress", "In PR/Work done", "Done"]);
  assert.deepEqual(columns[2].mappings, [{ type: "Task", state: "In Progress" }]);
  assert.throws(() => board.parseColumns('{"columns": []}'), /keine Spalten des Taskboards/);
  const places = board.parseTaskboard(fixture("azure-sprint-taskboard.json"));
  assert.deepEqual(places.get(313), { columnId: columns[2].id, column: "In PR/Work done", state: "In Progress" });
  assert.equal(places.size, 7);
  assert.deepEqual(board.parseTaskboard(JSON.stringify(json("azure-sprint-taskboard.json").value)), places, "a plain list too");
  const items = board.parseWorkItems(fixture("azure-sprint-items.json"), sprintTeam());
  assert.equal(items.length, 8);
  assert.deepEqual(items[0], {
    key: "AB#301", source: "azure", kind: "workitem", number: 301, title: "Import the sample catalogue", type: "User Story", state: "In Progress",
    assignees: ["Alex Sample"], assigneeLogins: ["alex.sample@example.com"], parent: null, area: "Example Project\\Core", iteration: "Example Project\\Sprint 12",
    url: "https://dev.azure.com/example-org/Example%20Project/_workitems/edit/301", labels: [], sub: null, branch: null,
  });
  assert.equal(items[2].parent, 301);
  assert.deepEqual([items[1].assignees, items[1].assigneeLogins], [[], []], "no one assigned");
  assert.deepEqual([board.parseWorkItems("", sprintTeam()), board.parseWorkItems("\n", sprintTeam())], [[], []], "no output: nothing matched");
  assert.deepEqual(board.azPerson("Robin Example <Robin.Example@example.com>"), { name: "Robin Example", login: "robin.example@example.com" });
  assert.deepEqual(board.azPerson(undefined), { name: null, login: null });
  assert.deepEqual([board.parseViewer(fixture("azure-sprint-account.json")), board.parseViewer(""), board.parseViewer('"x@example.com"')], ["alex.sample@example.com", null, null]);
});

test("the sprint's taskboard: a row per story in the query's order after „Ohne Story“, the tasks in their taskboard columns, each column the types it maps", () => {
  const data = sprintData();
  assert.equal(data.shape, "sprint");
  assert.deepEqual(data.rows.map((r) => r.key), ["none", "AB#301", "AB#302"]);
  assert.deepEqual(data.columns.map((c) => [c.name, c.cards.map((k) => k.number)]), [["To Do", [311, 331]], ["In Progress", [312, 332]], ["In PR/Work done", [313]], ["Done", [321]]],
    "a work item the query did not find (399) is left out");
  const rowOfCard = (n) => data.columns.flatMap((c) => c.cards).find((k) => k.number === n).row;
  assert.deepEqual([311, 321, 331, 332].map(rowOfCard), ["AB#301", "AB#302", "none", "none"], "a story not in the sprint, or none, is „Ohne Story“");
  assert.deepEqual(data.columns.map((c) => [c.color, c.types]), [["muted", ["Task", "Bug"]], ["ansi4", ["Task", "Bug"]], ["ansi4", ["Task"]], ["ansi2", ["Task", "Bug"]]]);
  assert.deepEqual(data.columns[1].mappings, { Task: "In Progress", Bug: "Committed" });
  assert.deepEqual([data.meta.iterationId, data.meta.iteration, data.meta.typeStates["User Story"].length, data.viewer, data.total, data.limited],
    [ITERATION_ID, "Sprint 12", 6, "alex.sample@example.com", 8, false]);
  assert.deepEqual(sprintData({ drop: [331, 332] }).rows.map((r) => r.key), ["AB#301", "AB#302"], "no „Ohne Story“ without a task in it");
  const places = board.parseTaskboard(fixture("azure-sprint-taskboard.json"));
  places.set(311, { ...places.get(311), columnId: "gone" });
  const odd = board.sprintBoard({ ...sprintParts(), places });
  assert.equal(odd.columns.flatMap((c) => c.cards).some((k) => k.number === 311), false, "a task in a column the taskboard does not list is left out");
  assert.equal(odd.rows.some((r) => r.key === "AB#311"), false, "and is no story either");
  const many = Array.from({ length: board.AZ_QUERY_LIMIT }, (_, i) => ({ ...sprintParts().items[1], number: 5000 + i, key: `AB#${5000 + i}` }));
  assert.equal(board.sprintBoard({ ...sprintParts(), items: many }).limited, true, "as many as az boards query gives: maybe cut");
  assert.deepEqual([board.iterationUntil("2026-11-27T00:00:00Z", 0), board.iterationUntil(null, 1000), board.iterationUntil("soon", 1000)],
    [Date.parse("2026-11-28T00:00:00Z"), 1000 + DAY / 2, 1000 + DAY / 2], "the end of the last day, else half a day");
});

test("H/L step a task to the next column that maps its type; a moved task shows the state its column maps it to until a refresh reads it", () => {
  const data = sprintData();
  const step = (key, s) => board.stepTarget(data, key, s)?.name ?? null;
  assert.deepEqual([step("AB#312", 1), step("AB#332", 1), step("AB#311", -1), step("AB#313", -1)], ["In PR/Work done", "Done", null, "In Progress"],
    "a Bug skips the column only Tasks map");
  assert.equal(board.canDrop(data, board.findCard(data, "AB#332").card, data.columns[2]), false);
  const moved = board.moveCard(data, "AB#311", columnId(data, "In Progress"));
  const { card, column } = board.findCard(moved, "AB#311");
  assert.deepEqual([card.state, board.shownState(card, column)], ["To Do", "In Progress"]);
  const back = board.findCard(board.moveCard(moved, "AB#311", columnId(data, "To Do")), "AB#311");
  assert.equal(board.shownState(back.card, back.column), "To Do");
  assert.equal(board.shownState(data.rows[1].story, null), "In Progress");
  const read = { ...card, column: "x", readColumn: "x", state: "Done" };
  assert.equal(board.shownState(read, { mappings: { Task: "To Do" } }), "Done", "not moved since it was read: its own state");
});

test("the Sprint's keys walk the stories, then each column in row order; h/l stay in the row, past empty cells to the row's next item, and move nothing where the row has none", () => {
  const data = sprintData();
  const nav = board.sprintNav(data, "", false);
  assert.deepEqual(nav.map((c) => c.name), ["Story", "To Do", "In Progress", "In PR/Work done", "Done"]);
  assert.deepEqual(nav.map((c) => c.shown.map((i) => i.number)), [[301, 302], [331, 311], [332, 312], [313], [321]]);
  const go = (col, key, dir, columns = nav) => board.sprintNavigate(columns, { col, key }, dir);
  assert.deepEqual(go(0, "AB#301", "right"), { col: 1, key: "AB#311" });
  assert.deepEqual(go(1, "AB#311", "right"), { col: 2, key: "AB#312" });
  assert.deepEqual(go(3, "AB#313", "right"), { col: 3, key: "AB#313" }, "the row has nothing further right: nothing moves, not down to the next row");
  assert.deepEqual(go(0, "AB#302", "right"), { col: 4, key: "AB#321" }, "right past the row's empty cells");
  assert.deepEqual(go(4, "AB#321", "left"), { col: 0, key: "AB#302" }, "left past them, onto the row's story");
  assert.deepEqual(go(2, "AB#332", "left"), { col: 1, key: "AB#331" });
  assert.deepEqual(go(1, "AB#331", "left"), { col: 1, key: "AB#331" }, "„Ohne Story“ has no story: nothing moves");
  assert.deepEqual(go(0, "AB#302", "left"), { col: 0, key: "AB#302" }, "at the edge it stays");
  assert.deepEqual(go(4, "AB#321", "right"), { col: 4, key: "AB#321" }, "at the other edge too");
  const item = (key, row) => ({ key, row });
  const synthetic = [{ shown: [item("a", "r0")] }, { shown: [item("b", "r1"), item("c", "r0")] }, { shown: [item("d", "r0")] }];
  assert.deepEqual(board.sprintNavigate(synthetic, { col: 0, key: "a" }, "right"), { col: 1, key: "c" }, "the row's item, not the column's first");
  assert.deepEqual(board.sprintNavigate(synthetic, { col: 1, key: "b" }, "right"), { col: 1, key: "b" }, "none in the row: nothing moves");
  assert.deepEqual(board.sprintNavigate(synthetic, { col: 2, key: "d" }, "left"), { col: 1, key: "c" }, "the nearest column that has one");
  assert.deepEqual(board.sprintNavigate(synthetic, { col: 1, key: null }, "right"), { col: 2, key: "d" }, "with no item selected, as navigate");
  assert.deepEqual(go(1, "AB#331", "down"), { col: 1, key: "AB#311" });
  const mine = board.sprintNav(data, "", true);
  assert.deepEqual(mine.map((c) => c.shown.map((i) => i.number)), [[301], [331, 311], [], [313], []]);
  assert.deepEqual(go(1, "AB#311", "right", mine), { col: 3, key: "AB#313" }, "an empty column is passed over");
  assert.deepEqual(board.shownRows(data, mine).map((r) => r.key), ["none", "AB#301"]);
  const changed = board.withItemState(data, "AB#302", "In Dev Test");
  assert.deepEqual([changed.rows[2].story.state, data.rows[2].story.state], ["In Dev Test", "To Do"], "a new data, the old one kept");
  const moved = board.moveCard(data, "AB#311", columnId(data, "In Progress"));
  const set = board.findCard(board.withItemState(moved, "AB#311", "Done"), "AB#311");
  assert.deepEqual([set.card.state, board.shownState(set.card, set.column)], ["Done", "Done"], "a set state is the task's own");
});

test("UI: the Sprint reads its settings once, all at the same time, then the taskboard and the query per refresh; who az is once; a new sprint's settings once it ended", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  assert.deepEqual(openCounts(host, [...SETTINGS, "me"]), [1, 1, 1, 1, 1], "who az is beside them");
  assert.equal(host.open("az").length, 5);
  await answerSettings(host);
  assert.deepEqual(["places", "query", "me"].map((k) => openAz(host, k).length), [1, 1, 1], "at the same time");
  assert.ok(openAz(host, "places")[0].args.includes(`iterationId=${ITERATION_ID}`));
  assert.ok(openAz(host, "query")[0].args.includes(board.sprintWiql(board.parseIteration(iterationAnswer()), board.parseAreas(fixture("azure-sprint-areas.json")))));
  await answerRefresh(host);
  assert.equal(b.state(b.view().id).data.shape, "sprint");
  assert.ok(host.calls.every((c) => c.tool === found("az") && c.options.on === null && c.options.timeout === (AZ.me(c.args) ? board.AZ_ME_TIMEOUT : board.AZ_TIMEOUT)),
    "az by its path, here, with its timeout; who az is with its own short one");
  await refreshSprint(b, cx);
  assert.deepEqual(["places", "query"].map((k) => openAz(host, k).length), [1, 1]);
  assert.equal(host.open("az").length, 2, "a refresh is two az calls");
  await answerRefresh(host, { me: false });
  const end = Date.parse(JSON.parse(iterationAnswer())[0].attributes.finishDate) + DAY;
  advance(end - Date.now() - 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, SETTINGS), [0, 1, 0, 0], "still the sprint's last day: only the team's areas, kept for both views as long as the Backlog keeps its settings");
  await answerSettings(host);
  assert.equal(host.open("az").length, 2);
  await answerRefresh(host, { me: false });
  advance(2 * 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, [...SETTINGS, "me"]), [1, 1, 1, 1, 0], "the sprint ended: its settings again, not who az is");
});

test("UI: the Sprint shows a row per story, its tasks as cards with state, assignee, id and session in the taskboard's columns, and „Ohne Story“ first", async () => {
  const { b, host } = await openSprint({ iteration: fixture("azure-sprint-iteration.json") });
  host.spaceList = [...host.spaceList, { id: "s9", name: "z", folder: "/r/x", machine: null, branch: "main", active: false, status: null,
    tabs: [{ id: "t9", name: "AB#311 Parse the sample file", status: "working" }] }];
  const root = b.render();
  const head = texts(byId(root, "sprint-head"));
  for (const name of ["To Do", "In Progress", "In PR/Work done", "Done"]) assert.ok(head.includes(name), name);
  assert.ok(head.includes("Sprint 12 · bis 27.11. · 2 Stories"), head.join("|"));
  assert.ok(texts(byId(root, "card-AB#311")).includes("arbeitet"), "the card's session");
  assert.equal(texts(byId(root, "card-AB#312")).includes("arbeitet"), false);
  assert.deepEqual(drawnRows(root), ["row-none", "row-AB#301", "row-AB#302"]);
  assert.ok(texts(byId(root, "row-none")).includes("Ohne Story"));
  const story = texts(byId(root, "story-AB#301"));
  for (const s of ["301", "User Story", "Import the sample catalogue", "In Progress"]) assert.ok(story.includes(s), s);
  assert.deepEqual(rowCells(root, "AB#301"), [["card-AB#311"], ["card-AB#312"], ["card-AB#313"], []]);
  assert.deepEqual(rowCells(root, "none"), [["card-AB#331"], ["card-AB#332"], [], []]);
  assert.deepEqual(rowCells(root, "AB#302"), [[], [], [], ["card-AB#321"]]);
  const card = texts(byId(root, "card-AB#311"));
  for (const s of ["311", "Parse the sample file", "To Do", "Alex Sample"]) assert.ok(card.includes(s), s);
  assert.equal([...story, ...card].some((s) => s.includes("AB#")), false, "a story and a task show their number alone");
  assert.ok(texts(byId(root, "card-AB#332")).includes("Committed"), "a card shows its own state");
  assert.equal(texts(root).some((s) => s.includes("undefined")), false);
  assert.equal(texts(byId(root, `tab-${b.context().id}`)).at(-1), "8", "the tab counts stories and tasks");
});

test("UI: H/L move a task through the taskboard's columns with the column's name as newColumn; a story stays and says why", async () => {
  const { b, cx, host, st, view } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "l", shiftL);
  const path = "/home/sample/.cache/herdr-app/board/taskboard-move-311.json";
  assert.deepEqual(JSON.parse(host.files[path]), { newColumn: "In Progress" });
  const [move] = openAz(host, "move");
  assert.deepEqual(move.args, board.azMoveArgs(view.context, ITERATION_ID, 311, path));
  assert.equal(board.findCard(st().data, "AB#311").column.name, "In Progress", "the card moves at once");
  assert.ok(texts(byId(b.render(), "card-AB#311")).includes("In Progress"), "with the state that column maps it to");
  await host.answer("az", ok(JSON.stringify({ workItemId: 311, column: "In Progress" })), AZ.move);
  assert.equal(b.notice.text, "AB#311 steht jetzt in „In Progress“", "by its column's name");
  await press(b, cx, "l", shiftL);
  assert.deepEqual(JSON.parse(host.files[path]), { newColumn: "In PR/Work done" }, "the next move rewrites the work item's file");
  await host.answer("az", ok(JSON.stringify({ count: 1, value: [JSON.parse(moved(311, "pr", "In PR/Work done").stdout)] })), AZ.move);
  assert.equal(b.notice.text, "AB#311 steht jetzt in „In PR/Work done“", "an answer as a list too");
  await click(b, cx, "card-AB#332");
  await press(b, cx, "l", shiftL);
  assert.deepEqual(JSON.parse(host.files["/home/sample/.cache/herdr-app/board/taskboard-move-332.json"]), { newColumn: "Done" }, "a Bug skips the column only Tasks map");
  await host.answer("az", ok(JSON.stringify({ workItemId: 332, columnId: COLUMN.done })), AZ.move);
  assert.equal(b.notice.text, "AB#332 steht jetzt in „Done“", "by its column id");
  await click(b, cx, "story-AB#301");
  await press(b, cx, "l", shiftL);
  assert.equal(b.notice.text, "AB#301 ist eine Story: H/L verschieben Tasks, s ändert ihren Status");
  assert.equal(host.open("az").length, 0);
});

test("UI: a move Azure refuses goes back; one whose request cannot be written down refuses before az runs", async () => {
  const { b, cx, host, st } = await openSprint();
  await click(b, cx, "card-AB#311");
  host.failWrite = new Error("read-only file system");
  await press(b, cx, "l", shiftL);
  assert.equal(host.open("az").length, 0);
  assert.equal(b.notice.text, "AB#311 bleibt in „To Do“: Die Anfrage an Azure ließ sich nicht ablegen (/home/sample/.cache/herdr-app/board/taskboard-move-311.json): read-only file system");
  host.failWrite = null;
  await press(b, cx, "l", shiftL);
  await host.answer("az", azRefused("TF401320: Rule Error for field Task State."), AZ.move);
  assert.equal(board.findCard(st().data, "AB#311").column.name, "To Do");
  assert.equal(b.notice.text, "AB#311 bleibt in „To Do“: TF401320: Rule Error for field Task State.");
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 0], "a refused move drops the team's settings, not the project's types");
  await answerSettings(host);
  await answerRefresh(host, { me: false });
  assert.equal(board.findCard(st().data, "AB#311").column.name, "To Do", "a refresh lays no refused move over what it read");
  await press(b, cx, "l", shiftL);
  await host.answer("az", { code: 1, stdout: "", stderr: "Traceback (most recent call last):\nKeyError: 'value'\n" }, AZ.move);
  assert.equal(board.findCard(st().data, "AB#311").column.name, "In Progress", "a write without a clear answer keeps the card");
  assert.equal(b.notice.text, "AB#311 → In Progress: Ergebnis unklar: Traceback (most recent call last):; lädt neu");
  assert.deepEqual(["places", "query"].map((k) => openAz(host, k).length), [1, 1]);
});

test("UI: s on a task offers its type's states and sets one with az boards work-item update; then the Sprint is read again", async () => {
  const { b, cx, host, st } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "s");
  assert.deepEqual([b.modal.kind, b.modal.targets.map((t) => t.name), b.modal.at], ["status", ["To Do", "In Progress", "Done", "Removed"], 0]);
  await press(b, cx, "3");
  const [update] = openAz(host, "state");
  assert.deepEqual(update.args, board.azStateArgs(sprintTeam(), 311, "Done"));
  assert.deepEqual([board.findSprintItem(st().data, "AB#311").state, st().pending["AB#311"]], ["Done", true], "at once, while it is written");
  await host.answer("az", ok(JSON.stringify({ id: 311, fields: { "System.State": "Done" } })), AZ.state);
  assert.equal(b.notice.text, "AB#311 hat jetzt den Status „Done“");
  assert.deepEqual(["places", "query"].map((k) => openAz(host, k).length), [1, 1], "where Azure put it is read again");
  await answerRefresh(host, { me: false });
  await click(b, cx, "card-AB#312");
  await press(b, cx, "s");
  assert.equal(b.modal.at, 1, "the menu starts at the task's state");
  await press(b, cx, "3");
  await host.answer("az", { code: 1, stdout: "", stderr: "ERROR: Operation returned a 503 status code.\n" }, AZ.state);
  assert.equal(b.notice.text, "AB#312 → Done: Ergebnis unklar: Azure antwortete mit einem Fehler (az): Operation returned a 503 status code.; lädt neu");
  assert.equal(board.findSprintItem(st().data, "AB#312").state, "Done", "kept until the refresh says");
});

test("UI: s on a story offers its type's states; a refusal sets the state back, an answer without the state is unclear and reads again", async () => {
  const { b, cx, host, st } = await openSprint();
  await click(b, cx, "story-AB#302");
  await press(b, cx, "s");
  assert.deepEqual(b.modal.targets.map((t) => t.name), ["To Do", "In Progress", "In Dev Test", "In UAT", "Broken", "Done"]);
  await press(b, cx, "3");
  assert.equal(board.findSprintItem(st().data, "AB#302").state, "In Dev Test");
  await host.answer("az", azRefused("TF401320: Rule Error for field State."), AZ.state);
  assert.equal(board.findSprintItem(st().data, "AB#302").state, "To Do");
  assert.equal(b.notice.text, "AB#302 bleibt „To Do“: TF401320: Rule Error for field State.");
  assert.deepEqual([host.notes.at(-1).level, host.notes.at(-1).title], ["error", "Status von AB#302 nicht geändert"]);
  assert.equal(host.open("az").length, 0, "nothing read again");
  await press(b, cx, "s");
  await press(b, cx, "3");
  await press(b, cx, "s");
  await press(b, cx, "4");
  assert.equal(b.notice.text, "AB#302 wird noch gespeichert", "no second write while the first is open");
  await host.answer("az", ok("{}"), AZ.state);
  assert.equal(b.notice.text, "AB#302 → In Dev Test: Ergebnis unklar: Azure hat den Status nicht bestätigt; lädt neu");
  assert.equal(host.notes.at(-1).level, "warning");
  assert.deepEqual(openCounts(host, [...SETTINGS, "places", "state"]), [1, 1, 1, 0, 0, 0], "read again, with the team's settings the refusal dropped");
  st().data.meta.typeStates = {};
  await press(b, cx, "s");
  assert.deepEqual([b.modal, b.notice.text], [null, "Für User Story kennt das Board keine Status"]);
});

test("UI: a Sprint's cards and stories and a Backlog's rows show a work item's number without AB#; its details, notices and toasts keep AB#, a GitHub card its repo", async () => {
  const { b, cx, host } = await openSprint();
  assert.equal(texts(byId(b.render(), "card-AB#311"))[0], "311");
  assert.deepEqual(texts(byId(b.render(), "story-AB#301")).slice(0, 2), ["▾", "301"], "after its triangle");
  await click(b, cx, "card-AB#311");
  await click(b, cx, "card-AB#311");
  assert.ok(texts(byId(b.render(), "detail")).includes("AB#311"), "the details' head");
  await press(b, cx, "s");
  await press(b, cx, "3");
  assert.equal(b.notice.text, "AB#311 → Done …");
  await host.answer("az", azRefused("TF401320: Rule Error for field State."), (a) => AZ.state(a) && a[2] === "update");
  assert.deepEqual([b.notice.text, host.notes.at(-1).title], ["AB#311 bleibt „To Do“: TF401320: Rule Error for field State.", "Status von AB#311 nicht geändert"]);
  const { b: backlog } = await openBacklog();
  assert.equal(texts(byId(backlog.render(), "row-AB#401"))[0], "401");
  const { b: github } = await openBoard();
  assert.equal(texts(byId(github.render(), "card-PVTI_rec4"))[0], "tender#3004");
});

test("UI: Enter shows a work item's parent, state, assignee, column, area and iteration; o opens its page; Enter again names what is missing to start", async () => {
  const { b, cx } = await openSprint();
  await click(b, cx, "card-AB#311");
  await click(b, cx, "card-AB#311");
  const shown = texts(b.render());
  for (const s of ["Teil von AB#301", "zugewiesen: Alex Sample", "To Do ▾", "Spalte: To Do", "Bereich: Example Project\\Core", "Iteration: Example Project\\Sprint 12"]) {
    assert.ok(shown.includes(s), s);
  }
  assert.ok(byId(b.render(), "act-status"));
  await press(b, cx, "o");
  assert.deepEqual(cx.opened, ["https://dev.azure.com/example-org/Example%20Project/_workitems/edit/311"]);
  await press(b, cx, "enter");
  assert.equal(b.modal, null);
  assert.equal(b.notice.text, "Für AB#311 steht kein „checkout“ in views.json: „start.checkout“");
});

test("UI: „nur meine“ keeps the stories and tasks assigned to the account az is signed in as; a story shows dimmed for its own tasks; without that account it says why", async () => {
  const { b, cx } = await openSprint();
  await press(b, cx, "m");
  const root = b.render();
  assert.deepEqual(drawnRows(root), ["row-none", "row-AB#301"]);
  assert.deepEqual(rowCells(root, "AB#301"), [["card-AB#311"], [], ["card-AB#313"], []]);
  const { b: robin, cx: rcx } = await openSprint({ me: ok('{ "name": "robin.example@example.com", "type": "user" }\n') });
  await press(robin, rcx, "m");
  const other = robin.render();
  assert.deepEqual(drawnRows(other), ["row-none", "row-AB#301", "row-AB#302"]);
  const dimmed = byId(other, "story-AB#301");
  assert.deepEqual([dimmed.with.opacity, dimmed.with.on_click], [[0.5], undefined], "shown for its task, not to be chosen");
  const { b: none, cx: ncx, host } = await openSprint({ me: azRefused("Please run 'az login' to setup account.") });
  await press(none, ncx, "m");
  assert.ok(texts(none.render()).includes("„nur meine“ zeigt nichts: az hat nicht gesagt, wer angemeldet ist (az account show; das braucht az login): az ist nicht angemeldet (az login oder az devops login)"));
  await press(none, ncx, "r");
  assert.equal(openAz(host, "me").length, 1, "asked again while it fails");
});

test("UI: a Sprint that cannot be read says why in its view; a failed read of its settings keeps nothing of the team's", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  await host.answer("az", ok("[]"), AZ.iteration);
  for (const k of ["areas", "columns", "types"]) await host.answer("az", ok(fixture(`azure-sprint-${k}.json`)), AZ[k]);
  assert.equal(b.state(b.view().id).error, "Das Team hat keinen laufenden Sprint");
  assert.ok(texts(b.render()).includes("Das Team hat keinen laufenden Sprint"));
  await press(b, cx, "r");
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 0], "the team's settings are asked again; the project's types, read, are kept (typesOf)");
  await host.answer("az", azRefused("Before you can run Azure DevOps commands, you need to run the login command (az login if using AAD/MSA identity else az devops login if using PAT token) to setup credentials."), AZ.iteration);
  assert.equal(b.state(b.view().id).error, "az ist nicht angemeldet (az login oder az devops login)");
});

// The keys of the items in each taskboard column the keys walk.
const navTasks = (b) => b.navColumns(b.view()).slice(1).map((c) => c.shown.map((i) => i.key));

test("UI: z on a story folds its tasks away: its triangle closes, its row says how many tasks it holds, the keys skip them, the column heads count them still; z again unfolds them", async () => {
  const { b, cx, st } = await openSprint();
  let root = b.render();
  assert.deepEqual([texts(byId(root, "fold-AB#301")), byId(root, "folded-AB#301")], [["▾"], null]);
  await click(b, cx, "story-AB#301");
  await press(b, cx, "z");
  root = b.render();
  assert.deepEqual(texts(byId(root, "fold-AB#301")), ["▸"]);
  assert.deepEqual(["card-AB#311", "card-AB#312", "card-AB#313"].map((id) => byId(root, id)), [null, null, null], "its tasks are not drawn");
  assert.deepEqual(texts(byId(root, "folded-AB#301")), ["3 Tasks"]);
  assert.deepEqual(drawnRows(root), ["row-none", "row-AB#301", "row-AB#302"]);
  assert.deepEqual(rowCells(root, "AB#302"), [[], [], [], ["card-AB#321"]], "another row keeps its tasks");
  assert.deepEqual(st().sel, { col: 0, key: "AB#301" });
  assert.deepEqual(navTasks(b), [["AB#331"], ["AB#332"], [], ["AB#321"]]);
  await press(b, cx, "l");
  assert.equal(st().sel.key, "AB#301", "no task of its row to go to");
  assert.deepEqual(byId(root, "sprint-head").kids.slice(1).map((h) => texts(h).at(-1)), ["2", "2", "1", "1"], "folding is no filter");
  assert.equal(texts(byId(root, `tab-${b.context().id}`)).at(-1), "8");
  await press(b, cx, "z");
  root = b.render();
  assert.deepEqual([texts(byId(root, "fold-AB#301")), byId(root, "folded-AB#301")], [["▾"], null]);
  assert.deepEqual(rowCells(root, "AB#301"), [["card-AB#311"], ["card-AB#312"], ["card-AB#313"], []]);
  assert.deepEqual(navTasks(b), [["AB#331", "AB#311"], ["AB#332", "AB#312"], ["AB#313"], ["AB#321"]], "in row order, „Ohne Story“ first");
});

test("UI: a click on a row's triangle folds or unfolds it and chooses nothing; z on a task folds its row and chooses its story; „Ohne Story“ and a story without tasks have no triangle, and z there says so", async () => {
  const { b, cx, st } = await openSprint({ places: taskboardAnswer({}, [321]) });
  const before = st().sel;
  await click(b, cx, "fold-AB#301");
  assert.equal(byId(b.render(), "card-AB#312"), null);
  assert.deepEqual(st().sel, before, "the click chooses nothing");
  assert.ok(cx.stopped > 0, "nor does the story under it take the click");
  await click(b, cx, "fold-AB#301");
  assert.ok(byId(b.render(), "card-AB#312"));
  await click(b, cx, "card-AB#312");
  await press(b, cx, "z");
  assert.equal(byId(b.render(), "card-AB#312"), null);
  assert.deepEqual([st().sel, st().picked], [{ col: 0, key: "AB#301" }, "AB#301"], "its story, chosen");
  const root = b.render();
  assert.deepEqual([byId(root, "fold-none"), byId(root, "fold-AB#302")], [null, null], "no tasks in the row of AB#302");
  await click(b, cx, "card-AB#331");
  await press(b, cx, "z");
  assert.equal(b.notice.text, "Die Zeile „Ohne Story“ lässt sich nicht zuklappen");
  assert.ok(byId(b.render(), "card-AB#331"));
  await click(b, cx, "story-AB#302");
  await press(b, cx, "z");
  assert.equal(b.notice.text, "AB#302 hat keine Tasks zum Zuklappen");
});

test("UI: a folded row counts the tasks the filter leaves of all it holds; its story, hidden by the filter, stays dimmed for them", async () => {
  const { b, cx } = await openSprint();
  await click(b, cx, "story-AB#301");
  await press(b, cx, "z");
  b.filterText = "parse";
  const root = b.render();
  assert.deepEqual(drawnRows(root), ["row-AB#301"]);
  assert.deepEqual(texts(byId(root, "folded-AB#301")), ["1/3 Tasks"]);
  assert.deepEqual(byId(root, "story-AB#301").with.opacity, [0.5]);
  b.filterText = "";
  b.mine = true;
  assert.deepEqual(texts(byId(b.render(), "folded-AB#301")), ["2/3 Tasks"], "„nur meine“ thins it too");
});

test("UI: a fold that takes the selected task away selects its story without choosing it; a row of one task says so; the rows scroll as drawn, a folded row of a hidden story too", async () => {
  const { b, cx, st, host } = await openSprint({ me: ok('{ "name": "robin.example@example.com", "type": "user" }\n') });
  await click(b, cx, "card-AB#312");
  await click(b, cx, "card-AB#312");
  assert.equal(st().detail, true);
  await click(b, cx, "fold-AB#301");
  assert.deepEqual([st().sel, st().picked, st().detail], [{ col: 0, key: "AB#301" }, null, false]);
  await click(b, cx, "fold-AB#302");
  assert.deepEqual(texts(byId(b.render(), "folded-AB#302")), ["1 Task"]);
  await click(b, cx, "fold-AB#302");
  await press(b, cx, "m");
  assert.deepEqual(drawnRows(b.render()), ["row-none", "row-AB#301", "row-AB#302"], "both stories dimmed for Robin's tasks");
  await click(b, cx, "card-AB#321");
  assert.equal(host.scrolled.at(-1).row, 2, "its row as drawn, below the folded row of a hidden story");
});

test("a Sprint's folds as the store keeps them: a sprint's id and story keys, anything else none", () => {
  const folds = { sprint: ITERATION_ID, stories: ["AB#301"] };
  assert.equal(board.readStoredFolds(folds), folds);
  for (const bad of [null, "x", { sprint: 1, stories: [] }, { sprint: "s" }, { sprint: "s", stories: [3] }]) assert.equal(board.readStoredFolds(bad), null, JSON.stringify(bad));
});

test("UI: which stories are folded is remembered per sprint: a new board shows them folded, a new sprint all unfolded", async () => {
  const first = await openSprint();
  await click(first.b, first.cx, "story-AB#301");
  await press(first.b, first.cx, "z");
  const key = `folded:${first.view.id}`;
  const saved = JSON.parse(memory.get(key));
  assert.deepEqual(saved, { sprint: ITERATION_ID, stories: ["AB#301"] });
  const again = await openSprint({ stored: { source: "azure", [key]: saved } });
  assert.equal(byId(again.b.render(), "card-AB#311"), null, "folded after a restart");
  assert.deepEqual(navTasks(again.b)[0], ["AB#331"]);
  const next = JSON.parse(iterationAnswer());
  next[0].id = "next-sprint";
  const later = await openSprint({ stored: { source: "azure", [key]: saved }, iteration: JSON.stringify(next) });
  assert.ok(byId(later.b.render(), "card-AB#311"), "another sprint starts unfolded");
  await click(later.b, later.cx, "story-AB#302");
  await press(later.b, later.cx, "z");
  assert.deepEqual(JSON.parse(memory.get(key)), { sprint: "next-sprint", stories: ["AB#302"] }, "the new sprint's folds replace the old");
});

test("UI: on the Sprint h/l j/k walk stories and tasks by row, and the chosen item's row is scrolled into view", async () => {
  const { b, cx, host, st } = await openSprint();
  await click(b, cx, "story-AB#301");
  await press(b, cx, "l");
  assert.equal(st().sel.key, "AB#311");
  await press(b, cx, "l");
  assert.equal(st().sel.key, "AB#312");
  await press(b, cx, "k");
  assert.equal(st().sel.key, "AB#332");
  await press(b, cx, "h");
  assert.equal(st().sel.key, "AB#331");
  host.scrolled.length = 0;
  await click(b, cx, "card-AB#321");
  assert.equal(host.scrolled.at(-1).row, 2, "the third row shown");
});

test("UI: a Sprint with as many work items as az boards query gives says it may be cut", async () => {
  const items = Array.from({ length: board.AZ_QUERY_LIMIT }, (_, i) => ({ id: 5000 + i, fields: { "System.Title": `Item ${i}`, "System.WorkItemType": "User Story", "System.State": "To Do" } }));
  const { b } = await openSprint({ items: JSON.stringify(items) });
  assert.ok(texts(b.render()).includes("Nur die ersten 1000 Work Items des Sprints (so viele gibt az boards query)"));
});

test("the work item types' colors: each type's own as #rrggbb from six hex digits with or without #, or eight without their alpha; none for a type without one or in another form, and a warning where none is read; the Sprint carries them", () => {
  const { colors } = board.parseAzureTypes(fixture("azure-sprint-types.json"));
  assert.deepEqual(colors, { "User Story": "#009ccc", Task: "#f2cb1d", Bug: "#cc293d" });
  const odd = { value: [{ name: "A", color: "12345" }, { name: "B", color: "#123456" }, { name: "C" }, { name: "D", color: 7 }, { name: "E", color: "a1B2c3" }, { name: "F", color: "a1b2c3d4" }, { name: "G", color: 123456 }] };
  assert.deepEqual(board.parseAzureTypes(JSON.stringify(odd)).colors, { B: "#123456", E: "#a1b2c3", F: "#b2c3d4" }, "#rrggbb, and aarrggbb without its alpha");
  assert.deepEqual([board.typeColor("ff009ccc"), board.typeColor("#FF009CCC"), board.typeColor("09ccc"), board.typeColor(null)], ["#009ccc", "#009ccc", null, null]);
  assert.deepEqual(board.parseAzureTypes(JSON.stringify(odd)).warnings, [], "some read: no warning");
  const unread = { value: [{ name: "A", color: "rgb(0, 156, 204)" }, { name: "B", color: "blue" }, { name: "C" }] };
  assert.deepEqual(board.parseAzureTypes(JSON.stringify(unread)).warnings, ["Farben der Work-Item-Typen in unbekannter Form: rgb(0, 156, 204), blue"]);
  assert.deepEqual(board.parseAzureTypes(JSON.stringify({ value: [{ name: "C" }] })).warnings, [], "no colors named: nothing to say");
  assert.deepEqual(sprintData().meta.typeColors, colors);
});

test("the sprint's tasks are the work items of the types the taskboard's columns map: one it does not place is left out and counted, as is one in a column it does not list", () => {
  const parts = sprintParts();
  const places = board.parseTaskboard(taskboardAnswer({}, [312]));
  places.set(313, { ...places.get(313), columnId: "gone" });
  const data = board.sprintBoard({ ...parts, places });
  assert.deepEqual(data.columns.map((c) => c.cards.map((k) => k.number)), [[311, 331], [332], [], [321]]);
  assert.deepEqual(data.rows.map((r) => r.key), ["none", "AB#301", "AB#302"], "neither becomes a story");
  assert.deepEqual([data.meta.unplaced, data.meta.unknownColumns], [1, 1]);
  assert.deepEqual(board.sprintWarnings(data), ["1 Task ohne Platz auf dem Taskboard",
    "1 Task steht in einer Spalte, die das Board nicht kennt; die Spalten werden beim nächsten Neuladen neu gelesen"]);
  const story = { ...parts.items[1], number: 340, key: "AB#340", type: "Feature" };
  const placedStory = board.sprintBoard({ ...parts, items: [...parts.items, story], places: new Map([...board.parseTaskboard(fixture("azure-sprint-taskboard.json")), [340, { columnId: COLUMN.todo }]]) });
  assert.ok(placedStory.rows.some((r) => r.key === "AB#340"), "a type no column maps is a row, wherever the taskboard puts it");
  assert.deepEqual(board.sprintWarnings(sprintData()), []);
  assert.throws(() => board.parseTaskboard('{"count": 1, "value": [{"workItemId": "311"}]}'), /keine Work Items in den Spalten/);
  assert.equal(board.parseTaskboard('{"count": 0, "value": []}').size, 0, "an empty taskboard is one");
  assert.throws(() => board.parseAzureTypes("not json"), /az lieferte für die Work-Item-Typen kein lesbares JSON/);
});

test("UI: a task in a column the board does not know is warned about, and the team's columns and areas are read again with the next refresh, not the project's types", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  await answerSettings(host);
  const places = json("azure-sprint-taskboard.json");
  places.value[0].columnId = "renamed";
  await answerRefresh(host, { places: JSON.stringify(places) });
  assert.ok(texts(b.render()).includes("1 Task steht in einer Spalte, die das Board nicht kennt; die Spalten werden beim nächsten Neuladen neu gelesen"));
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 0]);
});

test("UI: a second team's sprint is read with its own team; the project's work item types are kept", async () => {
  const config = JSON.parse(testConfig());
  config.sources.azure.contexts.push({ team: { project: "Example Project", team: "Second Team" } });
  const { b, cx, host } = await openSprint({ config: JSON.stringify(config) });
  await press(b, cx, "3");
  assert.equal(b.view().context.team, "Second Team");
  assert.deepEqual(openCounts(host, [...SETTINGS, "me"]), [1, 1, 1, 0, 0]);
  for (const k of ["iteration", "areas", "columns"]) {
    const [c] = openAz(host, k);
    const at = c.args.indexOf("--team");
    assert.ok(at >= 0 ? c.args[at + 1] === "Second Team" : c.args.includes("team=Second Team"), k);
  }
});

test("UI: who az is has its own short timeout, and one it runs out of is said", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  await answerSettings(host);
  await answerRefresh(host, { me: false });
  assert.equal(b.state(b.view().id).data, null, "the data waits for who az is, as long as its own timeout");
  assert.deepEqual([board.AZ_ME_TIMEOUT, board.AZ_ME_TIMEOUT < board.AZ_TIMEOUT], [15000, true]);
  await host.answer("az", stopped("az", 15), AZ.me);
  assert.equal(b.state(b.view().id).data.shape, "sprint");
  await press(b, cx, "m");
  assert.ok(texts(b.render()).includes("„nur meine“ zeigt nichts: az hat nicht gesagt, wer angemeldet ist (az account show; das braucht az login): az antwortete nicht in 15 s"));
});

test("UI: a move Azure does not confirm is unclear: the card stays, the Sprint is read again and says where it stands", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "l", shiftL);
  await host.answer("az", ok(""), AZ.move);
  assert.equal(b.notice.text, "AB#311 → In Progress: Ergebnis unklar: Azure hat die Verschiebung nicht bestätigt; lädt neu");
  await answerRefresh(host, { me: false, places: taskboardAnswer({ 311: ["prog", "In Progress"] }) });
  assert.equal(b.notice.text, "AB#311 steht nach dem Neuladen in „In Progress“");
  await press(b, cx, "l", shiftL);
  await host.answer("az", ok("{}"), AZ.move);
  await answerRefresh(host, { me: false, places: taskboardAnswer({ 311: ["prog", "In Progress"] }) });
  assert.equal(b.notice.text, "AB#311 steht nach dem Neuladen in „In Progress“, nicht in „In PR/Work done“");
  assert.equal(host.notes.at(-1).title, "Status nach dem Neuladen");
});

test("UI: a state change without a clear answer is said after the next refresh: the state it has then; the state it has already sends nothing", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "story-AB#302");
  await press(b, cx, "s");
  await press(b, cx, "1");
  assert.deepEqual([host.open("az").length, b.notice], [0, null], "To Do again: nothing sent, nothing said");
  await press(b, cx, "s");
  await press(b, cx, "3");
  await host.answer("az", ok("{}"), AZ.state);
  const items = json("azure-sprint-items.json");
  items[1].fields["System.State"] = "In Dev Test";
  await answerRefresh(host, { me: false, items: JSON.stringify(items) });
  assert.equal(b.notice.text, "AB#302 hat nach dem Neuladen den Status „In Dev Test“");
  await press(b, cx, "s");
  await press(b, cx, "4");
  await host.answer("az", ok("{}"), AZ.state);
  await answerRefresh(host, { me: false, items: JSON.stringify(items) });
  assert.deepEqual([b.notice.text, b.notice.level], ["AB#302 hat nach dem Neuladen den Status „In Dev Test“, nicht „In UAT“", "warning"]);
  assert.equal(host.notes.at(-1).title, "Status nach dem Neuladen");
  await press(b, cx, "s");
  await press(b, cx, "5");
  await host.answer("az", ok("{}"), AZ.state);
  await answerRefresh(host, { me: false, items: JSON.stringify(items.filter((i) => i.id !== 302 && i.fields["System.Parent"] !== 302)) });
  assert.equal(b.notice.text, "AB#302 ist nach dem Neuladen nicht im Sprint");
});

test("UI: a state change whose view leaves views.json while it is written reads nothing after it; a refresh during a refused write keeps what it read", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "story-AB#302");
  await press(b, cx, "s");
  await press(b, cx, "3");
  const config = JSON.parse(testConfig());
  config.sources.azure.contexts[0].views = ["backlog"];
  host.config = JSON.stringify(config);
  b.reload(cx);
  await settle();
  await host.answer("az", ok("{}"), AZ.state);
  assert.equal(b.notice.text, "AB#302 → In Dev Test: Ergebnis unklar: Azure hat den Status nicht bestätigt");
  assert.deepEqual(openCounts(host, ["places", "query"]), [0, 0], "no Sprint reads follow");
  const fresh = await openSprint();
  await click(fresh.b, fresh.cx, "story-AB#302");
  await press(fresh.b, fresh.cx, "s");
  await press(fresh.b, fresh.cx, "3");
  await refreshSprint(fresh.b, fresh.cx);
  const items = json("azure-sprint-items.json");
  items[1].fields["System.State"] = "In UAT";
  await answerRefresh(fresh.host, { me: false, items: JSON.stringify(items) });
  await fresh.host.answer("az", azRefused("TF401320: Rule Error for field State."), AZ.state);
  assert.equal(board.findSprintItem(fresh.st().data, "AB#302").state, "In UAT", "the state read meanwhile, not the one before");
});

test("UI: r reads the shown team's sprint, areas and columns again, not the project's work item types", async () => {
  const { b, cx, host } = await openSprint();
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, SETTINGS), [0, 0, 0, 0], "a refresh keeps them");
  await answerRefresh(host, { me: false });
  await press(b, cx, "r");
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 0], "r drops them first");
});

test("a move counts as landed only where Azure's answer names the work item in its new column", () => {
  const data = sprintData();
  const { card } = board.findCard(data, "AB#311");
  const column = data.columns.find((c) => c.name === "In Progress");
  const check = (answer) => board.checkTaskboardMove(JSON.stringify(answer), card, column);
  const unclear = (answer, why) => assert.throws(() => check(answer), (e) => e.unclear && e.message === "Ergebnis unklar: Azure hat die Verschiebung nicht bestätigt", why);
  check({ workItemId: 311, columnId: column.id });
  check({ workItemId: 311, column: "In Progress" });
  check({ count: 2, value: [{ workItemId: 312, columnId: column.id }, { workItemId: 311, columnId: column.id }] });
  unclear({ workItemId: 311, columnId: COLUMN.pr, column: "In PR/Work done" }, "the item in another column");
  unclear({ columnId: column.id, column: "In Progress" }, "the column without the item");
  unclear({ workItemId: 312, columnId: column.id, column: "In Progress" }, "another item in the column");
  unclear({ count: 1, value: [{ workItemId: 312, columnId: column.id }] }, "a list without the item");
  assert.throws(() => board.checkTaskboardMove("not json", card, column), (e) => e.unclear);
});

test("UI: an open outcome waits through a write of another kind: a state change that lands keeps the move's report", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "l", shiftL);
  await host.answer("az", ok(""), AZ.move);
  assert.deepEqual(b.state(b.view().id).unclear.map((u) => [u.key, u.kind]), [["AB#311", "move"]]);
  await press(b, cx, "s");
  await press(b, cx, "3");
  await host.answer("az", ok(JSON.stringify({ id: 311, fields: { "System.State": "Done" } })), AZ.state);
  assert.deepEqual(b.state(b.view().id).unclear.map((u) => [u.key, u.kind]), [["AB#311", "move"]], "the move's outcome is still open");
  await answerRefresh(host, { me: false, places: taskboardAnswer({ 311: ["prog", "In Progress"] }) });
  assert.equal(b.notice.text, "AB#311 steht nach dem Neuladen in „In Progress“");
});

test("UI: a refused state change while a move of the item is open refreshes, and the move's line is said after it", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "l", shiftL);
  await host.answer("az", ok(""), AZ.move);
  await press(b, cx, "s");
  await press(b, cx, "3");
  await answerRefresh(host, { me: false, places: taskboardAnswer({ 311: ["prog", "In Progress"] }) });
  assert.deepEqual(b.state(b.view().id).unclear.map((u) => [u.key, u.kind]), [["AB#311", "move"]], "not due while the state is written");
  await host.answer("az", azRefused("TF401320: Rule Error for field State."), AZ.state);
  assert.equal(b.notice.text, "AB#311 bleibt „In Progress“: TF401320: Rule Error for field State.");
  assert.deepEqual(openCounts(host, [...SETTINGS, "places"]), [1, 1, 1, 0, 0], "a refresh follows (the refusal dropped the team's settings)");
  await answerSettings(host);
  await answerRefresh(host, { me: false, places: taskboardAnswer({ 311: ["prog", "In Progress"] }) });
  assert.equal(b.notice.text, "AB#311 steht nach dem Neuladen in „In Progress“");
});

test("UI: a move that lands while a state change of the item is open refreshes, and the state's line is said after it", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "s");
  await press(b, cx, "3");
  await host.answer("az", ok("{}"), AZ.state);
  await press(b, cx, "l", shiftL);
  const items = json("azure-sprint-items.json");
  items[2].fields["System.State"] = "Done";
  await answerRefresh(host, { me: false, items: JSON.stringify(items) });
  assert.deepEqual(b.state(b.view().id).unclear.map((u) => [u.key, u.kind]), [["AB#311", "state"]], "not due while the move is written");
  await host.answer("az", moved(311, "prog", "In Progress"), AZ.move);
  assert.equal(b.notice.text, "AB#311 steht jetzt in „In Progress“");
  assert.deepEqual(openCounts(host, ["places", "query"]), [1, 1], "a refresh follows");
  await answerRefresh(host, { me: false, items: JSON.stringify(items), places: taskboardAnswer({ 311: ["prog", "In Progress"] }) });
  assert.equal(b.notice.text, "AB#311 hat nach dem Neuladen den Status „Done“");
});

test("UI: an unclear move and an unclear state change of one item stay open side by side, and one refresh says both", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "l", shiftL);
  await host.answer("az", ok(""), AZ.move);
  await press(b, cx, "s");
  await press(b, cx, "3");
  const items = json("azure-sprint-items.json");
  items[2].fields["System.State"] = "Done";
  const after = { me: false, items: JSON.stringify(items), places: taskboardAnswer({ 311: ["prog", "In Progress"] }) };
  await answerRefresh(host, after);
  await host.answer("az", ok("{}"), AZ.state);
  assert.deepEqual(b.state(b.view().id).unclear.map((u) => [u.key, u.kind]), [["AB#311", "move"], ["AB#311", "state"]]);
  await answerRefresh(host, after);
  assert.equal(b.notice.text, "AB#311 steht nach dem Neuladen in „In Progress“; AB#311 hat nach dem Neuladen den Status „Done“");
});

test("who az is: the name of a JSON answer, in lower case, else null", () => {
  assert.deepEqual([board.parseViewer(" { \"name\": \"A@B.example\" }\n"), board.parseViewer("ERROR"), board.parseViewer(undefined), board.parseViewer("[]")], ["a@b.example", null, null, null]);
});

// ---- The Azure Backlog ----

// The Backlog's az calls, told apart by their arguments.
const AZB = {
  levels: (a) => a.includes("backlogs"),
  config: (a) => a.includes("backlogconfiguration"),
  settings: (a) => a.includes("show-default-iteration"),
  areas: (a) => a[0] === "boards" && a[1] === "area",
  ids: (a) => a[0] === "rest",
  types: (a) => a.includes("workitemtypes"),
  query: (a) => a[0] === "boards" && a[1] === "query" && !a.some((x) => x.includes("@Me")),
  created: (a) => a[0] === "boards" && a[1] === "query" && a.some((x) => x.includes("@Me")),
  me: (a) => a[0] === "account",
  state: (a) => a[1] === "work-item" && a[2] === "update",
  create: (a) => a[1] === "work-item" && a[2] === "create",
  parent: (a) => a[1] === "work-item" && a[2] === "relation",
};
const openAzb = (host, kind) => host.open("az").filter((c) => AZB[kind](c.args));
const BACKLOG_SETTINGS = ["levels", "config", "settings", "areas"];
const backlogCounts = (host, kinds) => kinds.map((k) => openAzb(host, k).length);
const BACKLOG_STORED = { source: "azure", "teamView:azure:team:Example Project/Example Team": "backlog" };
// Answers the Backlog's settings calls that are open.
async function answerBacklogSettings(host, { settings = fixture("azure-backlog-settings.json"), areas = fixture("azure-sprint-areas.json") } = {}) {
  const answers = { levels: fixture("azure-backlog-levels.json"), config: fixture("azure-backlog-config.json"), settings, areas };
  for (const [kind, out] of Object.entries(answers)) if (openAzb(host, kind).length) await host.answer("az", ok(out), AZB[kind]);
}
// One refresh's answers: the ids, then the query for their fields, and the
// project's work item types where they are asked (`types`: their answer);
// `me` as answerRefresh takes it.
async function answerBacklog(host, { me = true, ids = fixture("azure-backlog-ids.json"), items = fixture("azure-backlog-items.json"), types = ok(fixture("azure-sprint-types.json")) } = {}) {
  await host.answer("az", typeof ids === "string" ? ok(ids) : ids, AZB.ids);
  if (openAzb(host, "query").length) await host.answer("az", ok(items), AZB.query);
  if (openAzb(host, "types").length) await host.answer("az", types, AZB.types);
  if (me) await host.answer("az", me === true ? ok(fixture("azure-sprint-account.json")) : me, AZB.me);
}
// The fixture's ids with more appended (`extra`: ids).
const idsWith = (...extra) => {
  const answer = json("azure-backlog-ids.json");
  answer.workItems.push(...extra.map((id) => ({ rel: null, source: null, target: { id, url: `x/${id}` } })));
  return JSON.stringify(answer);
};
// The fixture's work items with more appended (`extra`: [id, title, type, rank]).
const itemsWith = (...extra) =>
  JSON.stringify([...json("azure-backlog-items.json"), ...extra.map(([id, title, type, rank]) => ({
    id, fields: { "System.Id": id, "System.Title": title, "System.WorkItemType": type, "System.State": "To Do", "System.IterationPath": "Example Project", "Microsoft.VSTS.Common.StackRank": rank },
  }))]);
// A Board on the Azure team's Backlog, read from the fixtures (az found).
async function openBacklog(options = {}) {
  const { b, cx, host } = await bootBoard({ stored: BACKLOG_STORED, which: found, ...options });
  await answerBacklogSettings(host, options);
  await answerBacklog(host, options);
  cx.later.splice(0);
  return { b, cx, host, view: b.view(), st: () => b.state(b.view().id) };
}
const backlogRows = (root) => byId(root, "backlog-rows").kids.map((k) => k.with.id[0]);
// The Backlog's data as backlogList builds it from the fixtures.
function backlogData({ ids = fixture("azure-backlog-ids.json"), items = fixture("azure-backlog-items.json"), viewer = "alex.sample@example.com" } = {}) {
  const config = board.parseBacklogConfig(fixture("azure-backlog-config.json"));
  return board.backlogList({
    ...board.backlogLevels(board.parseBacklogLevels(fixture("azure-backlog-levels.json")), config), config,
    settings: board.parseTeamSettings(fixture("azure-backlog-settings.json")), area: board.parseAreas(fixture("azure-sprint-areas.json")).default,
    ids: board.parseBacklogIds(ids), items: board.parseWorkItems(items, sprintTeam(), config.orderField), viewer,
  });
}

test("the Backlog's az calls: levels and configuration by az devops invoke at 7.1, the team's settings, the level's ids by az rest with Azure DevOps' resource, create and parent link", () => {
  const c = sprintTeam();
  const org = ["--org", ORG, "--detect", "false"];
  const invoke = (resource) => ["devops", "invoke", ...org, "--area", "work", "--resource", resource,
    "--route-parameters", "project=Example Project", "team=Example Team", "--api-version", "7.1", "-o", "json"];
  assert.deepEqual(board.azLevelsArgs(c), invoke("backlogs"));
  assert.deepEqual(board.azBacklogConfigArgs(c), invoke("backlogconfiguration"));
  assert.deepEqual(board.azTeamSettingsArgs(c), ["boards", "iteration", "team", "show-default-iteration", ...org, "--project", "Example Project", "--team", "Example Team", "-o", "json"]);
  assert.deepEqual(board.azBacklogIdsArgs(c, "Microsoft.RequirementCategory"), ["rest", "--method", "get", "--url",
    "https://dev.azure.com/example-org/Example%20Project/Example%20Team/_apis/work/backlogs/Microsoft.RequirementCategory/workItems?api-version=7.1",
    "--resource", "499b84ac-1321-427f-aa17-267ca6975798", "-o", "json"]);
  assert.deepEqual(board.azCreateArgs(c, { type: "User Story", title: "-x new", area: "Example Project\\Core", iteration: "Example Project\\Sprint 12" }), [
    "boards", "work-item", "create", ...org, "--project", "Example Project", "--type", "User Story", "--title=-x new",
    "--area", "Example Project\\Core", "--iteration", "Example Project\\Sprint 12", "--assigned-to", "me", "-o", "json",
  ], "a title that starts with a dash is no option");
  assert.deepEqual(board.azParentArgs(c, 451, 301), ["boards", "work-item", "relation", "add", ...org, "--id", "451", "--relation-type", "parent", "--target-id", "301", "-o", "json"]);
  assert.equal(board.idsWiql([302, 401], ["Microsoft.VSTS.Common.StackRank"]),
    "SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo], [System.Parent], [System.AreaPath], [System.IterationPath], " +
    "[Microsoft.VSTS.Common.StackRank] FROM WorkItems WHERE [System.Id] IN (302, 401) ORDER BY [System.Id]");
  assert.doesNotMatch(board.idsWiql([1]), /StackRank|\[null\]/, "no order field, none asked for");
});

test("the Backlog's answers: its levels, the requirement level and the one below, the order field, each type's states, the team's defaults, the ids in their order", () => {
  const levels = board.parseBacklogLevels(fixture("azure-backlog-levels.json"));
  assert.deepEqual(levels.map((l) => [l.id, l.type, l.defaultType]), [
    ["Microsoft.EpicCategory", "portfolio", "Epic"], ["Microsoft.FeatureCategory", "portfolio", "Feature"],
    ["Microsoft.RequirementCategory", "requirement", "User Story"], ["Microsoft.TaskCategory", "task", "Task"],
  ]);
  const config = board.parseBacklogConfig(fixture("azure-backlog-config.json"));
  const { level, childLevel } = board.backlogLevels(levels, config);
  assert.deepEqual([level.name, level.types, childLevel.types], ["Stories", ["User Story", "Bug"], ["Task"]]);
  assert.equal(board.backlogLevels(levels.filter((l) => l.type !== "task"), config).childLevel.name, "Tasks", "the configuration's task level");
  assert.throws(() => board.backlogLevels(levels.filter((l) => l.type !== "requirement"), config), /keine Backlog-Ebene für Anforderungen/);
  assert.throws(() => board.parseBacklogLevels('{"count": 0, "value": []}'), /keine Backlog-Ebenen/);
  const bugsFirst = json("azure-backlog-levels.json");
  bugsFirst.value[2].workItemTypes.reverse();
  assert.equal(board.parseBacklogLevels(JSON.stringify(bugsFirst))[2].defaultType, "User Story", "the level's default, not its first type");
  assert.equal(config.orderField, "Microsoft.VSTS.Common.StackRank");
  const scrum = json("azure-backlog-config.json");
  scrum.backlogFields.typeFields.Order = "Microsoft.VSTS.Common.BacklogPriority";
  assert.equal(board.parseBacklogConfig(JSON.stringify(scrum)).orderField, "Microsoft.VSTS.Common.BacklogPriority", "the Scrum process's field");
  scrum.backlogFields.typeFields.Order = "X] OR [System.Id";
  assert.equal(board.parseBacklogConfig(JSON.stringify(scrum)).orderField, null, "no field name, no order field");
  assert.deepEqual(config.typeStates.Bug, ["New", "Committed", "Done", "Removed"]);
  assert.deepEqual(config.states.map((s) => s.category), ["Proposed", "Proposed", "InProgress", "InProgress", "InProgress", "InProgress", "Resolved", "Completed", "Removed"]);
  assert.deepEqual(config.states.find((s) => s.name === "In UAT"), { id: "In UAT", name: "In UAT", category: "Resolved", color: "ansi5", done: false });
  assert.deepEqual(board.parseTeamSettings(fixture("azure-backlog-settings.json")),
    { defaultIteration: "Example Project\\Sprint 12", backlogIteration: "Example Project", follows: null });
  assert.deepEqual(board.parseTeamSettings("{}"), { defaultIteration: null, backlogIteration: null, follows: null });
  const following = json("azure-backlog-settings.json");
  following.defaultIterationMacro = "@currentIteration";
  following.defaultIteration.attributes = { finishDate: "2026-11-27T00:00:00Z" };
  const follows = board.parseTeamSettings(JSON.stringify(following));
  assert.deepEqual(follows.follows, { finish: "2026-11-27T00:00:00Z" }, "a default iteration that follows the current one");
  const now = Date.parse("2026-11-27T22:00:00Z");
  assert.deepEqual([board.backlogUntil(follows, now), board.backlogUntil(follows, now - DAY), board.backlogUntil(board.parseTeamSettings("{}"), now)],
    [Date.parse("2026-11-28T00:00:00Z"), now - DAY + board.BACKLOG_KEEP_MS, now + board.BACKLOG_KEEP_MS], "kept until that iteration ends, where that is sooner");
  assert.deepEqual(board.parseBacklogIds(fixture("azure-backlog-ids.json")), [302, 401, 301, 402, 403]);
  assert.deepEqual(board.parseBacklogIds('{"workItems": [{"target": {"id": 7}}, {"source": {"id": 7}, "target": {"id": 8}}, {"target": {"id": 7}}, {"target": null}]}'), [7, 8], "each once");
  assert.throws(() => board.parseBacklogIds("{}"), /keine Work Items des Backlogs/);
  assert.deepEqual([board.sprintName("P\\Sprint 1", "P"), board.sprintName("P", "P"), board.sprintName("P", null), board.sprintName("P\\Root", "P\\Root"), board.sprintName(null, "P")],
    ["Sprint 1", null, null, null, null]);
});

test("the backlog: its rows sorted by the order field, not the ids' list; one without an order value last; each with its sprint, or none", () => {
  const data = backlogData();
  assert.equal(data.shape, "backlog");
  assert.deepEqual(data.rows.map((r) => r.number), [301, 302, 401, 403, 402]);
  assert.deepEqual(data.rows.map((r) => r.sprint), ["Sprint 12", "Sprint 12", null, "Sprint 13", null]);
  assert.deepEqual([data.meta.area, data.meta.iteration, data.meta.missing, data.total, data.limited], ["Example Project\\Core", "Example Project\\Sprint 12", 0, 5, false]);
  const unranked = JSON.parse(fixture("azure-backlog-items.json")).map((i) => ({ ...i, fields: { ...i.fields, "Microsoft.VSTS.Common.StackRank": undefined } }));
  assert.deepEqual(backlogData({ items: JSON.stringify(unranked) }).rows.map((r) => r.number), [302, 401, 301, 402, 403], "without order values, the ids' order");
  const lost = backlogData({ ids: idsWith(499) });
  assert.deepEqual([lost.meta.missing, board.backlogWarnings(lost)], [1, ["1 Eintrag des Backlogs ohne Felder (nicht gefunden)"]]);
  const many = JSON.stringify({ workItems: Array.from({ length: board.AZ_QUERY_LIMIT + 5 }, (_, i) => ({ target: { id: 1000 + i } })) });
  const cut = backlogData({ ids: many, items: "[]" });
  assert.equal(cut.limited, true);
  assert.ok(board.backlogWarnings(cut).includes("Nur die ersten 1000 von 1005 Einträgen des Backlogs (so viele liest eine Abfrage)"));
  assert.deepEqual(board.backlogWarnings(data), []);
  assert.deepEqual(board.backlogWarnings({ ...data, meta: { ...data.meta, orderField: null } }), ["Reihenfolge ungeprüft: Azure nannte kein Order-Feld"],
    "without an order field the order is the list's, unchecked");
  assert.deepEqual(board.createTypes(data, null).map((t) => [t.name, t.child]), [["User Story", false], ["Bug", false]]);
  assert.deepEqual(board.createTypes(data, data.rows[0]).map((t) => [t.name, t.child]), [["User Story", false], ["Bug", false], ["Task", true]], "with an item, its children's types");
});

test("UI: the Backlog reads its settings once, all at the same time, then per refresh the ids and after them one query; who az is once; the settings again after some hours", async () => {
  const { b, cx, host } = await bootBoard({ stored: BACKLOG_STORED, which: found });
  assert.equal(b.view().layout, "backlog");
  assert.deepEqual(backlogCounts(host, [...BACKLOG_SETTINGS, "me", "ids"]), [1, 1, 1, 1, 1, 0], "at the same time, beside who az is");
  await answerBacklogSettings(host);
  assert.deepEqual(backlogCounts(host, ["ids", "types", "query"]), [1, 1, 0], "the ids first, beside the project's work item types");
  assert.ok(openAzb(host, "ids")[0].args.includes(board.backlogIdsUrl(b.view().context, "Microsoft.RequirementCategory")));
  assert.deepEqual(openAzb(host, "types")[0].args, board.azTypesArgs(b.view().context));
  await host.answer("az", ok(fixture("azure-sprint-types.json")), AZB.types);
  await host.answer("az", ok(fixture("azure-backlog-ids.json")), AZB.ids);
  const [query] = openAzb(host, "query");
  assert.ok(query.args.includes(board.idsWiql([302, 401, 301, 402, 403], ["Microsoft.VSTS.Common.StackRank"])), "their fields, after them");
  await host.answer("az", ok(fixture("azure-backlog-items.json")), AZB.query);
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZB.me);
  assert.equal(b.state(b.view().id).data.shape, "backlog");
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, [...BACKLOG_SETTINGS, "me", "ids", "types"]), [0, 0, 0, 0, 0, 1, 0], "a refresh: the ids, then the query");
  await answerBacklog(host, { me: false });
  assert.equal(board.BACKLOG_KEEP_MS, 4 * 3600000, "four hours");
  advance(board.BACKLOG_KEEP_MS - 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [0, 0, 0, 0], "still kept");
  await answerBacklog(host, { me: false });
  advance(2 * 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1], "read again");
});

test("UI: an empty backlog asks no query and says so; r reads the Backlog's settings again, not the Sprint's", async () => {
  const { b, cx, host } = await bootBoard({ stored: BACKLOG_STORED, which: found });
  await answerBacklogSettings(host);
  await host.answer("az", ok('{"workItems": []}'), AZB.ids);
  await host.answer("az", ok(fixture("azure-sprint-types.json")), AZB.types);
  assert.equal(openAzb(host, "query").length, 0, "no ids, no query");
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZB.me);
  assert.ok(texts(b.render()).includes("Der Backlog ist leer"));
  await press(b, cx, "r");
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1], "r drops them first");
  await answerBacklogSettings(host);
  await answerBacklog(host, { me: false });
  await press(b, cx, "v");
  assert.deepEqual(openCounts(host, SETTINGS), [1, 0, 1, 0], "the Sprint reads its own; the team's areas and the project's work item types are kept for both");
});

test("UI: r on the Backlog reads its own settings and the team's areas again, not the Sprint's sprint, columns or types", async () => {
  const { b, cx, host } = await openSprint();
  await press(b, cx, "v");
  await answerBacklogSettings(host);
  assert.deepEqual(openCounts(host, SETTINGS), [0, 0, 0, 0], "the areas the Sprint read serve the Backlog too");
  await answerBacklog(host, { me: false });
  await press(b, cx, "r");
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1]);
  await answerBacklogSettings(host);
  await answerBacklog(host, { me: false });
  await press(b, cx, "v");
  assert.deepEqual(openCounts(host, SETTINGS), [0, 0, 0, 0], "the Sprint is fresh: nothing read on the switch");
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, SETTINGS), [0, 0, 0, 0], "a Sprint refresh too: the areas the Backlog read again serve it");
});

test("UI: the Backlog shows one row per work item in backlog order: id, type, title, state, sprint („—“ for none) and assignee; the tab counts them", async () => {
  const { b, host } = await openBacklog();
  host.spaceList = [...host.spaceList, { id: "s9", name: "z", folder: "/r/x", machine: null, branch: "main", active: false, status: null,
    tabs: [{ id: "t9", name: "AB#302 Export the weekly report", status: "working" }] }];
  const root = b.render();
  assert.deepEqual(backlogRows(root), ["row-AB#301", "row-AB#302", "row-AB#401", "row-AB#403", "row-AB#402"]);
  assert.deepEqual(texts(byId(root, "row-AB#401")), ["401", "User Story", "Show the sample prices in euros", "To Do", "—", "Robin Example"]);
  assert.deepEqual(texts(byId(root, "row-AB#402")), ["402", "Bug", "Sample totals are off by one", "New", "—", ""]);
  assert.ok(texts(byId(root, "row-AB#302")).includes("arbeitet"), "a row's session");
  const head = texts(byId(root, "backlog-head"));
  assert.deepEqual(head, ["Stories · 5", "ID", "Typ", "Titel", "Status", "Sprint", "Zugewiesen"]);
  assert.equal(texts(byId(root, `tab-${b.context().id}`)).at(-1), "5");
  assert.equal(texts(root).some((s) => s.includes("undefined")), false);
});

test("UI: a failed az rest without az login says the Backlog needs it, as do an Entra answer and a 401; other failures say az's own words", async () => {
  const { b, cx, host } = await bootBoard({ stored: BACKLOG_STORED, which: found });
  await answerBacklogSettings(host);
  await host.answer("az", azRefused("Please run 'az login' to setup account."), AZB.ids);
  const said = "Der Backlog braucht az login (ein PAT reicht dafür nicht): Please run 'az login' to setup account.";
  assert.equal(b.state(b.view().id).error, said);
  assert.ok(texts(b.render()).includes(said));
  assert.equal(openAzb(host, "query").length, 0);
  for (const said of ["AADSTS700082: The refresh token has expired due to inactivity.", "Unauthorized({\"$id\":\"1\"})", "Operation returned a 401 status code."]) {
    assert.deepEqual([board.azRestFailure({ code: 1, stderr: `WARNING: x\nERROR: ${said}\n` }).message, board.azRestFailure({ code: 1, stderr: `ERROR: ${said}\n` }).unavailable],
      [`${board.BACKLOG_NEEDS_LOGIN}: ${said}`, true], said);
  }
  assert.equal(board.azRestFailure({ code: 1, stderr: "ERROR: Not Found(work item 4012)\n" }).message, "Not Found(work item 4012)", "401 as a word only, not inside 4012");
  assert.equal(board.azRestFailure({ code: 1, stderr: "ERROR: Not Found({\"message\": \"no backlog\"})\n" }).message, "Not Found({\"message\": \"no backlog\"})");
  assert.equal(board.azRestFailure({ code: 1, stderr: "WARNING: run az login --use-device-code on a headless machine\nERROR: Not Found(x)\n" }).message, "Not Found(x)",
    "az's WARNING lines do not count");
  await press(b, cx, "r");
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1], "r reads the settings again");
});

test("UI: n opens the create dialog: the level's types, the selected item's children's types after them, a title; Tab, h/l and Esc", async () => {
  const { b, cx, host } = await openBacklog();
  await press(b, cx, "n");
  const m = b.modal;
  assert.deepEqual([m.kind, m.types.map((t) => t.name), m.at, m.parent.key, m.field], ["create", ["User Story", "Bug", "Task"], 0, "AB#301", "title"]);
  assert.equal(m.inputFocused, true, "the title has the keyboard");
  const shown = () => texts(b.render());
  assert.ok(shown().includes("Neu in „Stories“; Bereich Example Project\\Core, Iteration Example Project\\Sprint 12, mir zugewiesen"));
  await press(b, cx, "tab");
  assert.deepEqual([m.field, m.inputFocused], ["type", false]);
  await press(b, cx, "l");
  await press(b, cx, "l");
  assert.equal(m.types[m.at].name, "Task");
  assert.ok(shown().includes("Task (unter AB#301)"));
  assert.ok(shown().includes("Neu unter AB#301 „Import the sample catalogue“; Bereich Example Project\\Core, Iteration Example Project\\Sprint 12, mir zugewiesen"));
  await press(b, cx, "h");
  assert.equal(m.types[m.at].name, "Bug");
  await press(b, cx, "tab", { modifiers: { shift: true } });
  assert.deepEqual([m.field, m.inputFocused], ["title", true], "back on the title, which has the keyboard again");
  await press(b, cx, "tab");
  await press(b, cx, "enter");
  assert.deepEqual([b.modal, m.error], [m, "Der Titel fehlt"], "no title: it stays and says so");
  await press(b, cx, "escape");
  assert.equal(b.modal, null);
  assert.equal(openAzb(host, "create").length, 0, "nothing created");
});

test("UI: a create writes the type, the title, the team's default area and iteration, assigned to me; no row before Azure names the id; then the new item shows, chosen", async () => {
  const { b, cx, host, st, view } = await openBacklog();
  await press(b, cx, "j");
  await press(b, cx, "n");
  b.modal.input.set_value("  Sample new story ");
  await click(b, cx, "create-go");
  assert.equal(b.modal, null);
  const [create] = openAzb(host, "create");
  assert.deepEqual(create.args, board.azCreateArgs(view.context, { type: "User Story", title: "Sample new story", area: "Example Project\\Core", iteration: "Example Project\\Sprint 12" }));
  assert.equal(st().data.rows.length, 5, "no row before Azure answers");
  assert.equal(b.notice.text, "User Story „Sample new story“ wird angelegt …");
  await press(b, cx, "n");
  b.modal.input.set_value("Second");
  await click(b, cx, "create-go");
  assert.deepEqual([b.modal?.kind, b.modal?.error, b.modal?.input.value()], ["create", "Ein Work Item wird noch angelegt …", "Second"],
    "one create at a time: the dialog stays with its title");
  assert.equal(openAzb(host, "create").length, 1);
  await press(b, cx, "escape");
  await host.answer("az", ok(fixture("azure-backlog-created.json")), AZB.create);
  assert.equal(b.notice.text, "AB#450 „Sample new story“ angelegt");
  assert.equal(openAzb(host, "parent").length, 0, "a Story under a Story is no child");
  assert.equal(openAzb(host, "ids").length, 1, "the backlog is read again");
  await answerBacklog(host, { me: false, ids: idsWith(450), items: itemsWith([450, "Sample new story", "User Story", 1500]) });
  assert.deepEqual([st().sel.key, st().picked], ["AB#450", "AB#450"], "the new item, chosen");
  assert.deepEqual(backlogRows(b.render()).slice(0, 2), ["row-AB#301", "row-AB#450"]);
  await refreshSprint(b, cx);
  await press(b, cx, "k");
  await answerBacklog(host, { me: false, ids: idsWith(450), items: itemsWith([450, "Sample new story", "User Story", 1500]) });
  assert.equal(st().sel.key, "AB#301", "chosen once, not by every refresh");
  await press(b, cx, "n");
  b.modal.input.set_value("Third");
  await click(b, cx, "create-go");
  await refreshSprint(b, cx);
  await host.answer("az", ok(JSON.stringify({ ...json("azure-backlog-created.json"), id: 460 })), AZB.create);
  const three = [idsWith(450, 460), itemsWith([450, "Sample new story", "User Story", 1500], [460, "Third", "User Story", 1200])];
  await answerBacklog(host, { me: false, ids: three[0], items: three[1] });
  assert.equal(st().sel.key, "AB#301", "a refresh that started before the create landed chooses nothing, even with the item");
  await answerBacklog(host, { me: false, ids: three[0], items: three[1] });
  assert.equal(st().sel.key, "AB#460", "the one that followed it does");
});

test("UI: a child type under the selected item is created, then linked to it as its parent; a refused link says the item is there without it", async () => {
  const { b, cx, host, view } = await openBacklog();
  await press(b, cx, "n");
  b.modal.input.set_value("Sample new task");
  await press(b, cx, "tab");
  await press(b, cx, "l");
  await press(b, cx, "l");
  await press(b, cx, "enter");
  assert.equal(openAzb(host, "create")[0].args[openAzb(host, "create")[0].args.indexOf("--type") + 1], "Task");
  await host.answer("az", ok(JSON.stringify({ ...json("azure-backlog-created.json"), id: 451 })), AZB.create);
  assert.equal(b.notice.text, "AB#451 „Sample new task“ angelegt; wird unter AB#301 gehängt …");
  const [link] = openAzb(host, "parent");
  assert.deepEqual(link.args, board.azParentArgs(view.context, 451, 301));
  await answerBacklog(host, { me: false });
  await host.answer("az", ok(fixture("azure-backlog-related.json")), AZB.parent);
  assert.equal(b.notice.text, "AB#451 hängt jetzt unter AB#301");
  assert.deepEqual([b.state(view.id).pending, openAzb(host, "create").length], [{}, 0], "nothing left under way, one create");
  assert.equal(b.state(view.id).sel.key, "AB#301", "a Task is no row of the Stories: the parent stays selected");
  await press(b, cx, "n");
  b.modal.input.set_value("Another task");
  b.modal.at = 2;
  await press(b, cx, "tab");
  await press(b, cx, "enter");
  await host.answer("az", ok(JSON.stringify({ ...json("azure-backlog-created.json"), id: 452 })), AZB.create);
  await host.answer("az", azRefused("TF401320: Rule Error for field Parent."), AZB.parent);
  assert.equal(b.notice.text, "AB#452 ist angelegt, hängt aber nicht unter AB#301: TF401320: Rule Error for field Parent.");
  assert.equal(host.notes.at(-1).title, "AB#452 hängt nicht unter AB#301", "the toast names the link, not a status");
});

test("UI: a create Azure refuses says why and drops the Backlog's settings; one without a clear answer reads again and says what the refresh found", async () => {
  const { b, cx, host } = await openBacklog();
  await press(b, cx, "n");
  b.modal.input.set_value("Sample new story");
  await click(b, cx, "create-go");
  await host.answer("az", azRefused("TF401320: Rule Error for field Area Path."), AZB.create);
  assert.equal(b.notice.text, "User Story „Sample new story“ nicht angelegt: TF401320: Rule Error for field Area Path.");
  assert.deepEqual([host.notes.at(-1).level, host.notes.at(-1).title], ["error", "„Sample new story“ nicht angelegt"]);
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1], "read again at once, with the settings the refusal dropped");
  await answerBacklogSettings(host);
  await answerBacklog(host, { me: false });
  await press(b, cx, "n");
  b.modal.input.set_value("Sample new story");
  await click(b, cx, "create-go");
  await host.answer("az", ok("{}"), AZB.create);
  assert.equal(b.notice.text, "User Story „Sample new story“ anlegen: Ergebnis unklar: Azure hat keine Nummer des neuen Work Items genannt; lädt neu");
  // An item of the same title is in the backlog already: the rows decide nothing.
  await answerBacklog(host, { me: false, ids: idsWith(450), items: itemsWith([450, "Sample new story", "User Story", 1500]) });
  const [check] = openAzb(host, "created");
  assert.ok(check.args.includes(board.createdWiql({ project: "Example Project", type: "User Story", title: "Sample new story" })),
    "one query: that project, type and title, created by me, today");
  assert.equal(board.createdWiql({ project: "P'x", type: "User Story", title: "O'Neil" }),
    "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'P''x' AND [System.WorkItemType] = 'User Story' " +
    "AND [System.Title] = 'O''Neil' AND [System.CreatedBy] = @Me AND [System.CreatedDate] = @Today ORDER BY [System.Id]");
  assert.match(board.createdWiql({ project: "P", type: "Task", title: "t", child: true }), /^SELECT \[System\.Id\], \[System\.Parent\] FROM/, "a child's asks for its parent");
  await host.answer("az", ok(JSON.stringify([{ id: 450, fields: { "System.Id": 450 } }])), AZB.created);
  assert.deepEqual([b.notice.text, b.notice.level], ["User Story „Sample new story“ ist angelegt (AB#450)", "info"]);
  const unclearCreate = async (title, answer) => {
    await press(b, cx, "n");
    b.modal.input.set_value(title);
    await click(b, cx, "create-go");
    await host.answer("az", { code: 1, stdout: "", stderr: "ERROR: Operation returned a 503 status code.\n" }, AZB.create);
    await answerBacklog(host, { me: false });
    await host.answer("az", answer, AZB.created);
  };
  await unclearCreate("Gone", ok(""));
  assert.deepEqual([b.notice.text, b.notice.level], ["User Story „Gone“ ist nicht angelegt: Azure kennt kein Work Item dieses Titels, das ich heute angelegt habe", "warning"]);
  await unclearCreate("Twice", ok(JSON.stringify([{ id: 460, fields: {} }, { id: 461, fields: {} }])));
  assert.equal(b.notice.text, "User Story „Twice“: Azure kennt 2 Work Items dieses Titels, die ich heute angelegt habe (AB#460, AB#461); welches es ist, sagt das Board nicht");
  await unclearCreate("Unknown", azRefused("TF400898: An internal error occurred."));
  assert.match(b.notice.text, /^User Story „Unknown“: ob es angelegt ist, ließ sich nicht prüfen \(.*TF400898.*\); vor einem neuen Versuch in Azure nachsehen$/);
});

test("UI: an unclear create of a Task under a Story says the Backlog cannot show it; the check names it and its missing parent link; each unclear create keeps its own outcome", async () => {
  const { b, cx, host, st } = await openBacklog();
  await press(b, cx, "n");
  b.modal.input.set_value("Sample new task");
  b.modal.at = 2;
  await click(b, cx, "create-go");
  await host.answer("az", ok(""), AZB.create);
  assert.equal(b.notice.text, "Task „Sample new task“ unter AB#301 anlegen (der Backlog zeigt keine Tasks: vor einem neuen Versuch in Azure nachsehen; mit AB#301 ist es noch nicht verknüpft): " +
    "Ergebnis unklar: Azure hat keine Nummer des neuen Work Items genannt; lädt neu");
  assert.equal(host.notes.at(-1).title, "Anlegen von „Sample new task“");
  assert.equal(openAzb(host, "parent").length, 0, "no link without an id");
  // The second create ends after the first one's refresh started (isDue
  // compares milliseconds).
  advance(5);
  await press(b, cx, "n");
  b.modal.input.set_value("Second story");
  await click(b, cx, "create-go");
  await host.answer("az", ok(""), AZB.create);
  assert.deepEqual(st().unclear.filter((u) => u.kind === "create").map((u) => [u.title, u.type, u.child, u.parent]),
    [["Sample new task", "Task", true, 301], ["Second story", "User Story", false, null]], "two creates, two outcomes");
  assert.equal(new Set(st().unclear.map((u) => u.key)).size, 2);
  await answerBacklog(host, { me: false });
  assert.equal(openAzb(host, "created").length, 1, "the refresh after the first settles the first");
  assert.match(openAzb(host, "created")[0].args.find((a) => a.startsWith("SELECT")), /\[System\.Parent\].*\[System\.WorkItemType\] = 'Task'/);
  await host.answer("az", ok(JSON.stringify([{ id: 449, fields: { "System.Parent": 301 } }, { id: 451, fields: {} }])), AZB.created);
  assert.deepEqual([b.notice.text, b.notice.level], ["Task „Sample new task“ ist angelegt (AB#451), hängt aber nicht unter AB#301", "warning"]);
  await answerBacklog(host, { me: false });
  await host.answer("az", ok(""), AZB.created);
  assert.equal(b.notice.text, "User Story „Second story“ ist nicht angelegt: Azure kennt kein Work Item dieses Titels, das ich heute angelegt habe");
  assert.equal(st().unclear.length, 0);
});

test("UI: Enter in the create dialog's title creates", async () => {
  const { b, cx, host } = await openBacklog();
  await press(b, cx, "n");
  b.modal.input.set_value("By Enter");
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.equal(b.modal, null);
  assert.ok(openAzb(host, "create")[0].args.includes("--title=By Enter"));
});

test("UI: an unclear parent link says so; the refresh cannot tell for a Task, and says that", async () => {
  const { b, cx, host } = await openBacklog();
  await press(b, cx, "n");
  b.modal.input.set_value("Sample new task");
  b.modal.at = 2;
  await click(b, cx, "create-go");
  await host.answer("az", ok(JSON.stringify({ ...json("azure-backlog-created.json"), id: 451 })), AZB.create);
  await host.answer("az", ok('{"id": 451, "relations": null}'), AZB.parent);
  assert.equal(b.notice.text, "AB#451 unter AB#301: Ergebnis unklar: Azure hat die Verknüpfung nicht bestätigt; lädt neu");
  assert.equal(host.notes.at(-1).title, "AB#451 unter AB#301");
  await answerBacklog(host, { me: false });
  await answerBacklog(host, { me: false });
  assert.deepEqual([b.notice.text, b.notice.level], ["Ob AB#451 unter AB#301 hängt, zeigt der Backlog nicht: AB#451 ist kein Eintrag von ihm", "warning"]);
});

test("UI: without the team's default area or iteration n says what is missing and opens no dialog", async () => {
  const settings = json("azure-backlog-settings.json");
  settings.defaultIteration = null;
  const noArea = '{"values": [{"value": "Example Project", "includeChildren": true}]}';
  const missing = async (options) => {
    const { b, cx } = await openBacklog(options);
    await press(b, cx, "n");
    return [b.modal, b.notice.text];
  };
  const text = (what) => `Das Team hat ${what}: in Azure unter Team-Einstellungen setzen`;
  assert.deepEqual(await missing({ settings: JSON.stringify(settings), areas: noArea }), [null, text("keinen Standardbereich und keine Standard-Iteration")]);
  assert.deepEqual(await missing({ areas: noArea }), [null, text("keinen Standardbereich")]);
  assert.deepEqual(await missing({ settings: JSON.stringify(settings) }), [null, text("keine Standard-Iteration")]);
});

test("UI: s on the Backlog offers the type's states from the backlog configuration and sets one; a refusal sets it back; one that landed reads nothing again", async () => {
  const { b, cx, host, st } = await openBacklog();
  await click(b, cx, "row-AB#402");
  await press(b, cx, "s");
  assert.deepEqual([b.modal.kind, b.modal.targets.map((t) => t.name), b.modal.at], ["status", ["New", "Committed", "Done", "Removed"], 0]);
  assert.deepEqual(b.modal.targets.map((t) => t.color), ["muted", "ansi4", "ansi2", "dim"]);
  await press(b, cx, "2");
  assert.deepEqual(openAzb(host, "state")[0].args, board.azStateArgs(sprintTeam(), 402, "Committed"));
  assert.equal(board.findBacklogItem(st().data, "AB#402").state, "Committed", "at once");
  await host.answer("az", ok(JSON.stringify({ id: 402, fields: { "System.State": "Committed" } })), AZB.state);
  assert.equal(b.notice.text, "AB#402 hat jetzt den Status „Committed“");
  assert.equal(openAzb(host, "ids").length, 0, "nothing read again");
  await press(b, cx, "s");
  await press(b, cx, "3");
  await host.answer("az", azRefused("TF401320: Rule Error for field State."), AZB.state);
  assert.equal(board.findBacklogItem(st().data, "AB#402").state, "Committed");
  assert.equal(b.notice.text, "AB#402 bleibt „Committed“: TF401320: Rule Error for field State.");
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1], "the refusal dropped the settings");
  await answerBacklogSettings(host);
  await answerBacklog(host, { me: false });
  await press(b, cx, "s");
  await press(b, cx, "3");
  await host.answer("az", ok("{}"), AZB.state);
  assert.equal(b.notice.text, "AB#402 → Done: Ergebnis unklar: Azure hat den Status nicht bestätigt; lädt neu");
  await answerBacklog(host, { me: false });
  assert.equal(b.notice.text, "AB#402 hat nach dem Neuladen den Status „New“, nicht „Done“");
  await press(b, cx, "s");
  await press(b, cx, "3");
  await host.answer("az", ok("{}"), AZB.state);
  await answerBacklog(host, { me: false, ids: '{"workItems": [{"target": {"id": 301}}]}' });
  assert.equal(b.notice.text, "AB#402 ist nach dem Neuladen nicht im Backlog");
});

test("UI: Enter on the Backlog shows a work item's parent, state, assignee, area, iteration and sprint; o opens its page", async () => {
  const { b, cx } = await openBacklog();
  await click(b, cx, "row-AB#401");
  await click(b, cx, "row-AB#401");
  const shown = texts(b.render());
  for (const s of ["Teil von AB#390", "To Do ▾", "zugewiesen: Robin Example", "Bereich: Example Project\\Core", "Iteration: Example Project", "Sprint: —"]) assert.ok(shown.includes(s), s);
  assert.ok(byId(b.render(), "act-status"));
  await click(b, cx, "row-AB#301");
  await press(b, cx, "enter");
  assert.ok(texts(b.render()).includes("Sprint: Sprint 12"));
  await press(b, cx, "o");
  assert.deepEqual(cx.opened, ["https://dev.azure.com/example-org/Example%20Project/_workitems/edit/301"]);
});

test("UI: „nur meine“ on the Backlog keeps the work items assigned to the account az is signed in as", async () => {
  const { b, cx } = await openBacklog();
  await press(b, cx, "m");
  assert.deepEqual(backlogRows(b.render()), ["row-AB#301", "row-AB#403"]);
  assert.ok(texts(byId(b.render(), "backlog-head")).includes("Stories · 2/5"));
  const { b: none, cx: ncx } = await openBacklog({ me: azRefused("Please run 'az login' to setup account.") });
  await press(none, ncx, "m");
  assert.ok(texts(none.render()).includes("„nur meine“ zeigt nichts: az hat nicht gesagt, wer angemeldet ist (az account show; das braucht az login): az ist nicht angemeldet (az login oder az devops login)"));
});

test("Azure's answers to a create and a parent link: the new id, the link to the parent's address; anything else leaves it open", () => {
  assert.equal(board.parseCreated(fixture("azure-backlog-created.json")), 450);
  for (const out of ["", "{}", '{"id": "450"}', "not json"]) {
    assert.throws(() => board.parseCreated(out), (e) => e.unclear && e.message === "Ergebnis unklar: Azure hat keine Nummer des neuen Work Items genannt", out);
  }
  board.checkParentLink(fixture("azure-backlog-related.json"), 301);
  const raw = json("azure-backlog-related.json");
  raw.relations[0].rel = "System.LinkTypes.Hierarchy-Reverse";
  board.checkParentLink(JSON.stringify(raw), 301);
  const unclear = (out, why) => assert.throws(() => board.checkParentLink(out, 301), (e) => e.unclear && e.message === "Ergebnis unklar: Azure hat die Verknüpfung nicht bestätigt", why);
  unclear(fixture("azure-backlog-related.json").replace("workItems/301", "workItems/3011"), "another work item");
  unclear(fixture("azure-backlog-related.json").replace('"rel": "Parent"', '"rel": "Child"'), "a child link");
  unclear('{"id": 451, "relations": null}', "no relations");
  unclear("", "no answer");
});

test("UI: a backlog longer than one query reads asks for the first ones and says so", async () => {
  const ids = JSON.stringify({ workItems: Array.from({ length: board.AZ_QUERY_LIMIT + 5 }, (_, i) => ({ target: { id: 1000 + i } })) });
  const { b, host } = await bootBoard({ stored: BACKLOG_STORED, which: found });
  await answerBacklogSettings(host);
  await host.answer("az", ok(ids), AZB.ids);
  await host.answer("az", ok(fixture("azure-sprint-types.json")), AZB.types);
  const [query] = openAzb(host, "query");
  const asked = query.args.find((a) => a.startsWith("SELECT")).match(/IN \(([^)]*)\)/)[1].split(", ");
  assert.deepEqual([asked.length, asked[0], asked.at(-1)], [1000, "1000", "1999"]);
  await host.answer("az", ok("[]"), AZB.query);
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZB.me);
  assert.ok(texts(b.render()).includes("Nur die ersten 1000 von 1005 Einträgen des Backlogs (so viele liest eine Abfrage)"));
});

// ---- Assignees: who an item is assigned to, and the picker that sets one ----

const isAssignableCall = (args) => args.some((a) => String(a).includes("assignableUsers"));
const isAssignCall = (args) => args.some((a) => String(a).includes("assigneeIds"));
const AZA = {
  members: (a) => a[0] === "devops" && a[1] === "team" && a[2] === "list-member",
  assign: (a) => a[1] === "work-item" && a[2] === "update" && a.includes("--assigned-to"),
};
// The rows the open picker draws, each as its texts.
const pickerRows = (b) => (byId(b.render(), "assign-rows")?.kids ?? []).filter((k) => k.with?.id?.[0]?.startsWith("assign-row-")).map(texts);
// Enter in the picker's filter, as herdr's input reports it.
const submitPicker = async (b, cx) => {
  cx.call((own) => b.modal.input.submit(own));
  await settle();
};
// GitHub's answer to an assignment: the item with the assignees it has now.
const assignedAnswer = (field, node, id, people) =>
  ok(JSON.stringify({ data: { [field]: { [node]: { id, assignees: { nodes: people.map(([login, name]) => ({ login, name })) } } } } }));
// az's answer to an assignment: the work item with the person it names.
const azAssigned = (id, who) => ok(JSON.stringify({ id, fields: { "System.State": "To Do", ...(who ? { "System.AssignedTo": { displayName: who[1], uniqueName: who[0] } } : {}) } }));

test("a GitHub card names its assignees by name where the account has one, else by login, and keeps their logins and its content's id; the filter and „nur meine“ go by login too", () => {
  const data = json("github-board.json");
  data.data.repositoryOwner.projectV2.items.nodes[0].content.assignees.nodes = [{ login: "robin-example", name: "Robin Example" }, { login: "kim-sample", name: null }];
  const card = board.parseGithubBoard(data, githubView(), HIDDEN).columns.flatMap((c) => c.cards).find((c) => c.key === "PVTI_rec1");
  assert.deepEqual([card.assignees, card.assigneeLogins], [["Robin Example", "kim-sample"], ["robin-example", "kim-sample"]]);
  assert.equal(board.findCard(githubBoard(), "PVTI_rec1").card.contentId, "I_sample3000");
  assert.equal(board.findCard(casesBoard(), "PVTI_case2").card.contentId, null, "a draft's is not read");
  assert.equal(board.matches(card, "robin-example"), true);
  assert.equal(board.matches(card, "Robin"), true);
  assert.equal(board.isMine(card, "robin-example"), true);
  assert.equal(board.isMine(card, "Robin Example"), false);
  const args = board.githubBoardArgs(githubView(), HIDDEN);
  const query = args.find((a) => a.startsWith("query="));
  for (const kind of ["Issue", "PullRequest"]) assert.match(query, new RegExp(`\\.\\.\\. on ${kind} \\{ id number `), kind);
  assert.equal(query.split("assignees(first: 5) { nodes { login name } }").length - 1, 3, "an issue's, a pull request's and a draft's assignees by login and name");
});

test("the assignee picker's calls: GitHub's assignable users of the item's repo with who gh is, the mutation for an issue or a pull request with one person's id or none; az's team members and its update with a login, me or no one", () => {
  const issue = board.findCard(githubBoard(), "PVTI_rec4").card;
  const pr = board.findCard(casesBoard(), "PVTI_case1").card;
  const q = board.githubAssignableArgs(issue);
  assert.deepEqual(q.slice(0, 3), ["api", "graphql", "-f"]);
  assert.match(q[3], /viewer \{ id login name \}/);
  assert.match(q[3], /assignableUsers\(first: 100\) \{ totalCount nodes \{ id login name \} \}/);
  assert.deepEqual(q.slice(4), ["-f", "owner=example", "-f", "name=tender"]);
  const robin = { id: "U_sample2", login: "robin-example", name: "Robin Example" };
  const m = board.githubAssignArgs(issue, robin);
  assert.match(m[3], /updateIssue\(input: \{ id: \$id, assigneeIds: \$assignees \}\)/);
  assert.deepEqual(m.slice(4), ["-f", `id=${issue.contentId}`, "-f", "assignees[]=U_sample2"]);
  assert.match(board.githubAssignArgs(pr, robin)[3], /updatePullRequest\(input: \{ pullRequestId: \$id, assigneeIds: \$assignees \}\)/);
  assert.deepEqual(board.githubAssignArgs(issue, null).slice(4), ["-f", `id=${issue.contentId}`, "-f", "assignees[]"], "an empty list: no one");
  const c = sprintTeam();
  const org = ["--org", ORG, "--detect", "false"];
  assert.deepEqual(board.azMembersArgs(c), ["devops", "team", "list-member", ...org, "--project", "Example Project", "--team", "Example Team", "--top", "1000", "-o", "json"]);
  const at = (who) => ["boards", "work-item", "update", ...org, "--id", "311", "--assigned-to", who, "-o", "json"];
  assert.deepEqual(board.azAssignArgs(c, 311, { login: "robin.example@example.com", name: "Robin Example" }), at("robin.example@example.com"));
  assert.deepEqual(board.azAssignArgs(c, 311, { me: true, login: "alex.sample@example.com", name: "Alex Sample" }), at("me"));
  assert.deepEqual(board.azAssignArgs(c, 311, null), at(""));
});

test("the picker's people: GitHub's viewer as me and the others by name, how many GitHub did not send, a repo it does not know; Azure's team members but groups, me among them by the account az is", () => {
  const issue = board.findCard(githubBoard(), "PVTI_rec4").card;
  const gh = board.parseAssignable(json("github-assignable.json"), issue);
  assert.deepEqual(gh.me, { id: "U_sample1", login: "sample-user", name: "Sam Sample", me: true });
  assert.deepEqual(gh.people.map((p) => [p.id, p.login, p.name]), [["U_sample3", "kim-sample", "kim-sample"], ["U_sample2", "robin-example", "Robin Example"]], "by name, me left out");
  assert.equal(gh.note, null);
  const more = json("github-assignable.json");
  more.data.repository.assignableUsers.totalCount = 140;
  assert.equal(board.parseAssignable(more, issue).note, "erste 3 von 140");
  assert.throws(() => board.parseAssignable({ data: { viewer: null, repository: null } }, issue, [{ path: ["repository"], message: "Could not resolve to a Repository" }]),
    /^Error: GitHub: Could not resolve to a Repository$/);
  assert.throws(() => board.parseAssignable({ data: { viewer: null, repository: null } }, issue), /GitHub kennt example\/tender nicht/);
  const az = board.membersFor(board.parseMemberList(fixture("azure-team-members.json")), "alex.sample@example.com");
  assert.deepEqual(az.me, { login: "alex.sample@example.com", name: "Alex Sample", me: true });
  assert.deepEqual(az.people, [{ login: "kim.sample@example.com", name: "Kim Sample" }, { login: "robin.example@example.com", name: "Robin Example" }], "no group");
  assert.deepEqual(board.membersFor(board.parseMemberList(fixture("azure-team-members.json")), null).me, { login: null, name: null, me: true }, "az's me, whoever that is");
  assert.equal(board.membersFor(board.parseMemberList(fixture("azure-team-members.json")), "x@example.com").people.length, 3, "a viewer who is no member leaves all");
  const full = JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ identity: { displayName: `P${i}`, uniqueName: `p${i}@example.com` } })));
  assert.equal(board.membersFor(board.parseMemberList(full), null).note, "erste 1000");
  assert.throws(() => board.parseMemberList('{"x": 1}'), /Azure lieferte keine Mitglieder des Teams/);
});

test("an assignment's answer must name the people it set: GitHub's item with those logins, az's work item with that person or none; anything else is unclear", () => {
  const issue = board.findCard(githubBoard(), "PVTI_rec4").card;
  const robin = { id: "U_sample2", login: "robin-example", name: "Robin Example" };
  const answer = (people, id = issue.contentId) => JSON.parse(assignedAnswer("updateIssue", "issue", id, people).stdout);
  assert.deepEqual(board.checkAssigned(answer([["robin-example", "Robin Example"]]), issue, robin), { names: ["Robin Example"], logins: ["robin-example"] });
  assert.deepEqual(board.checkAssigned(answer([]), issue, null), { names: [], logins: [] });
  for (const [json, why] of [[answer([]), "no one"], [answer([["kim-sample", null]]), "another"], [answer([["robin-example", "R"]], "I_other"), "another item"], [{}, "nothing"]]) {
    assert.throws(() => board.checkAssigned(json, issue, robin), (e) => e.unclear && e.message === "Ergebnis unklar: GitHub hat die Zuweisung nicht bestätigt", why);
  }
  const named = azAssigned(311, ["Robin.Example@example.com", "Robin Example"]).stdout;
  assert.deepEqual(board.checkAzAssigned(named, 311, { login: "robin.example@example.com" }), { names: ["Robin Example"], logins: ["robin.example@example.com"] });
  assert.deepEqual(board.checkAzAssigned(named, 311, { me: true, login: null }), { names: ["Robin Example"], logins: ["robin.example@example.com"] }, "me, whoever az is");
  assert.deepEqual(board.checkAzAssigned(azAssigned(311, null).stdout, 311, null), { names: [], logins: [] });
  assert.throws(() => board.checkAzAssigned(named, 312, { login: "robin.example@example.com" }), (e) => e.unclear, "another work item");
  for (const [out, person] of [[named, null], [named, { me: true, login: "alex.sample@example.com" }], [azAssigned(311, null).stdout, { login: "x@example.com" }], ["", null], ["{}", null]]) {
    assert.throws(() => board.checkAzAssigned(out, 311, person), (e) => e.unclear && e.message === "Ergebnis unklar: Azure hat die Zuweisung nicht bestätigt");
  }
});

test("UI: a on a GitHub card opens the picker: Ich, niemand, then the repo's assignable people, narrowed by the filter; Enter assigns the one marked at once, gh replaces all assignees with that one, and the card shows them", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "a");
  assert.equal(b.modal.kind, "assign");
  assert.deepEqual(pickerRows(b), [], "none before GitHub answers");
  assert.ok(texts(byId(b.render(), "assign-menu")).includes("lädt …"));
  const [ask] = host.open("gh").filter((c) => isAssignableCall(c.args));
  assert.deepEqual(ask.args, board.githubAssignableArgs(st().data.columns.flatMap((c) => c.cards).find((c) => c.key === "PVTI_rec4")));
  await host.answer("gh", ok(fixture("github-assignable.json")), isAssignableCall);
  assert.deepEqual(pickerRows(b), [["Ich", "Sam Sample"], ["niemand"], ["kim-sample", "kim-sample"], ["Robin Example", "robin-example"]]);
  b.modal.input.type("rob");
  assert.deepEqual(pickerRows(b), [["Robin Example", "robin-example"]]);
  b.modal.input.type("sample-user");
  assert.deepEqual(pickerRows(b), [["Ich", "Sam Sample"]], "by login too");
  b.modal.input.type("");
  await press(b, cx, "down");
  await press(b, cx, "down");
  b.modal.input.type("sam");
  assert.equal(pickerRows(b).length, 2);
  assert.equal(b.modal.at, 0, "a new filter marks its first row");
  b.modal.input.type("");
  await press(b, cx, "down");
  await press(b, cx, "down");
  await press(b, cx, "down");
  await press(b, cx, "down");
  assert.equal(b.modal.at, 3, "the last row, no further");
  await press(b, cx, "up");
  assert.equal(b.modal.at, 2);
  await press(b, cx, "n", { modifiers: { control: true } });
  assert.equal(b.modal.at, 3);
  await submitPicker(b, cx);
  assert.equal(b.modal, null);
  const [write] = host.open("gh").filter((c) => isAssignCall(c.args));
  assert.deepEqual(write.args.slice(-2), ["-f", "assignees[]=U_sample2"]);
  const card = () => board.findCard(st().data, "PVTI_rec4").card;
  assert.deepEqual([card().assignees, st().pending.PVTI_rec4], [["Robin Example"], true], "at once");
  assert.ok(texts(byId(b.render(), "card-PVTI_rec4")).includes("Robin Example"));
  assert.equal(b.notice.text, "tender#3004 → Robin Example …");
  await host.answer("gh", assignedAnswer("updateIssue", "issue", card().contentId, [["robin-example", "Robin Example"]]), isAssignCall);
  assert.deepEqual([card().assignees, card().assigneeLogins], [["Robin Example"], ["robin-example"]]);
  assert.equal(b.notice.text, "tender#3004 ist jetzt Robin Example zugewiesen");
  assert.equal(host.open("gh").length, 0, "nothing read again");
  await press(b, cx, "a");
  b.modal.input.type("robin");
  await submitPicker(b, cx);
  assert.deepEqual([b.modal, host.open("gh").length], [null, 0], "the one it has already: nothing sent");
  await press(b, cx, "a");
  assert.deepEqual(pickerRows(b)[1], ["niemand"], "the repo's people are kept: no second question");
  assert.equal(host.open("gh").length, 0);
  await press(b, cx, "down");
  await submitPicker(b, cx);
  assert.deepEqual(host.open("gh").filter((c) => isAssignCall(c.args))[0].args.slice(-2), ["-f", "assignees[]"]);
  await host.answer("gh", assignedAnswer("updateIssue", "issue", card().contentId, []), isAssignCall);
  assert.deepEqual([card().assignees, b.notice.text], [[], "tender#3004 ist jetzt niemandem zugewiesen"]);
  await press(b, cx, "a");
  await submitPicker(b, cx);
  assert.deepEqual(host.open("gh").filter((c) => isAssignCall(c.args))[0].args.slice(-2), ["-f", "assignees[]=U_sample1"], "Ich: the viewer's id");
  assert.deepEqual(card().assignees, ["Sam Sample"]);
});

test("UI: an assignment GitHub refuses goes back with the error; one without a clear answer reads the board again and says who it has then; a pull request takes its own mutation", async () => {
  const { b, cx, host, st } = await openBoard({ answer: fixture("github-board-cases.json") });
  await clickCard(b, cx, "PVTI_case1");
  await press(b, cx, "a");
  await host.answer("gh", ok(fixture("github-assignable.json")), isAssignableCall);
  b.modal.input.type("robin");
  await submitPicker(b, cx);
  const card = () => board.findCard(st().data, "PVTI_case1").card;
  const [write] = host.open("gh").filter((c) => isAssignCall(c.args));
  assert.match(write.args[3], /updatePullRequest/);
  await host.answer("gh", { code: 1, stdout: JSON.stringify({ errors: [{ type: "FORBIDDEN", path: ["updatePullRequest"], message: "Resource not accessible" }] }), stderr: "gh: Resource not accessible\n" }, isAssignCall);
  assert.deepEqual(card().assignees, ["sample-user"], "back as it was");
  assert.equal(b.notice.text, "tender#3050 bleibt sample-user zugewiesen: Resource not accessible");
  assert.deepEqual([host.notes.at(-1).title, host.notes.at(-1).level], ["Zuweisung von tender#3050 nicht geändert", "error"]);
  await press(b, cx, "a");
  b.modal.input.type("robin");
  await submitPicker(b, cx);
  await host.answer("gh", ok('{"data": {"updatePullRequest": null}}'), isAssignCall);
  assert.equal(b.notice.text, "tender#3050 → Robin Example: Ergebnis unklar: GitHub hat die Zuweisung nicht bestätigt; lädt neu");
  assert.deepEqual(card().assignees, ["Robin Example"], "kept until the refresh says");
  await host.answer("gh", ok(fixture("github-board-cases.json")), isBoardCall);
  assert.equal(b.notice.text, "tender#3050 ist nach dem Neuladen sample-user zugewiesen, nicht Robin Example");
});

test("UI: a picker whose people cannot be read says what failed, in the dialog and as a toast, and offers what needs no list (on GitHub niemand); the next a asks again; a draft, an item without access and a PR list take no a", async () => {
  const { b, cx, host } = await openBoard({ answer: fixture("github-board-cases.json") });
  await clickCard(b, cx, "PVTI_case4");
  await press(b, cx, "a");
  await host.answer("gh", { code: 1, stdout: "", stderr: "error connecting to api.github.com\n" }, isAssignableCall);
  assert.ok(texts(byId(b.render(), "assign-menu")).includes("Wer zuweisbar ist, ließ sich nicht lesen: GitHub nicht erreichbar: error connecting to api.github.com"));
  assert.deepEqual([host.notes.at(-1).title, host.notes.at(-1).level], ["Zuweisen: Personen nicht gelesen", "error"]);
  assert.deepEqual(pickerRows(b), [["niemand"]]);
  assert.equal(b.modal.at, -1, "no row marked: Enter must not clear the assignees");
  await submitPicker(b, cx);
  assert.deepEqual([b.modal?.kind, host.open("gh").filter((c) => isAssignCall(c.args)).length], ["assign", 0], "Enter does nothing");
  b.modal.input.type("nie");
  assert.equal(b.modal.at, -1, "nor after typing");
  await press(b, cx, "down");
  assert.equal(b.modal.at, 0, "down marks the first row");
  await press(b, cx, "escape");
  await press(b, cx, "a");
  assert.equal(host.open("gh").filter((c) => isAssignableCall(c.args)).length, 1, "asked again");
  await press(b, cx, "escape");
  await clickCard(b, cx, "PVTI_case2");
  await press(b, cx, "a");
  assert.deepEqual([b.modal, b.notice.text], [null, "Entwurf ohne Repo: erst in ein Issue umwandeln"]);
  await clickCard(b, cx, "PVTI_case3");
  await press(b, cx, "a");
  assert.deepEqual([b.modal, b.notice.text], [null, "Auf diesen Eintrag hat gh keinen Zugriff"]);
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")), (args) => !isAssignableCall(args));
  await press(b, cx, "a");
  assert.deepEqual([b.modal, b.notice.text], [null, "Hier gibt es keine Zuweisung zu ändern"], "a PR list has no a");
});

test("UI: a on a Sprint's task offers the team's members, Ich first; Ich is az's me, the answer names who it is; the Backlog of the same team asks no second time; a story shows its assignee too", async () => {
  const { b, cx, host, st, view } = await openSprint();
  assert.ok(texts(byId(b.render(), "story-AB#301")).includes("Alex Sample"), "a story's assignee");
  await click(b, cx, "card-AB#312");
  await press(b, cx, "a");
  const [ask] = host.open("az").filter((c) => AZA.members(c.args));
  assert.deepEqual(ask.args, board.azMembersArgs(view.context));
  await host.answer("az", ok(fixture("azure-team-members.json")), AZA.members);
  assert.deepEqual(pickerRows(b), [["Ich", "Alex Sample"], ["niemand"], ["Kim Sample", "kim.sample@example.com"], ["Robin Example", "robin.example@example.com"]]);
  await submitPicker(b, cx);
  const [write] = host.open("az").filter((c) => AZA.assign(c.args));
  assert.deepEqual(write.args, board.azAssignArgs(view.context, 312, { me: true }));
  const task = () => board.findSprintItem(st().data, "AB#312");
  assert.deepEqual(task().assignees, ["Alex Sample"], "at once");
  await host.answer("az", azAssigned(312, ["Alex.Sample@example.com", "Alex Sample"]), AZA.assign);
  assert.deepEqual([task().assignees, task().assigneeLogins, b.notice.text], [["Alex Sample"], ["alex.sample@example.com"], "AB#312 ist jetzt Alex Sample zugewiesen"]);
  assert.equal(host.open("az").length, 0, "nothing read again");
  await click(b, cx, "story-AB#302");
  await press(b, cx, "a");
  b.modal.input.type("kim");
  await submitPicker(b, cx);
  assert.deepEqual(host.open("az").filter((c) => AZA.assign(c.args))[0].args, board.azAssignArgs(view.context, 302, { login: "kim.sample@example.com" }));
  assert.deepEqual(board.findSprintItem(st().data, "AB#302").assignees, ["Kim Sample"], "a story at once too");
  await host.answer("az", azRefused("TF401320: Rule Error for field Assigned To."), AZA.assign);
  assert.deepEqual([board.findSprintItem(st().data, "AB#302").assignees, b.notice.text], [[], "AB#302 bleibt ohne Zuweisung: TF401320: Rule Error for field Assigned To."]);
  await press(b, cx, "v");
  await answerBacklogSettings(host);
  await answerBacklog(host, { me: false });
  await click(b, cx, "row-AB#401");
  await press(b, cx, "a");
  assert.equal(host.open("az").filter((c) => AZA.members(c.args)).length, 0, "the team's members are kept");
  assert.equal(pickerRows(b).length, 4);
  await press(b, cx, "down");
  await submitPicker(b, cx);
  assert.deepEqual(host.open("az").filter((c) => AZA.assign(c.args))[0].args, board.azAssignArgs(view.context, 401, null));
  await host.answer("az", azAssigned(401, null), AZA.assign);
  assert.deepEqual(board.findBacklogItem(b.state(b.view().id).data, "AB#401").assignees, []);
});

test("UI: on Azure a picker whose members cannot be read says so and offers Ich and niemand; an unclear assignment reads the Sprint again and says who has the item then", async () => {
  const { b, cx, host, st } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "a");
  await host.answer("az", azRefused("Operation returned a 403 status code."), AZA.members);
  assert.ok(texts(byId(b.render(), "assign-menu")).includes("Wer zuweisbar ist, ließ sich nicht lesen: Operation returned a 403 status code."));
  assert.deepEqual(pickerRows(b), [["Ich"], ["niemand"]]);
  assert.equal(b.modal.at, -1, "after a failed read no row is marked");
  await press(b, cx, "down");
  await press(b, cx, "down");
  await submitPicker(b, cx);
  await host.answer("az", ok("{}"), AZA.assign);
  assert.equal(b.notice.text, "AB#311 → niemand: Ergebnis unklar: Azure hat die Zuweisung nicht bestätigt; lädt neu");
  assert.deepEqual(board.findSprintItem(st().data, "AB#311").assignees, []);
  await answerRefresh(host, { me: false });
  assert.equal(b.notice.text, "AB#311 ist nach dem Neuladen Alex Sample zugewiesen, nicht niemandem");
  await click(b, cx, "card-AB#312");
  await press(b, cx, "a");
  await host.answer("az", azRefused("Operation returned a 403 status code."), AZA.members);
  await press(b, cx, "down");
  await submitPicker(b, cx);
  assert.deepEqual(host.open("az").filter((c) => AZA.assign(c.args))[0].args, board.azAssignArgs(b.view().context, 312, { me: true }));
  assert.deepEqual(board.findSprintItem(st().data, "AB#312").assignees, ["alex.sample@example.com"], "az's me by its login, its name not known yet");
  await host.answer("az", azAssigned(312, ["Alex.Sample@example.com", "Alex Sample"]), AZA.assign);
  assert.deepEqual([board.findSprintItem(st().data, "AB#312").assignees, b.notice.text], [["Alex Sample"], "AB#312 ist jetzt Alex Sample zugewiesen"], "as the answer names it");
});

test("a person is named by name, else by login, in every source alike: an empty name counts as none", () => {
  assert.deepEqual([board.personName({ name: "Kim Sample", login: "kim" }), board.personName({ name: "", login: "kim" }), board.personName({ name: null, login: null })], ["Kim Sample", "kim", null]);
  assert.deepEqual(board.azPerson({ displayName: "", uniqueName: "Kim.Sample@example.com" }), { name: "Kim.Sample@example.com", login: "kim.sample@example.com" });
  assert.deepEqual(board.azPerson("<kim.sample@example.com>"), { name: "kim.sample@example.com", login: "kim.sample@example.com" });
  const members = JSON.stringify([{ identity: { displayName: "", uniqueName: "Kim.Sample@example.com" } }]);
  assert.deepEqual(board.membersFor(board.parseMemberList(members), null).people, [{ login: "kim.sample@example.com", name: "Kim.Sample@example.com" }]);
  const data = json("github-board.json");
  data.data.repositoryOwner.projectV2.items.nodes[0].content.assignees.nodes = [{ login: "kim-sample", name: "" }];
  assert.deepEqual(board.findCard(board.parseGithubBoard(data, githubView(), HIDDEN), "PVTI_rec1").card.assignees, ["kim-sample"]);
});

test("Azure's members say the list may be cut only where az gave as many as it was asked for", () => {
  const list = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ identity: { displayName: `P${i}`, uniqueName: `p${i}@example.com` } })));
  assert.deepEqual([board.membersFor(board.parseMemberList(fixture("azure-team-members.json")), null).note, board.membersFor(board.parseMemberList(list(999)), null).note, board.membersFor(board.parseMemberList(list(1000)), null).note],
    [null, null, "erste 1000"]);
});

test("an unclear assignment after a refresh: whom the item has where the login it was set to is unknown (az's me), and where it is not in the view any more", () => {
  const how = { find: (data, key) => data.rows.find((r) => r.key === key) ?? null, where: "im Backlog" };
  const data = { rows: [{ key: "AB#1", assignees: ["Alex Sample"], assigneeLogins: ["alex.sample@example.com"] }] };
  assert.deepEqual(board.unclearAssignLines([{ key: "AB#1", label: "AB#1", logins: null, who: "ich" }], data, how),
    [{ text: "AB#1 ist nach dem Neuladen Alex Sample zugewiesen", warn: false }]);
  assert.deepEqual(board.unclearAssignLines([{ key: "AB#9", label: "AB#9", logins: [], who: "niemand" }], data, how),
    [{ text: "AB#9 ist nach dem Neuladen nicht im Backlog", warn: true }]);
});

test("UI: a refused assignment leaves an item a refresh read since as that refresh has it", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "a");
  await host.answer("gh", ok(fixture("github-assignable.json")), isAssignableCall);
  b.modal.input.type("robin");
  await submitPicker(b, cx);
  b.refresh(b.view(), cx);
  await settle();
  const data = json("github-board.json");
  data.data.repositoryOwner.projectV2.items.nodes.find((n) => n.id === "PVTI_rec4").content.assignees.nodes = [{ login: "kim-sample", name: null }];
  await host.answer("gh", ok(JSON.stringify(data)), isBoardCall);
  await host.answer("gh", { code: 1, stdout: JSON.stringify({ errors: [{ type: "FORBIDDEN", path: ["updateIssue"], message: "Resource not accessible" }] }), stderr: "gh: Resource not accessible\n" }, isAssignCall);
  assert.deepEqual(board.findCard(st().data, "PVTI_rec4").card.assignees, ["kim-sample"]);
});

test("UI: the picker's keys: ctrl-j and ctrl-n go down, ctrl-k, ctrl-p and up go up, not above the first row; a click on a row assigns that person", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "a");
  await host.answer("gh", ok(fixture("github-assignable.json")), isAssignableCall);
  const ctrl = (k) => press(b, cx, k, { modifiers: { control: true } });
  await ctrl("j");
  assert.equal(b.modal.at, 1);
  await ctrl("k");
  assert.equal(b.modal.at, 0);
  await press(b, cx, "up");
  assert.equal(b.modal.at, 0, "not above the first row");
  await ctrl("n");
  await ctrl("n");
  await ctrl("p");
  assert.equal(b.modal.at, 1);
  await click(b, cx, "assign-row-3");
  assert.equal(b.modal, null);
  assert.deepEqual(host.open("gh").filter((c) => isAssignCall(c.args))[0].args.slice(-2), ["-f", "assignees[]=U_sample2"]);
});

test("UI: Azure's picker asks who az is each time it opens: a viewer read since is Ich and leaves the members' list, which is kept", async () => {
  const { b, cx, host } = await openSprint({ me: azRefused("Please run 'az login' to setup account.") });
  await click(b, cx, "card-AB#312");
  await press(b, cx, "a");
  await host.answer("az", ok(fixture("azure-team-members.json")), AZA.members);
  await host.answer("az", azRefused("Please run 'az login' to setup account."), AZ.me);
  assert.deepEqual(pickerRows(b).map((r) => r[0]), ["Ich", "niemand", "Alex Sample", "Kim Sample", "Robin Example"], "who az is unknown: all members");
  await press(b, cx, "escape");
  await press(b, cx, "a");
  assert.equal(host.open("az").filter((c) => AZA.members(c.args)).length, 0, "the members are kept");
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZ.me);
  assert.deepEqual(pickerRows(b), [["Ich", "Alex Sample"], ["niemand"], ["Kim Sample", "kim.sample@example.com"], ["Robin Example", "robin.example@example.com"]]);
});

test("UI: a triangle's click on another row keeps the selected task", async () => {
  const { b, cx, st } = await openSprint();
  await click(b, cx, "card-AB#331");
  await click(b, cx, "fold-AB#301");
  assert.deepEqual([st().sel, st().picked], [{ col: 1, key: "AB#331" }, "AB#331"]);
});

test("UI: the Backlog keeps the project's work item types BACKLOG_KEEP_MS, then reads them again", async () => {
  const { b, cx, host } = await openBacklog();
  advance(board.BACKLOG_KEEP_MS - 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, ["types"]), [0], "still kept");
  await answerBacklog(host, { me: false });
  advance(2 * 60000);
  await refreshSprint(b, cx);
  await answerBacklogSettings(host);
  assert.deepEqual(backlogCounts(host, ["types"]), [1], "read again");
});

test("UI: the Sprint and the Backlog say where the project's work item types name colors in a form the board does not read", async () => {
  const types = json("azure-sprint-types.json");
  for (const type of types.value) type.color = "rgb(1, 2, 3)";
  const warning = "Farben der Work-Item-Typen in unbekannter Form: rgb(1, 2, 3)";
  const { b, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  for (const [kind, out] of [["iteration", iterationAnswer()], ["areas", fixture("azure-sprint-areas.json")], ["columns", fixture("azure-sprint-columns.json")], ["types", JSON.stringify(types)]]) {
    await host.answer("az", ok(out), AZ[kind]);
  }
  await answerRefresh(host);
  assert.ok(b.state(b.view().id).warnings.includes(warning), "the Sprint");
  const backlog = await openBacklog({ types: ok(JSON.stringify(types)) });
  assert.ok(backlog.st().warnings.includes(warning), "the Backlog");
});

test("UI: the picker shows ten rows at a time and follows the marked one; a click on a row past the first ten assigns that one", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "a");
  const many = json("github-assignable.json");
  const extra = Array.from({ length: 10 }, (_, i) => ({ id: `U_more${i}`, login: `more-${i}`, name: `Zed ${i}` }));
  many.data.repository.assignableUsers.nodes.push(...extra);
  many.data.repository.assignableUsers.totalCount = 13;
  await host.answer("gh", ok(JSON.stringify(many)), isAssignableCall);
  const ids = () => byId(b.render(), "assign-rows").kids.map((k) => k.with?.id?.[0]).filter((id) => id?.startsWith("assign-row-"));
  assert.deepEqual(ids(), Array.from({ length: 10 }, (_, i) => `assign-row-${i}`));
  for (let i = 0; i < 12; i++) await press(b, cx, "down");
  assert.equal(b.modal.at, 12);
  assert.deepEqual(ids(), Array.from({ length: 10 }, (_, i) => `assign-row-${i + 3}`), "the window follows the mark");
  assert.deepEqual(texts(byId(b.render(), "assign-row-12")), ["Zed 8", "more-8"]);
  await click(b, cx, "assign-row-11");
  assert.deepEqual(host.open("gh").filter((c) => isAssignCall(c.args))[0].args.slice(-2), ["-f", "assignees[]=U_more7"]);
});

test("UI: a card names all its assignees, by name", async () => {
  const data = json("github-board.json");
  data.data.repositoryOwner.projectV2.items.nodes.find((n) => n.id === "PVTI_rec4").content.assignees.nodes = [{ login: "robin-example", name: "Robin Example" }, { login: "kim-sample", name: null }];
  const { b } = await openBoard({ answer: JSON.stringify(data) });
  assert.ok(texts(byId(b.render(), "card-PVTI_rec4")).includes("Robin Example, kim-sample"));
});

test("UI: after a filter the picker marks the first row it leaves but niemand, niemand only where it is all that is left", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "a");
  const people = json("github-assignable.json");
  people.data.repository.assignableUsers.nodes.push({ id: "U_nina", login: "nina-ex", name: "Nina Example" });
  people.data.repository.assignableUsers.totalCount = 4;
  await host.answer("gh", ok(JSON.stringify(people)), isAssignableCall);
  assert.equal(b.modal.at, 0, "Ich");
  b.modal.input.type("ni");
  assert.deepEqual(pickerRows(b).map((r) => r[0]), ["niemand", "Nina Example"]);
  assert.equal(b.modal.at, 1, "Nina, not niemand");
  b.modal.input.type("niemand");
  assert.deepEqual([pickerRows(b).map((r) => r[0]), b.modal.at], [["niemand"], 0], "niemand alone is marked");
  b.modal.input.type("nobody here");
  assert.deepEqual([pickerRows(b), b.modal.at], [[], -1]);
});

test("UI: a GitHub answer that names no viewer offers no Ich and marks no row; Enter sends nothing", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "a");
  const people = json("github-assignable.json");
  people.data.viewer = null;
  await host.answer("gh", ok(JSON.stringify(people)), isAssignableCall);
  assert.equal(pickerRows(b)[0][0], "niemand");
  assert.equal(b.modal.at, -1);
  await submitPicker(b, cx);
  assert.deepEqual([b.modal?.kind, host.open("gh").filter((c) => isAssignCall(c.args)).length], ["assign", 0]);
  b.modal.input.type("rob");
  assert.equal(b.modal.at, -1, "nor after a filter");
});

test("UI: a Sprint that uses the work item types the Backlog read keeps them as the Backlog does, not until its sprint ends", async () => {
  const { b, cx, host } = await openBacklog();
  await press(b, cx, "v");
  await answerSettings(host);
  await answerRefresh(host, { me: false });
  advance(board.TEAM_KEEP_MS + 60000);
  await refreshSprint(b, cx);
  assert.equal(openCounts(host, ["types"])[0], 1, "read again after the Backlog's time");
});

test("UI: an unclear assignment whose item is gone after the refresh says it is not in the Sprint, as a warning", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "card-AB#311");
  await press(b, cx, "a");
  await host.answer("az", ok(fixture("azure-team-members.json")), AZA.members);
  await press(b, cx, "down");
  await submitPicker(b, cx);
  await host.answer("az", ok("{}"), AZA.assign);
  const items = JSON.stringify(json("azure-sprint-items.json").filter((w) => w.id !== 311));
  await answerRefresh(host, { me: false, items, places: taskboardAnswer({}, [311]) });
  assert.deepEqual([b.notice.text, b.notice.level], ["AB#311 ist nach dem Neuladen nicht im Sprint", "warning"]);
  assert.equal(host.notes.at(-1).level, "warning");
});

// ---- Tab in the board's dialogs ----

// The board's root's handler for a bound action (BOARD_KEYS), as herdr
// calls it: with a cx whose stop_propagation is counted. Returns how often
// it stopped the key.
function boardAction(b, action) {
  const root = b.render();
  const handler = root.calls.find((c) => c[0] === "on_action" && c[1] === action)?.[2];
  assert.ok(handler, `no on_action ${action}`);
  const cx = fakeCx();
  cx.call((own) => handler({}, own));
  return cx.stopped;
}

// Whether the board's root carries the board's key context and its Tab
// actions: a binding in that context matches only then.
function takesTab(b) {
  const root = b.render();
  const context = root.with.key_context?.[0] ?? null;
  const actions = root.calls.filter((c) => c[0] === "on_action").map((c) => c[1]);
  assert.equal(context === board.BOARD_KEY_CONTEXT, actions.length > 0, "the context and the actions come together");
  if (context) assert.deepEqual(actions, ["board_tab", "board_shift_tab"]);
  return Boolean(context);
}

test("the board binds Tab and shift-Tab in its own key context, which its root carries only while a dialog with fields is open or, with no filter typed, an issue's details", async () => {
  const { b, cx } = await openBoard();
  assert.deepEqual(cx.bound, board.BOARD_KEYS.map(({ keystroke, action }) => ({ keystroke, action, context: board.BOARD_KEY_CONTEXT })), "bound in that context only");
  assert.deepEqual(board.BOARD_KEYS.map((k) => [k.keystroke, k.back]), [["tab", false], ["shift-tab", true]]);
  assert.equal(takesTab(b), false, "nothing open: no context, no Tab action, herdr's own Tab runs");
  await openStart(b, cx);
  assert.equal(takesTab(b), true);
  await press(b, cx, "escape");
  assert.equal(takesTab(b), true, "the dialog closed, the issue's details are open: Tab is the details panel's");
  b.filtering = true;
  assert.equal(takesTab(b), false, "while the filter is typed, Tab is herdr's");
  b.filtering = false;
  await press(b, cx, "escape");
  assert.equal(takesTab(b), false, "the details closed too");
  await press(b, cx, "enter");
  assert.equal(takesTab(b), true);
  await press(b, cx, "s");
  assert.deepEqual([b.modal?.kind, takesTab(b)], ["status", false], "the status menu over the issue's details: a menu without fields leaves Tab to herdr");
});

test("UI: Tab and shift-Tab move between the start dialog's fields, also while its message has the keyboard", async () => {
  const { b, cx } = await openBoard();
  await openStart(b, cx);
  const m = b.modal;
  assert.deepEqual([m.kind, m.field, m.inputFocused, takesTab(b)], ["start", "message", true, true], "the root's context is on the message's path");
  assert.equal(boardAction(b, "board_tab"), 1, "taken");
  assert.deepEqual([m.field, m.inputFocused, b.handle.is_focused()], ["agent", false, true], "the board has the keyboard for the choice");
  assert.equal(takesTab(b), true, "and on the root's own, where the board's handle has the keyboard");
  boardAction(b, "board_tab");
  boardAction(b, "board_tab");
  assert.equal(m.field, "open");
  boardAction(b, "board_tab");
  assert.deepEqual([m.field, m.inputFocused], ["message", true], "round to the message, which takes the keyboard");
  boardAction(b, "board_shift_tab");
  assert.equal(m.field, "open", "shift-Tab goes back");
});

test("UI: Tab and shift-Tab move between the create dialog's title and type", async () => {
  const { b, cx } = await openBacklog();
  await press(b, cx, "n");
  const m = b.modal;
  assert.equal(boardAction(b, "board_tab"), 1);
  assert.deepEqual([m.field, m.inputFocused], ["type", false]);
  boardAction(b, "board_shift_tab");
  assert.deepEqual([m.field, m.inputFocused], ["title", true]);
  await press(b, cx, "escape");
  await press(b, cx, "s");
  assert.equal(b.modal.kind, "status");
  assert.equal(takesTab(b), false, "a menu without fields leaves Tab to herdr");
  assert.doesNotThrow(() => cx.call((own) => b.tabKey(false, own)), "tabKey there does nothing");
  assert.equal(b.modal.kind, "status");
});

test("UI: a bind_keys that fails is said in a toast, and the board works on", async () => {
  const { b, host } = await bootBoard({ bindKeys: () => {
    throw new Error("keymap locked");
  } });
  assert.deepEqual(host.notes.at(-1), { title: "Board: Tab und shift-Tab nicht gebunden", body: "keymap locked", level: "error" });
  assert.ok(b.render());
  const { host: short } = await bootBoard({ bindKeys: () => 1 });
  assert.deepEqual(short.notes.at(-1), { title: "Board: Tab und shift-Tab nicht alle gebunden", body: "1 von 2 Bindungen angelegt", level: "error" });
});

test("the fake cx keeps herdr's rule: a handler's cx is stale once it returns; init's, a spawn's and a timer's stay valid", async () => {
  const cx = fakeCx();
  let kept = null;
  let spawned = null;
  cx.call((own) => {
    kept = own;
    own.spawn(async (later) => {
      await null;
      spawned = later;
    });
  });
  await settle();
  assert.throws(() => kept.notify(), (e) => e.message === STALE_CX);
  assert.throws(() => kept.spawn(async () => {}), (e) => e.message === STALE_CX);
  assert.doesNotThrow(() => spawned.notify(), "a spawn's cx after an await");
  let timed = null;
  cx.timer.after(0, (own) => (timed = own));
  await cx.fire();
  assert.doesNotThrow(() => timed.stop_propagation(), "a timer's cx after it ran");
  assert.doesNotThrow(() => cx.notify(), "init's");
});

test("UI: a write whose follow-up throws after it landed says it landed and what failed; nothing is undone, the lock is gone", async () => {
  const { b, cx, host, st, view } = await openBacklog();
  let undone = false;
  const w = (texts) => ({
    key: "AB#301", label: "AB#301", apply() {}, write: async () => {}, undo: () => (undone = true), open: { kind: "state" },
    landed(cx) {
      cx.notify();
      throw new board.BoardError("Folgeschritt fehlgeschlagen");
    },
    texts: { pending: () => "…", landed: () => "AB#301 gespeichert", unclear: "AB#301", refused: () => "abgelehnt", ...texts },
  });
  cx.call((own) => board.writeAtOnce(b, view, w({}), own));
  await settle();
  assert.deepEqual([b.notice.text, b.notice.level, undone, st().pending], ["AB#301 gespeichert; danach: Folgeschritt fehlgeschlagen", "warning", false, {}]);
  assert.deepEqual(host.notes.at(-1), { title: "Status von AB#301", body: "AB#301 gespeichert; danach: Folgeschritt fehlgeschlagen", level: "warning" });
  cx.call((own) => board.writeAtOnce(b, view, w({ landedBut: (why) => `gespeichert, aber ${why}` }), own));
  await settle();
  assert.equal(b.notice.text, "gespeichert, aber Folgeschritt fehlgeschlagen");
});

test("UI: a team default iteration that follows the current one keeps the Backlog's settings only until that iteration ends", async () => {
  const settings = json("azure-backlog-settings.json");
  settings.defaultIterationMacro = "@currentIteration";
  // Azure's finishDate is the last day's start: this one ends in an hour.
  settings.defaultIteration.attributes = { finishDate: new Date(Date.now() - DAY + 3600000).toISOString() };
  const { b, cx, host } = await openBacklog({ settings: JSON.stringify(settings) });
  advance(30 * 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [0, 0, 0, 0], "before it ends: kept");
  await answerBacklog(host, { me: false });
  advance(60 * 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1], "it ended: read again, long before four hours");
});

test("UI: a team whose default iteration follows the current one has it read again when a work item is created, and the create takes that one", async () => {
  const settings = json("azure-backlog-settings.json");
  settings.defaultIterationMacro = "@currentIteration";
  assert.equal(settings.defaultIteration.attributes, null, "Azure's answer names no end for it");
  const { b, cx, host, view } = await openBacklog({ settings: JSON.stringify(settings) });
  await press(b, cx, "n");
  b.modal.input.set_value("Sample new story");
  await click(b, cx, "create-go");
  assert.deepEqual([openAzb(host, "settings").length, openAzb(host, "create").length], [1, 0], "the settings first");
  const later = json("azure-backlog-settings.json");
  later.defaultIterationMacro = "@currentIteration";
  later.defaultIteration.path = "Example Project\\Sprint 13";
  await host.answer("az", ok(JSON.stringify(later)), AZB.settings);
  assert.deepEqual(openAzb(host, "create")[0].args,
    board.azCreateArgs(view.context, { type: "User Story", title: "Sample new story", area: "Example Project\\Core", iteration: "Example Project\\Sprint 13" }));
  await host.answer("az", ok(fixture("azure-backlog-created.json")), AZB.create);
  await answerBacklog(host, { me: false });
  await press(b, cx, "n");
  b.modal.input.set_value("Another");
  await click(b, cx, "create-go");
  await host.answer("az", ok(JSON.stringify({ ...later, defaultIteration: null })), AZB.settings);
  assert.equal(openAzb(host, "create").length, 0);
  assert.equal(b.notice.text, "User Story „Another“ nicht angelegt: Das Team nennt gerade keine Standard-Iteration (Team-Einstellungen in Azure)");
});

// ---- An issue's related items: description, sub-issues and linked pull requests ----

const issueItem = () => githubBoard().columns.flatMap((c) => c.cards).find((c) => c.number === 3004);
// The detail panel as the board draws it now, and the texts of its related
// items' block.
const detailPanel = (b) => byId(b.render(), "detail");
const relatedTexts = (b) => texts(byId(detailPanel(b), "related-lines"));
// Those texts from the sub-issues' head on, and those before it (the
// description's).
const sectionTexts = (b) => {
  const all = relatedTexts(b);
  return all.slice(all.findIndex((t) => t.startsWith("UNTERAUFGABEN")));
};
// The description's TextView as the board draws it now, or null.
const textViewOf = (b) => chainTo(byId(detailPanel(b), "related-lines"), (el) => el.kind === "textview")?.at(-1) ?? null;
const descriptionTexts = (b) => {
  const all = relatedTexts(b);
  return all.slice(0, all.findIndex((t) => t.startsWith("UNTERAUFGABEN")));
};
// The related items' lines as drawn, each as its texts: key, title, draft
// mark, state.
const drawnLines = (b) =>
  byId(detailPanel(b), "related-lines").kids.filter((k) => /^related-line-/.test(k.with.id?.[0] ?? "")).map((k) => texts(k));
const answerRelated = (host, result) => host.answer("gh", result, isRelatedCall);
// r, and the view's answer: the open related items are read after it.
async function reloadBoard(b, cx, host) {
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
}
// An answer for the related items: `n` sub-issues of `count` (more to page
// through: `more`), pull requests as `prs` (nodes) of `prCount`.
function relatedAnswer({ n = 0, count = n, more = false, prs = [], prCount = prs.length } = {}) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    number: 4000 + i, title: `step ${i}`, state: "OPEN", url: `https://github.com/example/tender/issues/${4000 + i}`, repository: { nameWithOwner: "example/tender" },
  }));
  const issue = {
    subIssues: { totalCount: count, pageInfo: { hasNextPage: more }, nodes },
    closedByPullRequestsReferences: { totalCount: prCount, pageInfo: { hasNextPage: false }, nodes: prs },
  };
  return JSON.stringify({ data: { repository: { issue } } });
}
const prNode = (number, state = "OPEN") => ({ number, title: `pr ${number}`, state, isDraft: false, url: `https://github.com/example/tender/pull/${number}`, repository: { nameWithOwner: "example/tender" } });
// A Board whose first card's (tender#3004) details are open, its related
// items read from github-related.json.
async function openRelated() {
  const opened = await openBoard();
  await press(opened.b, opened.cx, "enter");
  await answerRelated(opened.host, ok(fixture("github-related.json")));
  return opened;
}
// Tab or shift-Tab as on_key_down gets it, and as the root's bound action.
const tab = (b, cx, shift = false) => press(b, cx, "tab", { modifiers: { shift } });
async function action(b, cx, name) {
  const handler = b.render().calls.find(([p, a]) => p === "on_action" && a === name)?.[2];
  assert.ok(handler, `no action ${name}`);
  cx.call((own) => handler({}, own));
  await settle();
}
const readsOf = (host, number) => host.open("gh").filter((c) => isRelatedCall(c.args) && (number === undefined || c.args.includes(`number=${number}`)));
// The details block laid out as herdr would report it: each row `rowH`
// high (or as `heights` says by its id), the content as tall as they are
// with its padding and gaps, the window `windowH` high (or as
// `windowH(content)` says; on_size_change on each, with a cx of its own);
// its content's height.
function layOut(b, cx, windowH, { rowH = 18, heights = {} } = {}) {
  const panel = detailPanel(b);
  const content = byId(panel, "related-lines");
  const size = (el, height) => cx.call((own) => el.with.on_size_change[0]({ width: 400, height }, own));
  let total = 24;
  content.kids.forEach((k, i) => {
    const h = heights[k.with.id[0]] ?? rowH;
    size(k, h);
    total += h + (i ? 6 : 0);
  });
  size(content, total);
  size(byId(panel, "related-window"), typeof windowH === "function" ? windowH(total) : windowH);
  return total;
}
// The block's offset, and the shift its content is drawn with: a relative
// top, no margin (layOutIn says why).
const offsetOf = (b) => {
  const content = byId(detailPanel(b), "related-lines");
  assert.deepEqual([content.with.top?.[0], content.styles.includes("relative")], [-b.relatedUi.offset || 0, true], "drawn as kept");
  assert.deepEqual([content.with.mt, content.with.mb], [undefined, undefined], "no margin");
  return b.relatedUi.offset;
};
// One frame of layOut with the window as tall as herdr's layout (taffy)
// makes it, in a space `space` high, from what the board draws now: the
// window takes its height from its content, at most the space; a flex item
// gives its container its height plus its margins, and a relative top only
// moves it (vendor/taffy/src/compute/flexbox.rs, hypothetical_outer_size
// and main_relative_inset). The content's height.
function layOutIn(b, cx, space, opts) {
  const content = byId(detailPanel(b), "related-lines");
  const margin = (name) => content.with[name]?.[0] ?? 0;
  return layOut(b, cx, (total) => Math.max(0, Math.min(space, total + margin("mt") + margin("mb"))), opts);
}

test("an issue's related items are one GraphQL query: its first 50 sub-issues and its first 20 linked pull requests, merged and closed ones too, each with whether there are more", () => {
  const args = board.githubRelatedArgs(issueItem());
  assert.deepEqual(args.slice(0, 3), ["api", "graphql", "-f"]);
  assert.deepEqual(args.slice(4), ["-f", "owner=example", "-f", "name=tender", "-F", "number=3004"]);
  const query = args[3].replace(/\s+/g, " ");
  assert.match(query, /repository\(owner: \$owner, name: \$name\) \{ issue\(number: \$number\) \{/);
  assert.match(query, /subIssues\(first: 50\) \{ totalCount pageInfo \{ hasNextPage \} nodes \{ number title state url repository \{ nameWithOwner \} \} \}/);
  assert.match(query, /closedByPullRequestsReferences\(first: 20, includeClosedPrs: true\) \{ totalCount pageInfo \{ hasNextPage \} nodes \{ number title state isDraft url repository \{ nameWithOwner \} \} \}/);
  assert.doesNotMatch(query, /subIssuesSummary/, "how many are done is the item's own (its sub)");
  assert.match(query, /issue\(number: \$number\) \{ body subIssues\(/, "the description read in the same query");
});

test("an issue's related items: lines with key, state label, color, done and draft; counts, the cut by GitHub's page, nodes without access", () => {
  const d = board.parseGithubRelated(json("github-related.json"), issueItem());
  assert.deepEqual(d.subIssues.lines.map((l) => [board.itemLabel(l), l.kind, l.state, l.color, l.done, l.draft]), [
    ["tender#3001", "issue", "offen", "ansi2", false, false], ["tender#3010", "issue", "geschlossen", "muted", true, false], ["other-tool#12", "issue", "offen", "ansi2", false, false],
  ]);
  assert.equal(d.subIssues.lines[2].url, "https://github.com/example/other-tool/issues/12");
  assert.deepEqual(d.prs.lines.map((l) => [board.itemLabel(l), l.kind, l.state, l.color, l.done, l.draft, l.repo]), [
    ["tender#3020", "pr", "offen", "ansi2", false, true, "example/tender"], ["tender#3015", "pr", "gemerged", "ansi5", true, false, "example/tender"],
  ]);
  assert.deepEqual([d.subIssues, d.prs].map(({ count, sent, cut, hidden, error }) => [count, sent, cut, hidden, error]), [[3, 3, false, 0, null], [2, 2, false, 0, null]]);
  assert.deepEqual(d.warnings, []);
  const page = board.parseGithubRelated(JSON.parse(relatedAnswer({ n: 50, count: 60, more: true })), issueItem());
  assert.deepEqual([page.subIssues.count, page.subIssues.sent, page.subIssues.cut], [60, 50, true]);
  const odd = board.parseGithubRelated(JSON.parse(relatedAnswer({ n: 1, count: 3 })), issueItem());
  assert.equal(odd.subIssues.cut, false, "a count beyond what was sent is no cut where GitHub says there is no next page");
  const strange = board.parseGithubRelated(JSON.parse(relatedAnswer({ prs: [prNode(1, "LOCKED")] })), issueItem());
  assert.deepEqual([strange.prs.lines[0].state, strange.prs.lines[0].color, strange.prs.lines[0].done], ["locked", "muted", false], "a state it does not know");
});

test("an issue's related items: a missing issue throws why; a section GitHub did not send carries its error; a null node counts as without access; other errors are warnings", () => {
  const missing = json("github-related-not-found.json");
  assert.throws(() => board.parseGithubRelated(missing, issueItem(), missing.errors), /^Error: GitHub: Could not resolve to an Issue with the number of 3004\.$/);
  assert.throws(() => board.parseGithubRelated({ data: { repository: null } }, issueItem()), /^Error: GitHub kennt example\/tender#3004 nicht$/);
  const answer = JSON.parse(relatedAnswer({ n: 1, count: 2 }));
  answer.data.repository.issue.subIssues.nodes.push(null);
  answer.data.repository.issue.closedByPullRequestsReferences = null;
  const errors = [
    { type: "FORBIDDEN", path: ["repository", "issue", "subIssues", "nodes", 1], message: "Resource not accessible by integration\nmore" },
    { type: "FORBIDDEN", path: ["repository", "issue", "closedByPullRequestsReferences"], message: "Pull requests are hidden\nmore" },
    { message: "Something else went wrong\nmore" },
  ];
  const d = board.parseGithubRelated(answer, issueItem(), errors);
  assert.deepEqual([d.subIssues.lines.length, d.subIssues.sent, d.subIssues.hidden, d.subIssues.error], [1, 2, 1, null]);
  assert.deepEqual([d.prs.count, d.prs.lines, d.prs.error], [null, [], "GitHub: Pull requests are hidden"]);
  assert.deepEqual(d.warnings, ["Resource not accessible by integration", "Something else went wrong"], "only an error a section shows is its own");
  const nodeless = JSON.parse(relatedAnswer({ n: 1, count: 4 }));
  nodeless.data.repository.issue.subIssues.nodes = null;
  const atNodes = [{ type: "FORBIDDEN", path: ["repository", "issue", "subIssues", "nodes"], message: "Sub-issues are hidden\nmore" }];
  const nodes = board.parseGithubRelated(nodeless, issueItem(), atNodes);
  assert.deepEqual([nodes.subIssues.count, nodes.subIssues.lines, nodes.subIssues.error, nodes.warnings], [4, [], "GitHub: Sub-issues are hidden", []], "nodes not sent: the error at their path");
  assert.equal(board.parseGithubRelated(nodeless, issueItem(), []).subIssues.error, "GitHub schickte sie nicht");
  const silent = board.parseGithubRelated(answer, issueItem(), []);
  assert.equal(silent.prs.error, "GitHub schickte sie nicht");
});

test("GitHub has related items to read for an issue with a number and a repo only", () => {
  const { reads } = board.makeGithub(null).related;
  const issue = issueItem();
  assert.deepEqual(
    [reads(issue), reads({ ...issue, kind: "pr" }), reads({ ...issue, kind: "draft" }), reads({ ...issue, number: null }), reads({ ...issue, repo: "" })],
    [true, false, false, false, false],
  );
});

test("the related lines: sub-issues first; a step from none goes to the first, up from the first to none, the last stays; a refresh keeps the open item's read unless it failed; the heads", () => {
  const d = board.parseGithubRelated(json("github-related.json"), issueItem());
  assert.deepEqual(board.relatedLines(d).map((l) => l.number), [3001, 3010, 12, 3020, 3015]);
  assert.deepEqual(board.relatedLines(null), []);
  assert.deepEqual(
    [board.stepLine(null, 1, 3), board.stepLine(0, -1, 3), board.stepLine(2, 1, 3), board.stepLine(1, 1, 3), board.stepLine(1, -1, 3), board.stepLine(null, -1, 3), board.stepLine(null, 1, 0)],
    [0, null, 2, 2, 0, null, null],
  );
  const kept = new Map([["a", { data: 1, error: null }], ["b", { data: null, error: "x" }], ["c", { data: null, error: null }]]);
  assert.deepEqual([...board.keptRelated(kept, "a")], [["a", { data: 1, error: null }]]);
  assert.deepEqual([...board.keptRelated(kept, "c")], [["c", { data: null, error: null }]], "one still being read: kept, so no second read starts");
  assert.deepEqual([[...board.keptRelated(kept, "b")], [...board.keptRelated(kept, null)], [...board.keptRelated(kept, "z")]], [[], [], []],
    "a failed read, none open, one not kept: nothing");
  const item = { sub: { done: 7, total: 11 } };
  assert.deepEqual(
    [board.subIssuesHead(item, { cut: false }), board.subIssuesHead({ sub: null }, { cut: false }), board.subIssuesHead(item, { cut: true, sent: 50, count: 60 })],
    ["UNTERAUFGABEN · 7/11", "UNTERAUFGABEN", "UNTERAUFGABEN · 7/11 · erste 50 von 60"],
  );
  assert.deepEqual([board.prsHead({ count: 2, cut: false }), board.prsHead({ count: null, cut: false }), board.prsHead({ count: 25, cut: true, sent: 20 })],
    ["VERKNÜPFTE PRS · 2", "VERKNÜPFTE PRS", "VERKNÜPFTE PRS · 25 · erste 20 von 25"]);
});

test("an item is found on the board in its shown columns only: the same source, kind, repo and number", () => {
  const d = board.parseGithubRelated(json("github-related.json"), issueItem());
  const columns = board.shownColumns(githubBoard(), "", false);
  const col = columns.findIndex((c) => c.shown.some((i) => i.number === 3001));
  assert.ok(col > 0);
  const line = d.subIssues.lines[0];
  assert.deepEqual(board.placeOf(columns, line), { col, key: "PVTI_rec2" });
  assert.equal(board.placeOf(columns, d.subIssues.lines[1]), null, "not on the board");
  assert.equal(board.placeOf(columns, { ...line, repo: "example/other-tool" }), null, "the same number in another repo");
  assert.equal(board.placeOf(columns, { ...line, kind: "pr" }), null, "a pull request of the same number");
  assert.equal(board.placeOf(columns, { ...line, source: "azure" }), null, "another source");
  assert.equal(board.placeOf(board.shownColumns(githubBoard(), "BUG input", false), line), null, "one the filter hides");
});

test("UI: an issue's related items are read once when its details open, „lädt …“ until they come, drawn under the item's own count", async () => {
  const { b, cx, host } = await openBoard();
  await cx.look();
  assert.equal(host.open("gh").length, 0, "nothing before the details open");
  // Enter as the board's root gets it.
  cx.call((own) => b.render().with.on_key_down[0](key("enter"), own));
  await settle();
  const calls = host.open("gh");
  assert.equal(calls.length, 1);
  assert.ok(isRelatedCall(calls[0].args) && calls[0].args.includes("number=3004") && calls[0].args.includes("name=tender"));
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "lädt …"], "the head's count is the card's");
  await cx.look();
  assert.equal(host.open("gh").length, 1, "one read while it loads");
  advance(3 * 60000);
  for (const fn of cx.every.filter((f) => f.ms !== board.WATCH_MS)) fn(cx);
  await settle();
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.equal(readsOf(host, 3004).length, 1, "a refresh while it loads starts no second read");
  await answerRelated(host, ok(fixture("github-related.json")));
  assert.deepEqual(texts(detailPanel(b)).filter((s) => /^(UNTERAUFGABEN|VERKNÜPFTE)/.test(s)), ["UNTERAUFGABEN · 11/11", "VERKNÜPFTE PRS · 2"]);
  assert.deepEqual(drawnLines(b), [
    ["tender#3001", "fix(cache): keep the last entry when a refresh fails", "offen"],
    ["tender#3010", "chore(ci): drop the old runner", "geschlossen"],
    ["other-tool#12", "feat: read the sample list", "offen"],
    ["tender#3020", "feat(api): page through long lists", "Entwurf", "offen"],
    ["tender#3015", "refactor(api): split the list reader", "gemerged"],
  ]);
  const opacity = (i) => byId(detailPanel(b), `related-line-${i}`).with.opacity[0];
  assert.deepEqual([0, 1, 2, 3, 4].map(opacity), [1, 0.55, 1, 1, 0.55], "closed and merged ones dimmed");
  host.theme = () => ({ ansi2: "#green", ansi5: "#purple", muted: "#grey" });
  const chipColor = (i) => byId(detailPanel(b), `related-line-${i}`).kids.at(-1).with.bg[0];
  assert.deepEqual([0, 1, 4].map(chipColor), ["#green", "#grey", "#purple"], "each state's chip in its color");
  assert.ok(pathTo(detailPanel(b), "SITZUNG"), "the rest of the details stays");
  await press(b, cx, "escape");
  await press(b, cx, "enter");
  await cx.look();
  assert.equal(host.open("gh").length, 0, "open again: kept, nothing read");
  assert.equal(drawnLines(b).length, 5);
});

test("UI: related items are read where the shown item changes: a click, the keys, a drop; the timer reads those that came to show another way, not while the board is hidden", async () => {
  const { b, cx, host, st } = await openBoard();
  await clickCard(b, cx, "PVTI_rec4");
  await clickCard(b, cx, "PVTI_rec4");
  assert.equal(readsOf(host, 3004).length, 1, "a click that opens them");
  await press(b, cx, "j");
  assert.equal(readsOf(host, 3005).length, 1, "the keys");
  await mouse(b, cx, "card-PVTI_rec1", "on_mouse_down");
  await mouse(b, cx, "col-0", "on_mouse_up");
  assert.equal(st().sel.key, "PVTI_rec1");
  assert.equal(readsOf(host, 3000).length, 1, "a drop");
  st().sel = { col: 0, key: "PVTI_rec6" };
  host.panes = () => [];
  await cx.look();
  assert.equal(readsOf(host, 3007).length, 0, "not while the board is hidden");
  host.panes = () => [{ pane: "p1", mod: "board", tab: "t1" }];
  await cx.look();
  assert.equal(readsOf(host, 3007).length, 1, "the next look of a shown board");
});

test("UI: details opened while a refresh of the view runs read their related items once it ended, also where it failed", async () => {
  const { b, cx, host } = await openBoard();
  cx.call((own) => b.refresh(b.view(), own));
  await settle();
  await press(b, cx, "enter");
  await cx.look();
  assert.equal(readsOf(host).length, 0, "not while the refresh runs");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.equal(readsOf(host, 3004).length, 1, "once it ended");
  await press(b, cx, "escape");
  await press(b, cx, "j");
  cx.call((own) => b.refresh(b.view(), own));
  await settle();
  await press(b, cx, "enter");
  await host.answer("gh", { code: 1, stdout: "", stderr: "gh: HTTP 502: Bad Gateway\n" }, isBoardCall);
  assert.equal(readsOf(host, 3005).length, 1, "after a failed refresh too");
});

test("UI: a refresh keeps the open related items and reads nothing for them; another item's are read again after it; r reads the open ones again", async () => {
  const { b, cx, host, st } = await openRelated();
  await press(b, cx, "j");
  assert.equal(st().sel.key, "PVTI_rec5");
  await answerRelated(host, ok(relatedAnswer({ n: 1 })));
  await press(b, cx, "k");
  await press(b, cx, "j");
  await press(b, cx, "k");
  assert.equal(host.open("gh").length, 0, "both kept");
  advance(3 * 60000);
  await cx.tick();
  assert.equal(host.open("gh").filter((c) => isBoardCall(c.args)).length, 1, "the timer refreshes the view");
  assert.equal(readsOf(host).length, 0, "but reads no related items");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.equal(readsOf(host).length, 0, "nor after it");
  assert.equal(drawnLines(b).length, 5, "the open ones stay");
  await press(b, cx, "j");
  assert.equal(readsOf(host, 3005).length, 1, "the other one is read again");
  await answerRelated(host, ok(relatedAnswer({ n: 1 })));
  await press(b, cx, "r");
  assert.deepEqual(host.open("gh").map((c) => (isRelatedCall(c.args) ? "related" : isBoardCall(c.args) ? "board" : "?")), ["board"], "r: the view first");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.equal(readsOf(host).length, 1, "then the open related items, once it is read");
  assert.equal(sectionTexts(b).at(-1), "lädt …");
  await answerRelated(host, ok(relatedAnswer({ n: 2 })));
  assert.equal(drawnLines(b).length, 2);
});

test("UI: related items that fail to read say the first line of gh's reason, the rest stays; the next refresh tries again; an older read that answers last changes nothing", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "enter");
  await answerRelated(host, { code: 1, stdout: "", stderr: "gh: GraphQL: Something broke\nat line 2\n" });
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "GraphQL: Something broke"], "the first line only");
  assert.ok(pathTo(detailPanel(b), "SITZUNG") && pathTo(detailPanel(b), "feat(api): page through long lists"), "the rest of the details");
  advance(3 * 60000);
  // The refresh timer alone, without the look that reads what it missed.
  for (const fn of cx.every.filter((f) => f.ms !== board.WATCH_MS)) fn(cx);
  await settle();
  assert.equal(readsOf(host, 3004).length, 0, "not while the refresh runs");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.equal(readsOf(host, 3004).length, 1, "the next refresh reads them again");
  await answerRelated(host, { code: 1, stdout: fixture("github-related-not-found.json"), stderr: "gh: Could not resolve to an Issue with the number of 3004.\n" });
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "GitHub: Could not resolve to an Issue with the number of 3004."]);
  await reloadBoard(b, cx, host);
  await reloadBoard(b, cx, host);
  const [older, newer] = readsOf(host);
  assert.ok(older && newer, "each r reads them again");
  newer.done = true;
  newer.resolve(ok(relatedAnswer({ n: 1 })));
  await settle();
  older.done = true;
  older.resolve(ok(fixture("github-related.json")));
  await settle();
  assert.deepEqual(drawnLines(b).map((l) => l[0]), ["tender#4000"], "the newest read's answer");
});

test("UI: more than GitHub sends: the first it sent of how many there are; none: it says so; no linked pull requests: no such section; theirs cut too", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "enter");
  await answerRelated(host, ok(relatedAnswer({ n: 50, count: 60, more: true })));
  assert.equal(sectionTexts(b)[0], "UNTERAUFGABEN · 11/11 · erste 50 von 60");
  assert.equal(drawnLines(b).length, 50);
  assert.ok(!sectionTexts(b).some((s) => s.startsWith("VERKNÜPFTE")));
  await reloadBoard(b, cx, host);
  await answerRelated(host, ok(relatedAnswer()));
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "keine"]);
  await reloadBoard(b, cx, host);
  const many = JSON.parse(relatedAnswer({ prs: [prNode(1), prNode(2)], prCount: 25 }));
  many.data.repository.issue.closedByPullRequestsReferences.pageInfo.hasNextPage = true;
  await answerRelated(host, ok(JSON.stringify(many)));
  assert.equal(sectionTexts(b).find((s) => s.startsWith("VERKNÜPFTE")), "VERKNÜPFTE PRS · 25 · erste 2 von 25");
});

test("UI: a node GitHub sent as null is counted as without access; a section it did not send says why in its place; other errors follow at the end", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "enter");
  const answer = JSON.parse(relatedAnswer({ n: 1, count: 2 }));
  answer.data.repository.issue.subIssues.nodes.push(null);
  answer.data.repository.issue.closedByPullRequestsReferences = null;
  answer.errors = [
    { type: "FORBIDDEN", path: ["repository", "issue", "subIssues", "nodes", 1], message: "Resource not accessible by integration" },
    { type: "FORBIDDEN", path: ["repository", "issue", "closedByPullRequestsReferences"], message: "Pull requests are hidden" },
    { message: "Something else went wrong" },
  ];
  await answerRelated(host, { code: 1, stdout: JSON.stringify(answer), stderr: "gh: Resource not accessible by integration\n" });
  host.theme = () => ({ ansi1: "#red", ansi3: "#yellow", muted: "#grey" });
  assert.deepEqual(sectionTexts(b), [
    "UNTERAUFGABEN · 11/11", "tender#4000", "step 0", "offen", "1 ohne Zugriff",
    "VERKNÜPFTE PRS", "GitHub: Pull requests are hidden",
    "Resource not accessible by integration", "Something else went wrong",
  ]);
  const tone = (text) => chainTo(byId(detailPanel(b), "related-lines"), (el) => el.kids?.[0] === text)?.at(-1)?.with.text_color[0];
  assert.deepEqual([tone("GitHub: Pull requests are hidden"), tone("Something else went wrong"), tone("1 ohne Zugriff")], ["#red", "#yellow", "#grey"], "an error red, a warning yellow");
  await reloadBoard(b, cx, host);
  const hidden = JSON.parse(relatedAnswer({ count: 1 }));
  hidden.data.repository.issue.subIssues.nodes = [null];
  await answerRelated(host, ok(JSON.stringify(hidden)));
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "1 ohne Zugriff"], "not „keine“");
  await reloadBoard(b, cx, host);
  const unsent = JSON.parse(relatedAnswer());
  unsent.data.repository.issue.subIssues = null;
  unsent.errors = [{ type: "FORBIDDEN", path: ["repository", "issue", "subIssues"], message: "Sub-issues are hidden" }];
  await answerRelated(host, { code: 1, stdout: JSON.stringify(unsent), stderr: "gh: Sub-issues are hidden\n" });
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "GitHub: Sub-issues are hidden"], "the error in their place, not „keine“");
  await reloadBoard(b, cx, host);
  const nodeless = JSON.parse(relatedAnswer());
  nodeless.data.repository.issue.subIssues = { totalCount: 3, pageInfo: { hasNextPage: false }, nodes: null };
  nodeless.errors = [{ type: "FORBIDDEN", path: ["repository", "issue", "subIssues", "nodes"], message: "Sub-issues are hidden" }];
  await answerRelated(host, { code: 1, stdout: JSON.stringify(nodeless), stderr: "gh: Sub-issues are hidden\n" });
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "GitHub: Sub-issues are hidden"], "nodes not sent: the same");
  await reloadBoard(b, cx, host);
  const prsHidden = JSON.parse(relatedAnswer({ prCount: 1 }));
  prsHidden.data.repository.issue.closedByPullRequestsReferences.nodes = [null];
  await answerRelated(host, ok(JSON.stringify(prsHidden)));
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN · 11/11", "keine", "VERKNÜPFTE PRS · 1", "1 ohne Zugriff"], "linked pull requests sent only as null");
});

test("UI: a pull request's row, a pull request's card and a draft read no related items and have no such section", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  await press(b, cx, "enter");
  await cx.look();
  assert.equal(b.views.prs.detail, true);
  assert.equal(host.open("gh").length, 0);
  assert.equal(byId(detailPanel(b), "related-lines"), null);
  assert.ok(!hintKeys(b).includes("Tab"), "no hint for Tab");
  assert.equal(takesTab(b), false, "Tab is herdr's");
  await press(b, cx, "1");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board-cases.json")), isBoardCall);
  for (const key of ["PVTI_case1", "PVTI_case2"]) {
    const col = board.columnOf(b.navColumns(b.view()), key);
    assert.ok(col >= 0, key);
    cx.call((own) => b.choose(b.view(), { col, key }, own));
    b.views.mine.detail = true;
    await cx.look();
    assert.equal(host.open("gh").length, 0, key);
    assert.equal(byId(detailPanel(b), "related-lines"), null, key);
  }
});

test("UI: Tab moves the keyboard into the details panel and back; there j/k walk its lines, Esc gives it back, and a second Esc closes the details", async () => {
  const { b, cx, st, host } = await openRelated();
  host.theme = () => ({ accent: "#accent", border: "#border" });
  const hint = (name) => hintKeys(b).includes(name);
  const hintOf = (name) => {
    const line = b.render().kids.at(-1);
    return line.kids.map((h) => texts(h)).filter((t) => t[0] === name).map((t) => t[1]);
  };
  assert.deepEqual([hintOf("Tab"), hint("j/k"), hintOf("Esc")], [["Details"], false, ["schließen"]], "the hint names Tab");
  assert.equal(detailPanel(b).with.border_color[0], "#border");
  assert.equal(takesTab(b), true, "the root takes Tab");
  const stopped = cx.stopped;
  await action(b, cx, "board_tab");
  assert.ok(b.panelOf(b.view()), "the panel has the keyboard");
  assert.equal(cx.stopped, stopped + 1, "the action stops the key");
  assert.equal(detailPanel(b).with.border_color[0], "#accent", "and shows it");
  assert.deepEqual([hintOf("Tab"), hint("j/k"), hintOf("Esc")], [["Board"], true, ["zurück"]], "Tab names where it goes");
  const marked = () => [0, 1, 2, 3, 4].filter((i) => byId(detailPanel(b), `related-line-${i}`).styles.includes("bg"));
  assert.deepEqual(marked(), [], "no line yet");
  // Nine rows of 18 pixels: the first line's ends at 102, the second's at 126.
  layOut(b, cx, 120);
  await press(b, cx, "j");
  await press(b, cx, "down");
  assert.deepEqual([b.panel.line, marked(), st().sel.key], [1, [1], "PVTI_rec4"], "the lines move, the board's selection stays");
  assert.equal(offsetOf(b), 6, "scrolled to the second sub-issue's line, below the description's two rows");
  for (let i = 0; i < 6; i++) await press(b, cx, "j");
  assert.equal(b.panel.line, 4, "the last stays");
  assert.equal(offsetOf(b), 102, "scrolled to the last pull request's line, at the block's bottom");
  await press(b, cx, "k", { modifiers: { control: true } });
  await press(b, cx, "k", { char: "K", modifiers: { shift: true } });
  assert.equal(b.panel.line, 4, "with Control or Shift a key is not the panel's");
  for (let i = 0; i < 5; i++) await press(b, cx, i % 2 ? "up" : "k");
  assert.equal(b.panel.line, null, "k above the first: no line");
  await action(b, cx, "board_shift_tab");
  assert.equal(b.panelOf(b.view()), null, "shift-Tab gives it back");
  await press(b, cx, "j");
  assert.equal(st().sel.key, "PVTI_rec5", "j is the board's again");
  await press(b, cx, "k");
  let before = cx.stopped;
  await tab(b, cx);
  assert.deepEqual([Boolean(b.panelOf(b.view())), cx.stopped], [true, before + 1], "Tab from on_key_down too, stopped there");
  await tab(b, cx, true);
  assert.equal(b.panelOf(b.view()), null, "and shift-Tab");
  await tab(b, cx);
  await press(b, cx, "escape");
  assert.deepEqual([b.panelOf(b.view()), st().detail], [null, true], "Esc gives the keyboard back");
  await press(b, cx, "escape");
  assert.equal(st().detail, false, "a second closes the details");
  before = cx.stopped;
  await tab(b, cx);
  assert.deepEqual([b.panelOf(b.view()), cx.stopped], [null, before], "without details Tab does nothing, and on_key_down lets it go on");
  assert.equal(takesTab(b), false, "nor does the root take it: herdr's own Tab runs");
});

test("UI: with no line selected j scrolls the block a line until the first line shows whole, then selects it; k from none scrolls up", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "enter");
  await answerRelated(host, ok(relatedAnswer({ prs: [prNode(3020)] })));
  await tab(b, cx);
  // The description's head, „keine Beschreibung“, the sub-issues' head,
  // „keine“, the pull requests' head, the line: it ends at 150.
  assert.equal(layOut(b, cx, 100), 162);
  await press(b, cx, "j");
  assert.deepEqual([b.panel.line, offsetOf(b)], [null, 18], "a line down");
  await press(b, cx, "j");
  await press(b, cx, "j");
  assert.deepEqual([b.panel.line, offsetOf(b)], [null, 54], "until the line shows whole");
  await press(b, cx, "j");
  assert.deepEqual([b.panel.line, offsetOf(b)], [0, 54], "then it is selected, nothing moves");
  await press(b, cx, "j");
  assert.deepEqual([b.panel.line, offsetOf(b)], [0, 54], "the last line stays");
  await press(b, cx, "k");
  await press(b, cx, "k");
  assert.deepEqual([b.panel.line, offsetOf(b)], [null, 36], "k: to no line, then a line up");
  for (let i = 0; i < 4; i++) await press(b, cx, "up");
  assert.equal(offsetOf(b), 0, "not above the top");
  // A description row of 100 pixels moves the line down to end at 232.
  layOut(b, cx, 100, { heights: { "related-row-1": 100 } });
  for (let i = 0; i < 4; i++) await press(b, cx, "j");
  assert.deepEqual([b.panel.line, offsetOf(b)], [null, 72], "the line does not show yet: measured rows count");
});

test("UI: the details panel has the keyboard only for the item and view it took it in, with the details open", async () => {
  const { b, cx, st, host } = await openRelated();
  await tab(b, cx);
  await press(b, cx, "l");
  assert.deepEqual([st().sel.col, b.panelOf(b.view())], [1, null], "l moves the board; the panel is not the new card's");
  const there = st().sel.key;
  await press(b, cx, "j");
  assert.deepEqual([b.panel, st().sel.key !== there], [null, true], "dropped: j is the board's");
  await press(b, cx, "h");
  await press(b, cx, "k");
  await press(b, cx, "k");
  assert.equal(st().sel.key, "PVTI_rec4");
  assert.equal(b.panelOf(b.view()), null, "back on its item, the board keeps the keyboard");
  await tab(b, cx);
  assert.ok(b.panelOf(b.view()));
  st().detail = false;
  assert.equal(b.panelOf(b.view()), null, "details closed by the board");
  st().detail = true;
  await tab(b, cx);
  // The view "other" shows the same project items under the same keys.
  await press(b, cx, "3");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  const other = b.views.other;
  assert.equal(other.sel.key, "PVTI_rec4");
  other.detail = true;
  assert.equal(b.panelOf(b.view()), null, "another view's details");
});

test("UI: in the details panel o opens a line; „Zeile auf dem Board“ selects its item on the board, and says so where the board does not show it; with no line Enter and o do what they do on the board", async () => {
  const { b, cx, st, host } = await openRelated();
  await tab(b, cx);
  await press(b, cx, "o");
  assert.deepEqual(cx.opened, [issueItem().url], "o with no line opens the issue");
  await press(b, cx, "j");
  await press(b, cx, "j");
  await press(b, cx, "o");
  assert.equal(cx.opened.at(-1), "https://github.com/example/tender/issues/3010");
  await runCommand(b, cx, "Zeile auf dem Board");
  assert.deepEqual([cx.opened.length, st().sel.key, b.notice?.text], [2, "PVTI_rec4", "tender#3010 ist nicht auf dem Board"], "not on the board: said, nothing opened");
  await press(b, cx, "k");
  await runCommand(b, cx, "Zeile auf dem Board");
  assert.deepEqual([st().sel.key, st().detail, st().picked], ["PVTI_rec2", true, "PVTI_rec2"], "on the board: selected, its details shown");
  assert.deepEqual([b.panelOf(b.view())?.line, b.panelOf(b.view())?.key], [null, "PVTI_rec2"], "the panel keeps the keyboard, no line");
  assert.equal(readsOf(host, 3001).length, 1, "its related items are read");
  await answerRelated(host, ok(relatedAnswer()));
  assert.equal(b.modal, null);
  await press(b, cx, "enter");
  assert.equal(b.modal?.kind, "start", "Enter with no line: the item's session, as on the board");
});

test("UI: „Zeile auf dem Board“ on a pull request's line whose card is on the board selects it and gives the keyboard back: a pull request has no related items", async () => {
  const { b, cx, st, host } = await openBoard({ answer: fixture("github-board-cases.json") });
  const issue = "PVTI_case4";
  cx.call((own) => b.choose(b.view(), { col: board.columnOf(b.navColumns(b.view()), issue), key: issue }, own));
  await press(b, cx, "enter");
  assert.equal(readsOf(host, 3060).length, 1);
  await answerRelated(host, ok(relatedAnswer({ prs: [{ ...prNode(3050), repository: { nameWithOwner: "example/tender" } }] })));
  await tab(b, cx);
  await press(b, cx, "j");
  await runCommand(b, cx, "Zeile auf dem Board");
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_case1", true], "the pull request's card, its details shown");
  assert.deepEqual([b.panel, takesTab(b)], [null, false], "the board has the keyboard, Tab is herdr's");
  b.panel = { view: b.view().id, key: "PVTI_case1", line: null };
  assert.equal(b.panelOf(b.view()), null, "a panel on an item without related items is dropped");
});

test("UI: a click on a line moves the keyboard into the panel and does Enter on it: its item's details a level down", async () => {
  const { b, cx, st, host } = await openRelated();
  b.handle.held = false;
  await click(b, cx, "related-line-1");
  const panel = () => b.panelOf(b.view());
  assert.deepEqual([panel()?.levels.map((l) => l.item.number), panel()?.line, cx.opened], [[3010], null, undefined]);
  assert.equal(b.handle.is_focused(), true, "the board takes the keyboard");
  assert.equal(readsOf(host, 3010).length, 1, "its related items are read");
  await answerRelated(host, ok(relatedAnswer({ n: 2 })));
  await click(b, cx, "related-line-1");
  assert.deepEqual([st().sel.key, panel()?.key, panel()?.levels.map((l) => l.item.number), panel()?.line], ["PVTI_rec4", "PVTI_rec4", [3010, 4001], null],
    "a line of that level: one more down, the board's selection where it was");
  await answerRelated(host, ok(relatedAnswer({ n: 1 })));
  b.modal = { kind: "status", view: b.view(), key: "PVTI_rec4", targets: [], at: 0 };
  await click(b, cx, "related-line-0");
  assert.deepEqual([panel()?.levels.length, host.open("gh").length], [2, 0], "a click while a dialog is open does nothing");
});

test("UI: Enter and o on a line that r took away until the related items come again do nothing", async () => {
  const { b, cx, host } = await openRelated();
  await tab(b, cx);
  await press(b, cx, "j");
  await reloadBoard(b, cx, host);
  await press(b, cx, "enter");
  await press(b, cx, "o");
  assert.deepEqual([b.modal, cx.opened, b.panelOf(b.view())?.line], [null, undefined, 0]);
  await answerRelated(host, ok(fixture("github-related.json")));
  await press(b, cx, "o");
  assert.deepEqual(cx.opened, ["https://github.com/example/tender/issues/3001"], "back once they came");
});

// ---- Going down into a related item in the details panel ----

// The details panel's levels: each level's item number, and its line.
const levelsNow = (b) => [b.panelOf(b.view())?.levels.map((l) => l.item.number) ?? null, b.panelOf(b.view())?.line ?? null];
const topText = (b) => texts(byId(detailPanel(b), "detail-top"))[0];
const readRelatedOf = (number) => (a) => isRelatedCall(a) && a.includes(`number=${number}`);

test("the details panel's levels: a line's item is named by its source, kind, repo and number; the path names the board's item, then each level, by number in its repo and on Azure", () => {
  const root = issueItem();
  const sub = { source: "github", kind: "issue", repo: "example/tender", repoShort: "tender", number: 2217 };
  const other = { ...sub, repo: "example/other-tool", repoShort: "other-tool", number: 12 };
  const pr = { ...sub, kind: "pr", number: 3020 };
  const samePr = { ...sub, kind: "pr" };
  assert.deepEqual([board.lineKey(sub), board.lineKey(pr), board.lineKey({ source: "azure", kind: "workitem", number: 311 })],
    ["github:issue:example/tender#2217", "github:pr:example/tender#3020", "azure:workitem:#311"]);
  assert.equal(board.pathLabel(root, []), "tender#3004");
  assert.equal(board.pathLabel(root, [sub, other, pr]), "tender#3004 › #2217 › other-tool#12 › #3020");
  const story = { source: "azure", kind: "workitem", number: 301 };
  assert.equal(board.pathLabel(story, [{ ...story, number: 311 }, { source: "azure", kind: "pr", number: 57 }]), "301 › 311 › !57", "Azure: work items by their numbers");
  assert.deepEqual([board.sameItem(sub, { ...sub }), board.sameItem(sub, samePr), board.sameItem(sub, other), board.sameItem(sub, { ...sub, number: 3 }), board.sameItem(sub, { ...sub, source: "azure" })],
    [true, false, false, false, false]);
});

test("a refresh keeps the related items of the details' item and of each level the panel went down to, unless their read failed", () => {
  const kept = new Map([["a", { data: 1, error: null }], ["b", { data: 2, error: null }], ["c", { data: null, error: "x" }], ["d", { data: { retry: true }, error: null }], ["e", { data: 5, error: null }]]);
  assert.deepEqual([...board.keptRelated(kept, "a", ["b", "c", "d"]).keys()], ["a", "b"]);
  assert.deepEqual([...board.keptRelated(kept, null, ["b"]).keys()], [], "no details open: nothing");
});

test("UI: Enter on a sub-issue's line shows its details in the panel, a level down: its path, title and state, its own related items read once; the board's selection stays", async () => {
  const { b, cx, st, host } = await openRelated();
  host.theme = () => ({ muted: "#grey" });
  await tab(b, cx);
  await press(b, cx, "j");
  await press(b, cx, "j");
  assert.deepEqual(levelsNow(b), [[], 1]);
  await press(b, cx, "enter");
  assert.deepEqual(levelsNow(b), [[3010], null], "a level down, no line there yet");
  assert.deepEqual([st().sel.key, st().detail, cx.opened], ["PVTI_rec4", true, undefined], "the board's selection stays, nothing opened");
  assert.equal(readsOf(host, 3010).length, 1, "its related items: one read, by repo and number");
  assert.ok(readsOf(host, 3010)[0].args.includes("owner=example") && readsOf(host, 3010)[0].args.includes("name=tender"));
  assert.deepEqual([topText(b), texts(detailPanel(b)).includes("Esc zurück")], ["tender#3004 › #3010", true], "the path at the top; Esc goes back");
  assert.ok(texts(detailPanel(b)).includes("chore(ci): drop the old runner"), "its title");
  const state = chipOf(detailPanel(b), "geschlossen");
  assert.ok(state, "its state as a chip");
  assert.equal(state.with.bg[0], "#grey", "in its line's color");
  assert.equal(texts(detailPanel(b)).includes("Status s"), false, "no status button: the board's item's");
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN", "lädt …"]);
  const answer = JSON.parse(relatedAnswer({ n: 2 }));
  answer.data.repository.issue.body = "Drop the **old** runner.";
  await answerRelated(host, ok(JSON.stringify(answer)));
  assert.deepEqual(drawnLines(b).map((l) => l[0]), ["tender#4000", "tender#4001"], "its own sub-issues");
  assert.equal(textViewOf(b).source, "Drop the **old** runner.", "its description");
  assert.equal(textViewOf(b).viewId, "description-github:issue:example/tender#3010");
  await press(b, cx, "j");
  assert.deepEqual(levelsNow(b), [[3010], 0], "j walks its lines");
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.deepEqual([host.open("gh").length, levelsNow(b)], [0, [[3010], 0]], "a refresh keeps its read and the level");
  const level = "github:issue:example/tender#3010";
  cx.call((own) => byId(detailPanel(b), `description-size-${level}`).with.on_size_change[0]({ width: 400, height: 500 }, own));
  await press(b, cx, "z");
  assert.equal(b.relatedUi.unfolded, level, "z unfolds the level's description");
  await press(b, cx, "escape");
  assert.equal(b.relatedUi.unfolded, null, "back up: the description above as it was, folded");
});

test("UI: two levels down and back with Esc: each level its line again, marked and scrolled as it was; at the top Esc gives the keyboard back, a second closes the details", async () => {
  const { b, cx, st, host } = await openRelated();
  await tab(b, cx);
  layOut(b, cx, 120);
  await press(b, cx, "j");
  await press(b, cx, "j");
  assert.equal(offsetOf(b), 6);
  const ctrl = { modifiers: { control: true } };
  await press(b, cx, "d", ctrl);
  const rootOffset = offsetOf(b);
  assert.equal(rootOffset, 66, "scrolled on, its line still in view");
  await press(b, cx, "enter");
  assert.equal(offsetOf(b), 0, "a level down starts at its top");
  await answerRelated(host, ok(relatedAnswer({ n: 6 })));
  layOut(b, cx, 120);
  for (let i = 0; i < 5; i++) await press(b, cx, "j");
  assert.deepEqual([levelsNow(b), offsetOf(b)], [[[3010], 4], 78]);
  await press(b, cx, "u", ctrl);
  assert.equal(offsetOf(b), 18, "scrolled back, its line out of view");
  await press(b, cx, "enter");
  assert.equal(topText(b), "tender#3004 › #3010 › #4004");
  await answerRelated(host, ok(relatedAnswer({ n: 1 })));
  layOut(b, cx, 400, { rowH: 40 });
  await press(b, cx, "escape");
  assert.deepEqual([levelsNow(b), offsetOf(b), topText(b)], [[[3010], 4], 78, "tender#3004 › #3010"], "one up: its line, scrolled into view by the heights measured there");
  const marked = () => [0, 1, 2, 3, 4, 5].filter((i) => byId(detailPanel(b), `related-line-${i}`)?.styles.includes("bg"));
  assert.deepEqual(marked(), [4], "marked again");
  await press(b, cx, "escape");
  assert.deepEqual([levelsNow(b), offsetOf(b), topText(b), marked()], [[[], 1], rootOffset, "tender#3004", [1]], "the top: the line it went down from, its scroll as it was");
  assert.equal(host.open("gh").length, 0, "nothing read again: each level's read is kept");
  await press(b, cx, "escape");
  assert.deepEqual([b.panelOf(b.view()), st().detail], [null, true], "at the top Esc gives the keyboard back");
  await press(b, cx, "escape");
  assert.equal(st().detail, false, "a second closes the details");
});

test("UI: on a level o opens the marked line, and with none the level's item; Enter with none starts that item's session, not the board's; s, a and H/L are not taken there; Tab back to the board closes the levels", async () => {
  const { b, cx, st, host } = await onLevel();
  await press(b, cx, "o");
  assert.deepEqual(cx.opened, ["https://github.com/example/tender/issues/3010"], "no line: the level's item");
  await press(b, cx, "j");
  await press(b, cx, "o");
  assert.equal(cx.opened.at(-1), "https://github.com/example/tender/issues/4000", "the marked line");
  await press(b, cx, "k");
  const before = cx.stopped;
  for (const k of ["s", "a"]) await press(b, cx, k);
  await press(b, cx, "l", shiftL);
  assert.deepEqual([b.modal, cx.stopped, board.findCard(st().data, "PVTI_rec4").column.name], [null, before, "Ready"], "the board's item's keys do nothing here");
  assert.deepEqual(hintKeys(b).filter((k) => ["s", "a", "H/L"].includes(k)), [], "nor does the hint line name them");
  await press(b, cx, "enter");
  assert.deepEqual([b.modal?.kind, board.itemLabel(b.modal.item), b.modal.item.title], ["start", "tender#3010", "chore(ci): drop the old runner"], "the level's item's session");
  await press(b, cx, "escape");
  await click(b, cx, "act-start");
  assert.deepEqual([b.modal?.kind, board.itemLabel(b.modal.item)], ["start", "tender#3010"], "and so does the panel's button");
  await press(b, cx, "escape");
  await tab(b, cx);
  assert.deepEqual([b.panelOf(b.view()), topText(b)], [null, "tender#3004"], "Tab: the board's keyboard, the board item's details again");
  await tab(b, cx);
  assert.deepEqual(levelsNow(b), [[], null], "and back in the panel at the top");
  assert.equal(host.open("gh").length, 0);
});

test("UI: on a level „Zeile auf dem Board“ selects the line's item from the menu and from the panel's button, and closes the levels; one the board does not show is said", async () => {
  const { b, cx, st, host } = await onLevel();
  await press(b, cx, "j");
  assert.equal(byId(detailPanel(b), "act-line-board") !== null, true, "a button while a line is marked");
  await runCommand(b, cx, "Zeile auf dem Board");
  assert.deepEqual([b.notice?.text, st().sel.key, levelsNow(b)], ["tender#4000 ist nicht auf dem Board", "PVTI_rec4", [[3010], 0]]);
  const sub = JSON.parse(relatedAnswer({ n: 1 }));
  sub.data.repository.issue.subIssues.nodes[0].number = 3001;
  // The level's read again, its first line now tender#3001, on the board.
  st().related.delete(b.panelOf(b.view()).levels[0].item.key);
  cx.call((own) => b.readRelated(own));
  await settle();
  await answerRelated(host, ok(JSON.stringify(sub)));
  await click(b, cx, "act-line-board");
  assert.deepEqual([st().sel.key, st().detail, levelsNow(b)], ["PVTI_rec2", true, [[], null]], "selected on the board, its details at the top");
  await press(b, cx, "k");
  assert.equal(byId(detailPanel(b), "act-line-board"), null, "no line: no button");
});

test("UI: an Azure child's details a level down: its path by numbers, its state in the view's color, its own children read; Esc back to its line", async () => {
  const { b, cx, host, st } = await openSprint();
  host.theme = () => ({ muted: "#grey", ansi2: "#green" });
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  await tab(b, cx);
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual([st().sel.key, levelsNow(b), topText(b)], ["AB#301", [[312], null], "301 › 312"]);
  assert.equal(chipOf(detailPanel(b), "Done").with.bg[0], "#green", "its state in the view's color for it");
  assert.deepEqual(azureRelatedOf(host).map((c) => c.args[c.args.indexOf("--id") + 1]), ["312"], "its related items: read by its id");
  const child = { rel: "System.LinkTypes.Hierarchy-Forward", url: "https://dev.azure.com/example-org/p/_apis/wit/workItems/311" };
  await host.answer("az", ok(JSON.stringify({ id: 312, fields: { "System.Description": "<p>kept</p>" }, relations: [child] })), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  assert.deepEqual(drawnLines(b), [["AB#311", "Parse the sample file", "To Do"]]);
  await press(b, cx, "escape");
  assert.deepEqual([levelsNow(b), topText(b)], [[[], 0], "AB#301"], "back: its line marked");
});

test("UI: r reads each level's related items again; a level whose item is no longer among the lines above it goes, with a notice, the panel on the deepest level still there", async () => {
  const { b, cx, st, host } = await onLevel();
  await press(b, cx, "j");
  await press(b, cx, "enter");
  await answerRelated(host, ok(relatedAnswer()));
  assert.deepEqual(levelsNow(b)[0], [3010, 4000]);
  await press(b, cx, "r");
  assert.equal(readsOf(host).length, 0, "nothing while the board is read");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  assert.deepEqual([readsOf(host, 3004).length, readsOf(host, 3010).length, readsOf(host, 4000).length], [1, 1, 1], "each level read again");
  await host.answer("gh", ok(fixture("github-related.json")), readRelatedOf(3004));
  assert.deepEqual([levelsNow(b)[0], b.notice], [[3010, 4000], null], "still there: kept");
  await host.answer("gh", ok(relatedAnswer()), readRelatedOf(3010));
  assert.deepEqual(levelsNow(b), [[3010], null], "tender#4000 went: the level above, no line");
  assert.equal(b.notice?.text, "tender#4000 steht nicht mehr bei tender#3010: zurück zu tender#3010");
  assert.equal(topText(b), "tender#3004 › #3010");
  await host.answer("gh", ok(relatedAnswer()), readRelatedOf(4000));
  await reloadBoard(b, cx, host);
  const without = json("github-related.json");
  without.data.repository.issue.subIssues.nodes = without.data.repository.issue.subIssues.nodes.filter((n) => n.number !== 3010);
  await host.answer("gh", ok(JSON.stringify(without)), readRelatedOf(3004));
  assert.deepEqual([levelsNow(b), st().sel.key, b.notice?.text], [[[], null], "PVTI_rec4", "tender#3010 steht nicht mehr bei tender#3004: zurück zu tender#3004"]);
  const failed = await onLevel();
  await reloadBoard(failed.b, failed.cx, failed.host);
  await failed.host.answer("gh", new Error("offline"), readRelatedOf(3004));
  assert.deepEqual(levelsNow(failed.b)[0], [3010], "a read that failed takes no level away");
});

test("UI: the command menu runs a level's action only on that level: after a refresh took the level away it says so and opens nothing", async () => {
  const { b, cx, host } = await onLevel();
  await press(b, cx, "j");
  await openMenu(b, cx);
  assert.ok(menuHeads(b).includes("Detailfenster · tender#3010 chore(ci): drop the old runner"), "the level's item is the details' heading");
  b.modal.input.type("Zeile im Browser");
  b.reload(cx);
  await settle();
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  const without = json("github-related.json");
  without.data.repository.issue.subIssues.nodes = without.data.repository.issue.subIssues.nodes.filter((n) => n.number !== 3010);
  await host.answer("gh", ok(JSON.stringify(without)), readRelatedOf(3004));
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual([b.modal, b.notice?.text, cx.opened], [null, "Die Details von tender#3010 sind nicht mehr offen", undefined]);
});

test("UI: Enter on a pull request's line opens it in the browser: the panel goes down into issues and work items only", async () => {
  const { b, cx, host } = await openRelated();
  await tab(b, cx);
  for (let i = 0; i < 4; i++) await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual([levelsNow(b), cx.opened, host.open("gh").length], [[[], 3], ["https://github.com/example/tender/pull/3020"], 0]);
});

// Every tag name a shown HTML description holds, and the `<` in a shown
// Markdown one that could start HTML (none but its links' destinations).
const tagNames = (html) => [...html.matchAll(/<\/?([A-Za-z][A-Za-z0-9:-]*)/g)].map((m) => m[1].toLowerCase());
const KEPT_TAGS = new Set(["p", "br", "b", "strong", "i", "em", "u", "s", "del", "strike", "mark", "code", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr", "div", "span", "sub", "sup"]);
// The `<` in shown Markdown that could start HTML: all but those of an
// http(s) URL in <…> (an autolink or a destination).
const htmlStarts = (md) => [...md.matchAll(/<[A-Za-z/!?]/g)].filter((m) => !/^<https?:\/\//i.test(md.slice(m.index, m.index + 9)));
// Inputs that tried to get an image or raw HTML past the description's
// step, in both formats.
const HOSTILE = [
  '<pre>&lt;img src="https://attacker.example/x.png"&gt;</pre>',
  '<textarea>&lt;img src="https://attacker.example/x.png"&gt;</textarea>',
  '<script>&lt;img src="https://attacker.example/x.png"&gt;</script>',
  '<style>&lt;img src="https://attacker.example/x.png"&gt;</style>',
  '<svg><image href="https://attacker.example/x.png"/></svg>',
  '<pre>&#60;img src="https://attacker.example/x.png"&#62;</pre>', '<pre>&#x3c;img src=x&#x3E;</pre>', '<xmp><img src=x></xmp>',
  '<img src="https://attacker.example/a.png alt=x>after', "<img\nsrc=https://attacker.example/b.png>", "<img\u0001src=c>", "<IMG/SRC=https://attacker.example/d.png/>",
  "<iMaGe src=e>", "<<img src=h>>", "<math><mi><img src=x></mi></math>", "<!-- <img src=x> -->", "<iframe src=x></iframe>", "<!--> <img src=y>",
  "![a](https://attacker.example/u.png)", "![b][r]", "![c][]", "![d]", "[![e](https://attacker.example/v.png)](w)", "!![f](x)", "!![f2](https://attacker.example/f.png)", "`![g](y)`", "\\![i](q)", "\\\\![j](r)",
  "<https://attacker.example/l.png>", "[k](<https://attacker.example/k.png>)", "\\<https://a/![m](https://attacker.example/m.png)>",
  "a `<https://a/` ![n](https://attacker.example/n.png)>", "<https://a/\u0001![o](https://attacker.example/o.png)>",
].join("\n");
// A refused image's label ending in `!` before a link: once joined, a `![`.
const JOINS = [
  "![x!]()[a](https://attacker.example/x.png)", "![x!](javascript:1)[a](https://attacker.example/x.png)", "![x&#33;](rel.png)[a](https://attacker.example/x.png)",
  '<img alt="x!" src="nope">[a](https://attacker.example/x.png)', '<img alt="x&#33;">[a](https://attacker.example/x.png)', '<img alt="x\\!">[a](https://attacker.example/x.png)',
];

test("an HTML description keeps only plain formatting tags, written anew without attributes but an a's http(s) href; images become links; comments and other tags go, their text stays", () => {
  const html = (text) => board.shownDescription(text, "html");
  assert.equal(html("<div><h2>Goal</h2><p>Read the <b>sample</b> file.</p><ul><li>one</li></ul></div>"), "<div><h2>Goal</h2><p>Read the <b>sample</b> file.</p><ul><li>one</li></ul></div>");
  assert.equal(html('<p class="x" style="color: red" onclick="y()">t</p><BR/>'), "<p>t</p><br>", "attributes dropped, names in lower case");
  assert.equal(html('<a href="https://example.com/spec" target="_blank">spec</a> <a href="javascript:alert(1)">x</a>'), '<a href="https://example.com/spec">spec</a> <a>x</a>');
  assert.equal(html(`<a href='https://example.com/a?b="c"&d=<e'>x</a>`), '<a href="https://example.com/a?b=%22c%22&amp;d=%3Ce">x</a>', "a `\"`, `<` and `&` written safely into the href");
  assert.equal(html("<p><IMG SRC='https://example.com/c.png' ALT=cat></p>"), '<p><a href="https://example.com/c.png">Bild: cat</a></p>', "an image: a link to it");
  assert.equal(html('<img src="data:image/png;base64,AAAA" alt="dot"><img alt="no source"><image src="https://example.com/e.png">'), 'Bild: dotBild: no source<a href="https://example.com/e.png">Bild</a>',
    "no http(s) src: its text");
  assert.equal(html('<img src="https://example.com/1.png" SRC="https://example.com/2.png" alt="a &amp; b" alt=c>'), '<a href="https://example.com/1.png">Bild: a &amp; b</a>', "the first of an attribute, entities read");
  assert.equal(html("<img alt='say \"hi\"'>"), "Bild: say &quot;hi&quot;", "a `\"` written as an entity");
  assert.equal(html('<pre>&lt;img src="https://attacker.example/x.png"&gt;</pre>'), '<p><code>&lt;img src="https://attacker.example/x.png"&gt;</code></p>', "a pre as code, its text as written");
  assert.equal(html('<div><textarea>&lt;img src=x&gt;</textarea><script>a()</script><style>b{}</style></div>'), "<div>&lt;img src=x&gt;a()b{}</div>",
    "a raw-text element goes, its text stays in the one around it");
  assert.equal(html('<svg><image href="https://attacker.example/x.png"/></svg>'), "Bild");
  assert.equal(html('<font face="Calibri" color="red">x</font><o:p></o:p><small>s</small><dl><dt>d</dt></dl><input value="v"><col>'), "xsd",
    "tags off the list (Word's, Outlook's, a form's) go, their text stays");
  assert.equal(html('<b title="x>y">bold</b>a<!-- c <img src=x> -->b<!-->c<!---->d'), '<b>y">bold</b>abcd', "a tag ends at its first >; comments go");
  assert.equal(html("a <!-- not closed <b>"), "a &lt;!-- not closed <b>", "a comment not closed is text");
  assert.equal(html("<!DOCTYPE html><![CDATA[x]]>y -->z"), "&lt;!DOCTYPE html>&lt;![CDATA[x]]>y -->z", "no other <! is a comment");
  assert.equal(html(`<b ${"x".repeat(3000)}>t`), `&lt;b ${"x".repeat(3000)}>t`, "a tag longer than MAX_TAG is text");
  assert.equal(html("<b"), "&lt;b", "a tag left open");
  assert.equal(html("<p-x>t</p-x><img-x src=https://example.com/a.png>u<img\u0001src=c>"), "tu&lt;img\u0001src=c>", "a name that goes on past an allowed one is another tag");
  assert.equal(html('<img alt="&#65;&#x42; &lt;C&gt; &#0;" src="https://example.com/a.png">'), '<a href="https://example.com/a.png">Bild: AB &lt;C&gt; &amp;#0;</a>', "the alt's entities read, then written as text");
  assert.deepEqual([html(""), html("  \n "), html(null)], [null, null, null], "blank: none");
  const out = html(HOSTILE);
  assert.deepEqual([...new Set(tagNames(out))].filter((n) => !KEPT_TAGS.has(n)), [], "no other tag survives");
  assert.doesNotMatch(out, /<!--/, "no comment");
});

test("a Markdown description keeps no HTML but http(s) URLs in <…>; its images, inline and as <img>, become Markdown links to their http(s) URL; one by reference plain or a link; no image form survives", () => {
  const md = (text) => board.shownDescription(text, "markdown");
  assert.equal(md("Rolls it out.\r\n\r\n## Steps\n- one\n- **two** `code`"), "Rolls it out.\r\n\r\n## Steps\n- one\n- **two** `code`", "the rest as written");
  assert.equal(md('see ![the shot](https://example.com/a.png "title") here'), "see [Bild: the shot](<https://example.com/a.png>) here");
  assert.equal(md("![](<https://example.com/a b.png>)"), "[Bild](<https://example.com/a%20b.png>)", "no alt; a destination in <>");
  assert.equal(md("![x](javascript:alert(1)) ![y](data:image/png;base64,AA)"), "Bild: x Bild: y", "no http(s) URL: its text");
  assert.equal(md("![a [b] \\\\ ! <i>](https://example.com/x.png)"), "[Bild: a \\[b\\] \\\\ \\! <\u200bi>](<https://example.com/x.png>)", "the label's [ ] \\ ! escaped, its < no HTML");
  assert.equal(md("![logo][l] ![alt][] ![ref] ![][r]\n\n[l]: https://example.com/l.png"),
    "[Bild: logo][l] [Bild: alt][] [Bild: ref] [Bild][r]\n\n[l]: https://example.com/l.png", "by reference: a link where the reference is defined, else text");
  assert.equal(md("[![badge](https://example.com/b.svg)](https://example.com)"), "[[Bild: badge](<https://example.com/b.svg>)](https://example.com)", "inside a link's text");
  assert.equal(md("!![f](x) \\\\![g](y) !![h](https://example.com/h.png)"), "!Bild: f \\\\Bild: g !\u200b[Bild: h](<https://example.com/h.png>)", "a ! or a backslash before one makes no new image");
  for (const join of JOINS) {
    const out = md(join);
    assert.doesNotMatch(out, /!\[/, `${join} → ${out}`);
  }
  assert.equal(md(JOINS[0]), "Bild: x\\!\u200b[a](https://attacker.example/x.png)", "a refused image's `!` escaped, and no `![` left anyway");
  assert.equal(md('a <img width="300" alt="chart" src="https://example.com/b.png"> b'), "a [Bild: chart](<https://example.com/b.png>) b", "an <img>, as GitHub writes a pasted one");
  assert.equal(md("<b>x</b> <details> a<br>b <img src=x> <a href=https://example.com/>"), "<\u200bb>x<\u200b/b> <\u200bdetails> a<\u200bbr>b Bild <\u200ba href=https://example.com/>", "other HTML: text");
  assert.equal(md("<https://example.com/a\\b> <HTTP://example.com/up> [x](<https://example.com/a b>) [y](< https://example.com>)\n\n[r]: <https://example.com/r>"),
    "<https://example.com/a/b> <http://example.com/up> [x](<https://example.com/a%20b>) [y](<\u200b https://example.com>)\n\n[r]: <https://example.com/r>",
    "an http(s) URL in <…> stays, an autolink or a destination, as the URL parser writes it (a \\ as /); anything else in <…> is text");
  assert.equal(md(`<https://example.com/${"a".repeat(3000)}>`), `<https://example.com/${"a".repeat(3000)}>`, "however long");
  assert.equal(md("<!x --> y"), "<\u200b!x --> y", "no other <! is a comment");
  assert.equal(md("<https://a/![b](c)> <https://a/ ![b](https://e/x.png)>"), "<https://a/%21%5Bb%5D%28c%29> <https://a/%20%21%5Bb%5D%28https://e/x.png%29>",
    "its ! [ ] ( ) encoded outside its host, so no link, image or code span can start in the encoded parts however the span is read");
  assert.equal(md("<https://[::1]:8080/a(b)?q=[c]#!d> <https://u:p!@example.com/x>"), "<https://[::1]:8080/a%28b%29?q=%5Bc%5D#%21d> <https://u:p%21@example.com/x>",
    "an IPv6 host keeps its brackets; the user's part is encoded too");
  const tricky = "<https://evil.example\\@good.example/>";
  assert.equal(md(tricky), "<https://evil.example/@good.example/>", "a \\ read as the URL parser reads it, a /");
  assert.equal(new URL(md(tricky).slice(1, -1)).host, new URL(board.webUrl(tricky.slice(1, -1))).host, "the host the browser would go to");
  assert.equal(md("<https://en.wikipedia.org/wiki/A_(b)>"), "<https://en.wikipedia.org/wiki/A_%28b%29>");
  assert.equal(board.keptUrl("https://e/a(b)"), "https://e/a%28b%29");
  assert.deepEqual([board.keptUrl("javascript:alert(1)"), board.keptUrl("https://%zz")], [null, null], "no http(s) URL: none");
  assert.deepEqual(
    [board.keptUrl("https://:p@h.example/x"), board.keptUrl("https://:token@internal.example.com/"), board.keptUrl("https://:p!@[::1]:8080/a(b)"), board.keptUrl("https://u:p!@example.com/x")],
    ["https://:p@h.example/x", "https://:token@internal.example.com/", "https://:p%21@[::1]:8080/a%28b%29", "https://u:p%21@example.com/x"],
    "a password without a user, IPv6 with a password, a user and password",
  );
  const odd = [
    "https://:p@good.co/x", "https://u@h.example", "https://u:@h.example/", "https://@h.example/", "https://h.example:443/a", "HTTPS://H.Example/A?b#c",
    "https://[::1]/", "https://[2001:db8::1]:8443/x(y)", "https://xn--bcher-kva.example/", "https://bücher.example/(a)", "https://h.example/a\\b?c\\d#e\\f",
    "https://evil.example\\@good.example/", "https://a!b@h.example/![x](y)", "https://h.example/%5B%5D", "http://127.0.0.1:80/", "https://h.example/`code`",
  ];
  for (const url of odd) {
    const kept = board.keptUrl(url);
    assert.ok(kept, url);
    assert.equal(new URL(kept).host, new URL(board.webUrl(url)).host, url);
    const { protocol, host } = new URL(kept);
    const authority = kept.slice(protocol.length + 2).split("/")[0];
    const hostAt = authority.lastIndexOf("@") + 1;
    assert.equal(authority.slice(hostAt), host, `${url}: the host stands between the user part and the path`);
    const outside = authority.slice(0, hostAt) + kept.slice(protocol.length + 2 + authority.length);
    assert.doesNotMatch(outside, /[![\]()`\\]/, `${url}: nothing to encode left outside the host`);
  }
  assert.equal(md("\\<https://a/![b](https://e/x.png)>"), "\\<https://a/%21%5Bb%5D%28https://e/x.png%29>", "after a backslash, where it is no autolink");
  assert.equal(md("a `<https://a/` ![b](https://e/x.png)>"), "a `<https://a/%60%20%21%5Bb%5D%28https://e/x.png%29>", "across a code span, its backtick too");
  assert.equal(md("a <https://%zz> b"), "a <\u200bhttps://%zz> b", "one the URL parser takes for none: text");
  assert.equal(md("![a](https://e/x?a\\\\)"), "[Bild: a](<https://e/x?a%5C>)", "an image's URL with a \\ in its <…>: %5C");
  assert.equal(md("<mailto:a@example.com> <https://example.com/<b>"), "<\u200bmailto:a@example.com> <\u200bhttps://example.com/<\u200bb>", "another scheme, or a < inside: text");
  assert.equal(md("a <!-- hidden <img src=x> --> b <!--> c <!-- open"), "a  b  c <\u200b!-- open", "comments go; one not closed is text");
  assert.equal(md("<!-- Describe the change -->\n## Summary\n\nText"), "\n## Summary\n\nText", "a template's comment goes");
  assert.equal(md("<!--\nPlease describe the change.\n\nThanks!\n-->\n## Summary"), "\n## Summary", "one that starts a line is an HTML block: across blank lines");
  assert.deepEqual([md("   <!-- a\n\nb -->c"), md("    x\n\n<!-- a\n\nb -->c"), md("<!-- not closed\n\nx")], ["   c", "    x\n\nc", "<\u200b!-- not closed\n\nx"],
    "at most 3 spaces in, after code too; one not closed stays");
  assert.equal(md("para\n    <!-- a\n\nb --> c"), "para\n    <\u200b!-- a\n\nb --> c", "4 spaces in, where a paragraph goes on, is no block");
  assert.equal(md("`x`<!-- c -->y"), "`x`y", "one right after a code span goes too");
  assert.equal(md("Use `<!--` to start a comment.\n\nAnd so on --> prod"), "Use `<\u200b!--` to start a comment.\n\nAnd so on --> prod", "not one that starts in a code span");
  assert.equal(md("```html\n<!-- in a fence\n```\nafter --> prod"), "```html\n<\u200b!-- in a fence\n```\nafter --> prod", "nor in a fenced block");
  assert.equal(md("    <!-- indented\n\nlater --> x"), "    <\u200b!-- indented\n\nlater --> x", "nor in an indented one");
  assert.equal(md("a <!-- one\n\ntwo --> b"), "a <\u200b!-- one\n\ntwo --> b", "nor one across a blank line");
  assert.deepEqual([md("a <!-- one\n \t\ntwo --> b"), md("x\ny <!-- one\n\n--> z"), md("    <!-- a\n\nb --> c")],
    ["a <\u200b!-- one\n \t\ntwo --> b", "x\ny <\u200b!-- one\n\n--> z", "    <\u200b!-- a\n\nb --> c"],
    "a blank line of spaces, or one right after the comment's own line; 4 spaces in is code");
  assert.equal(md('<pre>&lt;img src="https://attacker.example/x.png"&gt;</pre>'), '<\u200bpre>&lt;img src="https://attacker.example/x.png"&gt;<\u200b/pre>');
  assert.equal(md("![x](https://example.com/" + "a".repeat(1100) + ")"), "[Bild: x](https://example.com/" + "a".repeat(1100) + ")", "an image longer than MAX_IMAGE: no image, a link as written");
  assert.equal(md(`![x](https://example.com/i.png "${"t".repeat(1100)}")`), `[Bild: x](https://example.com/i.png "${"t".repeat(1100)}")`, "its title past MAX_IMAGE: no image, a link as written");
  assert.equal(md("</img> <img>"), "<\u200b/img> Bild", "an <img> closed: text; one without src: its label");
  const link = "[Bild: a](<https://example.com/i.png>)";
  assert.deepEqual(
    ["![a](https://example.com/i.png)", "![a]x https://example.com/i.png)", "![a](<https://example.com/i.png\n)", '![a](https://example.com/i.png "t"x',
      "![a\n\nb](https://example.com/i.png)", `![${"[".repeat(33)}a${"]".repeat(33)}](https://example.com/i.png)`, `![a](https://example.com/${"(".repeat(33)}i${")".repeat(33)})`]
      .map((t) => md(t).includes("](<https://example.com/")),
    [true, false, false, false, false, false, false],
    "an inline image only as CommonMark reads one: ( right after ], a < destination closed, ) after the title, no blank line, brackets and parentheses nested at most 32 deep",
  );
  assert.equal(board.shownDescription("![a](https://example.com/i.png)", undefined), link, "Markdown by default");
  const out = md(HOSTILE);
  assert.deepEqual(htmlStarts(out).map((m) => out.slice(m.index, m.index + 8)), [], "no < that starts HTML");
  assert.doesNotMatch(out, /!\[/, "no `![` left");
});

test("Markdown's code, as the comment step reads it: fenced and indented blocks, code spans of matching runs within a paragraph", () => {
  const spans = (text) => board.codeRanges(text).map(([a, b]) => text.slice(a, b));
  assert.deepEqual(spans("a `b` c ``d` e`` f \\`g` h `i"), ["`b`", "``d` e``", "` h `"], "a run after a backslash opens nothing (the next one does); one left open is no span");
  assert.deepEqual([spans("a `b\n\nc` d"), spans("a `b\n \t\nc` d"), spans("a `b\r\n\r\nc` d")], [[], [], []], "not across a blank line, one of spaces or a CR too");
  assert.deepEqual(spans("```js\nx `\n````\n~~~\ny\n~~\n"), ["```js\nx `\n````", "~~~\ny\n~~\n"], "a fence to one as long or longer of its kind, else to the end");
  assert.deepEqual(spans("``` a`b\ncode?\n"), [], "a backtick fence with a backtick in its info is none");
  assert.deepEqual([spans("```\nx\n~~~\ny\n```\nz"), spans("````\nx\n```\ny\n````\nz")], [["```\nx\n~~~\ny\n```"], ["````\nx\n```\ny\n````"]],
    "not closed by the other kind, nor by a shorter fence");
  assert.deepEqual(spans("    one\n\n    two\npara\n    goes on\n"), ["    one", "    two"], "an indented line, but not where a paragraph goes on");
});

test("a hostile description's cost grows with its length, not faster: 64 KB takes at most about six times what 16 KB takes, in either format", () => {
  const hostile = (kb) => {
    const n = kb * 1024;
    const fill = (piece) => piece.repeat(Math.ceil(n / piece.length)).slice(0, n);
    return [fill("!["), fill("<a"), `${fill("<b ")}>`, fill("![a]("), fill("<img src="), fill("<b title='"), `${fill("[")}](x)`, fill("<"), fill("![a](b ("), fill("![a](<b"),
      fill("<!--"), fill("<https://x"), `${fill("<!--")}\n\n-->`];
  };
  // The fastest of three runs, in ms.
  const best = (body, format) => Math.min(...[0, 1, 2].map(() => {
    const start = performance.now();
    board.shownDescription(body, format);
    return performance.now() - start;
  }));
  const [small, large] = [hostile(16), hostile(64)];
  for (const [i, body] of large.entries()) {
    for (const format of ["markdown", "html"]) {
      const [t16, t64] = [best(small[i], format), best(body, format)];
      assert.ok(t64 < 6 * t16 + 5, `${body.slice(0, 10)}… as ${format}: ${t16.toFixed(1)} ms at 16 KB, ${t64.toFixed(1)} ms at 64 KB`);
    }
  }
});

test("UI: the details draw the description with TextView, Markdown for an issue's body as GitHub sends it, its images as links; „lädt …“ until it comes, the reason after a failure, „keine Beschreibung“ for none", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "enter");
  assert.deepEqual(descriptionTexts(b), ["BESCHREIBUNG", "lädt …"]);
  const body = "Rolls it out.\n\n![plan](https://example.com/plan.png)\n<img src=\"https://example.com/b.png\">";
  const answer = JSON.parse(fixture("github-related.json"));
  answer.data.repository.issue.body = body;
  await answerRelated(host, ok(JSON.stringify(answer)));
  assert.equal(readsOf(host).length, 0, "one call for all of it");
  assert.equal(board.parseGithubRelated(answer, issueItem()).description, body, "the issue's body, as GitHub sends it");
  const view = textViewOf(b);
  assert.deepEqual([view.format, view.viewId, view.source], ["markdown", "description-PVTI_rec4", board.shownDescription(body, "markdown")]);
  assert.doesNotMatch(view.source, /!\[|<img/i, "no image");
  assert.ok(relatedTexts(b).indexOf("BESCHREIBUNG") < relatedTexts(b).findIndex((t) => t.startsWith("UNTERAUFGABEN")), "above the sub-issues, in the same scrolled block");
  assert.equal(byId(detailPanel(b), "related-lines").kids.findIndex((k) => Boolean(chainTo(k, (el) => el.kind === "textview"))), 1, "one row, after the head");
  await reloadBoard(b, cx, host);
  await answerRelated(host, ok(relatedAnswer()));
  assert.deepEqual([descriptionTexts(b), textViewOf(b)], [["BESCHREIBUNG", "keine Beschreibung"], null]);
  await reloadBoard(b, cx, host);
  await answerRelated(host, { code: 1, stdout: "", stderr: "gh: GraphQL: Something broke\n" });
  assert.deepEqual(descriptionTexts(b), ["BESCHREIBUNG", "GraphQL: Something broke"]);
});

test("UI: a link in the description opens through the board, http and https only; anything else is said, not opened", async () => {
  const { b, cx } = await openRelated();
  const handler = textViewOf(b).with.on_link_click[0];
  cx.call((own) => handler("https://example.com/spec", own));
  cx.call((own) => handler("http://example.com/x", own));
  assert.deepEqual(cx.opened, ["https://example.com/spec", "http://example.com/x"]);
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "mailto:a@example.com", "https://", "not a url"]) {
    cx.call((own) => handler(url, own));
    assert.equal(b.notice?.text, `Link nicht geöffnet (nur http und https): ${url}`, url);
  }
  assert.equal(cx.opened.length, 2);
});

// The description's measured block, and its height reported as `height`.
const sizeDescription = (b, cx, height) => {
  const block = byId(detailPanel(b), `description-size-${b.selected(b.view()).key}`);
  cx.call((own) => block.with.on_size_change[0]({ width: 400, height }, own));
};
const foldBox = (b) => byId(detailPanel(b), "description");

test("UI: a description taller than 12 lines shows folded to their height with „… mehr (z)“; z or a click unfolds and folds it, on the board and in the panel; a short one has no fold and leaves z alone", async () => {
  const { b, cx, host, st } = await openRelated();
  assert.equal(board.FOLDED_H, 216);
  sizeDescription(b, cx, 216);
  assert.deepEqual([foldBox(b).styles.includes("max_h"), byId(detailPanel(b), "description-fold"), hintKeys(b).includes("z")], [false, null, false], "12 lines high: no fold");
  const stopped = cx.stopped;
  await press(b, cx, "z");
  assert.equal(cx.stopped, stopped, "z is not taken");
  sizeDescription(b, cx, 500);
  assert.deepEqual([foldBox(b).with.max_h[0], foldBox(b).styles.includes("overflow_hidden"), texts(byId(detailPanel(b), "description-fold"))], [216, true, ["… mehr (z)"]]);
  const hintOf = (name) => b.render().kids.at(-1).kids.map((h) => texts(h)).filter((t) => t[0] === name).map((t) => t[1]);
  assert.deepEqual(hintOf("z"), ["mehr"]);
  await press(b, cx, "z");
  assert.deepEqual([foldBox(b).styles.includes("max_h"), texts(byId(detailPanel(b), "description-fold")), hintOf("z")], [false, ["weniger (z)"], ["weniger"]], "unfolded");
  await tab(b, cx);
  assert.deepEqual(hintOf("z"), ["weniger"], "the panel's hint");
  await press(b, cx, "z");
  assert.equal(foldBox(b).with.max_h[0], 216, "folded again, from the panel");
  await click(b, cx, "description-fold");
  assert.equal(foldBox(b).styles.includes("max_h"), false, "a click unfolds");
  await press(b, cx, "z", { modifiers: { control: true } });
  assert.equal(foldBox(b).styles.includes("max_h"), false, "with Control z is not the fold's");
  await press(b, cx, "escape");
  await press(b, cx, "j");
  assert.equal(st().sel.key, "PVTI_rec5");
  await answerRelated(host, ok(fixture("github-related.json")));
  sizeDescription(b, cx, 500);
  assert.equal(foldBox(b).with.max_h[0], 216, "another item's shows folded");
});

// ---- An Azure work item's related items ----

const azureRelatedOf = (host) => host.open("az").filter((c) => c.args.includes("show") && c.args.includes("relations"));
const childrenQuery = (host) => host.open("az").filter((c) => AZ.query(c.args) && c.args.some((a) => String(a).includes("IN (")));

test("an Azure work item's related items: one az call for the item with its links, one WIQL query by id for its children; what the answers hold", () => {
  const c = sprintTeam();
  assert.deepEqual(board.azRelatedArgs(c, 301), ["boards", "work-item", "show", "--org", ORG, "--detect", "false", "--id", "301", "--expand", "relations", "-o", "json"]);
  assert.equal(board.idsWiql([312, 311]), `SELECT ${board.WORK_ITEM_FIELDS.map((f) => `[${f}]`).join(", ")} FROM WorkItems WHERE [System.Id] IN (312, 311) ORDER BY [System.Id]`,
    "the Backlog's query for the fields of work items by id");
  const read = board.parseRelatedItem(fixture("azure-related-item.json"));
  assert.match(read.description, /^<div><h2>Goal<\/h2>/);
  assert.deepEqual(read.children, [312, 311, 399], "the children, in the links' order; parent, related and branch links left out");
  assert.deepEqual(read.prs, [{ project: "0f3c6a1e-8b2d-4e7f-a915-3c2d1b0a9e88", repo: "6a1d0c3e-2f4b-4e8a-b7c9-1d2e3f4a5b6c", number: 57 }]);
  const bare = board.parseRelatedItem(JSON.stringify({ id: 5, fields: {}, relations: null }));
  assert.deepEqual(bare, { description: "", children: [], prs: [] }, "no description, no links");
  assert.equal(board.parseRelatedItem(JSON.stringify({ id: 5, fields: { "System.Description": { text: "x" } } })).description, "", "a description that is no text: none");
  const twice = JSON.parse(fixture("azure-related-item.json"));
  twice.relations.push(twice.relations[0], twice.relations[3], { rel: "System.LinkTypes.Hierarchy-Forward", url: "https://dev.azure.com/x/_apis/wit/workItems/abc" });
  assert.deepEqual([board.parseRelatedItem(JSON.stringify(twice)).children, board.parseRelatedItem(JSON.stringify(twice)).prs.length], [[312, 311, 399], 1], "each once; a link without an id left out");
  assert.throws(() => board.parseRelatedItem("[]"), /^Error: Azure lieferte kein Work Item$/);
  assert.throws(() => board.parseRelatedItem("not json"), /kein lesbares JSON/);
  assert.deepEqual([board.pullRequestOf("vstfs:///Git/PullRequestId/p%2Fr%2F9"), board.pullRequestOf("vstfs:///Git/Ref/p%2Fr%2FGBmain")], [{ project: "p", repo: "r", number: 9 }, null]);
  const lines = board.parseChildren(fixture("azure-related-children.json"), [312, 311, 399], c);
  assert.deepEqual(lines.map((l) => [l.key, l.source, l.kind, l.title, l.type, l.state, l.url, l.draft, "color" in l, "done" in l]), [
    ["AB#312", "azure", "workitem", "Keep the last good copy", "Task", "Done", `${ORG}/Example%20Project/_workitems/edit/312`, false, false, false],
    ["AB#311", "azure", "workitem", "Parse the sample file", "Task", "To Do", `${ORG}/Example%20Project/_workitems/edit/311`, false, false, false],
  ], "work items as the board reads them, in the links' order; one the query does not find left out; color and done come from the view when drawn");
  assert.deepEqual(board.parseChildren("", [1], c), [], "no output: none");
  const data = sprintData();
  assert.deepEqual(["Done", "Removed", "In Progress", "To Do", "Odd"].map((n) => [board.stateColor(data, n), board.stateDone(data, n)]),
    [["ansi2", true], ["dim", true], ["ansi4", false], ["muted", false], ["muted", false]], "a Completed or Removed state is done");
  const reads = board.makeAzure(null).related.reads;
  assert.deepEqual([reads({ source: "azure", kind: "workitem", number: 3 }), reads({ source: "azure", kind: "pr", number: 3 }), reads({ source: "azure", kind: "workitem", number: null })],
    [true, false, false]);
});

test("UI: a Sprint story's details read its related items: its description as HTML without images, its children with their states, a linked pull request by its id; Tab walks them", async () => {
  const { b, cx, host, st } = await openSprint();
  assert.equal(st().sel.key, "AB#301");
  await press(b, cx, "enter");
  assert.equal(azureRelatedOf(host).length, 1, "one az call when the details open");
  assert.ok(azureRelatedOf(host)[0].args.includes("301"));
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN", "lädt …"]);
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  assert.equal(childrenQuery(host).length, 1, "then one query for the children");
  assert.ok(childrenQuery(host)[0].args.includes(board.idsWiql([312, 311, 399])));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  assert.equal(host.open("az").length, 0);
  const view = textViewOf(b);
  assert.deepEqual([view.format, view.viewId], ["html", "description-AB#301"]);
  assert.equal(view.source, board.shownDescription(json("azure-related-item.json").fields["System.Description"], "html"));
  assert.match(view.source, /<a href="https:\/\/dev\.azure\.com\/[^"]+fileName=shot\.png">Bild: shot<\/a>/);
  assert.doesNotMatch(view.source, /<img/i);
  assert.deepEqual(sectionTexts(b), [
    "UNTERAUFGABEN", "AB#312", "Keep the last good copy", "Done", "AB#311", "Parse the sample file", "To Do", "1 nicht gefunden",
    "VERKNÜPFTE PRS · 1", "!57", "Pull Request", "verknüpft",
  ]);
  assert.deepEqual([0, 1, 2].map((i) => byId(detailPanel(b), `related-line-${i}`).with.opacity[0]), [0.55, 1, 1], "a done child dimmed");
  host.theme = () => ({ ansi2: "#green", muted: "#grey" });
  const chipColor = (i) => byId(detailPanel(b), `related-line-${i}`).kids.at(-1).with.bg[0];
  assert.deepEqual([0, 1, 2].map(chipColor), ["#green", "#grey", "#grey"], "a child's state in the view's color for it");
  await tab(b, cx);
  await press(b, cx, "j");
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual([st().sel.key, st().detail, b.panelOf(b.view())?.levels.map((l) => l.item.number)], ["AB#301", true, [311]],
    "a child: its details a level down, the board's selection where it was");
  assert.equal(azureRelatedOf(host).length, 1, "its related items are read");
  await host.answer("az", ok(JSON.stringify({ id: 311, fields: {}, relations: null })), (a) => a.includes("relations"));
  assert.deepEqual([host.open("az").length, descriptionTexts(b), sectionTexts(b)], [0, ["BESCHREIBUNG", "keine Beschreibung"], ["UNTERAUFGABEN", "keine"]], "no children: no query");
  await press(b, cx, "escape");
  assert.deepEqual([b.panelOf(b.view())?.levels.length, b.panelOf(b.view())?.line, host.open("az").length], [0, 1, 0], "back on the story: its line again, nothing read again");
  await press(b, cx, ...SHIFT_G);
  await press(b, cx, "o");
  assert.equal(cx.opened.at(-1), `${ORG}/0f3c6a1e-8b2d-4e7f-a915-3c2d1b0a9e88/_git/6a1d0c3e-2f4b-4e8a-b7c9-1d2e3f4a5b6c/pullrequest/57`, "the pull request's page");
});

test("UI: an Azure related read that fails says why; a children query that fails says why in their place, the rest stays; r reads them again", async () => {
  const { b, cx, host } = await openSprint();
  await press(b, cx, "enter");
  await host.answer("az", azRefused("TF401232: Work item 301 does not exist, or you do not have permissions to read it."), (a) => a.includes("relations"));
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN", "TF401232: Work item 301 does not exist, or you do not have permissions to read it."]);
  await press(b, cx, "r");
  await answerSettings(host);
  await answerRefresh(host, { me: false });
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", azRefused("Operation returned a 400 status code."), AZ.query);
  assert.deepEqual(sectionTexts(b), ["UNTERAUFGABEN", "Operation returned a 400 status code.", "VERKNÜPFTE PRS · 1", "!57", "Pull Request", "verknüpft"]);
  assert.equal(textViewOf(b).format, "html", "the description stays");
  await refreshSprint(b, cx);
  assert.equal(azureRelatedOf(host).length, 0, "not while the refresh runs");
  await answerRefresh(host, { me: false });
  assert.equal(azureRelatedOf(host).length, 1, "a failed children query: read again after the next refresh");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(JSON.stringify([...json("azure-related-children.json"), { id: 399, fields: { "System.Title": "No state yet" } }])), AZ.query);
  assert.deepEqual(drawnLines(b)[2], ["AB#399", "No state yet", "ohne Status"], "a child without a state");
  await refreshSprint(b, cx);
  await answerRefresh(host, { me: false });
  assert.equal(azureRelatedOf(host).length, 0, "once it is read, kept over a refresh");
});

test("UI: the detail panel takes a third of the board area as a share, no narrower than one of the columns beside it, the 420 and 720 pixel bounds last", async () => {
  const { b, cx, host } = await openBoard();
  const width = () => {
    const panel = detailPanel(b);
    return [panel.with.w[0], panel.with.min_w[0], panel.with.max_w[0], panel.styles.includes("flex_none")];
  };
  await press(b, cx, "enter");
  assert.equal(b.navColumns(b.view()).length, 3);
  assert.deepEqual(width(), ["33.33%", 420, 720, true], "three columns: a third");
  // Ready hidden, then the empty column right of In progress.
  for (const [move, left, name] of [[null, 2, "Ready"], ["l", 1, "In review"]]) {
    if (move) await press(b, cx, move);
    await runCommand(b, cx, `Spalte ausblenden: ${name}`);
    await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
    assert.equal(b.navColumns(b.view()).length, left);
  }
  await press(b, cx, "enter");
  assert.deepEqual(width(), ["50.00%", 420, 720, true], "one column: as wide as it");
  assert.deepEqual([0, 1, 2, 3, 6].map((n) => board.detailWidth(n)), ["33.33%", "50.00%", "33.33%", "33.33%", "33.33%"]);
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")), (args) => args.some((a) => String(a).includes("search(type: ISSUE")));
  await press(b, cx, "enter");
  assert.equal(detailPanel(b).with.w[0], "33.33%", "a list has no columns");
});

test("UI: on a Sprint the detail panel's share is no narrower than one of its taskboard columns; the stories' column does not count", async () => {
  const { b, cx, view, st } = await openSprint();
  await press(b, cx, "enter");
  assert.equal(st().detail, true);
  const columns = b.navColumns(view).length - 1;
  assert.ok(columns >= 2);
  assert.equal(b.shape(view).columnCount(b, st()), columns);
  assert.equal(detailPanel(b).with.w[0], board.detailWidth(columns));
});

// ---- Colors: labels, types, statuses and the selected look (ui/tones.js) ----

// WCAG's contrast of two #rrggbb colors, and #rrggbb[aa] laid over #rrggbb.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (top, ground) => {
  const alpha = top.length === 9 ? parseInt(top.slice(7), 16) / 255 : 1;
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(top.slice(i, i + 2), 16) * alpha + parseInt(ground.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
};
// The entries of `ratios` (name → contrasts) with a contrast below `need`,
// measured unrounded, each contrast shown to two places.
const shown = (r) => Math.round(r * 100) / 100;
const below = (ratios, need) => Object.entries(ratios).filter(([, rs]) => rs.some((r) => r < need)).map(([name, rs]) => [name, rs.map(shown)]);
const shownRatios = (ratios) => JSON.stringify(ratios, (_k, v) => (typeof v === "number" ? shown(v) : v));

test("the contrast helpers find a ratio below the need unrounded and show it to two places", () => {
  assert.deepEqual(below({ weak: [4.4951, 7], fine: [4.5, 4.51] }, 4.5), [["weak", [4.5, 7]]]);
  assert.equal(shownRatios({ x: [4.4951] }), '{"x":[4.5]}');
});
const OPAQUE = /^#[0-9a-f]{6}$/;

// A copper theme's file in themes/.
const copperFile = (mode) => JSON.parse(readFileSync(resolve(modDir, `../../themes/copper-${mode}.json`), "utf8"));

// A copper theme as theme() gives it, for the colors the tests below read:
// its file's ansi0..ansi15 and background, and its colors (foreground among
// them) over them. herdr's resolve (src/settings.rs, herdr 0.1.17) derives
// the panel colors from the background first and lays a file's colors over
// them, so a color the file sets is the file's. What it derives beyond them
// (hover, ring, solid_foreground and the terminals' own colors) is left out
// here: no test of colors reads it. The file's top-level foreground is the
// terminals' (herdr's terminal_foreground), which the board does not draw
// with.
function copperTheme(mode) {
  const file = copperFile(mode);
  const ansi = Object.fromEntries(file.ansi.map((c, i) => [`ansi${i}`, c]));
  return { ...ansi, background: file.background, ...file.colors };
}
const COPPER = ["dark", "light"];

// A copper theme with copper's steps for mods left out: a theme the board
// draws with tints of its colors.
const tintedCopper = (mode) => Object.fromEntries(Object.entries(copperTheme(mode)).filter(([name]) => !name.startsWith("copper-")));

// catppuccin-mocha as theme() gives it, for the colors the tests below
// read. Its file sets only the accent beside its terminal colors, so herdr
// derives the rest from its background: resolve in src/settings.rs, herdr
// 0.1.17, with its 32-bit float mix (as copper-design's herdr.py ports it).
const f32 = Math.fround;
const byte = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
const mix = (a, b, t) => `#${[0, 1, 2].map((i) => Math.floor(f32(f32(byte(a, i) * f32(1 - f32(t))) + f32(byte(b, i) * f32(t))) + 0.5).toString(16).padStart(2, "0")).join("")}`;
const isLight = (hex) => {
  const [r, g, b] = [0.2126, 0.7152, 0.0722].map((w, i) => f32(f32(w) * f32(byte(hex, i) / 255)));
  return f32(f32(r + g) + b) > 0.5;
};
function catppuccinTheme() {
  const file = JSON.parse(readFileSync(resolve(modDir, "../../themes/catppuccin-mocha.json"), "utf8"));
  const bg = file.background;
  const light = isLight(bg);
  const fg = light ? "#1b1b1e" : "#eeeeef";
  const panels = light
    ? { raised: mix(bg, "#000000", 0.035), selected: "#00000012", border: "#00000017", chrome: mix(bg, "#e8e8e2", 0.6) }
    : { raised: mix(bg, "#ffffff", 0.09), selected: "#ffffff17", border: "#ffffff18", chrome: mix(bg, "#000000", 0.32) };
  const ansi = Object.fromEntries(file.ansi.map((c, i) => [`ansi${i}`, c]));
  return { ...ansi, background: bg, foreground: fg, ...panels, muted: mix(bg, fg, light ? 0.66 : 0.6), dim: mix(bg, fg, light ? 0.46 : 0.38), accent: file.ansi[4], ...file.colors };
}

// The themes the board draws with tints of their colors, by name.
const TINTED = () => ({ "copper-dark": tintedCopper("dark"), "copper-light": tintedCopper("light"), "catppuccin-mocha": catppuccinTheme() });
const colorsBoard = () => board.parseGithubBoard(json("github-board-colors.json"), githubView(), HIDDEN);
// The chips under `el` whose text is `text`, and the first of them.
const chipsOf = (el, text) => (typeof el === "string" ? [] : [...(el.kids?.length === 1 && el.kids[0] === text ? [el] : []), ...(el.kids ?? []).flatMap((k) => chipsOf(k, text))]);
const chipOf = (el, text) => chipsOf(el, text)[0] ?? null;
const chipLook = (el) => [el.with.text_color[0], el.with.bg[0]];

// The colors a copper file's `colors` set that the tests of colors read,
// beside its background and ansi colors.
const COPPER_COLORS = ["foreground", "muted", "dim", "accent", "chrome", "selected", "border"];

test("the copper themes' files set every color the tests of colors read, opaque, so herdr derives none of them: background, foreground, muted, dim, accent, chrome, selected, border and ansi0..ansi15", () => {
  for (const mode of COPPER) {
    const file = copperFile(mode);
    const t = copperTheme(mode);
    assert.equal(file.ansi.length, 16, `${mode}: ansi colors`);
    const own = {
      background: file.background,
      ...Object.fromEntries(COPPER_COLORS.map((name) => [name, file.colors[name]])),
      ...Object.fromEntries(file.ansi.map((c, i) => [`ansi${i}`, c])),
    };
    for (const [name, color] of Object.entries(own)) {
      assert.match(color ?? "none", OPAQUE, `${mode} ${name}: in the file`);
      assert.equal(t[name], color, `${mode} ${name}: as the theme has it`);
    }
  }
});

test("a card carries its labels' colors and its issue type's color, which the board's query asks for", () => {
  const doc = board.githubBoardArgs(githubView(), HIDDEN).find((a) => a.startsWith("query="));
  assert.equal(doc.match(/labels\(first: 10\) \{ nodes \{ name color \} \}/g).length, 2, "an issue's labels and a pull request's");
  assert.match(doc, /issueType \{ name color \}/);
  const b = colorsBoard();
  const card = (key) => board.findCard(b, key).card;
  assert.deepEqual(card("PVTI_col1").labelColors, { bug: "#d73a4a", docs: "#0075ca", chore: "#cfd3d7" }, "with a #, in lower case");
  assert.deepEqual(card("PVTI_col2").labelColors, { "help wanted": "#008672", question: "#7057ff", unread: null }, "a label without a color: null");
  assert.deepEqual(card("PVTI_col1").labels, ["bug", "docs", "chore"], "the labels stay their names");
  assert.deepEqual(["PVTI_col1", "PVTI_col2", "PVTI_col3", "PVTI_col5"].map((k) => [card(k).type, card(k).typeColor]),
    [["Bug", "ansi1"], ["Task", "ansi11"], [null, null], ["Epic", "ansi2"]]);
  assert.deepEqual(board.findCard(githubBoard(), "PVTI_rec1").card.labelColors, { enhancement: null, "area:architecture": null, epic: null }, "an answer without colors");
  assert.deepEqual(["d73a4a", "ABCDEF", "#d73a4a", "fff", "zzzzzz", null, undefined].map(board.labelColor),
    ["#d73a4a", "#abcdef", null, null, null, null, null]);
});

test("a label's color takes, by hue, one of copper's seven hues in a copper theme (orange as ansi11, red below 40 degrees of OKLCH hue) and the theme's red, green, yellow, blue, violet or teal in any other; a grey one or no color muted, a color with alpha by its first six digits, in copper-dark and copper-light with and without copper's colors", () => {
  const greys = [["cfd3d7", "muted"], ["ffffff", "muted"], ["000000", "muted"], ["8b949e", "muted"], ["bfdadc", "muted"]];
  const common = [
    ["d73a4a", "ansi1"], ["b60205", "ansi1"], ["e99695", "ansi1"], ["d93f0b", "ansi1"], ["e4007c", "ansi1"],
    ["0e8a16", "ansi2"], ["c2e0c6", "ansi2"], ["e4e669", "ansi2"],
    ["fbca04", "ansi3"], ["fef2c0", "ansi3"],
    ["0075ca", "ansi4"], ["1d76db", "ansi4"], ["c5def5", "ansi4"],
    ["7057ff", "ansi5"], ["5319e7", "ansi5"], ["d876e3", "ansi5"],
    ["008672", "ansi6"], ["a2eeef", "ansi6"],
    ...greys,
  ];
  // copper's red and orange text colors stand at about 4 and 50 degrees of
  // OKLCH hue; between them a label is red below 40 (b60205 at 29, d93f0b
  // at 36, and f9d0c4, a pale peach at 37) and orange from it (ff5900 at
  // 39.8 against ff5a00 at 40.1). Further on, nearest by hue: ff7f00 at 53
  // is orange, f9a825 at 72 yellow.
  const copper = [...common, ["f9d0c4", "ansi1"], ["ff5900", "ansi1"], ["ff5a00", "ansi11"], ["ff6a00", "ansi11"], ["e36209", "ansi11"], ["ff7f00", "ansi11"], ["f9a825", "ansi3"]];
  for (const [name, t, cases] of [
    ...COPPER.map((mode) => [`copper-${mode}`, copperTheme(mode), copper]),
    ...COPPER.map((mode) => [`copper-${mode} without copper's colors`, tintedCopper(mode), common]),
  ]) {
    assert.deepEqual(cases.map(([hex]) => [hex, board.hueTone(t, `#${hex}`)]), cases, name);
    assert.deepEqual([null, undefined, "#fff", "red", "#d73a4a8"].map((c) => board.hueTone(t, c)), ["muted", "muted", "muted", "muted", "muted"], `${name}: no color`);
    assert.deepEqual(["#d73a4a80", "#0075CA17"].map((c) => board.hueTone(t, c)), ["ansi1", "ansi4"], `${name}: with alpha`);
  }
  assert.deepEqual(["#ff5900", "#ff5a00", "#ff7f00"].map((c) => board.hueTone(tintedCopper("dark"), c)), ["ansi3", "ansi3", "ansi3"], "without copper's colors: no orange and no border, nearest by hue");
  assert.deepEqual(board.oklch("#d73a4a80"), board.oklch("#d73a4a"));
  assert.equal(board.hueTone({ muted: "#808080" }, "#d73a4a"), "muted", "a theme without those colors");
  assert.equal(board.hueTone({ ansi1: "#ff0000", ansi4: "#0000ff", ansi2: "nope" }, "#00ff00"), "ansi1", "the nearest of the colors the theme has");
  assert.equal(board.hueTone({ ansi1: "#ff000080", ansi4: "#0000ff" }, "#d73a4a"), "ansi1", "a theme color with alpha by its first six digits");
});

// The tones the tests of colors draw in: a label's or type's (HUE_TONES,
// muted) and a status's (STATUS_TONES: GitHub's and Azure's, the bright
// ones among them).
const STATUS_TONES = ["muted", "dim", "ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi11", "ansi13"];

// How far apart two colors stand, as OKLab distance times 100 (Björn
// Ottosson's OKLab, as copper-design measures its tints).
const oklab = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const distance = (a, b) => 100 * Math.hypot(...oklab(a).map((x, i) => x - oklab(b)[i]));

test("a theme takes copper's colors (its steps and text colors) only where it carries all of them; one that misses one, and catppuccin-mocha, draw in their own colors and their tints throughout", () => {
  globalThis.__boardHost = fakeHost();
  for (const mode of COPPER) assert.equal(board.copperColors(copperTheme(mode)), true, mode);
  for (const [name, t] of Object.entries(TINTED())) assert.equal(board.copperColors(t), false, name);
  const missing = copperTheme("dark");
  delete missing["copper-teal-4"];
  assert.equal(board.copperColors(missing), false);
  assert.deepEqual([chipLook(board.toneChip(missing, "x", "ansi6")), chipLook(board.toneChip(missing, "x", "ansi1"))],
    [[missing.ansi6, `${missing.ansi6}${board.CHIP_ALPHA}`], [missing.ansi1, `${missing.ansi1}${board.CHIP_ALPHA}`]], "every tone tinted, not only teal");
  assert.equal(board.selectedBg(missing), over(`${missing.accent}${board.SELECTED_ALPHA}`, missing.background));
  assert.equal(board.copperColors({ ...copperTheme("light"), "copper-neutral-3": "#f2e9e180" }), false, "a step with alpha");
  for (const color of ["red", "orange", "yellow", "green", "teal", "blue", "violet", "neutral"]) {
    const t = copperTheme("dark");
    delete t[`copper-${color}-text`];
    assert.equal(board.copperColors(t), false, `without copper-${color}-text`);
    assert.deepEqual(chipLook(board.toneChip(t, "x", "ansi1")), [t.ansi1, `${t.ansi1}${board.CHIP_ALPHA}`], `without copper-${color}-text: tinted`);
  }
  const v030 = Object.fromEntries(Object.entries(copperTheme("light")).filter(([name]) => !name.endsWith("-text")));
  assert.equal(board.copperColors(v030), false, "a copper theme before v0.4.0, without text colors");
  assert.deepEqual([chipLook(board.toneChip(v030, "x", "ansi3")), board.hueTone(v030, "#d93f0b")], [[v030.ansi3, `${v030.ansi3}${board.CHIP_ALPHA}`], "ansi1"], "its own colors and their tints, six hues");
});

test("without copper's steps, a selected card's or row's background is the accent laid opaque over the theme's background, the same on every ground; a chip's text on its tint reads at 4.5:1 or more on a card and on it, and so does the card's own text (foreground, muted, dim) on it, in copper-dark and copper-light without their steps and in catppuccin-mocha, but for a muted chip and dim text on a selected card in catppuccin-mocha, where herdr derives its muted and dim", () => {
  globalThis.__boardHost = fakeHost();
  const ratios = {};
  for (const [name, t] of Object.entries(TINTED())) {
    const selected = board.selectedBg(t);
    assert.match(selected, OPAQUE, name);
    assert.equal(selected, over(`${t.accent}${board.SELECTED_ALPHA}`, t.background), name);
    assert.equal(over(selected, t.chrome), selected, `${name}: on a column's chrome as on the board`);
    for (const tone of [...board.HUE_TONES, "muted"]) {
      const [fg, bg] = chipLook(board.toneChip(t, "x", tone));
      assert.equal(fg, t[tone], `${name} ${tone}: text in its tone`);
      assert.equal(bg, `${t[tone]}${board.CHIP_ALPHA}`, `${name} ${tone}: on its tint`);
      ratios[`${name} chip ${tone}`] = [contrast(fg, over(bg, t.background)), contrast(fg, over(bg, selected))];
    }
    ratios[`${name} text`] = [t.foreground, t.muted, t.dim].map((fg) => contrast(fg, selected));
  }
  // catppuccin-mocha sets none of its panel colors: herdr derives its muted
  // and dim as greys between its background and its text (dim at 3.21:1 on
  // the background itself), which a muted chip and dim text on a selected
  // card fall short with.
  assert.deepEqual(below(ratios, 4.5), [["catppuccin-mocha chip muted", [5.04, 4.31]], ["catppuccin-mocha text", [12.12, 5.09, 2.75]]], shownRatios(ratios));
});

test("without copper's steps, a column head's background is its color laid opaque over the ground it stands on; its name and muted count read at 4.5:1 or more on a column's chrome and on the Sprint's background, for every status color, in copper-dark and copper-light without their steps and in catppuccin-mocha", () => {
  globalThis.__boardHost = fakeHost();
  const ratios = {};
  for (const [name, t] of Object.entries(TINTED())) {
    for (const color of STATUS_TONES) {
      for (const ground of ["chrome", "background"]) {
        const head = board.columnHead(t, { name: "x", color }, "1", t[ground]);
        const bg = head.with.bg[0];
        assert.match(bg, OPAQUE, `${name} ${color} on ${ground}`);
        assert.equal(bg, over(`${t[color]}${board.HEAD_ALPHA}`, t[ground]), `${name} ${color} on ${ground}`);
        ratios[`${name} ${color} on ${ground}`] = [t.foreground, t.muted].map((fg) => contrast(fg, bg));
      }
    }
  }
  assert.deepEqual(below(ratios, 4.5), [], shownRatios(ratios));
});

// The copper step a chip (on a card and on a selected one) and a column
// head (on a column's chrome and on the Sprint's background) take, per mode
// and copper color (a chip) or tone (a head): 3 where it stands 3 or more
// apart from both grounds, else 4 (tones.js, copperTint).
const CHIP_STEPS = {
  dark: { red: 3, orange: 3, yellow: 3, green: 3, teal: 3, blue: 3, violet: 4, neutral: 4 },
  light: { red: 3, orange: 3, yellow: 3, green: 3, teal: 4, blue: 4, violet: 3, neutral: 3 },
};
const HEAD_STEPS = {
  dark: { muted: 4, dim: 4, ansi1: 3, ansi2: 3, ansi3: 3, ansi4: 3, ansi5: 4, ansi11: 3, ansi13: 4 },
  light: { muted: 4, dim: 4, ansi1: 4, ansi2: 4, ansi3: 4, ansi4: 3, ansi5: 3, ansi11: 4, ansi13: 3 },
};
// Each copper color's own tone (orange's ansi11, the neutral's muted), and a
// tone's copper color: its ANSI slot's in copper's port (a bright one its
// plain one's), but ansi11 orange; muted and dim the neutral.
const COPPER_TONE = { red: "ansi1", orange: "ansi11", yellow: "ansi3", green: "ansi2", teal: "ansi6", blue: "ansi4", violet: "ansi5", neutral: "muted" };
const COPPER_OF = {
  ansi1: "red", ansi2: "green", ansi3: "yellow", ansi4: "blue", ansi5: "violet", ansi6: "teal",
  ansi9: "red", ansi10: "green", ansi11: "orange", ansi12: "blue", ansi13: "violet", ansi14: "teal", muted: "neutral", dim: "neutral",
};

test("in a copper theme a selected card's or row's background is the theme's selected; a chip stands on its copper color's step 3, or 4 where 3 stands less than 3 apart from a card or a selected one, its text in its copper color's text color at 4.5:1 or more there and on a card and a selected one, a source's theme name in its ANSI slot's copper color (GitHub's ORANGE in orange), and the card's own text (foreground, muted, dim) reads at 4.5:1 or more on a selected card, in copper-dark and copper-light", () => {
  globalThis.__boardHost = fakeHost();
  const ratios = {};
  const close = {};
  for (const mode of COPPER) {
    const t = copperTheme(mode);
    const selected = board.selectedBg(t);
    assert.equal(selected, t.selected, mode);
    assert.match(selected, OPAQUE, mode);
    for (const [color, tone] of Object.entries(COPPER_TONE)) {
      const [fg, bg] = chipLook(board.toneChip(t, "x", tone));
      assert.deepEqual([fg, bg], [t[`copper-${color}-text`], t[`copper-${color}-${CHIP_STEPS[mode][color]}`]], `${mode} ${tone}`);
      ratios[`${mode} chip ${color}`] = [contrast(fg, bg), contrast(fg, t.background), contrast(fg, selected)];
      close[`${mode} chip ${color}`] = [distance(bg, t.background), distance(bg, selected)];
      const rest = t[`copper-${color}-3`];
      if (CHIP_STEPS[mode][color] === 4) assert.ok(Math.min(distance(rest, t.background), distance(rest, selected)) < 3, `${mode} ${color}: step 3 stands too close`);
    }
    for (const [tone, color] of Object.entries(COPPER_OF)) {
      const own = COPPER_TONE[color];
      assert.deepEqual(chipLook(board.toneChip(t, "x", tone)), chipLook(board.toneChip(t, "x", own)), `${mode} ${tone}: as ${own}`);
    }
    ratios[`${mode} text`] = [t.foreground, t.muted, t.dim].map((fg) => contrast(fg, selected));
  }
  assert.deepEqual(below(ratios, 4.5), [], shownRatios(ratios));
  assert.deepEqual(below(close, 3), [], shownRatios(close));
});

test("in a copper theme a column head stands on its status color's copper step 3, or 4 where 3 stands less than 3 apart from a column's chrome or the Sprint's background, the same on both; its name and muted count read at 4.5:1 or more, for every status color, in copper-dark and copper-light", () => {
  globalThis.__boardHost = fakeHost();
  const ratios = {};
  const close = {};
  for (const mode of COPPER) {
    const t = copperTheme(mode);
    for (const color of STATUS_TONES) {
      const [onChrome, onBackground] = ["chrome", "background"].map((ground) => board.columnHead(t, { name: "x", color }, "1", t[ground]).with.bg[0]);
      assert.deepEqual([onChrome, onBackground], Array(2).fill(t[`copper-${COPPER_OF[color]}-${HEAD_STEPS[mode][color]}`]), `${mode} ${color}`);
      ratios[`${mode} ${color}`] = [t.foreground, t.muted].map((fg) => contrast(fg, onChrome));
      close[`${mode} ${color}`] = [distance(onChrome, t.chrome), distance(onChrome, t.background)];
      const rest = t[`copper-${COPPER_OF[color]}-3`];
      if (HEAD_STEPS[mode][color] === 4) assert.ok(Math.min(distance(rest, t.chrome), distance(rest, t.background)) < 3, `${mode} ${color}: step 3 stands too close`);
    }
  }
  assert.deepEqual(below(ratios, 4.5), [], shownRatios(ratios));
  // copper-light's chrome is its neutral step 3, and step 4 stands only
  // 2.38 apart from it: a muted or dim head on a board's column, its dot
  // and its text mark it. The bar of 3 is the board's own for every pair
  // (tones.js, TINT_APART); copper holds two neutral steps beside each other
  // to 1.12:1 in luminance instead, which step 4 on step 3 misses in both
  // modes (dark, on the Sprint's background: 1.087; light, on the chrome:
  // 1.075).
  assert.deepEqual(below(close, 3), [["light muted", [2.38, 7.21]], ["light dim", [2.38, 7.21]]], shownRatios(close));
  assert.deepEqual(COPPER.map((mode) => Math.round(contrast(copperTheme(mode)["copper-neutral-4"], copperTheme(mode)["copper-neutral-3"]) * 1000) / 1000), [1.087, 1.075]);
});

test("a drop target column keeps its ground in a copper theme, which stands 3 or more apart from a selected card and from every head on it but copper-light's muted and dim ones; without copper's steps it takes the theme's selected", () => {
  globalThis.__boardHost = fakeHost();
  const close = {};
  for (const mode of COPPER) {
    const t = copperTheme(mode);
    const drop = board.dropBg(t, t.chrome);
    assert.equal(drop, t.chrome, mode);
    assert.equal(board.dropBg(t, t.background), t.background, `${mode}: any ground`);
    close[`${mode} selected card`] = [distance(drop, board.selectedBg(t))];
    for (const color of STATUS_TONES) close[`${mode} ${color} head`] = [distance(drop, board.headBg(t, color, drop))];
  }
  assert.deepEqual(below(close, 3), [["light muted head", [2.38]], ["light dim head", [2.38]]], shownRatios(close));
  for (const [name, t] of Object.entries(TINTED())) assert.equal(board.dropBg(t, t.chrome), t.selected, name);
});

test("a tone's color, as a column's dot, a card's edge and a type's line, is its copper color's text color in a copper theme and the theme's color of that name in any other, and stands at 3:1 or more from what it is drawn on (a card, a selected one, a column head on a column's chrome and on the Sprint's background), for every tone, in copper-dark and copper-light with and without copper's colors and in catppuccin-mocha, but for catppuccin's dim on a selected card", () => {
  globalThis.__boardHost = fakeHost();
  const ratios = {};
  const themes = { ...Object.fromEntries(COPPER.map((mode) => [`copper-${mode} with its colors`, copperTheme(mode)])), ...TINTED() };
  for (const [name, t] of Object.entries(themes)) {
    const copper = board.copperColors(t);
    for (const tone of new Set([...board.HUE_TONES, ...STATUS_TONES])) {
      const fg = board.columnColor(t, { color: tone });
      assert.equal(fg, copper ? t[`copper-${COPPER_OF[tone]}-text`] : t[tone], `${name} ${tone}`);
      const grounds = [t.background, board.selectedBg(t), board.headBg(t, tone, t.chrome), board.headBg(t, tone, t.background)];
      ratios[`${name} ${tone}`] = grounds.map((g) => contrast(fg, g));
    }
  }
  // catppuccin-mocha's dim is herdr's derived grey (above): an Azure
  // column's edge in it falls short on a selected card.
  assert.deepEqual(below(ratios, 3), [["catppuccin-mocha dim", [3.21, 2.75, 3.37, 3.02]]], shownRatios(ratios));
});

test("a tone or ground the theme has no color for falls back: text to muted, a chip to a tint of muted or the plain one, a head to the translucent tint or raised, the selected look to the theme's selected, a check of another state to dim; tint takes a color's first six digits", () => {
  globalThis.__boardHost = fakeHost();
  const t = { muted: "#muted", raised: "#raised", accent: "#ffffff17", selected: "#selected", ansi4: "#0000ff" };
  assert.deepEqual(chipLook(board.toneChip(t, "x", "ansi1")), ["#muted", "#raised"], "no such color");
  assert.deepEqual(chipLook(board.toneChip({ ...t, muted: "#808080" }, "x", "ansi1")), ["#808080", `#808080${board.CHIP_ALPHA}`], "no such color: muted's, tinted");
  assert.deepEqual([board.toneColor(t, "ansi4"), board.toneColor(t, "ansi1"), board.checkColor(t, "failed"), board.checkColor({ ...t, dim: "#dim" }, "other")],
    ["#0000ff", "#muted", "#muted", "#dim"], "text: muted for a tone the theme has no color for; a check of another state dim");
  const copper = copperTheme("dark");
  assert.deepEqual(["failed", "pending", "passed", "other"].map((state) => board.checkColor(copper, state)),
    ["red", "yellow", "green", "neutral"].map((color) => copper[`copper-${color}-text`]), "a check's state in its note level's tone");
  assert.deepEqual(chipLook(board.toneChip(t, "x", "muted")), ["#muted", "#raised"], "no color to tint");
  assert.deepEqual(chipLook(board.toneChip(t, "x", "ansi4")), ["#0000ff", `#0000ff${board.CHIP_ALPHA}`]);
  assert.equal(board.headBg(t, "ansi4", "#ffffff17"), `#0000ff${board.HEAD_ALPHA}`, "a translucent ground: the translucent tint");
  assert.equal(board.headBg(t, "ansi4", undefined), `#0000ff${board.HEAD_ALPHA}`, "no ground");
  assert.equal(board.headBg(t, "nope", "#000000"), "#raised", "no color, and muted none to tint");
  assert.equal(board.headBg({ ...t, muted: "#808080" }, "nope", "#000000"), "#090909", "no color: muted's");
  assert.equal(board.columnHead(t, { name: "x", color: "nope" }, "1", "#nope").with.bg[0], "#raised", "a head without either");
  assert.equal(board.selectedBg(t), "#selected", "no background");
  assert.equal(board.selectedBg({ ...t, background: "#00000012" }), "#selected", "a translucent background");
  assert.equal(board.selectedBg({ ...t, accent: "#nope", background: "#000000" }), "#selected", "no accent");
  assert.equal(board.selectedBg({ ...t, background: "#000000" }), "#141414", "an accent with alpha, by its first six digits");
  assert.deepEqual([board.tint("#ffffff17", "26"), board.tint("#71B8F4", "26"), board.tint("#nope", "26"), board.tint("#nope", "26", "#x")],
    ["#ffffff26", "#71B8F426", "#nope", "#x"]);
});

test("a type's marker: an issue type in its color (in a copper theme as its source names it, elsewhere a bright one as its plain color), an Epic by its title in its epic label's color or muted without one, a type without color plain", () => {
  const t = copperTheme("dark");
  const b = colorsBoard();
  const card = (key) => board.findCard(b, key).card;
  const keys = ["PVTI_col1", "PVTI_col2", "PVTI_col3", "PVTI_col4", "PVTI_col5"];
  assert.deepEqual(keys.map((k) => [board.cardType(card(k)), board.typeTone(t, card(k))]),
    [["Bug", "ansi1"], ["Task", "ansi11"], ["Epic", "ansi5"], ["Epic", "muted"], ["Epic", "ansi2"]],
    "RED; ORANGE (ansi11, copper's orange); the Epic label's violet; no epic label; the issue type's GREEN wins over the red epic label");
  assert.deepEqual(keys.map((k) => board.typeTone(tintedCopper("dark"), card(k))), ["ansi1", "ansi3", "ansi5", "muted", "ansi2"],
    "without copper's colors: ORANGE (ansi11) as ansi3");
  assert.deepEqual(keys.map((k) => board.epicLabel(card(k))), [null, null, "Epic", null, null], "only an Epic by its title alone takes a label's color");
  const azure = { type: "User Story", title: "[Epic] not by its title", labels: ["epic"] };
  assert.deepEqual([board.cardType(azure), board.typeTone(t, azure), board.epicLabel(azure)], ["User Story", null, null], "a type of its own, without a color");
  assert.deepEqual([board.cardType({ type: null, title: "fix: an [Epic] inside" }), board.typeTone(t, { type: null, title: "x", labels: [] })], [null, null]);
  assert.deepEqual(["ansi9", "ansi11", "ansi13", "ansi14", "ansi15", "ansi8", "ansi4", "muted", "dim", null].map(board.chipTone),
    ["ansi1", "ansi3", "ansi5", "ansi6", "ansi15", "ansi8", "ansi4", "muted", "dim", null]);
});

test("UI: the board draws labels and types as chips in their tones (an Epic by its title without its epic label's own chip), each column's head opaque on its chrome, also under a drag, each card's edge in its column's color, and a selected card on the theme's selected, which keeps its chips", async () => {
  const { b, cx, host } = await openBoard({ answer: fixture("github-board-colors.json") });
  const t = copperTheme("dark");
  host.theme = () => t;
  // A chip's look in a tone.
  const look = (tone) => [board.toneColor(t, tone), board.chipBg(t, tone)];
  let root = b.render();
  const col1 = byId(root, "card-PVTI_col1");
  assert.deepEqual(["Bug", "bug", "docs", "chore"].map((n) => chipLook(chipOf(col1, n))), [look("ansi1"), look("ansi1"), look("ansi4"), look("muted")]);
  const col2 = byId(root, "card-PVTI_col2");
  assert.deepEqual(["Task", "help wanted", "question", "unread"].map((n) => chipLook(chipOf(col2, n))), [look("ansi11"), look("ansi6"), look("ansi5"), look("muted")]);
  assert.deepEqual(chipLook(chipOf(col2, "Task")), [t["copper-orange-text"], t["copper-orange-3"]], "ORANGE in copper's orange");
  const epic = byId(root, "card-PVTI_col3");
  assert.deepEqual(chipsOf(epic, "Epic").map(chipLook), [look("ansi5")], "an Epic by its title: one chip, in its epic label's color");
  assert.deepEqual(chipLook(chipOf(epic, "area:ui")), look("ansi3"), "its other labels stay");
  assert.deepEqual(chipsOf(byId(root, "card-PVTI_col4"), "Epic").map(chipLook), [look("muted")]);
  const typed = byId(root, "card-PVTI_col5");
  assert.deepEqual([chipsOf(typed, "Epic").map(chipLook), chipsOf(typed, "epic").map(chipLook)], [[look("ansi2")], [look("ansi1")]],
    "an issue type Epic keeps its epic label's chip");
  const cols = b.navColumns(b.view());
  assert.deepEqual(cols.map((c) => [c.name, c.color]), [["Parked", "muted"], ["Ready", "ansi4"], ["In progress", "ansi3"]]);
  const heads = () => cols.map((_, ci) => byId(b.render(), `col-${ci}`).kids[0].with.bg[0]);
  cols.forEach((col, ci) => {
    const head = byId(root, `col-${ci}`).kids[0];
    assert.equal(head.with.bg[0], board.headBg(t, col.color, t.chrome), `${col.name}: its head`);
    assert.equal(head.kids[0].with.bg[0], t[`copper-${COPPER_OF[col.color]}-text`], `${col.name}: its dot`);
    for (const card of col.shown) {
      const edge = byId(root, `card-${card.key}`).kids[0];
      assert.deepEqual([edge.with.w[0], edge.with.bg[0]], [3, t[`copper-${COPPER_OF[col.color]}-text`]], `${card.key}: its edge`);
    }
  });
  const before = heads();
  await mouse(b, cx, "card-PVTI_col1", "on_mouse_down");
  byId(b.render(), "col-2").with.on_hover[0](true, cx);
  assert.equal(byId(b.render(), "col-2").with.bg[0], t.chrome, "a drop target keeps its ground");
  assert.equal(byId(b.render(), "col-2").with.border_color[0], t.accent, "the accent marks it");
  assert.deepEqual(heads(), before, "its head as it was");
  b.endDrag(cx);
  await clickCard(b, cx, "PVTI_col1");
  root = b.render();
  const selected = byId(root, "card-PVTI_col1");
  assert.deepEqual([selected.with.bg[0], selected.with.border_color[0]], [board.selectedBg(t), t.accent]);
  assert.equal(selected.with.bg[0], t.selected, "copper's own selected");
  assert.deepEqual(chipLook(chipOf(selected, "bug")), look("ansi1"), "its chips as before");
  assert.deepEqual([byId(root, "card-PVTI_col2").with.bg[0], byId(root, "card-PVTI_col2").with.border_color[0]], [t.background, t.border], "the others plain");
});

test("UI: on a theme without copper's colors a column a card is dragged over takes the theme's selected, and its head stays", async () => {
  const { b, cx, host } = await openBoard({ answer: fixture("github-board-colors.json") });
  const t = catppuccinTheme();
  host.theme = () => t;
  const heads = () => [0, 1, 2].map((ci) => byId(b.render(), `col-${ci}`).kids[0].with.bg[0]);
  const before = heads();
  await mouse(b, cx, "card-PVTI_col1", "on_mouse_down");
  byId(b.render(), "col-2").with.on_hover[0](true, cx);
  const target = byId(b.render(), "col-2");
  assert.deepEqual([target.with.bg[0], target.with.border_color[0]], [t.selected, t.accent], "a drop target");
  assert.notEqual(target.with.bg[0], t.chrome);
  assert.deepEqual(heads(), before, "the heads as they were");
  b.endDrag(cx);
});

test("UI: the banner draws a notice in its level's tone and an error of the views' file as an error, in copper's text colors in copper-dark and copper-light", async () => {
  const { b } = await openBoard();
  for (const mode of COPPER) {
    const t = copperTheme(mode);
    const colorOf = (text) => chipOf(b.banner(t), text)?.with.text_color[0];
    const shown = ["error", "warning", "success", "info", "other"].map((level) => {
      b.notice = { text: `a ${level}`, level };
      return colorOf(`a ${level}`);
    });
    assert.deepEqual(shown, ["red", "yellow", "green", "neutral", "neutral"].map((color) => t[`copper-${color}-text`]), mode);
    b.notice = null;
    b.configErrors = ["broken"];
    assert.equal(colorOf("broken"), t["copper-red-text"], mode);
    b.configErrors = [];
  }
  // In copper-dark the text colors are not the terminal's ANSI colors, so
  // the test tells the two apart there.
  assert.notEqual(copperTheme("dark")["copper-red-text"], copperTheme("dark").ansi1);
});

test("UI: a card counts the labels it draws no chip for after the third, and draws no count for three or fewer; an Epic by its title leaves its epic label out of both", async () => {
  const data = json("github-board-colors.json");
  const nodes = data.data.repositoryOwner.projectV2.items.nodes;
  const content = (key) => nodes.find((n) => n.id === key).content;
  const labels = (key, names) => (content(key).labels.nodes = names.map((name) => ({ name, color: "d73a4a" })));
  labels("PVTI_col4", ["epic", "a", "b", "c"]);
  labels("PVTI_col3", ["epic", "a", "b", "c", "d"]);
  labels("PVTI_col1", ["a", "b", "c", "d"]);
  labels("PVTI_col2", ["a", "b", "c"]);
  const { b, host } = await openBoard({ answer: JSON.stringify(data) });
  host.theme = () => copperTheme("dark");
  const root = b.render();
  // The texts of every chip a card draws (chip's rounded(9), one text), in order.
  const chipTexts = (el) => (typeof el === "string" ? [] : [...(el.with.rounded?.[0] === 9 && el.kids.length === 1 && typeof el.kids[0] === "string" ? [el.kids[0]] : []), ...el.kids.flatMap(chipTexts)]);
  const chips = (key) => chipTexts(byId(root, `card-${key}`));
  assert.deepEqual(chips("PVTI_col4"), ["Epic", "a", "b", "c"], "an Epic by its title with three more labels: no count");
  assert.deepEqual(chips("PVTI_col3"), ["Epic", "a", "b", "c", "+1"], "and with four more: one");
  assert.deepEqual(chips("PVTI_col1"), ["Bug", "a", "b", "c", "+1"], "a typed card with four labels");
  assert.deepEqual(chips("PVTI_col2"), ["Task", "a", "b", "c"], "a typed card with three");
});

test("UI: the details name the type of an Epic by its title alone", async () => {
  const { b, cx, host } = await openBoard({ answer: fixture("github-board-colors.json") });
  host.theme = () => copperTheme("light");
  await clickCard(b, cx, "PVTI_col4");
  await clickCard(b, cx, "PVTI_col4");
  assert.ok(texts(detailPanel(b)).includes("Epic"), texts(detailPanel(b)).join("|"));
});

test("UI: the Sprint draws its taskboard columns' heads opaque on its background, each task's edge in its column's color, and a selected story and task on the selected background", async () => {
  const { b, cx, host, view, st } = await openSprint({ iteration: fixture("azure-sprint-iteration.json") });
  const t = copperTheme("light");
  host.theme = () => t;
  let root = b.render();
  const [, ...cols] = b.navColumns(view);
  assert.deepEqual(cols.map((c) => c.color), ["muted", "ansi4", "ansi4", "ansi2"]);
  const heads = byId(root, "sprint-head").kids.slice(1);
  assert.deepEqual(heads.map((h) => h.with.bg[0]), cols.map((c) => board.headBg(t, c.color, t.background)));
  for (const col of cols) {
    for (const card of col.shown) assert.equal(byId(root, `card-${card.key}`).kids[0].with.bg[0], t[`copper-${COPPER_OF[col.color]}-text`], `${card.key} in ${col.name}`);
  }
  assert.ok(cols.some((c) => c.shown.length), "cards to look at");
  await click(b, cx, "card-AB#311");
  assert.equal(st().sel?.key, "AB#311");
  root = b.render();
  assert.deepEqual([byId(root, "card-AB#311").with.bg[0], byId(root, "card-AB#311").with.border_color[0]], [board.selectedBg(t), t.accent]);
  await click(b, cx, "story-AB#301");
  root = b.render();
  assert.deepEqual([byId(root, "story-AB#301").with.bg[0], byId(root, "story-AB#301").with.border_color[0]], [board.selectedBg(t), t.accent]);
  assert.deepEqual([byId(root, "card-AB#311").with.bg[0], byId(root, "card-AB#311").with.border_color[0]], [t.background, t.border]);
});

test("UI: a selected row of the Backlog and of a PR list, and a marked line of the details' related items, are on the selected background", async () => {
  const t = copperTheme("dark");
  // Its background ("none" where it sets none) and its border.
  const look = (el) => [el.styles.includes("bg") ? el.with.bg[0] : "none", el.with.border_color[0]];
  const backlog = await openBacklog();
  backlog.host.theme = () => t;
  await click(backlog.b, backlog.cx, "row-AB#401");
  assert.deepEqual(look(byId(backlog.b.render(), "row-AB#401")), [board.selectedBg(t), t.accent]);
  assert.deepEqual(look(byId(backlog.b.render(), "row-AB#402")), ["none", t.background]);
  const prs = await openBoard();
  prs.host.theme = () => t;
  await press(prs.b, prs.cx, "2");
  await prs.host.answer("gh", ok(fixture("github-list.json")));
  const [first, second] = prs.b.navColumns(prs.b.view())[0].shown;
  await click(prs.b, prs.cx, `row-${first.key}`);
  assert.deepEqual(look(byId(prs.b.render(), `row-${first.key}`)), [board.selectedBg(t), t.accent]);
  assert.deepEqual(look(byId(prs.b.render(), `row-${second.key}`)), ["none", t.background]);
  const related = await openRelated();
  related.host.theme = () => t;
  await action(related.b, related.cx, "board_tab");
  await press(related.b, related.cx, "j");
  assert.deepEqual(look(byId(detailPanel(related.b), "related-line-0")), [board.selectedBg(t), t.accent]);
  assert.deepEqual(look(byId(detailPanel(related.b), "related-line-1")), ["none", t.chrome]);
});

// The thin line across the top of a card or row in its type's color, or
// null where it has none.
const typeLine = (root, id) => byId(byId(root, id), "type-line");
// A line's color, whether it is laid over the top edge of the card or row
// `id` (absolute, at its top, which is relative), its height, and its inset
// from each side.
const lineLook = (root, id) => {
  const line = typeLine(root, id);
  return [line?.with.bg?.[0], line?.styles.includes("absolute") && byId(root, id).styles.includes("relative"), line?.with.top?.[0], line?.with.h?.[0],
    line?.with.left?.[0], line?.with.right?.[0]];
};

test("a type line's tone: an Azure type's color by hue, a GitHub issue type's by its named color (in a copper theme as its source names it, elsewhere a bright one as its plain color); none for a type without a color or an item without an issue type", () => {
  const cards = colorsBoard().columns.flatMap((c) => c.cards);
  const card = (key) => cards.find((c) => c.key === key);
  for (const [name, t, hues, named] of [
    ...COPPER.map((mode) => [`copper-${mode}`, copperTheme(mode), ["ansi1", "ansi3", "ansi4", "muted"], ["ansi1", "ansi11", "ansi2"]]),
    ...COPPER.map((mode) => [`copper-${mode} without copper's colors`, tintedCopper(mode), ["ansi1", "ansi3", "ansi4", "muted"], ["ansi1", "ansi3", "ansi2"]]),
  ]) {
    assert.deepEqual(["#cc293d", "#f2cb1d", "#009ccc", "#b2b2b2"].map((hex) => board.typeLineTone(t, azureItem(), hex)), hues, name);
    assert.equal(board.typeLineTone(t, azureItem(), "#773b93"), board.hueTone(t, "#773b93"));
    assert.equal(board.typeLineTone(t, azureItem(), undefined), null, "an Azure type without a color");
    assert.deepEqual(["PVTI_col1", "PVTI_col2", "PVTI_col5"].map((k) => board.typeLineTone(t, card(k))), named, `${name}: Bug RED, Task ORANGE, Epic GREEN`);
    assert.deepEqual(["PVTI_col3", "PVTI_col4"].map((k) => board.typeLineTone(t, card(k))), [null, null], "an Epic by its title has no issue type");
    assert.equal(board.typeLineTone(t, { ...card("PVTI_col1"), typeColor: null }), null, "an issue type without a color");
  }
});

test("UI: the Sprint draws a thin line across the top of each story and task in its type's color from the project's type definitions, by hue; a type they give no color has none", async () => {
  const { b, host, st } = await openSprint();
  const t = copperTheme("dark");
  host.theme = () => t;
  let root = b.render();
  for (const [id, color] of [["story-AB#301", "blue"], ["story-AB#302", "blue"], ["card-AB#311", "yellow"], ["card-AB#332", "red"]]) {
    assert.deepEqual(lineLook(root, id), [t[`copper-${color}-text`], true, 0, 2, 6, 6], id);
  }
  assert.equal(byId(root, "card-AB#311").kids[0].with.bg[0], t["copper-neutral-text"], "the card's edge stays first, in its column's color");
  st().data.meta.typeColors = { Task: "#f2cb1d" };
  root = b.render();
  assert.deepEqual([typeLine(root, "card-AB#332"), typeLine(root, "story-AB#301")], [null, null]);
  assert.ok(typeLine(root, "card-AB#311"));
});

test("UI: the Backlog reads the project's work item types beside its first refresh for a line across the top of each row in its type's color, and keeps them: neither its next refresh nor the project's Sprint reads them again", async () => {
  const { b, cx, host } = await openBacklog();
  const t = copperTheme("light");
  host.theme = () => t;
  const root = b.render();
  assert.deepEqual([lineLook(root, "row-AB#401"), lineLook(root, "row-AB#402")], [[t["copper-blue-text"], true, 0, 2, 0, 0], [t["copper-red-text"], true, 0, 2, 0, 0]]);
  await refreshSprint(b, cx);
  assert.deepEqual(backlogCounts(host, ["ids", "types"]), [1, 0], "a refresh reads the types no more");
  await answerBacklog(host, { me: false });
  assert.equal(lineLook(b.render(), "row-AB#402")[0], t["copper-red-text"], "it draws them from what it keeps");
  await press(b, cx, "v");
  assert.deepEqual(openCounts(host, ["iteration", "columns", "types"]), [1, 1, 0], "the Sprint of the same project reads them no more");
});

test("UI: the Backlog whose read of the work item types fails says so and draws no type lines; its next refresh asks again", async () => {
  const { b, cx, host, st } = await openBacklog({ types: azRefused("Operation returned a 403 status code.") });
  assert.deepEqual(st().warnings, ["Farben der Work-Item-Typen nicht gelesen: Operation returned a 403 status code."]);
  assert.equal(st().error, null, "the Backlog itself shows");
  host.theme = () => copperTheme("dark");
  assert.equal(typeLine(b.render(), "row-AB#401"), null);
  await refreshSprint(b, cx);
  assert.equal(backlogCounts(host, ["types"])[0], 1, "asked again");
  await answerBacklog(host, { me: false });
  assert.deepEqual(st().warnings, []);
  assert.ok(typeLine(b.render(), "row-AB#401"));
});

test("UI: a GitHub card with an issue type has a line across its top in the type's color; one without an issue type, an Epic by its title too, has none", async () => {
  const { b, host } = await openBoard({ answer: fixture("github-board-colors.json") });
  const t = copperTheme("light");
  host.theme = () => t;
  const root = b.render();
  assert.deepEqual(["PVTI_col1", "PVTI_col2", "PVTI_col5"].map((k) => lineLook(root, `card-${k}`)),
    [[t["copper-red-text"], true, 0, 2, 6, 6], [t["copper-orange-text"], true, 0, 2, 6, 6], [t["copper-green-text"], true, 0, 2, 6, 6]]);
  assert.deepEqual(["PVTI_col3", "PVTI_col4"].map((k) => typeLine(root, `card-${k}`)), [null, null]);
});

// ---- The details block's own scroll (scroll.js) ----

test("the details block's offset stays within its content; a span comes into view with the least move; the thumb shows the position; a row's place adds the rows above it", () => {
  assert.deepEqual([board.clampOffset(-5, 300, 100), board.clampOffset(250, 300, 100), board.clampOffset(80, 300, 100), board.clampOffset(40, 90, 100)], [0, 200, 80, 0]);
  const s = { offset: 50, content: 300, viewport: 100 };
  assert.deepEqual([board.offsetBy(s, 30), board.offsetBy(s, -80), board.offsetBy(s, 500)], [80, 0, 200]);
  assert.deepEqual(
    [board.revealOffset(s, 60, 20), board.revealOffset(s, 140, 30), board.revealOffset(s, 10, 20), board.revealOffset(s, 120, 150), board.revealOffset(s, 290, 30)],
    [50, 70, 10, 120, 200],
    "already shown: stays; below: to the bottom; above: to the top; taller than the window: to its top; within the content",
  );
  assert.deepEqual([board.spanShows(s, 50, 100), board.spanShows(s, 49, 10), board.spanShows(s, 140, 11), board.spanShows({ ...s, viewport: 0 }, 900, 10)], [true, false, false, true],
    "not measured yet: shown");
  assert.deepEqual([board.thumbOf(s), board.thumbOf({ ...s, offset: 0 }), board.thumbOf({ ...s, offset: 200 }), board.thumbOf({ offset: 0, content: 90, viewport: 100 })],
    [{ top: 17, height: 33 }, { top: 0, height: 33 }, { top: 67, height: 33 }, null]);
  assert.deepEqual(board.thumbOf({ offset: 0, content: 10000, viewport: 100 }), { top: 0, height: 16 }, "never thinner than 16");
  assert.deepEqual([board.thumbOf({ offset: 0, content: 300, viewport: 0 }), board.thumbOf({ offset: 0, content: 100, viewport: 100 })], [null, null],
    "a window not measured, or content as tall as it: none");
  assert.deepEqual([board.rowSpan([18, 40, 18], 0, 6, 12), board.rowSpan([18, 40, 18], 2, 6, 12)], [{ top: 12, height: 18 }, { top: 82, height: 18 }]);
});

test("UI: in the details panel ctrl-d and ctrl-u scroll the block half its window, clamped at both ends; without the panel's keyboard they do nothing; the hint names them", async () => {
  const { b, cx } = await openRelated();
  const content = layOut(b, cx, 100);
  assert.equal(content, 234);
  await press(b, cx, "d", { modifiers: { control: true } });
  assert.equal(offsetOf(b), 0, "the board has the keyboard: nothing");
  await tab(b, cx);
  assert.ok(hintKeys(b).includes("ctrl-d/u"));
  const stopped = cx.stopped;
  await press(b, cx, "d", { modifiers: { control: true } });
  assert.deepEqual([offsetOf(b), cx.stopped], [50, stopped + 1]);
  await press(b, cx, "d", { modifiers: { control: true } });
  await press(b, cx, "d", { modifiers: { control: true } });
  assert.equal(offsetOf(b), 134, "not past the bottom");
  await press(b, cx, "u", { modifiers: { control: true } });
  assert.equal(offsetOf(b), 84);
  for (let i = 0; i < 3; i++) await press(b, cx, "u", { modifiers: { control: true } });
  assert.equal(offsetOf(b), 0, "not above the top");
  await press(b, cx, ...SHIFT_G);
  await press(b, cx, "u", { modifiers: { control: true } });
  assert.equal(offsetOf(b), 84, "from the bottom G went to, which is within the content");
  await press(b, cx, "home");
  await press(b, cx, "d", { modifiers: { control: true, shift: true } });
  assert.equal(offsetOf(b), 0, "with Shift too: not the panel's");
  layOut(b, cx, 20);
  await press(b, cx, "d", { modifiers: { control: true } });
  assert.equal(offsetOf(b), 18, "a window of 20 pixels: one line, not half of it");
  assert.equal(b.panel.line, null, "the lines stay as they were");
});

test("UI: the mouse wheel scrolls the block, in the script's pixels at herdr's zoom; a thumb at the right shows where it is, none where all fits", async () => {
  const { b, cx, host } = await openRelated();
  host.theme = () => ({ muted: "#muted", border: "#border" });
  const wheel = (y) => cx.call((own) => byId(detailPanel(b), "related-window").with.on_scroll_wheel[0]({ delta: { x: 0, y } }, own));
  layOut(b, cx, 300);
  assert.equal(byId(detailPanel(b), "related-thumb"), null, "all fits: no thumb");
  wheel(-40);
  assert.equal(offsetOf(b), 0, "nothing to scroll");
  layOut(b, cx, 100);
  wheel(-40);
  assert.equal(offsetOf(b), 40, "down");
  wheel(15);
  assert.equal(offsetOf(b), 25, "up");
  const thumb = byId(detailPanel(b), "related-thumb");
  assert.deepEqual([thumb.with.top[0], thumb.with.h[0], thumb.with.w[0], thumb.styles.includes("absolute"), thumb.with.bg[0]], [11, 43, 3, true, "#muted"]);
  assert.equal(thumb.with.on_mouse_down, undefined, "nothing to drag");
  host.settings = () => ({ zoom: 2 });
  layOut(b, cx, 200, { rowH: 36 });
  assert.deepEqual([b.relatedUi.viewport, b.relatedUi.content], [100, 198], "measured at zoom 2: halved");
  wheel(-40);
  assert.equal(offsetOf(b), 45, "a wheel's 40 pixels at zoom 2 are 20");
});

test("UI: a resize or a refresh that shrinks the block keeps its offset within it; another item's details start at the top", async () => {
  const { b, cx, host, st } = await openRelated();
  layOut(b, cx, 100);
  await tab(b, cx);
  await press(b, cx, ...SHIFT_G);
  assert.equal(offsetOf(b), 134);
  layOut(b, cx, 200);
  assert.equal(offsetOf(b), 34, "a taller window: the content's end at its bottom");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  await answerRelated(host, ok(relatedAnswer()));
  assert.equal(layOut(b, cx, 200), 114);
  assert.equal(offsetOf(b), 0, "less content after the refresh: within it");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  await answerRelated(host, ok(fixture("github-related.json")));
  layOut(b, cx, 100);
  await press(b, cx, ...SHIFT_G);
  assert.equal(offsetOf(b), 134);
  await press(b, cx, "escape");
  await press(b, cx, "j");
  assert.equal(st().sel.key, "PVTI_rec5");
  assert.equal(offsetOf(b), 0, "another item: the top");
});

test("UI: the details' window keeps the height of its space wherever the block is scrolled: at its end, after a refresh that shrinks the content and in a taller space", async () => {
  const { b, cx, host } = await openRelated();
  const shown = () => [b.relatedUi.viewport, offsetOf(b)];
  assert.equal(layOutIn(b, cx, 100), 234);
  await tab(b, cx);
  for (let i = 0; i < 12; i++) {
    await press(b, cx, "j");
    layOutIn(b, cx, 100);
  }
  assert.deepEqual(shown(), [100, 122], "j to the last line: the window as tall as its space");
  for (let i = 0; i < 3; i++) {
    cx.call((own) => byId(detailPanel(b), "related-window").with.on_scroll_wheel[0]({ delta: { x: 0, y: -40 } }, own));
    layOutIn(b, cx, 100);
  }
  assert.deepEqual(shown(), [100, 134], "the wheel to the end and past it: still");
  layOutIn(b, cx, 200);
  layOutIn(b, cx, 200);
  assert.deepEqual(shown(), [200, 34], "a taller space: the window grows into it");
  layOutIn(b, cx, 100);
  await press(b, cx, ...SHIFT_G);
  layOutIn(b, cx, 100);
  assert.deepEqual(shown(), [100, 134], "the space as before, G: the end");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  await answerRelated(host, ok(relatedAnswer()));
  assert.equal(layOutIn(b, cx, 100), 114);
  layOutIn(b, cx, 100);
  assert.deepEqual(shown(), [100, 14], "less content after the refresh: the window stays as tall, the offset within the content");
});

// ---- gg, G, Home and End ----

// G as herdr sends it: g with Shift.
const SHIFT_G = ["g", { char: "G", modifiers: { shift: true } }];

test("gg, G, Home and End name an end; a first g waits for a second; with Control, Alt or the platform key they are no ends", () => {
  const none = {};
  assert.deepEqual(
    [board.edgeKey("home", "", none, false), board.edgeKey("end", "", none, false), board.edgeKey("g", "G", { shift: true }, false)],
    ["top", "bottom", "bottom"],
  );
  assert.deepEqual([board.edgeKey("g", "G", none, false), board.edgeKey("g", "G", none, true)], ["pending", "top"], "Caps Lock: g, then gg, no G");
  assert.deepEqual([board.edgeKey("g", "g", none, false), board.edgeKey("g", "g", none, true)], ["pending", "top"], "g, then gg");
  assert.deepEqual([board.edgeKey("g", "g", { shift: true }, true), board.edgeKey("j", "j", none, true)], ["bottom", null], "G after a g is G; another key is none");
  for (const mod of [{ control: true }, { alt: true }, { platform: true }]) {
    assert.deepEqual(["home", "end", "g"].map((k) => board.edgeKey(k, k, mod, true)), [null, null, null], JSON.stringify(mod));
  }
  const cols = board.shownColumns(githubBoard(), "");
  assert.deepEqual(board.edgeOf(cols, { col: 1, key: "PVTI_rec2" }, "top"), { col: 1, key: "PVTI_rec1" });
  assert.deepEqual(board.edgeOf(cols, { col: 1, key: "PVTI_rec2" }, "bottom"), { col: 1, key: "PVTI_rec3" });
  assert.deepEqual([board.edgeOf(cols, { col: 2, key: null }, "top"), board.edgeOf(cols, null, "bottom"), board.edgeOf([], { col: 0, key: null }, "top")], [null, null, null],
    "an empty column, no selection, no columns: none");
});

test("UI: on a board gg and Home go to the first card of the selected column, G and End to its last; a g before another key does nothing", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "l");
  assert.equal(st().sel.key, "PVTI_rec1");
  await press(b, cx, "g", { char: "G", modifiers: { shift: true } });
  assert.deepEqual(st().sel, { col: 1, key: "PVTI_rec3" }, "G");
  await press(b, cx, "g");
  assert.equal(st().sel.key, "PVTI_rec3", "one g moves nothing");
  await press(b, cx, "g");
  assert.deepEqual([st().sel, st().picked], [{ col: 1, key: "PVTI_rec1" }, "PVTI_rec1"], "gg, chosen as the keys choose");
  await press(b, cx, "end");
  assert.equal(st().sel.key, "PVTI_rec3", "End");
  await press(b, cx, "home");
  assert.equal(st().sel.key, "PVTI_rec1", "Home");
  await press(b, cx, "g");
  await press(b, cx, "j");
  await press(b, cx, "g");
  assert.equal(st().sel.key, "PVTI_rec2", "g, j, g: j moved, no gg");
  await press(b, cx, "x", { modifiers: { control: true } });
  await press(b, cx, "g");
  assert.equal(st().sel.key, "PVTI_rec2", "a key between the two g drops the first");

  await press(b, cx, "end", { modifiers: { control: true } });
  assert.equal(st().sel.key, "PVTI_rec2", "with Control End is not the board's");
  await press(b, cx, "l");
  await press(b, cx, ...SHIFT_G);
  assert.deepEqual(st().sel, { col: 2, key: null }, "an empty column stays selected as such");
});

test("UI: gg, G, Home and End before a view's data came do nothing", async () => {
  const { b, cx, st } = await bootBoard();
  for (const k of ["home", "end"]) await press(b, cx, k);
  await press(b, cx, ...SHIFT_G);
  await press(b, cx, "g");
  await press(b, cx, "g");
  assert.deepEqual([st().data, st().sel], [null, null]);
});

test("UI: a Tab the board takes as its action between two g drops the first", async () => {
  const { b, cx, st } = await openRelated();
  await press(b, cx, "j");
  assert.equal(st().sel.key, "PVTI_rec5");
  await press(b, cx, "g");
  await action(b, cx, "board_tab");
  await action(b, cx, "board_shift_tab");
  await press(b, cx, "g");
  assert.equal(st().sel.key, "PVTI_rec5", "no gg: the column's first card is PVTI_rec4");
  await press(b, cx, "g");
  assert.equal(st().sel.key, "PVTI_rec4", "a gg after it");
});

test("UI: in the Backlog and a PR list gg and G go to the first and last row; on a Sprint to the first and last item of the column", async () => {
  const backlog = await openBacklog();
  const rows = backlog.b.navColumns(backlog.view)[0].shown.map((r) => r.key);
  await press(backlog.b, backlog.cx, "end");
  assert.equal(backlog.st().sel.key, rows.at(-1));
  await press(backlog.b, backlog.cx, "g");
  await press(backlog.b, backlog.cx, "g");
  assert.equal(backlog.st().sel.key, rows[0]);
  const prs = await openBoard();
  await press(prs.b, prs.cx, "2");
  await prs.host.answer("gh", ok(fixture("github-list.json")));
  const prRows = prs.b.navColumns(prs.b.view())[0].shown.map((r) => r.key);
  assert.ok(prRows.length > 2);
  await press(prs.b, prs.cx, ...SHIFT_G);
  assert.equal(prs.b.views.prs.sel.key, prRows.at(-1));
  await press(prs.b, prs.cx, "home");
  assert.equal(prs.b.views.prs.sel.key, prRows[0]);
  const sprint = await openSprint();
  await press(sprint.b, sprint.cx, "end");
  assert.deepEqual(sprint.st().sel, { col: 0, key: "AB#302" }, "the last story");
  await press(sprint.b, sprint.cx, "l");
  await press(sprint.b, sprint.cx, "g");
  await press(sprint.b, sprint.cx, "g");
  assert.deepEqual(sprint.st().sel, { col: 4, key: "AB#321" }, "Done holds one");
  await press(sprint.b, sprint.cx, "h");
  await press(sprint.b, sprint.cx, "k");
  await press(sprint.b, sprint.cx, "l");
  await press(sprint.b, sprint.cx, "end");
  assert.deepEqual(sprint.st().sel, { col: 1, key: "AB#311" }, "the last task of To Do");
  await press(sprint.b, sprint.cx, "home");
  assert.deepEqual(sprint.st().sel, { col: 1, key: "AB#331" });
});

test("UI: while the details panel has the keyboard gg and Home go to its top with no line selected, G and End to its bottom on its last line; the hint names them", async () => {
  const { b, cx, st, host } = await openRelated();
  await tab(b, cx);
  assert.ok(hintKeys(b).includes("gg/G"), "the panel's hint");
  const content = layOut(b, cx, 60);
  await press(b, cx, ...SHIFT_G);
  assert.deepEqual([b.panel.line, offsetOf(b), st().sel.key], [4, content - 60, "PVTI_rec4"], "the last line, the block's bottom; the board's selection stays");
  await press(b, cx, "g");
  await press(b, cx, "g");
  assert.deepEqual([b.panel.line, offsetOf(b)], [null, 0]);
  await press(b, cx, "end");
  assert.deepEqual([b.panel.line, offsetOf(b)], [4, content - 60]);
  await press(b, cx, "home");
  assert.deepEqual([b.panel.line, offsetOf(b)], [null, 0]);
  await press(b, cx, "r");
  assert.equal(layOut(b, cx, 60), 114);
  await press(b, cx, "end");
  assert.deepEqual([b.panel.line, offsetOf(b)], [null, 54], "while the related items load: no line, the block's bottom");
});

// ---- The command menu (`:`) and the action table ----

// The command menu's headings as it draws them now.
const menuHeads = (b) => (byId(b.render(), "commands-rows")?.kids ?? []).filter((k) => /^commands-head-/.test(k.with?.id?.[0] ?? "")).map((k) => texts(k)[0]);

test("UI: `:` opens the command menu over a GitHub card: what can run on the card, on its view and on the board, under a heading each, with its key at the right where that key runs it now", async () => {
  const { b, cx } = await openBoard();
  const stopped = cx.stopped;
  const entries = await openMenu(b, cx);
  assert.equal(cx.stopped, stopped + 1, "`:` is taken");
  assert.deepEqual(entries, [
    ["Details zeigen", "Enter"], ["Status ändern…", "s"], ["Zuweisen…", "a"], ["Nach links verschieben", "H"], ["Nach rechts verschieben", "L"], ["Im Browser öffnen", "o"],
    ["Spalte ausblenden: Ready", null], ["Spalten…", null],
    ["Nur meine an", "m"], ["Filter", "/"], ["Neu laden", "r"], ["Tab 2: PRs", "2"], ["Tab 3: Other", "3"], ["Nächster Tab", "]"], ["Vorheriger Tab", "["],
    ["Quelle wechseln: Azure", null],
  ]);
  assert.deepEqual(menuHeads(b), ["Issue tender#3004 · feat(api): page through long lists", "Mine", "Board"], "the window's ten rows: three groups");
  const menuEl = byId(b.render(), "commands-menu");
  assert.ok(texts(menuEl).includes("Befehle · ↑↓ Enter · Esc"));
  assert.deepEqual([b.modal.inputFocused, b.modal.at], [true, 0], "the filter has the keyboard, the first row is marked");
  const first = byId(b.render(), "command-0");
  assert.deepEqual([first.styles.includes("bg"), texts(first.kids.at(-1)), first.kids.at(-1).styles.includes("flex_none")], [true, ["Enter"], true], "marked, its key last, at the right");
  assert.equal(texts(byId(b.render(), "command-6")).length, 1, "a row without a key shows none");
});

test("UI: the command menu in the details and in their panel: the second Enter's action; the description's fold, and with a line selected the line's actions take Enter and o", async () => {
  const { b, cx } = await openRelated();
  assert.deepEqual((await openMenu(b, cx)).slice(0, 2), [["Agent starten…", "Enter"], ["Status ändern…", "s"]]);
  await press(b, cx, "escape");
  sizeDescription(b, cx, 500);
  const fold = (await openMenu(b, cx)).filter(([name]) => name.startsWith("Beschreibung"));
  assert.deepEqual(fold, [["Beschreibung mehr", "z"]], "a GitHub board folds nothing of its own: z is the description's");
  assert.ok(menuHeads(b).includes("Detailfenster · tender#3004 feat(api): page through long lists"));
  await press(b, cx, "escape");
  await tab(b, cx);
  layOut(b, cx, 400);
  await press(b, cx, "j");
  assert.equal(b.panel.line, 0);
  const entries = await openMenu(b, cx);
  assert.deepEqual(entries.slice(0, 10), [
    ["Agent starten…", null], ["Status ändern…", "s"], ["Zuweisen…", "a"], ["Nach links verschieben", "H"], ["Nach rechts verschieben", "L"], ["Im Browser öffnen", null],
    ["Beschreibung mehr", "z"], ["Zeile im Detailfenster zeigen", "Enter"], ["Zeile auf dem Board", null], ["Zeile im Browser öffnen", "o"],
  ], "Enter and o are the line's: the card's own run from the menu, without a key; the line's place on the board from the menu alone");
});

test("UI: the command menu on a Sprint: on a story its fold and no move, on a task its moves; the view's switch; on the Backlog the create; on the PR list and the PR view to come only what they have", async () => {
  const sprint = await openSprint();
  let entries = await openMenu(sprint.b, sprint.cx);
  assert.deepEqual(entries.map(([name, key]) => `${name}${key ? ` (${key})` : ""}`), [
    "Details zeigen (Enter)", "Status ändern… (s)", "Zuweisen… (a)", "Im Browser öffnen (o)", "Story zu-/aufklappen (z)",
    "Ansicht wechseln: Backlog (v)",
    "Nur meine an (m)", "Filter (/)", "Neu laden (r)", "Tab 2: PRs · Example Project (2)", "Nächster Tab (])", "Vorheriger Tab ([)", "Quelle wechseln: GitHub",
  ]);
  assert.deepEqual(menuHeads(sprint.b), ["User Story AB#301 · Import the sample catalogue", "Sprint", "Board"]);
  await press(sprint.b, sprint.cx, "escape");
  await click(sprint.b, sprint.cx, "card-AB#311");
  entries = await openMenu(sprint.b, sprint.cx);
  assert.deepEqual(entries.slice(0, 6).map(([name]) => name), ["Details zeigen", "Status ändern…", "Zuweisen…", "Nach rechts verschieben", "Im Browser öffnen", "Story zu-/aufklappen"],
    "a task in To Do, its type's first column, moves only right");
  await press(sprint.b, sprint.cx, "escape");
  await click(sprint.b, sprint.cx, "card-AB#312");
  entries = await openMenu(sprint.b, sprint.cx);
  assert.deepEqual(entries.filter(([name]) => name.endsWith("verschieben")), [["Nach links verschieben", "H"], ["Nach rechts verschieben", "L"]], "one in In Progress both ways");
  const backlog = await openBacklog();
  entries = await openMenu(backlog.b, backlog.cx);
  assert.ok(entries.some(([name, key]) => name === "Neu…" && key === "n"));
  assert.ok(entries.some(([name, key]) => name === "Ansicht wechseln: Sprint" && key === "v"));
  assert.equal(entries.some(([name]) => /verschieben|Spalte|Story/.test(name)), false);
  const list = await openBoard();
  await press(list.b, list.cx, "2");
  await list.host.answer("gh", ok(fixture("github-list.json")));
  entries = await openMenu(list.b, list.cx);
  assert.deepEqual(entries.slice(0, 2), [["Details zeigen", "Enter"], ["Im Browser öffnen", "o"]]);
  assert.equal(entries.some(([name]) => /Status|Zuweisen|verschieben|Spalte|Neu…/.test(name)), false);
  const coming = await bootBoard({ stored: { source: "azure" } });
  await press(coming.b, coming.cx, "2");
  assert.deepEqual((await openMenu(coming.b, coming.cx)).map(([name]) => name), ["Nur meine an", "Filter", "Neu laden", "Tab 1: Example Team", "Nächster Tab", "Vorheriger Tab", "Quelle wechseln: GitHub"]);
  const broken = await bootBoard({ config: "{" });
  assert.deepEqual(await openMenu(broken.b, broken.cx), [["Filter", "/"], ["Neu laden", "r"]], "no valid views.json: only the filter and a reload");
});

test("the command menu's filter: the letters in their order, a word's start and letters in a row first, of all fits the best; a tie to the shorter name, then the list's order (fuzzyRank, fuzzyMatch)", () => {
  const names = ["Status ändern…", "Zuweisen…", "Story zu-/aufklappen", "Spalte ausblenden: Ready", "Spalten…", "Nach links verschieben", "Neu laden", "Nur meine an"];
  const rank = (q, list = names) => board.fuzzyRank(list, q, (n) => n).map((r) => r.entry);
  assert.deepEqual(rank(""), names, "no filter: the list as it is");
  assert.deepEqual(rank("  "), names, "nor spaces alone");
  assert.deepEqual(board.fuzzyRank(names, "zuw", (n) => n), [{ entry: "Zuweisen…", at: [0, 1, 2] }], "each with where its letters stand");
  assert.deepEqual(rank("zuw"), ["Zuweisen…"]);
  assert.deepEqual(rank("ZU"), ["Zuweisen…", "Story zu-/aufklappen"], "case-insensitive; the text's first letter first");
  assert.deepEqual(rank("spa"), ["Spalte ausblenden: Ready", "Spalten…"], "a word's start beats letters in a row");
  assert.deepEqual(rank("spal"), ["Spalten…", "Spalte ausblenden: Ready"], "a tie: the shorter name");
  assert.deepEqual(rank("n l"), ["Neu laden", "Nach links verschieben"], "spaces left out");
  assert.deepEqual(rank("zu w"), ["Zuweisen…"], "also where the name has none");
  assert.deepEqual(rank("uz"), [], "the letters in their order");
  assert.deepEqual(rank("tb", ["Tabelle", "Tab bearbeiten"]), ["Tab bearbeiten", "Tabelle"], "a word's start before a shorter name");
  assert.deepEqual(rank("ei", ["xexxi", "xxxeix"]), ["xxxeix", "xexxi"], "letters in a row before a shorter name");
  assert.deepEqual(rank("ab", ["yayb", "xaxxxab"]), ["xaxxxab", "yayb"], "the best fit counts, not the first");
  const twins = [{ n: "Neu", i: 0 }, { n: "Neu", i: 1 }];
  assert.deepEqual(board.fuzzyRank(twins, "n", (e) => e.n).map((r) => r.entry.i), [0, 1], "then the list's order");
  assert.deepEqual(board.fuzzyMatch("Spalte ausblenden", "sa"), { score: 20, at: [0, 7] });
  assert.deepEqual(board.fuzzyMatch("xaxxxab", "ab"), { score: 6, at: [5, 6] });
  assert.deepEqual([board.fuzzyMatch("Neu", ""), board.fuzzyMatch("Neu", "q")], [{ score: 0, at: [] }, null]);
});

test("UI: typing in the command menu narrows it, best first, each group after its best; the letters found in the accent color", async () => {
  const { b, cx, host } = await openBoard();
  host.theme = () => ({ accent: "#accent", foreground: "#fg" });
  await openMenu(b, cx);
  b.modal.input.type("zuw");
  assert.deepEqual(menuEntries(b), [["Zuweisen…", "a"]]);
  assert.equal(b.modal.at, 0);
  const runs = byId(b.render(), "command-0").kids[0].kids.map((k) => [texts(k)[0], k.with.text_color[0]]);
  assert.deepEqual(runs, [["Zuw", "#accent"], ["eisen…", "#fg"]]);
  b.modal.input.type("ne");
  assert.deepEqual(menuEntries(b).slice(0, 5).map(([name]) => name), ["Neu laden", "Nur meine an", "Nächster Tab", "Quelle wechseln: Azure", "Nach links verschieben"],
    "the board's best first, then the rest of its group, then the next group's best");
  b.modal.input.type("qqq");
  assert.deepEqual([menuEntries(b), b.modal.at], [[], -1]);
  assert.ok(texts(byId(b.render(), "commands-menu")).includes("Kein Befehl passt zum Filter"));
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.equal(b.modal?.kind, "commands", "Enter with nothing marked runs nothing");
});

test("UI: in the command menu ↑/↓, ctrl-j/k and ctrl-n/p mark a row, bare j and k are the filter's; Enter or a click runs one, Esc closes it and runs nothing", async () => {
  const { b, cx, host } = await openBoard();
  await openMenu(b, cx);
  const m = b.modal;
  for (const [k, control, at] of [["down", false, 1], ["j", true, 2], ["n", true, 3], ["up", false, 2], ["k", true, 1], ["p", true, 0], ["up", false, 0]]) {
    await press(b, cx, k, { modifiers: { control } });
    assert.equal(m.at, at, `${control ? "ctrl-" : ""}${k}`);
  }
  const stopped = cx.stopped;
  for (const k of ["j", "k", "2", "q"]) await press(b, cx, k);
  assert.deepEqual([m.at, cx.stopped, b.context().id], [0, stopped, "github:mine"], "typed, not taken: no tab switched");
  for (let i = 0; i < 30; i++) await press(b, cx, "down");
  assert.equal(m.at, menuEntries(b).length - 1, "down stops at the last row");
  await press(b, cx, "escape");
  assert.deepEqual([b.modal, host.open("gh").length], [null, 0], "Esc closes, nothing ran");
  await openMenu(b, cx);
  await press(b, cx, "down");
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.equal(b.modal?.kind, "status", "Enter ran Status ändern…");
  await press(b, cx, "escape");
  await openMenu(b, cx);
  await click(b, cx, "command-5");
  assert.deepEqual([b.modal, cx.opened], [null, ["https://github.com/example/tender/issues/3004"]], "a click ran Im Browser öffnen");
});

test("UI: the command menu shows ten rows, its window follows the mark and the mouse wheel moves it, in the script's pixels at herdr's zoom; a thumb and „↓ N weitere“ say there are more", async () => {
  const { b, cx, host } = await openBoard();
  host.theme = () => ({ muted: "#muted" });
  await openMenu(b, cx);
  const count = menuEntries(b).length;
  assert.equal(count, 16);
  const drawn = () => byId(b.render(), "commands-rows").kids.map((k) => k.with.id[0]).filter((id) => id.startsWith("command-"));
  const wheel = (y) => cx.call((own) => byId(b.render(), "commands-rows").with.on_scroll_wheel[0]({ delta: { x: 0, y } }, own));
  assert.deepEqual(drawn(), Array.from({ length: 10 }, (_, i) => `command-${i}`));
  const thumb = () => byId(b.render(), "commands-thumb");
  assert.deepEqual([thumb().with.top[0], thumb().with.h[0], thumb().styles.includes("absolute"), thumb().with.bg[0]], ["0.00%", "62.50%", true, "#muted"]);
  assert.deepEqual(texts(byId(b.render(), "commands-below")), ["↓ 6 weitere"]);
  wheel(-27);
  assert.equal(b.modal.top, 0, "less than a row's 28 pixels: not yet");
  wheel(-1);
  assert.deepEqual([b.modal.top, b.modal.at], [1, 0], "a row's worth down: the window moves, the mark stays");
  assert.equal(drawn()[0], "command-1");
  assert.equal(thumb().with.top[0], "6.25%");
  assert.deepEqual(texts(byId(b.render(), "commands-below")), ["↓ 5 weitere"]);
  wheel(-1000);
  assert.equal(b.modal.top, 6, "no further than the last row");
  assert.equal(byId(b.render(), "commands-below"), null, "nothing more below");
  wheel(56);
  assert.equal(b.modal.top, 4, "up");
  host.settings = () => ({ zoom: 2 });
  wheel(56);
  assert.equal(b.modal.top, 3, "at zoom 2 a wheel's 56 pixels are 28");
  await press(b, cx, "up");
  assert.deepEqual([b.modal.at, b.modal.top], [0, 0], "a key brings the window to the mark");
  for (let i = 0; i < 12; i++) await press(b, cx, "down");
  assert.deepEqual([b.modal.at, b.modal.top], [12, 3], "the window follows the mark");
  assert.deepEqual(drawn()[0], "command-3");
  assert.deepEqual(menuHeads(b), ["Issue tender#3004 · feat(api): page through long lists", "Mine", "Board"], "a window that starts inside a group names it at its top");
  b.modal.input.type("neu");
  assert.deepEqual([b.modal.top, byId(b.render(), "commands-thumb")], [0, null], "a filter starts at the top; all fits, no thumb");
});

test("UI: the assignee picker's window moves with the mouse wheel too, the mark staying; a thumb and „↓ N weitere“ say there are more", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "a");
  const many = json("github-assignable.json");
  many.data.repository.assignableUsers.nodes.push(...Array.from({ length: 10 }, (_, i) => ({ id: `U_more${i}`, login: `more-${i}`, name: `Zed ${i}` })));
  await host.answer("gh", ok(JSON.stringify(many)), isAssignableCall);
  const at = b.modal.at;
  assert.deepEqual(texts(byId(b.render(), "assign-below")), ["↓ 4 weitere"]);
  assert.ok(byId(b.render(), "assign-thumb"));
  cx.call((own) => byId(b.render(), "assign-rows").with.on_scroll_wheel[0]({ delta: { x: 0, y: -84 } }, own));
  assert.deepEqual([b.modal.top, b.modal.at], [3, at]);
  assert.equal(byId(b.render(), "assign-row-0"), null);
  assert.ok(byId(b.render(), "assign-row-12"));
  assert.deepEqual(texts(byId(b.render(), "assign-below")), ["↓ 1 weitere"]);
});

// What an action did, as far as a test can see it: the source, tab and
// view, nur meine, the filter, the dialog, the notice, the view's
// selection, details and folds, the details panel and its fold, the pages
// opened, the open calls, herdr's runs and toasts.
function effectOf(b, cx, host) {
  const view = b.view();
  const st = view ? b.state(view.id) : null;
  return JSON.stringify({
    source: b.source()?.id, tab: b.context()?.id, view: view?.id, mine: b.mine, filtering: b.filtering, modal: b.modal?.kind ?? null, notice: b.notice?.text ?? null,
    sel: st?.sel ?? null, detail: st?.detail ?? null, folds: st?.folds ?? null, panel: b.panel, unfolded: b.relatedUi.unfolded,
    opened: cx.opened ?? [], open: host.calls.filter((c) => !c.done).map((c) => [c.tool, ...c.args].join(" ")), runs: host.runs, notes: host.notes.length,
  });
}

// testConfig with nine GitHub lists, one tab each.
function nineTabs() {
  const config = JSON.parse(testConfig());
  config.sources.github.views = Array.from({ length: 9 }, (_, i) => ({ id: `v${i + 1}`, name: `V${i + 1}`, source: "github", layout: "list", sections: [{ name: "S", query: "is:pr author:@me" }] }));
  return JSON.stringify(config);
}
// A board on nine tabs, `shown` the one shown.
const onNineTabs = (shown) => () => bootBoard({ config: nineTabs(), stored: { source: "github", "tab:github": `github:v${shown}` } });
// The details panel with the keyboard on its first line.
async function onFirstLine() {
  const opened = await openRelated();
  await tab(opened.b, opened.cx);
  layOut(opened.b, opened.cx, 400);
  await press(opened.b, opened.cx, "j");
  return opened;
}
// The details panel a level down: Enter on its second line (tender#3010,
// not on the board), its related items read (two sub-issues), no line
// selected there.
async function onLevel() {
  const opened = await onFirstLine();
  await press(opened.b, opened.cx, "j");
  await press(opened.b, opened.cx, "enter");
  await answerRelated(opened.host, ok(relatedAnswer({ n: 2 })));
  return opened;
}
// Each action the menu lists that has a key: where it can run, and its
// key as pressed.
const KEYED = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`tab-${n}`, { open: onNineTabs(n === 1 ? 9 : 1), key: [String(n)] }])),
  "tab-next": { open: openBoard, key: ["]"] },
  "tab-previous": { open: openBoard, key: ["["] },
  "team-view": { open: () => bootBoard({ stored: { source: "azure" } }), key: ["v"] },
  "move-left": { open: openBoard, key: ["h", { char: "H", modifiers: { shift: true } }] },
  "move-right": { open: openBoard, key: ["l", shiftL] },
  create: { open: openBacklog, key: ["n"] },
  status: { open: openBoard, key: ["s"] },
  assign: { open: openBoard, key: ["a"] },
  "fold-story": { open: openSprint, key: ["z"] },
  details: { open: openBoard, key: ["enter"] },
  start: {
    open: async () => {
      const opened = await openBoard();
      await press(opened.b, opened.cx, "enter");
      return opened;
    },
    key: ["enter"],
  },
  open: { open: openBoard, key: ["o"] },
  "fold-description": {
    open: async () => {
      const opened = await openRelated();
      sizeDescription(opened.b, opened.cx, 500);
      return opened;
    },
    key: ["z"],
  },
  "line-details": { open: onFirstLine, key: ["enter"] },
  "line-open": { open: onFirstLine, key: ["o"] },
  "level-start": { open: onLevel, key: ["enter"] },
  "level-open": { open: onLevel, key: ["o"] },
  mine: { open: openBoard, key: ["m"] },
  filter: { open: openBoard, key: ["/"] },
  reload: { open: openBoard, key: ["r"] },
};

test("UI: every action of the action table the menu lists with a key runs from the menu what its key runs, and the menu shows that key beside it", async () => {
  const keyed = board.ACTIONS.filter((a) => a.run && a.key && a.menu).map((a) => a.id);
  assert.deepEqual(Object.keys(KEYED).sort(), [...keyed].sort(), "each such action has its case here");
  for (const id of keyed) {
    const { open, key: [k, extra] } = KEYED[id];
    const byKey = await open();
    const before = effectOf(byKey.b, byKey.cx, byKey.host);
    const stopped = byKey.cx.stopped;
    await press(byKey.b, byKey.cx, k, extra);
    const keyed = effectOf(byKey.b, byKey.cx, byKey.host);
    assert.notEqual(keyed, before, `${id}: its key does something`);
    assert.equal(byKey.cx.stopped, stopped + 1, `${id}: its key is taken`);
    const byMenu = await open();
    const entries = board.shownCommands((await openMenu(byMenu.b, byMenu.cx), byMenu.b.modal.entries), "");
    const at = entries.findIndex((e) => e.action.id === id);
    assert.ok(at >= 0, `${id}: in the menu`);
    const action = entries[at].action;
    assert.equal(entries[at].key, action.key === "enter" ? "Enter" : action.key, `${id}: its key beside it`);
    for (let i = 0; i < at; i++) await press(byMenu.b, byMenu.cx, "down");
    byMenu.cx.call((own) => byMenu.b.modal.input.submit(own));
    await settle();
    assert.equal(effectOf(byMenu.b, byMenu.cx, byMenu.host), keyed, `${id}: the menu runs what the key runs`);
  }
});

test("UI: the actions without a key run from the menu: the source switch as a click on its name does, the column menu, a column hidden", async () => {
  const viaClick = await openBoard();
  await click(viaClick.b, viaClick.cx, "source-azure");
  const clicked = effectOf(viaClick.b, viaClick.cx, viaClick.host);
  const { b, cx, host, st } = await openBoard();
  await runCommand(b, cx, "Quelle wechseln: Azure");
  assert.equal(effectOf(b, cx, host), clicked, "the source's name in the top bar");
  await runCommand(b, cx, "Quelle wechseln: GitHub");
  await runCommand(b, cx, "Spalten…");
  assert.deepEqual([b.modal?.kind, b.modal.at], ["columns", 0]);
  await press(b, cx, "escape");
  await runCommand(b, cx, "Spalte ausblenden: Ready");
  assert.equal(st().hidden.has("Ready"), true);
  assert.equal(host.open("gh").length, 1, "and the board refreshes");
});

test("UI: q, x, X and e are no keys any more, and Shift+S, N and O are no s, n and o: on a card, in its details and in the details panel they do nothing and are not taken", async () => {
  const shift = (k) => [k, { char: k.toUpperCase(), modifiers: { shift: true } }];
  const removed = [["q"], ["x"], shift("x"), ["e"], shift("q"), shift("s"), shift("n"), shift("o")];
  const places = {
    onCard: openBoard,
    inDetails: async () => {
      const opened = await openRelated();
      sizeDescription(opened.b, opened.cx, 500);
      return opened;
    },
    inPanel: async () => {
      const opened = await openRelated();
      sizeDescription(opened.b, opened.cx, 500);
      await tab(opened.b, opened.cx);
      return opened;
    },
  };
  for (const [where, open] of Object.entries(places)) {
    const { b, cx, host } = await open();
    const before = effectOf(b, cx, host);
    const stopped = cx.stopped;
    for (const [k, extra] of removed) await press(b, cx, k, extra);
    assert.deepEqual([effectOf(b, cx, host), cx.stopped], [before, stopped], where);
  }
});

test("UI: on a Sprint z folds the selected story while the board has the keyboard and the description while the details panel has it; the hints and the menu say which", async () => {
  const { b, cx, host, st } = await openSprint();
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  sizeDescription(b, cx, 500);
  const hintOf = (name) => b.render().kids.at(-1).kids.map((h) => texts(h)).filter((t) => t[0] === name).map((t) => t[1]);
  const folds = (entries) => entries.filter(([name]) => /^(Story|Beschreibung)/.test(name));
  assert.deepEqual(hintOf("z"), ["Story zuklappen"]);
  assert.deepEqual(texts(byId(detailPanel(b), "description-fold")), ["… mehr"], "z is the story's here: the switch names no key");
  assert.deepEqual(folds(await openMenu(b, cx)), [["Story zu-/aufklappen", "z"], ["Beschreibung mehr", null]]);
  await press(b, cx, "escape");
  await press(b, cx, "z");
  assert.ok(byId(b.render(), "folded-AB#301"), "the story folded");
  assert.equal(b.relatedUi.unfolded, null, "the description not");
  await press(b, cx, "z");
  assert.equal(byId(b.render(), "folded-AB#301"), null);
  await tab(b, cx);
  assert.deepEqual(hintOf("z"), ["mehr"]);
  assert.deepEqual(folds(await openMenu(b, cx)), [["Story zu-/aufklappen", null], ["Beschreibung mehr", "z"]]);
  await press(b, cx, "escape");
  await press(b, cx, "z");
  assert.equal(b.relatedUi.unfolded, "AB#301", "the description unfolded");
  assert.equal(byId(b.render(), "folded-AB#301"), null, "the story not folded");
  assert.deepEqual(texts(byId(detailPanel(b), "description-fold")), ["weniger (z)"]);
  assert.deepEqual(hintOf(":"), ["Befehle"]);
});

test("UI: the command menu opens on the selection the board keeps, as a key runs, and runs an action only where it still can", async () => {
  const byKey = await openBoard();
  byKey.b.filterText = "BUG input";
  await press(byKey.b, byKey.cx, "o");
  const { b, cx, st } = await openBoard();
  b.filterText = "BUG input";
  await openMenu(b, cx);
  assert.equal(st().sel.key, "PVTI_rec6", "the card the filter leaves");
  b.modal.input.type("Im Browser");
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual(cx.opened, byKey.cx.opened, "as o opens it");
  assert.notDeepEqual(cx.opened, ["https://github.com/example/tender/issues/3004"]);
  await openMenu(b, cx);
  b.modal.input.type("Details zeigen");
  st().detail = true;
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual([b.modal, b.notice?.text], [null, "„Details zeigen“ geht hier nicht mehr"], "the details opened since: the first Enter's action runs no more, nor the second's, and the menu says so");
});

test("UI: a letter key goes by Shift alone: with Caps Lock s is s, and Shift with a character that comes without it is the upper case key", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "s", { char: "S" });
  assert.equal(b.modal?.kind, "status", "Caps Lock: s");
  await press(b, cx, "escape");
  await press(b, cx, "l", { char: "l", modifiers: { shift: true } });
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "In progress", "Shift and l: L");
});

test("UI: the command menu runs an action only on what it opened for: after a refresh that dropped the card, or another column selected, it says so and runs nothing; a reload of views.json without its view closes it", async () => {
  const { b, cx, host, st } = await openBoard();
  await openMenu(b, cx);
  b.modal.input.type("Status");
  const gone = json("github-board.json");
  gone.data.repositoryOwner.projectV2.items.nodes = gone.data.repositoryOwner.projectV2.items.nodes.filter((n) => n.id !== "PVTI_rec4");
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(JSON.stringify(gone)), isBoardCall);
  assert.deepEqual([b.modal?.kind, st().sel.key], ["commands", "PVTI_rec5"], "the menu stays open, the board on the card after it");
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual([b.modal, b.notice?.text], [null, "tender#3004 ist nicht mehr ausgewählt"], "not the neighbour's status");
  await openMenu(b, cx);
  b.modal.input.type("Spalte ausblenden");
  st().sel = { col: 1, key: "PVTI_rec1" };
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual([b.notice?.text, st().hidden.has("Ready")], ["Spalte „Ready“ ist nicht mehr ausgewählt", false]);
  await openMenu(b, cx);
  host.config = withoutMine();
  b.reload(cx);
  await settle();
  assert.equal(b.modal, null, "its view is gone: the menu closes");
});

test("UI: the command menu keeps groups apart by what they act on, also where a view is named „Board“", async () => {
  const config = JSON.parse(testConfig());
  config.sources.github.views[0].name = "Board";
  const { b, cx } = await openBoard({ config: JSON.stringify(config) });
  await openMenu(b, cx);
  assert.deepEqual(menuHeads(b), ["Issue tender#3004 · feat(api): page through long lists", "Board", "Board"], "the view's heading and the board's");
  b.modal.input.type("n");
  assert.deepEqual(menuEntries(b).map(([name]) => name), [
    "Neu laden", "Nur meine an", "Nächster Tab", "Quelle wechseln: Azure",
    "Nach links verschieben", "Nach rechts verschieben", "Zuweisen…", "Details zeigen", "Status ändern…", "Im Browser öffnen",
    "Spalten…", "Spalte ausblenden: Ready",
  ]);
});

test("the action table's couplings: a listed action has a name, a group, when and run, and cannot run without what its group acts on; a hint without a key of its own names the action's key; only the menu itself is not listed", async () => {
  // A GitHub card's details with the panel on a line, and a Sprint's story,
  // each taken away only what one group acts on.
  const onLine = await onFirstLine();
  sizeDescription(onLine.b, onLine.cx, 500);
  const sprint = await openSprint();
  const moments = [onLine.b.actionContext(), sprint.b.actionContext()];
  const without = { item: { item: null }, details: { details: null }, view: { view: null }, board: {} };
  for (const a of board.ACTIONS) {
    if (a.menu != null) {
      assert.deepEqual([["string", "function"].includes(typeof a.name), a.group in without, typeof a.when, typeof a.run], [true, true, "function", "function"], a.id);
      if (a.group !== "board") for (const full of moments) assert.equal(a.when({ ...full, ...without[a.group] }), false, `${a.id} needs its ${a.group}`);
    }
    if (a.hint && !a.hintKey) assert.ok(a.key, `${a.id}: its hint names its key`);
    if (a.run && a.menu == null) assert.equal(a.id, "commands", `${a.id} is in the menu`);
  }
  const ran = board.ACTIONS.filter((a) => a.menu != null && a.group !== "board" && moments.some((full) => a.when(full))).map((a) => a.id);
  assert.ok(["status", "fold-description", "line-board", "columns", "team-view"].every((id) => ran.includes(id)), "and each can run with it");
});

test("UI: the hint line while the details panel has the keyboard: each key and what it does, in the table's order", async () => {
  const { b, cx } = await openRelated();
  sizeDescription(b, cx, 500);
  await tab(b, cx);
  const pairs = b.render().kids.at(-1).kids.map((h) => texts(h));
  assert.deepEqual(pairs, [
    ["1 2 3 [ ]", "Tab"], ["h/l j/k", "bewegen"], ["gg/G", "erste/letzte"], ["H/L", "verschieben"], ["s", "Status"], ["a", "zuweisen"],
    ["Enter", "Detail · Agent"], ["o", "öffnen"], ["Tab", "Board"], ["j/k", "Zeilen"], ["ctrl-d/u", "halbe Seite"], ["gg/G", "oben/unten"],
    ["z", "mehr"], ["Enter", "Zeile zeigen"], ["o", "Zeile öffnen"], ["m", "nur meine"], ["/", "Filter"], ["r", "neu laden"], [":", "Befehle"],
    ["Esc", "zurück"],
  ]);
});

test("UI: the second Enter's action in the menu is named by what it does: a pull request's review, an item's session", async () => {
  const list = await openBoard();
  await press(list.b, list.cx, "2");
  await list.host.answer("gh", ok(fixture("github-list.json")));
  await press(list.b, list.cx, "enter");
  assert.deepEqual((await openMenu(list.b, list.cx))[0], ["Review starten…", "Enter"]);
  assert.match(menuHeads(list.b)[0], /^PR /);
  const { b, cx, host } = await openBoard();
  host.spaceList.push(sessionSpace);
  await press(b, cx, "enter");
  assert.deepEqual((await openMenu(b, cx))[0], ["Zur Sitzung", "Enter"]);
});

test("UI: with Caps Lock g stays g: a bare g whose character is G does not go to the bottom, and gg still goes to the top", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "l");
  await press(b, cx, "j");
  assert.equal(st().sel.key, "PVTI_rec2");
  const capsG = { char: "G" };
  await press(b, cx, "g", capsG);
  assert.equal(st().sel.key, "PVTI_rec2", "one g waits");
  await press(b, cx, "g", capsG);
  assert.equal(st().sel.key, "PVTI_rec1", "gg: the column's first");
  await press(b, cx, ...SHIFT_G);
  assert.equal(st().sel.key, "PVTI_rec3", "Shift: G, its last");
});

test("UI: on the Backlog n opens the create dialog, and Shift+N is no n: nothing opens, the key is not taken", async () => {
  const { b, cx } = await openBacklog();
  const stopped = cx.stopped;
  await press(b, cx, "n", { char: "N", modifiers: { shift: true } });
  assert.deepEqual([b.modal, cx.stopped], [null, stopped], "Shift+N");
  await press(b, cx, "n");
  assert.equal(b.modal?.kind, "create", "n");
});

test("UI: the command menu runs a line's action only while those details are open: after a refresh dropped their item it says so, the panel and the selection as they are", async () => {
  const { b, cx, host, st } = await onFirstLine();
  await openMenu(b, cx);
  b.modal.input.type("Zeile auf dem Board");
  const gone = json("github-board.json");
  gone.data.repositoryOwner.projectV2.items.nodes = gone.data.repositoryOwner.projectV2.items.nodes.filter((n) => n.id !== "PVTI_rec4");
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(JSON.stringify(gone)), isBoardCall);
  // What the refresh left: the board on the card after it, its details
  // closed and the panel with them (panelOf drops it once it is not theirs).
  const before = [b.panelOf(b.view()), st().sel, st().detail];
  assert.deepEqual(before, [null, { col: 0, key: "PVTI_rec5" }, false]);
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual([b.modal, b.notice?.text], [null, "Die Details von tender#3004 sind nicht mehr offen"]);
  assert.deepEqual([b.panelOf(b.view()), st().sel, st().detail], before, "nothing else changed");
});

test("UI: the command menu says why where its action, on what it opened for, can no longer run: a refresh moved the card into the last column, and „Nach rechts verschieben“ runs nothing", async () => {
  const { b, cx, host, st } = await openBoard({ config: testConfig({ hide: [] }) });
  await openMenu(b, cx);
  b.modal.input.type("Nach rechts");
  assert.equal(menuEntries(b)[0][0], "Nach rechts verschieben");
  const moved = json("github-board.json");
  moved.data.repositoryOwner.projectV2.items.nodes.find((n) => n.id === "PVTI_rec4").fieldValueByName = { optionId: "opt-done", name: "Done" };
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(JSON.stringify(moved)), isBoardCall);
  assert.equal(st().sel.key, "PVTI_rec4", "the same card, now in Done");
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual([b.modal, b.notice?.text, host.open("gh").length], [null, "„Nach rechts verschieben“ geht hier nicht mehr", 0]);
});

test("the shapes lend the action table what it asks: a shape that moves says whether a card can move (canMove), one that hides columns which it can hide (canHide: a column with a target, not one without, nor none)", () => {
  for (const [name, shape] of Object.entries(board.SHAPES)) {
    if (shape.move) assert.equal(typeof shape.canMove, "function", `${name}: canMove`);
    if (shape.toggleColumn) assert.equal(typeof shape.canHide, "function", `${name}: canHide`);
  }
  assert.deepEqual([board.hideable({ target: "opt-done" }), board.hideable({ target: null }), board.hideable(null)], [true, false, false]);
});

test("UI: an action of the top bar leaves the shown view's selection as it is, by its key and from the menu: a tab switch keeps the details of a card the filter now hides", async () => {
  for (const how of ["key", "menu"]) {
    const { b, cx, st } = await openBoard();
    await press(b, cx, "enter");
    if (how === "menu") await openMenu(b, cx);
    b.filterText = "BUG input";
    if (how === "key") await press(b, cx, "2");
    else {
      b.modal.input.type("Tab 2");
      cx.call((own) => b.modal.input.submit(own));
      await settle();
    }
    assert.deepEqual([b.context().id, st().sel.key, st().detail], ["github:prs", "PVTI_rec4", true], how);
  }
});
