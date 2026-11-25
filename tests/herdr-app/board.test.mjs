// Tests for the herdr board mod (herdr-app/.config/herdr-app/mods/board/main.js,
// built from its modules in src/ by build.mjs): the build, the mod's data
// functions, and a few UI paths driven through the Board class with a fake
// herdr; also the board button (mods/board-button/), the tab bar
// (mods/board-tabs/) and their place in layouts/personal.json. They import
// the built main.js, the file herdr loads. Run with `mise run
// herdr-board-test` (README, "herdr app"), or from the repo root with `node
// --test tests/herdr-app/board.test.mjs`.
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
// - written from GitHub's GraphQL reference
//   (ProjectV2ItemFieldSingleSelectValue's name and color, Milestone's
//   title, Issue's parent and subIssuesSummary), with made-up names, not
//   recorded:
//   github-board-cards.json (items with and without a priority in three of
//   GitHub's colors, a milestone, a parent in their repo and in another,
//   sub-issues up to 30 and beyond, an item with none of them, one with an
//   assignee alone and a pull request with a milestone);
// - written from GitHub's GraphQL reference (Issue's subIssues and
//   closedByPullRequestsReferences), with made-up names, not recorded:
//   github-related.json (an issue's sub-issues and linked pull requests)
//   and github-related-not-found.json (an issue GitHub does not find; the
//   error in the shape of the other NOT_FOUND answers);
// - written from GitHub's GraphQL reference (PullRequest's mergeable,
//   reviews, reviewThreads and its commits' oid, PullRequestReview's state,
//   body, submittedAt, author, commit and comments,
//   PullRequestReviewThread's isResolved and comments,
//   PullRequestReviewComment's createdAt, publishedAt and replyTo), with
//   made-up names, not recorded: github-list-attention.json (the
//   shipped PR view's three searches, for sample-user: pull requests asking
//   for its review, of it or of a team, its own, and ones it reviewed, one
//   of them found by two searches; its reviews, as the list asks for them
//   by its login, in each state the list asks for; each reason the list
//   names, and rows that name none); and, the same way, each pull request's
//   mergeable, reviews and review threads (none) and its head commit's oid
//   in github-list.json;
// - written from GitHub's GraphQL reference (Repository's assignableUsers,
//   Query's viewer), with made-up names, not recorded:
//   github-assignable.json (one person without a name);
// - written from GitHub's REST reference (List notifications for the
//   authenticated user, its threads' unread, reason, repository and
//   subject: title, url, latest_comment_url, type), with made-up names, not
//   recorded: github-notifications.json (pull requests of
//   github-list.json's repos, one by its url in another case; one of
//   another repo, one read, an issue, a release and a check suite without
//   a url; its null urls go beyond the reference's schema);
// - written from the azure-devops extension's az devops team list-member
//   (core's TeamMember: identity, isTeamAdmin), with made-up names, not
//   recorded: azure-team-members.json (one group among the members);
// - written from az's documentation (`az devops invoke` for work item
//   types), not recorded: azure-types.json;
// - written in the shapes az prints for the Sprint view's calls (the REST
//   reference at api-version 7.1 and the azure-devops extension's models),
//   with made-up names, not recorded: azure-sprint-iteration.json (az
//   boards iteration team list --timeframe current),
//   azure-sprint-iterations.json (the same without --timeframe, the
//   sprint picker's list: the extension's get_team_iterations and its
//   TeamSettingsIteration, two past sprints, the current one, a future one
//   and one without dates; in both, dates as az prints them, +00:00),
//   azure-sprint-areas.json (az boards area team list),
//   azure-sprint-columns.json (taskboardColumns), azure-sprint-types.json
//   (workitemtypes; each type's color, which the REST reference only names,
//   written as its states' colors are, six hex digits without #, with the
//   values of Azure's Agile process),
//   azure-sprint-taskboard.json (taskboardWorkItems, with
//   one work item the query does not find), azure-sprint-items.json (az
//   boards query), azure-sprint-account.json (az account show --query
//   user) and azure-sprint-parents.json (az boards query for the work
//   items' parents outside the sprint, by their ids);
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
//   them not found);
// - written from the azure-devops extension's az repos pr show
//   (show_pull_request, the vendored SDK's GitPullRequest and
//   IdentityRefWithVote), with made-up names, not recorded:
//   azure-pr-show.json (an active pull request, one approving reviewer and
//   a team without a vote).

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
// The board's lines for herdr's log (boardLog), kept here rather than printed.
const logged = [];
board.boardLog.write = (line) => logged.push(line);
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
  for (const expected of [/refreshMinutes/, /„colour“ gibt es nicht/, /„start\.colour“ gibt es nicht/, /„start\.open“ gibt es nicht mehr: „Öffnen in“ im Startdialog wählt den Space/,
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
  assert.deepEqual([s.message, s.review, s.checkout, s.machine], ["/work {number}", "/look {number}", "~/src/tender", "server"]);
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
  assert.match(doc, /items\(first: 100, query: \$filter\) \{ totalCount pageInfo \{ hasNextPage endCursor \}/, "a page of GitHub's 100, and where the next starts");
  assert.match(doc, /\$h1: String!/);
  assert.doesNotMatch(board.githubBoardArgs({ ...githubView(), filter: "" }, new Set()).find((a) => a.startsWith("query=")), /\$h0/);
  assert.match(doc, /^query\([^)]*\) \{\n  viewer \{ login \}\n/, "and who gh runs as, for „nur meine“");
});

test("columns come from the project's field options, in order, with theme colors", () => {
  const b = githubBoard();
  assert.deepEqual(names(b), ["Backlog", "Ready", "In progress", "In review", "Done"]);
  assert.deepEqual(b.columns.map((c) => c.color), ["ansi2", "ansi4", "ansi3", "ansi5", "ansi11"]);
  assert.deepEqual(b.meta, { projectId: "PVT_sample", fieldId: "PVTSSF_sample", title: "Sample", url: "https://github.com/users/sample-user/projects/7", lacksPriorityField: true });
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

// A board answer of github-board.json's items from `from` to `to`, as a
// page: the first (with the project, its field and the counts) or a next
// one (its items alone); `next` the cursor of the page after it, or null
// for none.
function boardPage(from, to, next, { first = from === 0, total = 6 } = {}) {
  const data = json("github-board.json");
  const project = data.data.repositoryOwner.projectV2;
  const items = { totalCount: total, pageInfo: { hasNextPage: next !== null, endCursor: next ?? "end" }, nodes: project.items.nodes.slice(from, to) };
  if (!first) return { data: { repositoryOwner: { projectV2: { items } } } };
  project.items = items;
  return data;
}

test("a board's next page is one query of its items after the cursor: the same filter and field, no counts, as many as its limit leaves (githubBoardPageArgs)", () => {
  const args = board.githubBoardPageArgs(githubView(), HIDDEN, "Y3Vyc29y", 100);
  const value = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  assert.deepEqual([value("filter"), value("after"), value("login"), value("field")], ['assignee:@me -status:"Backlog","Done"', "Y3Vyc29y", "sample-user", "Status"]);
  assert.ok(args.includes("-F") && args.includes("number=7"));
  const doc = value("query").replace(/\s+/g, " ");
  assert.match(doc, /items\(first: 100, after: \$after, query: \$filter\) \{ totalCount pageInfo \{ hasNextPage endCursor \} nodes \{ id fieldValueByName\(name: \$field\)/);
  assert.doesNotMatch(doc, /\bviewer \{|h0:|options \{/, "nothing the first page read");
  assert.equal(value("h0"), undefined);
  assert.match(board.githubBoardPageArgs({ ...githubView(), limit: 250 }, HIDDEN, "c", 200)[3], /items\(first: 50, after/, "the last page to the limit");
  assert.match(board.githubBoardArgs({ ...githubView(), limit: 30 }, HIDDEN)[3], /items\(first: 30, query/, "a limit below a page");
  const empty = boardPage(0, 0, "c0");
  const next = board.nextBoardPage(empty, githubView());
  assert.deepEqual(next, { after: "c0", read: 0 }, "an empty first page that says more follow");
  const after = board.githubBoardPageArgs(githubView(), HIDDEN, next.after, next.read);
  assert.match(after[3], /items\(first: 100, after: \$after, query/, "its next page reads from the cursor it declares");
  assert.match(after[3], /^query=query\([^)]*, \$after: String!\)/, "and declares it");
  assert.ok(after.includes("after=c0"));
});

test("a board's pages add up: each item once, the last page's pageInfo; the next page while GitHub has one and the limit leaves room (addBoardPage, nextBoardPage)", () => {
  const view = githubView();
  const first = boardPage(0, 3, "c1");
  assert.deepEqual(board.nextBoardPage(first, view), { after: "c1", read: 3 });
  const second = boardPage(2, 6, null, { first: false });
  board.addBoardPage(first, second);
  const items = first.data.repositoryOwner.projectV2.items;
  assert.deepEqual(items.nodes.map((n) => n.id), ["PVTI_rec1", "PVTI_rec2", "PVTI_rec3", "PVTI_rec4", "PVTI_rec5", "PVTI_rec6"], "the item both pages hold, once");
  assert.equal(board.nextBoardPage(first, view), null, "no page more");
  assert.equal(board.nextBoardPage(boardPage(0, 3, "c1"), { ...view, limit: 3 }), null, "the limit read");
  const noCursor = boardPage(0, 3, "c1");
  noCursor.data.repositoryOwner.projectV2.items.pageInfo.endCursor = null;
  assert.throws(() => board.nextBoardPage(noCursor, view), { message: "Projekt „Sample“: GitHub nannte nach 3 Einträgen nicht, wo die nächsten beginnen" },
    "more without a cursor to go on from");
  assert.equal(board.nextBoardPage(noCursor, { ...view, limit: 3 }), null, "unless the limit is read");
  assert.equal(board.nextBoardPage({ data: { repositoryOwner: null } }, view), null, "no items: the parser explains");
  const cut = board.parseGithubBoard(board.addBoardPage(boardPage(0, 3, "c1", { total: 9 }), boardPage(3, 5, "c2", { first: false })), { ...view, limit: 5 }, HIDDEN);
  assert.deepEqual([cut.limited, cut.total, cut.read], [true, 9, 5], "cut: said, with how many it read");
  const stuck = (page) => () => board.addBoardPage(boardPage(0, 3, "c1"), page);
  const STUCK = { message: "Projekt „Sample“: GitHub kam nach 3 Einträgen nicht weiter" };
  assert.throws(stuck(boardPage(1, 3, "c2", { first: false })), STUCK, "more promised, but only items it holds");
  assert.throws(stuck(boardPage(3, 4, "c1", { first: false })), STUCK, "more promised, from the same cursor");
  assert.equal(board.addBoardPage(boardPage(0, 3, "c1"), boardPage(1, 3, null, { first: false })).data.repositoryOwner.projectV2.items.nodes.length, 3,
    "no item new on the last page: the end");
  const missing = { data: { repositoryOwner: { projectV2: { items: null } } } };
  assert.throws(() => board.addBoardPage(boardPage(0, 3, "c1"), missing, [{ type: "FORBIDDEN", path: ["repositoryOwner", "projectV2", "items"], message: "no access" }]),
    { message: "Projekt „Sample“: no access" });
  assert.throws(() => board.addBoardPage(boardPage(0, 3, "c1"), missing), { message: "Projekt „Sample“ lieferte die Einträge nach den ersten 3 nicht" });
  const gone = { data: { repositoryOwner: { projectV2: null } } };
  const at = (path, message) => ({ type: "NOT_FOUND", path, message });
  assert.throws(() => board.addBoardPage(boardPage(0, 3, "c1"), gone, [at(["repositoryOwner"], "owner"), at(["repositoryOwner", "projectV2"], "project gone")]),
    { message: "Projekt „Sample“: project gone" }, "the deepest error on the way to the items");
  assert.throws(() => board.addBoardPage(boardPage(0, 3, "c1"), gone, [at(["repositoryOwner", "projectV2", "items", "nodes", 0], "an item"), at(["viewer"], "elsewhere")]),
    { message: "Projekt „Sample“: an item" }, "none on the way: the page's first");
  assert.throws(() => board.addBoardPage(boardPage(0, 3, "c1"), gone, [at(["repositoryOwner", "projectV2", "items", "nodes", 0], "an item"), at(["repositoryOwner", "projectV2"], "project gone")]),
    { message: "Projekt „Sample“: project gone" }, "an item's error lies past the items, not on the way to them");
});

test("validateConfig: a board's limit is the most items it reads, 1000 by default and at most; a list's at most 100, 50 by default", () => {
  assert.equal(board.PAGE, 100, "a page of GitHub's");
  const board1 = (limit) => ({ id: `b${limit}`, name: "B", layout: "board", project: { owner: "o", number: 1 }, ...(limit === undefined ? {} : { limit }) });
  const list = (limit) => ({ id: `l${limit}`, name: "L", layout: "list", sections: [{ name: "A", query: "is:pr" }], ...(limit === undefined ? {} : { limit }) });
  const { config, errors } = board.validateConfig({ sources: { github: { views: [board1(undefined), board1(1000), board1(1001), list(undefined), list(100), list(101), board1(0)] } } });
  assert.deepEqual(config.github.views.map((v) => [v.id, v.limit]), [["bundefined", 1000], ["b1000", 1000], ["lundefined", 50], ["l100", 100]]);
  assert.deepEqual(errors.map((e) => e.replace(/^.*: /, "")), ["„limit“ ist eine ganze Zahl von 1 bis 1000", "„limit“ ist eine ganze Zahl von 1 bis 100", "„limit“ ist eine ganze Zahl von 1 bis 1000"]);
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
  assert.deepEqual(list.sections.map((s) => [s.name, s.count, s.rows.map((r) => r.number)]), [["Review", 1, [2820]], ["Mine", 4, [77, 1921, 808]]],
    "sample-user's 77, with changes requested, first: sample-user has to act on it");
  assert.deepEqual(list.sections.flatMap((s) => s.rows.map((r) => [r.number, r.assigneeLogins, r.reviewers])), [
    [2820, [], ["sample-user"]], [77, [], []], [1921, [], []], [808, ["sample-user"], []],
  ], "a team's review request names no one");
  const [review] = list.sections[0].rows;
  assert.deepEqual([review.repoShort, review.author, review.review, review.branch, review.checks.short, review.checks.text],
    ["tender", "sample-contributor", "noch kein Review", "pr/summary-card", "✓ 15", "15 bestanden · 3 übersprungen"]);
  const [failing, release, draft] = list.sections[1].rows;
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

// ---- PR list: whether the viewer has to act ----

// The PR view of the shipped views.json, its three sections.
const shippedListView = () => board.readConfig(shippedConfig()).config.github.views.find((v) => v.layout === "list");
// github-list-attention.json as the shipped PR view reads it, and the rows
// of its sections by number.
const attentionList = (data = json("github-list-attention.json"), view = shippedListView(), errors = []) => board.parseGithubList(data, view, errors);
const attentionOf = (list) => list.sections.map((s) => s.rows.map((r) => [r.number, r.attention, r.waiting]));
// The answer's pull request `number`, to change before it is read.
const attentionPr = (data, number) => ["s0", "s1", "s2"].flatMap((s) => data.data[s].nodes).find((n) => n?.number === number);
// [attention, waiting, unread] of the row `number` in an answer changed by
// `change`, read with `errors`.
function reasonsWith(number, change, errors = []) {
  const data = json("github-list-attention.json");
  change(attentionPr(data, number), data);
  const row = attentionList(data, shippedListView(), errors).sections.flatMap((s) => s.rows).find((r) => r.number === number);
  return [row.attention, row.waiting, row.unread];
}
const UNREAD = board.UNREAD;

test("the PR list reads what tells whether the viewer has to act: mergeable, the last 5 reviews of the login it is given, pending ones left out, with their state, text, time, author, commit and first 10 comments with what each replies to, the first 10 review threads with their last 10 comments' authors and times; without a login, anyone's reviews; a pull request a level down reads none of them, only the head commit's oid beside its checks", () => {
  const args = board.githubListArgs(shippedListView(), "sample-user");
  const doc = args.find((a) => a.startsWith("query=")).replace(/\s+/g, " ");
  assert.match(doc, /^query=query\(\$login: String, \$q0: String!, \$q1: String!, \$q2: String!\) \{ viewer \{ login \} /);
  assert.match(doc, / mergeable reviews\(last: 5, author: \$login, states: \[APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED\]\) \{ nodes \{ state body submittedAt author \{ login \} commit \{ oid \} comments\(first: 10\) \{ totalCount nodes \{ replyTo \{ id \} \} \} \} \} /);
  assert.match(doc, /reviewThreads\(first: 10\) \{ totalCount nodes \{ isResolved comments\(last: 10\) \{ nodes \{ author \{ login \} createdAt publishedAt \} \} \} \}/);
  assert.match(doc, /commits\(last: 1\) \{ nodes \{ commit \{ oid statusCheckRollup/);
  assert.deepEqual([board.FIRST_THREADS, board.REVIEW_THREADS, board.THREAD_COMMENTS, board.VIEWER_REVIEWS, board.REVIEW_COMMENTS], [10, 50, 10, 5, 10]);
  assert.equal((doc.match(/reviewThreads\(/g) ?? []).length, 3, "in each of the three searches");
  assert.equal((doc.match(/ reviews\(/g) ?? []).length, 3, "in each of the three searches");
  assert.deepEqual(args.slice(4, 6), ["-f", "login=sample-user"]);
  assert.deepEqual(board.githubListArgs(shippedListView(), null).slice(4, 6), ["-f", `q0=${shippedListView().sections[0].query}`], "without a login, no variable for it");
  assert.deepEqual(board.githubViewerArgs(), ["api", "graphql", "-f", "query=query { viewer { login } }"]);
  const level = board.githubPullRequestArgs({ repo: "example/tender", number: 1 })[3];
  assert.doesNotMatch(level, /mergeable| reviews\(|reviewThreads/);
  assert.match(level.replace(/\s+/g, " "), /commit \{ oid statusCheckRollup/);
});

test("a search asks for one's review where it sets review-requested or user-review-requested to @me, not negated", () => {
  for (const q of ["is:pr review-requested:@me", "is:pr user-review-requested:@me", "REVIEW-REQUESTED:@me is:open", "NOT author:@me review-requested:@me"]) {
    assert.equal(board.askingSearch(q), true, q);
  }
  for (const q of ["is:pr -review-requested:@me", "is:pr NOT review-requested:@me", "author:@me", "reviewed-by:@me", "review-requested:someone", "", undefined]) {
    assert.equal(board.askingSearch(q), false, String(q));
  }
});

// A review of sample-user's as GitHub sends it; `replies`: whether each of
// its comments replies in a thread or starts one.
const myReview = (state, at, oid, body = "", replies = []) => ({
  state, body, submittedAt: at, author: { login: "sample-user" }, commit: { oid },
  comments: { totalCount: replies.length, nodes: replies.map((reply) => ({ replyTo: reply ? { id: "PRRC_sample" } : null })) },
});

test("on someone else's pull request the viewer has to act where their review is asked for, of them or of a team (a search that asks for it found it), and they gave none or theirs was dismissed; where their latest review was on another commit than the head, asked again or not; where it is asked for again while theirs is on the head; and where a thread they took part in ends with someone else's comment; one they reviewed that asks nothing waits on its author", () => {
  const list = attentionList();
  const [review, , reviewed] = attentionOf(list);
  assert.deepEqual(review, [
    [103, ["Review erneut angefragt"], false], [101, ["Review angefragt"], false], [102, ["neue Commits seit deinem Review"], false], [104, ["Review angefragt"], false],
    [105, ["Review erneut angefragt"], false], [106, ["Review angefragt"], false],
  ], "104 asked of a team only, 106 with sample-user's review dismissed; 103 asked again with nothing new, 105 by a team after sample-user's comment");
  assert.deepEqual(reviewed, [
    [302, ["neue Commits seit deinem Review"], false], [303, ["Antwort erwartet"], false], [301, [], true],
  ], "301: a thread of its own unanswered, and one without sample-user, ask nothing of sample-user");
  assert.deepEqual(list.sections.flatMap((s) => s.rows.map((r) => r.unread)).filter((u) => u.length), [], "all of it read");
  assert.deepEqual(reasonsWith(301, (pr) => (pr.reviews.nodes[0].commit = null)), [["neue Commits seit deinem Review"], false, []], "a review whose commit GitHub does not name");
  assert.deepEqual(reasonsWith(301, (pr) => pr.reviewThreads.nodes.push({ isResolved: false, comments: { nodes: [{ author: { login: "sample-user" } }, { author: null }] } })),
    [["Antwort erwartet"], false, []], "a last comment whose author is gone is someone else's");
  assert.deepEqual(reasonsWith(303, (pr) => (pr.reviewThreads.nodes[0].isResolved = true)), [[], true, []], "a resolved thread asks nothing");
  assert.deepEqual(reasonsWith(302, (pr) => (pr.reviews = { nodes: [] })), [[], false, []], "neither asked nor reviewed: nothing");
  assert.deepEqual(reasonsWith(301, (pr) => (pr.reviews.nodes[0].state = "DISMISSED")), [[], false, []], "a dismissed review is none");
  assert.deepEqual(reasonsWith(301, (pr) => (pr.author = null)), [[], true, []], "an author who is gone is not sample-user");
  assert.deepEqual(reasonsWith(301, (pr) => pr.reviewRequests.nodes.push({ requestedReviewer: { login: "sample-user" } })), [["Review erneut angefragt"], false, []],
    "asked by name in a search that does not ask: asked again");
  assert.deepEqual(reasonsWith(103, (pr) => (pr.commits.nodes = [])), [[], false, [UNREAD.head]], "asked again, the head unknown: no reason told");
  assert.deepEqual(reasonsWith(101, (pr) => {
    pr.reviews.nodes.push(myReview("COMMENTED", null, pr.commits.nodes[0].commit.oid, "Looks fine."));
    pr.reviewThreads.nodes.push({ isResolved: false, comments: { nodes: [{ author: { login: "sample-user" } }, { author: { login: "sample-reviewer" } }] } });
  }), [["Review erneut angefragt", "Antwort erwartet"], false, []], "asked again after a review of the head, and a thread");
  assert.deepEqual(reasonsWith(102, (pr) => pr.reviewThreads.nodes.push({ isResolved: false, comments: { nodes: [{ author: { login: "sample-user" } }, { author: { login: "sample-contributor" } }] } })),
    [["neue Commits seit deinem Review", "Antwort erwartet"], false, []], "every reason, in order");
});

// comments: [login, createdAt, publishedAt] (null or left out: not sent)
const timedThread = (...comments) => ({ isResolved: false, comments: { nodes: comments.map(([login, at, published]) => ({ author: { login }, ...(at ? { createdAt: at } : {}), ...(published ? { publishedAt: published } : {}) })) } });
const reviewedAt = (pr, at) => (pr.reviews.nodes[0].submittedAt = at);
const HEAD_303 = "0303aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("on someone else's pull request a thread asks for an answer only where its last comment came after one's latest review; without such a review, or where GitHub did not send a time, as before; one's own pull requests are unchanged", () => {
  assert.deepEqual(reasonsWith(303, (pr) => reviewedAt(pr, "2026-11-19T12:00:00Z")), [[], true, []], "replied to, then reviewed again: it waits on its author");
  assert.deepEqual(reasonsWith(303, (pr) => reviewedAt(pr, "2026-11-19T11:00:00Z")), [[], true, []], "a reply at the review's very time is not after it");
  assert.deepEqual(reasonsWith(303, (pr) => {
    reviewedAt(pr, "2026-11-19T12:00:00Z");
    pr.reviewThreads.nodes.push(timedThread(["sample-user", "2026-11-19T10:00:00Z"], ["sample-contributor", "2026-11-19T13:00:00Z"]));
  }), [["Antwort erwartet"], false, []], "one thread replied to after the review is enough");
  assert.deepEqual(reasonsWith(303, (pr) => {
    reviewedAt(pr, "2026-11-19T12:00:00Z");
    delete pr.reviewThreads.nodes[0].comments.nodes[1].createdAt;
    delete pr.reviewThreads.nodes[0].comments.nodes[1].publishedAt;
  }), [["Antwort erwartet"], false, []], "a reply without its time counts");
  assert.deepEqual(reasonsWith(303, (pr) => reviewedAt(pr, null)), [["Antwort erwartet"], false, []], "a review without its time hides no reply");
  assert.deepEqual(reasonsWith(303, (pr) => reviewedAt(pr, "not a time")), [["Antwort erwartet"], false, []], "nor one with a time that is none");
  assert.deepEqual(reasonsWith(303, (pr) => {
    reviewedAt(pr, "2026-11-19T12:00:00Z");
    pr.reviews.nodes[0].state = "DISMISSED";
  }), [["Antwort erwartet"], false, []], "a dismissed review is none: as before");
  assert.deepEqual(reasonsWith(303, (pr) => {
    pr.reviews.nodes[0].state = "DISMISSED";
    pr.reviews.nodes.unshift(myReview("APPROVED", "2026-11-19T09:00:00Z", "0303bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
  }), [["Antwort erwartet"], false, []], "nor does one before it count where the last is dismissed");
  assert.deepEqual(reasonsWith(303, (pr) => (pr.reviews = { nodes: [] })), [["Antwort erwartet"], false, []], "no review of one's own: as before");
  assert.deepEqual(reasonsWith(202, (pr) => pr.reviews.nodes.push(myReview("COMMENTED", "2026-11-20T09:00:00Z", "0202aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Done."))),
    [["Änderungen gewünscht", "2 offene Threads", "Checks rot", "Konflikt"], false, []], "one's own: a review of one's later than the threads' hides none");
});

test("a reply counts from when GitHub published it, where it says, else from when it was written: one drafted before one's latest review and published after it asks for an answer", () => {
  const replied = (created, published) => reasonsWith(303, (pr) => {
    reviewedAt(pr, "2026-11-19T12:00:00Z");
    pr.reviewThreads.nodes[0] = timedThread(["sample-user", "2026-11-19T10:00:00Z"], ["sample-contributor", created, published]);
  });
  assert.deepEqual(replied("2026-11-19T11:00:00Z", "2026-11-19T13:00:00Z"), [["Antwort erwartet"], false, []], "drafted before the review, published after it");
  assert.deepEqual(replied("2026-11-19T13:00:00Z", "2026-11-19T11:00:00Z"), [[], true, []], "published before it: its time of writing does not count");
  assert.deepEqual(replied("2026-11-19T11:00:00Z", null), [[], true, []], "no time of publishing: its time of writing");
});

// 303, whose author replied in both threads at 11:00 after one's review at
// 10:00, after one replied in thread B, left unresolved, at 12:00.
const repliedInB = (change) => reasonsWith(303, (pr) => {
  pr.reviewThreads.nodes[1].isResolved = false;
  pr.reviewThreads.nodes[1].comments.nodes.push({ author: { login: "sample-user" }, createdAt: "2026-11-19T12:00:00Z", publishedAt: "2026-11-19T12:00:00Z" });
  change(pr);
});
const reviewedWith = (pr, body, replies, state = "COMMENTED") => {
  const review = myReview(state, "2026-11-19T12:00:00Z", HEAD_303, body, replies);
  pr.reviews.nodes.push(review);
  return review;
};

test("one's latest review is the last of one's last 5 that approves, asks for changes, has a text or starts a thread: a reply in a thread alone, which GitHub files as a review of its own, neither hides the replies before it nor shows again those before one's last such review, and one with neither text nor comments is none either; where none of the 5 is one, every reply counts", () => {
  const asks = [["Antwort erwartet"], false, []];
  const hides = [[], true, []];
  assert.deepEqual(repliedInB((pr) => reviewedWith(pr, "", [true])), asks, "a reply in thread B alone: A's reply still asks");
  assert.deepEqual(repliedInB((pr) => reviewedWith(pr, "", [true, true])), asks, "nor several replies at once");
  assert.deepEqual(repliedInB((pr) => reviewedWith(pr, "", [])), asks, "nor one with neither text nor comments");
  assert.deepEqual(reasonsWith(303, (pr) => {
    reviewedWith(pr, "", [false]);
    pr.reviewThreads.nodes.push(timedThread(["sample-user", "2026-11-19T12:00:00Z"]));
  }), hides, "a review that starts a thread hides the replies before it");
  assert.deepEqual(repliedInB((pr) => reviewedWith(pr, "", [true, false])), hides, "also beside a reply");
  assert.deepEqual(repliedInB((pr) => reviewedWith(pr, "See the new comment.", [true])), hides, "a reply with a text");
  assert.deepEqual(repliedInB((pr) => reviewedWith(pr, "", [true], "APPROVED")), hides, "an approval");
  assert.deepEqual(repliedInB((pr) => reviewedWith(pr, "", [true], "CHANGES_REQUESTED")), hides, "changes asked for");
  assert.deepEqual(reasonsWith(303, (pr) => {
    reviewedWith(pr, "One more thing.", []);
    pr.reviewThreads.nodes[1].isResolved = false;
    pr.reviewThreads.nodes[1].comments.nodes.push({ author: { login: "sample-user" }, createdAt: "2026-11-19T13:00:00Z", publishedAt: "2026-11-19T13:00:00Z" });
    pr.reviews.nodes.push(myReview("COMMENTED", "2026-11-19T13:00:00Z", HEAD_303, "", [true]));
  }), hides, "reviewed at 12:00 after the replies, then a reply in thread B alone at 13:00: the replies before 12:00 stay answered");
  assert.deepEqual(repliedInB((pr) => (pr.reviews.nodes = Array.from({ length: 5 }, (_, i) => myReview("COMMENTED", `2026-11-19T12:0${i}:00Z`, HEAD_303, "", [true])))),
    asks, "5 replies alone: no review, every reply counts");
  assert.deepEqual(reasonsWith(303, (pr) => pr.reviews.nodes.unshift(myReview("COMMENTED", "2026-11-19T12:00:00Z", HEAD_303, "Second look."))), hides,
    "the last by its time, wherever GitHub lists it");
  assert.deepEqual(reasonsWith(303, (pr) => {
    pr.reviews.nodes.unshift(myReview("COMMENTED", "2026-11-19T12:00:00Z", HEAD_303, "Second look."));
    pr.reviews.nodes[1].submittedAt = null;
  }), asks, "one without a time: the later in GitHub's order, whose missing time hides no reply");
});

test("the other reasons on someone else's pull request go by the same latest review: a reply in a thread alone neither clears new commits nor makes a review asked for one asked for again, and with nothing but replies the pull request does not wait on its author", () => {
  const reply = (oid) => myReview("COMMENTED", "2026-11-19T11:00:00Z", oid, "", [true]);
  assert.deepEqual(reasonsWith(302, (pr) => pr.reviews.nodes.push(reply("0302aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))), [["neue Commits seit deinem Review"], false, []],
    "approved an older commit, then a reply on the head: still new commits");
  assert.deepEqual(reasonsWith(103, (pr) => pr.reviews.nodes.push(reply("0103bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))), [["Review erneut angefragt"], false, []],
    "approved the head, then a reply on another commit: asked again, no new commits");
  assert.deepEqual(reasonsWith(103, (pr) => (pr.reviews.nodes = [reply("0103aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")])), [["Review angefragt"], false, []], "nothing but a reply: asked, not asked again");
  assert.deepEqual(reasonsWith(301, (pr) => (pr.reviews.nodes = [reply("0301aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")])), [[], false, []], "nothing but a reply, asked for nothing: no waiting on its author");
  assert.deepEqual(reasonsWith(301, (pr) => pr.reviews.nodes.push(reply("0301aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))), [[], true, []], "a reply after one's review: still waiting on its author");
});

test("where GitHub sends too little to tell whether one's last review is one, the reasons count it as one, and where that is all that decides them the row is unread and does not wait on its author", () => {
  const unsure = [[], false, [UNREAD.reviewKind]];
  assert.deepEqual(repliedInB((pr) => delete reviewedWith(pr, "", [true]).body), unsure, "its text not sent");
  assert.deepEqual(repliedInB((pr) => (reviewedWith(pr, "", [true]).comments = null)), unsure, "nor its comments");
  assert.deepEqual(repliedInB((pr) => (reviewedWith(pr, "", [true]).comments.totalCount = 11)), unsure, "more comments than it sent, all replies");
  assert.deepEqual(repliedInB((pr) => (reviewedWith(pr, "", [true]).comments.nodes = [{}])), unsure, "a comment without what it replies to");
  assert.deepEqual(repliedInB((pr) => (reviewedWith(pr, "", [true]).state = "PENDING")), unsure, "a state the list did not ask for");
  assert.deepEqual(repliedInB((pr) => {
    const review = reviewedWith(pr, "", [true, false]);
    review.comments.totalCount = 11;
    delete review.body;
  }), [[], true, []], "a comment that starts a thread among those it sent tells");
  assert.deepEqual(repliedInB((pr) => {
    const review = reviewedWith(pr, "", [true]);
    delete review.body;
    review.submittedAt = "2026-11-19T09:00:00Z";
  }), [["Antwort erwartet"], false, []], "older than one's last review: it decides nothing");
  assert.deepEqual(reasonsWith(303, (pr) => {
    delete reviewedWith(pr, "", [true]).body;
    pr.reviewThreads.nodes[0].isResolved = true;
  }), [[], true, []], "no reply it would hide: nothing unread");
  assert.deepEqual(reasonsWith(301, (pr) => {
    pr.reviews.nodes = [myReview("COMMENTED", "2026-11-19T10:00:00Z", "0301aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "", [true])];
    delete pr.reviews.nodes[0].body;
    pr.reviewThreads.nodes.push(timedThread(["sample-user", "2026-11-19T10:00:00Z"], ["sample-contributor", "2026-11-19T13:00:00Z"]));
  }), [["Antwort erwartet"], false, []], "the same reasons either way: nothing unread");
  assert.deepEqual(reasonsWith(301, (pr) => {
    pr.reviews.nodes = [myReview("COMMENTED", "2026-11-19T10:00:00Z", "0301aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "", [true])];
    delete pr.reviews.nodes[0].body;
  }), unsure, "whether it waits on its author");
  assert.deepEqual(reasonsWith(301, (pr) => {
    pr.reviews.nodes = [myReview("COMMENTED", "2026-11-19T10:00:00Z", "0301aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "", [true])];
    delete pr.reviews.nodes[0].body;
    pr.commits.nodes = [];
  }), [[], false, [UNREAD.head, UNREAD.reviewKind]], "counted as a review, it needs the head commit too");
  assert.equal(UNREAD.reviewKind, "deine letzten Reviews nicht ganz gelesen");
});

test("what the list could not read whole on someone else's pull request is unread, and never reads as nothing to do or waiting on its author: errors at its path, threads GitHub did not send or cut, reviews it did not send or sent of someone else, a head commit it did not name", () => {
  const error = { path: ["s2", "nodes", 0, "reviews"], message: "Something went wrong\nmore" };
  assert.deepEqual(reasonsWith(301, (pr) => (pr.reviews = null), [error]), [[], false, ["Something went wrong", UNREAD.reviews]]);
  assert.deepEqual(reasonsWith(302, (pr) => (pr.commits.nodes = [])), [[], false, [UNREAD.head]], "a review and no head commit: new commits cannot be told");
  assert.deepEqual(reasonsWith(301, (pr) => (pr.reviewThreads.totalCount = 51)), [[], false, [UNREAD.moreThreads(2)]], "threads beyond those read");
  assert.deepEqual(reasonsWith(303, (pr) => (pr.reviewThreads.nodes[1].comments = null)), [["Antwort erwartet"], false, [UNREAD.threads]], "a thread whose comments it did not send");
  assert.deepEqual(reasonsWith(301, (pr) => pr.reviewThreads.nodes.push(null)), [[], false, [UNREAD.threads]], "a thread it sent as null");
  assert.deepEqual(reasonsWith(301, (pr) => (pr.reviewThreads = null)), [[], false, [UNREAD.threads]]);
  assert.deepEqual(reasonsWith(101, (pr) => (pr.reviews = null)), [["Review angefragt"], false, [UNREAD.reviews]], "a reason still shows");
  assert.deepEqual(reasonsWith(301, (pr) => pr.reviews.nodes.push(null)), [[], false, [UNREAD.reviews]], "a review it sent as null");
  assert.deepEqual(reasonsWith(102, (pr) => pr.reviews.nodes.push({ ...myReview("APPROVED", "2026-11-19T13:00:00Z", "0102aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), author: { login: "sample-reviewer" } })),
    [["Review angefragt"], false, [UNREAD.reviews]], "someone else's: the request asked for another login than the answer names");
  assert.deepEqual([UNREAD.moreThreads(50), UNREAD.moreThreads(10)], ["mehr als 50 Review-Threads", "mehr als 10 Review-Threads"]);
});

test("reviews read for another login than the answer names are unread on someone else's pull request, also where that login gave none; one's own keep theirs, and the login the answer names or none reads them", () => {
  const data = json("github-list-attention.json");
  ["s0", "s1", "s2"].forEach((s) => data.data[s].nodes.forEach((pr) => (pr.reviews.nodes = [])));
  const rows = (login) => board.parseGithubList(structuredClone(data), shippedListView(), [], { login }).sections.flatMap((s) => s.rows);
  const switched = rows("sample-other");
  assert.deepEqual(switched.filter((r) => r.author !== "sample-user").map((r) => [r.number, r.unread, r.waiting]).sort(([a], [b]) => a - b),
    [101, 102, 103, 104, 105, 106, 301, 302, 303].map((n) => [n, [UNREAD.reviews], false]));
  assert.deepEqual(switched.filter((r) => r.author === "sample-user").map((r) => r.unread), rows("sample-user").filter((r) => r.author === "sample-user").map((r) => r.unread));
  for (const login of ["sample-user", null]) {
    assert.equal(rows(login).some((r) => r.unread.includes(UNREAD.reviews)), false, String(login));
  }
});

test("on one's own pull request the viewer has to act on changes requested, threads whose last comment is someone else's (with + where GitHub has more than the 50 it sent), failing checks and a conflict; with none of them, all of it read, it is ready to merge where it is no draft, no review is still required, its checks passed or it has none, and it merges cleanly", () => {
  const [, mine] = attentionOf(attentionList());
  assert.deepEqual(mine, [
    [201, ["bereit zum Mergen"], false], [202, ["Änderungen gewünscht", "2 offene Threads", "Checks rot", "Konflikt"], false], [203, [], false],
  ]);
  const open = (n) => Array.from({ length: n }, () => ({ isResolved: false, comments: { nodes: [{ author: { login: "sample-reviewer" } }] } }));
  const threads = (nodes, total) => (pr) => (pr.reviewThreads = { totalCount: total, nodes });
  assert.deepEqual(reasonsWith(203, threads(open(1), 1)), [["1 offener Thread"], false, []]);
  assert.deepEqual(reasonsWith(203, threads(open(50), 70)), [["50+ offene Threads"], false, [UNREAD.moreThreads(50)]], "threads GitHub did not send may be open too");
  assert.deepEqual(reasonsWith(203, threads(open(1), 70)), [["1+ offene Threads"], false, [UNREAD.moreThreads(1)]]);
  assert.deepEqual(reasonsWith(201, threads([], 70)), [[], false, [UNREAD.moreThreads(0)]], "none open of those it sent: not ready, unread");
  assert.deepEqual(reasonsWith(203, (pr) => (pr.reviewThreads = null)), [[], false, [UNREAD.threads]], "no threads read");
  assert.deepEqual(reasonsWith(201, threads([{ isResolved: false, comments: { nodes: [] } }], 1)), [["bereit zum Mergen"], false, []], "a thread without comments waits on no one");
  assert.deepEqual(reasonsWith(201, threads(open(1), 1)), [["1 offener Thread"], false, []], "an open thread: not ready");
  assert.deepEqual(reasonsWith(201, () => {}, [{ path: ["s1", "nodes", 1, "mergeable"], message: "Mergeable is hidden" }]), [[], false, ["Mergeable is hidden"]], "an error at its path: not ready");
  const lost = [{ path: ["s1", "nodes", 1, "commits", "nodes", 0, "commit", "statusCheckRollup"], message: "Checks are hidden" }];
  const noRollup = (pr) => (pr.commits.nodes[0].commit.statusCheckRollup = null);
  assert.deepEqual(reasonsWith(201, noRollup, lost), [[], false, ["Checks are hidden"]], "checks lost to an error are not none");
  const lostRow = (errors) => {
    const data = json("github-list-attention.json");
    noRollup(attentionPr(data, 201));
    return attentionList(data, shippedListView(), errors).sections[1].rows.find((r) => r.number === 201).checks;
  };
  assert.deepEqual([lostRow(lost).state, lostRow(lost).short, lostRow(lost).text], ["unread", "?", "Checks nicht gelesen"]);
  assert.deepEqual([lostRow([]).state, lostRow([]).short], ["none", "—"], "without an error: no checks");
  assert.deepEqual([lostRow([{ path: ["s1", "nodes", 1, "reviews"], message: "x" }]).state], ["none"], "an error elsewhere: its checks stand");
  assert.equal(board.checksSummary({ state: "SUCCESS", contexts: { checkRunCountsByState: [{ state: "SUCCESS", count: 1 }] } }).state, "passed");
  assert.equal(board.checksSummary({ state: "SUCCESS", contexts: { checkRunCountsByState: [{ state: "SUCCESS", count: 1 }] } }, true).state, "unread", "a rollup whose counts came with an error");
  const counts = [{ path: ["s1", "nodes", 1, "commits", "nodes", 0, "commit", "statusCheckRollup", "contexts", "statusContextCountsByState"], message: "Counts are hidden" }];
  assert.deepEqual(reasonsWith(201, () => {}, counts), [[], false, ["Counts are hidden"]], "a rollup kept with its counts lost: not ready");
  const level = JSON.parse(pullRequestAnswer());
  level.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup = null;
  const item = { repo: "example/tender", number: 3020 };
  assert.equal(board.parseGithubPullRequest(level, item, [{ path: ["repository", "pullRequest", "commits"], message: "x" }]).checks.short, "?", "a pull request a level down too");
  assert.equal(board.parseGithubPullRequest(level, item, [{ path: ["repository", "pullRequest", "assignees"], message: "x" }]).checks.short, "—");
  for (const [why, change] of [
    ["no review decision, as in a repo that asks for none", (pr) => (pr.reviewDecision = null)],
    ["no checks", (pr) => (pr.commits.nodes[0].commit.statusCheckRollup = null)],
    ["neither", (pr) => {
      pr.reviewDecision = null;
      pr.commits.nodes[0].commit.statusCheckRollup = null;
    }],
  ]) assert.deepEqual(reasonsWith(201, change), [["bereit zum Mergen"], false, []], why);
  for (const [why, change] of [
    ["a draft", (pr) => (pr.isDraft = true)],
    ["mergeability still being calculated", (pr) => (pr.mergeable = "UNKNOWN")],
    ["checks still running", (pr) => (pr.commits.nodes[0].commit.statusCheckRollup.contexts.checkRunCountsByState.push({ state: "IN_PROGRESS", count: 1 }))],
    ["a review still required", (pr) => (pr.reviewDecision = "REVIEW_REQUIRED")],
  ]) assert.deepEqual(reasonsWith(201, change), [[], false, []], why);
  for (const [reason, change] of [
    ["Änderungen gewünscht", (pr) => (pr.reviewDecision = "CHANGES_REQUESTED")],
    ["Checks rot", (pr) => pr.commits.nodes[0].commit.statusCheckRollup.contexts.checkRunCountsByState.push({ state: "FAILURE", count: 1 })],
    ["Konflikt", (pr) => (pr.mergeable = "CONFLICTING")],
  ]) assert.deepEqual(reasonsWith(201, change), [[reason], false, []], reason);
  assert.equal(board.reviewLabel("CHANGES_REQUESTED", false), "Änderungen gewünscht", "the review state's own words");
  assert.deepEqual(reasonsWith(201, (pr) => {
    pr.reviews = null;
    pr.commits.nodes = [];
  }), [["bereit zum Mergen"], false, []], "one's own: neither its reviews nor its head commit are needed");
});

test("without the viewer's login no row asks anything of anyone, only a row's errors are unread, and the rows keep GitHub's order", () => {
  const data = json("github-list-attention.json");
  delete data.data.viewer;
  attentionPr(data, 202).author = null;
  attentionPr(data, 303).reviewThreads.nodes.push({ isResolved: false, comments: { nodes: [{ author: null }, { author: { login: "sample-contributor" } }] } });
  attentionPr(data, 301).reviewThreads = null;
  const errors = [{ path: ["s2", "nodes", 0, "reviews"], message: "Reviews are hidden" }];
  assert.deepEqual(attentionList(data, shippedListView(), errors).sections.map((s) => s.rows.map((r) => [r.number, r.attention.length, r.waiting, r.unread.length])), [
    [[103, 0, false, 0], [101, 0, false, 0], [102, 0, false, 0], [104, 0, false, 0], [105, 0, false, 0], [106, 0, false, 0]],
    [[203, 0, false, 0], [201, 0, false, 0], [202, 0, false, 0]], [[301, 0, false, 1], [302, 0, false, 0], [303, 0, false, 0]],
  ], "301's error stays with its row; its missing threads tell nothing without the viewer");
  assert.deepEqual(attentionList(data, shippedListView(), errors).warnings, [], "and is no warning");
});

test("a pull request a search that asks for one's review found is asked for it, whichever section holds it; a duplicate's errors stay warnings", () => {
  const data = json("github-list-attention.json");
  const team = attentionPr(data, 105);
  // Geprüft first: 105 is found by it and, after it, by Zu prüfen.
  const view = { ...shippedListView(), sections: [2, 0, 1].map((i) => shippedListView().sections[i]) };
  const answer = { data: { viewer: data.data.viewer, s0: { issueCount: 4, nodes: [team, ...data.data.s2.nodes.slice(0, 3)] }, s1: data.data.s0, s2: data.data.s1 } };
  const errors = [{ path: ["s1", "nodes", 4, "reviews"], message: "A duplicate's error" }];
  const list = board.parseGithubList(answer, view, errors);
  const row = list.sections[0].rows.find((r) => r.number === 105);
  assert.deepEqual([row.attention, row.waiting, row.unread], [["Review erneut angefragt"], false, []], "asked by a team after sample-user's comment");
  assert.equal(list.sections[1].rows.some((r) => r.number === 105), false, "held by Geprüft only");
  assert.deepEqual(list.warnings, ["A duplicate's error"]);
  assert.equal(board.parseGithubList({ data: { viewer: data.data.viewer, s0: { issueCount: 1, nodes: [team] } } }, { sections: [view.sections[0]] }).sections[0].rows[0].waiting, true,
    "where no search asks: waiting on its author");
});

test("a pull request GitHub sent as null for an error at its path is not read, with that error, not a result that is no pull request; the errors a row or a section holds are no warnings of the list", () => {
  const data = json("github-list-attention.json");
  data.data.s1.nodes[0] = null;
  data.data.s1.nodes.push({});
  const errors = [
    { path: ["s1", "nodes", 0, "reviewThreads"], message: "Timeout on reviewThreads\nmore" },
    { path: ["s2", "nodes", 2, "reviews"], message: "Reviews are hidden" },
    { path: ["s0"], message: "Something else" },
    { path: ["s1", "edges", 1], message: "Not at a row" },
  ];
  attentionPr(data, 302).reviews = null;
  const list = attentionList(data, shippedListView(), errors);
  const mine = list.sections[1];
  assert.deepEqual([mine.notRead, mine.skipped, mine.rows.map((r) => r.number)], [["Timeout on reviewThreads"], 1, [201, 202]]);
  assert.deepEqual(list.sections.map((s) => s.notRead.length), [0, 1, 0]);
  assert.deepEqual(list.sections[2].rows.find((r) => r.number === 302).unread, ["Reviews are hidden", UNREAD.reviews]);
  assert.deepEqual(list.warnings, ["Something else", "Not at a row"], "an error elsewhere in a search, beside an index, is no row's");
  assert.deepEqual(board.SHAPES.prs.warnings(shippedListView(), list), ["1 Treffer in „Meine“ sind keine Pull Requests", "1 Treffer in „Meine“ nicht gelesen: Timeout on reviewThreads"]);
});

test("a section's rows the viewer has to act on come first, each part in GitHub's order; a pull request two searches find stays in the first, so a review still asked for leaves it out of Geprüft", () => {
  const list = attentionList();
  assert.deepEqual(list.sections.map((s) => [s.name, s.rows.map((r) => r.number)]), [
    ["Zu prüfen", [103, 101, 102, 104, 105, 106]], ["Meine", [201, 202, 203]], ["Geprüft", [302, 303, 301]],
  ]);
  const data = json("github-list-attention.json");
  data.data.s0.nodes.reverse();
  data.data.s0.nodes.push(...data.data.s2.nodes.slice(0, 1));
  assert.deepEqual(attentionList(data).sections[0].rows.map((r) => r.number), [106, 105, 104, 102, 101, 103, 301], "rows to act on keep their order, and so do the others");
});

test("the shipped views.json's PR view searches what one is asked to review, one's own, and the open pull requests one reviewed and did not open, in blue, violet and teal", () => {
  const view = shippedListView();
  assert.deepEqual(view.sections.map((s) => [s.name, s.tone]), [["Zu prüfen", "blue"], ["Meine", "violet"], ["Geprüft", "teal"]]);
  assert.match(view.sections[2].query, /^is:pr is:open archived:false reviewed-by:@me -author:@me$/);
  assert.deepEqual(attentionList().sections.map((s) => s.color), ["ansi4", "ansi5", "ansi6"]);
});

test("a list section takes the tone views.json gives it, one of copper's hues but orange, else the next by its place of blue, violet, teal, green, yellow, red that no other section sets; any other tone, and any other key, is named as an error", () => {
  const list = (sections) => board.validateConfig({ sources: { github: { views: [{ id: "l", name: "L", layout: "list", sections }] } } });
  const s = (name, tone) => ({ name, query: "is:pr", ...(tone === undefined ? {} : { tone }) });
  const tones = (sections) => list(sections).config.github.views[0].sections.map((x) => x.tone);
  const { config, errors } = list([s("A"), s("B", "violet"), s("C"), s("D", "red")]);
  assert.deepEqual(errors, []);
  assert.deepEqual(config.github.views[0].sections.map((x) => x.tone), ["blue", "violet", "teal", "red"], "C takes teal: violet is B's");
  const answer = { data: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [`s${i}`, { issueCount: 0, nodes: [] }])) };
  assert.deepEqual(board.parseGithubList(answer, config.github.views[0]).sections.map((x) => x.color), ["ansi4", "ansi5", "ansi6", "ansi1"]);
  assert.deepEqual(tones([0, 1, 2, 3, 4, 5, 6].map((i) => s(`S${i}`))), ["blue", "violet", "teal", "green", "yellow", "red", "blue"], "the seventh starts again");
  assert.deepEqual(tones([...["red", "green", "yellow", "blue", "violet", "teal"].map((t) => s(t, t)), s("X")]), ["red", "green", "yellow", "blue", "violet", "teal", "blue"],
    "every tone set: the order from its start");
  assert.deepEqual(Object.keys(board.SECTION_TONES), ["red", "green", "yellow", "blue", "violet", "teal"]);
  assert.deepEqual(board.SECTION_TONE_ORDER.map((n) => board.SECTION_TONES[n]), ["ansi4", "ansi5", "ansi6", "ansi2", "ansi3", "ansi1"]);
  assert.deepEqual(board.parseGithubList(json("github-list.json"), listView()).sections.map((x) => x.color), ["ansi4", "ansi5"], "the test views set none");
  assert.deepEqual(board.parseGithubList(answer, { sections: [s("H")] }).sections.map((x) => x.color), ["muted"], "a view not read from views.json: muted");
  const bad = list([s("A", "Blue"), s("B", 4), s("C", "constructor"), s("D", "orange"), { ...s("E", "teal"), tones: "blue" }]);
  const why = '„tone“ ist "red", "green", "yellow", "blue", "violet" oder "teal"';
  assert.deepEqual(bad.errors.slice(0, 5), [
    ...["A", "B", "C", "D"].map((n) => `GitHub-Ansicht 1 („L“): Abschnitt „${n}“: ${why}`), "GitHub-Ansicht 1 („L“): Abschnitt „E“: „tones“ gibt es nicht",
  ]);
  assert.equal(bad.config, null, "the view is left out");
});

// The list answer with pull request `n`'s threads cut to the first ten of
// `total`, and the follow-up's node for it with `threads` (its first 50).
function cutThreads(data, n, total, threads) {
  const all = ["s0", "s1", "s2"].flatMap((s) => data.data[s].nodes).filter((pr) => pr?.number === n);
  for (const pr of all) pr.reviewThreads = { totalCount: total, nodes: threads.slice(0, 10) };
  return { id: all[0].id, reviewThreads: { totalCount: total, nodes: threads.slice(0, 50) } };
}
const resolvedThreads = (k) => Array.from({ length: k }, () => ({ isResolved: true, comments: { nodes: [{ author: { login: "sample-reviewer" } }] } }));
const waitingThread = { isResolved: false, comments: { nodes: [{ author: { login: "sample-user" } }, { author: { login: "sample-contributor" } }] } };

test("pull requests with more review threads than the list read are read again, once each, by id, for their first 50; the follow-up's threads replace theirs wherever the list holds them", () => {
  const data = json("github-list-attention.json");
  const node = cutThreads(data, 102, 12, [...resolvedThreads(11), waitingThread]);
  attentionPr(data, 302).reviewThreads.totalCount = attentionPr(data, 302).reviewThreads.nodes.length;
  const view = shippedListView();
  assert.deepEqual(board.moreThreadIds(data, view), [node.id], "102, in two sections: once");
  assert.deepEqual(board.moreThreadIds(json("github-list-attention.json"), view), [], "none with more");
  const unreadThreads = json("github-list-attention.json");
  attentionPr(unreadThreads, 301).reviewThreads = null;
  assert.deepEqual(board.moreThreadIds(unreadThreads, view), [], "threads not read: none to read more of");
  const args = board.githubThreadsArgs([node.id, "PR_x"]);
  assert.deepEqual(args.slice(4), ["-f", `ids[]=${node.id}`, "-f", "ids[]=PR_x"]);
  assert.match(args[3].replace(/\s+/g, " "), /^query=query\(\$ids: \[ID!\]!\) \{ nodes\(ids: \$ids\) \{ \.\.\. on PullRequest \{ id reviewThreads\(first: 50\) \{ totalCount nodes \{ isResolved comments\(last: 10\) \{ nodes \{ author \{ login \} createdAt publishedAt \} \} \} \} \} \} \}$/);
  const before = attentionList(json("github-list-attention.json")).sections[0].rows.find((r) => r.number === 102).attention;
  assert.deepEqual(board.addThreads(data, view, [node.id], { data: { nodes: [node] } }, []), [], "all of it read: no error");
  assert.equal(data.data.s2.nodes[1].reviewThreads, node.reviewThreads, "also where it is a duplicate");
  const row = attentionList(data).sections[0].rows.find((r) => r.number === 102);
  assert.deepEqual([before, row.attention, row.unread], [["neue Commits seit deinem Review"], ["neue Commits seit deinem Review", "Antwort erwartet"], []], "the twelfth thread counts");
});

test("the follow-up's threads carry their comments' times: a thread among them replied to before one's latest review asks nothing, one replied to or published after it does", () => {
  const view = shippedListView();
  const read = (at, published) => {
    const data = json("github-list-attention.json");
    const node = cutThreads(data, 102, 12, [...resolvedThreads(11), timedThread(["sample-user", "2026-11-19T09:00:00Z"], ["sample-contributor", at, published])]);
    board.addThreads(data, view, [node.id], { data: { nodes: [node] } }, []);
    return attentionList(data).sections[0].rows.find((r) => r.number === 102).attention;
  };
  assert.deepEqual(read("2026-11-19T09:30:00Z"), ["neue Commits seit deinem Review"], "before the review at 10:00");
  assert.deepEqual(read("2026-11-19T10:30:00Z"), ["neue Commits seit deinem Review", "Antwort erwartet"], "after it");
  assert.deepEqual(read("2026-11-19T09:30:00Z", "2026-11-19T10:30:00Z"), ["neue Commits seit deinem Review", "Antwort erwartet"], "written before it, published after it");
});

test("where the follow-up for more threads fails, or does not send a pull request's, that pull request's row is unread, with why, at the row that shows it", () => {
  const fresh = () => {
    const data = json("github-list-attention.json");
    return { data, node: cutThreads(data, 102, 12, resolvedThreads(12)) };
  };
  const view = shippedListView();
  const at102 = ["s0", "nodes", 2, "reviewThreads"];
  const cases = [
    ["a failed call", (d, n) => board.addThreads(d, view, [n.id], null, [], "GitHub nicht erreichbar: x"), "GitHub nicht erreichbar: x"],
    ["an error at its node", (d, n) => board.addThreads(d, view, [n.id], { data: { nodes: [null] } }, [{ path: ["nodes", 0, "reviewThreads"], message: "Timeout\nmore" }]), "Review-Threads: Timeout"],
    ["its node missing", (d, n) => board.addThreads(d, view, [n.id], { data: { nodes: [] } }, []), "GitHub schickte die weiteren Review-Threads nicht"],
    ["its node sent with an error under it", (d, n) => board.addThreads(d, view, [n.id], { data: { nodes: [n] } }, [{ path: ["nodes", 0, "reviewThreads", "nodes", 3], message: "A thread is hidden" }]), "Review-Threads: A thread is hidden"],
    ["another node", (d, n) => board.addThreads(d, view, [n.id], { data: { nodes: [{ ...n, id: "PR_other" }] } }, []), "GitHub schickte die weiteren Review-Threads nicht"],
    ["threads without nodes", (d, n) => board.addThreads(d, view, [n.id], { data: { nodes: [{ id: n.id, reviewThreads: null }] } }, []), "GitHub schickte die weiteren Review-Threads nicht"],
  ];
  for (const [why, run, message] of cases) {
    const { data, node } = fresh();
    const errors = run(data, node);
    assert.deepEqual(errors, [{ path: at102, message }], `${why}: once, at the row that shows it`);
    assert.equal(data.data.s0.nodes[2].reviewThreads.nodes.length, 10, `${why}: its first ten stay`);
    const list = attentionList(data, view, errors);
    const row = list.sections[0].rows.find((r) => r.number === 102);
    assert.deepEqual(row.unread, [message, UNREAD.moreThreads(10)], why);
    assert.deepEqual(list.warnings, [], `${why}: no warning`);
  }
});

// ---- PR list: unread notifications ----

const notified = () => board.notifiedPrs(json("github-notifications.json")).keys;
const notifiedOf = (repo, ...numbers) => board.notifiedPrs(numbers.map((n) => ({ unread: true, subject: { type: "PullRequest", url: `https://api.github.com/repos/${repo}/pulls/${n}` } }))).keys;

test("the unread notifications are one REST call of gh for all their pages, 50 a page, GitHub's own unread list", () => {
  assert.deepEqual(board.githubNotificationsArgs(), ["api", "--paginate", "notifications?per_page=50"], "no `all`: unread only");
});

test("of the notifications, only unread ones whose subject is a pull request name one, by the repo and number of the subject's url, whatever its case; an unread pull request whose url names none is counted", () => {
  assert.deepEqual([...notified()].sort(), ["example/atlas#808", "example/other#1921", "example/tender#2820"],
    "not the issue, the release, the check suite without a url, nor the one read");
  assert.equal(board.notifiedPrs(json("github-notifications.json")).unnamed, 0, "a check suite without a url is no pull request");
  const entry = (subject, unread = true) => ({ unread, subject: { type: "PullRequest", ...subject } });
  const skipped = [
    null, {}, { unread: true }, { unread: true, subject: null }, entry({ url: null }), entry({ url: 5 }), entry({ url: "https://api.github.com/repos/example/tender/pulls/9" }, "true"),
    entry({ url: "https://api.github.com/repos/example/tender/pulls/9/files" }), entry({ url: "https://api.github.com/repos/example/tender/issues/9" }),
    entry({ url: "https://api.github.com/repos/example/pulls/9" }), entry({ url: "https://api.github.com/repos/example/tender/pulls/x9" }),
    { unread: true, subject: { type: "Issue", url: "https://api.github.com/repos/example/tender/pulls/9" } },
  ];
  const none = board.notifiedPrs(skipped);
  assert.deepEqual([...none.keys], [], "an entry of another shape names none");
  assert.equal(none.unnamed, 6, "the unread pull requests whose url is none, or names none");
  assert.deepEqual([...board.notifiedPrs([...skipped, entry({ url: "https://ghe.example/api/v3/repos/example/tender/pulls/9" })]).keys], ["example/tender#9"], "the others still count");
  assert.equal(board.notifiedUnnamed(1), "1 ungelesene Benachrichtigung zu einem Pull Request ohne lesbare Adresse");
  assert.equal(board.notifiedUnnamed(6), "6 ungelesene Benachrichtigungen zu Pull Requests ohne lesbare Adresse");
  for (const reply of [{}, null, { message: "x" }, "[]"]) {
    assert.throws(() => board.notifiedPrs(reply), { message: "GitHub schickte keine Liste von Benachrichtigungen" }, JSON.stringify(reply));
  }
});

test("a pull request with an unread notification has „ungelesen“ as its first reason, in its row wherever it shows, mine or another's, and ranks with the rows that have one", () => {
  const plain = board.parseGithubList(json("github-list.json"), listView());
  const list = board.parseGithubList(json("github-list.json"), listView(), [], { notified: notified() });
  const rows = (l) => l.sections.map((s) => s.rows.map((r) => [r.number, r.attention]));
  assert.deepEqual(rows(plain), [[[2820, ["Review angefragt"]]], [[77, ["Änderungen gewünscht", "Checks rot"]], [1921, []], [808, []]]]);
  assert.deepEqual(rows(list), [[[2820, ["ungelesen", "Review angefragt"]]], [[808, ["ungelesen"]], [77, ["Änderungen gewünscht", "Checks rot"]], [1921, []]]],
    "808 by its url's other case; 2820 once, where it shows; not 1921 of another repo, nor 77 by its issue");
  assert.equal(board.NOTIFIED, "ungelesen");
  assert.deepEqual(list.sections.flatMap((s) => s.rows.map((r) => r.unread)), [[], [], [], []], "nothing read less of it");
  const nameless = json("github-list.json");
  nameless.data.viewer = null;
  assert.deepEqual(rows(board.parseGithubList(nameless, listView(), [], { notified: notified() })),
    [[[2820, ["ungelesen"]]], [[808, ["ungelesen"]], [1921, []], [77, []]]], "without the viewer, the other reasons go, not it");
  const ready = attentionList(json("github-list-attention.json"), shippedListView()).sections[1].rows.find((r) => r.attention.includes("bereit zum Mergen"));
  const both = board.parseGithubList(json("github-list-attention.json"), shippedListView(), [], { notified: notifiedOf("example/tender", ready.number) });
  assert.deepEqual(both.sections[1].rows.find((r) => r.number === ready.number).attention, ["ungelesen", "bereit zum Mergen"], "beside the others");
  const waits = attentionList().sections.flatMap((s) => s.rows).find((r) => r.waiting);
  const marked = board.parseGithubList(json("github-list-attention.json"), shippedListView(), [], { notified: notifiedOf("example/tender", waits.number) })
    .sections.flatMap((s) => s.rows).find((r) => r.number === waits.number);
  assert.deepEqual([marked.attention, marked.waiting], [["ungelesen"], false], "in place of waiting for its author");
});

const TOKEN_KIND = "Benachrichtigungen liest nur ein klassisches Token oder die Anmeldung von gh selbst: gh auth login";

test("a REST answer of gh is its JSON, whatever its shape; a token without a scope the call needs is named by gh's hint, a fine-grained or app token says which it takes, another failure by gh's words", () => {
  const rest = { rest: true };
  assert.deepEqual(board.readGh({ code: 0, stdout: fixture("github-notifications.json"), stderr: "" }, rest).json, json("github-notifications.json"));
  assert.deepEqual(board.readGh({ code: 0, stdout: "[]", stderr: "" }, rest), { json: [], warnings: [], errors: [] });
  assert.throws(() => board.readGh({ code: 0, stdout: "[]", stderr: "" }), { message: "gh endete mit 0" }, "not without `rest`");
  const scope = 'gh: Missing required scope (HTTP 403)\ngh: This API operation needs the "notifications" scope. To request it, run:  gh auth refresh -h github.com -s notifications';
  assert.throws(() => board.readGh({ code: 1, stdout: '{"message":"Missing required scope"}', stderr: scope }, rest),
    { message: "Dem gh-Token fehlt der Scope „notifications“: gh auth refresh -s notifications" });
  assert.throws(() => board.readGh({ code: 1, stdout: '{"message":"Missing required scope"}', stderr: scope }), { message: "Missing required scope (HTTP 403)" }, "a GraphQL call's as before");
  for (const by of ["personal access token", "integration"]) {
    const said = `gh: Resource not accessible by ${by} (HTTP 403)`;
    const reply = JSON.stringify({ message: `Resource not accessible by ${by}` });
    assert.throws(() => board.readGh({ code: 1, stdout: reply, stderr: said }, rest), { message: TOKEN_KIND }, by);
    assert.throws(() => board.readGh({ code: 1, stdout: reply, stderr: said }), { message: `Resource not accessible by ${by} (HTTP 403)` }, `${by}: a GraphQL call's as before`);
  }
  assert.throws(() => board.readGh({ code: 1, stdout: '[{"id":"1"}', stderr: "gh: Server Error (HTTP 502)" }, rest), { message: "GitHub antwortete mit Server Error (HTTP 502)" },
    "a later page that failed: no part of the list");
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

test("a session opens as a new space with its own name on its machine, or a tab in a space there; the tab carries the session's name", () => {
  assert.deepEqual(board.startCommand({ on: "server", folder: "/w", argv: ["claude"], task: "/work 1", name: "tender#1 t", spaceName: "tender" }),
    ["space.new", { name: "tender", tab: "tender#1 t", machine: "server", folder: "/w", argv: ["claude"], task: "/work 1" }]);
  assert.deepEqual(board.startCommand({ on: null, folder: "/w", argv: ["claude"], task: "", name: "n", spaceName: "mine" }),
    ["space.new", { name: "mine", tab: "n", machine: "", folder: "/w", argv: ["claude"] }]);
  assert.deepEqual(board.startCommand({ on: null, folder: "/w", argv: ["claude"], task: "go", name: "n", space: "s2", spaceName: "unused" }),
    ["tab.new", { name: "n", space: "s2", folder: "/w", argv: ["claude"], task: "go" }]);
});

test("Öffnen in preselects the space named like the repo, ignoring case, else the shown one, else the machine's first; none without spaces", () => {
  const spaces = [
    { id: "c", name: "TENDER", machine: null, active: false },
    { id: "a", name: "other", machine: null, active: true },
    { id: "b", name: "Tender", machine: "server", active: false },
    { id: "d", name: "notes", machine: "server", active: false },
    { id: "e", name: "x", machine: "laptop", active: false },
    { id: "f", name: "y", machine: "laptop", active: false },
  ];
  const pre = (on, name) => board.preselectedSpace(board.spacesOn(spaces, on), name)?.id ?? null;
  assert.deepEqual(board.spacesOn(spaces, "server").map((s) => s.id), ["b", "d"], "only the machine's spaces, in herdr's order");
  assert.deepEqual(board.spacesOn(spaces, undefined).map((s) => s.id), ["c", "a"], "this machine's");
  assert.equal(pre(null, "tender"), "c");
  assert.equal(pre("server", "tender"), "b");
  assert.equal(pre(null, "none"), "a", "the shown space");
  assert.equal(pre("laptop", "none"), "e", "the shown space is on another machine: the first");
  assert.equal(pre(null, ""), "a", "no name: the shown space");
  assert.equal(pre("desk", "tender"), null);
});

test("a new space's name is the repo's short name, an Azure item's its checkout's last folder", () => {
  assert.equal(board.spaceNameFor({ repoShort: "tender" }, "~/src/other"), "tender");
  assert.equal(board.spaceNameFor({ source: "azure" }, "~/Repos/vc/"), "vc");
  assert.equal(board.spaceNameFor({ source: "azure" }, null), "");
});

// ---- Labels ----

test("the data's age and PR ages read as German labels; the age counts days from two days on", () => {
  const now = Date.parse("2026-11-18T12:00:00");
  assert.equal(board.sinceLabel(0, now), "");
  assert.equal(board.sinceLabel(now - 40000, now), "vor 40 s");
  assert.equal(board.sinceLabel(now - 3 * 60000 - 5000, now), "vor 3 min");
  assert.equal(board.sinceLabel(now - 2 * 3600000, now), "vor 2 h");
  assert.equal(board.sinceLabel(now - 47 * 3600000, now), "vor 47 h");
  assert.equal(board.sinceLabel(now - 48 * 3600000, now), "vor 2 d");
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
// What fills a slot (a Popup's `trigger` and `content`) is drawn, so it is
// kept with the children too; a second filling replaces the first, as in
// herdr. A Popup draws its slots only: herdr drops the ordinary children
// given to it (kept in `dropped`). The methods named in `lacks` it does
// not have.
const SLOTS = ["trigger", "content"];
function element(kind, lacks = []) {
  const el = { kind, styles: [], with: {}, calls: [], kids: [], dropped: [] };
  const slots = new Map();
  const proxy = new Proxy(el, {
    get(target, p) {
      if (p in target) return target[p];
      if (lacks.includes(p)) return undefined;
      return (...args) => {
        const kids = kind === "popup" ? target.dropped : target.kids;
        if (p === "child") kids.push(args[0]);
        else if (p === "children") kids.push(...args[0]);
        else if (SLOTS.includes(p)) {
          if (slots.has(p)) target.kids[target.kids.indexOf(slots.get(p))] = args[0];
          else target.kids.push(args[0]);
          slots.set(p, args[0]);
          target.with[p] = args;
          target.calls.push([p, ...args]);
        }
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
// by default gh is found and az is not) and recorded in asked; and gh's
// question for the login it runs as (githubViewerArgs), answered at once
// with `viewerAnswer` (by default sample-user) and counted in viewerAsks;
// and gh's request for the unread notifications (githubNotificationsArgs),
// answered at once with `notificationsAnswer` (by default none; an Error
// rejects it; null leaves it to the test, as any other call), which a test
// may change, and counted in notificationsAsks.
// spaces() is spaceList, which a test may change.
// layout() is `tree` (the shown layout; none by default), focused() is
// `focus`, props() is `copyProps` (the copy's own props, as herdr gives
// them: `props`), and shared() reads `sharedValues`; a test may change each.
// focusCalls counts the calls of a focus handle's focus(). command(name)
// hands the copy a command (board.<name>).
const found = (tool) => `/opt/fake/bin/${tool}`;
const SAMPLE_LOGIN = { code: 0, stdout: JSON.stringify({ data: { viewer: { login: "sample-user" } } }), stderr: "" };
const NO_NOTIFICATIONS = { code: 0, stdout: "[]", stderr: "" };
function fakeHost({
  config = testConfig(), shown = true, tree = null, props = {}, which = (tool) => (tool === "az" ? "" : found(tool)), oldScroll = false, oldMouse = false, viewerAnswer = SAMPLE_LOGIN,
  notificationsAnswer = NO_NOTIFICATIONS,
} = {}) {
  const calls = [];
  const lacked = oldMouse ? ["on_window_mouse_up"] : [];
  const waiting = [];
  // A text input of herdr's (InputState, and what TextareaState shares with
  // it): its focus() takes the keyboard from the board's handles and the
  // other inputs, as herdr's does. It has a selection (selected_range, in
  // UTF-16 offsets as herdr's); set_selected_range throws, as herdr's
  // does, for a range outside the text, ending before it starts or
  // splitting a character. set_value, which tells no "change" as herdr's,
  // puts the cursor at the end of a single-line input and at the start of a
  // multi-line one (`multiLine`), as herdr's reset_selection does.
  // `placeholder` is the one it was made with.
  const textState = (opts, multiLine = false) => {
    let value = opts?.value ?? "";
    let start = multiLine ? 0 : value.length;
    let end = start;
    const on = {};
    const input = {
      placeholder: opts?.placeholder ?? "",
      on: (event, fn) => ((on[event] = fn), true), value: () => value,
      set_value: (v) => {
        value = v;
        start = end = multiLine ? 0 : v.length;
      },
      selected_range: () => ({ start, end }),
      set_selected_range: (range) => {
        for (const at of [range.start, range.end]) {
          if (!Number.isInteger(at) || at < 0 || at > value.length) throw new Error("token range is outside the document or empty");
          const unit = value.charCodeAt(at);
          if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("token range splits a Unicode grapheme");
        }
        if (range.start > range.end) throw new Error("token range is outside the document or empty");
        ({ start, end } = range);
      },
      // Enter in the field, with the cx of the key's call.
      submit: (cx) => on.submit?.({}, cx),
      // Typing: the value, the cursor after it, and its "change" handler
      // told.
      type: (text) => {
        value = text;
        start = end = text.length;
        on.change?.({}, { notify() {} });
      },
      focus: () => {
        for (const h of host.handles) h.held = false;
        for (const other of host.inputs) if (other !== input) other.blur();
        on.focus?.({}, { notify() {} });
      },
      blur: () => on.blur?.({}, { notify() {} }),
      emit: (event, payload, cx) => on[event]?.(payload, cx),
    };
    host.inputs.push(input);
    return input;
  };
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
    viewerAsks: 0,
    notificationsAnswer,
    notificationsAsks: 0,
    exec: (tool, args, options) => {
      if (args.includes(`query=${board.VIEWER_QUERY}`)) {
        host.viewerAsks++;
        return Promise.resolve(viewerAnswer);
      }
      if (args.includes(board.NOTIFICATIONS_PATH)) host.notificationsAsks++;
      if (args.includes(board.NOTIFICATIONS_PATH) && host.notificationsAnswer !== null) {
        return host.notificationsAnswer instanceof Error ? Promise.reject(host.notificationsAnswer) : Promise.resolve(host.notificationsAnswer);
      }
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
    nextCommand: () => new Promise((resolve) => waiting.push(resolve)),
    command: async (name) => {
      await settle();
      assert.ok(waiting.length, `nobody waits for ${name}`);
      waiting.shift()(name);
      await settle();
    },
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
    "InputState.new": (opts) => textState(opts),
    // herdr's multi-line input: an input that also takes its rows
    // (set_auto_grow, set_rows, set_soft_wrap: recorded in `layout`), whose
    // own Enter (shift-Enter, ctrl-Enter: `secondary`) puts a line break in
    // place of each selection (`ranges`, several cursors, the active one
    // first: herdr's replace_text_in_ranges), the active cursor after its
    // own, and tells its "change" handler once and then its "submit"
    // handler, with `shift` and `secondary`.
    "TextareaState.new": (opts) => {
      if (host.drawing) throw new Error("TextareaState.new(...) needs a live host call; call it from init() or an event handler");
      const area = textState(opts, true);
      area.layout = {};
      area.set_auto_grow = (min, max) => (area.layout.autoGrow = [min, max]);
      area.set_rows = (rows) => (area.layout.rows = rows);
      area.set_soft_wrap = (wrap) => (area.layout.softWrap = wrap);
      area.enter = (cx, { shift = false, secondary = false, ranges = [area.selected_range()] } = {}) => {
        const [active] = ranges;
        let text = area.value();
        for (const { start, end } of [...ranges].sort((x, y) => y.start - x.start)) text = `${text.slice(0, start)}\n${text.slice(end)}`;
        const cursor = ranges.filter((r) => r.start < active.start).reduce((at, r) => at + 1 - (r.end - r.start), active.start + 1);
        area.set_value(text);
        area.set_selected_range({ start: cursor, end: cursor });
        area.emit("change", {}, cx);
        area.emit("submit", { secondary, shift }, cx);
      };
      return area;
    },
    // The bare anchored surface (herdr's Popup): a box around `trigger`,
    // whose content slot draws the surface. herdr refuses one without a
    // trigger element.
    "Popup.new": (id, trigger) => {
      if (typeof trigger !== "object" || trigger === null) throw new TypeError("Popup.new(id, trigger) expects the trigger element");
      return element("popup").id(id).trigger(trigger);
    },
    "Textarea.new": (state) => Object.assign(element("textarea"), { state }),
    // herdr refuses a ScrollHandle made while a view draws. Each handle's
    // scroll_to_item(row) is recorded in `scrolled` as { handle, row }. Its
    // readers (herdr 0.1.18; none with `oldScroll`) give what a test sets:
    // `y` scrolled down, the window `width` × `height`, the `content`'s
    // height; all zero as before herdr's first frame.
    scrolled: [],
    "ScrollHandle.new": () => {
      if (host.drawing) throw new Error("ScrollHandle.new() cannot run during render; create state in init() or in an event handler and keep it on the view");
      const handle = { scroll_to_item: (row) => host.scrolled.push({ handle, row }) };
      if (oldScroll) return handle;
      return Object.assign(handle, {
        y: 0, width: 0, height: 0, content: 0,
        offset: () => ({ x: 0, y: handle.y }),
        viewport_size: () => ({ width: handle.width, height: handle.height }),
        content_size: () => ({ width: handle.width, height: Math.max(handle.content, handle.height) }),
      });
    },
    // herdr before 0.1.18 (`oldMouse`) has no on_window_mouse_up.
    div: () => element("div", lacked),
    h_flex: () => element("h_flex", lacked),
    v_flex: () => element("v_flex", lacked),
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
        // A task whose cancel() takes it out of `every`.
        every: live((ms, fn) => {
          cx.every.push(Object.assign(fn, { ms }));
          return { cancel: () => (cx.every = cx.every.filter((f) => f !== fn)) };
        }),
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
  value: {
    getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k),
    key: (i) => [...memory.keys()][i] ?? null, get length() {
      return memory.size;
    },
  },
});

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });

// A Board on the fake host, started with `props`, its calls not answered
// yet. `stored`:
// what the store holds before (by default the GitHub source as the one last
// shown, so the board opens on its first view); `raw`: entries it holds as
// they stand (a saved state: savedFor).
async function bootBoard(options = {}) {
  memory.clear();
  for (const [key, value] of Object.entries(options.stored ?? { source: "github" })) memory.set(key, JSON.stringify(value));
  for (const [key, text] of Object.entries(options.raw ?? {})) memory.set(key, text);
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

// A GitHub board's pages read through the fake host (boardPage, above).
test("UI: a GitHub board reads every page, one gh call each, and shows all their items", async () => {
  const { b, host, st } = await bootBoard();
  await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1"))), isBoardCall);
  assert.equal(st().loading, true, "still reading");
  const next = host.open("gh");
  assert.equal(next.length, 1, "the next page");
  assert.ok(next[0].args.includes("after=c1"));
  await host.answer("gh", ok(JSON.stringify(boardPage(3, 6, null, { first: false }))), isBoardCall);
  assert.deepEqual([st().loading, host.open("gh").length, host.calls.filter((c) => isBoardCall(c.args)).length], [false, 0, 2], "two calls, then done");
  const shown = (name) => b.navColumns(b.view()).find((c) => c.name === name).shown.map((c) => c.number);
  assert.deepEqual([shown("Ready"), shown("In progress")], [[3004, 3005, 3007], [3000, 3001, 3003]], "the items of both pages");
  assert.equal(texts(b.render()).some((s) => s.startsWith("Nur die ersten")), false, "nothing cut");
});

test("UI: a GitHub board makes at most as many calls as full pages of its limit take; where they cut it, it says how many items it read", async () => {
  const config = JSON.parse(testConfig());
  config.sources.github.views[0].limit = 150;
  const { b, host, st } = await bootBoard({ config: JSON.stringify(config) });
  assert.match(host.open("gh")[0].args[3], /items\(first: 100, query/);
  await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1", { total: 9 }))), isBoardCall);
  assert.match(host.open("gh")[0].args[3], /items\(first: 100, after/, "the second of two calls");
  await host.answer("gh", ok(JSON.stringify(boardPage(3, 5, "c2", { first: false, total: 9 }))), isBoardCall);
  assert.deepEqual([host.open("gh").length, st().loading, host.calls.filter((c) => isBoardCall(c.args)).length], [0, false, 2],
    "GitHub has more, but the calls are used up");
  assert.ok(texts(b.render()).some((s) => s.startsWith("Nur die ersten 5 von 9 Einträgen")), "and the board says it is cut, at the items read");
});

test("UI: what GitHub says beside a later page's items shows as a warning, as the first page's does", async () => {
  const { b, host, st } = await bootBoard();
  await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1"))), isBoardCall);
  const page = { ...boardPage(3, 6, null, { first: false }), errors: [{ type: "FORBIDDEN", message: "Resource not accessible by integration", path: ["repositoryOwner", "projectV2", "items", "nodes", 0, "content"] }] };
  await host.answer("gh", { code: 1, stdout: JSON.stringify(page), stderr: "gh: Resource not accessible by integration" }, isBoardCall);
  assert.deepEqual([st().error, st().warnings], [null, ["Resource not accessible by integration"]]);
  assert.ok(texts(b.render()).includes("Resource not accessible by integration"), "the board says so");
});

test("UI: a board whose next page fails shows the error, as a failed first page does", async () => {
  const { b, host, st } = await bootBoard();
  await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1"))), isBoardCall);
  await host.answer("gh", { code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" }, isBoardCall);
  assert.deepEqual([st().loading, st().data, host.open("gh").length], [false, null, 0]);
  assert.equal(st().error, "GitHub antwortete mit HTTP 502: Bad Gateway");
  assert.ok(texts(b.render()).some((s) => /502/.test(s)), "the board says so");
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

test("UI: a throw while the board handles a command, or in its timers, goes to herdr's log with its stack each time, is said once while it repeats and ends neither", async () => {
  memory.clear();
  logged.length = 0;
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
  assert.equal(logged.filter((l) => /^Error: focus broke\n {4}at /.test(l)).length, 3, "logged each time, with its stack");
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

test("report: an unexpected error goes to herdr's log with its stack and shows as unexpected; a BoardError shows as it is, unlogged", () => {
  logged.length = 0;
  const e = new Error("kaputt");
  assert.deepEqual([board.report(e), board.report(new board.BoardError("offline"))], ["Unerwarteter Fehler: kaputt", "offline"]);
  // A run another test left may log its call line here too.
  assert.deepEqual(logged.filter((l) => !l.startsWith("board: ")), [e.stack]);
});

test("UI: herdr's props() say which copy is the layer's; the props init got stand in only where it gives none", async () => {
  const { b, host } = await openBoard({ shown: false, tree: layerLayout("board"), props: { layer: true } });
  assert.equal(b.isLayer(), true);
  host.copyProps = undefined;
  assert.equal(b.isLayer(), true, "props() give none");
  const tab = await openBoard({ tree: layerLayout("main") });
  assert.equal(tab.b.isLayer(), false);
});

test("UI: the board's keyboard goes to the start dialog's open list or message or to a menu's filter, else the filter being typed, else the board, whose keys a status menu takes", async () => {
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
  await press(b, cx, "space");
  b.handle.focus();
  b.takeKeyboard();
  assert.deepEqual([b.modal.field, b.modal.focusedField, taken()], ["agent", "filter", "message"], "the filter of its open list");
  await press(b, cx, "escape");
  assert.deepEqual([b.modal.list, taken()], [null, "board"]);
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
  await openMenu(b, cx);
  b.handle.focus();
  b.takeKeyboard();
  assert.equal(taken(), "message", "the command menu's filter");
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

test("UI: on a herdr without on_window_mouse_up, a press outside the shown layer's board shows the tab's content after the press, any button; the pane gets the keyboard if the board still has it then", async () => {
  const { b, cx, host } = await openBoard({ props: { layer: true }, shown: false, tree: layerLayout("board"), oldMouse: true });
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
  const inTab = await openBoard({ tree: layerLayout("main"), oldMouse: true });
  byId(inTab.b.render(inTab.cx), "board").with.on_mouse_down_out[0]({ button: "left", position: { x: 150, y: 300 } }, inTab.cx);
  await inTab.cx.fire();
  assert.deepEqual(inTab.host.runs, [], "a Board tab's board");
});

// The board's handlers of a press outside it and of a release anywhere in
// the window, by button, as the board draws it now.
function outsideHandlers(b, cx) {
  const root = byId(b.render(cx), "board");
  const releases = Object.fromEntries(root.calls.filter(([name]) => name === "on_window_mouse_up").map(([, button, fn]) => [button, fn]));
  return { press: root.with.on_mouse_down_out[0], releases };
}

test("UI: a click outside the shown layer's board, pressed and released within 8 px, shows the tab's content after the release, any button; a press that turns into a drag keeps the board", async () => {
  const { b, cx, host } = await openBoard({ props: { layer: true }, shown: false, tree: layerLayout("board") });
  const { press, releases } = outsideHandlers(b, cx);
  await cx.fire();
  assert.deepEqual(Object.keys(releases), ["left", "right", "middle", "back", "forward"]);
  const at = (x, y = 300) => ({ x, y });
  const click = (button, from, to) => {
    press({ button, click_count: 1, ...(from && { position: from }) }, cx);
    releases[button]({ button, click_count: 1, ...(to && { position: to }) }, cx);
  };
  for (const button of Object.keys(releases)) {
    press({ button, click_count: 1, position: at(150) }, cx);
    await cx.fire();
    assert.deepEqual(host.runs, [], `not on a ${button} press`);
    releases[button]({ button, click_count: 1, position: at(158) }, cx);
    assert.deepEqual(host.runs, [], "nor during its release");
    await cx.fire();
    assert.deepEqual(host.runs.splice(0), SHOW_TAB, `after a ${button} release 8 px away, the board having the keyboard`);
  }
  click("left", at(150), at(150, 292));
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), SHOW_TAB, "8 px up");
  click("left", at(150), at(260));
  click("left", at(150), at(156, 306));
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "a drag keeps the board: 110 px across, then 6 px each way");
  click("left", null, at(400));
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), SHOW_TAB, "a press without a position counts as not moved");
  click("left", at(150), null);
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), SHOW_TAB, "and so does a release without one");
  releases.left({ button: "left", click_count: 1, position: at(150) }, cx);
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "a release whose press was taken by a release before");
  press({ button: "left", click_count: 1, position: at(150) }, cx);
  releases.right({ button: "right", click_count: 1, position: at(150) }, cx);
  releases.left({ button: "left", click_count: 1, position: at(150) }, cx);
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "a release of another button takes the press too");
  click("left", at(150), at(150));
  b.handle.held = false;
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [SHOW_TAB[0]], "the click took the keyboard (Files, Changes, the leader's popup): it keeps it");
  b.handle.focus();
  press({ button: "left", click_count: 1, position: at(150) }, cx);
  // herdr runs what the press queued before the board button's layout.select.
  await cx.fire();
  host.tree = layerLayout("main");
  host.tree = layerLayout("board");
  await host.command("focus");
  outsideHandlers(b, cx).releases.left({ button: "left", click_count: 2, position: at(150) }, cx);
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "the board button pressed twice before a look, the hidden board not told the first release: the second keeps the board shown again");
  press({ button: "left", click_count: 1, position: at(150) }, cx);
  host.tree = layerLayout("main");
  await cx.look();
  host.tree = layerLayout("board");
  await cx.look();
  releases.left({ button: "left", click_count: 1, position: at(150) }, cx);
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "a press from before the board hid");
  press({ button: "left", click_count: 1, position: at(150) }, cx);
  host.tree = layerLayout("main");
  releases.left({ button: "left", click_count: 1, position: at(150) }, cx);
  await cx.fire();
  assert.deepEqual(host.runs.splice(0), [], "a release before herdr draws the board hidden: the board button's press already showed the tab");
  const inTab = await openBoard({ tree: layerLayout("main") });
  const tab = outsideHandlers(inTab.b, inTab.cx);
  tab.press({ button: "left", click_count: 1, position: at(150) }, inTab.cx);
  inTab.host.tree = layerLayout("board");
  tab.releases.left({ button: "left", click_count: 1, position: at(150) }, inTab.cx);
  await inTab.cx.fire();
  assert.deepEqual(inTab.host.runs, [], "a Board tab's board, its release before herdr draws it hidden: the board button's press showed the layer's");
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

test("UI: hidden columns are not drawn; the line below the columns names them, h/l skip them", async () => {
  const { b, cx, st } = await openBoard();
  const root = b.render();
  assert.deepEqual(texts(byId(root, "hidden-columns")), ["ausgeblendet:", "Backlog", "Done"]);
  const around = chainTo(root, hasId("columns")).at(-2);
  assert.deepEqual(around.kids.map((k) => k.with?.id?.[0]).filter((id) => ["columns", "hidden-columns"].includes(id)), ["columns", "hidden-columns"], "below the columns, beside them in one block");
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

const ALL_HIDDEN = "Alle Spalten sind ausgeblendet: ein Name unten oder „Spalten…“ im Befehlsmenü (:) zeigt eine wieder";

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
  assert.ok(texts(byId(b.render(), "columns-menu")).includes("Spalten zeigen · Enter · Esc"), "under its title");
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

test("UI: Enter in the dialog opens the session in the checkout, as a tab in the shown space; Esc does nothing while it starts", async () => {
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
  assert.deepEqual(host.runs.at(-1), ["tab.new", { name, space: "s1", folder: "/home/me/src/tender", argv: ["claude"], task: "/work 3004" }]);
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
  assert.equal(b.notice.text, "Kein Tab „tender#3004 feat(api): page through long lists“ erschienen; die Sitzung ist wohl nicht gestartet");
  assert.equal(host.notes.at(-1).level, "warning");
});
test("UI: a checkout that is missing, or a folder not read, is said in the dialog, which stays", async () => {
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

const SESSION = "tender#3004 feat(api): page through long lists";
const spaceOf = (id, name, machine = null, active = false) => ({ id, name, folder: `/r/${name}`, machine, branch: "main", active, status: null, tabs: [{ id: `${id}t`, name: "1" }] });
// The start dialog's "Öffnen in" value and whether it shows the new
// space's name field.
const openInShown = (b) => {
  const root = b.render();
  return [texts(byId(root, "choice-open"))[0], texts(root).includes("Name des neuen Space")];
};
// The board's own space, moved to a machine the dialog does not offer, so
// that this one has none.
const elsewhere = (host) => ({ ...host.spaceList[0], machine: "laptop" });
// From the message to "Öffnen in", then space: its list.
async function openPicker(b, cx) {
  for (let i = 0; i < 3; i++) await press(b, cx, "tab");
  assert.equal(b.modal.field, "open");
  await press(b, cx, "space");
  assert.equal(b.modal.list?.choice, "open");
}
// The open list's rows, as drawn under its field.
const listRowsDrawn = (b) => byId(b.render(), "choice-list-rows").kids.filter((k) => k.with.id?.[0]?.startsWith("choice-list-row-"));
const shownRows = (b) => listRowsDrawn(b).map((k) => texts(k).join(""));
// The open list's rows drawn as marked.
const markedRows = (b) => listRowsDrawn(b).filter((k) => k.styles.includes("bg")).map((k) => texts(k).join(""));
// Enter in the open list's filter: its marked row.
const pickRow = (b, cx) => cx.call((own) => b.modal.list.input.submit(own));

test("UI: Öffnen in preselects the space named like the repo, and the session opens as a tab there", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "Tender")];
  await openStart(b, cx);
  assert.deepEqual(openInShown(b), ["Tender", false]);
  await press(b, cx, "tab");
  await press(b, cx, "enter");
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.deepEqual(host.runs.at(-1), ["tab.new", { name: SESSION, space: "s3", folder: "/home/me/src/tender", argv: ["claude"], task: "/work 3004" }]);
});

test("UI: space on Öffnen in opens its list under the field: Neuer Space and this machine's spaces, the choice marked; the filter narrows them, Enter takes one and closes the list", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "tender"), spaceOf("s4", "srv", "server"), spaceOf("s5", "tend")];
  await openStart(b, cx);
  await openPicker(b, cx);
  assert.deepEqual(shownRows(b), ["Neuer Space …", "x/r/tender", "tender/r/tender", "tend/r/tend"]);
  const popup = byId(b.render(), "choice-open-list");
  assert.deepEqual([popup.kind, popup.with.anchor, chainTo(popup, hasId("choice-list-rows")) !== null], ["popup", ["top_right"], true], "anchored at the field, not a dialog over the dialog");
  assert.equal(b.modal.list.at, 2, "the dialog's choice");
  b.modal.list.input.type("tend");
  assert.equal(b.modal.list.at, 0, "under a filter the first row it leaves");
  assert.deepEqual(shownRows(b), ["tend/r/tend", "tender/r/tender"]);
  b.modal.list.input.type("zz");
  assert.deepEqual([shownRows(b), b.modal.list.at], [[], -1]);
  assert.ok(texts(b.render()).includes("Kein Space passt zum Filter"));
  assert.equal(b.modal.inputFocused, true, "the filter has the keyboard");
  b.modal.list.input.type("x");
  assert.deepEqual([shownRows(b), b.modal.list.at], [["x/r/tender"], 0]);
  pickRow(b, cx);
  assert.deepEqual([b.modal.kind, b.modal.field, b.modal.list], ["start", "open", null]);
  assert.ok(b.handle.held, "the board has the keyboard for the choice");
  assert.deepEqual(openInShown(b), ["x", false]);
  assert.equal(byId(b.render(), "choice-list"), null, "the list closed");
  board.startModal.start(b, cx);
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(host.runs.at(-1)[1].space, "s1");
});

test("UI: Neuer Space … taken from the list shows the name field, prefilled with the repo's name, which takes the keyboard; Enter there opens a space of that name", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  await openPicker(b, cx);
  await press(b, cx, "up");
  pickRow(b, cx);
  const m = b.modal;
  assert.deepEqual([m.kind, m.field, m.inputFocused, m.nameInput.value()], ["start", "name", true, "tender"]);
  assert.deepEqual(openInShown(b), ["Neuer Space …", true]);
  m.nameInput.type("api work");
  cx.call((own) => m.nameInput.submit(own));
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.deepEqual(host.runs.at(-1), ["space.new", { name: "api work", tab: SESSION, machine: "", folder: "/home/me/src/tender", argv: ["claude"], task: "/work 3004" }]);
});

test("UI: Esc in a choice's list closes only the list, taking nothing; a second Esc closes the dialog", async () => {
  const { b, cx } = await openBoard();
  await openStart(b, cx);
  const m = b.modal;
  await openPicker(b, cx);
  await press(b, cx, "up");
  await press(b, cx, "escape");
  assert.deepEqual([b.modal, m.list], [m, null]);
  assert.deepEqual([m.field, b.handle.held, openInShown(b)], ["open", true, ["x", false]]);
  await press(b, cx, "escape");
  assert.equal(b.modal, null);
});

test("UI: a click on Öffnen in opens its list; a click on a row takes it; a press beside the list closes it, taking nothing", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "work")];
  await openStart(b, cx);
  await click(b, cx, "choice-open");
  assert.equal(b.modal.list?.choice, "open");
  await click(b, cx, "choice-list-row-2");
  assert.deepEqual([b.modal.kind, b.modal.list, openInShown(b)], ["start", null, ["work", false]]);
  await click(b, cx, "choice-open");
  const list = byId(b.render(), "choice-list");
  const inside = fakeCx();
  inside.call((own) => list.with.on_mouse_down[1]({}, own));
  assert.equal(inside.stopped, 1, "a press on the list stays there");
  const shield = byId(b.render(), "choice-list-shield");
  const beside = fakeCx();
  beside.call((own) => shield.with.on_mouse_down[1]({}, own));
  assert.deepEqual([beside.stopped, b.modal.list, openInShown(b), b.handle.held], [1, null, ["work", false], true]);
  assert.equal(byId(b.render(), "choice-list-shield"), null, "no shield without a list");
});

test("UI: a new space needs a name: without one the dialog says so and starts nothing", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [elsewhere(host)];
  await openStart(b, cx);
  assert.deepEqual(openInShown(b), ["Neuer Space …", true], "no space on the machine: a new one");
  b.modal.nameInput.type("  ");
  board.startModal.start(b, cx);
  await settle();
  assert.equal(b.modal.error, "Der neue Space braucht einen Namen");
  assert.deepEqual([host.open("sh").length, host.runs.length, b.modal.busy], [0, 0, null]);
});

test("UI: Tab reaches the new space's name only while a new space is chosen", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  for (let i = 0; i < 4; i++) await press(b, cx, "tab");
  assert.equal(b.modal.field, "message", "a space is chosen: round to the message");
  host.spaceList = [];
  for (let i = 0; i < 4; i++) await press(b, cx, "tab");
  assert.deepEqual([b.modal.field, b.modal.inputFocused], ["name", true]);
  const stopped = cx.stopped;
  await press(b, cx, "l");
  assert.equal(cx.stopped, stopped, "typing goes to the name");
  await press(b, cx, "tab");
  assert.equal(b.modal.field, "message");
});

test("UI: another machine in the dialog runs the checkout there and opens the tab in its space; a space of another machine is not offered here", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [elsewhere(host), spaceOf("s2", "tender", "server")];
  await openStart(b, cx);
  assert.deepEqual(openInShown(b), ["Neuer Space …", true], "this machine has no space");
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  await press(b, cx, "l");
  await settle();
  assert.deepEqual(openInShown(b), ["tender", false], "the server's space");
  await press(b, cx, "enter");
  assert.equal(host.open("sh")[0].options.on, "server");
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.deepEqual(host.runs.at(-1), ["tab.new", { name: SESSION, space: "s2", folder: "/home/me/src/tender", argv: ["claude"], task: "/work 3004" }]);
});

test("UI: a new space on another machine is made there with its name", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  await press(b, cx, "l");
  await settle();
  assert.deepEqual(openInShown(b), ["Neuer Space …", true], "no space on the server");
  await press(b, cx, "enter");
  await host.answer("sh", ok("/srv/tender\n"));
  assert.deepEqual(host.runs.at(-1), ["space.new", { name: "tender", tab: SESSION, machine: "server", folder: "/srv/tender", argv: ["claude"], task: "/work 3004" }]);
});

test("UI: changing the machine drops the space chosen and preselects among that machine's spaces again", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "tender"), spaceOf("s4", "a", "server"), spaceOf("s5", "TENDER", "server")];
  await openStart(b, cx);
  await openPicker(b, cx);
  b.modal.list.input.type("x");
  pickRow(b, cx);
  assert.deepEqual(openInShown(b), ["x", false]);
  await press(b, cx, "tab", { modifiers: { shift: true } });
  await press(b, cx, "l");
  await settle();
  assert.deepEqual(openInShown(b), ["TENDER", false]);
  await press(b, cx, "l");
  await settle();
  assert.deepEqual(openInShown(b), ["tender", false], "back here: the rule again, not the earlier choice");
});

test("UI: a machine whose spaces herdr has not read says so in the dialog and the list, and leaves Neuer Space usable", async () => {
  const { b, cx, host } = await openBoard();
  let layout = "loading";
  host.machines = () => [{ name: null, layout: "ready" }, { name: "server", layout }];
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s4", "srv", "server")];
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  await press(b, cx, "l");
  await settle();
  const note = "Die Spaces auf server sind noch nicht gelesen; „Neuer Space …“ geht trotzdem";
  assert.ok(texts(b.render()).includes(note));
  assert.deepEqual(openInShown(b), ["Neuer Space …", true]);
  await press(b, cx, "tab");
  await press(b, cx, "space");
  assert.deepEqual(shownRows(b), ["Neuer Space …"]);
  assert.ok(texts(byId(b.render(), "choice-list")).includes(note), "the list says so too");
  await press(b, cx, "escape");
  layout = "unavailable";
  assert.ok(texts(b.render()).includes("Die Spaces auf server sind nicht lesbar; „Neuer Space …“ geht trotzdem"));
  host.machines = () => [{ name: null, layout: "ready" }];
  assert.ok(texts(b.render()).includes("Die Spaces auf server sind nicht lesbar; „Neuer Space …“ geht trotzdem"), "gone from herdr's machines");
  host.machines = () => [{ name: null, layout: "ready" }, { name: "server", layout }];
  layout = "ready";
  assert.deepEqual(openInShown(b), ["srv", false], "read now: its spaces are offered");
  assert.equal(texts(b.render()).some((s) => s.startsWith("Die Spaces")), false);
});

test("UI: spaces herdr reads while the new space's name is given, or after it was typed, do not take its place", async () => {
  const { b, cx, host } = await openBoard();
  let layout = "loading";
  host.machines = () => [{ name: null, layout: "ready" }, { name: "server", layout }];
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s4", "srv", "server")];
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  await press(b, cx, "l");
  await settle();
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  assert.equal(b.modal.field, "name");
  layout = "ready";
  assert.deepEqual(openInShown(b), ["Neuer Space …", true], "on the name");
  await press(b, cx, "tab");
  assert.deepEqual(openInShown(b), ["srv", false], "left untyped: the rule again");
  layout = "loading";
  for (let i = 0; i < 4; i++) await press(b, cx, "tab");
  assert.equal(b.modal.field, "name");
  b.modal.nameInput.type("mine");
  await press(b, cx, "tab");
  layout = "ready";
  assert.deepEqual(openInShown(b), ["Neuer Space …", true], "typed: kept");
});

test("UI: a space chosen that goes before the checkout is found is said in the dialog, which stays", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "tender")];
  await openStart(b, cx);
  board.startModal.start(b, cx);
  await settle();
  host.spaceList = [host.spaceList[0]];
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.deepEqual([b.modal?.kind, b.modal.error, host.runs.length], ["start", "Den Space „tender“ auf diesem Rechner gibt es nicht mehr", 0]);
});

const shiftTab = (b, cx) => press(b, cx, "tab", { modifiers: { shift: true } });

test("UI: a tab of the session's name there before Starten is not the session just opened", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  host.spaceList = [...host.spaceList, { ...spaceOf("s8", "tender"), tabs: [{ id: "t8", name: SESSION }] }];
  board.startModal.start(b, cx);
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  await cx.fire();
  await cx.fire();
  await cx.fire();
  assert.equal(b.notice.text, `Kein Tab „${SESSION}“ erschienen; die Sitzung ist wohl nicht gestartet`);
});

test("UI: the session is there once a tab of its name is; a space of its name without one is not it", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  board.startModal.start(b, cx);
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  host.spaceList = [...host.spaceList, spaceOf("s9", SESSION)];
  await cx.fire();
  assert.equal(b.notice.text, `Sitzung wird geöffnet: ${SESSION}`);
  host.spaceList = [...host.spaceList, { ...spaceOf("s8", "tender"), tabs: [{ id: "t8", name: SESSION }] }];
  await cx.fire();
  assert.equal(b.notice.text, `Sitzung geöffnet: ${SESSION}`);
});

test("UI: a typed name keeps a new space across a machine change; Neuer Space untyped, or a space picked after the typing, chooses anew", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s4", "srv", "server")];
  await openStart(b, cx);
  await openPicker(b, cx);
  await press(b, cx, "up");
  pickRow(b, cx);
  await shiftTab(b, cx);
  await shiftTab(b, cx);
  assert.equal(b.modal.field, "machine");
  await press(b, cx, "l");
  await settle();
  assert.deepEqual(openInShown(b), ["srv", false], "untyped: chosen anew");
  await press(b, cx, "h");
  await settle();
  await press(b, cx, "tab");
  await press(b, cx, "space");
  await press(b, cx, "up");
  pickRow(b, cx);
  b.modal.nameInput.type("api");
  await shiftTab(b, cx);
  await shiftTab(b, cx);
  await press(b, cx, "l");
  await settle();
  assert.deepEqual([openInShown(b), b.modal.nameInput.value()], [["Neuer Space …", true], "api"], "typed: kept");
  await press(b, cx, "tab");
  await press(b, cx, "space");
  await press(b, cx, "down");
  pickRow(b, cx);
  assert.deepEqual(openInShown(b), ["srv", false]);
  await shiftTab(b, cx);
  await press(b, cx, "h");
  await settle();
  assert.deepEqual(openInShown(b), ["x", false], "a space picked after the typing: chosen anew");
});

test("UI: a chosen space that closes while the dialog waits is said there, and Starten waits for a new choice; a preselected one gives way to the rule", async () => {
  const { b, cx, host } = await openBoard();
  const all = [{ ...host.spaceList[0] }, spaceOf("s3", "tender"), spaceOf("s4", "work")];
  host.spaceList = all;
  await openStart(b, cx);
  host.spaceList = all.filter((s) => s.id !== "s3");
  assert.deepEqual(openInShown(b), ["x", false], "preselected: the rule again");
  assert.equal(texts(b.render()).some((s) => s.includes("gibt es nicht mehr")), false);
  host.spaceList = all;
  await openPicker(b, cx);
  b.modal.list.input.type("work");
  pickRow(b, cx);
  host.spaceList = all.filter((s) => s.id !== "s4");
  const note = "Den Space „work“ auf diesem Rechner gibt es nicht mehr; bitte neu wählen";
  assert.ok(texts(b.render()).includes(note));
  assert.deepEqual(openInShown(b), ["work", false], "no other space in its place, and no new one");
  const machines = host.machines;
  host.machines = () => [{ name: null, layout: "loading" }];
  assert.deepEqual([texts(b.render()).includes(note), openInShown(b)], [false, ["work", false]], "not read: not said to be gone");
  host.machines = machines;
  board.startModal.start(b, cx);
  await settle();
  assert.deepEqual([host.open("sh").length, host.runs.length, b.modal.busy], [0, 0, null]);
  await press(b, cx, "tab");
  assert.equal(b.modal.field, "message", "no name field to walk to");
  await shiftTab(b, cx);
  await press(b, cx, "space");
  assert.deepEqual([b.modal.list.at, markedRows(b)], [-1, []], "the chosen space not listed: nothing marked");
  await press(b, cx, "enter");
  pickRow(b, cx);
  assert.deepEqual([b.modal.list?.choice, texts(b.render()).includes(note), b.modal.busy], ["open", true, null], "Enter takes nothing");
  await press(b, cx, "down");
  assert.deepEqual(markedRows(b), ["Neuer Space …"], "↓ starts at the first row");
  await press(b, cx, "escape");
  await press(b, cx, "space");
  await press(b, cx, "up");
  assert.deepEqual(markedRows(b), ["Neuer Space …"], "↑ starts at the first row");
  b.modal.list.input.type("tender");
  pickRow(b, cx);
  assert.equal(texts(b.render()).includes(note), false);
  board.startModal.start(b, cx);
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(host.runs.at(-1)[1].space, "s3");
});

test("UI: a chosen space that goes before the checkout is found leaves the dialog saying so, without a second error", async () => {
  const { b, cx, host } = await openBoard();
  const all = [{ ...host.spaceList[0] }, spaceOf("s4", "work")];
  host.spaceList = all;
  await openStart(b, cx);
  await openPicker(b, cx);
  b.modal.list.input.type("work");
  pickRow(b, cx);
  board.startModal.start(b, cx);
  await settle();
  host.spaceList = [all[0]];
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.deepEqual([b.modal?.kind, b.modal.error, b.modal.busy, host.runs.length], ["start", null, null, 0]);
  assert.ok(texts(b.render()).includes("Den Space „work“ auf diesem Rechner gibt es nicht mehr; bitte neu wählen"));
});

const UNREAD_WORK = "Den Space „work“ auf diesem Rechner kann das Board erst prüfen, wenn es die Spaces dort gelesen hat; warten oder neu wählen";

test("UI: a chosen space on a machine whose spaces herdr is reading is said in the dialog, and Starten starts nothing; the note goes once they are read or with another machine", async () => {
  const { b, cx, host } = await openBoard();
  let layout = "ready";
  host.machines = () => [{ name: null, layout }, { name: "server", layout }];
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s4", "work")];
  await openStart(b, cx);
  await openPicker(b, cx);
  b.modal.list.input.type("work");
  pickRow(b, cx);
  layout = "loading";
  board.startModal.start(b, cx);
  await settle();
  assert.deepEqual([b.modal.error, b.modal.busy, host.open("sh").length, host.runs.length], [null, null, 0, 0]);
  assert.equal(texts(b.render()).filter((s) => s === UNREAD_WORK).length, 1);
  assert.equal(texts(b.render()).some((s) => s.includes("gibt es nicht mehr")), false, "not said to be gone");
  await press(b, cx, "space");
  assert.deepEqual([shownRows(b), b.modal.list.at, markedRows(b)], [["Neuer Space …"], -1, []], "its list marks nothing");
  await press(b, cx, "enter");
  assert.deepEqual([b.modal.list?.choice, openInShown(b)], ["open", ["work", false]], "Enter takes nothing");
  await press(b, cx, "escape");
  layout = "ready";
  assert.deepEqual([texts(b.render()).includes(UNREAD_WORK), openInShown(b)], [false, ["work", false]], "read now");
  layout = "loading";
  await shiftTab(b, cx);
  await press(b, cx, "l");
  await settle();
  assert.deepEqual([texts(b.render()).some((s) => s.startsWith("Den Space „work“")), texts(b.render()).includes("Die Spaces auf server sind noch nicht gelesen; „Neuer Space …“ geht trotzdem")], [false, true], "another machine, read neither");
});

test("UI: a chosen space no longer listed after the checkout, on a machine whose spaces herdr is reading, is said in the dialog, which stays", async () => {
  const { b, cx, host } = await openBoard();
  let layout = "ready";
  host.machines = () => [{ name: null, layout }];
  const all = [{ ...host.spaceList[0] }, spaceOf("s4", "work")];
  host.spaceList = all;
  await openStart(b, cx);
  await openPicker(b, cx);
  b.modal.list.input.type("work");
  pickRow(b, cx);
  board.startModal.start(b, cx);
  await settle();
  layout = "loading";
  host.spaceList = [all[0]];
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.deepEqual([b.modal?.kind, b.modal.error, b.modal.busy, host.runs.length], ["start", null, null, 0]);
  assert.equal(texts(b.render()).filter((s) => s === UNREAD_WORK).length, 1);
  layout = "ready";
  assert.deepEqual([texts(b.render()).includes(UNREAD_WORK), texts(b.render()).includes("Den Space „work“ auf diesem Rechner gibt es nicht mehr; bitte neu wählen")], [false, true], "read now: gone");
});

test("UI: a preselected space no longer listed after the checkout, on a machine whose spaces herdr is reading, is the dialog's error without the advice, and the dialog stays", async () => {
  const { b, cx, host } = await openBoard();
  const all = [{ ...host.spaceList[0] }, spaceOf("s3", "tender")];
  host.spaceList = all;
  await openStart(b, cx);
  board.startModal.start(b, cx);
  await settle();
  host.machines = () => [{ name: null, layout: "loading" }];
  host.spaceList = [all[0]];
  await host.answer("sh", ok("/home/me/src/tender\n"));
  const why = "Den Space „tender“ auf diesem Rechner konnte das Board nicht prüfen; die Spaces dort waren nicht gelesen";
  assert.deepEqual([b.modal?.kind, b.modal.error, b.modal.busy, host.runs.length], ["start", why, null, 0]);
});

test("UI: a chosen space the board could not check after the checkout, with the dialog gone, is said in the banner and as an error toast, without the dialog's advice", async () => {
  const { b, cx, host } = await openBoard();
  const all = [{ ...host.spaceList[0] }, spaceOf("s4", "work")];
  host.spaceList = all;
  await openStart(b, cx);
  await openPicker(b, cx);
  b.modal.list.input.type("work");
  pickRow(b, cx);
  board.startModal.start(b, cx);
  await settle();
  b.modal = null;
  host.machines = () => [{ name: null, layout: "loading" }];
  host.spaceList = [all[0]];
  await host.answer("sh", ok("/home/me/src/tender\n"));
  const why = "Den Space „work“ auf diesem Rechner konnte das Board nicht prüfen; die Spaces dort waren nicht gelesen";
  assert.deepEqual([b.notice?.text, b.notice?.level, host.runs.length], [`tender#3004: Sitzung nicht geöffnet: ${why}`, "error", 0]);
  assert.deepEqual(host.notes.at(-1), { title: "Sitzung für tender#3004 nicht geöffnet", body: why, level: "error" });
});

test("UI: a space whose id is \"new\" is a space like any other", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("new", "work")];
  await openStart(b, cx);
  await openPicker(b, cx);
  b.modal.list.input.type("work");
  pickRow(b, cx);
  assert.deepEqual(openInShown(b), ["work", false]);
});

test("UI: an existing space picked after the new space's name was emptied starts there", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  await openPicker(b, cx);
  await press(b, cx, "up");
  pickRow(b, cx);
  b.modal.nameInput.type("");
  await shiftTab(b, cx);
  await press(b, cx, "space");
  await press(b, cx, "down");
  pickRow(b, cx);
  assert.deepEqual(openInShown(b), ["x", false]);
  board.startModal.start(b, cx);
  await settle();
  assert.equal(b.modal.error, null);
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.deepEqual(host.runs.at(-1), ["tab.new", { name: SESSION, space: "s1", folder: "/home/me/src/tender", argv: ["claude"], task: "/work 3004" }]);
});

test("UI: no choice opens its list or steps while the session starts", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  for (let i = 0; i < 3; i++) await press(b, cx, "tab");
  board.startModal.start(b, cx);
  await settle();
  const shown = openInShown(b);
  await press(b, cx, "l");
  assert.deepEqual(openInShown(b), shown);
  await press(b, cx, "space");
  await click(b, cx, "choice-open");
  await click(b, cx, "choice-agent");
  assert.deepEqual([b.modal.kind, b.modal.list], ["start", null]);
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(host.runs.length, 1);
});

test("UI: picking where the session opens clears the dialog's error", async () => {
  const { b, cx } = await openBoard();
  await openStart(b, cx);
  await openPicker(b, cx);
  await press(b, cx, "up");
  pickRow(b, cx);
  b.modal.nameInput.type(" ");
  board.startModal.start(b, cx);
  await settle();
  assert.ok(texts(b.render()).includes("Der neue Space braucht einen Namen"));
  await shiftTab(b, cx);
  await press(b, cx, "space");
  await press(b, cx, "down");
  pickRow(b, cx);
  assert.deepEqual([b.modal.error, texts(b.render()).includes("Der neue Space braucht einen Namen")], [null, false]);
});

test("UI: an item without a repo names its new space, and finds its space, by its checkout's last folder", async () => {
  const { b, cx, host } = await openBoard({ config: testConfig({ start: { checkout: "~/Repos/vc" } }) });
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "VC")];
  const item = { source: "azure", kind: "workitem", number: 301, title: "t", repo: null, assignees: [] };
  cx.call((own) => board.startModal.open(b, b.view(), item, own));
  await settle();
  assert.deepEqual([b.modal.nameInput.value(), openInShown(b)], ["vc", ["VC", false]]);
});

test("UI: a dialog's field keeps the keyboard where the blur of the field it came from comes after its focus", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [];
  await openStart(b, cx);
  const m = b.modal;
  const blurMessage = [];
  const message = m.input;
  const blur = message.blur;
  message.blur = () => blurMessage.push(blur);
  m.field = "name";
  b.takeKeyboard();
  assert.equal(m.inputFocused, true);
  blurMessage.forEach((late) => late());
  assert.equal(m.inputFocused, true, "the message's late blur leaves the name's focus");
  m.nameInput.blur();
  assert.equal(m.inputFocused, false);
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

test("UI: agents that answer while a list is open reach the dialog, also when the ask fails", async () => {
  const { b, cx, host } = await openBoard();
  const asks = [];
  host.knownAgents = ({ on }) => {
    const d = deferred();
    asks.push({ on, ...d });
    return d.promise;
  };
  const agentShown = () => texts(byId(b.render(), "choice-agent"))[0];
  await openStart(b, cx);
  await openPicker(b, cx);
  asks[0].resolve([{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }]);
  await settle();
  await press(b, cx, "escape");
  assert.equal(agentShown(), "Claude Code");
  await press(b, cx, "tab", { modifiers: { shift: true } });
  await press(b, cx, "l");
  await press(b, cx, "tab");
  await press(b, cx, "space");
  assert.deepEqual([b.modal.list?.choice, asks.map((a) => a.on)], ["open", [null, "server"]]);
  asks[1].reject(new Error("down"));
  await settle();
  await press(b, cx, "escape");
  assert.equal(agentShown(), "Agents auf server nicht lesbar: down");
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
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "v", "H/L", "s", "a", "Enter", "o", "m", "r", ":", "Esc"], "the Sprint's keys");
  await press(b, cx, "v");
  assert.deepEqual([layout(), shown().includes("az ist nicht installiert")], ["backlog", true], "the Backlog reads with az too");
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "v", "n", "s", "a", "Enter", "o", "m", "r", ":", "Esc"], "the Backlog's keys");
  await press(b, cx, "v");
  assert.equal(layout(), "sprint");
  await click(b, cx, "team-view-backlog");
  assert.equal(layout(), "backlog", "a click on the switch");
  await press(b, cx, "2");
  assert.ok(shown().includes("PR-Ansicht folgt"));
  assert.equal(byId(b.render(), "team-view"), null, "no view switch on the PRs tab");
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "m", "r", ":", "Esc"]);
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
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "n", "s", "a", "Enter", "o", "m", "r", ":", "Esc"]);
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
  b.state(view.id).data = { ...typedBoard(), limited: true, total: 9, read: 5 };
  assert.ok(texts(b.render()).some((s) => s.startsWith("Nur die ersten 5 von 9 Einträgen")), "the cut names how many items the data holds; the view has no limit");
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
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "H/L", "s", "a", "Enter", "o", "m", "r", ":", "Esc"]);
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "Enter", "o", "m", "r", ":", "Esc"]);
});

// Fires the left button's `event` ("on_mouse_down" or "on_mouse_up") on the
// element with the id `id`, as the board draws it now, the pointer at `at`
// in the window (null: an event without a position).
async function mouse(b, cx, id, event, at = { x: 100, y: 100 }) {
  const el = byId(b.render(), id);
  assert.ok(el, `no ${id}`);
  el.with[event][1]({ button: "left", click_count: 1, ...(at && { position: at }) }, cx);
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

test("UI: a press on a card released on it more than 8 px away is a drag given up: nothing chosen, no details; within 8 px it is a click", async () => {
  const { b, cx, st } = await openBoard();
  const release = (key, x, y = 100) => mouse(b, cx, `card-${key}`, "on_mouse_up", { x, y });
  const drag = async (key, x, y) => {
    await mouse(b, cx, `card-${key}`, "on_mouse_down");
    await release(key, x, y);
  };
  await drag("PVTI_rec1", 109);
  await drag("PVTI_rec1", 106, 106);
  assert.deepEqual([st().sel.key, st().detail, b.drag], ["PVTI_rec4", false, null], "dragged back onto itself twice, 9 px across, then 6 px each way");
  await drag("PVTI_rec1", 108);
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec1", false], "8 px across: a click chooses it");
  await drag("PVTI_rec1", 100, 108);
  assert.equal(st().detail, true, "8 px down: a second click opens the details");
  await press(b, cx, "escape");
  await drag("PVTI_rec1", 150, 140);
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec1", false], "the chosen card dragged back onto itself once opens nothing");
  await mouse(b, cx, "card-PVTI_rec1", "on_mouse_down", null);
  await release("PVTI_rec1", 300);
  assert.equal(st().detail, true, "a press without a position counts as not moved");
  await press(b, cx, "escape");
  await mouse(b, cx, "card-PVTI_rec1", "on_mouse_down");
  await mouse(b, cx, "card-PVTI_rec1", "on_mouse_up", null);
  assert.equal(st().detail, true, "and so does a release without one");
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
  const list = (col) => board.keptOf(b, b.navColumns(b.view())[col].id).scroll;
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

test("UI: „nur meine“ on stands on the theme's selected as the chosen tab does, with the accent border of its own, not as a primary button; its text, weight and padding stay, so its size never changes", async () => {
  const { b, cx, host } = await openBoard();
  host.theme = () => ({
    selected: "#selected", accent: "#accent", border: "#border", chrome: "#chrome", foreground: "#foreground", muted: "#muted",
    solid: "#solid", solid_foreground: "#solid-foreground", hover: "#hover",
  });
  const COLORS = ["bg", "border_color", "text_color", "hover"];
  const look = () => {
    const el = byId(b.render(), "mine");
    const hovered = el.with.hover[0](element("div"));
    return {
      text: texts(el), colors: [el.with.bg[0], el.with.border_color[0], el.with.text_color[0], hovered.with.bg[0]],
      size: el.calls.filter(([name]) => !COLORS.includes(name) && name !== "on_click"),
    };
  };
  const off = look();
  assert.deepEqual([off.text, off.colors], [["nur meine"], ["#chrome", "#border", "#muted", "#hover"]], "off");
  await press(b, cx, "m");
  const on = look();
  assert.deepEqual([on.text, on.colors], [["nur meine"], ["#selected", "#accent", "#foreground", "#hover"]], "on: no ✓, the chosen tab's ground");
  assert.deepEqual(on.size, off.size, "the same text size, padding, border and weight on and off");
  assert.equal(on.size.some(([name]) => /^font_/.test(name)), false, "no weight of its own");
  assert.equal(byId(b.render(), "tab-github:mine").with.bg[0], "#selected", "as the chosen tab");
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
  assert.equal(b.mine, true, "on");
  assert.equal(host.open("gh").length, 0, "nothing read again");
  assert.notEqual(st().sel.key, null);
  assert.ok(cards().includes(board.findCard(st().data, st().sel.key).card.number), "the selection leaves the card no longer shown");
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  assert.deepEqual(b.navColumns(b.view())[0].shown.map((r) => r.number), [2820, 77, 808],
    "the list: from a search of one's own, assigned, opened by sample-user; not the bot's own 1921");
  assert.ok(texts(b.render()).includes("REVIEW · 1"), "the review section, a search of one's own, keeps its row");
  assert.ok(texts(b.render()).includes("MINE · 2/3"), "and says what is hidden");
  assert.equal(texts(byId(b.render(), "tab-github:prs")).at(-1), "3/4", "so does the tab");
  await press(b, cx, "m");
  assert.deepEqual(b.navColumns(b.view())[0].shown.map((r) => r.number), [2820, 77, 1921, 808]);
});

test("a search of one's own is one with author, assignee, reviewed-by or (user-)review-requested set to @me, not negated", () => {
  const own = (q) => board.ownSearch(q);
  for (const q of ["is:pr author:@me", "is:pr assignee:@me", "is:pr review-requested:@me archived:false", "user-review-requested:@me is:open", "is:pr Author:@me",
    "is:pr is:open reviewed-by:@me -author:@me"]) {
    assert.equal(own(q), true, q);
  }
  for (const q of ["is:pr -author:@me", "is:pr NOT author:@me", "is:pr not review-requested:@me", "involves:@me", "mentions:@me", "commenter:@me",
    "-reviewed-by:@me", "NOT reviewed-by:@me", "user:@me", "is:pr author:someone", "is:pr", "", "author:@meow"]) {
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
  assert.deepEqual(rows.map((r) => [r.number, r.ownByQuery, board.isMine(r, "sample-user")]), [[2820, false, true], [77, false, true], [1921, false, false], [808, false, true]]);
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
  assert.equal(cells.length, 5, "label, title, whether sample-user has to act, draft mark, age");
  assert.deepEqual(cells.slice(0, 4), ["tender#2820", "build(ui): draw the summary card", "● Review angefragt", "Entwurf"]);
  // Rows with and without the mark keep their cells in line.
  const widths = (r) => byId(b.render(), `row-${r.key}`).kids.map((k) => k.with.w?.[0] ?? null);
  const [plain, draft] = [st.data.sections[1].rows[0], st.data.sections[1].rows.find((r) => r.draft)];
  assert.deepEqual(widths(plain), widths(draft), "the same cells on a draft row and on another");
  assert.equal(texts(byId(b.render(), `row-${plain.key}`)).includes("Entwurf"), false);
  assert.equal(texts(b.render()).some((s) => s.includes("undefined")), false);
  assert.equal(board.parseGithubBoard(json("github-board.json"), { ...githubView(), limit: 3 }, HIDDEN).read, 6, "the cut names how many items the answer holds, not the limit");
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

test("the leader, the board button and the board hold the same board layer block, focus-history and the tab bar its layer shape, the leader and the button the same toggle, the leader and focus-history the same place", () => {
  const history = resolve(modDir, "../focus-history/main.js");
  const tabs = resolve(modDir, "../board-tabs/main.js");
  const files = [join(buttonDir, "main.js"), resolve(modDir, "../leader/main.js"), join(modDir, "src/ui/layer.js")];
  const layer = markedCopy(files[0], "layer");
  assert.ok(layer?.includes("function boardLayer(root) {") && layer.includes("function leaveLayer(options) {"), "the button has the layer block");
  for (const file of files.slice(1)) assert.equal(markedCopy(file, "layer"), layer, file);
  const shape = markedCopy(files[0], "layer shape");
  assert.ok(shape?.includes("function boardLayer(root) {") && !shape.includes("function showTab("), "the button's layer block has the layer shape");
  for (const file of [...files.slice(1), history, tabs]) assert.equal(markedCopy(file, "layer shape"), shape, file);
  assert.equal(markedCopy(history, "layer"), null, "focus-history has the layer shape alone");
  assert.equal(markedCopy(tabs, "layer"), null, "the tab bar has the layer shape alone");
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

test("UI: the board button is on the accent while the board layer shows the board, as the tab row then marks no tab, and plain otherwise", async () => {
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
    ["tabs", "board-tabs", { weight: 1 }, true],
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

// ---- The tab bar (mods/board-tabs/) ----

const tabsDir = resolve(modDir, "../board-tabs");
const tabsBase = join(tabsDir, "upstream/main.js");
// The two files the tab bar compares at start: herdr's tabs mod and its base.
const SHIPPED_TABS = "/fake-home/mods/tabs/main.js";
const TABS_BASE = "/fake-home/mods/board-tabs/upstream/main.js";
const TABS_THEME = { ...THEME, raised: "#raised", dim: "#dim", working: "#working", blocked: "#blocked", done: "#done" };
// The tab bar's module, fresh as at the next start: herdr runs module code
// once per source version, shared by every copy.
let tabsImports = 0;
const tabsModule = async (file = join(tabsDir, "main.js")) => (await import(`${pathToFileURL(file).href}?start=${++tabsImports}`)).default;

// A fake host on which herdr's tabs mod is the tab bar's base.
function tabsHost() {
  const host = fakeHost();
  const base = readFileSync(tabsBase, "utf8");
  host.files = { [SHIPPED_TABS]: base, [TABS_BASE]: base };
  return host;
}

// A tab bar of `Tabs` on `host`, whose layout() is `tree()` and whose shown
// space has the tabs t1 and t2, t2 the shown one; render() draws it.
async function tabBar({ Tabs, tree = () => null, host = tabsHost() } = {}) {
  Tabs ??= await tabsModule();
  host.layout = () => tree();
  host.theme = () => TABS_THEME;
  host.window = () => null;
  host.image = (path) => element("image").path(path);
  host.panes = () => [];
  host.spaceList = [{ id: "s1", name: "x", active: true, tabs: [{ id: "t1", name: "one", named: true, active: false }, { id: "t2", name: "two", named: true, active: true }] }];
  globalThis.__boardHost = host;
  const view = new Tabs();
  const cx = fakeCx();
  view.init({}, cx);
  await settle();
  return { host, view, render: () => view.render(cx) };
}

// A drawing as data: each element's kind, calls (a function as "fn", a
// scroll handle as "scroll") and children.
const drawn = (el) => (typeof el === "string" ? el : {
  kind: el.kind,
  calls: el.calls.map(([name, ...args]) => [name, ...args.map((a) => (typeof a === "function" ? "fn" : a?.scroll_to_item ? "scroll" : a))]),
  kids: el.kids.map(drawn),
});

// How the tab bar draws a tab: its border, background and text colour, and
// whether it has a close button.
const tabLook = (bar, id) => {
  const el = byId(bar, `tab-${id}`);
  return [el.with.border_color[0], el.with.bg[0], el.with.text_color[0], Boolean(byId(el, `close-${id}`))];
};
const MARKED = ["#border", "#raised", "#fg", true];
const PLAIN = ["#chrome", "#chrome", "#muted", false];

test("UI: the tab bar marks no tab as the shown one while the board layer shows the board, and marks it again when the tab's content shows", async () => {
  let active = "main";
  const { render } = await tabBar({ tree: () => layerLayout(active) });
  const looks = () => [tabLook(render(), "t1"), tabLook(render(), "t2")];
  assert.deepEqual(looks(), [PLAIN, MARKED], "the tab's content shows");
  active = "board";
  assert.deepEqual(looks(), [PLAIN, PLAIN], "the board shows");
  active = "main";
  assert.deepEqual(looks(), [PLAIN, MARKED], "the tab's content again");
});

test("UI: the tab bar draws as herdr's tabs mod does in a layout without a board layer and while the layer shows the tab's content", async () => {
  const herdrs = await tabsModule(tabsBase);
  const withoutLayer = () => {
    const tree = layerLayout("main");
    const stack = findById(tree, "work-stack");
    stack.children = stack.children.filter((c) => c.id !== "board");
    return tree;
  };
  for (const [name, tree] of [["no layout", () => null], ["no board layer", withoutLayer], ["the tab's content", () => layerLayout("main")]]) {
    const copy = await tabBar({ tree });
    const theirs = await tabBar({ Tabs: herdrs, tree });
    assert.deepEqual(drawn(copy.render()), drawn(theirs.render()), name);
  }
  const copy = await tabBar({ tree: () => layerLayout("board") });
  const theirs = await tabBar({ Tabs: herdrs, tree: () => layerLayout("board") });
  assert.notDeepEqual(drawn(copy.render()), drawn(theirs.render()), "the board shows");
});

// The lines of `a` and `b` that differ, in order, as ["-", line of a] and
// ["+", line of b], from their longest common run of lines.
function lineDiff(a, b) {
  const common = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) i++, j++;
    else if (i < a.length && (j === b.length || common[i + 1][j] >= common[i][j + 1])) out.push(["-", a[i++]]);
    else out.push(["+", b[j++]]);
  }
  return out;
}

// What the tab bar changes in herdr's tabs mod besides its marked blocks
// (upstream, layer shape): a port applies these to herdr's new main.js.
const BOARD_LINES = [
  ["-", 'import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";'],
  ["+", 'import { appHome, checking, notify, readTextFile, spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";'],
  ["-", "  init() {"],
  ["+", "  init(_props, cx) {"],
  ["+", "    compareWithHerdr(cx);"],
  ["+", "    const boardShown = Boolean(boardLayer(layout())?.shown);"],
  ["+", "      const marked = c.active && !boardShown;"],
  ["-", "        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)"],
  ["+", "        .border(1).border_color(marked ? t.border : t.chrome).bg(marked ? t.raised : t.chrome).text_color(marked ? t.foreground : t.muted)"],
  ["-", "        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down(\"left\", stop).on_click((_e, cx) => { cx.stop_propagation(); run(\"tab.close\", { id: c.id }); }).child(svg(\"mods/pane/close.svg\").size(12))));"],
  ["+", "        .when(marked, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down(\"left\", stop).on_click((_e, cx) => { cx.stop_propagation(); run(\"tab.close\", { id: c.id }); }).child(svg(\"mods/pane/close.svg\").size(12))));"],
];

test("the tab bar is herdr's tabs mod as upstream/main.js holds it, with the board lines and its two marked blocks alone, and its mod.json names herdr's tabs mod and a version as what it is cloned from", () => {
  const copy = readFileSync(join(tabsDir, "main.js"), "utf8");
  const blocks = ["upstream", "layer shape"].map((name) => markedCopy(join(tabsDir, "main.js"), name));
  assert.ok(blocks.every(Boolean), "the upstream and layer shape blocks");
  const rest = blocks.reduce((text, block) => text.replace(`${block}// ---- end ${block.match(/^\/\/ ---- ([^:]+):/)[1]} ----\n\n`, ""), copy);
  assert.equal(rest.match(/^\/\/ ---- /gm), null, "no other marked block");
  assert.deepEqual(lineDiff(readFileSync(tabsBase, "utf8").split("\n"), rest.split("\n")), BOARD_LINES);
  const { name, version } = JSON.parse(readFileSync(join(tabsDir, "mod.json"), "utf8")).cloned_from;
  assert.equal(name, "tabs");
  assert.ok(typeof version === "string" && version.trim() !== "", `a version: ${version}`);
});

const UPSTREAM_NOTICE = [["herdr hat seinen Tab-Mod geändert", "Die eigene Kopie (mods/board-tabs) nachziehen: README, „herdr app“.", "warning"]];
const notices = (host) => host.notes.map((n) => [n.title, n.body, n.level]);

// console.warn's lines while `fn` runs.
async function warnLines(fn) {
  const lines = [];
  const warn = console.warn;
  console.warn = (...args) => lines.push(args.join(" "));
  try {
    await fn();
  } finally {
    console.warn = warn;
  }
  return lines;
}

test("UI: at start the tab bar says in German when herdr's tabs mod is no longer its base, once a start, and nothing while it is", async () => {
  const base = readFileSync(tabsBase, "utf8");
  const host = tabsHost();
  await tabBar({ host });
  assert.deepEqual(host.notes, [], "herdr's is the base");
  const Tabs = await tabsModule();
  const changed = fakeHost();
  changed.files = { [SHIPPED_TABS]: `${base}// herdr's next version\n`, [TABS_BASE]: base };
  await tabBar({ Tabs, host: changed });
  assert.deepEqual(notices(changed), UPSTREAM_NOTICE, "herdr's changed");
  await tabBar({ Tabs, host: changed });
  assert.deepEqual(notices(changed), UPSTREAM_NOTICE, "a second window of the same start");
  const next = fakeHost();
  next.files = changed.files;
  await tabBar({ host: next });
  assert.deepEqual(notices(next), UPSTREAM_NOTICE, "the next start");
});

const SHIPPED_MISSING = ["herdr hat keinen Tab-Mod mehr unter mods/tabs", "Die eigene Kopie (mods/board-tabs) prüfen: README, „herdr app“.", "warning"];
const BASE_MISSING = ["Der eigenen Kopie (mods/board-tabs) fehlt ihre Basis", "Ohne upstream/main.js vergleicht sie herdrs Tab-Mod nicht: README, „herdr app“.", "warning"];

test("UI: at start the tab bar says in German when herdr's tabs mod or its own base is missing, and writes no warning to the log", async () => {
  const base = readFileSync(tabsBase, "utf8");
  for (const [name, files, said] of [
    ["herdr's missing", { [TABS_BASE]: base }, [SHIPPED_MISSING]],
    ["the base missing", { [SHIPPED_TABS]: `${base}// next\n` }, [BASE_MISSING]],
    ["both missing", {}, [SHIPPED_MISSING, BASE_MISSING]],
  ]) {
    const host = fakeHost();
    host.files = files;
    const lines = await warnLines(() => tabBar({ host }));
    assert.deepEqual([lines, notices(host)], [[], said], name);
  }
});

test("UI: a read the tab bar's comparison with herdr's tabs mod cannot make says so in herdr's log as a warning and shows no notice for it", async () => {
  const base = readFileSync(tabsBase, "utf8");
  for (const [name, files, fails, line, said] of [
    ["herdr's failed", { [TABS_BASE]: base }, SHIPPED_TABS, "board-tabs: cannot compare with herdr's tabs mod: tabs/main.js: read broke", []],
    ["the base failed", { [SHIPPED_TABS]: `${base}// next\n` }, TABS_BASE, "board-tabs: cannot compare with herdr's tabs mod: board-tabs/upstream/main.js: read broke", []],
    ["herdr's failed, the base missing", {}, SHIPPED_TABS, "board-tabs: cannot compare with herdr's tabs mod: tabs/main.js: read broke", [BASE_MISSING]],
  ]) {
    const host = fakeHost();
    host.files = files;
    const read = host.readTextFile;
    host.readTextFile = async (path) => {
      if (path === fails) throw new Error("read broke");
      return read(path);
    };
    const lines = await warnLines(() => tabBar({ host }));
    assert.deepEqual([lines, notices(host)], [[line], said], name);
  }
});

test("UI: under herdr-app check the tab bar compares nothing", async () => {
  const host = fakeHost();
  const reads = [];
  host.readTextFile = async (path) => (reads.push(path), null);
  host.checking = () => true;
  const lines = await warnLines(() => tabBar({ host }));
  assert.deepEqual([reads, lines, host.notes], [[], [], []]);
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
  list[0].attributes.finishDate = `${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T00:00:00+00:00`;
  return JSON.stringify(list);
}
// The Sprint's az calls, told apart by their arguments.
const AZ = {
  iteration: (a) => a.includes("--timeframe"),
  areas: (a) => a[0] === "boards" && a[1] === "area",
  columns: (a) => a.includes("taskboardColumns"),
  types: (a) => a.includes("workitemtypes"),
  config: (a) => a.includes("backlogconfiguration"),
  teamSettings: (a) => a.includes("show-default-iteration"),
  places: (a) => a.includes("taskboardWorkItems") && !a.includes("PATCH"),
  query: (a) => a[0] === "boards" && a[1] === "query",
  // The query for the items' parents outside the sprint.
  parents: (a) => a[0] === "boards" && a[1] === "query" && a.some((x) => String(x).includes("[System.Id] IN (")),
  me: (a) => a[0] === "account",
  move: (a) => a.includes("PATCH"),
  state: (a) => a[1] === "work-item",
};
const openAz = (host, kind) => host.open("az").filter((c) => AZ[kind](c.args));
const SETTINGS = ["iteration", "areas", "columns", "types"];
// The order field the backlog configuration fixture names.
const STACK_RANK = "Microsoft.VSTS.Common.StackRank";
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
  const answers = {
    iteration, areas: fixture("azure-sprint-areas.json"), columns: fixture("azure-sprint-columns.json"), types: fixture("azure-sprint-types.json"),
    config: fixture("azure-backlog-config.json"),
  };
  for (const [kind, out] of Object.entries(answers)) if (openAz(host, kind).length) await host.answer("az", ok(out), AZ[kind]);
}
// A refresh of the shown Sprint, as its timer starts one (not r, which
// drops what is kept of the team first).
async function refreshSprint(b, cx) {
  b.refresh(b.view(), cx);
  await settle();
}
// One refresh's answers; `me`: the account's answer (true: the fixture's,
// false: none is asked); `parents`: the answer for the parents outside the
// sprint and `teamSettings` the team's settings beside it, where the Sprint
// asks for them.
async function answerRefresh(host, {
  me = true, items = fixture("azure-sprint-items.json"), places = fixture("azure-sprint-taskboard.json"), parents = ok(fixture("azure-sprint-parents.json")),
  teamSettings = ok(fixture("azure-backlog-settings.json")),
} = {}) {
  await host.answer("az", ok(places), AZ.places);
  await host.answer("az", ok(items), AZ.query);
  if (openAz(host, "parents").length) await host.answer("az", parents, AZ.parents);
  if (openAz(host, "teamSettings").length) await host.answer("az", teamSettings, AZ.teamSettings);
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
  assert.equal(wiql, "SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo], [System.Parent], [System.AreaPath], [System.IterationPath], " +
    "[Microsoft.VSTS.Common.Priority] " +
    "FROM WorkItems WHERE [System.IterationPath] = 'Example Project\\Sprint 12' AND ([System.AreaPath] UNDER 'Example Project\\Core' OR [System.AreaPath] = 'Example Project\\Shared') " +
    "ORDER BY [System.Id]");
  const quoted = board.sprintWiql({ path: "P\\Sprint 'x'" }, { field: "System.AreaPath", values: [{ value: "P\\O'Neil", includeChildren: true }] });
  assert.match(quoted, /\[System\.IterationPath\] = 'P\\Sprint ''x''' AND \(\[System\.AreaPath\] UNDER 'P\\O''Neil'\)/);
  assert.match(board.sprintWiql({ path: "P" }, { field: "Custom.Team", values: [{ value: "Core", includeChildren: true }] }), /AND \(\[Custom\.Team\] = 'Core'\)/,
    "a team field that is no area path has no level below");
});

test("the Sprint's answers: the current sprint, the team's areas, the columns in their order, each work item's column, the work items, who az is", () => {
  assert.deepEqual(board.parseIteration(fixture("azure-sprint-iteration.json")),
    { id: ITERATION_ID, name: "Sprint 12", path: "Example Project\\Sprint 12", start: "2026-11-16T00:00:00+00:00", finish: "2026-11-27T00:00:00+00:00" });
  const past = { id: "old", name: "Sprint 11", path: "Example Project\\Sprint 11", attributes: { timeFrame: "past" } };
  assert.equal(board.parseIteration(JSON.stringify([past, ...json("azure-sprint-iteration.json")])).id, ITERATION_ID, "the current one");
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
    assignees: ["Alex Sample"], assigneeLogins: ["alex.sample@example.com"], parent: null, parentTitle: null, area: "Example Project\\Core",
    iteration: "Example Project\\Sprint 12", priority: null, url: "https://dev.azure.com/example-org/Example%20Project/_workitems/edit/301", labels: [], sub: null,
    branch: null,
  });
  assert.equal(items[2].parent, 301);
  assert.deepEqual([items[1].assignees, items[1].assigneeLogins], [[], []], "no one assigned");
  assert.deepEqual([board.parseWorkItems("", sprintTeam()), board.parseWorkItems("\n", sprintTeam())], [[], []], "no output: nothing matched");
  assert.deepEqual(board.azPerson("Robin Example <Robin.Example@example.com>"), { name: "Robin Example", login: "robin.example@example.com" });
  assert.deepEqual(board.azPerson(undefined), { name: null, login: null });
  assert.deepEqual([board.parseViewer(fixture("azure-sprint-account.json")), board.parseViewer(""), board.parseViewer('"x@example.com"')], ["alex.sample@example.com", null, null]);
});

test("the sprint's taskboard: a row per story, by id where none has an order value, after „Ohne Story“, the tasks in their taskboard columns, each column the types it maps", () => {
  const data = sprintData();
  assert.equal(data.shape, "sprint");
  assert.deepEqual(data.rows.map((r) => r.key), ["none", "AB#301", "AB#302"]);
  assert.deepEqual(data.columns.map((c) => [c.name, c.cards.map((k) => k.number)]), [["To Do", [311, 331]], ["In Progress", [312, 332]], ["In PR/Work done", [313]], ["Done", [321]]],
    "a work item the query did not find (399) is left out");
  const rowOfCard = (n) => data.columns.flatMap((c) => c.cards).find((k) => k.number === n).row;
  assert.deepEqual([311, 321, 331, 332].map(rowOfCard), ["AB#301", "AB#302", "none", "none"], "a parent outside the sprint not read, or none, is „Ohne Story“");
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

// The fixture's parents outside the sprint (299, in Sprint 11) by id, as
// parentsOutside gives them; `orders`: id → order value.
function outsideParents(orders = {}) {
  const read = board.parseWorkItems(fixture("azure-sprint-parents.json"), sprintTeam());
  return new Map(read.map((i) => [i.number, { ...i, order: orders[i.number] ?? null, outside: true, sprint: "Sprint 11" }]));
}
// sprintParts' items with order values (id → value; none: null).
const rankedItems = (orders) => sprintParts().items.map((i) => ({ ...i, order: orders[i.number] ?? null }));

test("the sprint's taskboard: a placed task's parent outside the sprint has a row of its own, marked with its sprint; the rows go by the backlog's order, those without one after, by id; „Ohne Story“ stays first for tasks without a parent", () => {
  const parents = outsideParents();
  const data = board.sprintBoard({ ...sprintParts(), parents });
  assert.deepEqual(data.rows.map((r) => r.key), ["none", "AB#299", "AB#301", "AB#302"], "no order values: by id");
  const rowOfCard = (d, n) => d.columns.flatMap((c) => c.cards).find((k) => k.number === n).row;
  assert.deepEqual([331, 332].map((n) => rowOfCard(data, n)), ["AB#299", "none"], "a task under its parent's row; one without a parent in „Ohne Story“");
  const leftover = data.rows[1].story;
  assert.deepEqual([leftover.number, leftover.title, leftover.outside, leftover.sprint, leftover.state], [299, "Clean up the old exports", true, "Sprint 11", "Active"]);
  assert.deepEqual(data.rows.slice(2).map((r) => [r.story.outside, r.story.sprint]), [[undefined, undefined], [undefined, undefined]], "the sprint's own stories are not marked");
  const ranked = board.sprintBoard({ ...sprintParts(), items: rankedItems({ 301: 30, 302: 10 }), parents: outsideParents({ 299: 20 }) });
  assert.deepEqual(ranked.rows.map((r) => r.key), ["none", "AB#302", "AB#299", "AB#301"], "by the order field, the parent among the sprint's stories");
  const some = board.sprintBoard({ ...sprintParts(), items: rankedItems({ 302: 5 }), parents });
  assert.deepEqual(some.rows.map((r) => r.key), ["none", "AB#302", "AB#299", "AB#301"], "those without an order value after those with one, by id");
  const unplaced = board.parseTaskboard(fixture("azure-sprint-taskboard.json"));
  unplaced.delete(331);
  assert.equal(board.sprintBoard({ ...sprintParts(), parents, places: unplaced }).rows.some((r) => r.key === "AB#299"), false, "no row for the parent of a task the taskboard does not place");
  const feature = { ...parents.get(299), key: "AB#290", number: 290, type: "Feature" };
  const storyParent = board.sprintBoard({ ...sprintParts(), items: sprintParts().items.map((i) => (i.number === 301 ? { ...i, parent: 290 } : i)), parents: new Map([...parents, [290, feature]]) });
  assert.equal(storyParent.rows.some((r) => r.key === "AB#290"), false, "a story's parent gets no row");
  assert.deepEqual([data.total, sprintData().total], [8, 8], "the total counts the sprint's work items");
});

test("the Sprint's query reads the backlog's order field where one is given; the order values come with the items", () => {
  const iteration = board.parseIteration(iterationAnswer());
  const areas = board.parseAreas(fixture("azure-sprint-areas.json"));
  const plain = board.sprintWiql(iteration, areas);
  const ordered = board.sprintWiql(iteration, areas, [STACK_RANK]);
  assert.equal(ordered, plain.replace("[Microsoft.VSTS.Common.Priority] FROM", "[Microsoft.VSTS.Common.Priority], [Microsoft.VSTS.Common.StackRank] FROM"));
  assert.notEqual(ordered, plain);
  const answer = json("azure-sprint-items.json");
  answer[1].fields["Microsoft.VSTS.Common.StackRank"] = 1500.5;
  const [first, second] = board.parseWorkItems(JSON.stringify(answer), sprintTeam(), "Microsoft.VSTS.Common.StackRank");
  assert.deepEqual([first.order, second.order], [null, 1500.5]);
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
  assert.deepEqual(openCounts(host, [...SETTINGS, "config", "me"]), [1, 1, 1, 1, 1, 1], "the backlog configuration and who az is beside them");
  assert.equal(host.open("az").length, 6);
  assert.deepEqual(openAz(host, "config")[0].args, board.azBacklogConfigArgs(sprintTeam()));
  await answerSettings(host);
  assert.deepEqual(["places", "query", "me"].map((k) => openAz(host, k).length), [1, 1, 1], "at the same time");
  assert.ok(openAz(host, "places")[0].args.includes(`iterationId=${ITERATION_ID}`));
  assert.ok(openAz(host, "query")[0].args.includes(board.sprintWiql(board.parseIteration(iterationAnswer()), board.parseAreas(fixture("azure-sprint-areas.json")), [STACK_RANK])),
    "with the order field the configuration names");
  await answerRefresh(host);
  assert.equal(b.state(b.view().id).data.shape, "sprint");
  assert.ok(host.calls.every((c) => c.tool === found("az") && c.options.on === null && c.options.timeout === (AZ.me(c.args) ? board.AZ_ME_TIMEOUT : board.AZ_TIMEOUT)),
    "az by its path, here, with its timeout; who az is with its own short one");
  await refreshSprint(b, cx);
  assert.deepEqual(["places", "query"].map((k) => openAz(host, k).length), [1, 1]);
  assert.equal(host.open("az").length, 2, "a refresh is two az calls");
  assert.match(openAz(host, "query")[0].args.join(" "), /\[Microsoft\.VSTS\.Common\.StackRank\]/, "the order field kept with the settings");
  await answerRefresh(host, { me: false });
  const end = Date.parse(JSON.parse(iterationAnswer())[0].attributes.finishDate) + DAY;
  advance(end - Date.now() - 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, [...SETTINGS, "config"]), [0, 1, 0, 0, 1],
    "still the sprint's last day: only the team's areas and backlog configuration, kept for both views as long as the Backlog keeps its settings");
  await answerSettings(host);
  assert.equal(host.open("az").length, 2);
  await answerRefresh(host, { me: false });
  advance(2 * 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, [...SETTINGS, "config", "me"]), [1, 1, 1, 1, 1, 0], "the sprint ended: its settings again, not who az is");
});

test("UI: the Sprint shows a row per story and per task's parent outside the sprint, that one marked with its sprint, its tasks as cards with state, assignee, id and session in the taskboard's columns, and „Ohne Story“ first", async () => {
  const { b, host } = await openSprint();
  host.spaceList = [...host.spaceList, { id: "s9", name: "z", folder: "/r/x", machine: null, branch: "main", active: false, status: null,
    tabs: [{ id: "t9", name: "AB#311 Parse the sample file", status: "working" }] }];
  const root = b.render();
  const head = texts(byId(root, "sprint-head"));
  for (const name of ["To Do", "In Progress", "In PR/Work done", "Done"]) assert.ok(head.includes(name), name);
  // iterationAnswer's last day, three days from now, by its UTC parts; its
  // year where that is another than this one.
  const end = new Date(Date.now() + 3 * DAY);
  const year = end.getUTCFullYear() === new Date(Date.now()).getUTCFullYear() ? "" : end.getUTCFullYear();
  assert.ok(head.includes("Sprint 12") && head.includes(`· bis ${end.getUTCDate()}.${end.getUTCMonth() + 1}.${year} · 3 Stories`), `the parent's row counts: ${head.join("|")}`);
  assert.equal(head.includes("nicht aktuell"), false, "the current sprint is not marked");
  assert.ok(texts(byId(root, "card-AB#311")).includes("arbeitet"), "the card's session");
  assert.equal(texts(byId(root, "card-AB#312")).includes("arbeitet"), false);
  assert.deepEqual(drawnRows(root), ["row-none", "row-AB#299", "row-AB#301", "row-AB#302"]);
  assert.ok(texts(byId(root, "row-none")).includes("Ohne Story"));
  const story = texts(byId(root, "story-AB#301"));
  for (const s of ["301", "User Story", "Import the sample catalogue", "In Progress"]) assert.ok(story.includes(s), s);
  assert.equal(story.includes("Sprint 12"), false, "a story of the sprint names no sprint");
  const leftover = texts(byId(root, "story-AB#299"));
  for (const s of ["299", "User Story", "Sprint 11", "Clean up the old exports", "Active"]) assert.ok(leftover.includes(s), s);
  assert.deepEqual(rowCells(root, "AB#299"), [["card-AB#331"], [], [], []]);
  assert.deepEqual(rowCells(root, "AB#301"), [["card-AB#311"], ["card-AB#312"], ["card-AB#313"], []]);
  assert.deepEqual(rowCells(root, "none"), [[], ["card-AB#332"], [], []]);
  assert.deepEqual(rowCells(root, "AB#302"), [[], [], [], ["card-AB#321"]]);
  const card = texts(byId(root, "card-AB#311"));
  for (const s of ["311", "Parse the sample file", "To Do", "Alex Sample"]) assert.ok(card.includes(s), s);
  assert.equal([...story, ...card].some((s) => s.includes("AB#")), false, "a story and a task show their number alone");
  assert.ok(texts(byId(root, "card-AB#332")).includes("Committed"), "a card shows its own state");
  assert.equal(texts(root).some((s) => s.includes("undefined")), false);
  assert.equal(texts(byId(root, `tab-${b.context().id}`)).at(-1), "9", "the tab counts stories and tasks, the parent's row too");
});

test("UI: the Sprint's rows follow the backlog's order field, as its query and its parents' query read it", async () => {
  const items = json("azure-sprint-items.json");
  const rank = { 301: 300, 302: 100 };
  for (const wi of items) if (rank[wi.id]) wi.fields[STACK_RANK] = rank[wi.id];
  const parents = json("azure-sprint-parents.json");
  parents[0].fields[STACK_RANK] = 200;
  const { b, st } = await openSprint({ items: JSON.stringify(items), parents: ok(JSON.stringify(parents)) });
  assert.deepEqual(drawnRows(b.render()), ["row-none", "row-AB#302", "row-AB#299", "row-AB#301"]);
  assert.deepEqual(board.sprintNav(st().data, "", false)[0].shown.map((i) => i.number), [302, 299, 301], "the keys walk the stories in that order");
});

test("UI: the tasks in a Sprint's cell stand in the backlog's order, those without a value after the rest, as Azure's taskboard stacks them; the keys walk them so", async () => {
  const items = json("azure-sprint-items.json");
  const rank = { 311: 5, 313: 1 };
  for (const wi of items) if (rank[wi.id]) wi.fields[STACK_RANK] = rank[wi.id];
  const places = taskboardAnswer({ 312: ["todo", "To Do"], 313: ["todo", "To Do"] });
  const { b } = await openSprint({ items: JSON.stringify(items), places });
  assert.deepEqual(rowCells(b.render(), "AB#301")[0], ["card-AB#313", "card-AB#311", "card-AB#312"], "by the order field, 312 without one last");
  assert.deepEqual(navTasks(b)[0], ["AB#331", "AB#313", "AB#311", "AB#312"], "„Ohne Story“ first, then the row's tasks in that order");
  const ties = [{ number: 9, order: 2 }, { number: 3, order: 2 }, { number: 1, order: null }, { number: 7, order: 1 }].sort(board.byOrder((x, y) => x.number - y.number));
  assert.deepEqual(ties.map((i) => i.number), [7, 3, 9, 1], "ties by id, none after the rest");
});

test("UI: a parent outside the sprint names its sprint in a warning chip; „ohne Sprint“ where it is in the team's backlog iteration or the project's root", async () => {
  const items = json("azure-sprint-items.json");
  items.find((wi) => wi.id === 332).fields["System.Parent"] = 298;
  items.find((wi) => wi.id === 312).fields["System.Parent"] = 297;
  const parents = json("azure-sprint-parents.json");
  const parentAt = (id, iteration) => ({ ...parents[0], id, fields: { ...parents[0].fields, "System.Id": id, "System.IterationPath": iteration } });
  parents.push(parentAt(298, "Example Project\\Example Team"), parentAt(297, "Example Project"));
  const settings = json("azure-backlog-settings.json");
  settings.backlogIteration.path = "Example Project\\Example Team";
  const { b, host } = await openSprint({ items: JSON.stringify(items), parents: ok(JSON.stringify(parents)), teamSettings: ok(JSON.stringify(settings)) });
  const t = copperTheme("light");
  host.theme = () => t;
  const root = b.render();
  assert.deepEqual(drawnRows(root), ["row-AB#297", "row-AB#298", "row-AB#299", "row-AB#301", "row-AB#302"]);
  const chip = (key, text) => pathTo(byId(root, `story-${key}`), (x) => x === text)?.at(-1) ?? null;
  const look = (tone) => [board.toneColor(t, tone), board.chipBg(t, tone)];
  for (const [key, text] of [["AB#299", "Sprint 11"], ["AB#298", "ohne Sprint"], ["AB#297", "ohne Sprint"]]) assert.deepEqual(chipLook(chip(key, text)), look("ansi3"), `${key}: ${text}`);
  assert.equal(chip("AB#298", "Example Team"), null, "the backlog iteration is no sprint");
  assert.equal(texts(byId(root, "story-AB#301")).some((x) => x.includes("Sprint")), false, "a story of the sprint has no chip");
});

test("UI: a Sprint whose backlog configuration cannot be read shows its rows by id and says so, and reads it again with the next refresh; one that names no order field says the order is unchecked, as the Backlog does", async () => {
  const items = json("azure-sprint-items.json");
  for (const wi of items) if (wi.id === 302) wi.fields[STACK_RANK] = 1;
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  const st = () => b.state(b.view().id);
  await host.answer("az", azRefused("Operation returned a 403 status code."), AZ.config);
  await answerSettings(host);
  assert.ok(openAz(host, "query")[0].args.includes(board.sprintWiql(board.parseIteration(iterationAnswer()), board.parseAreas(fixture("azure-sprint-areas.json")))),
    "the query without an order field");
  const unread = ["Reihenfolge des Backlogs nicht gelesen, Zeilen nach Id: Operation returned a 403 status code."];
  await host.answer("az", ok(fixture("azure-sprint-taskboard.json")), AZ.places);
  await host.answer("az", ok(JSON.stringify(items)), AZ.query);
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZ.me);
  assert.deepEqual([st().loading, st().warnings], [true, unread], "drawn before its parents' query, with the warning");
  await host.answer("az", ok(fixture("azure-sprint-parents.json")), AZ.parents);
  await host.answer("az", ok(fixture("azure-backlog-settings.json")), AZ.teamSettings);
  assert.deepEqual([st().loading, st().error, drawnRows(b.render())], [false, null, ["row-none", "row-AB#299", "row-AB#301", "row-AB#302"]], "the Sprint shows, by id");
  assert.deepEqual(st().warnings, unread);
  await refreshSprint(b, cx);
  assert.equal(openAz(host, "config").length, 1, "read again");
  const unnamed = json("azure-backlog-config.json");
  delete unnamed.backlogFields.typeFields.Order;
  await host.answer("az", ok(JSON.stringify(unnamed)), AZ.config);
  await answerRefresh(host, { me: false, items: JSON.stringify(items) });
  assert.deepEqual([st().warnings, drawnRows(b.render())[2]], [["Reihenfolge ungeprüft: Azure nannte kein Order-Feld"], "row-AB#301"]);
  const idle = await bootBoard({ stored: { source: "azure" }, which: found });
  await idle.host.answer("az", azRefused("Operation returned a 403 status code."), AZ.config);
  await answerSettings(idle.host, "[]");
  await idle.host.answer("az", ok(fixture("azure-sprint-account.json")), AZ.me);
  const none = idle.b.state(idle.b.view().id);
  assert.deepEqual([board.sprintIs(none.data), none.warnings], ["none", []], "no sprint running: no word on an order");
});

test("UI: the Sprint and the Backlog of a team read its backlog configuration and settings once for both; r on either reads them again", async () => {
  const { b, cx, host } = await openSprint();
  assert.deepEqual([host.calls.filter((c) => AZ.config(c.args)).length, host.calls.filter((c) => AZ.teamSettings(c.args)).length], [1, 1]);
  await press(b, cx, "v");
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 0, 0, 0], "the Sprint's reads serve the Backlog");
  await answerBacklogSettings(host);
  await answerBacklog(host, { me: false });
  await press(b, cx, "v");
  await press(b, cx, "r");
  assert.deepEqual(openCounts(host, ["config", "teamSettings"]), [1, 0], "r on the Sprint: its configuration again, its settings with its parents");
  await answerSettings(host);
  await answerRefresh(host, { me: false });
  assert.equal(host.calls.filter((c) => AZ.teamSettings(c.args)).length, 2);
  await press(b, cx, "v");
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [0, 0, 0, 0], "the Backlog keeps its own");
  await press(b, cx, "r");
  assert.deepEqual(backlogCounts(host, BACKLOG_SETTINGS), [1, 1, 1, 1]);
  await answerBacklogSettings(host);
  await answerBacklog(host, { me: false });
  await press(b, cx, "v");
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, ["config"]), [0], "the Backlog's reads serve the Sprint");
  await answerRefresh(host, { me: false });
  assert.equal(host.calls.filter((c) => AZ.teamSettings(c.args)).length, 3, "nor its settings");
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
  assert.deepEqual(drawnRows(root), ["row-AB#299", "row-AB#301"], "„Ohne Story“ holds none of mine");
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
  await host.answer("az", ok('[{"name": "Sprint 12"}]'), AZ.iteration);
  for (const k of ["areas", "columns", "types"]) await host.answer("az", ok(fixture(`azure-sprint-${k}.json`)), AZ[k]);
  assert.equal(b.state(b.view().id).error, "Azure nannte den laufenden Sprint ohne Id oder Pfad");
  assert.ok(texts(b.render()).includes("Azure nannte den laufenden Sprint ohne Id oder Pfad"));
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
  assert.deepEqual(drawnRows(root), ["row-none", "row-AB#299", "row-AB#301", "row-AB#302"]);
  assert.deepEqual(rowCells(root, "AB#302"), [[], [], [], ["card-AB#321"]], "another row keeps its tasks");
  assert.deepEqual(st().sel, { col: 0, key: "AB#301" });
  assert.deepEqual(navTasks(b), [["AB#331"], ["AB#332"], [], ["AB#321"]]);
  await press(b, cx, "l");
  assert.equal(st().sel.key, "AB#301", "no task of its row to go to");
  assert.deepEqual(byId(root, "sprint-head").kids.slice(1).map((h) => texts(h).at(-1)), ["2", "2", "1", "1"], "folding is no filter");
  assert.equal(texts(byId(root, `tab-${b.context().id}`)).at(-1), "9");
  await press(b, cx, "z");
  root = b.render();
  assert.deepEqual([texts(byId(root, "fold-AB#301")), byId(root, "folded-AB#301")], [["▾"], null]);
  assert.deepEqual(rowCells(root, "AB#301"), [["card-AB#311"], ["card-AB#312"], ["card-AB#313"], []]);
  assert.deepEqual(navTasks(b), [["AB#331", "AB#311"], ["AB#332", "AB#312"], ["AB#313"], ["AB#321"]], "in row order, „Ohne Story“ first, then the parent outside the sprint");
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
  await click(b, cx, "card-AB#332");
  await press(b, cx, "z");
  assert.equal(b.notice.text, "Die Zeile „Ohne Story“ lässt sich nicht zuklappen");
  assert.ok(byId(b.render(), "card-AB#332"));
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
  assert.equal(st().sel.key, "AB#332", "„Ohne Story“ holds nothing further left: it stays");
  await click(b, cx, "card-AB#311");
  await press(b, cx, "k");
  assert.equal(st().sel.key, "AB#331", "up into the parent's row outside the sprint");
  await press(b, cx, "h");
  assert.equal(st().sel.key, "AB#299", "onto that row's story");
  host.scrolled.length = 0;
  await click(b, cx, "card-AB#321");
  assert.equal(host.scrolled.at(-1).row, 3, "the fourth row shown");
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

// ---- Azure: the sprint picker ----

const SPRINT_11 = "2b7e4c90-5d1f-4a3b-8e62-0c9d7f1a2b11";
const SPRINT_13 = "2b7e4c90-5d1f-4a3b-8e62-0c9d7f1a2b13";
// az boards iteration team list without --timeframe: all the team's
// iterations, which the picker lists.
const isIterationsCall = (a) => a[0] === "boards" && a[1] === "iteration" && !a.includes("--timeframe");
const openIterations = (host) => host.open("az").filter((c) => isIterationsCall(c.args));
// The team's iterations as the fixture has them, without those named in
// `drop`.
const iterationsAnswer = (drop = []) => ok(JSON.stringify(json("azure-sprint-iterations.json").filter((i) => !drop.includes(i.name))));
// A day `days` days from the test clock's now, as Azure dates one.
const dayFromNow = (days) => `${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T00:00:00+00:00`;
// The fixture's iterations dated around the test clock's now: Sprint 10
// and 11 ended, 12 runs (to its last day in 3 days, as iterationAnswer's),
// 13 starts in a week; `drop` as above.
function datedIterations(drop = []) {
  const days = { "Sprint 10": [-35, -24], "Sprint 11": [-21, -10], "Sprint 12": [-7, 3], "Sprint 13": [7, 18] };
  const list = json("azure-sprint-iterations.json").filter((i) => !drop.includes(i.name));
  for (const i of list) if (days[i.name]) Object.assign(i.attributes, { startDate: dayFromNow(days[i.name][0]), finishDate: dayFromNow(days[i.name][1]) });
  return list;
}
// az's answer for the team's current iteration: the fixture's Sprint 13,
// running until its last day `days` from now.
function sprint13Current(days = 10) {
  const it = json("azure-sprint-iterations.json")[3];
  Object.assign(it.attributes, { startDate: dayFromNow(-1), finishDate: dayFromNow(days), timeFrame: "current" });
  return JSON.stringify([it]);
}
// The rows the open sprint picker draws, each as its parts' texts (its
// name whole, its chip, its dates).
const sprintPickerRows = (b) =>
  (byId(b.render(), "sprints-rows")?.kids ?? []).filter((k) => k.with?.id?.[0]?.startsWith("sprint-")).map((row) => row.kids.map((k) => texts(k).join("")));
const chipped = (b) => sprintPickerRows(b).filter((r) => r.includes("aktuell")).map((r) => r[0]);
// Enter in the open picker's filter.
const submitSprint = async (b, cx) => {
  cx.call((own) => b.modal.input.submit(own));
  await settle();
};
// The dates the picker gives an iteration of the fixture, in this year.
const fixtureDates = (n) => board.sprintDates(board.parseIterations(fixture("azure-sprint-iterations.json"))[n], new Date(Date.now()).getUTCFullYear());
// Picks the sprint `name` in the picker, opened from the command menu (the
// team's iterations answered where they are asked), and answers the
// refresh that follows.
async function pickSprint(b, cx, host, name) {
  await runCommand(b, cx, "Sprint wählen…");
  if (openIterations(host).length) await host.answer("az", iterationsAnswer(), isIterationsCall);
  b.modal.input.type(name);
  await submitSprint(b, cx);
  await answerRefresh(host, { me: false });
}
const sprintHead = (b) => texts(byId(b.render(), "sprint-head"));
const menuNames = async (b, cx) => {
  const names = (await openMenu(b, cx)).map(([name]) => name);
  await press(b, cx, "escape");
  return names;
};
// A Board on the Azure team's Sprint whose team has no sprint running.
async function openNoSprint(options = {}) {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found, ...options });
  await answerSettings(host, "[]");
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZ.me);
  cx.later.splice(0);
  return { b, cx, host, view: b.view(), st: () => b.state(b.view().id) };
}

test("the sprint picker's call and rows: all the team's iterations in Azure's order, each with its dates, none current by itself; the filter narrows them by name; the row marked first: the current sprint, else the next to start, else the last that ended, else the first; the Sprint with no sprint running", () => {
  assert.deepEqual(board.azIterationsArgs(sprintTeam()),
    ["boards", "iteration", "team", "list", "--org", ORG, "--detect", "false", "--project", "Example Project", "--team", "Example Team", "-o", "json"], "no --timeframe: past, current and future");
  const list = board.parseIterations(fixture("azure-sprint-iterations.json"));
  assert.deepEqual(list.map((i) => i.name), ["Sprint 10", "Sprint 11", "Sprint 12", "Sprint 13", "Ideen"]);
  assert.deepEqual(list[1], { id: SPRINT_11, name: "Sprint 11", path: "Example Project\\Sprint 11", start: "2026-11-02T00:00:00+00:00", finish: "2026-11-13T00:00:00+00:00" },
    "no current of its own: the timeFrame of the moment it was read");
  assert.deepEqual([list[4].start, list[4].finish], [null, null]);
  const wrapped = { count: 2, value: json("azure-sprint-iterations.json").slice(0, 2) };
  assert.deepEqual(board.parseIterations(JSON.stringify(wrapped)), list.slice(0, 2), "REST's wrapper too");
  assert.deepEqual(board.parseIterations('[{"name": "x", "path": "P\\\\x"}, {"id": "y", "name": "y"}, null]'), [], "one without an id or path is left out");
  assert.deepEqual(board.parseIterations('[{"id": "z", "path": "P\\\\z"}]').map((i) => i.name), ["P\\z"], "no name: its path");
  assert.throws(() => board.parseIterations('{"x": 1}'), /^Error: Azure lieferte keine Sprints des Teams$/);
  assert.throws(() => board.parseIterations("nope"), /az lieferte für die Sprints des Teams kein lesbares JSON/);
  assert.deepEqual(list.map((i) => board.sprintDates(i, 2026)), ["19.10.–30.10.", "2.11.–13.11.", "16.11.–27.11.", "30.11.–11.12.", "ohne Daten"]);
  assert.equal(board.sprintDates({ start: "2025-12-29T00:00:00+00:00", finish: "2026-01-09T00:00:00+00:00" }, 2026), "29.12.2025–9.1.", "a year before this one is named");
  assert.equal(board.sprintDates({ start: "2026-12-28T00:00:00+00:00", finish: "2027-01-08T00:00:00+00:00" }, 2026), "28.12.–8.1.2027", "and one after it");
  assert.deepEqual([board.sprintDates({ start: "2026-11-02T00:00:00Z", finish: null }, 2026), board.sprintDates({ start: null, finish: "2026-11-13T00:00:00Z" }, 2026)],
    ["ab 2.11.", "bis 13.11."], "Z as well as +00:00");
  assert.deepEqual(board.rankByName(list, "").map((r) => [r.name, r.at]), list.map((i) => [i.name, []]), "no filter: all, in Azure's order");
  assert.deepEqual(board.rankByName(list, "s11").map((r) => [r.name, r.at]), [["Sprint 11", [0, 7, 8]]]);
  assert.deepEqual(board.rankByName(list, "ide").map((r) => r.id), ["2b7e4c90-5d1f-4a3b-8e62-0c9d7f1a2b99"]);
  const now = Date.parse("2026-11-23T10:00:00Z");
  const rows = list.map((i, n) => ({ ...i, current: n === 2 }));
  assert.equal(board.startRow(rows, now), 2, "the current one");
  const none = rows.map((r) => ({ ...r, current: false }));
  assert.equal(board.startRow(none, now), 3, "else the next to start");
  assert.equal(board.startRow(none, Date.parse("2026-12-20T00:00:00Z")), 3, "else the last that ended, its last day over");
  assert.equal(board.startRow(none, Date.parse("2026-11-27T12:00:00Z")), 3, "a sprint on its last day has not ended: Sprint 13 starts next");
  assert.equal(board.startRow(none.slice(0, 3), Date.parse("2026-11-27T12:00:00Z")), 1, "the one on its last day is no last ended");
  assert.equal(board.startRow(none.slice(0, 3), Date.parse("2026-11-28T00:00:00Z")), 2, "ended as its last day ends");
  assert.equal(board.startRow(none.slice(4), now), 0, "else the first");
  assert.equal(board.startRow(none, Date.parse("2026-11-30T00:00:00Z")), 2, "a sprint from its first day on is no next to start");
  assert.deepEqual([board.dayEnd(Date.parse("2026-11-23T10:00:00Z")), board.dayEnd(Date.parse("2026-11-23T00:00:00Z"))], [Date.parse("2026-11-24T00:00:00Z"), Date.parse("2026-11-24T00:00:00Z")]);
  const data = sprintData();
  assert.deepEqual([board.sprintIs(data), data.meta.currentId, data.meta.gone], ["current", ITERATION_ID, null], "the current sprint by default, none gone");
  const empty = board.sprintBoard({ ...sprintParts(), iteration: null, currentId: null, items: [], places: new Map() });
  assert.deepEqual([empty.meta.iterationId, empty.meta.iteration, empty.meta.finish, empty.meta.currentId, empty.rows, empty.total, board.sprintIs(empty)], [null, null, null, null, [], 0, "none"],
    "no sprint running");
  const chosen = board.sprintBoard({ ...sprintParts(), currentId: "other" });
  assert.deepEqual([board.sprintIs(chosen), board.sprintIs(board.sprintBoard({ ...sprintParts(), currentId: null }))], ["chosen", "chosen"], "another than the current one, or one chosen while none runs");
  assert.deepEqual(board.parseIteration("[]"), null, "no sprint running is no error");
  assert.throws(() => board.parseIteration('[{"name": "x"}]'), /^Error: Azure nannte den laufenden Sprint ohne Id oder Pfad$/);
  assert.throws(() => board.parseIteration('[{"id": "x"}]'), /ohne Id oder Pfad/);
});

test("UI: „Sprint wählen…“ in the command menu opens the sprint picker: the team's iterations, read once while the board runs, the current one „aktuell“ and marked; the filter and ctrl-j/k, ctrl-n/p and the arrows move the mark; no key of its own", async () => {
  const { b, cx, host, view } = await openSprint();
  assert.deepEqual((await openMenu(b, cx)).find(([name]) => name === "Sprint wählen…"), ["Sprint wählen…", null], "no key");
  await press(b, cx, "escape");
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), false, "the current sprint shows: no way back to offer");
  assert.equal(board.hintsOf(b.actionContext()).some(([, text]) => /wählen|aktuell/i.test(text)), false, "the hint line names no key for it");
  await runCommand(b, cx, "Sprint wählen…");
  assert.equal(b.modal?.kind, "sprints");
  assert.deepEqual(openIterations(host).map((c) => c.args), [board.azIterationsArgs(view.context)], "read when the picker opens");
  assert.equal(openAz(host, "iteration").length, 0, "the current sprint is kept: not read again");
  assert.ok(texts(byId(b.render(), "sprints-menu")).includes("lädt …"));
  await host.answer("az", iterationsAnswer(), isIterationsCall);
  assert.ok(texts(byId(b.render(), "sprints-menu")).includes("Sprint · Example Team · Enter · Esc"));
  assert.deepEqual(sprintPickerRows(b), [["Sprint 10", fixtureDates(0)], ["Sprint 11", fixtureDates(1)], ["Sprint 12", "aktuell", fixtureDates(2)], ["Sprint 13", fixtureDates(3)],
    ["Ideen", "ohne Daten"]]);
  assert.equal(b.modal.at, 2, "the current one is marked");
  const ctrl = (k) => press(b, cx, k, { modifiers: { control: true } });
  await ctrl("j");
  assert.equal(b.modal.at, 3);
  await ctrl("k");
  await ctrl("k");
  assert.equal(b.modal.at, 1);
  await ctrl("n");
  await press(b, cx, "down");
  assert.equal(b.modal.at, 3);
  await ctrl("p");
  await press(b, cx, "up");
  assert.equal(b.modal.at, 1);
  b.modal.input.type("sprint");
  assert.deepEqual([sprintPickerRows(b).map((r) => r[0]), b.modal.at], [["Sprint 10", "Sprint 11", "Sprint 12", "Sprint 13"], 0], "a new filter marks its first row, not the current one");
  b.modal.input.type("s13");
  assert.deepEqual(sprintPickerRows(b), [["Sprint 13", fixtureDates(3)]]);
  assert.equal(b.modal.at, 0);
  b.modal.input.type("xyz");
  assert.deepEqual([sprintPickerRows(b), b.modal.at], [[], -1]);
  assert.ok(texts(byId(b.render(), "sprints-menu")).includes("Kein Sprint passt zum Filter"));
  await submitSprint(b, cx);
  assert.equal(b.modal?.kind, "sprints", "Enter on no row does nothing");
  await press(b, cx, "escape");
  assert.equal(b.modal, null);
  await runCommand(b, cx, "Sprint wählen…");
  assert.deepEqual([openIterations(host).length, sprintPickerRows(b).length, b.modal.at], [0, 5, 2], "kept: no second read");
});

test("UI: a click on the sprint's name in the head opens the sprint picker, not while a dialog is open", async () => {
  const { b, cx, host } = await openSprint();
  await click(b, cx, "sprint-name");
  assert.equal(b.modal?.kind, "sprints");
  await host.answer("az", iterationsAnswer(), isIterationsCall);
  await press(b, cx, "escape");
  await press(b, cx, ":");
  await click(b, cx, "sprint-name");
  assert.equal(b.modal?.kind, "commands");
});

test("UI: a picker whose iterations cannot be read says why, in the dialog and as a toast; the next one asks again", async () => {
  const { b, cx, host } = await openSprint();
  await runCommand(b, cx, "Sprint wählen…");
  await host.answer("az", azRefused("TF400898: An Internal Error Occurred."), isIterationsCall);
  assert.ok(texts(byId(b.render(), "sprints-menu")).includes("Die Sprints des Teams ließen sich nicht lesen: Azure antwortete mit einem Fehler (az): TF400898: An Internal Error Occurred."));
  assert.deepEqual([host.notes.at(-1).title, host.notes.at(-1).level], ["Sprint wählen: Sprints nicht gelesen", "error"]);
  assert.deepEqual([sprintPickerRows(b), b.modal.at], [[], -1]);
  assert.deepEqual(["Das Team hat keine Sprints", "lädt …"].map((m) => texts(byId(b.render(), "sprints-menu")).includes(m)), [false, false], "the error says why, not an empty team, nor that it loads");
  await press(b, cx, "escape");
  await runCommand(b, cx, "Sprint wählen…");
  assert.equal(openIterations(host).length, 1, "asked again");
  await host.answer("az", ok("[]"), isIterationsCall);
  assert.ok(texts(byId(b.render(), "sprints-menu")).includes("Das Team hat keine Sprints"));
});

test("UI: the sprint picker opens with the current sprint marked and in view in a long list; the wheel moves its window, a thumb and „↓ N weitere“ say there are more, a click picks a row", async () => {
  const { b, cx, host, st, view } = await openSprint();
  const many = Array.from({ length: 15 }, (_, n) => ({ id: n === 12 ? ITERATION_ID : `it-${n}`, name: `Sprint ${n}`, path: `Example Project\\Sprint ${n}`, attributes: {} }));
  await runCommand(b, cx, "Sprint wählen…");
  await host.answer("az", ok(JSON.stringify(many)), isIterationsCall);
  assert.deepEqual([b.modal.at, b.modal.top], [12, 3], "the window follows the mark");
  assert.deepEqual(chipped(b), ["Sprint 12"]);
  assert.deepEqual(texts(byId(b.render(), "sprints-below")), ["↓ 2 weitere"]);
  assert.ok(byId(b.render(), "sprints-thumb"), "a thumb at the rows' right");
  const wheel = (y) => cx.call((own) => byId(b.render(), "sprints-rows").with.on_scroll_wheel[0]({ delta: { x: 0, y } }, own));
  wheel(-2 * board.MENU_ROW_PX);
  assert.deepEqual([b.modal.top, b.modal.at], [5, 12], "down two rows, the mark staying");
  assert.equal(byId(b.render(), "sprints-below"), null, "nothing more below");
  b.modal.input.type("sprint");
  assert.deepEqual([b.modal.at, b.modal.top], [0, 0], "a new filter starts at its first row, at the top");
  b.modal.input.type("");
  assert.deepEqual([b.modal.at, b.modal.top], [12, 3], "the filter emptied: the current sprint marked again, in view");
  wheel(5 * board.MENU_ROW_PX);
  assert.equal(b.modal.top, 0);
  await click(b, cx, "sprint-1");
  assert.deepEqual([b.modal, st().sprint], [null, { id: "it-1", name: "Sprint 1" }], "a click picks its row");
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(view.context, "it-1")]);
});

test("UI: a past sprint picked shows its own work items, read by its id and path, the team's settings kept; the head names it „nicht aktuell“; „Aktueller Sprint“ and the current row go back; the sprint that shows reads nothing", async () => {
  const { b, cx, host, st } = await openSprint();
  await runCommand(b, cx, "Sprint wählen…");
  const in2020 = json("azure-sprint-iterations.json")
    .map((i) => (i.id === SPRINT_11 ? { ...i, attributes: { ...i.attributes, startDate: "2020-11-02T00:00:00+00:00", finishDate: "2020-11-13T00:00:00+00:00" } } : i));
  await host.answer("az", ok(JSON.stringify(in2020)), isIterationsCall);
  await press(b, cx, "up");
  await submitSprint(b, cx);
  assert.equal(b.modal, null);
  assert.deepEqual(st().sprint, { id: SPRINT_11, name: "Sprint 11" });
  assert.deepEqual(openCounts(host, SETTINGS), [0, 0, 0, 0], "the team's settings are kept");
  assert.equal(openIterations(host).length, 0, "and its iterations");
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_11)]);
  assert.ok(openAz(host, "query")[0].args.includes(board.sprintWiql({ path: "Example Project\\Sprint 11" }, board.parseAreas(fixture("azure-sprint-areas.json")), [STACK_RANK])));
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().data.meta.iterationId, st().data.meta.iteration, board.sprintIs(st().data)], [SPRINT_11, "Sprint 11", "chosen"]);
  let head = sprintHead(b);
  assert.ok(head.includes("Sprint 11") && head.includes("nicht aktuell") && head.includes("· bis 13.11.2020 · 3 Stories"), head.join("|"));
  const names = await menuNames(b, cx);
  assert.deepEqual(names.slice(names.indexOf("Sprint wählen…"), names.indexOf("Sprint wählen…") + 3), ["Sprint wählen…", "Aktueller Sprint", "Ansicht wechseln: Backlog"]);
  await runCommand(b, cx, "Aktueller Sprint");
  assert.equal(st().sprint, null);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), ITERATION_ID)]);
  await answerRefresh(host, { me: false });
  head = sprintHead(b);
  assert.ok(head.includes("Sprint 12") && !head.includes("nicht aktuell"), head.join("|"));
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), false);
  await pickSprint(b, cx, host, "Sprint 13");
  assert.deepEqual([st().sprint.id, st().data.meta.iterationId, sprintHead(b).includes("nicht aktuell")], [SPRINT_13, SPRINT_13, true], "a future one too");
  await runCommand(b, cx, "Sprint wählen…");
  assert.equal(b.modal.at, 2, "the current one is marked, also while another shows");
  await submitSprint(b, cx);
  assert.equal(st().sprint, null, "the current row goes back to the current sprint");
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), ITERATION_ID)]);
  await answerRefresh(host, { me: false });
  await runCommand(b, cx, "Sprint wählen…");
  await submitSprint(b, cx);
  assert.deepEqual([b.modal, host.open("az").length], [null, 0], "the sprint that shows: nothing read");
  await pickSprint(b, cx, host, "Sprint 11");
  await runCommand(b, cx, "Sprint wählen…");
  b.modal.input.type("Sprint 13");
  await submitSprint(b, cx);
  await runCommand(b, cx, "Sprint wählen…");
  b.modal.input.type("Sprint 11");
  await submitSprint(b, cx);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_13)], "Sprint 11 shows, Sprint 13 is read");
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().sprint.id, openAz(host, "places").map((c) => c.args)], [SPRINT_11, [board.azTaskboardArgs(sprintTeam(), SPRINT_11)]],
    "picked again while another was read, the one that showed is read next");
  await answerRefresh(host, { me: false });
  assert.equal(st().data.meta.iterationId, SPRINT_11);
});

test("UI: at a sprint's end the picker marks the team's new current sprint, not the kept list's; a chosen sprint that became current is no longer „nicht aktuell“, and the old one picked is", async () => {
  const { b, cx, host, st } = await openSprint();
  await pickSprint(b, cx, host, "Sprint 13");
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), true);
  advance(5 * DAY);
  await runCommand(b, cx, "Sprint wählen…");
  assert.deepEqual([openIterations(host).length, openAz(host, "iteration").length], [0, 1], "the list is kept, the current sprint it no longer keeps is read");
  await host.answer("az", ok(sprint13Current()), AZ.iteration);
  assert.deepEqual([chipped(b), b.modal.at], [["Sprint 13"], 3], "Sprint 13 is current now");
  await press(b, cx, "escape");
  await refreshSprint(b, cx);
  await answerSettings(host, sprint13Current());
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().data.meta.iterationId, board.sprintIs(st().data), st().data.meta.currentId], [SPRINT_13, "current", SPRINT_13]);
  assert.equal(sprintHead(b).includes("nicht aktuell"), false, "the chosen sprint is the current one now");
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), false);
  await pickSprint(b, cx, host, "Sprint 12");
  assert.deepEqual([st().sprint, st().data.meta.iterationId, board.sprintIs(st().data)], [{ id: ITERATION_ID, name: "Sprint 12" }, ITERATION_ID, "chosen"], "the sprint that ended: a choice, not the current one");
  assert.equal(sprintHead(b).includes("nicht aktuell"), true);
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), true);
});

test("UI: at a sprint's end, picking the team's new current sprint while the ended one still shows reads it", async () => {
  const { b, cx, host, st } = await openSprint();
  advance(5 * DAY);
  await runCommand(b, cx, "Sprint wählen…");
  await host.answer("az", iterationsAnswer(), isIterationsCall);
  await host.answer("az", ok(sprint13Current()), AZ.iteration);
  assert.deepEqual([chipped(b), b.modal.at], [["Sprint 13"], 3]);
  await submitSprint(b, cx);
  assert.equal(st().sprint, null, "the current sprint: no choice");
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 1], "read, though the data before called Sprint 12 current");
  await answerSettings(host, sprint13Current());
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().data.meta.iterationId, board.sprintIs(st().data)], [SPRINT_13, "current"]);
});

test("UI: at a sprint's end, a chosen sprint that became current, picked as the current row, is read as current", async () => {
  const { b, cx, host, st } = await openSprint();
  await pickSprint(b, cx, host, "Sprint 13");
  assert.equal(board.sprintIs(st().data), "chosen");
  advance(5 * DAY);
  await runCommand(b, cx, "Sprint wählen…");
  await host.answer("az", ok(sprint13Current()), AZ.iteration);
  assert.deepEqual([chipped(b), b.modal.at], [["Sprint 13"], 3]);
  await submitSprint(b, cx);
  assert.equal(st().sprint, null);
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 1], "read, though Sprint 13 shows: it showed as a choice");
  await answerSettings(host, sprint13Current());
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().data.meta.iterationId, board.sprintIs(st().data), sprintHead(b).includes("nicht aktuell")], [SPRINT_13, "current", false]);
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), false);
});

test("UI: at a sprint's end, the ended sprint picked while it still shows as current is read as a choice", async () => {
  const { b, cx, host, st } = await openSprint();
  advance(5 * DAY);
  await runCommand(b, cx, "Sprint wählen…");
  await host.answer("az", iterationsAnswer(), isIterationsCall);
  await host.answer("az", ok(sprint13Current()), AZ.iteration);
  b.modal.input.type("Sprint 12");
  await submitSprint(b, cx);
  assert.deepEqual(st().sprint, { id: ITERATION_ID, name: "Sprint 12" });
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 1], "read, though Sprint 12 shows: it showed as current");
  await answerSettings(host, sprint13Current());
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().data.meta.iterationId, board.sprintIs(st().data), sprintHead(b).includes("nicht aktuell")], [ITERATION_ID, "chosen", true]);
});

test("UI: a refresh keeps the chosen sprint; r reads the team's iterations again and keeps it where the team still has it, else shows the current one and says so; a refused write keeps them", async () => {
  const { b, cx, host, st } = await openSprint();
  await pickSprint(b, cx, host, "Sprint 11");
  await refreshSprint(b, cx);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_11)], "the timer's refresh keeps it");
  assert.equal(openIterations(host).length, 0, "with the iterations kept");
  await answerRefresh(host, { me: false });
  await click(b, cx, "card-AB#311");
  await press(b, cx, "s");
  await press(b, cx, "3");
  await host.answer("az", azRefused("TF401320: Rule Error for field State."), AZ.state);
  await refreshSprint(b, cx);
  assert.deepEqual([...openCounts(host, SETTINGS), openIterations(host).length], [1, 1, 1, 0, 0], "a refusal drops the team's settings, not its iterations");
  await answerSettings(host);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_11)]);
  await answerRefresh(host, { me: false });
  await press(b, cx, "r");
  assert.deepEqual([...openCounts(host, SETTINGS), openIterations(host).length], [1, 1, 1, 0, 1], "r reads them again");
  await answerSettings(host);
  assert.equal(openAz(host, "places").length, 0, "the taskboard waits for the iterations");
  const renamed = json("azure-sprint-iterations.json").map((i) => (i.id === SPRINT_11 ? { ...i, name: "Sprint 11 (Release)" } : i));
  await host.answer("az", ok(JSON.stringify(renamed)), isIterationsCall);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_11)], "found by its id, renamed or not");
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().sprint?.id, st().data.meta.iterationId, st().data.meta.gone], [SPRINT_11, SPRINT_11, null]);
  assert.ok(sprintHead(b).includes("Sprint 11 (Release)"), "under its name now");
  await press(b, cx, "r");
  await answerSettings(host);
  await host.answer("az", iterationsAnswer(["Sprint 11"]), isIterationsCall);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), ITERATION_ID)], "gone: the current one");
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().sprint, st().data.meta.iterationId, board.sprintIs(st().data), st().data.meta.gone], [null, ITERATION_ID, "current", { id: SPRINT_11, name: "Sprint 11" }]);
  assert.deepEqual(b.notice, { text: "Sprint 11 gibt es im Team nicht mehr: der aktuelle Sprint wird gezeigt", level: "warning" });
  assert.equal(sprintHead(b).includes("nicht aktuell"), false);
  await refreshSprint(b, cx);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), ITERATION_ID)], "and stays there");
});

test("UI: a chosen sprint whose read fails says which one; picking it again reads it again", async () => {
  const { b, cx, host, st } = await openSprint();
  await runCommand(b, cx, "Sprint wählen…");
  await host.answer("az", iterationsAnswer(), isIterationsCall);
  b.modal.input.type("Sprint 11");
  await submitSprint(b, cx);
  await host.answer("az", azRefused("TF400898: An Internal Error Occurred."), AZ.places);
  await host.answer("az", ok(fixture("azure-sprint-items.json")), AZ.query);
  assert.equal(st().error, "Sprint 11 ließ sich nicht lesen: Azure antwortete mit einem Fehler (az): TF400898: An Internal Error Occurred.");
  assert.equal(st().data.meta.iterationId, ITERATION_ID, "the sprint before stays drawn");
  await runCommand(b, cx, "Sprint wählen…");
  b.modal.input.type("Sprint 11");
  await submitSprint(b, cx);
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_11)], "read again");
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().error, st().data.meta.iterationId], [null, SPRINT_11]);
  await refreshSprint(b, cx);
  await host.answer("az", { code: 1, stdout: "", stderr: "boom\n" }, AZ.places);
  await host.answer("az", ok(fixture("azure-sprint-items.json")), AZ.query);
  assert.equal(st().error, "Sprint 11 ließ sich nicht lesen: boom", "az's own words too");
  await runCommand(b, cx, "Sprint wählen…");
  b.modal.input.type("Sprint 11");
  await submitSprint(b, cx);
  assert.equal(openAz(host, "places").length, 1, "the sprint that shows, its last read failed: read again");
});

test("UI: folds in a chosen sprint last while the board runs and leave the current sprint's stored folds as they are", async () => {
  const { b, cx, host, st, view } = await openSprint();
  await click(b, cx, "story-AB#301");
  await press(b, cx, "z");
  const stored = () => JSON.parse(memory.get(`folded:${view.id}`));
  assert.deepEqual(stored(), { sprint: ITERATION_ID, stories: ["AB#301"] });
  await pickSprint(b, cx, host, "Sprint 11");
  assert.deepEqual(texts(byId(b.render(), "fold-AB#301")), ["▾"], "the current sprint's folds are not another's");
  await click(b, cx, "story-AB#302");
  await press(b, cx, "z");
  assert.deepEqual(texts(byId(b.render(), "fold-AB#302")), ["▸"]);
  assert.deepEqual(stored(), { sprint: ITERATION_ID, stories: ["AB#301"] }, "the stored folds stay the current sprint's");
  await runCommand(b, cx, "Aktueller Sprint");
  await answerRefresh(host, { me: false });
  assert.deepEqual([texts(byId(b.render(), "fold-AB#301")), texts(byId(b.render(), "fold-AB#302"))], [["▸"], ["▾"]]);
  await pickSprint(b, cx, host, "Sprint 11");
  assert.deepEqual([texts(byId(b.render(), "fold-AB#301")), texts(byId(b.render(), "fold-AB#302"))], [["▾"], ["▸"]], "the chosen sprint's, while the board runs");
  const again = await openSprint({ stored: Object.fromEntries([...memory].map(([k, v]) => [k, JSON.parse(v)])) });
  await pickSprint(again.b, again.cx, again.host, "Sprint 11");
  assert.deepEqual([texts(byId(again.b.render(), "fold-AB#301")), texts(byId(again.b.render(), "fold-AB#302"))], [["▾"], ["▾"]], "not after a restart");
});

test("UI: a sprint picked while a refresh reads a sprint the team no longer has is kept and read next", async () => {
  const { b, cx, host, st } = await openSprint();
  await pickSprint(b, cx, host, "Sprint 11");
  await press(b, cx, "r");
  await answerSettings(host);
  await runCommand(b, cx, "Sprint wählen…");
  assert.equal(openIterations(host).length, 1, "the picker waits for the refresh's read");
  await host.answer("az", iterationsAnswer(["Sprint 11"]), isIterationsCall);
  b.modal.input.type("Sprint 13");
  await submitSprint(b, cx);
  assert.equal(st().sprint.id, SPRINT_13);
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().sprint?.id, st().data.meta.gone?.id], [SPRINT_13, SPRINT_11], "the new choice stays");
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_13)], "and is read next");
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().data.meta.iterationId, st().data.meta.gone], [SPRINT_13, null]);
});

test("UI: the chosen sprint lasts while the board runs: nothing of it is stored, and a new board shows the current sprint", async () => {
  const { b, cx, host } = await openSprint();
  await pickSprint(b, cx, host, "Sprint 11");
  assert.equal(b.state(b.view().id).data.meta.iterationId, SPRINT_11);
  await cx.fire();
  assert.equal([...memory.values(), ...Object.values(host.files)].some((v) => v.includes(SPRINT_11) || v.includes("Sprint 11")), false, "nothing stored, not even its saved state");
  const stored = Object.fromEntries([...memory].map(([k, v]) => [k, JSON.parse(v)]));
  const again = await openSprint({ stored });
  assert.equal(again.st().sprint, null);
  assert.deepEqual(again.st().data.meta.iterationId, ITERATION_ID);
  assert.equal(sprintHead(again.b).includes("nicht aktuell"), false);
});

test("UI: with no sprint running the Sprint says „kein laufender Sprint“, reads no work items and draws no taskboard; the picker opens from the menu and the head, marks the next sprint, none „aktuell“; a past sprint picked shows; no „Aktueller Sprint“", async () => {
  const { b, cx, host, st } = await openNoSprint();
  assert.deepEqual([openAz(host, "places").length, openAz(host, "query").length, st().error], [0, 0, null], "no work items to read, no error");
  assert.deepEqual([st().data.meta.iterationId, board.sprintIs(st().data), st().data.meta.currentId], [null, "none", null]);
  let root = b.render();
  assert.deepEqual(texts(byId(root, "sprint-head")), ["kein laufender Sprint"], "no column heads, no „nicht aktuell“");
  assert.ok(texts(byId(root, "sprint-none"))[0].startsWith("Das Team hat gerade keinen laufenden Sprint."));
  assert.equal(byId(root, "sprint-rows"), null, "no taskboard");
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), false, "none to go back to");
  await click(b, cx, "sprint-name");
  assert.equal(b.modal?.kind, "sprints", "a click on the head opens the picker");
  assert.equal(openAz(host, "iteration").length, 0, "that none runs is kept");
  await host.answer("az", ok(JSON.stringify(datedIterations(["Sprint 12"]))), isIterationsCall);
  assert.deepEqual([chipped(b), b.modal.at, sprintPickerRows(b)[b.modal.at][0]], [[], 2, "Sprint 13"], "none „aktuell“; the next to start marked");
  await press(b, cx, "escape");
  await runCommand(b, cx, "Sprint wählen…");
  assert.equal(b.modal.at, 2, "from the menu too");
  b.modal.input.type("Sprint 11");
  await submitSprint(b, cx);
  assert.deepEqual(st().sprint, { id: SPRINT_11, name: "Sprint 11" });
  assert.deepEqual(openAz(host, "places").map((c) => c.args), [board.azTaskboardArgs(sprintTeam(), SPRINT_11)]);
  await answerRefresh(host, { me: false });
  root = b.render();
  assert.deepEqual([st().data.meta.iterationId, board.sprintIs(st().data), drawnRows(root)], [SPRINT_11, "chosen", ["row-none", "row-AB#299", "row-AB#301", "row-AB#302"]]);
  assert.ok(sprintHead(b).includes("Sprint 11") && sprintHead(b).includes("nicht aktuell"));
  assert.equal((await menuNames(b, cx)).includes("Aktueller Sprint"), false, "still none to go back to");
  await press(b, cx, "r");
  await answerSettings(host, "[]");
  await host.answer("az", ok(JSON.stringify(datedIterations(["Sprint 11", "Sprint 12"]))), isIterationsCall);
  assert.deepEqual([st().sprint, st().data.meta.iterationId, b.notice.text], [null, null, "Sprint 11 gibt es im Team nicht mehr: das Team hat keinen laufenden Sprint"], "gone, and none running");
});

test("UI: a board started with no sprint running opens the Sprint with that head; once a sprint starts, the first refresh on its first day shows it", async () => {
  const { b, cx, host, st } = await openNoSprint();
  assert.deepEqual([sprintHead(b), st().error], [["kein laufender Sprint"], null]);
  // The next day at 23:00 UTC, then 23:59, then 00:01 the day after.
  const at = (ms) => advance(ms - Date.now());
  const next = board.dayEnd(Date.now());
  at(next + 23 * 3600000);
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 1], "a day later: asked again");
  await answerSettings(host, "[]");
  assert.deepEqual([host.open("az").length, sprintHead(b)], [0, ["kein laufender Sprint"]]);
  at(next + 23 * 3600000 + 59 * 60000);
  await refreshSprint(b, cx);
  assert.equal(host.open("az").length, 0, "the same day: kept, nothing read");
  at(next + DAY + 60000);
  await refreshSprint(b, cx);
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 1], "the day after: asked again");
  await answerSettings(host, iterationAnswer());
  await answerRefresh(host, { me: false });
  assert.deepEqual([st().data.meta.iterationId, board.sprintIs(st().data)], [ITERATION_ID, "current"]);
  assert.ok(sprintHead(b).includes("Sprint 12") && !sprintHead(b).includes("nicht aktuell"));
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
    "[Microsoft.VSTS.Common.Priority], [Microsoft.VSTS.Common.StackRank] FROM WorkItems WHERE [System.Id] IN (302, 401) ORDER BY [System.Id]");
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
  for (const [kind, out] of [["iteration", iterationAnswer()], ["areas", fixture("azure-sprint-areas.json")], ["columns", fixture("azure-sprint-columns.json")], ["types", JSON.stringify(types)],
    ["config", fixture("azure-backlog-config.json")]]) {
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
  assert.deepEqual(cx.bound.slice(0, 2), board.BOARD_KEYS.map(({ keystroke, action }) => ({ keystroke, action, context: board.BOARD_KEY_CONTEXT })), "bound in that context only");
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
  assert.deepEqual(host.notes.at(-1), { title: "Board: Tab, shift-Tab und Enter nicht gebunden", body: "keymap locked", level: "error" });
  assert.ok(b.render());
  const { host: short } = await bootBoard({ bindKeys: () => 1 });
  assert.deepEqual(short.notes.at(-1), { title: "Board: Tab, shift-Tab und Enter nicht alle gebunden", body: "1 von 3 Bindungen angelegt", level: "error" });
});

// ---- the start dialog's keys ----

// The message's frame as drawn: the element carrying its key context.
const messageFrame = (b) => byId(b.render(), "start-message");
// Enter in the message through the board's binding (MESSAGE_KEYS): the
// handler of the message's frame for its action. Returns how often it
// stopped the key.
function messageEnter(b) {
  const frame = messageFrame(b);
  const [context] = frame.with.key_context;
  const binding = board.MESSAGE_KEYS.find((k) => k.keystroke === "enter");
  assert.equal(binding.context, `${context} > Input`, "bound where the message's input sits");
  const handler = frame.calls.find((c) => c[0] === "on_action" && c[1] === binding.action)?.[2];
  assert.ok(handler, `no on_action ${binding.action} on the message's frame`);
  const own = fakeCx();
  own.call((c) => handler({}, c));
  return own.stopped;
}
// The hint line of the open dialog: the text before its buttons, the
// last of which is `go`.
const hintOf = (b, go = "start-go") => texts(chainTo(b.render(), hasId(go)).at(-2).kids[0])[0];

test("the board binds Enter where the start dialog's message sits, in that message's key context only", async () => {
  const { cx } = await openBoard();
  assert.deepEqual(board.MESSAGE_KEYS, [{ keystroke: "enter", action: "board_start", context: "BoardMessage > Input" }]);
  assert.deepEqual(cx.bound.slice(2), board.MESSAGE_KEYS);
});

test("UI: the message grows with its text up to six rows, in a frame of no fixed height; Enter there starts the session, shift-Enter and ctrl-Enter are herdr's line break and start nothing", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  const m = b.modal;
  assert.deepEqual(m.input.layout, { autoGrow: [1, 6] });
  const frame = messageFrame(b);
  assert.equal("h" in frame.with, false, "no fixed height");
  assert.equal(chainTo(frame, (el) => el.kind === "textarea")?.at(-1)?.state, m.input);
  const bound = cx.bound.length;
  m.input.set_selected_range({ start: 10, end: 10 });
  cx.call((own) => m.input.enter(own, { shift: true }));
  await settle();
  assert.deepEqual([m.input.value(), m.busy, host.open("sh").length], ["/work 3004\n", null, 0], "shift-Enter: a line break");
  cx.call((own) => m.input.enter(own, { secondary: true }));
  await settle();
  assert.deepEqual([m.input.value(), m.busy, host.open("sh").length, cx.bound.length], ["/work 3004\n\n", null, 0, bound], "ctrl-Enter: a line break, nothing bound");
  m.input.set_value("/work 3004\nmore");
  assert.equal(messageEnter(b), 1, "taken, so herdr runs no command of that name");
  assert.equal(m.busy, "Sitzung wird geöffnet …");
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(host.runs.at(-1)[1].task, "/work 3004\nmore");
});

test("UI: once a load of keys.json dropped the board's Enter, Enter in the message still starts, with the message and its selection as they were before it, and the board binds its keys again", async () => {
  for (const range of [{ start: 10, end: 10 }, { start: 6, end: 10 }]) {
    const { b, cx, host } = await openBoard();
    await openStart(b, cx);
    const m = b.modal;
    const keys = cx.bound.splice(0);
    m.input.type("/work 3004 more");
    m.input.set_selected_range(range);
    cx.call((own) => m.input.enter(own));
    assert.deepEqual([m.input.value(), m.input.selected_range(), m.busy, m.error], ["/work 3004 more", range, "Sitzung wird geöffnet …", null], JSON.stringify(range));
    assert.deepEqual(cx.bound, keys, "all of the board's keys, once");
    await settle();
    await host.answer("sh", ok("/home/me/src/tender\n"));
    assert.equal(host.runs.at(-1)[1].task, "/work 3004 more");
  }
});

test("UI: where the message's Enter after a load of keys.json put in more than its own line break (several cursors), the board binds its keys again, puts the message back as it was before that Enter, the cursor at its end, and starts nothing, asking for Enter once more; the next Enter starts", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  const m = b.modal;
  const again = "Tasten neu gebunden – bitte Enter noch einmal";
  const was = "/work 3004 more";
  // The active cursor first; no text to type: the one there.
  for (const [typed, ranges, why] of [
    ["\n\n", [{ start: 1, end: 1 }, { start: 0, end: 0 }], "a message of line breaks only"],
    ["x😀", [{ start: 1, end: 1 }, { start: 0, end: 0 }], "an emoji after the active cursor, a second cursor before it"],
    [was, [{ start: 5, end: 5 }, { start: 10, end: 10 }], "a second cursor after the active one"],
    [was, [{ start: 6, end: 10 }, { start: 11, end: 15 }], "two selections"],
    [was, [{ start: 5, end: 5 }, { start: 10, end: 12 }], "a selection after the active cursor, the text as long as before"],
    [was, [{ start: 5, end: 5 }, { start: 0, end: 1 }], "a selection before the active cursor"],
    [was, [{ start: 15, end: 15 }, { start: 0, end: 0 }], "a second cursor before the active one, at the end"],
    [null, [{ start: 5, end: 5 }, { start: 10, end: 10 }], "again, with no edit since the last"],
  ]) {
    if (typed !== null) m.input.type(typed);
    const text = m.input.value();
    const keys = cx.bound.splice(0);
    cx.call((own) => m.input.enter(own, { ranges }));
    assert.deepEqual([m.input.value(), m.input.selected_range(), m.busy, m.error, host.open("sh").length], [text, { start: text.length, end: text.length }, null, again, 0], why);
    assert.deepEqual(cx.bound, keys, why);
  }
  assert.ok(texts(b.render()).includes(again));
  assert.equal(messageEnter(b), 1);
  assert.deepEqual([m.busy, m.error], ["Sitzung wird geöffnet …", null]);
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  assert.equal(host.runs.at(-1)[1].task, was);
});

test("UI: an Enter in the start dialog that starts nothing because the chosen space is gone or not read yet, or because a start is under way, takes the ask-again error away; the dialog's note or its hint line says why", async () => {
  const again = "Tasten neu gebunden – bitte Enter noch einmal";
  // An Enter in the message with two cursors, after a load of keys.json.
  const askAgain = (b, cx) => {
    cx.bound.splice(0);
    cx.call((own) => b.modal.input.enter(own, { ranges: [{ start: 5, end: 5 }, { start: 10, end: 10 }] }));
    assert.equal(b.modal.error, again);
  };
  for (const [why, note] of [["gone", "Den Space „work“ auf diesem Rechner gibt es nicht mehr; bitte neu wählen"], ["unread", UNREAD_WORK]]) {
    const { b, cx, host } = await openBoard();
    let layout = "ready";
    host.machines = () => [{ name: null, layout }];
    const all = [{ ...host.spaceList[0] }, spaceOf("s4", "work")];
    host.spaceList = all;
    await openStart(b, cx);
    await openPicker(b, cx);
    b.modal.list.input.type("work");
    pickRow(b, cx);
    askAgain(b, cx);
    if (why === "gone") host.spaceList = [all[0]];
    else layout = "loading";
    assert.equal(messageEnter(b), 1);
    await settle();
    assert.deepEqual([b.modal.error, b.modal.busy, host.open("sh").length], [null, null, 0], why);
    assert.deepEqual([texts(b.render()).includes(note), texts(b.render()).includes(again)], [true, false], why);
  }
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  messageEnter(b);
  askAgain(b, cx);
  assert.equal(notifies(cx, (own) => board.startModal.start(b, own)), 1, "drawn again");
  await settle();
  assert.deepEqual([b.modal.error, b.modal.busy, host.open("sh").length, hintOf(b)], [null, "Sitzung wird geöffnet …", 1, "Sitzung wird geöffnet …"], "busy");
});

test("UI: a second Enter in the message after a load of keys.json, where the first started nothing, again takes back only its own line break", async () => {
  const { b, cx, host } = await openBoard();
  host.knownAgents = async () => [];
  await openStart(b, cx);
  await settle();
  const m = b.modal;
  m.input.type("/work 3004 more");
  for (const n of [1, 2]) {
    cx.bound.splice(0);
    m.input.set_selected_range({ start: 10, end: 10 });
    cx.call((own) => m.input.enter(own));
    assert.deepEqual([m.input.value(), m.busy, m.error, cx.bound.length], ["/work 3004 more", null, "Kein Agent installiert", 3], `Enter ${n}`);
  }
});

test("UI: Enter starts the session from every field of the start dialog", async () => {
  for (const field of ["agent", "machine", "open", "name"]) {
    const { b, cx, host } = await openBoard();
    host.spaceList = [];
    await openStart(b, cx);
    for (let i = 0; i < ["message", "agent", "machine", "open", "name"].indexOf(field); i++) await press(b, cx, "tab");
    assert.equal(b.modal.field, field);
    if (field === "name") cx.call((own) => b.modal.nameInput.submit(own));
    else await press(b, cx, "enter");
    await settle();
    assert.deepEqual([b.modal.busy, b.modal.list, host.open("sh").length], ["Sitzung wird geöffnet …", null, 1], field);
  }
});

test("UI: the hint line names the keys of the field that has the keyboard", async () => {
  const { b, cx } = await openBoard();
  await openStart(b, cx);
  assert.equal(hintOf(b), "↵ startet · ⇧↵ neue Zeile · PageUp/PageDown blättert · Tab wechselt das Feld");
  for (const field of ["agent", "machine", "open"]) {
    await press(b, cx, "tab");
    assert.equal(hintOf(b), "← → wählt · Leertaste öffnet die Liste · ↵ startet · Tab wechselt das Feld", field);
  }
  await press(b, cx, "space");
  assert.equal(hintOf(b), "Tippen filtert · ↑ ↓ wählt · ↵ übernimmt · Esc schließt die Liste");
  await press(b, cx, "up");
  pickRow(b, cx);
  assert.equal(hintOf(b), "↵ startet · Tab wechselt das Feld");
  b.modal.input.focus();
  assert.deepEqual([b.modal.field, hintOf(b)], ["message", "↵ startet · ⇧↵ neue Zeile · PageUp/PageDown blättert · Tab wechselt das Feld"], "a click into the message moves the dialog there");
});

test("UI: ← and → step through a choice's entries in place, round, h and l too; on Öffnen in Neuer Space shows the name field but the keyboard stays", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "work")];
  host.knownAgents = async () => [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }, { key: "codex", name: "Codex", run: ["codex"], installed: true }];
  await openStart(b, cx);
  const agentShown = () => texts(byId(b.render(), "choice-agent"))[0];
  await press(b, cx, "tab");
  await press(b, cx, "right");
  assert.equal(agentShown(), "Codex");
  await press(b, cx, "right");
  assert.equal(agentShown(), "Claude Code", "round");
  await press(b, cx, "h");
  assert.equal(agentShown(), "Codex");
  await press(b, cx, "tab");
  await press(b, cx, "tab");
  assert.deepEqual(openInShown(b), ["x", false]);
  await press(b, cx, "right");
  assert.deepEqual(openInShown(b), ["work", false]);
  await press(b, cx, "right");
  assert.deepEqual([openInShown(b), b.modal.field, b.handle.held], [["Neuer Space …", true], "open", true], "the name shows, the keyboard stays");
  await press(b, cx, "left");
  assert.deepEqual(openInShown(b), ["work", false]);
  await press(b, cx, "l");
  await press(b, cx, "l");
  assert.deepEqual(openInShown(b), ["x", false], "round");
  assert.equal(b.modal.list, null, "no list opened");
});

test("UI: → on Öffnen in from a chosen space that is gone goes to the first entry, ← to the last", async () => {
  const { b, cx, host } = await openBoard();
  const all = [{ ...host.spaceList[0] }, spaceOf("s4", "work")];
  host.spaceList = all;
  await openStart(b, cx);
  await openPicker(b, cx);
  b.modal.list.input.type("work");
  pickRow(b, cx);
  host.spaceList = [all[0]];
  await press(b, cx, "right");
  assert.deepEqual(openInShown(b), ["Neuer Space …", true]);
  b.modal.target = { id: "s4", name: "work" };
  await press(b, cx, "left");
  assert.deepEqual(openInShown(b), ["x", false]);
});

test("UI: Agent and Rechner open their lists like Öffnen in, by space or a click: the entry marked, the filter narrows them, Enter takes one; another machine reads its agents and chooses its space anew", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "work"), spaceOf("s4", "srv", "server")];
  const asks = [];
  host.knownAgents = async ({ on }) => (asks.push(on), [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }, { key: "codex", name: "Codex", run: ["codex"], installed: true }]);
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "space");
  assert.deepEqual([b.modal.list?.choice, shownRows(b), b.modal.list.at, b.modal.inputFocused], ["agent", ["Claude Code", "Codex"], 0, true]);
  assert.equal(byId(b.render(), "choice-agent-list").with.anchor[0], "top_left");
  b.modal.list.input.type("dex");
  assert.deepEqual(shownRows(b), ["Codex"]);
  pickRow(b, cx);
  assert.deepEqual([b.modal.list, b.modal.field, texts(byId(b.render(), "choice-agent"))[0], b.handle.held], [null, "agent", "Codex", true]);
  await press(b, cx, "tab");
  b.modal.target = { id: "s3", name: "work" };
  await click(b, cx, "choice-machine");
  assert.deepEqual([b.modal.list?.choice, shownRows(b), b.modal.list.at], ["machine", ["Dieser Rechner", "server"], 0]);
  b.modal.list.input.type("zz");
  assert.ok(texts(byId(b.render(), "choice-list")).includes("Kein Rechner passt zum Filter"));
  b.modal.list.input.type("");
  await press(b, cx, "down");
  pickRow(b, cx);
  await settle();
  assert.deepEqual([texts(byId(b.render(), "choice-machine"))[0], openInShown(b), asks], ["server", ["srv", false], [null, "server"]]);
  await press(b, cx, "space");
  assert.equal(b.modal.list.at, 1, "the machine chosen");
  pickRow(b, cx);
  await settle();
  assert.deepEqual(asks, [null, "server"], "the same machine taken: nothing read again");
});

test("UI: in an open list up/down, ctrl-n/p and ctrl-j/k mark a row and are taken; plain j and k, space and h/l are the filter's; Enter takes the row once", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "work"), spaceOf("s5", "tend")];
  await openStart(b, cx);
  await openPicker(b, cx);
  const list = b.modal.list;
  assert.equal(list.at, 1);
  const moves = [["down", {}, 2], ["up", {}, 1], ["n", { modifiers: { control: true } }, 2], ["p", { modifiers: { control: true } }, 1], ["j", { modifiers: { control: true } }, 2], ["k", { modifiers: { control: true } }, 1]];
  for (const [k, extra, at] of moves) {
    const before = cx.stopped;
    await press(b, cx, k, extra);
    assert.deepEqual([list.at, cx.stopped - before], [at, 1], k);
  }
  for (const k of ["j", "k", "space", "h", "l"]) {
    const before = cx.stopped;
    await press(b, cx, k);
    assert.deepEqual([b.modal.list, list.at, cx.stopped - before], [list, 1, 0], `${k} goes to the filter`);
  }
  await press(b, cx, "down");
  await press(b, cx, "enter");
  assert.deepEqual([b.modal.list, openInShown(b), b.modal.busy], [null, ["work", false], null], "taken, not started");
  cx.call((own) => list.input.submit(own));
  await settle();
  assert.deepEqual([b.modal.list, openInShown(b), b.modal.busy, host.open("sh").length], [null, ["work", false], null, 0], "the filter's own Enter after it does nothing");
});

test("UI: Tab in an open list closes it, taking nothing, and moves to the next field", async () => {
  const { b, cx, host } = await openBoard();
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "work")];
  await openStart(b, cx);
  await openPicker(b, cx);
  await press(b, cx, "down");
  assert.equal(boardAction(b, "board_tab"), 1);
  assert.deepEqual([b.modal.list, b.modal.field, b.modal.inputFocused, openInShown(b)], [null, "message", true, ["x", false]]);
});

const CODEX = { key: "codex", name: "Codex", run: ["codex"], installed: true };
const CLAUDE = { key: "claude", name: "Claude Code", run: ["claude"], installed: true };
const GEMINI = { key: "gemini", name: "Gemini", run: ["gemini"], installed: true };
// knownAgents answering only when a test says so: its asks, each a
// deferred().
function slowAgents(host) {
  const asks = [];
  host.knownAgents = () => {
    const d = deferred();
    asks.push(d);
    return d.promise;
  };
  return asks;
}

test("UI: the agent list opened while the agents are read marks the agent preselected once they come, with no draw before Enter too; a key moves the mark from there", async () => {
  for (const drawn of [true, false]) {
    const { b, cx, host } = await openBoard();
    const asks = slowAgents(host);
    await openStart(b, cx);
    await press(b, cx, "tab");
    await press(b, cx, "space");
    assert.deepEqual([shownRows(b), b.modal.list.at], [[], -1]);
    asks[0].resolve([CODEX, CLAUDE, GEMINI]);
    await settle();
    if (drawn) {
      assert.deepEqual([shownRows(b), b.modal.list.at], [["Codex", "Claude Code", "Gemini"], 1], "the agent preselected");
      await press(b, cx, "down");
      assert.equal(b.modal.list.at, 2, "from the preselected one");
      await press(b, cx, "up");
    }
    await press(b, cx, "enter");
    assert.deepEqual([b.modal.list, texts(byId(b.render(), "choice-agent"))[0]], [null, "Claude Code"], drawn ? "drawn" : "not drawn");
  }
});

test("UI: Öffnen in opened while herdr reads the machine's spaces marks the space preselected once they are read; a mark a key moved stays on its space as more come", async () => {
  const { b, cx, host } = await openBoard();
  let layout = "loading";
  host.machines = () => [{ name: null, layout }, { name: "server", layout: "ready" }];
  host.spaceList = [{ ...host.spaceList[0] }, spaceOf("s3", "tender"), spaceOf("s4", "work")];
  await openStart(b, cx);
  await openPicker(b, cx);
  assert.deepEqual([shownRows(b), b.modal.list.at], [["Neuer Space …"], 0]);
  layout = "ready";
  assert.deepEqual([shownRows(b), b.modal.list.at, openInShown(b)], [["Neuer Space …", "x/r/tender", "tender/r/tender", "work/r/work"], 2, ["tender", false]]);
  await press(b, cx, "down");
  host.spaceList = [host.spaceList[0], spaceOf("s2", "api"), ...host.spaceList.slice(1)];
  assert.equal(shownRows(b)[b.modal.list.at], "work/r/work", "the mark on its space, not its place");
  b.modal.list.input.type("t");
  assert.equal(b.modal.list.at, 0, "a filter typed: its first row");
  b.modal.list.input.type("");
  assert.equal(shownRows(b)[b.modal.list.at], "tender/r/tender", "the filter emptied: the field's own again");
  await press(b, cx, "down");
  await press(b, cx, "enter");
  assert.deepEqual([b.modal.list, openInShown(b)], [null, ["work", false]]);
});

test("UI: the agent list says „lädt …“ while the agents are read, why where they cannot be, and that none fits a filter", async () => {
  const { b, cx, host } = await openBoard();
  const asks = slowAgents(host);
  await openStart(b, cx);
  await press(b, cx, "tab");
  await press(b, cx, "space");
  const said = () => texts(byId(b.render(), "choice-list"));
  assert.ok(said().includes("lädt …"));
  b.modal.list.input.type("cl");
  assert.deepEqual([said().includes("Kein Agent passt zum Filter"), said().includes("lädt …")], [true, false], "a filter typed");
  b.modal.list.input.type("");
  asks[0].reject(new Error("down"));
  await settle();
  assert.ok(said().includes("Agents auf diesem Rechner nicht lesbar: down"));
  const read = await openBoard();
  await openStart(read.b, read.cx);
  await press(read.b, read.cx, "tab");
  await press(read.b, read.cx, "space");
  read.b.modal.list.input.type("zz");
  assert.deepEqual([shownRows(read.b), texts(byId(read.b.render(), "choice-list")).includes("Kein Agent passt zum Filter")], [[], true], "read, none fits");
});

test("UI: a list of more than ten rows shows ten, the marked one among them, and how many more below; the wheel moves its window, the mark staying", async () => {
  const { b, cx, host } = await openBoard();
  const many = Array.from({ length: 13 }, (_, i) => spaceOf(`s${i + 10}`, `space${String(i).padStart(2, "0")}`));
  host.spaceList = [{ ...host.spaceList[0] }, ...many, spaceOf("s3", "tender"), spaceOf("s4", "zeta")];
  await openStart(b, cx);
  await openPicker(b, cx);
  const rows = shownRows(b);
  assert.deepEqual([rows.length, rows.at(-1), b.modal.list.at, b.modal.list.top], [10, "tender/r/tender", 15, 6], "the repo's space marked, in view");
  assert.ok(texts(byId(b.render(), "choice-list")).includes("↓ 1 weitere"));
  cx.call((own) => byId(b.render(), "choice-list-rows").with.on_scroll_wheel[0]({ delta: { x: 0, y: 2 * board.MENU_ROW_PX } }, own));
  assert.deepEqual([shownRows(b)[0], b.modal.list.at, b.modal.list.top], ["space02/r/space02", 15, 4], "up two rows");
  assert.ok(texts(byId(b.render(), "choice-list")).includes("↓ 3 weitere"));
  await press(b, cx, "escape");
  let layout = "loading";
  host.machines = () => [{ name: null, layout }];
  await press(b, cx, "space");
  assert.deepEqual(shownRows(b), ["Neuer Space …"]);
  layout = "ready";
  assert.deepEqual([shownRows(b).at(-1), b.modal.list.at, b.modal.list.top], ["tender/r/tender", 15, 6], "read after it opened: the window follows the mark");
});

test("UI: the create dialog's type is a choice like the start dialog's: ← and → step, space or a click opens its list at the field, Enter there takes a type, Esc or a press beside closes only the list; Enter on the field creates; the hint names the keys", async () => {
  const { b, cx, host } = await openBacklog();
  await press(b, cx, "n");
  const m = b.modal;
  const shownType = () => texts(byId(b.render(), "choice-type"));
  assert.equal(hintOf(b, "create-go"), "↵ legt an · Tab wechselt das Feld");
  m.input.set_value("Sample new story");
  await press(b, cx, "tab");
  assert.deepEqual([shownType(), hintOf(b, "create-go")], [["User Story", "▾"], "← → wählt · Leertaste öffnet die Liste · ↵ legt an · Tab wechselt das Feld"]);
  await press(b, cx, "right");
  assert.equal(shownType()[0], "Bug");
  await press(b, cx, "left");
  await press(b, cx, "left");
  assert.equal(shownType()[0], "Task (unter AB#301)", "round");
  for (const k of ["j", "down", "k", "up"]) await press(b, cx, k);
  assert.equal(shownType()[0], "Task (unter AB#301)", "j, k and the arrows up and down step no more");
  await press(b, cx, "space");
  assert.deepEqual([m.list?.choice, shownRows(b), m.list.at, m.inputFocused], ["type", ["User Story", "Bug", "Task (unter AB#301)"], 2, true]);
  assert.deepEqual(byId(b.render(), "choice-type-list").with.anchor, ["top_left"]);
  assert.equal(hintOf(b, "create-go"), "Tippen filtert · ↑ ↓ wählt · ↵ übernimmt · Esc schließt die Liste");
  b.handle.focus();
  b.takeKeyboard();
  assert.deepEqual([m.inputFocused, m.focusedField], [true, "filter"], "the list's filter takes the keyboard back");
  assert.equal(m.list.input.placeholder, "Filter: Name des Typs");
  m.list.input.type("zz");
  assert.ok(texts(b.render()).includes("Kein Typ passt zum Filter"));
  m.list.input.type("bug");
  await press(b, cx, "enter");
  assert.deepEqual([m.list, m.field, shownType()[0], b.handle.held, b.modal], [null, "type", "Bug", true, m], "taken, not created");
  await click(b, cx, "choice-type");
  await press(b, cx, "escape");
  assert.deepEqual([b.modal, m.list], [m, null]);
  await click(b, cx, "choice-type");
  const beside = fakeCx();
  beside.call((own) => byId(b.render(), "choice-list-shield").with.on_mouse_down[1]({}, own));
  assert.deepEqual([b.modal, m.list, shownType()[0]], [m, null, "Bug"]);
  await press(b, cx, "space");
  await press(b, cx, "tab");
  assert.deepEqual([m.list, m.field, m.inputFocused, shownType()[0]], [null, "title", true, "Bug"], "Tab closes the list, taking nothing");
  await press(b, cx, "tab");
  assert.equal(openAzb(host, "create").length, 0);
  await press(b, cx, "enter");
  assert.equal(b.modal, null);
  const [create] = openAzb(host, "create");
  assert.ok(create.args.includes("Bug"), create.args.join(" "));
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
  assert.match(query, /issue\(number: \$number\) \{ body parent \{ number title state url repository \{ nameWithOwner \} \} subIssues\(/,
    "the description and the parent read in the same query");
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
  assert.deepEqual([hintOf("Tab"), hint("j/k"), hintOf("Esc")], [["Board"], false, ["zurück"]], "Tab names where it goes; j/k, a move, has no hint");
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

// An issue's parent as GitHub's related query sends it.
const parentNode = (number = 3000, repo = "example/tender") => ({ number, title: `parent ${number}`, state: "OPEN", url: `https://github.com/${repo}/issues/${number}`, repository: { nameWithOwner: repo } });

test("an issue's parent is a section of one line before its sub-issues; none for none; an error at its path is the section's, not a warning", () => {
  const answer = json("github-related.json");
  answer.data.repository.issue.parent = parentNode(3000);
  const d = board.parseGithubRelated(answer, issueItem());
  assert.deepEqual(d.parents.lines.map((l) => [board.itemLabel(l), l.kind, l.state, l.title, l.url]),
    [["tender#3000", "issue", "offen", "parent 3000", "https://github.com/example/tender/issues/3000"]]);
  assert.deepEqual([d.parents.count, d.parents.error, d.parents.hidden], [1, null, 0]);
  assert.deepEqual(board.relatedLines(d).map((l) => l.number), [3000, 3001, 3010, 12, 3020, 3015], "the parent first");
  const none = board.parseGithubRelated(json("github-related.json"), issueItem());
  assert.deepEqual([none.parents.count, none.parents.lines, none.parents.error], [0, [], null]);
  answer.data.repository.issue.parent = null;
  const errors = [{ type: "FORBIDDEN", path: ["repository", "issue", "parent"], message: "Resource not accessible\nmore" }];
  const hidden = board.parseGithubRelated(answer, issueItem(), errors);
  assert.deepEqual([hidden.parents.lines, hidden.parents.error, hidden.parents.count, hidden.warnings], [[], "GitHub: Resource not accessible", null, []],
    "no count: GitHub did not send it");
});

test("an Azure work item's parent is read in the children's query, or in one of its own where it has no children; a failed query shows in both sections and is read again", async () => {
  const c = sprintTeam();
  const calls = [];
  const az = (answers) => async (args) => {
    calls.push(args);
    const out = answers.shift();
    if (out instanceof Error) throw out;
    return out;
  };
  const parentItem = { id: 290, fields: { "System.Title": "Sample epic", "System.WorkItemType": "Epic", "System.State": "Active" } };
  const withParent = JSON.stringify([...json("azure-related-children.json"), parentItem]);
  let d = await board.loadAzureRelated(az([fixture("azure-related-item.json"), withParent]), c, { number: 301 });
  assert.deepEqual(calls[1], board.azQueryArgs(c, board.idsWiql([312, 311, 399, 290])));
  assert.deepEqual(d.parents.lines.map((l) => [board.itemLabel(l), l.title, l.state]), [["AB#290", "Sample epic", "Active"]]);
  assert.deepEqual(d.subIssues.lines.map((l) => l.number), [312, 311]);
  assert.deepEqual(board.relatedLines(d).map((l) => l.number), [290, 312, 311, 57]);
  const only = JSON.parse(fixture("azure-related-item.json"));
  only.relations = only.relations.filter((r) => !/Forward$/.test(r.rel));
  calls.length = 0;
  d = await board.loadAzureRelated(az([JSON.stringify(only), JSON.stringify([parentItem])]), c, { number: 301 });
  assert.deepEqual([calls.length, calls[1], d.parents.lines.length, d.subIssues.count], [2, board.azQueryArgs(c, board.idsWiql([290])), 1, 0], "a parent alone: one query");
  calls.length = 0;
  d = await board.loadAzureRelated(az([JSON.stringify(only), "[]"]), c, { number: 301 });
  assert.deepEqual([d.parents.lines, d.parents.hidden, d.parents.hiddenAs], [[], 1, "nicht gefunden"], "a parent the query does not find");
  d = await board.loadAzureRelated(az([fixture("azure-related-item.json"), new board.BoardError("offline")]), c, { number: 301 });
  assert.deepEqual([d.parents.error, d.subIssues.error, d.retry], ["offline", "offline", true]);
  d = await board.loadAzureRelated(az([JSON.stringify(only), new board.BoardError("offline")]), c, { number: 301 });
  assert.deepEqual([d.parents.error, d.subIssues.error], ["offline", null], "no children: no error in their place");
  const orphan = JSON.parse(fixture("azure-related-item.json"));
  orphan.relations = orphan.relations.filter((r) => !/Reverse$/.test(r.rel));
  d = await board.loadAzureRelated(az([JSON.stringify(orphan), new board.BoardError("offline")]), c, { number: 301 });
  assert.deepEqual([d.parents.error, d.parents.count, d.subIssues.error], [null, 0, "offline"], "no parent: no error in its place");
  const bare = JSON.parse(fixture("azure-related-item.json"));
  bare.relations = [];
  calls.length = 0;
  d = await board.loadAzureRelated(az([JSON.stringify(bare)]), c, { number: 301 });
  assert.deepEqual([calls.length, d.parents.count], [1, 0], "neither: no query");
});

test("UI: the details show an issue's parent under „ÜBERGEORDNET“ before its sub-issues, as its first line; Enter goes down into it", async () => {
  const { b, cx, st, host } = await openBoard();
  await press(b, cx, "enter");
  const answer = json("github-related.json");
  answer.data.repository.issue.parent = parentNode(2900);
  await answerRelated(host, ok(JSON.stringify(answer)));
  const all = relatedTexts(b);
  assert.deepEqual(all.slice(all.indexOf("ÜBERGEORDNET"), all.findIndex((t) => t.startsWith("UNTERAUFGABEN"))), ["ÜBERGEORDNET", "tender#2900", "parent 2900", "offen"]);
  assert.ok(all.indexOf("ÜBERGEORDNET") > all.indexOf("BESCHREIBUNG"), "after the description");
  await tab(b, cx);
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual([levelsNow(b), topText(b), st().sel.key], [[[2900], null], "tender#3004 › #2900", "PVTI_rec4"]);
  assert.equal(readsOf(host, 2900).length, 1);
  const none = await openRelated();
  assert.equal(relatedTexts(none.b).includes("ÜBERGEORDNET"), false, "none without a parent");
});

test("UI: an Azure work item's parent shows under „ÜBERGEORDNET“, read in its children's query; one the query does not find is counted; none without a parent, also where the query fails", async () => {
  const { b, cx, host } = await openSprint();
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  const all = relatedTexts(b);
  assert.deepEqual(all.slice(all.indexOf("ÜBERGEORDNET"), all.indexOf("UNTERAUFGABEN")), ["ÜBERGEORDNET", "1 nicht gefunden"]);
  const again = await openSprint();
  await press(again.b, again.cx, "enter");
  await again.host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await again.host.answer("az", ok(JSON.stringify([...json("azure-related-children.json"), { id: 290, fields: { "System.Title": "Sample epic", "System.State": "Active" } }])), AZ.query);
  assert.deepEqual(drawnLines(again.b)[0], ["AB#290", "Sample epic", "Active"]);
  await tab(again.b, again.cx);
  await press(again.b, again.cx, "j");
  await press(again.b, again.cx, "enter");
  assert.deepEqual([levelsNow(again.b), topText(again.b)], [[[290], null], "301 › 290"]);
  const orphan = await openSprint();
  await press(orphan.b, orphan.cx, "enter");
  const item = json("azure-related-item.json");
  item.relations = item.relations.filter((r) => !/Reverse$/.test(r.rel));
  await orphan.host.answer("az", ok(JSON.stringify(item)), (a) => a.includes("relations"));
  await orphan.host.answer("az", azRefused("Operation returned a 400 status code."), AZ.query);
  const texts2 = relatedTexts(orphan.b);
  assert.deepEqual([texts2.includes("ÜBERGEORDNET"), texts2.includes("Operation returned a 400 status code.")], [false, true], "the error in the children's place only");
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

test("UI: on a level „Zeile auf dem Board“ selects the line's item from the menu and from the panel's button, and closes the levels; one the board does not show is said; the button does nothing while a dialog is open", async () => {
  const byMenu = await onLevel();
  const level = JSON.parse(relatedAnswer({ n: 1 }));
  level.data.repository.issue.subIssues.nodes[0].number = 3001;
  byMenu.st().related.delete(byMenu.b.panelOf(byMenu.b.view()).levels[0].item.key);
  byMenu.cx.call((own) => byMenu.b.readRelated(own));
  await settle();
  await answerRelated(byMenu.host, ok(JSON.stringify(level)));
  await press(byMenu.b, byMenu.cx, "j");
  await runCommand(byMenu.b, byMenu.cx, "Zeile auf dem Board");
  assert.deepEqual([byMenu.st().sel.key, levelsNow(byMenu.b)], ["PVTI_rec2", [[], null]], "from the menu");
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
  b.modal = { kind: "status", view: b.view(), key: "PVTI_rec4", targets: [], at: 0 };
  await click(b, cx, "act-line-board");
  assert.deepEqual([st().sel.key, levelsNow(b)], ["PVTI_rec4", [[3010], 0]], "a dialog is open: nothing");
  b.modal = null;
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

// gh's answer for a pull request the panel goes down to (written from
// GitHub's GraphQL reference, PullRequest, as the PR list's rows are).
function pullRequestAnswer({ state = "OPEN", draft = true, decision = null } = {}) {
  const pullRequest = {
    id: "PR_sample3020", number: 3020, title: "feat(api): page through long lists", url: "https://github.com/example/tender/pull/3020", state, isDraft: draft,
    createdAt: "2026-11-18T09:00:00Z", updatedAt: "2026-11-19T09:00:00Z", repository: { nameWithOwner: "example/tender" }, headRefName: "feat/3004-pages", reviewDecision: decision, author: { login: "alex-sample" }, assignees: { nodes: [{ login: "robin-example", name: "Robin Example" }] },
    reviewRequests: { nodes: [{ requestedReviewer: { login: "robin-example" } }] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { checkRunCountsByState: [{ state: "SUCCESS", count: 2 }], statusContextCountsByState: [] } } } }] },
  };
  return JSON.stringify({ data: { repository: { pullRequest } } });
}
const isPullRequestCall = (args) => args.some((a) => String(a).includes("pullRequest(number"));

test("a pull request the panel goes down to is one GraphQL query by repo and number for what the PR list shows of it, and its state", () => {
  const pr = { source: "github", kind: "pr", repo: "example/tender", repoShort: "tender", number: 3020, title: "line title", url: "u" };
  const args = board.githubPullRequestArgs(pr);
  assert.deepEqual(args.slice(4), ["-f", "owner=example", "-f", "name=tender", "-F", "number=3020"]);
  const query = args[3].replace(/\s+/g, " ");
  assert.match(query, /repository\(owner: \$owner, name: \$name\) \{ pullRequest\(number: \$number\) \{ state id number title url isDraft createdAt updatedAt headRefName reviewDecision repository \{ nameWithOwner \} author \{ login \}/);
  const list = board.githubListArgs({ sections: [{ query: "is:pr" }], limit: 5 })[3].replace(/\s+/g, " ");
  assert.ok(list.includes(query.slice(query.indexOf("id number title"), query.lastIndexOf("} } } } } }") + 11)), "the fields of a PR list's row");
  const d = board.parseGithubPullRequest(JSON.parse(pullRequestAnswer()), pr);
  assert.deepEqual([d.title, d.state, d.color, d.done, d.draft, d.author, d.review, d.branch, d.checks.text, d.assignees, d.assigneeLogins, d.reviewers, d.warnings], [
    "feat(api): page through long lists", "offen", "ansi2", false, true, "alex-sample", "Entwurf", "feat/3004-pages", "2 bestanden", ["Robin Example"], ["robin-example"], ["robin-example"], [],
  ]);
  const row = board.parseGithubList({ data: { s0: { issueCount: 1, nodes: [JSON.parse(pullRequestAnswer()).data.repository.pullRequest] } } }, { sections: [{ name: "S", query: "is:pr" }] }).sections[0].rows[0];
  // What only a list's row holds: whether the viewer has to act (prAttention).
  const listOnly = ["key", "source", "kind", "ownByQuery", "attention", "waiting", "unread"];
  assert.deepEqual(Object.fromEntries(Object.keys(row).filter((k) => !listOnly.includes(k)).map((k) => [k, d[k]])),
    Object.fromEntries(Object.entries(row).filter(([k]) => !listOnly.includes(k))), "what a PR list's row holds of it");
  assert.deepEqual(["attention", "waiting", "unread"].filter((k) => k in d), [], "a pull request a level down tells nothing of what the viewer has to do");
  const partial = board.parseGithubPullRequest(JSON.parse(pullRequestAnswer()), pr, [{ path: ["repository", "pullRequest", "commits"], message: "Checks are hidden\nmore" }]);
  assert.deepEqual(partial.warnings, ["Checks are hidden"], "a part GitHub did not send: a warning");
  const merged = board.parseGithubPullRequest(JSON.parse(pullRequestAnswer({ state: "MERGED", draft: false, decision: "APPROVED" })), pr);
  assert.deepEqual([merged.state, merged.done, merged.review], ["gemerged", true, "freigegeben"]);
  assert.throws(() => board.parseGithubPullRequest({ data: { repository: { pullRequest: null } } }, pr), /^Error: GitHub kennt example\/tender#3020 nicht$/);
  const errors = [{ type: "NOT_FOUND", path: ["repository", "pullRequest"], message: "Could not resolve to a PullRequest\nmore" }];
  assert.throws(() => board.parseGithubPullRequest({ data: { repository: null } }, pr, errors), /^Error: GitHub: Could not resolve to a PullRequest$/);
  const { reads } = board.makeGithub(null).pullRequest;
  assert.deepEqual([reads(pr), reads({ ...pr, kind: "issue" }), reads({ ...pr, repo: "" }), reads({ ...pr, number: null })], [true, false, false, false]);
});

test("UI: Enter on a pull request's line shows it a level down as the PR list's details do: its author, review, assignee, checks and state, read by repo and number; Enter starts its review, o opens it", async () => {
  const { b, cx, st, host } = await openRelated();
  await tab(b, cx);
  for (let i = 0; i < 4; i++) await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual([levelsNow(b), topText(b), cx.opened, st().sel.key], [[[3020], null], "tender#3004 › #3020", undefined, "PVTI_rec4"]);
  const calls = host.open("gh").filter((c) => isPullRequestCall(c.args));
  assert.equal(calls.length, 1, "one read");
  assert.ok(calls[0].args.includes("number=3020"));
  assert.deepEqual(texts(byId(detailPanel(b), "level-note")), ["lädt …"]);
  await host.answer("gh", ok(pullRequestAnswer()), isPullRequestCall);
  assert.equal(topText(b), "tender#3004 › #3020 · feat/3004-pages", "its branch beside the way down, as the PR list's details name it");
  const all = texts(detailPanel(b));
  for (const text of ["von alex-sample · Entwurf", "zugewiesen: Robin Example", "CHECKS", "2 bestanden", "offen"]) assert.ok(all.includes(text), text);
  assert.equal(byId(detailPanel(b), "related-lines"), null, "no description and no related items, as in the PR list");
  assert.deepEqual(hintKeys(b).filter((k) => k === "Tab"), ["Tab"], "Tab still names the way back");
  await press(b, cx, "j");
  assert.deepEqual(levelsNow(b), [[3020], null], "no lines to walk");
  await press(b, cx, "o");
  assert.deepEqual(cx.opened, ["https://github.com/example/tender/pull/3020"]);
  await press(b, cx, "enter");
  assert.deepEqual([b.modal?.kind, b.modal.item.kind, board.itemLabel(b.modal.item)], ["start", "pr", "tender#3020"], "its review");
  await press(b, cx, "escape");
  await press(b, cx, "escape");
  assert.deepEqual(levelsNow(b), [[], 3], "back on its line");
  await press(b, cx, "enter");
  assert.equal(host.open("gh").length, 0, "its details kept while the way down holds it");
});

test("UI: a pull request's read that fails says why in the panel; a pull request's own details, in the PR list, read nothing", async () => {
  const { b, cx, host } = await openRelated();
  await tab(b, cx);
  for (let i = 0; i < 4; i++) await press(b, cx, "j");
  await press(b, cx, "enter");
  await host.answer("gh", { code: 1, stdout: "", stderr: "GraphQL: Could not resolve to a PullRequest with the number of 3020. (repository.pullRequest)" }, isPullRequestCall);
  assert.deepEqual(texts(byId(detailPanel(b), "level-note")), ["GraphQL: Could not resolve to a PullRequest with the number of 3020. (repository.pullRequest)"]);
  const list = await openBoard();
  await press(list.b, list.cx, "2");
  await list.host.answer("gh", ok(fixture("github-list.json")));
  await press(list.b, list.cx, "enter");
  assert.equal(list.host.open("gh").length, 0);
});

test("an Azure pull request the panel goes down to is az repos pr show by its id: its title, status, draft, author, branch and the reviewers' votes as a review", () => {
  const c = sprintTeam();
  assert.deepEqual(board.azPullRequestArgs(c, 57), ["repos", "pr", "show", "--org", ORG, "--detect", "false", "--id", "57", "-o", "json"]);
  const d = board.parseAzurePullRequest(fixture("azure-pr-show.json"));
  assert.deepEqual(d, { title: "Import the sample catalogue", state: "offen", color: "ansi2", done: false, draft: false, author: "Alex Sample", review: "freigegeben", branch: "feature/sample-import" });
  const as = (patch) => board.parseAzurePullRequest(JSON.stringify({ ...json("azure-pr-show.json"), ...patch }));
  assert.deepEqual([as({ status: "completed" }), as({ status: "abandoned" }), as({ status: "odd" })].map((x) => [x.state, x.color, x.done]),
    [["gemerged", "ansi5", true], ["geschlossen", "muted", true], ["odd", "muted", false]]);
  assert.deepEqual(["Entwurf", ""].map((_, i) => as(i ? { reviewers: [] } : { isDraft: true }).review), ["Entwurf", ""]);
  const votes = (list) => board.azureReview(list.map((vote) => ({ vote })), false);
  assert.deepEqual([votes([10, -10]), votes([-5, -10]), votes([5, -5]), votes([5, 0]), votes([10]), votes([0]), votes([])],
    ["abgelehnt", "abgelehnt", "wartet auf Autor", "freigegeben", "freigegeben", "", ""]);
  assert.equal(board.azureReview(null, false), "");
  assert.equal(as({ sourceRefName: null }).branch, null);
  assert.throws(() => board.parseAzurePullRequest("{}"), /^Error: Azure lieferte keinen Pull Request$/);
  const { reads } = board.makeAzure(null).pullRequest;
  assert.deepEqual([reads({ source: "azure", kind: "pr", number: 57 }), reads({ source: "azure", kind: "workitem", number: 57 }), reads({ source: "azure", kind: "pr", number: null })], [true, false, false]);
});

test("UI: Enter on an Azure work item's pull request line shows it a level down: read with az repos pr show, its title, author, review, state and branch, no checks", async () => {
  const { b, cx, host, st } = await openSprint();
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  await tab(b, cx);
  await press(b, cx, ...SHIFT_G);
  await press(b, cx, "enter");
  assert.deepEqual([levelsNow(b), topText(b), st().sel.key], [[[57], null], "301 › !57", "AB#301"]);
  const shows = host.open("az").filter((c) => c.args[0] === "repos");
  assert.deepEqual(shows.map((c) => c.args), [board.azPullRequestArgs(b.view().context, 57)]);
  await host.answer("az", ok(fixture("azure-pr-show.json")), (a) => a[0] === "repos");
  assert.equal(topText(b), "301 › !57 · feature/sample-import", "its branch");
  const all = texts(detailPanel(b));
  for (const text of ["Import the sample catalogue", "von Alex Sample · freigegeben", "offen"]) assert.ok(all.includes(text), text);
  assert.equal(all.includes("CHECKS"), false, "no checks on Azure");
  assert.deepEqual([b.actionContext().details.branch, b.actionContext().details.kind], ["feature/sample-import", "pr"], "the item its keys act on: its details laid over its line");
});


test("UI: a state's chip is its state in the theme's background on its color, alike on the Sprint's stories and tasks (not shrinking), the Backlog's rows, the details' lines and a level", async () => {
  const theme = () => ({ background: "#bg", ansi2: "#green", ansi4: "#blue", muted: "#grey", dim: "#dim" });
  const look = (el) => [el.kids[0], el.with.text_color[0], el.with.bg[0], el.styles.includes("flex_none")];
  const sprint = await openSprint();
  sprint.host.theme = theme;
  const sprintRoot = sprint.b.render();
  assert.deepEqual(look(chipOf(byId(sprintRoot, "story-AB#301"), "In Progress")), ["In Progress", "#bg", "#blue", true], "a story");
  assert.deepEqual(look(chipOf(byId(sprintRoot, "card-AB#312"), "In Progress")), ["In Progress", "#bg", "#blue", true], "a task");
  const backlog = await openBacklog();
  backlog.host.theme = theme;
  const row = backlog.st().data.rows[0];
  const color = theme()[board.stateColor(backlog.st().data, row.state)];
  assert.deepEqual(look(chipOf(byId(backlog.b.render(), `row-${row.key}`), row.state)), [row.state, "#bg", color, false], "a Backlog row");
  const related = await openRelated();
  related.host.theme = theme;
  assert.deepEqual(look(byId(detailPanel(related.b), "related-line-0").kids.at(-1)), ["offen", "#bg", "#green", false], "a line, in its source's color");
  const level = await onFirstLine();
  await press(level.b, level.cx, "enter");
  level.host.theme = theme;
  assert.deepEqual([levelsNow(level.b)[0], look(chipOf(detailPanel(level.b), "offen"))], [[3001], ["offen", "#bg", "#green", false]], "a level, in its line's color");
});

// ---- Levels on partial reads, dropped reads and other views ----

// The related items' answer of tender#3004 with `patch` applied to its
// issue; `errors` beside them.
function rootAnswer(patch, errors) {
  const answer = json("github-related.json");
  patch(answer.data.repository.issue);
  return ok(JSON.stringify(errors ? { ...answer, errors } : answer));
}
const without3010 = (issue) => (issue.subIssues.nodes = issue.subIssues.nodes.filter((n) => n.number !== 3010));

test("UI: r takes a level away only where the section its line came from came whole: sub-issues GitHub did not send, sent cut short or with one hidden keep it; another section's failure decides nothing for it", async () => {
  const { b, cx, host } = await onLevel();
  const again = async (answer) => {
    await reloadBoard(b, cx, host);
    await host.answer("gh", answer, readRelatedOf(3004));
    await host.answer("gh", ok(relatedAnswer({ n: 2 })), readRelatedOf(3010));
  };
  await again(rootAnswer((i) => (i.subIssues = null), [{ type: "FORBIDDEN", path: ["repository", "issue", "subIssues"], message: "Sub-issues are hidden" }]));
  assert.deepEqual([levelsNow(b)[0], b.notice], [[3010], null], "not sent: kept, nothing said");
  await again(rootAnswer((i) => {
    without3010(i);
    i.subIssues.pageInfo.hasNextPage = true;
  }));
  assert.deepEqual([levelsNow(b)[0], b.notice], [[3010], null], "cut short: it may stand further on");
  await again(rootAnswer((i) => {
    without3010(i);
    i.subIssues.nodes.push(null);
  }));
  assert.deepEqual([levelsNow(b)[0], b.notice], [[3010], null], "one without access: it may be that one");
  await again(rootAnswer((i) => {
    without3010(i);
    i.closedByPullRequestsReferences = null;
  }));
  assert.deepEqual([levelsNow(b)[0], b.notice?.text], [[], "tender#3010 steht nicht mehr bei tender#3004: zurück zu tender#3004"],
    "the pull requests not sent: the sub-issues still decide");
  await tab(b, cx);
  await tab(b, cx);
  await reloadBoard(b, cx, host);
  await host.answer("gh", rootAnswer((i) => (i.parent = parentNode(2900))), readRelatedOf(3004));
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual(levelsNow(b), [[2900], null]);
  await reloadBoard(b, cx, host);
  await host.answer("gh", rootAnswer((i) => (i.subIssues = null)), readRelatedOf(3004));
  assert.deepEqual([levelsNow(b)[0], b.notice?.text], [[], "tender#2900 steht nicht mehr bei tender#3004: zurück zu tender#3004"],
    "the parent's level by the parent's section: it has none now, whatever the sub-issues");
});

test("UI: on Azure a level stays where the children's query failed after the work item came, and goes where it ran", async () => {
  const { b, cx, host } = await openSprint();
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  await tab(b, cx);
  await press(b, cx, "j");
  await press(b, cx, "enter");
  await host.answer("az", ok(JSON.stringify({ id: 312, fields: {}, relations: null })), (a) => a.includes("relations"));
  assert.deepEqual(levelsNow(b), [[312], null]);
  const reload = async (item, children) => {
    await press(b, cx, "r");
    await answerSettings(host);
    await answerRefresh(host, { me: false });
    await host.answer("az", ok(JSON.stringify(item)), (a) => a.includes("relations") && a.includes("301"));
    await host.answer("az", children, (a) => AZ.query(a) && a.some((x) => String(x).includes(" IN (")));
    await host.answer("az", ok(JSON.stringify({ id: 312, fields: {}, relations: null })), (a) => a.includes("relations") && a.includes("312"));
  };
  await reload(json("azure-related-item.json"), azRefused("Operation returned a 400 status code."));
  assert.deepEqual([levelsNow(b)[0], b.notice], [[312], null], "the query failed: kept, nothing said");
  // 312 unlinked; every child left and the parent found.
  const unlinked = json("azure-related-item.json");
  unlinked.relations = unlinked.relations.filter((r) => !/workItems\/312$/.test(r.url));
  const found = [...json("azure-related-children.json"), { id: 399, fields: { "System.Title": "Third" } }, { id: 290, fields: { "System.Title": "Epic" } }];
  await reload(unlinked, ok(JSON.stringify(found)));
  assert.deepEqual([levelsNow(b)[0], b.notice?.text], [[], "AB#312 steht nicht mehr bei AB#301: zurück zu AB#301"], "it ran without it: gone");
});

test("UI: on Azure a pull request's level goes where the work item came without its link, though the children's query failed: its section came whole", async () => {
  const { b, cx, host } = await openSprint();
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  await tab(b, cx);
  await press(b, cx, ...SHIFT_G);
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-pr-show.json")), (a) => a[0] === "repos");
  assert.deepEqual(levelsNow(b), [[57], null]);
  await press(b, cx, "r");
  await answerSettings(host);
  await answerRefresh(host, { me: false });
  const unlinked = json("azure-related-item.json");
  unlinked.relations = unlinked.relations.filter((r) => !/PullRequestId/.test(r.url));
  await host.answer("az", ok(JSON.stringify(unlinked)), (a) => a.includes("relations"));
  await host.answer("az", azRefused("Operation returned a 400 status code."), AZ.query);
  assert.equal(b.state(b.view().id).related.get("AB#301").data.retry, true, "the read is to be repeated");
  assert.deepEqual([levelsNow(b)[0], b.notice?.text], [[], "!57 steht nicht mehr bei AB#301: zurück zu AB#301"]);
});

test("UI: a read that r dropped decides nothing when it comes: r twice keeps the level", async () => {
  const { b, cx, host } = await onLevel();
  await reloadBoard(b, cx, host);
  await press(b, cx, "r");
  await host.answer("gh", rootAnswer(without3010), readRelatedOf(3004));
  assert.deepEqual([levelsNow(b)[0], b.notice], [[3010], null]);
});

test("UI: a level's read that ends after another view's panel opened leaves that panel and its levels alone, and so does a refresh of the first view", async () => {
  const { b, cx, host } = await onFirstLine();
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual(levelsNow(b), [[3010], null]);
  await press(b, cx, "3");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  await press(b, cx, "enter");
  await host.answer("gh", ok(fixture("github-related.json")), readRelatedOf(3004));
  await tab(b, cx);
  await press(b, cx, "j");
  await press(b, cx, "enter");
  const other = () => [b.panel?.view, b.panel?.levels.map((l) => l.item.number)];
  assert.deepEqual(other(), ["other", [3001]]);
  await host.answer("gh", ok(relatedAnswer({ n: 1 })), (a) => isRelatedCall(a) && a.includes("number=3010"));
  assert.deepEqual(other(), ["other", [3001]], "the first view's late read");
  b.refresh(b.viewById("mine"), cx);
  await settle();
  assert.deepEqual(other(), ["other", [3001]], "the first view's refresh");
});

test("UI: r shows a level as its line above says now: a sub-issue that opened again shows open", async () => {
  const { b, cx, host } = await onLevel();
  assert.ok(chipOf(detailPanel(b), "geschlossen"));
  await reloadBoard(b, cx, host);
  await host.answer("gh", rootAnswer((i) => (i.subIssues.nodes.find((n) => n.number === 3010).state = "OPEN")), readRelatedOf(3004));
  assert.deepEqual([levelsNow(b)[0], Boolean(chipOf(detailPanel(b), "offen")), chipOf(detailPanel(b), "geschlossen")], [[3010], true, null]);
});

test("UI: Enter on a line whose item the panel cannot read says so and opens nothing; o opens it", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "enter");
  await answerRelated(host, rootAnswer((i) => {
    i.subIssues.nodes = [{ number: 5000, title: "elsewhere", state: "OPEN", url: "https://github.com/example/gone/issues/5000", repository: null }];
  }));
  await tab(b, cx);
  await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual([levelsNow(b), cx.opened, b.notice?.text, host.open("gh").length], [[[], 0], undefined, "#5000 lässt sich hier nicht zeigen", 0]);
  await press(b, cx, "o");
  assert.deepEqual(cx.opened, ["https://github.com/example/gone/issues/5000"]);
});

test("UI: Esc back up marks the line it came from where a re-read moved it, and the remembered line while the level above is still being read", async () => {
  const { b, cx, host } = await onLevel();
  await reloadBoard(b, cx, host);
  await host.answer("gh", rootAnswer((i) => i.subIssues.nodes.unshift({ number: 2999, title: "new", state: "OPEN", url: "u", repository: { nameWithOwner: "example/tender" } })),
    readRelatedOf(3004));
  await press(b, cx, "escape");
  assert.deepEqual(levelsNow(b), [[], 2], "tender#3010 now the third line");
  const loading = await onLevel();
  await reloadBoard(loading.b, loading.cx, loading.host);
  await press(loading.b, loading.cx, "escape");
  assert.deepEqual(levelsNow(loading.b), [[], 1], "still being read: the line it was on");
});

test("UI: the hint line on a level: with no line marked Enter and o are the level's item's, with one the line's; a pull request's level names no lines", async () => {
  const { b, cx, host } = await onLevel();
  const hint = (key) => b.render().kids.at(-1).kids.map((h) => texts(h)).filter((t) => t[0] === key).map((t) => t[1]);
  const once = (where) => assert.deepEqual(hintKeys(b), [...new Set(hintKeys(b))], `each key once: ${where}`);
  assert.deepEqual([hint("Enter"), hint("o"), hint("j/k")], [["Agent"], ["öffnen"], []]);
  once("a level, no line");
  await press(b, cx, "j");
  assert.deepEqual([hint("Enter"), hint("o")], [["Zeile zeigen"], ["Zeile öffnen"]]);
  once("a level's line");
  await press(b, cx, "escape");
  for (let i = 0; i < 2; i++) await press(b, cx, "j");
  await press(b, cx, "enter");
  assert.deepEqual(levelsNow(b)[0], [3020]);
  await host.answer("gh", ok(pullRequestAnswer()), isPullRequestCall);
  assert.deepEqual([hint("Enter"), hint("o"), hint("j/k")], [["Review"], ["öffnen"], []]);
  once("a pull request's level");
});

test("UI: the command menu runs a line's action only on the line it opened on: where a re-read moved the lines it says so and opens nothing", async () => {
  const { b, cx, host } = await onFirstLine();
  await openMenu(b, cx);
  b.modal.input.type("Zeile im Browser");
  b.reload(cx);
  await settle();
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  await host.answer("gh", rootAnswer((i) => (i.parent = parentNode(2900))), readRelatedOf(3004));
  cx.call((own) => b.modal.input.submit(own));
  await settle();
  assert.deepEqual([b.modal, b.notice?.text, cx.opened], [null, "tender#3001 ist nicht mehr markiert", undefined]);
});

test("UI: on a level the command menu still lists the board item's actions under its heading, without their keys", async () => {
  const { b, cx } = await onLevel();
  await openMenu(b, cx);
  const entries = board.shownCommands(b.modal.entries, "");
  const items = entries.filter((e) => e.group === "item").map((e) => [e.name, e.key]);
  assert.deepEqual(items.filter(([name]) => /Status|Zuweisen|verschieben/.test(name)),
    [["Status ändern…", null], ["Zuweisen…", null], ["Nach links verschieben", null], ["Nach rechts verschieben", null]]);
  assert.equal(entries.find((e) => e.group === "item").head, "Issue tender#3004 · feat(api): page through long lists");
});

test("UI: a pull request's level says what GitHub did not send of it", async () => {
  const { b, cx, host } = await openRelated();
  await tab(b, cx);
  for (let i = 0; i < 4; i++) await press(b, cx, "j");
  await press(b, cx, "enter");
  const answer = JSON.parse(pullRequestAnswer());
  answer.errors = [{ type: "FORBIDDEN", path: ["repository", "pullRequest", "commits"], message: "Checks are hidden" }];
  await host.answer("gh", ok(JSON.stringify(answer)), isPullRequestCall);
  assert.deepEqual(texts(byId(detailPanel(b), "level-note")), ["Checks are hidden"]);
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
  assert.equal(hintKeys(b).includes("z"), false, "the switch names z; the hint line does not");
  await press(b, cx, "z");
  assert.deepEqual([foldBox(b).styles.includes("max_h"), texts(byId(detailPanel(b), "description-fold"))], [false, ["weniger (z)"]], "unfolded");
  await tab(b, cx);
  assert.equal(hintKeys(b).includes("z"), false, "nor in the panel");
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

test("an Azure work item's related items: one az call for the item with its links, one WIQL query by id for its children and its parent; what the answers hold", () => {
  const c = sprintTeam();
  assert.deepEqual(board.azRelatedArgs(c, 301), ["boards", "work-item", "show", "--org", ORG, "--detect", "false", "--id", "301", "--expand", "relations", "-o", "json"]);
  assert.equal(board.idsWiql([312, 311]), `SELECT ${board.WORK_ITEM_FIELDS.map((f) => `[${f}]`).join(", ")} FROM WorkItems WHERE [System.Id] IN (312, 311) ORDER BY [System.Id]`,
    "the Backlog's query for the fields of work items by id");
  const read = board.parseRelatedItem(fixture("azure-related-item.json"));
  assert.match(read.description, /^<div><h2>Goal<\/h2>/);
  assert.deepEqual(read.children, [312, 311, 399], "the children, in the links' order; parent, related and branch links left out");
  assert.equal(read.parent, 290, "the parent by its own link");
  assert.deepEqual(read.prs, [{ project: "0f3c6a1e-8b2d-4e7f-a915-3c2d1b0a9e88", repo: "6a1d0c3e-2f4b-4e8a-b7c9-1d2e3f4a5b6c", number: 57 }]);
  const bare = board.parseRelatedItem(JSON.stringify({ id: 5, fields: {}, relations: null }));
  assert.deepEqual(bare, { description: "", parent: null, children: [], prs: [] }, "no description, no links");
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
  assert.ok(childrenQuery(host)[0].args.includes(board.idsWiql([312, 311, 399, 290])), "the parent in the same query");
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
  assert.deepEqual(look(byId(prs.b.render(), `row-${second.key}`)), ["none", t["copper-violet-text"]], "the others with their section's stripe");
  const related = await openRelated();
  related.host.theme = () => t;
  await action(related.b, related.cx, "board_tab");
  await press(related.b, related.cx, "j");
  assert.deepEqual(look(byId(detailPanel(related.b), "related-line-0")), [board.selectedBg(t), t.accent]);
  assert.deepEqual(look(byId(detailPanel(related.b), "related-line-1")), ["none", t.chrome]);
});

// ---- PR list: sections in their tones, the mark on what asks something ----

// testConfig with the shipped PR view's sections, the third one's tone
// `third` (none: views.json's teal).
function attentionConfig(third = undefined) {
  const config = JSON.parse(testConfig());
  const sections = JSON.parse(shippedConfig()).sources.github.views.find((v) => v.layout === "list").sections;
  config.sources.github.views[1].sections = sections.map((s, i) => (i === 2 && third ? { ...s, tone: third } : s));
  return JSON.stringify(config);
}
// The PR tab of a board on `config`, read from `answer` (by default
// github-list-attention.json) and drawn in the theme `t`.
async function openAttention(t, config = attentionConfig(), answer = fixture("github-list-attention.json")) {
  const opened = await openBoard({ config });
  opened.host.theme = () => t;
  await press(opened.b, opened.cx, "2");
  await opened.host.answer("gh", ok(answer));
  return opened;
}
// A section's head: [its background, its text's color, its text].
const sectionHead = (root, i) => {
  const head = byId(root, `section-${i}`);
  return [head.with.bg[0], head.with.text_color[0], texts(head).join("")];
};
// The element holding the text `text` in the row of the pull request `n`.
const rowCell = (root, n, text) => pathTo(byId(root, `row-PR_sample${n}`), (s) => s === text)?.at(-1) ?? null;
const rowStripe = (root, n) => byId(root, `row-PR_sample${n}`).with.border_color[0];

test("UI: in a copper theme each PR list section's head sits on a band of its tone's step (3, or 4 where 3 stands too close), its name and count in the tone's text color; each row has a stripe in it; a pull request that asks something of the viewer is marked in copper's orange with its reasons, a reviewed one waits on its author; the details say why", async () => {
  for (const mode of COPPER) {
    const t = copperTheme(mode);
    const { b, cx } = await openAttention(t);
    const root = b.render();
    const colors = ["blue", "violet", "teal"];
    colors.forEach((color, i) => {
      const [bg, fg] = sectionHead(root, i);
      assert.equal(bg, board.headBg(t, `ansi${4 + i}`, t.background), `${mode} ${color}: as a column's head on the background`);
      assert.ok([t[`copper-${color}-3`], t[`copper-${color}-4`]].includes(bg), `${mode} ${color}: a copper step`);
      assert.equal(fg, t[`copper-${color}-text`], `${mode} ${color}`);
    });
    assert.deepEqual([0, 1, 2].map((i) => sectionHead(root, i)[2]), ["ZU PRÜFEN · 6", "MEINE · 3", "GEPRÜFT · 3"]);
    assert.deepEqual([102, 104, 202, 301].map((n) => rowStripe(root, n)), ["blue", "blue", "violet", "teal"].map((c) => t[`copper-${c}-text`]), mode);
    const mark = rowCell(root, 202, "● Änderungen gewünscht · 2 offene Threads · Checks rot · Konflikt");
    assert.ok(mark, `${mode}: every reason in the row`);
    assert.equal(mark.with.text_color[0], t["copper-orange-text"], mode);
    assert.equal(board.markColor(t), t["copper-orange-text"]);
    assert.ok(mark.styles.includes("truncate") && mark.with.w[0] === 200, "a cell of its own width, cut where it is longer");
    assert.equal(rowCell(root, 301, "wartet auf Autor").with.text_color[0], t.muted, mode);
    assert.ok(rowCell(root, 103, "● Review erneut angefragt"), `${mode}: asked again with nothing new`);
    await click(b, cx, "row-PR_sample202");
    await click(b, cx, "row-PR_sample202");
    const shown = texts(detailPanel(b));
    const at = shown.indexOf("DU BIST DRAN");
    assert.deepEqual(shown.slice(at, at + 5), ["DU BIST DRAN", "Änderungen gewünscht", "2 offene Threads", "Checks rot", "Konflikt"], mode);
    assert.ok(shown.includes("CHECKS"), "and its checks after them");
    assert.equal(byId(detailPanel(b), "unread-note"), null, "all of it read");
    assert.equal(rowStripe(b.render(), 202), t.accent, "a selected row's stripe is the accent");
    await click(b, cx, "row-PR_sample301");
    await click(b, cx, "row-PR_sample301");
    assert.equal(texts(detailPanel(b)).includes("DU BIST DRAN"), false, "nothing to do: no such section");
  }
});

test("UI: a pull request the list could not read whole says so in its row: \"? nicht ganz gelesen\" where it names no reason, \"· ?\" after its reasons, \"?\" for checks lost to an error; its details list what is missing as warnings after its checks; the list shows no warning for those errors, but one for an error of a search", async () => {
  const t = copperTheme("dark");
  const data = json("github-list-attention.json");
  data.data.s2.nodes[0].reviews = null;
  data.data.s0.nodes[1].reviews = null;
  data.data.s1.nodes[1].commits.nodes[0].commit.statusCheckRollup = null;
  data.errors = [
    { path: ["s2", "nodes", 0, "reviews"], message: "Reviews are hidden" },
    { path: ["s1", "nodes", 1, "commits", "nodes", 0, "commit", "statusCheckRollup"], message: "Checks are hidden" },
    { path: ["s0"], message: "Search is slow" },
  ];
  const { b, cx } = await openAttention(t, attentionConfig(), JSON.stringify(data));
  const root = b.render();
  assert.equal(rowCell(root, 301, "? nicht ganz gelesen").with.text_color[0], t.muted);
  assert.equal(rowCell(root, 301, "wartet auf Autor"), null);
  assert.ok(rowCell(root, 101, "● Review angefragt · ?"), "a reason, and something unread");
  assert.ok(rowCell(root, 201, "?"), "checks lost to an error");
  assert.equal(rowCell(root, 201, "● bereit zum Mergen"), null);
  assert.equal(texts(root).includes("Reviews are hidden") || texts(root).includes("Checks are hidden"), false, "no warning of the list");
  assert.ok(texts(root).includes("Search is slow"), "an error of a search is one");
  await click(b, cx, "row-PR_sample301");
  await click(b, cx, "row-PR_sample301");
  const panel = detailPanel(b);
  const shown = texts(panel);
  const at = shown.indexOf("CHECKS");
  assert.ok(at >= 0);
  assert.deepEqual(shown.slice(at + 2, at + 4), ["Reviews are hidden", board.UNREAD.reviews], "after the checks");
  const notes = chainTo(panel, (el) => el.with.id?.[0] === "unread-note");
  assert.equal(notes.at(-1).with.text_color[0], t["copper-yellow-text"], "a warning, as a pull request a level down shows one");
  assert.equal(notes.at(-1).with.px[0], 18);
});

// gh's answer for the unread notifications: one per pull request `numbers`
// of example/tender.
const notificationsOf = (...numbers) => ok(JSON.stringify(numbers.map((n) => ({
  id: String(n), unread: true, reason: "comment", repository: { full_name: "example/tender" },
  subject: { title: "x", url: `https://api.github.com/repos/example/tender/pulls/${n}`, latest_comment_url: null, type: "PullRequest" },
}))));

test("UI: a pull request with an unread notification says „ungelesen“ first in its row's mark, in copper's orange, and among its details' reasons; where the notifications cannot be read, no row says it and a note above the list says why; each read of the list asks for them once", async () => {
  const t = copperTheme("dark");
  const { b, cx, host } = await openBoard({ config: attentionConfig(), notificationsAnswer: notificationsOf(202, 301) });
  host.theme = () => t;
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list-attention.json")), isListCall);
  assert.equal(host.notificationsAsks, 1);
  let root = b.render();
  const mark = rowCell(root, 202, "● ungelesen · Änderungen gewünscht · 2 offene Threads · Checks rot · Konflikt");
  assert.ok(mark, "first, beside the other reasons");
  assert.equal(mark.with.text_color[0], t["copper-orange-text"]);
  assert.ok(rowCell(root, 301, "● ungelesen"), "where it is the only one");
  assert.equal(rowCell(root, 301, "wartet auf Autor"), null);
  await click(b, cx, "row-PR_sample301");
  await click(b, cx, "row-PR_sample301");
  const shown = texts(detailPanel(b));
  assert.deepEqual(shown.slice(shown.indexOf("DU BIST DRAN"), shown.indexOf("DU BIST DRAN") + 2), ["DU BIST DRAN", "ungelesen (GitHub-Benachrichtigung)"]);
  const fails = [
    [{ code: 1, stdout: '{"message":"Resource not accessible by personal access token"}', stderr: "gh: Resource not accessible by personal access token (HTTP 403)" }, TOKEN_KIND],
    [ok('{"message":"x"}'), "GitHub schickte keine Liste von Benachrichtigungen"],
    [stopped(found("gh")), "gh antwortete nicht in 30 s"],
  ];
  for (const [answer, why] of fails) {
    host.notificationsAnswer = answer;
    b.refresh(b.view(), cx);
    await settle();
    await host.answer("gh", ok(fixture("github-list-attention.json")), isListCall);
    root = b.render();
    assert.equal(b.state("prs").error ?? null, null, `${why}: the list shows`);
    assert.ok(texts(root).includes(`GitHub-Benachrichtigungen nicht abgerufen, keine Markierung „ungelesen“: ${why}`), why);
    assert.deepEqual(b.state("prs").data.sections.flatMap((s) => s.rows).filter((r) => r.attention.includes("ungelesen")), [], `${why}: no row`);
    assert.ok(rowCell(root, 301, "wartet auf Autor"), why);
  }
  assert.equal(host.notificationsAsks, 4);
  host.notificationsAnswer = notificationsOf(301);
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(fixture("github-list-attention.json")), isListCall);
  assert.equal(texts(b.render()).some((s) => String(s).startsWith("GitHub-Benachrichtigungen")), false, "read again: the note goes");
  assert.ok(rowCell(b.render(), 301, "● ungelesen"));
  const nameless = [1, 2].map((n) => ({ id: `u${n}`, unread: true, subject: { title: "x", url: null, latest_comment_url: null, type: "PullRequest" } }));
  host.notificationsAnswer = ok(JSON.stringify([...JSON.parse(notificationsOf(301).stdout), ...nameless]));
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(fixture("github-list-attention.json")), isListCall);
  assert.ok(texts(b.render()).includes("2 ungelesene Benachrichtigungen zu Pull Requests ohne lesbare Adresse"), "those it cannot place are counted");
  assert.ok(rowCell(b.render(), 301, "● ungelesen"), "the others still mark theirs");
});

test("UI: a pull request unread on GitHub and not read whole says „● ungelesen · ?“ in its row; its details name the notification among its reasons and what is missing as a warning", async () => {
  const t = copperTheme("dark");
  const data = json("github-list-attention.json");
  data.data.s2.nodes[0].reviews = null;
  data.errors = [{ path: ["s2", "nodes", 0, "reviews"], message: "Reviews are hidden" }];
  const { b, cx, host } = await openBoard({ config: attentionConfig(), notificationsAnswer: notificationsOf(301) });
  host.theme = () => t;
  await press(b, cx, "2");
  await host.answer("gh", ok(JSON.stringify(data)), isListCall);
  assert.ok(rowCell(b.render(), 301, "● ungelesen · ?"));
  await click(b, cx, "row-PR_sample301");
  await click(b, cx, "row-PR_sample301");
  const shown = texts(detailPanel(b));
  assert.deepEqual(shown.slice(shown.indexOf("DU BIST DRAN"), shown.indexOf("DU BIST DRAN") + 2), ["DU BIST DRAN", "ungelesen (GitHub-Benachrichtigung)"]);
  assert.ok(shown.includes(board.UNREAD.reviews));
  assert.ok(shown.includes("Reviews are hidden"));
});

test("UI: the PR list draws its rows as soon as the list answers, unmarked while the notifications are still read and with a note above them that says so, in the info tone and not among the warnings, and the follow-up for more threads too; the notifications mark the rows once they come, and what is saved has no note; over rows it already shows, it waits for them", async () => {
  const pending = "GitHub-Benachrichtigungen werden noch gelesen …";
  const t = copperTheme("dark");
  const boot = () => bootBoard({ config: shippedConfig(), stored: { source: "github", "tab:github": "github:prs" }, notificationsAnswer: null });
  const plain = await boot();
  plain.host.theme = () => t;
  await plain.host.answer("gh", ok(fixture("github-list-attention.json")), isListCall);
  assert.ok(rowCell(plain.b.render(), 301, "wartet auf Autor"), "without a follow-up too");
  const chain = chainTo(plain.b.render(), hasId("notified-pending"));
  const note = chain.at(-1);
  assert.deepEqual(texts(note), [pending]);
  assert.equal(chain.some(hasId("rows")), false, "outside the rows' scroll list");
  const beside = chain.at(-2).kids;
  assert.ok(beside.indexOf(note) >= 0 && beside.indexOf(note) < beside.findIndex(hasId("rows")), "above the rows");
  assert.equal(note.with.text_color[0], board.toneColor(t, board.NOTE_TONES.info), "a loading state, not a problem");
  assert.notEqual(board.toneColor(t, board.NOTE_TONES.info), board.toneColor(t, board.NOTE_TONES.warning));
  assert.equal(plain.b.state("prs").warnings.includes(pending), false);
  await plain.host.answer("gh", notificationsOf(301), board.NOTIFICATIONS_PATH);
  assert.ok(rowCell(plain.b.render(), 301, "● ungelesen"));
  assert.equal(texts(plain.b.render()).includes(pending), false);
  assert.equal(byId(plain.b.render(), "notified-pending"), null);
  await plain.cx.fire();
  const saved = JSON.parse(memory.get("board:data:prs"));
  assert.ok(saved.data.sections.length, "saved");
  assert.equal("notifiedPending" in saved.data, false);
  assert.equal(saved.warnings.includes(pending), false);
  const { b, cx, host } = await boot();
  const data = json("github-list-attention.json");
  const node = cutThreads(data, 102, 12, [...resolvedThreads(11), waitingThread]);
  const threads = ok(JSON.stringify({ data: { nodes: [node] } }));
  const marked = () => b.state("prs").data.sections.flatMap((s) => s.rows).filter((r) => r.attention.includes("ungelesen")).map((r) => r.number).sort();
  await host.answer("gh", ok(JSON.stringify(data)), isListCall);
  let root = b.render();
  assert.ok(rowCell(root, 301, "wartet auf Autor"), "the rows show");
  assert.deepEqual(marked(), []);
  assert.ok(texts(root).includes(pending));
  assert.equal(b.state("prs").loading, true);
  await host.answer("gh", threads, isThreadsCall);
  root = b.render();
  assert.ok(rowCell(root, 102, "● neue Commits seit deinem Review · Antwort erwartet"), "the follow-up draws before them");
  assert.ok(texts(root).includes(pending));
  assert.equal(b.state("prs").loading, true);
  await host.answer("gh", notificationsOf(301, 102), board.NOTIFICATIONS_PATH);
  root = b.render();
  assert.ok(rowCell(root, 301, "● ungelesen"));
  assert.ok(rowCell(root, 102, "● ungelesen · neue Commits seit deinem Review · Antwort erwartet"));
  assert.equal(texts(root).includes(pending), false);
  assert.equal(b.state("prs").loading, false);
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", ok(JSON.stringify(data)), isListCall);
  await host.answer("gh", threads, isThreadsCall);
  assert.deepEqual(marked(), [102, 301], "the rows it shows stay until the notifications are in");
  assert.equal(texts(b.render()).includes(pending), false);
  await host.answer("gh", ok("[]"), board.NOTIFICATIONS_PATH);
  assert.deepEqual(marked(), []);
  assert.equal(b.state("prs").loading, false);
});

test("UI: a row whose reasons hang on whether one's last review is one says \"? nicht ganz gelesen\", never \"wartet auf Autor\", and its details say why", async () => {
  const t = copperTheme("dark");
  const data = json("github-list-attention.json");
  const pr = attentionPr(data, 301);
  pr.reviews.nodes = [myReview("COMMENTED", "2026-11-19T10:00:00Z", "0301aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "", [true])];
  delete pr.reviews.nodes[0].body;
  const { b, cx } = await openAttention(t, attentionConfig(), JSON.stringify(data));
  const root = b.render();
  assert.ok(rowCell(root, 301, "? nicht ganz gelesen"));
  assert.equal(rowCell(root, 301, "wartet auf Autor"), null);
  await click(b, cx, "row-PR_sample301");
  await click(b, cx, "row-PR_sample301");
  assert.ok(texts(detailPanel(b)).includes("deine letzten Reviews nicht ganz gelesen"));
});

test("UI: a PR list section's tone from views.json; on a theme without copper's colors its band is the tone's color laid over the background at HEAD_ALPHA, its stripe and text the theme's color, and the mark the theme's foreground", async () => {
  for (const [name, t] of Object.entries(TINTED())) {
    const { b } = await openAttention(t, attentionConfig("yellow"));
    const root = b.render();
    ["ansi4", "ansi5", "ansi3"].forEach((tone, i) => {
      const [bg, fg] = sectionHead(root, i);
      assert.deepEqual([bg, fg], [over(`${t[tone]}${board.HEAD_ALPHA}`, t.background), t[tone]], `${name} ${i}: ${tone}`);
    });
    assert.equal(b.views.prs.data.sections[2].color, "ansi3", "views.json's yellow");
    assert.deepEqual([102, 201, 302].map((n) => rowStripe(root, n)), [t.ansi4, t.ansi5, t.ansi3], `${name}: the first row, selected, has the accent`);
    assert.equal(rowCell(root, 104, "● Review angefragt").with.text_color[0], t.foreground, name);
    assert.equal(board.markColor(t), t.foreground, name);
  }
  const copper = copperTheme("dark");
  const inCopper = await openAttention(copper, attentionConfig("yellow"));
  assert.equal(sectionHead(inCopper.b.render(), 2)[1], copper["copper-yellow-text"], "copper's yellow in a copper theme");
});

test("UI: the PR list reads more threads in one more gh call where a pull request has more than ten, and draws what they say; one that fails leaves the row unread", async () => {
  const t = copperTheme("dark");
  const load = async (answer) => {
    const data = json("github-list-attention.json");
    const node = cutThreads(data, 301, 12, [...resolvedThreads(11), waitingThread]);
    const opened = await openBoard({ config: attentionConfig() });
    opened.host.theme = () => t;
    await press(opened.b, opened.cx, "2");
    await opened.host.answer("gh", ok(JSON.stringify(data)), "search(");
    assert.equal(opened.host.open("gh").length, 1, "one more call");
    await opened.host.answer("gh", answer(node), (args) => args.includes(`ids[]=${node.id}`));
    assert.equal(opened.host.open("gh").length, 0);
    // The board, not its render: an element answers then(), as await asks.
    return opened.b;
  };
  let root = (await load((node) => ok(JSON.stringify({ data: { nodes: [node] } })))).render();
  assert.ok(rowCell(root, 301, "● Antwort erwartet"), "the twelfth thread waits on sample-user");
  const failed = await load(() => ({ code: 1, stdout: "", stderr: "error connecting to api.github.com" }));
  root = failed.render();
  assert.ok(rowCell(root, 301, "? nicht ganz gelesen"));
  assert.deepEqual(failed.views.prs.data.sections[2].rows.find((r) => r.number === 301).unread, ["GitHub nicht erreichbar: error connecting to api.github.com", board.UNREAD.moreThreads(10)],
    "why, and how many it read");
  assert.equal(rowCell(root, 301, "wartet auf Autor"), null);
  const opened = await openBoard({ config: attentionConfig() });
  await press(opened.b, opened.cx, "2");
  await opened.host.answer("gh", ok(fixture("github-list-attention.json")), "search(");
  assert.equal(opened.host.open("gh").length, 0, "no pull request with more: no more calls");
});

test("UI: the follow-up for more threads reads at most 100 pull requests per gh call; one call that fails leaves only its own rows unread", async () => {
  const data = json("github-list-attention.json");
  const base = attentionPr(data, 301);
  // 101 pull requests in Geprüft, each with twelve threads of which the list read ten.
  const many = Array.from({ length: 101 }, (_, k) => ({ ...structuredClone(base), id: `PR_many${k}`, number: 1000 + k,
    reviewThreads: { totalCount: 12, nodes: resolvedThreads(10) } }));
  data.data.s2 = { issueCount: 101, nodes: many };
  const { b, cx, host } = await openBoard({ config: attentionConfig() });
  await press(b, cx, "2");
  await host.answer("gh", ok(JSON.stringify(data)), "search(");
  const ids = (args) => args.filter((a) => String(a).startsWith("ids[]=")).map((a) => a.slice(6));
  const first = host.open("gh")[0];
  assert.deepEqual([host.open("gh").length, ids(first.args).length], [1, 100], "the first hundred");
  const node = (id) => ({ id, reviewThreads: { totalCount: 12, nodes: [...resolvedThreads(11), waitingThread] } });
  await host.answer("gh", ok(JSON.stringify({ data: { nodes: ids(first.args).map(node) } })), (args) => ids(args).length === 100);
  const second = host.open("gh")[0];
  assert.deepEqual(ids(second.args), ["PR_many100"], "then the one left");
  await host.answer("gh", { code: 1, stdout: "", stderr: "error connecting to api.github.com" }, (args) => ids(args).length === 1);
  assert.equal(host.open("gh").length, 0);
  const rows = b.views.prs.data.sections[2].rows;
  assert.deepEqual(rows.filter((r) => r.attention.includes("Antwort erwartet")).length, 100, "the first hundred read whole");
  const last = rows.find((r) => r.number === 1100);
  assert.deepEqual([last.attention, last.unread], [[], ["GitHub nicht erreichbar: error connecting to api.github.com", board.UNREAD.moreThreads(10)]]);
  assert.equal(board.THREAD_IDS, 100);
});

test("UI: „nur meine“ keeps Geprüft: a search for what one reviewed counts as one's own", async () => {
  const { b, cx } = await openAttention(copperTheme("dark"));
  const shown = () => b.navColumns(b.view())[0].shown.map((r) => r.number);
  const before = shown();
  await press(b, cx, "m");
  assert.equal(b.mine, true);
  assert.deepEqual(shown(), before, "every section is a search of one's own");
  assert.ok(texts(b.render()).includes("GEPRÜFT · 3"));
});

test("the mark shares its color with no section tone and no check state, and its text reads at 4.5:1 or more on a row and a selected one; a PR list section's name and count read at 4.5:1 or more on its band and its stripe stands at 3:1 or more from the background, for every tone a section takes, in copper-dark and copper-light with and without copper's colors and in catppuccin-mocha", () => {
  const themes = { "copper-dark": copperTheme("dark"), "copper-light": copperTheme("light"), ...Object.fromEntries(Object.entries(TINTED()).map(([k, t]) => [`tinted ${k}`, t])) };
  assert.equal(Object.keys(themes).length, 5);
  const ratios = {};
  const stripes = {};
  for (const [name, t] of Object.entries(themes)) {
    const others = [];
    for (const [hue, tone] of Object.entries(board.SECTION_TONES)) {
      const band = board.headBg(t, tone, t.background);
      ratios[`${name} ${hue} head`] = [contrast(board.toneColor(t, tone), band)];
      stripes[`${name} ${hue} stripe`] = [contrast(board.toneColor(t, tone), t.background)];
      others.push(board.toneColor(t, tone));
    }
    others.push(...["failed", "pending", "passed"].map((state) => board.checkColor(t, state)));
    const mark = board.markColor(t);
    assert.equal(others.includes(mark), false, `${name}: the mark ${mark} among ${others.join(" ")}`);
    ratios[`${name} mark`] = [contrast(mark, t.background), contrast(mark, board.selectedBg(t))];
  }
  assert.deepEqual(below(ratios, 4.5), [], shownRatios(ratios));
  assert.deepEqual(below(stripes, 3), [], shownRatios(stripes));
});

test("COPPER_HUES names each ANSI slot by the copper color it is drawn in, in copper-dark and copper-light, and SECTION_TONES is it without orange", () => {
  for (const mode of COPPER) {
    const t = copperTheme(mode);
    for (const [name, tone] of Object.entries(board.COPPER_HUES)) assert.equal(board.toneColor(t, tone), t[`copper-${name}-text`], `${mode} ${name}`);
  }
  assert.deepEqual(board.COPPER_HUES, { ...board.SECTION_TONES, orange: "ansi11" });
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
  assert.deepEqual([board.rowTops([18, 40, 18], 6, 12), board.rowTops([], 6, 12)], [{ tops: [12, 36, 82], content: 100 }, { tops: [], content: 12 }]);
});

test("UI: in the details panel ctrl-d and ctrl-u scroll the block half its window, clamped at both ends; without the panel's keyboard they do nothing; the hint line leaves them out", async () => {
  const { b, cx } = await openRelated();
  const content = layOut(b, cx, 100);
  assert.equal(content, 234);
  await press(b, cx, "d", { modifiers: { control: true } });
  assert.equal(offsetOf(b), 0, "the board has the keyboard: nothing");
  await tab(b, cx);
  assert.equal(hintKeys(b).includes("ctrl-d/u"), false);
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

// The transitions of top the details block's content and thumb draw with
// now (the thumb's null where there is none).
const glidesOf = (b) => ["related-lines", "related-thumb"].map((id) => byId(detailPanel(b), id)?.with.transition ?? null);
const GLIDING = [["top", { duration: 120, easing: "ease-out" }], ["top", { duration: 120, easing: "ease-out" }]];
const STILL = [["top", 0], ["top", 0]];

test("UI: a page or end key in the details panel glides the block and its thumb, the first after any other move too (herdr's transition of top, 120 ms ease-out, at every draw); j/k, the mouse wheel and another item's details move them at once", async () => {
  const { b, cx, st } = await openRelated();
  layOut(b, cx, 100);
  const glides = () => glidesOf(b);
  const ctrl = (k) => press(b, cx, k, { modifiers: { control: true } });
  const wheel = (y) => cx.call((own) => byId(detailPanel(b), "related-window").with.on_scroll_wheel[0]({ delta: { x: 0, y } }, own));
  assert.deepEqual(glides(), STILL, "nothing moved yet: drawn with a transition that moves at once");
  await tab(b, cx);
  await ctrl("d");
  assert.deepEqual([offsetOf(b), glides()], [50, GLIDING], "ctrl-d");
  await press(b, cx, "k");
  assert.deepEqual([offsetOf(b), glides()], [32, STILL], "k: a line up, at once");
  await ctrl("u");
  assert.deepEqual([offsetOf(b), glides()], [0, GLIDING], "ctrl-u");
  wheel(-40);
  assert.deepEqual([offsetOf(b), glides()], [40, STILL], "the wheel");
  await press(b, cx, "end");
  assert.deepEqual([offsetOf(b), glides()], [134, GLIDING], "End");
  await press(b, cx, "j");
  assert.deepEqual(glides(), STILL, "j: a line's move, whether it scrolls or not");
  await press(b, cx, "home");
  assert.deepEqual([offsetOf(b), glides()], [0, GLIDING], "Home");
  await press(b, cx, ...SHIFT_G);
  assert.deepEqual([offsetOf(b), glides()], [134, GLIDING], "G, as End");
  await press(b, cx, "escape");
  await press(b, cx, "j");
  assert.equal(st().sel.key, "PVTI_rec5");
  assert.deepEqual([offsetOf(b), glides()[0]], [0, ["top", 0]], "another item's details: at the top, at once");
});

test("UI: where a page or end key put the details block, a change of its heights moves it at once: a resize that cuts its offset, a taller content", async () => {
  const { b, cx } = await openRelated();
  layOut(b, cx, 100);
  await tab(b, cx);
  await press(b, cx, "end");
  assert.deepEqual([offsetOf(b), glidesOf(b)], [134, GLIDING]);
  layOut(b, cx, 200);
  assert.deepEqual([offsetOf(b), glidesOf(b)], [34, STILL], "a taller window: its end at the content's, at once");
  await press(b, cx, "end");
  assert.deepEqual(glidesOf(b), GLIDING, "End again");
  layOut(b, cx, 200, { rowH: 30 });
  assert.deepEqual([offsetOf(b), glidesOf(b)], [34, STILL], "taller content, the offset kept: its thumb moves at once");
});

test("UI: the way back up from a level (Esc, or a re-read that takes its line away) brings the scroll of the level above back at once, also where a page or end key put it", async () => {
  const { b, cx, host } = await openRelated();
  layOut(b, cx, 100);
  await tab(b, cx);
  await press(b, cx, "end");
  assert.deepEqual([b.panel.line, offsetOf(b), glidesOf(b)], [4, 134, GLIDING]);
  b.panel.line = 3;
  await press(b, cx, "enter");
  await host.answer("gh", ok(pullRequestAnswer()), isPullRequestCall);
  assert.deepEqual([b.panel.levels.length, byId(detailPanel(b), "related-lines")], [1, null], "a pull request's level, which draws no block");
  await press(b, cx, "escape");
  assert.deepEqual([b.panel.levels.length, b.panel.line, offsetOf(b), glidesOf(b)], [0, 3, 134, STILL], "the scroll it had, without a glide");
  // Where a re-read takes the line away, the way back up marks none and
  // scrolls no line into view: the restored scroll alone moves the block.
  await press(b, cx, "end");
  b.panel.line = 3;
  await press(b, cx, "enter");
  assert.deepEqual([b.panel.levels.length, glidesOf(b)[0]], [1, null], "the pull request's level again, read before");
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), isBoardCall);
  const without = json("github-related.json");
  const prs = without.data.repository.issue.closedByPullRequestsReferences;
  prs.nodes = prs.nodes.filter((n) => n.number !== 3020);
  prs.totalCount = prs.nodes.length;
  await host.answer("gh", ok(JSON.stringify(without)), readRelatedOf(3004));
  assert.deepEqual([b.panel.levels.length, b.panel.line, offsetOf(b), glidesOf(b)], [0, null, 134, STILL], "no line marked: the scroll it had, without a glide");
});

test("the details block's glide belongs to the move a page or end key made: another item's offset, a restored one and any other move drop it (motionOf)", () => {
  const ui = { offset: 0, glideTo: null, at: "a", viewport: 100, content: 300, sizes: new Map() };
  board.scrollToEnd(ui, "top");
  assert.equal(board.motionOf(ui), board.GLIDE, "Home");
  board.offsetOf(ui, "b");
  assert.deepEqual([ui.offset, board.motionOf(ui)], [0, 0], "another item: at its top, as Home left the last, yet at once");
  board.scrollToEnd(ui, "top");
  const back = board.keptScroll(ui);
  board.restoreScroll(ui, "b", back);
  assert.deepEqual([ui.offset, board.motionOf(ui)], [0, 0], "restored where the key put it: at once");
  board.scrollPage(ui, 1);
  board.revealSpan(ui, { top: 50, height: 10 });
  assert.deepEqual([ui.offset, board.motionOf(ui)], [50, 0], "a line shown where it already shows: at once");
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

test("UI: while the details panel has the keyboard gg and Home go to its top with no line selected, G and End to its bottom on its last line; the hint line leaves them out", async () => {
  const { b, cx, st, host } = await openRelated();
  await tab(b, cx);
  assert.equal(hintKeys(b).includes("gg/G"), false, "no hint for the panel's edges");
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
  assert.ok(texts(menuEl).includes("Befehle · Enter · Esc"));
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
    "Sprint wählen…", "Ansicht wechseln: Backlog (v)",
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

test("UI: on a Sprint z folds the selected story while the board has the keyboard and the description while the details panel has it; the menu says which, the hint line names no z", async () => {
  const { b, cx, host, st } = await openSprint();
  await press(b, cx, "enter");
  await host.answer("az", ok(fixture("azure-related-item.json")), (a) => a.includes("relations"));
  await host.answer("az", ok(fixture("azure-related-children.json")), AZ.query);
  sizeDescription(b, cx, 500);
  const hintOf = (name) => b.render().kids.at(-1).kids.map((h) => texts(h)).filter((t) => t[0] === name).map((t) => t[1]);
  const folds = (entries) => entries.filter(([name]) => /^(Story|Beschreibung)/.test(name));
  assert.deepEqual(hintOf("z"), []);
  assert.deepEqual(texts(byId(detailPanel(b), "description-fold")), ["… mehr"], "z is the story's here: the switch names no key");
  assert.deepEqual(folds(await openMenu(b, cx)), [["Story zu-/aufklappen", "z"], ["Beschreibung mehr", null]]);
  await press(b, cx, "escape");
  await press(b, cx, "z");
  assert.ok(byId(b.render(), "folded-AB#301"), "the story folded");
  assert.equal(b.relatedUi.unfolded, null, "the description not");
  await press(b, cx, "z");
  assert.equal(byId(b.render(), "folded-AB#301"), null);
  await tab(b, cx);
  assert.deepEqual(hintOf("z"), []);
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

test("UI: the hint line while the details panel has the keyboard: each key once and what it does, in the table's order; no moves, z or /", async () => {
  const { b, cx } = await openRelated();
  sizeDescription(b, cx, 500);
  const pairs = () => b.render().kids.at(-1).kids.map((h) => texts(h));
  assert.deepEqual(pairs(), [
    ["1 2 3 [ ]", "Tab"], ["H/L", "verschieben"], ["s", "Status"], ["a", "zuweisen"], ["Enter", "Detail · Agent"], ["o", "öffnen"],
    ["Tab", "Details"], ["m", "nur meine"], ["r", "neu laden"], [":", "Befehle"], ["Esc", "schließen"],
  ], "the board has the keyboard");
  await tab(b, cx);
  assert.deepEqual(pairs(), [
    ["1 2 3 [ ]", "Tab"], ["H/L", "verschieben"], ["s", "Status"], ["a", "zuweisen"], ["Enter", "Detail · Agent"], ["o", "öffnen"],
    ["Tab", "Board"], ["m", "nur meine"], ["r", "neu laden"], [":", "Befehle"], ["Esc", "zurück"],
  ], "the panel with no line selected: Enter and o act on the board's item, and say so");
  await press(b, cx, "j");
  assert.equal(b.panel.line, 0);
  assert.deepEqual(pairs(), [
    ["1 2 3 [ ]", "Tab"], ["H/L", "verschieben"], ["s", "Status"], ["a", "zuweisen"], ["Tab", "Board"],
    ["Enter", "Zeile zeigen"], ["o", "Zeile öffnen"], ["m", "nur meine"], ["r", "neu laden"], [":", "Befehle"], ["Esc", "zurück"],
  ], "a line selected: the panel's Enter and o, once");
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

// ---- Cards: one line per topic (priority, milestone, parent, progress) ----

// GitHub's named colors, as a Projects option's color takes a tone
// (GITHUB_COLORS in sources/github.js).
const GITHUB_TONES = { GRAY: "muted", BLUE: "ansi4", GREEN: "ansi2", YELLOW: "ansi3", ORANGE: "ansi11", RED: "ansi1", PINK: "ansi13", PURPLE: "ansi5" };

const cardsBoard = () => board.parseGithubBoard(json("github-board-cards.json"), githubView(), HIDDEN);
const cardOf = (data, n) => data.columns.flatMap((c) => c.cards).find((c) => c.number === n);
// The lines of the card or story `id` under `root`, in order: a card's
// body's children (its first child is its edge), a story's own, without
// its type's line.
function cardLines(root, id) {
  const el = byId(root, id);
  const body = id.startsWith("story-") ? el : el.kids[1];
  return body.kids.filter((k) => typeof k !== "string" && k.with.id?.[0] !== "type-line");
}
// A card's line by its id ("card-meta", "card-chips", "card-progress"), or
// null where it has none.
const cardLine = (root, id, name) => byId(byId(root, id), name);
// The texts of a line's children, each child's in one string.
const lineParts = (line) => line.kids.map((k) => texts(k).join(""));
// A progress bar's segments as "on" or "rest" (by their color), or, for a
// continuous bar, its done part's width.
function barOf(t, line) {
  const bar = byId(line, "progress-bar");
  const on = board.toneColor(t, board.PROGRESS_TONE);
  if (bar.kind === "div") return { width: bar.kids[0].with.w[0], rest: bar.with.bg[0], on: bar.kids[0].with.bg[0] };
  return bar.kids.map((k) => (k.with.bg[0] === on ? "on" : k.with.bg[0] === t.border ? "rest" : k.with.bg[0]));
}

test("a board's query reads each item's priority by the field views.json names (project.priorityField, „Priority“ by default), the milestone of an issue and a pull request, and an issue's parent with its title and repo; so do its later pages", () => {
  const args = board.githubBoardArgs(githubView(), HIDDEN);
  const doc = args.find((a) => a.startsWith("query="));
  assert.ok(args.includes("priority=Priority"), "the default field name");
  assert.match(doc, /\$priority: String!/);
  assert.match(doc, /priority: fieldValueByName\(name: \$priority\) \{ \.\.\. on ProjectV2ItemFieldSingleSelectValue \{ name color \} \}/);
  assert.equal(doc.match(/milestone \{ title \}/g).length, 2, "of issues and pull requests");
  assert.match(doc, /parent \{ number title repository \{ nameWithOwner \} \}/);
  const page = board.githubBoardPageArgs(githubView(), HIDDEN, "cursor", 100);
  assert.ok(page.includes("priority=Priority") && page.find((a) => a.startsWith("query=")).includes("priority: fieldValueByName(name: $priority)"), "a later page");
  const viewWith = (project) => {
    const read = board.validateConfig({ sources: { github: { views: [{ id: "a", name: "A", layout: "board", project: { owner: "o", number: 1, ...project } }] } } });
    return { ...read, errors: read.errors.filter((e) => e.startsWith("GitHub-Ansicht")) };
  };
  const own = viewWith({ priorityField: "Prio" });
  assert.deepEqual([own.errors, own.config.github.views[0].project.priorityField], [[], "Prio"]);
  assert.ok(board.githubBoardArgs(own.config.github.views[0], new Set()).includes("priority=Prio"), "views.json's field name");
  assert.equal(viewWith({}).config.github.views[0].project.priorityField, "Priority");
  for (const bad of [5, "", "  ", null]) {
    assert.deepEqual(viewWith({ priorityField: bad }).errors, ["GitHub-Ansicht 1 („A“): „project.priorityField“ muss Text sein"], String(bad));
  }
  assert.deepEqual(viewWith({ field: 5, priorityField: 5 }).errors, ["„project.field“ muss Text sein", "„project.priorityField“ muss Text sein"].map((e) => `GitHub-Ansicht 1 („A“): ${e}`));
});

test("a board's first page asks whether the project has the priority field as a single-select field; a field views.json names that it lacks is a warning of the board, the default one none, nor one GitHub's error at it already explains", () => {
  const first = board.githubBoardArgs(githubView(), HIDDEN).find((a) => a.startsWith("query="));
  assert.match(first, /priorityField: field\(name: \$priority\) \{ \.\.\. on ProjectV2SingleSelectField \{ id \} \}/);
  assert.doesNotMatch(board.githubBoardPageArgs(githubView(), HIDDEN, "cursor", 100).find((a) => a.startsWith("query=")), /priorityField:/, "a later page does not");
  const given = (priorityField) => board.validateConfig({ sources: { github: { views: [{ id: "a", name: "A", layout: "board", project: { owner: "o", number: 1, ...(priorityField ? { priorityField } : {}) } }] } } }).config.github.views[0];
  assert.deepEqual([given(null).project.priorityGiven, given("Prio").project.priorityGiven, given("Priority").project.priorityGiven], [false, true, true]);
  const answer = (def) => {
    const a = json("github-board-cards.json");
    if (def !== undefined) a.data.repositoryOwner.projectV2.priorityField = def;
    return a;
  };
  const warnings = (view, a, errors) => board.SHAPES.board.warnings(view, board.parseGithubBoard(a, view, new Set(), errors));
  const warning = "Projekt „Sample“ hat kein Auswahlfeld „Prio“ (project.priorityField): die Karten zeigen keine Priorität";
  for (const def of [undefined, null, {}]) {
    assert.deepEqual(warnings(given("Prio"), answer(def)), [warning], `named, ${JSON.stringify(def)}`);
    assert.deepEqual(warnings(given(null), answer(def)), [], `the default, ${JSON.stringify(def)}`);
  }
  assert.deepEqual(warnings(given("Prio"), answer({ id: "PVTSSF_prio" })), [], "the project has it");
  const at = (path) => [{ message: "Something went wrong", path }];
  assert.deepEqual(warnings(given("Prio"), answer(null), at(["repositoryOwner", "projectV2", "priorityField"])), [], "GitHub's error at the field");
  assert.deepEqual(warnings(given("Prio"), answer(null), at(["repositoryOwner", "projectV2", "items", "nodes", 0])), [warning], "an error elsewhere");
});

test("UI: a board whose views.json names a priority field the project lacks says so above its columns; with the default name it says nothing, and where GitHub's error at the field explains it, only that", async () => {
  const config = JSON.parse(testConfig());
  config.sources.github.views[0].project.priorityField = "Prio";
  const named = await openBoard({ config: JSON.stringify(config), answer: fixture("github-board-cards.json") });
  const warning = "Projekt „Sample“ hat kein Auswahlfeld „Prio“ (project.priorityField): die Karten zeigen keine Priorität";
  assert.deepEqual(named.st().warnings, [warning]);
  assert.ok(texts(named.b.render()).includes(warning));
  assert.ok(named.host.calls[0].args.includes("priority=Prio"));
  const plain = await openBoard({ answer: fixture("github-board-cards.json") });
  assert.deepEqual(plain.st().warnings, []);
  const failed = json("github-board-cards.json");
  failed.data.repositoryOwner.projectV2.priorityField = null;
  failed.errors = [{ message: "Something went wrong", path: ["repositoryOwner", "projectV2", "priorityField"] }];
  const unread = await openBoard({ config: JSON.stringify(config), answer: JSON.stringify(failed) });
  assert.deepEqual(unread.st().warnings, ["Something went wrong"], "GitHub's own error, no second word on it");
});

test("a GitHub card carries its priority as its option's name and its color's tone (GitHub's named colors as a status's), its milestone, and its parent's title and repo; none of them where GitHub sends none", () => {
  const data = cardsBoard();
  const epic = cardOf(data, 2217);
  assert.deepEqual([epic.priority, epic.milestone, epic.parent, epic.parentTitle, epic.parentRepo],
    [{ name: "P1", tone: "ansi11" }, "v1", 1735, "[Epic] emu-atlas adoption — every emulator on the machine, answered by the resolver", "example/tender"]);
  assert.deepEqual([cardOf(data, 2301).priority, cardOf(data, 2301).parentRepo], [{ name: "P0", tone: "ansi1" }, "example/atlas"]);
  const plain = cardOf(data, 1467);
  assert.deepEqual([plain.priority, plain.milestone, plain.parent, plain.parentTitle, plain.parentRepo], [null, null, null, null, null]);
  assert.deepEqual([cardOf(data, 2310).kind, cardOf(data, 2310).milestone], ["pr", "v2"], "a pull request's milestone");
  const tones = { ...GITHUB_TONES, TEAL: "muted" };
  const withPriority = (value) => {
    const answer = json("github-board-cards.json");
    answer.data.repositoryOwner.projectV2.items.nodes[0].priority = value;
    return cardOf(board.parseGithubBoard(answer, githubView(), HIDDEN), 2217).priority;
  };
  for (const [color, tone] of Object.entries(tones)) assert.deepEqual(withPriority({ name: "Hoch", color }), { name: "Hoch", tone }, color);
  for (const value of [null, {}, { name: "", color: "RED" }, { color: "RED" }]) assert.equal(withPriority(value), null, JSON.stringify(value));
});

test("an Azure work item's priority: 1 red, 2 orange, 3 and 4 muted, each as „P<n>“; none without a whole number; every query of work items asks for it", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(board.azPriority), [
    { name: "P1", tone: "ansi1" }, { name: "P2", tone: "ansi11" }, { name: "P3", tone: "muted" }, { name: "P4", tone: "muted" }, { name: "P5", tone: "muted" },
  ]);
  assert.deepEqual([undefined, null, "1", 1.5].map(board.azPriority), [null, null, null, null]);
  const answer = json("azure-sprint-items.json");
  answer[0].fields["Microsoft.VSTS.Common.Priority"] = 2;
  const [first, second] = board.parseWorkItems(JSON.stringify(answer), sprintTeam());
  assert.deepEqual([first.priority, second.priority], [{ name: "P2", tone: "ansi11" }, null]);
  assert.equal(board.PRIORITY, "Microsoft.VSTS.Common.Priority");
  assert.ok(board.WORK_ITEM_FIELDS.includes(board.PRIORITY));
  assert.match(board.idsWiql([1]), /\[Microsoft\.VSTS\.Common\.Priority\]/);
});

test("a card's parent: „Teil von #n“ and its title in its own repo, the other repo's name before the number where it lives there, an Azure work item's number alone; the number alone without a title; none without a parent", () => {
  const data = cardsBoard();
  assert.equal(board.partOfText(cardOf(data, 2195)), "Teil von #2217 [Epic] Emulator sources and direct launch");
  assert.equal(board.partOfText(cardOf(data, 2301)), "Teil von atlas#12 Resolver answers for every emulator");
  assert.equal(board.partOfText({ ...cardOf(data, 2195), parentTitle: null }), "Teil von #2217");
  assert.equal(board.partOfText({ ...cardOf(data, 2195), parentRepo: null }), "Teil von #2217 [Epic] Emulator sources and direct launch", "a repo not known: its own");
  assert.equal(board.partOfText(cardOf(data, 1467)), null);
  assert.equal(board.partOfText({ source: "azure", kind: "workitem", parent: 290, parentTitle: "Sample feature" }), "Teil von 290 Sample feature");
  assert.equal(board.partOfText({ source: "azure", kind: "workitem", parent: 290, parentTitle: null }), "Teil von 290");
  assert.equal(board.partOfText({ source: "azure", kind: "workitem", parent: null }), null);
});

test("a story's progress: its row's tasks in every column, whatever the filter shows, and how many of them are done by the state their column shows; none for a story without tasks", () => {
  const data = sprintData();
  assert.deepEqual([board.storyProgress(data, "AB#301"), board.storyProgress(data, "AB#302")], [{ total: 3, done: 0 }, { total: 1, done: 1 }]);
  const moved = board.moveCard(data, "AB#312", columnId(data, "Done"));
  assert.deepEqual(board.storyProgress(moved, "AB#301"), { total: 3, done: 1 }, "a task moved to Done counts as its column shows it");
  assert.deepEqual(board.storyProgress(board.withItemState(data, "AB#311", "Removed"), "AB#301"), { total: 3, done: 1 }, "Removed is done, as for a related item");
  assert.equal(board.storyProgress(data, "AB#999"), null);
});

// The source's shared parts parentsOutside takes: az, which prints
// `answer` (an Error: az fails), with the calls it made in `asked`; what is
// kept (`kept`: key → { value, until }); and the team's settings,
// `settings` (an Error: their read fails), with the time they were last
// kept until in `settingsUntil` and their reads in `settingsRead`.
function parentParts(answer, settings = board.parseTeamSettings(fixture("azure-backlog-settings.json"))) {
  const parts = { asked: [], answer, settings, settingsUntil: null, settingsRead: 0, kept: new Map() };
  Object.assign(parts, {
    teamKey: (c) => `${c.org}\n${c.project}\n${c.team}`,
    keep: (key, value, until) => parts.kept.set(key, { value, until }),
    keptValue: (key) => {
      const entry = parts.kept.get(key);
      return entry && Date.now() < entry.until ? entry : null;
    },
    az: async (args) => {
      parts.asked.push(args);
      if (parts.answer instanceof Error) throw parts.answer;
      return parts.answer;
    },
    teamSettings: {
      of: async () => {
        parts.settingsRead++;
        if (parts.settings instanceof Error) throw parts.settings;
        return parts.settings;
      },
      keepUntil: (c, until) => {
        parts.settingsUntil = until;
      },
    },
  });
  return parts;
}
// The fixture's sprint items, the story 301 under the Feature 290.
function itemsUnder290() {
  const answer = json("azure-sprint-items.json");
  answer[0].fields["System.Parent"] = 290;
  return JSON.stringify(answer);
}

// The tasks the fixture's taskboard places, as parentsOutside takes them.
const placedOf = (items) => board.placedTasks(sprintParts().columns, items, sprintParts().places);

test("the Sprint's placed tasks: those of a type its taskboard's columns map, in one of its columns", () => {
  const items = board.parseWorkItems(fixture("azure-sprint-items.json"), sprintTeam());
  assert.deepEqual([...placedOf(items)], [311, 312, 313, 321, 331, 332]);
  const elsewhere = board.parseTaskboard(taskboardAnswer({}, [312]).replaceAll(COLUMN.todo, "5b0c1e2a-0d4f-4a8e-9c31-7e6f2a9b1c99"));
  assert.deepEqual([...board.placedTasks(sprintParts().columns, items, elsewhere)], [313, 321, 332], "neither one not placed nor one in a column not read");
  const withStory = board.parseTaskboard(taskboardAnswer({ 399: ["todo", "To Do"] }).replace('"workItemId":399', '"workItemId":301'));
  assert.equal(withStory.has(301), true);
  assert.equal(board.placedTasks(sprintParts().columns, items, withStory).has(301), false, "a story the taskboard lists: no task");
});

test("the Sprint's parents outside it: one query by id for the placed tasks' parents not in the sprint, with the order field, at every call; each marked with its sprint by the team's backlog iteration; a parent in the sprint gives its own title; the tasks' parents the query does not find are lost; a failure leaves them out and is a warning", async () => {
  const c = sprintTeam();
  // 332 shares 331's parent 299, outside the sprint.
  const answer = JSON.parse(itemsUnder290());
  answer.find((wi) => wi.id === 332).fields["System.Parent"] = 299;
  const items = board.parseWorkItems(JSON.stringify(answer), c);
  const tasks = placedOf(items);
  const parentsAnswer = json("azure-sprint-parents.json");
  parentsAnswer[0].fields[STACK_RANK] = 7;
  const s = parentParts(JSON.stringify(parentsAnswer));
  const first = await board.parentsOutside(s, c, items, { tasks, orderField: STACK_RANK, until: 5 });
  assert.deepEqual(s.asked, [board.azQueryArgs(c, board.idsWiql([290, 299], [STACK_RANK]))], "one query, each parent outside the sprint once, with the order field");
  const title = (r, n) => r.items.find((i) => i.number === n).parentTitle;
  assert.deepEqual([title(first, 301), title(first, 311), title(first, 321), title(first, 331), title(first, 332), title(first, 302)],
    [null, "Import the sample catalogue", "Export the weekly report", "Clean up the old exports", "Clean up the old exports", null]);
  assert.deepEqual([...first.parents.keys()], [299], "the parents found");
  const parent = first.parents.get(299);
  assert.deepEqual([parent.key, parent.title, parent.state, parent.order, parent.outside, parent.sprint], ["AB#299", "Clean up the old exports", "Active", 7, true, "Sprint 11"]);
  assert.deepEqual([first.lost, first.warnings], [[], []], "a story's parent not found is no task's: not lost");
  assert.deepEqual([s.settingsRead, s.settingsUntil], [1, 5], "the team's settings beside the query, kept no longer than the Sprint's");
  const again = await board.parentsOutside(s, c, items, { tasks, orderField: STACK_RANK });
  assert.deepEqual([s.asked[1], again.parents.get(299).title], [board.azQueryArgs(c, board.idsWiql([299], [STACK_RANK])), "Clean up the old exports"],
    "asked again for the tasks' parent, not for the story's, whose title (none found) is kept");
  await board.parentsOutside(s, c, items, { tasks });
  assert.deepEqual(s.asked[2], board.azQueryArgs(c, board.idsWiql([299])), "without an order field, none asked");
  const lost = await board.parentsOutside(parentParts("[]"), c, items, { tasks });
  assert.deepEqual([lost.lost, lost.parents.size], [[299], 0], "a task's parent not found is lost");
  const sprintOf = async (iteration, backlogIteration) => {
    const at = parentParts(JSON.stringify([{ ...json("azure-sprint-parents.json")[0], fields: { ...parentsAnswer[0].fields, "System.IterationPath": iteration } }]),
      { ...board.parseTeamSettings(fixture("azure-backlog-settings.json")), backlogIteration });
    return (await board.parentsOutside(at, c, items, { tasks })).parents.get(299).sprint;
  };
  assert.deepEqual(await Promise.all([sprintOf("Example Project\\Example Team", "Example Project\\Example Team"), sprintOf("Example Project", "Example Project\\Example Team"),
    sprintOf("Example Project\\Other Team\\Sprint 3", "Example Project\\Example Team")]), [null, null, "Sprint 3"],
  "none in the team's backlog iteration or the project's root; another team's sprint by its name");
  const inTeam = JSON.stringify([{ ...parentsAnswer[0], fields: { ...parentsAnswer[0].fields, "System.IterationPath": "Example Project\\Example Team" } }]);
  const unsure = parentParts(inTeam, new board.BoardError("Operation returned a 403 status code."));
  const guessed = await board.parentsOutside(unsure, c, items, { tasks });
  assert.deepEqual([guessed.parents.get(299).sprint, guessed.warnings, unsure.settingsUntil],
    ["Example Team", [`${board.BACKLOG_ROOT_UNREAD}: Operation returned a 403 status code.`], null], "settings not read: only the project's root is none, and a warning says so");
  assert.equal(board.BACKLOG_ROOT_UNREAD, "Backlog-Iteration des Teams nicht gelesen, „ohne Sprint“ ungeprüft");
  for (const backlogIteration of [null, ""]) {
    const unnamed = parentParts(inTeam, { ...board.parseTeamSettings(fixture("azure-backlog-settings.json")), backlogIteration });
    const read = await board.parentsOutside(unnamed, c, items, { tasks });
    assert.deepEqual([read.parents.get(299).sprint, read.warnings], ["Example Team", [`${board.BACKLOG_ROOT_UNREAD}: Azure nannte keine Backlog-Iteration`]],
      "settings that name no backlog iteration: as not read");
  }
  const fresh = parentParts(new board.BoardError("Azure nicht erreichbar (az): x"));
  const failed = await board.parentsOutside(fresh, c, items, { tasks });
  assert.deepEqual([title(failed, 331), title(failed, 311), failed.parents.size, failed.lost, failed.warnings],
    [null, "Import the sample catalogue", 0, [], [`${board.PARENTS_UNREAD}: Azure nicht erreichbar (az): x`]]);
  assert.equal(board.PARENTS_UNREAD, "Übergeordnete Work Items außerhalb des Sprints nicht gelesen, ihre Tasks stehen unter „Ohne Story“");
  const none = parentParts("");
  const inside = await board.parentsOutside(none, c, items.filter((i) => [302, 321].includes(i.number)), { tasks, before: () => assert.fail("nothing to draw before") });
  assert.deepEqual([none.asked, none.settingsRead, inside.warnings], [[], 0, []], "every parent in the sprint: no query, no settings");
});

test("the Sprint's parents outside it that no placed task has: read for their titles only where those are not kept, no settings beside them, kept TEAM_KEEP_MS; a failure is a warning and keeps nothing", async () => {
  const c = sprintTeam();
  const items = board.parseWorkItems(itemsUnder290(), c).filter((i) => i.number !== 331);
  const tasks = placedOf(items);
  const feature = JSON.stringify([{ id: 290, fields: { "System.Id": 290, "System.Title": "Sample feature" } }]);
  const s = parentParts(feature);
  const first = await board.parentsOutside(s, c, items, { tasks, orderField: STACK_RANK, before: () => {} });
  assert.deepEqual([s.asked, s.settingsRead, first.parents.size, first.lost, first.warnings], [[board.azQueryArgs(c, board.idsWiql([290], [STACK_RANK]))], 0, 0, [], []]);
  assert.equal(first.items.find((i) => i.number === 301).parentTitle, "Sample feature");
  const kept = await board.parentsOutside(s, c, items, { tasks, before: () => assert.fail("nothing to draw before") });
  assert.deepEqual([s.asked.length, kept.items.find((i) => i.number === 301).parentTitle], [1, "Sample feature"], "kept: no query");
  const withTask = board.parseWorkItems(itemsUnder290(), c);
  await board.parentsOutside(s, c, withTask, { tasks: placedOf(withTask) });
  assert.deepEqual([s.asked[1], s.settingsRead], [board.azQueryArgs(c, board.idsWiql([299])), 1], "a task's parent outside: only it, the title kept");
  advance(board.TEAM_KEEP_MS);
  try {
    await board.parentsOutside(s, c, items, { tasks });
  } finally {
    advance(-board.TEAM_KEEP_MS);
  }
  assert.equal(s.asked.length, 3, "read again once TEAM_KEEP_MS passed");
  const fresh = parentParts(new board.BoardError("Azure nicht erreichbar (az): x"));
  const failed = await board.parentsOutside(fresh, c, items, { tasks });
  assert.deepEqual([failed.items.find((i) => i.number === 301).parentTitle, failed.warnings, fresh.settingsRead], [null, [`${board.TITLES_UNREAD}: Azure nicht erreichbar (az): x`], 0]);
  await board.parentsOutside(fresh, c, items, { tasks });
  assert.equal(fresh.asked.length, 2, "nothing kept: asked again");
  assert.equal(board.TITLES_UNREAD, "Titel der übergeordneten Work Items nicht gelesen");
});

test("the Sprint's parents' titles read while others are kept: only those asked, kept beside them until the first read's TEAM_KEEP_MS ends", async () => {
  const c = sprintTeam();
  const feature = (id, title) => ({ id, fields: { "System.Id": id, "System.Title": title } });
  const s = parentParts(JSON.stringify([feature(290, "Sample feature")]));
  const keptUntil = () => [...s.kept.values()].map((entry) => entry.until);
  const items = board.parseWorkItems(itemsUnder290(), c).filter((i) => i.number !== 331);
  await board.parentsOutside(s, c, items, { tasks: placedOf(items) });
  const [until] = keptUntil();
  const answer = JSON.parse(itemsUnder290());
  answer.find((wi) => wi.id === 302).fields["System.Parent"] = 288;
  const more = board.parseWorkItems(JSON.stringify(answer), c).filter((i) => i.number !== 331);
  const title = (r, n) => r.items.find((i) => i.number === n).parentTitle;
  advance(3600000);
  try {
    s.answer = JSON.stringify([feature(288, "Second feature")]);
    await board.parentsOutside(s, c, more, { tasks: placedOf(more) });
    assert.deepEqual([s.asked.slice(1), keptUntil()], [[board.azQueryArgs(c, board.idsWiql([288]))], [until]], "only the title not kept, kept no longer than the first");
    const served = await board.parentsOutside(s, c, more, { tasks: placedOf(more), before: () => assert.fail("nothing to draw before") });
    assert.deepEqual([s.asked.length, title(served, 301), title(served, 302)], [2, "Sample feature", "Second feature"], "both kept: no query");
    advance(board.TEAM_KEEP_MS - 3600000);
    s.answer = JSON.stringify([feature(290, "Sample feature"), feature(288, "Second feature")]);
    await board.parentsOutside(s, c, more, { tasks: placedOf(more) });
    assert.deepEqual(s.asked.slice(2), [board.azQueryArgs(c, board.idsWiql([290, 288]))], "both read again once the first read's TEAM_KEEP_MS passed");
  } finally {
    advance(-board.TEAM_KEEP_MS);
  }
});

test("the Sprint's parents outside it before their query: those of the last draw, the rest none", async () => {
  const c = sprintTeam();
  const items = board.parseWorkItems(itemsUnder290(), c);
  const drawn = { ...outsideParents().get(299), title: "As drawn last" };
  let seen = null;
  await board.parentsOutside(parentParts(fixture("azure-sprint-parents.json")), c, items, {
    tasks: placedOf(items), last: new Map([[299, drawn], [298, { ...drawn, number: 298 }]]),
    before: (soFar, parents) => (seen = { soFar, parents }),
  });
  assert.deepEqual([...seen.parents], [[299, drawn]], "only those still asked for");
  assert.deepEqual([seen.soFar.find((i) => i.number === 331).parentTitle, seen.soFar.find((i) => i.number === 301).parentTitle], ["As drawn last", null]);
});

test("UI: the Sprint asks for its parents outside it after its work items with every refresh; a failure is a warning, their tasks stand in „Ohne Story“ and name their parents' numbers alone", async () => {
  const { b, cx, host, st } = await openSprint();
  const queries = () => host.calls.filter((c) => AZ.parents(c.args));
  assert.deepEqual(queries().map((c) => c.args), [board.azQueryArgs(sprintTeam(), board.idsWiql([299], [STACK_RANK]))]);
  assert.deepEqual([board.findSprintItem(st().data, "AB#331").parentTitle, board.findSprintItem(st().data, "AB#331").row], ["Clean up the old exports", "AB#299"]);
  await refreshSprint(b, cx);
  const changed = json("azure-sprint-parents.json");
  changed[0].fields["System.State"] = "Resolved";
  await answerRefresh(host, { me: false, parents: ok(JSON.stringify(changed)) });
  assert.deepEqual([queries().length, board.findSprintItem(st().data, "AB#299").state], [2, "Resolved"], "a refresh asks again and shows what changed");
  assert.equal(host.calls.filter((c) => AZ.teamSettings(c.args)).length, 1, "the team's settings are kept");
  await refreshSprint(b, cx);
  await answerRefresh(host, { me: false, parents: azRefused("Operation returned a 403 status code.") });
  assert.equal(queries().length, 3);
  assert.deepEqual(st().warnings, [`${board.PARENTS_UNREAD}: Operation returned a 403 status code.`]);
  assert.deepEqual([board.findSprintItem(st().data, "AB#331").parentTitle, board.findSprintItem(st().data, "AB#331").row], [null, "none"]);
  assert.equal(st().data.rows.some((r) => r.key === "AB#299"), false, "no row for a parent not read");
  assert.deepEqual(lineParts(cardLine(b.render(), "card-AB#331", "card-meta")), ["Teil von 299"]);
});

test("UI: a task's parent the query does not find is a warning that names it; its task stands in „Ohne Story“; a story's parent not found is none", async () => {
  const items = json("azure-sprint-items.json");
  items[0].fields["System.Parent"] = 290;
  const { st } = await openSprint({ items: JSON.stringify(items), parents: ok("[]") });
  assert.deepEqual(st().warnings, ["Übergeordnetes Work Item #299 nicht gefunden (gelöscht oder ohne Leserecht), seine Tasks stehen unter „Ohne Story“"]);
  assert.deepEqual([board.findCard(st().data, "AB#331").card.row, st().data.rows.map((r) => r.key)], ["none", ["none", "AB#301", "AB#302"]]);
  assert.equal(board.parentsLost([1, 2]), "Übergeordnete Work Items #1, #2 nicht gefunden (gelöscht oder ohne Leserecht), ihre Tasks stehen unter „Ohne Story“");
});

test("UI: a Sprint refresh without tasks whose parents are outside the sprint asks no parents' query, its stories' parents' titles kept; one with such tasks asks for their parents alone, with the team's settings; r reads the titles again", async () => {
  const answer = JSON.parse(itemsUnder290());
  answer.find((wi) => wi.id === 331).fields["System.Parent"] = 301;
  const noLeftovers = JSON.stringify(answer);
  const { b, cx, host, st } = await openSprint({ items: noLeftovers, parents: parentsWith290() });
  const queries = () => host.calls.filter((c) => AZ.parents(c.args)).map((c) => c.args);
  const settingsReads = () => host.calls.filter((c) => AZ.teamSettings(c.args)).length;
  const featureTitle = () => board.findSprintItem(st().data, "AB#301").parentTitle;
  assert.deepEqual([queries(), settingsReads()], [[board.azQueryArgs(sprintTeam(), board.idsWiql([290], [STACK_RANK]))], 0], "the story's parent for its title, no settings");
  assert.equal(featureTitle(), "Sample feature with a long name that will not fit");
  await refreshSprint(b, cx);
  await answerRefresh(host, { me: false, items: noLeftovers });
  assert.deepEqual([queries().length, host.open("az").length, featureTitle()], [1, 0, "Sample feature with a long name that will not fit"],
    "no task's parent outside the sprint: no parents' query, the title kept");
  await refreshSprint(b, cx);
  await answerRefresh(host, { me: false, items: itemsUnder290() });
  assert.deepEqual([queries()[1], settingsReads()], [board.azQueryArgs(sprintTeam(), board.idsWiql([299], [STACK_RANK])), 1], "a task's parent outside: it alone, with the team's settings");
  assert.deepEqual([st().data.rows.some((r) => r.key === "AB#299"), featureTitle()], [true, "Sample feature with a long name that will not fit"]);
  await press(b, cx, "r");
  await answerSettings(host);
  await answerRefresh(host, { me: false, items: noLeftovers, parents: parentsWith290() });
  assert.deepEqual(queries()[2], board.azQueryArgs(sprintTeam(), board.idsWiql([290], [STACK_RANK])), "r: the titles again");
});

test("UI: the team's settings the Sprint reads beside its parents' query are kept no longer than its sprint", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  advance(board.dayEnd(Date.now()) - 2 * 3600000 - Date.now());
  await answerSettings(host, iterationAnswer(0));
  await answerRefresh(host);
  const settingsReads = () => host.calls.filter((c) => AZ.teamSettings(c.args)).length;
  assert.equal(settingsReads(), 1);
  advance(2 * 3600000 + 60000);
  await refreshSprint(b, cx);
  await answerSettings(host);
  await answerRefresh(host, { me: false });
  assert.equal(settingsReads(), 2, "the sprint ended within TEAM_KEEP_MS: read again");
});

test("UI: a GitHub card's lines: its key with its priority at the right; its title; its milestone as a muted chip and its parent, cut short; its type and labels; its progress with a bar and the share done, then its session, „speichert …“ and its assignees, which end the chips' line where it has no progress; a card without them as compact as before", async () => {
  const { b, cx, host } = await openBoard({ answer: fixture("github-board-cards.json") });
  const t = copperTheme("dark");
  host.theme = () => t;
  host.spaceList = [...host.spaceList,
    { id: "s7", name: "w", folder: "/r/tender", machine: null, branch: "main", active: false, status: "working", tabs: [{ id: "t7", name: "tender#2217 sources", status: "working" }] },
    { id: "s8", name: "v", folder: "/r/tender", machine: null, branch: "main", active: false, status: "idle", tabs: [{ id: "t8", name: "tender#1467 metadata", status: "idle" }] },
    { id: "s9", name: "u", folder: "/r/tender", machine: null, branch: "main", active: false, status: "idle", tabs: [{ id: "t9", name: "tender#2304 steps", status: "idle" }] }];
  let root = b.render();
  const look = (tone) => [board.toneColor(t, tone), board.chipBg(t, tone)];
  // #2217: every line.
  const epic = "card-PVTI_card1";
  const lines = cardLines(root, epic);
  assert.deepEqual(lines.map((l) => l.with.id?.[0] ?? null), [null, null, "card-meta", "card-chips", "card-progress"]);
  assert.deepEqual(lineParts(lines[0]), ["tender#2217", "", "P1"], "the key, then the priority at the right");
  assert.equal(lines[0].kids[1].styles.includes("flex_1"), true, "pushed to the right");
  assert.deepEqual(chipLook(byId(lines[0], "priority")), look("ansi11"), "P1's option is ORANGE");
  assert.deepEqual(chipLook(byId(lines[0], "priority")), [t["copper-orange-text"], t["copper-orange-3"]]);
  assert.deepEqual(lineParts(lines[2]), ["v1", "Teil von #1735 [Epic] emu-atlas adoption — every emulator on the machine, answered by the resolver"]);
  assert.deepEqual(chipLook(byId(lines[2], "milestone")), look("muted"), "a grey chip");
  const parent = byId(lines[2], "parent");
  assert.deepEqual(["flex_1", "min_w", "truncate"].map((s) => parent.styles.includes(s)), [true, true, true], "cut short with …");
  assert.deepEqual([parent.with.min_w[0], parent.with.text_color[0], parent.with.text_size[0]], [0, t.muted, 11]);
  assert.equal(byId(lines[2], "milestone").styles.includes("flex_none"), true, "the milestone keeps its width");
  assert.deepEqual(lineParts(lines[3]), ["Epicenhancementarea:architecture"], "type and labels; nothing at the right");
  assert.deepEqual(lineParts(lines[4]), ["14 / 25", "", "56 %", "arbeitet", "sample-user"], "the count, the bar, the share, the session, the assignee");
  assert.deepEqual(barOf(t, lines[4]), [...Array(14).fill("on"), ...Array(11).fill("rest")], "a segment per sub-issue, the done ones green");
  assert.equal(board.toneColor(t, board.PROGRESS_TONE), t["copper-green-text"]);
  // #2195: no priority; 9 of 11 is 81 %, rounded down.
  const sub = "card-PVTI_card2";
  assert.deepEqual(lineParts(cardLines(root, sub)[0]), ["tender#2195"], "no priority: the key alone, as before");
  assert.deepEqual(lineParts(cardLine(root, sub, "card-meta")), ["v1", "Teil von #2217 [Epic] Emulator sources and direct launch"]);
  assert.deepEqual(lineParts(cardLine(root, sub, "card-progress")).filter((p) => p.includes("/") || p.includes("%")), ["9 / 11", "81 %"]);
  // #1467: no milestone, parent or progress: the assignee ends the chips' line.
  const compact = cardLines(root, "card-PVTI_card3");
  assert.deepEqual(compact.map((l) => l.with.id?.[0] ?? null), [null, null, "card-chips"], "three lines, as before");
  assert.deepEqual(lineParts(compact[2]), ["enhancementarea:ui", "bereit", "sample-user"], "the chips, then the session and the assignee at the right");
  assert.deepEqual(["flex_1", "min_w", "flex_wrap"].map((s) => compact[2].kids[0].styles.includes(s)), [true, true, true], "the chips wrap and leave the end to the rest");
  // #2301: P0 red, a parent in another repo, 10 of 31 as one bar.
  const wide = "card-PVTI_card4";
  assert.deepEqual(chipLook(byId(byId(root, wide), "priority")), look("ansi1"));
  assert.deepEqual(lineParts(cardLine(root, wide, "card-meta")), ["Teil von atlas#12 Resolver answers for every emulator"], "no milestone: the parent alone");
  assert.deepEqual(barOf(t, cardLine(root, wide, "card-progress")), { width: "32.26%", rest: t.border, on: t["copper-green-text"] }, "above 30: one continuous bar");
  assert.deepEqual(lineParts(cardLine(root, wide, "card-progress")).slice(0, 3), ["10 / 31", "", "32 %"]);
  // #2302: P2 muted, 29 of 30: still a segment each, 96 %.
  const thirty = "card-PVTI_card5";
  assert.deepEqual(chipLook(byId(byId(root, thirty), "priority")), look("muted"));
  assert.deepEqual(barOf(t, cardLine(root, thirty, "card-progress")), [...Array(29).fill("on"), "rest"], "30: a segment each");
  assert.equal(lineParts(cardLine(root, thirty, "card-progress"))[2], "96 %");
  assert.equal(cardLine(root, thirty, "card-chips"), null, "no labels, no type: no chips' line; the assignee ends the progress line");
  // #2303: nothing but its key and title.
  assert.deepEqual(cardLines(root, "card-PVTI_card6").map((l) => texts(l).join("")), ["tender#2303", "docs: name the sample folders"]);
  // #2304: no chips, no progress, an assignee and a session: they end a chips' line of their own.
  const bare = "card-PVTI_card8";
  assert.deepEqual(cardLines(root, bare).map((l) => l.with.id?.[0] ?? null), [null, null, "card-chips"]);
  assert.deepEqual(lineParts(cardLine(root, bare, "card-chips")), ["", "bereit", "sample-user"], "no chips at the left, the end at the right");
  // A pull request's milestone, no parent.
  assert.deepEqual(lineParts(cardLine(root, "card-PVTI_card7", "card-meta")), ["v2"]);
  assert.equal(texts(root).some((s) => /◔|undefined|null/.test(s)), false, "no old count, nothing undefined");
  // „speichert …“ while a move is written: before the assignee, on the card's last line.
  await press(b, cx, "l", shiftL);
  root = b.render();
  assert.deepEqual(lineParts(cardLine(root, "card-PVTI_card3", "card-chips")), ["enhancementarea:ui", "bereit", "speichert …", "sample-user"]);
  assert.equal(texts(cardLines(root, "card-PVTI_card3")[0]).includes("speichert …"), false, "not beside the key");
  await host.answer("gh", ok(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_card3" } } } })));
  await clickCard(b, cx, "PVTI_card1");
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  assert.deepEqual(lineParts(cardLine(b.render(), "card-PVTI_card1", "card-progress")).slice(3), ["arbeitet", "speichert …", "sample-user"], "on the progress line");
  await clickCard(b, cx, "PVTI_card8");
  await press(b, cx, "l", shiftL);
  assert.deepEqual(lineParts(cardLine(b.render(), bare, "card-chips")), ["", "bereit", "speichert …", "sample-user"], "on a chips' line without chips");
});

// The Sprint's items with priorities, the story 301 under the Feature 290,
// and a story 303 without tasks; and the parents' titles for them.
function prioritySprintItems() {
  const answer = JSON.parse(itemsUnder290());
  const set = { 301: 3, 312: 1, 311: 2, 332: 4 };
  for (const wi of answer) if (set[wi.id]) wi.fields["Microsoft.VSTS.Common.Priority"] = set[wi.id];
  const story = structuredClone(answer[0]);
  story.id = 303;
  Object.assign(story.fields, { "System.Id": 303, "System.Title": "Plan the next import", "System.State": "New", "System.Parent": undefined });
  return JSON.stringify([...answer, story]);
}
const parentsWith290 = () => ok(JSON.stringify([...json("azure-sprint-parents.json"), { id: 290, fields: { "System.Id": 290, "System.Title": "Sample feature with a long name that will not fit" } }]));

test("UI: the Sprint's story and task in a card's lines: the priority at the right of the key; a story's parent, and a task's only in „Ohne Story“ (its parent's row names it otherwise); a story's tasks' progress, which its assignee ends, or its state's line where it has none; a task's state, which its session, „speichert …“ and assignee end", async () => {
  const { b, cx, host, st } = await openSprint({ items: prioritySprintItems(), parents: parentsWith290() });
  const t = copperTheme("light");
  host.theme = () => t;
  host.spaceList = [...host.spaceList, { id: "s9", name: "z", folder: "/r/x", machine: null, branch: "main", active: false, status: null,
    tabs: [{ id: "t9", name: "AB#312 Write the importer tests", status: "working" }] }];
  let root = b.render();
  const look = (tone) => [board.toneColor(t, tone), board.chipBg(t, tone)];
  // The story 301: P3, a parent outside the sprint, three tasks none done.
  const story = cardLines(root, "story-AB#301");
  assert.deepEqual(story.map((l) => l.with.id?.[0] ?? null), [null, null, "card-meta", "card-chips", "card-progress"]);
  assert.deepEqual(lineParts(story[0]), ["▾", "301", "User Story", "", "P3"]);
  assert.deepEqual(chipLook(byId(story[0], "priority")), look("muted"));
  assert.deepEqual(lineParts(story[2]), ["Teil von 290 Sample feature with a long name that will not fit"]);
  assert.ok(byId(story[2], "parent").styles.includes("truncate"));
  assert.deepEqual(lineParts(story[3]), ["In Progress"], "its state alone: the assignee ends its progress");
  assert.deepEqual(lineParts(story[4]), ["0 / 3", "", "0 %", "Alex Sample"]);
  assert.deepEqual(barOf(t, story[4]), ["rest", "rest", "rest"]);
  // The story 302: no parent, its one task done.
  const done = cardLines(root, "story-AB#302");
  assert.deepEqual(done.map((l) => l.with.id?.[0] ?? null), [null, null, "card-chips", "card-progress"]);
  assert.deepEqual([lineParts(done[0]), lineParts(done[3]).slice(0, 3), barOf(t, done[3])], [["▾", "302", "User Story"], ["1 / 1", "", "100 %"], ["on"]]);
  assert.equal(board.toneColor(t, board.PROGRESS_TONE), t["copper-green-text"]);
  // The story 303 without tasks: its assignee ends its state's line.
  const lone = cardLines(root, "story-AB#303");
  assert.deepEqual(lone.map((l) => l.with.id?.[0] ?? null), [null, null, "card-chips"]);
  assert.deepEqual(lineParts(lone[2]), ["New", "Alex Sample"]);
  // A task in its story's row: P1, no parent line; its session and assignee end its state's line.
  const task = cardLines(root, "card-AB#312");
  assert.deepEqual(task.map((l) => l.with.id?.[0] ?? null), [null, null, "card-chips"]);
  assert.deepEqual(lineParts(task[0]), ["312", "", "P1"]);
  assert.deepEqual(chipLook(byId(task[0], "priority")), look("ansi1"));
  assert.deepEqual(chipLook(byId(byId(root, "card-AB#311"), "priority")), [t["copper-orange-text"], t["copper-orange-3"]], "Azure's 2 in copper's orange");
  assert.deepEqual(lineParts(task[2]), ["In Progress", "arbeitet", "Robin Example"]);
  // A task in its parent's row outside the sprint names no parent, nor does one without a parent.
  assert.equal(cardLine(root, "card-AB#331", "card-meta"), null);
  assert.equal(cardLine(root, "card-AB#332", "card-meta"), null);
  assert.deepEqual(chipLook(byId(byId(root, "card-AB#332"), "priority")), look("muted"), "4 muted");
  assert.equal(byId(byId(root, "card-AB#313"), "priority"), null, "no priority: none");
  // „speichert …“ while a state is written: before the assignee, on the last line.
  await click(b, cx, "card-AB#312");
  await press(b, cx, "s");
  await press(b, cx, "3");
  root = b.render();
  assert.deepEqual(lineParts(cardLine(root, "card-AB#312", "card-chips")), ["Done", "arbeitet", "speichert …", "Robin Example"]);
  assert.deepEqual(lineParts(cardLine(root, "story-AB#301", "card-progress")), ["1 / 3", "", "33 %", "Alex Sample"], "its story counts it done");
  await host.answer("az", ok(JSON.stringify({ id: 312, fields: { "System.State": "Done" } })), AZ.state);
  await answerRefresh(host, { me: false, items: prioritySprintItems() });
  await click(b, cx, "story-AB#301");
  await press(b, cx, "s");
  await press(b, cx, "1");
  assert.deepEqual(lineParts(cardLine(b.render(), "story-AB#301", "card-progress")).slice(3), ["speichert …", "Alex Sample"]);
  assert.equal(st().pending["AB#301"], true);
});

test("the new lines' text and chips read at 4.5:1 or more on a card and a selected one (the priority in each tone it takes, the milestone on their tints, the parent and the progress' numbers), and the progress bar's done part stands at 3:1 or more from a card, a selected one and the bar's rest, in copper-dark and copper-light with and without copper's colors and in catppuccin-mocha, but for a muted chip on a selected card in catppuccin-mocha", () => {
  globalThis.__boardHost = fakeHost();
  const themes = { "copper-dark": copperTheme("dark"), "copper-light": copperTheme("light"), ...Object.fromEntries(Object.entries(TINTED()).map(([k, t]) => [`tinted ${k}`, t])) };
  assert.equal(Object.keys(themes).length, 5);
  const tones = [...new Set(["ansi1", "ansi11", "muted", ...Object.values(GITHUB_TONES)])];
  const ratios = {};
  const bars = {};
  for (const [name, t] of Object.entries(themes)) {
    const grounds = [t.background, board.selectedBg(t)];
    const onChip = ([fg, bg]) => grounds.map((g) => contrast(fg, over(bg, g)));
    for (const tone of tones) ratios[`${name} priority ${tone}`] = onChip(chipLook(board.priorityChip(t, { priority: { name: "P1", tone } })));
    const meta = board.cardMeta(t, { milestone: "v1" }, "Teil von #1");
    ratios[`${name} milestone`] = onChip(chipLook(byId(meta, "milestone")));
    ratios[`${name} parent`] = grounds.map((g) => contrast(byId(meta, "parent").with.text_color[0], g));
    const progress = board.progressLine(t, { done: 1, total: 2 }, []);
    ratios[`${name} progress numbers`] = [progress.kids[0], progress.kids[2]].flatMap((n) => grounds.map((g) => contrast(n.with.text_color[0], g)));
    const on = board.toneColor(t, board.PROGRESS_TONE);
    assert.equal(barOf(t, progress)[0], "on", `${name}: the done part in PROGRESS_TONE`);
    bars[`${name} done part`] = [...grounds, over(t.border, t.background)].map((g) => contrast(on, g));
  }
  // catppuccin-mocha's derived muted on its tint over a selected card: the
  // case the chips' own test names (4.31:1).
  assert.deepEqual(below(ratios, 4.5), [["tinted catppuccin-mocha priority muted", [5.04, 4.31]], ["tinted catppuccin-mocha milestone", [5.04, 4.31]]], shownRatios(ratios));
  assert.deepEqual(below(bars, 3), [], shownRatios(bars));
});

test("UI: no dialog's head names the keys that move its mark, only Enter and Esc: the status menu's and the assignee picker's (the column, command and sprint menus' tests name theirs)", async () => {
  const { b, cx } = await openBoard();
  const title = (id) => texts(byId(b.render(), `${id}-menu`))[0];
  await press(b, cx, "s");
  assert.equal(title("status"), "Status ändern · Enter · Esc");
  await press(b, cx, "escape");
  await press(b, cx, "a");
  assert.equal(title("assign"), "Zuweisen · tender#3004 · Enter · Esc");
});

// ---- A large board: what a full draw costs ----

// Label colors with the tone the label colors' test names for them in a
// copper theme.
const LARGE_LABEL_TONES = {
  d73a4a: "ansi1", "0075ca": "ansi4", cfd3d7: "muted", a2eeef: "ansi6", "7057ff": "ansi5", "008672": "ansi6", e4e669: "ansi2", d876e3: "ansi5",
  "5319e7": "ansi5", e99695: "ansi1", fbca04: "ansi3", "0e8a16": "ansi2", b60205: "ansi1", d93f0b: "ansi1", ff7f00: "ansi11", "1d76db": "ansi4",
};
const LARGE_COLORS = Object.keys(LARGE_LABEL_TONES);
const LARGE_OPTIONS = [["opt-backlog", "Backlog", "GREEN"], ["opt-ready", "Ready", "BLUE"], ["opt-progress", "In progress", "YELLOW"], ["opt-review", "In review", "ORANGE"], ["opt-done", "Done", "PURPLE"]];
const LARGE_SHOWN = ["opt-ready", "opt-progress", "opt-review"];

// A board answer of `n` items in the shapes of github-board-cards.json,
// with made-up names: up to five labels, issue types, Epics by their title,
// priorities, milestones, parents, sub-issues from none to 45, assignees
// and pull requests, in the three columns testConfig does not hide.
function largeBoardAnswer(n) {
  const types = [null, { name: "Bug", color: "RED" }, { name: "Task", color: "YELLOW" }, { name: "Feature", color: "BLUE" }, null, { name: "Epic", color: "PURPLE" }];
  const priorities = [null, { name: "P0", color: "RED" }, { name: "P1", color: "ORANGE" }, { name: "P2", color: "YELLOW" }, { name: "P3", color: "GRAY" }];
  const totals = [0, 3, 12, 30, 31, 45, 0, 7];
  const nodes = Array.from({ length: n }, (_, i) => {
    const number = 1000 + i;
    const labels = Array.from({ length: i % 6 }, (_, k) => ({ name: `label-${(i + 3 * k) % 24}`, color: LARGE_COLORS[(i + 5 * k) % LARGE_COLORS.length] }));
    const total = totals[i % totals.length];
    const shared = { author: { login: "sample-user" }, number, repository: { nameWithOwner: "example/tender" }, milestone: i % 2 ? { title: `v${i % 3}` } : null };
    const content = i % 17 === 5
      ? { ...shared, __typename: "PullRequest", id: `PR_sample${number}`, title: `feat(sample): change number ${number}`, url: `https://github.com/example/tender/pull/${number}`,
        headRefName: `feat/${number}-sample`, labels: { nodes: labels }, assignees: { nodes: [] }, reviewRequests: { nodes: [] } }
      : { ...shared, __typename: "Issue", id: `I_sample${number}`, url: `https://github.com/example/tender/issues/${number}`,
        title: i % 11 === 0 ? `[Epic] Sample topic number ${number}` : `fix(sample): make sample thing ${number} read as the resolver states it`,
        issueType: types[i % types.length], labels: { nodes: i % 11 === 0 ? [...labels, { name: "epic", color: "5319e7" }] : labels },
        assignees: { nodes: i % 4 ? [{ login: "sample-user" }] : [] },
        parent: i % 3 ? { number: 900 + (i % 9), title: `[Epic] Sample parent ${900 + (i % 9)} with a title long enough to be cut short`, repository: { nameWithOwner: i % 5 ? "example/tender" : "example/atlas" } } : null,
        subIssuesSummary: { total, completed: Math.floor(total * ((i % 5) / 4)) } };
    return { id: `PVTI_large${i}`, fieldValueByName: { optionId: LARGE_SHOWN[i % 3], name: "x" }, priority: priorities[i % priorities.length], content };
  });
  return JSON.stringify({
    data: {
      viewer: { login: "sample-user" },
      repositoryOwner: { projectV2: { id: "PVT_sample", title: "Sample", url: "https://github.com/users/sample-user/projects/7",
        field: { id: "PVTSSF_sample", name: "Status", options: LARGE_OPTIONS.map(([id, name, color]) => ({ id, name, color })) },
        priorityField: { id: "PVTSSF_priority" }, h0: { totalCount: 40 }, h1: { totalCount: 120 },
        items: { totalCount: n, pageInfo: { hasNextPage: false, endCursor: "end" }, nodes } } },
    },
  });
}

// One draw of `b` and what it cost: the elements it made and its OKLCH
// conversions (oklch, tones.js, takes one Math.atan2 per color).
function drawCost(b, host) {
  const cost = { elements: 0, conversions: 0 };
  const made = { div: host.div, h_flex: host.h_flex, v_flex: host.v_flex };
  for (const [kind, make] of Object.entries(made)) host[kind] = (...a) => (cost.elements++, make(...a));
  const atan2 = Math.atan2;
  Math.atan2 = (...a) => (cost.conversions++, atan2(...a));
  try {
    b.render();
  } finally {
    Object.assign(host, made);
    Math.atan2 = atan2;
  }
  return cost;
}

test("UI: a full draw of a board of 300 cards (labels, types, priorities, milestones, parents, sub-issues up to 45) in columns whose lists herdr laid out 900 pixels high converts 6 to 100 colors to OKLCH and makes 300 to 1500 elements, in copper-dark and catppuccin-mocha, each draw on a new theme object as herdr gives it", async () => {
  const { b, host } = await openBoard({ answer: largeBoardAnswer(300) });
  assert.equal(b.views.mine.data.columns.filter((c) => !c.hidden).reduce((n, c) => n + c.cards.length, 0), 300);
  for (const ci of [0, 1, 2]) Object.assign(handleOf(b, ci), { width: 300, height: 900 });
  for (const [name, t] of [["copper-dark", copperTheme("dark")], ["catppuccin-mocha", catppuccinTheme()]]) {
    host.theme = () => ({ ...t });
    for (const draw of [1, 2]) {
      const cost = drawCost(b, host);
      assert.ok(cost.conversions >= 6 && cost.conversions <= 100, `${name}, draw ${draw}: ${cost.conversions} conversions`);
      assert.ok(cost.elements >= 300 && cost.elements <= 1500, `${name}, draw ${draw}: ${cost.elements} elements`);
    }
  }
});

test("memo answers each key once, by the first argument without a key; without a key a function whose length (its parameters before the first with a default or a rest) is above one is refused", () => {
  let calls = 0;
  const twice = board.memo((x) => (calls++, x * 2));
  assert.deepEqual([twice(2), twice(2), twice(3), calls], [4, 4, 6, 2]);
  assert.throws(() => board.memo((a, b) => a + b), /memo: .* of 2 arguments needs a key/);
  assert.doesNotThrow(() => board.memo((a, b = 1) => a + b), "a length of 1");
  const sum = board.memo((a, b) => (calls++, a + b), (a, b) => `${a} ${b}`);
  assert.deepEqual([sum(1, 2), sum(1, 3), sum(1, 2), calls], [3, 4, 3, 4]);
});

// ---- A long column: only the cards about its window drawn whole ----

const cardList = (b, ci) => byId(b.render(), `cards-${ci}`);
const isFrame = (el) => el.with.id === undefined;
const wholeAt = (list) => list.kids.flatMap((k, i) => (isFrame(k) ? [] : [i]));
// Runs a handler with a cx of its own → how often it asked for a draw.
const notifies = (cx, fn) => cx.call((own) => {
  let n = 0;
  own.notify = () => n++;
  fn(own);
  return n;
});
// A shown column's list handle; it claims the states, as a draw would, only
// where no draw has yet.
function handleOf(b, ci) {
  const ids = b.navColumns(b.view()).map((c) => c.id);
  return (board.keptOf(b, ids[ci]) ?? board.columnsKept(b, ids)[ci]).scroll;
}
function listsOf(b) {
  const root = b.render();
  return Object.fromEntries(b.navColumns(b.view()).map((c, ci) => [c.id, byId(root, `cards-${ci}`).with.track_scroll[0]]));
}
function wideBoard(n, { none = false } = {}) {
  const data = json("github-board.json");
  const project = data.data.repositoryOwner.projectV2;
  project.field.options = Array.from({ length: n }, (_, i) => ({ id: `opt-${i}`, name: `Spalte ${i}`, color: "GRAY" }));
  project.items.nodes.forEach((node, i) => (node.fieldValueByName = none && i === 0 ? null : { optionId: `opt-${i % n}`, name: "x" }));
  return JSON.stringify(data);
}
const bandTimers = (cx) => cx.every.filter((f) => f.ms === board.BAND_MS).length;
// One look of the copy's BAND_MS timer → how often it asked for a draw.
function bandLook(cx) {
  const notes = globalThis.__boardHost.notes.length;
  let n = 0;
  for (const fn of cx.every.filter((f) => f.ms === board.BAND_MS)) fn({ notify: () => n++ });
  assert.equal(globalThis.__boardHost.notes.length, notes, "the look did not fail");
  return n;
}
const LIST_H = 900;
// Lengths in the window's pixels at herdr's `zoom`.
const scaled = (box, zoom) => Object.fromEntries(Object.entries(box).map(([k, v]) => [k, v * zoom]));
const G = { char: "G", modifiers: { shift: true } };

// A board of 300 cards, 100 a column; herdr laid each list out 300 wide and
// LIST_H high and measured each card drawn whole `card` high, until no
// other card is drawn whole.
async function longBoard({ card = 100, zoom = 1 } = {}) {
  const opened = await openBoard({ answer: largeBoardAnswer(300) });
  const { b, cx, host } = opened;
  host.theme = () => copperTheme("dark");
  if (zoom !== 1) host.settings = () => ({ zoom });
  for (const ci of [0, 1, 2]) Object.assign(handleOf(b, ci), { width: 300, height: LIST_H });
  measureWhole(b, cx, card, zoom);
  return opened;
}

// herdr measures every card drawn whole `height` high, until a draw draws
// no other.
function measureWhole(b, cx, height, zoom = 1) {
  for (let round = 0; round < 10; round++) {
    let fresh = 0;
    for (const ci of [0, 1, 2]) {
      for (const kid of cardList(b, ci).kids.filter((k) => !isFrame(k))) {
        const key = kid.with.id[0].slice("card-".length);
        if (b.shapeState.board.heights.get(key)?.height === height) continue;
        fresh++;
        cx.call((own) => kid.with.on_size_change[0](scaled({ width: 300, height }, zoom), own));
      }
    }
    if (!fresh) return;
  }
  assert.fail("the cards drawn whole never settled");
}

// Where each card of a list stands: a whole one `card` high (measured), a
// frame as tall as it is drawn, 6 pixels between them.
const topsOf = (list, card = 100) => board.rowTops(list.kids.map((k) => (isFrame(k) ? k.with.h[0] : card)), 6).tops;
// The cards whole in a list scrolled `offset` down: those in its window and
// half a window above and below.
const bandAt = (list, offset) => topsOf(list).flatMap((top, i) => (top < offset + LIST_H * 1.5 && top + (isFrame(list.kids[i]) ? list.kids[i].with.h[0] : 100) > offset - LIST_H / 2 ? [i] : []));

test("UI: a long column draws whole only the cards about its window, half a window above and below; every other card is a frame, one element as tall as the card (measured, or guessed where it never was), and every card stays a child of the list in its order", async () => {
  const { b, st } = await longBoard();
  const list = cardList(b, 0);
  const cards = b.navColumns(b.view())[0].shown;
  assert.equal(list.kids.length, 100, "every card a child: scroll_to_item names a card by its row");
  // At the top: the window [0, 900) and half of it below, 106 pixels a card.
  assert.deepEqual(wholeAt(list), Array.from({ length: 13 }, (_, i) => i), "the cards from 0 to 1350 pixels");
  assert.deepEqual(list.kids.slice(0, 13).map((k) => k.with.id[0]), cards.slice(0, 13).map((c) => `card-${c.key}`), "in their order");
  const frame = list.kids[50];
  assert.deepEqual([frame.kids, frame.with.h[0]], [[], board.cardHeightGuess(cards[50], 300)], "a frame: no element inside, its height guessed from its lines in the list's width");
  const plain = list.kids[1];
  assert.deepEqual([frame.with.border_color[0], frame.with.bg[0], frame.with.rounded[0], frame.styles.includes("border_1")], [plain.with.border_color[0], plain.with.bg[0], plain.with.rounded[0], true], "in a card's border and ground");
  assert.ok(board.cardHeightGuess(cards[50], 300) > board.cardHeightGuess({ ...cards[50], title: "x", labels: [], type: null, assignees: [], sub: null, milestone: null, parent: null }, 300), "a card with more lines is guessed taller");
  assert.equal(st().sel.key, cards[0].key);
});

test("UI: a column draws whole the cards about where its ScrollHandle says the list stands scrolled, each column by its own, kept within the list", async () => {
  const { b, cx } = await longBoard();
  handleOf(b, 0).y = 4000;
  measureWhole(b, cx, 100);
  const list = cardList(b, 0);
  const band = bandAt(list, 4000);
  assert.deepEqual(wholeAt(list), band, "whole: the cards in [3550, 5350)");
  assert.ok(band.includes(40) && band.length >= 16, `${band}`);
  assert.equal(wholeAt(cardList(b, 1))[0], 0, "another column by its own handle");
  handleOf(b, 0).y = 1e6;
  measureWhole(b, cx, 100);
  const end = cardList(b, 0);
  assert.ok(!isFrame(end.kids[99]) && isFrame(end.kids[0]), "past its end, as herdr's offset stands until herdr clamps it: drawn at the end");
});

test("UI: the wheel over a column asks a draw only where its list scrolled past the band, by the offset the handle reads after GPUI moved the list", async () => {
  const { b, cx } = await longBoard();
  const column = byId(b.render(), "col-0");
  // GPUI moves the list before the event reaches its column, and keeps the
  // offset within the list at its next frame.
  const wheel = (y) => {
    handleOf(b, 0).y = y;
    return notifies(cx, (own) => column.with.on_scroll_wheel[0]({ delta: { x: 0, y: -100 } }, own));
  };
  assert.equal(wheel(450), 0, "450 down: the window's end at the band's");
  assert.equal(wheel(451), 1, "451: past it");
  cardList(b, 0);
  assert.equal(wheel(1), 0, "drawn about 451: 1 is the band's top");
  assert.equal(wheel(0), 1, "0: above it");
  assert.equal(wheel(1e6), 1, "past the list's end, before GPUI keeps it within: the end, past the band");
  measureWhole(b, cx, 100);
  assert.ok(!isFrame(cardList(b, 0).kids[99]));
  assert.equal(wheel(1e6), 0, "drawn at the end: no draw more");
});

test("UI: while the board shows, and only then, a timer every BAND_MS (100 ms) reads the handle of each column its last draw showed and asks a draw only where a window left its band: a drag of the scrollbar's thumb, released anywhere; a window grown past the band; not a column hidden since; no timer while the board is hidden, from its start too; nothing while it shows another view", async () => {
  const { b, cx, host } = await longBoard();
  assert.equal(board.BAND_MS, 100);
  assert.equal(bandTimers(cx), 1, "one timer while the board shows");
  assert.equal(bandLook(cx), 0, "at the top");
  handleOf(b, 0).y = 4000;
  assert.equal(bandLook(cx), 1, "the thumb dragged to 4000");
  assert.equal(bandLook(cx), 1, "until a draw");
  measureWhole(b, cx, 100);
  assert.ok(wholeAt(cardList(b, 0)).includes(40));
  assert.equal(bandLook(cx), 0, "drawn there: nothing more");
  handleOf(b, 2).y = 451;
  assert.equal(bandLook(cx), 1, "the third column");
  cardList(b, 2);
  handleOf(b, 1).height = LIST_H + 451;
  assert.equal(bandLook(cx), 1, "the second column's window 451 higher: its end past the band");
  cardList(b, 1);
  assert.equal(bandLook(cx), 0);
  const shown = host.panes;
  host.panes = () => [];
  await cx.look();
  assert.equal(bandTimers(cx), 0, "hidden: the timer stopped");
  await cx.look();
  handleOf(b, 0).y = 0;
  host.panes = shown;
  await cx.look();
  assert.equal(bandTimers(cx), 1, "shown again: one timer");
  assert.equal(bandLook(cx), 1, "which reads where the handle went meanwhile");
  await cx.look();
  assert.equal(bandTimers(cx), 1, "still one");
  const [first, second] = b.navColumns(b.view());
  b.toggleColumn(b.view(), first, cx);
  cardList(b, 0);
  board.keptOf(b, first.id).scroll.y = 8000;
  assert.equal(bandLook(cx), 0, "the first column hidden, then a draw: its list is not read");
  board.keptOf(b, second.id).scroll.y = 4000;
  assert.equal(bandLook(cx), 1, "the column that draw put first: read by its own handle");
  const list = handleOf(b, 0);
  await click(b, cx, "tab-github:prs");
  list.y = 8000;
  assert.equal(bandLook(cx), 0, "the PR list shows");
  const late = await bootBoard({ shown: false });
  assert.equal(bandTimers(late.cx), 0, "a copy hidden from its start: none");
  late.host.panes = shown;
  await late.cx.look();
  assert.equal(bandTimers(late.cx), 1, "until it shows");
});

test("UI: a key that selects a card outside the band scrolls to its row and draws it whole, marked, while herdr has not yet run the scroll; once the handle moved the band follows it again; a frame keeps the selected card's mark; gg back", async () => {
  const { b, cx, host, st } = await longBoard();
  const handle = handleOf(b, 0);
  const { accent, border } = copperTheme("dark");
  host.scrolled.splice(0);
  await press(b, cx, "g", G);
  assert.deepEqual(host.scrolled.splice(0), [{ handle, row: 99 }], "G: the last card's row");
  let list = cardList(b, 0);
  assert.ok(!isFrame(list.kids[99]) && isFrame(list.kids[0]), "the last card whole, the first a frame, the handle still at the top");
  assert.equal(list.kids[99].with.border_color[0], accent, "marked");
  assert.equal(bandLook(cx), 0, "the handle not moved yet: the band stays where the scroll goes");
  measureWhole(b, cx, 100);
  list = cardList(b, 0);
  const end = topsOf(list).at(-1) + 100 - LIST_H;
  handle.y = end - 3;
  assert.equal(bandLook(cx), 0, "herdr ran it, 3 pixels from the sum: the handle's offset, in the band");
  handle.y = 0;
  assert.equal(bandLook(cx), 1, "the wheel back at the top, where G started: the band follows the handle");
  assert.ok(!isFrame(cardList(b, 0).kids[0]), "the first card whole");
  handle.y = end - 3;
  cardList(b, 0);
  await press(b, cx, "k");
  assert.ok(!isFrame(cardList(b, 0).kids[98]), "k: the one above, already whole");
  handle.y = 0;
  assert.equal(bandLook(cx), 1, "the wheel back at the top");
  list = cardList(b, 0);
  assert.ok(isFrame(list.kids[98]), "scrolled away");
  assert.deepEqual([list.kids[98].with.border_color[0], list.kids[97].with.border_color[0]], [accent, border], "the frame of the selected card marked, another not");
  await press(b, cx, "g");
  await press(b, cx, "g");
  assert.deepEqual(host.scrolled.splice(0).at(-1), { handle, row: 0 }, "gg: the first row");
  assert.equal(st().sel.key, b.navColumns(b.view())[0].shown[0].key);
  assert.ok(!isFrame(cardList(b, 0).kids[0]));
});

test("UI: a frame carries no handler of its own: a card dragged onto another column and released over one of its frames moves there, chosen", async () => {
  const { b, cx, st } = await longBoard();
  const key = b.navColumns(b.view())[0].shown[0].key;
  const to = b.navColumns(b.view())[2].id;
  await mouse(b, cx, `card-${key}`, "on_mouse_down");
  byId(b.render(), "col-2").with.on_hover[0](true, cx);
  const frame = cardList(b, 2).kids[60];
  assert.ok(isFrame(frame));
  assert.deepEqual(Object.keys(frame.with).filter((k) => k.startsWith("on_")), [], "nothing that could stop the release on its way to the column");
  await mouse(b, cx, "col-2", "on_mouse_up");
  assert.deepEqual([board.findCard(st().data, key).column.id, st().sel.key, b.drag], [to, key, null]);
});

test("UI: a column whose content shrinks below where it stood scrolled (the filter) draws the cards it keeps whole, from its top", async () => {
  const { b } = await longBoard();
  handleOf(b, 0).y = topsOf(cardList(b, 0))[80];
  assert.ok(isFrame(cardList(b, 0).kids[0]));
  b.filterText = "change number";
  const kept = cardList(b, 0);
  assert.ok(kept.kids.length > 2 && kept.kids.length < 10, `a few pull requests: ${kept.kids.length}`);
  assert.deepEqual(wholeAt(kept), kept.kids.map((_, i) => i), "all of them whole");
});

test("UI: a column's band stays where it stood across a refresh and a switch to another tab and back", async () => {
  const { b, cx, host } = await longBoard();
  handleOf(b, 0).y = 4000;
  measureWhole(b, cx, 100);
  const there = wholeAt(cardList(b, 0));
  assert.ok(there.includes(40) && !there.includes(0), `${there}`);
  await press(b, cx, "r");
  await host.answer("gh", ok(largeBoardAnswer(300)), isBoardCall);
  assert.deepEqual(wholeAt(cardList(b, 0)), there, "after a refresh");
  await click(b, cx, "tab-github:prs");
  await click(b, cx, "tab-github:mine");
  assert.deepEqual(wholeAt(cardList(b, 0)), there, "after a switch to the PR list and back");
});

test("UI: a column that takes over a state another column held draws its top whole in that very draw, while herdr has not yet run the scroll to the top", async () => {
  const { b, cx, host } = await longBoard();
  const list = handleOf(b, 0);
  list.y = 4000;
  measureWhole(b, cx, 100);
  assert.ok(isFrame(cardList(b, 0).kids[0]));
  const others = b.shapeState.board.pool.length - 3;
  board.columnsKept(b, Array.from({ length: others }, (_, i) => `other-${i}`));
  host.scrolled.splice(0);
  await press(b, cx, "r");
  await host.answer("gh", ok(largeBoardAnswer(300).replaceAll("opt-ready", "opt-renamed")), isBoardCall);
  const drawn = cardList(b, 0);
  assert.equal(b.navColumns(b.view())[0].id, "opt-renamed");
  assert.equal(board.keptOf(b, "opt-renamed").scroll, list, "the state of the column it replaces, used longest ago");
  assert.deepEqual(host.scrolled.filter((s) => s.handle === list).at(-1), { handle: list, row: 0 }, "its list to the top");
  assert.deepEqual(wholeAt(drawn), bandAt(drawn, 0), "the handle still at 4000: the cards at the top whole");
  assert.equal(bandLook(cx), 0);
  list.y = 0;
  assert.equal(bandLook(cx), 0, "herdr ran it: in the band");
});

test("UI: a board column keeps its list's ScrollHandle by its id, not its place: a column that comes in front of the others (Ohne Status) leaves each its own, and takes one of its own", async () => {
  const { b, cx, host } = await openBoard();
  const before = listsOf(b);
  Object.values(before).forEach((handle, i) => (handle.y = 100 * (i + 1)));
  const offsets = Object.fromEntries(Object.entries(before).map(([id, handle]) => [id, handle.y]));
  await press(b, cx, "r");
  await host.answer("gh", ok(boardWith((nodes) => (nodes.find((n) => n.id === "PVTI_rec1").fieldValueByName = null))), isBoardCall);
  const after = listsOf(b);
  assert.equal(Object.keys(after)[0], board.NO_STATUS, "Ohne Status in front");
  assert.deepEqual(Object.fromEntries(Object.keys(before).map((id) => [id, after[id].y])), offsets, "each column where it stood");
  for (const id of Object.keys(before)) assert.equal(after[id], before[id], `${id}: its own handle`);
  assert.equal(new Set(Object.values(after)).size, Object.keys(after).length, "Ohne Status one of its own");
});

test("UI: a board that shows more columns than keep their own state: those that hold one keep it, by id, when a column comes in front, and that one shares one of theirs, the same at every draw", async () => {
  const { b, cx, host } = await openBoard({ answer: wideBoard(24) });
  const before = listsOf(b);
  assert.equal(new Set(Object.values(before)).size, 24, "24 columns, each its own");
  Object.values(before).forEach((handle, i) => (handle.y = 10 * (i + 1)));
  await press(b, cx, "r");
  await host.answer("gh", ok(wideBoard(24, { none: true })), isBoardCall);
  const after = listsOf(b);
  assert.equal(Object.keys(after)[0], board.NO_STATUS);
  for (const id of Object.keys(before)) assert.equal(after[id], before[id], `${id}: its own handle`);
  assert.ok(Object.values(before).includes(after[board.NO_STATUS]), "Ohne Status shares one");
  assert.deepEqual(listsOf(b), after, "and again at the next draw");
});

test("a board column's kept state (columnsKept): one of the SCROLLS made at the start, held by the column's id; a column without one takes one no column holds, else the one used longest ago whose column the draw does not show, its width anew and its list scrolled to the top, its band there at once; past SCROLLS shown, a column without one shares the one made at its place; keptOf claims none and counts no use", async () => {
  const { host } = await bootBoard();
  const b = { shapeState: { board: board.boardShape.state() } };
  const st = b.shapeState.board;
  const scrolls = st.pool.length;
  host.scrolled.splice(0);
  const draw = (ids) => board.columnsKept(b, ids);
  const named = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const a = draw(named("a", 3));
  assert.equal(new Set(a).size, 3, "each its own");
  const other = draw(named("b", 5));
  assert.ok(other.every((k) => !a.includes(k)), "another view's columns take ones no column holds");
  assert.deepEqual(draw(named("a", 3)), a, "the first view's again: their own");
  draw(named("c", scrolls - 8));
  draw(named("a", 3));
  assert.equal(new Set(st.byId.values()).size, scrolls, "all held");
  assert.deepEqual(host.scrolled, [], "a state no column held before scrolls nothing");
  assert.equal(board.keptOf(b, "d0"), undefined, "keptOf: none for a column without one");
  assert.equal(board.keptOf(b, "b0"), other[0], "keptOf: b0's own");
  other[0].cardWidth = 280;
  other[0].band.lo = 40;
  other[0].scroll.y = 500;
  assert.equal(draw(["d0"])[0], other[0], "a new column: the one used longest ago, b0's (keptOf counted no use)");
  assert.deepEqual([other[0].cardWidth, other[0].band, st.byId.has("b0")], [0, { ...board.bandState(), revealed: { from: 500, to: 0 } }, false],
    "its width anew, its band where its list goes: the top; b0 holds none now");
  assert.deepEqual(host.scrolled.splice(0), [{ handle: other[0].scroll, row: 0 }], "its list to the top");
  const [e0, b1] = draw(["e0", "b1"]);
  assert.deepEqual([e0, b1], [other[2], other[1]], "not b1's, the oldest, which the draw shows: b2's");
  const many = draw(named("f", scrolls + 2));
  assert.equal(new Set(many.slice(0, scrolls)).size, scrolls, "the first SCROLLS shown each their own");
  assert.deepEqual(many.slice(scrolls), [st.pool[0], st.pool[1]], "those past them: the ones made at their places");
  assert.deepEqual(draw(named("f", scrolls + 2)), many, "the same at the next draw");
});

test("UI: a card's measure asks one draw where it is more than 2 pixels off the height its draw took or the column's cards changed width, and its height is the frame's once it leaves the band", async () => {
  const fresh = await openBoard({ answer: largeBoardAnswer(300) });
  Object.assign(handleOf(fresh.b, 0), { width: 300, height: LIST_H });
  const card = fresh.b.navColumns(fresh.b.view())[0].shown[0];
  assert.equal(notifies(fresh.cx, (own) => cardList(fresh.b, 0).kids[0].with.on_size_change[0]({ width: 300, height: board.cardHeightGuess(card, 300) }, own)), 0,
    "a column's first measure, at its guess: no draw");
  const { b, cx } = await longBoard({ card: 120 });
  const sized = (el, height, width = 300) => notifies(cx, (own) => el.with.on_size_change[0]({ width, height }, own));
  assert.equal(sized(cardList(b, 0).kids[1], 122), 0, "2 pixels off: no draw");
  assert.equal(sized(cardList(b, 0).kids[1], 140), 1, "20 off: one");
  assert.equal(sized(cardList(b, 0).kids[1], 140), 0, "drawn at it: none");
  handleOf(b, 0).y = 5000;
  const far = cardList(b, 0);
  assert.ok(isFrame(far.kids[1]), "scrolled away");
  assert.equal(far.kids[1].with.h[0], 140, "its frame as tall as it was measured");
  const shown = b.navColumns(b.view())[0].shown;
  const first = wholeAt(far).slice(3).find((i) => !b.shapeState.board.heights.has(shown[i].key));
  const guess = board.cardHeightGuess(shown[first], 300);
  assert.ok(Math.abs(guess - 120) > 2, `${guess}`);
  assert.equal(sized(far.kids[first], 120), 1, "a card drawn whole at its guess, measured for the first time");
  assert.equal(sized(cardList(b, 0).kids[first], 120, 280), 1, "the same height at another width");
  assert.equal(sized(cardList(b, 0).kids[first], 120, 280), 0, "and again");
});

test("UI: a card's measure holds at the width it was taken at: in a list of another width a card measured only at the old one is a frame of its height guessed at the new, until the width is back", async () => {
  const { b, cx } = await longBoard();
  const cards = b.navColumns(b.view())[0].shown;
  const sized = (el, height, width) => notifies(cx, (own) => el.with.on_size_change[0]({ width, height }, own));
  const i = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((n) => ![100, board.cardHeightGuess(cards[n], 300)].includes(board.cardHeightGuess(cards[n], 200)));
  assert.ok(i, "a card guessed apart at 300 and at 200");
  handleOf(b, 0).y = 4000;
  assert.deepEqual([isFrame(cardList(b, 0).kids[i]), cardList(b, 0).kids[i].with.h[0]], [true, 100], "measured at 300: 100 high");
  handleOf(b, 0).width = 200;
  const narrow = cardList(b, 0);
  sized(narrow.kids[wholeAt(narrow)[0]], 80, 200);
  assert.equal(cardList(b, 0).kids[i].with.h[0], board.cardHeightGuess(cards[i], 200), "200 wide: guessed at the list's width");
  handleOf(b, 0).width = 300;
  const back = cardList(b, 0);
  sized(back.kids[wholeAt(back)[0]], 100, 300);
  assert.equal(cardList(b, 0).kids[i].with.h[0], 100, "300 again: its measure");
});

test("UI: at herdr's zoom 2 a column takes its handle's lengths as herdr gives them, in the script's pixels, and a card's measure in the window's divided by the zoom", async () => {
  const { b, cx } = await longBoard({ zoom: 2 });
  let list = cardList(b, 0);
  assert.deepEqual(wholeAt(list), Array.from({ length: 13 }, (_, i) => i), "the cards 200 window pixels, 100 high, as at zoom 1");
  handleOf(b, 0).y = 450;
  assert.equal(bandLook(cx), 0);
  handleOf(b, 0).y = 451;
  assert.equal(bandLook(cx), 1);
  handleOf(b, 0).y = 4000;
  measureWhole(b, cx, 100, 2);
  list = cardList(b, 0);
  assert.deepEqual(wholeAt(list), bandAt(list, 4000));
  assert.ok(wholeAt(list).includes(40) && isFrame(list.kids[0]), `${wholeAt(list)}`);
});

test("UI: on a herdr whose ScrollHandle reads nothing back (before 0.1.18) every card of a column draws whole and unmeasured, as before the band, also one that takes over a state another column held, and the log says so once per board copy", async () => {
  const logged = [];
  const log = console.log;
  console.log = (...a) => logged.push(a.join(" "));
  let opened;
  try {
    await openBoard({ answer: largeBoardAnswer(300) });
    assert.deepEqual(logged, [], "a herdr that reads it back: nothing");
    opened = await openBoard({ answer: largeBoardAnswer(300), oldScroll: true });
  } finally {
    console.log = log;
  }
  const { b, cx, host } = opened;
  assert.deepEqual(logged.filter((l) => l.includes("0.1.18")).length, 1, logged.join("\n"));
  const list = cardList(b, 0);
  assert.deepEqual(wholeAt(list), list.kids.map((_, i) => i), "all 100 whole");
  assert.equal(list.kids.length, 100);
  assert.equal(list.kids.filter((k) => k.with.on_size_change).length, 0, "no card measured: a measure would ask a draw");
  assert.equal(byId(b.render(), "col-0").with.on_scroll_wheel, undefined, "no wheel to follow");
  assert.equal(bandLook(cx), 0);
  host.scrolled.splice(0);
  await press(b, cx, "g", G);
  assert.deepEqual(host.scrolled.splice(0), [{ handle: handleOf(b, 0), row: 99 }], "G still scrolls to the last row");
  board.columnsKept(b, Array.from({ length: b.shapeState.board.pool.length }, (_, i) => `other-${i}`));
  const back = cardList(b, 0);
  assert.deepEqual(wholeAt(back), back.kids.map((_, i) => i), "a state another column held, taken back: all whole");
});

test("the band's sums: a handle read, a window herdr has not laid out yet as VIEWPORT_GUESS high; the band about the offset, kept within the content; whether a window left it; a key's reveal, which the band follows until the handle moved; a card's height before it is measured", async () => {
  await openBoard();
  assert.deepEqual(board.rowTops([100, 50, 80], 6), { tops: [0, 106, 162], content: 242 });
  assert.deepEqual(board.rowTops([], 6), { tops: [], content: 0 });
  const s = board.bandState();
  board.placeBand(s, 1000, { offset: 900, viewport: 500 });
  assert.deepEqual([s.lo, s.hi, s.content], [250, 1250, 1000], "kept within the content: its end at the window's");
  assert.deepEqual([board.inBand(s, 150, 100), board.inBand(s, 150, 101), board.inBand(s, 1249, 10), board.inBand(s, 1250, 10)], [false, true, true, false]);
  assert.deepEqual([board.leftBand(s, { offset: 250, viewport: 500 }), board.leftBand(s, { offset: 249, viewport: 500 }), board.leftBand(s, { offset: 5000, viewport: 500 })], [false, true, false],
    "the band's top; above it; past the content's end, at its end");
  board.placeBand(s, 300, { offset: 900, viewport: 500 });
  assert.equal(s.lo, -250, "content lower than the window: at its top");
  const read = (y, height) => board.scrollOf({ offset: () => ({ x: 0, y }), viewport_size: () => ({ width: 280, height }) });
  assert.deepEqual(read(40, 500), { offset: 40, viewport: 500, width: 280 });
  assert.deepEqual(read(0, 0), { offset: 0, viewport: board.VIEWPORT_GUESS, width: 280 }, "a window not laid out yet: VIEWPORT_GUESS high");
  const guessed = board.bandState();
  board.placeBand(guessed, 5000, read(0, 0));
  assert.deepEqual([guessed.lo, guessed.hi], [-board.VIEWPORT_GUESS / 2, board.VIEWPORT_GUESS * 1.5], "a band about it");
  assert.deepEqual([board.leftBand(guessed, read(500, 0)), board.leftBand(guessed, read(501, 0))], [false, true], "and left by its end");
  const unlaid = board.bandState();
  board.revealCard(unlaid, read(0, 0), 5000, 1300, 200);
  assert.equal(unlaid.revealed.to, 1500 - board.VIEWPORT_GUESS, "a card revealed in it");
  const r = board.bandState();
  const at = { offset: 1000, viewport: 400 };
  board.revealCard(r, at, 5000, 1300, 200);
  assert.deepEqual(r.revealed, { from: 1000, to: 1100 }, "below the window: its end at the window's");
  board.placeBand(r, 5000, at);
  assert.deepEqual([r.lo, board.leftBand(r, at)], [900, false], "the handle not moved: about 1100");
  assert.equal(board.leftBand(r, { offset: 3000, viewport: 400 }), true, "moved: the handle's offset");
  board.placeBand(r, 5000, at);
  assert.equal(r.lo, 800, "back at where the key's scroll started: about the handle, the reveal done");
  board.revealCard(r, at, 5000, 1200, 100);
  assert.equal(r.revealed, null, "in the window: nothing to follow");
  board.revealCard(r, at, 5000, 300, 100);
  assert.equal(r.revealed.to, 300, "above: its top at the window's");
  board.revealCard(r, at, 1000, 900, 100);
  assert.equal(r.revealed.to, 600, "kept within the content it is given");
  const bare = { title: "x", labels: [], type: null, assignees: [], sub: null, milestone: null, parent: null };
  const long = { ...bare, title: "t".repeat(100) };
  assert.deepEqual([board.cardHeightGuess(bare, 300), board.cardHeightGuess(long, 300), board.cardHeightGuess(long, 600), board.cardHeightGuess(long, 0)], [59, 93, 76, 93],
    "a long title on three lines, on two in a wider list; a list not laid out yet taken as 300 wide");
  assert.deepEqual([{ labels: ["a"] }, { type: "Bug" }, { assignees: ["x"] }, { milestone: "v1" }, { parent: 1 }, { sub: { total: 3, done: 1 } }].map((f) => board.cardHeightGuess({ ...bare, ...f }, 300)), [81, 81, 81, 81, 81, 81]);
  assert.equal(board.cardHeightGuess({ ...bare, labels: ["a"], milestone: "v1", sub: { total: 3, done: 1 } }, 300), 125);
  assert.deepEqual([board.cardHeightGuess({ ...bare, assignees: ["x"], sub: { total: 3, done: 1 } }, 300), board.cardHeightGuess({ ...bare, title: "[Epic] x", labels: ["Epic"] }, 300), board.cardHeightGuess({ ...bare, parent: { number: 1 } }, 300)], [81, 81, 59],
    "the assignees on the progress line; an Epic by its title alone its type's chip; a parent the card cannot name no meta line");
});

test("UI: each draw takes its colors from the theme it draws in, after a switch of the theme too: label chips by their color's hue, priorities, column dots and card edges, through copper-dark, catppuccin-mocha, copper-light, copper-dark without copper's colors and copper-dark again", async () => {
  const answer = largeBoardAnswer(30);
  const { b, host } = await openBoard({ answer });
  const nodes = JSON.parse(answer).data.repositoryOwner.projectV2.items.nodes;
  const copperName = (tone) => Object.entries(board.COPPER_HUES).find(([, slot]) => slot === tone)?.[0] ?? "neutral";
  const themes = [["copper-dark", copperTheme("dark"), true], ["catppuccin-mocha", catppuccinTheme(), false], ["copper-light", copperTheme("light"), true],
    ["copper-dark without copper's colors", tintedCopper("dark"), false], ["copper-dark again", copperTheme("dark"), true]];
  for (const [name, t, copper] of themes) {
    host.theme = () => ({ ...t });
    const text = (tone) => (copper ? t[`copper-${copperName(tone)}-text`] : t[tone] ?? t.muted);
    const chipBgs = (tone) => (copper ? [3, 4].map((step) => t[`copper-${copperName(tone)}-${step}`]) : [`${text(tone).slice(0, 7)}1a`]);
    const lch = (hex) => {
      const [, a, b2] = oklab(`#${hex.replace("#", "")}`);
      return { c: Math.hypot(a, b2), h: ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360 };
    };
    const apartBy = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
    const nearest = (hex) =>
      lch(hex).c < board.GREY_CHROMA ? "muted" : board.HUE_TONES.reduce((best, tone) => (apartBy(lch(hex).h, lch(t[tone]).h) < apartBy(lch(hex).h, lch(t[best]).h) ? tone : best));
    const root = b.render();
    let labels = 0;
    for (const node of nodes) {
      const card = byId(root, `card-${node.id}`);
      for (const { name: label, color } of node.content.labels.nodes.filter((l) => l.name !== "epic").slice(0, 3)) {
        const tone = copper ? LARGE_LABEL_TONES[color] : nearest(color);
        const [fg, bg] = chipLook(chipOf(card, label));
        assert.equal(fg, text(tone), `${name}: ${node.id} ${label} #${color}`);
        assert.ok(chipBgs(tone).includes(bg), `${name}: ${node.id} ${label} #${color} on ${bg}`);
        labels++;
      }
      const priority = node.priority && byId(card, "priority");
      if (priority) assert.equal(chipLook(priority)[0], text(copper ? GITHUB_TONES[node.priority.color] : board.chipTone(GITHUB_TONES[node.priority.color])), `${name}: ${node.id} priority`);
      const [, , color] = LARGE_OPTIONS.find(([id]) => id === node.fieldValueByName.optionId);
      assert.equal(card.kids[0].with.bg[0], text(GITHUB_TONES[color]), `${name}: ${node.id} edge`);
    }
    assert.ok(labels > 30, `${name}: ${labels} label chips`);
    const dots = LARGE_SHOWN.map((id) => byId(root, `col-${LARGE_SHOWN.indexOf(id)}`).kids[0].kids[0].with.bg[0]);
    assert.deepEqual(dots, LARGE_SHOWN.map((id) => text(GITHUB_TONES[LARGE_OPTIONS.find(([o]) => o === id)[2]])), `${name}: column dots`);
  }
});

test("a space on a branch is an item's session where a part of the branch is the item's number followed by „-“, or its last part is the number", () => {
  const card = board.findCard(githubBoard(), "PVTI_rec1").card;
  const on = (branch) => Boolean(board.linkedSession(card, [{ id: "s", name: "x", folder: "/r/tender.worktrees/x", branch, status: "idle", tabs: [] }]));
  const branches = ["feat/3000-x", "3000", "3000-x", "feat/3000", "a/b/3000-y", "feat/3000-x/more", "feat/30001-x", "feat/13000-x", "feat/3000x", "feat/3000/x", "feat/x3000", "feat-3000"];
  assert.deepEqual(branches.map((br) => [br, on(br)]), branches.map((br) => [br, /(^|\/)3000(-|$)/.test(br)]));
  assert.deepEqual(branches.filter(on), ["feat/3000-x", "3000", "3000-x", "feat/3000", "a/b/3000-y", "feat/3000-x/more"]);
});

test("a progress bar is 6 high, each of its segments as high by the bar's stretch, and a continuous one too", () => {
  globalThis.__boardHost = fakeHost();
  const t = copperTheme("dark");
  const bar = byId(board.progressLine(t, { done: 1, total: 3 }, []), "progress-bar");
  assert.deepEqual(bar.with.h, [6]);
  assert.equal(bar.kids.length, 3);
  for (const segment of bar.kids) assert.ok(heightFrom(bar, segment) && !segment.with.h, "the bar's height");
  const wide = byId(board.progressLine(t, { done: 1, total: 31 }, []), "progress-bar");
  assert.deepEqual([wide.with.h, wide.kids[0].with.h], [[6], [6]]);
});

// ---- Loading: the saved state, reads in steps, the prefetch, the call log, the spinner ----

// testConfig's views as the board reads them, and the saved entry of the
// view `id` for `data` read at `at` (its hidden columns by default).
const testView = (id) => board.viewsOf(board.readConfig(testConfig()).config).find((v) => v.id === id);
const savedFor = (id, data, at, { hidden = board.hiddenColumns(testView(id), null), warnings = [] } = {}) =>
  board.savedText(testView(id), hidden, { data, warnings }, at);
const savedOf = (id) => board.readSaved(memory.get(board.savedKey(id)) ?? "", testView(id), board.hiddenColumns(testView(id), null));
// github-board.json as read for "mine", its first card retitled, so that it
// tells the saved state from a read's.
function savedBoard() {
  const data = githubBoard();
  data.columns.find((c) => c.cards.length).cards[0].title = "Gespeicherter Titel";
  return data;
}
const allCards = (data) => data.columns.flatMap((c) => c.cards);
const ageOf = (root) => texts(byId(root, "age")).join("");
const readingOf = (root) => texts(byId(root, "reading")).join("");
const refreshSpins = (root) => byId(root, "refresh").kids[0].styles.includes("spin");
const MIN = 60000;
const isListCall = (args) => args.some((a) => String(a).includes("search("));
const isThreadsCall = (args) => args.some((a) => String(a).includes("nodes(ids:"));
const isOtherCall = (args) => isBoardCall(args) && args.includes("number=8");
const isMineCall = (args) => isBoardCall(args) && !isOtherCall(args);

test("UI: a view draws its saved state at once, with its age beside the turning ↻, and the read that follows replaces it and saves its own after the draw", async () => {
  const at = Date.now() - 5 * MIN;
  const { b, cx, host, st } = await bootBoard({ raw: { "board:data:mine": savedFor("mine", savedBoard(), at) } });
  let root = b.render();
  assert.deepEqual([st().saved, st().loading, allCards(st().data).some((c) => c.title === "Gespeicherter Titel")], [true, true, true], "drawn before gh answers");
  assert.ok(byId(root, "columns"), "its columns, not „Lädt …“");
  assert.deepEqual([ageOf(root), readingOf(root), refreshSpins(root)], ["Stand vor 5 min", "lädt …", true]);
  assert.equal(host.open("gh").length, 1, "and reads it");
  await host.answer("gh", ok(fixture("github-board.json")));
  root = b.render();
  assert.deepEqual([st().saved, allCards(st().data).some((c) => c.title === "Gespeicherter Titel")], [false, false], "replaced by the read");
  assert.deepEqual([ageOf(root), byId(root, "reading"), refreshSpins(root)], ["Stand vor 0 s", null, false]);
  assert.equal(savedOf("mine").at, at, "the entry before stays until after the draw");
  await cx.fire();
  const saved = savedOf("mine");
  assert.equal(saved.at, st().at, "saved with its read's time");
  assert.equal(allCards(saved.data).length, allCards(st().data).length);
});

test("UI: a read that fails keeps the saved state, its age and says why; a write against the saved state is refused, also while its read runs, and one whose read failed starts it again", async () => {
  const at = Date.now() - 5 * MIN;
  const { b, cx, host, st } = await bootBoard({ raw: { "board:data:mine": savedFor("mine", savedBoard(), at) } });
  await press(b, cx, "l", shiftL);
  assert.equal(b.notice?.text, board.SAVED_WRITE);
  assert.deepEqual(host.open("gh").map((c) => isBoardCall(c.args)), [true], "no move, only the read under way");
  await host.answer("gh", { code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" });
  assert.equal(host.open("gh").length, 0, "the write refused during the read asked for no read after it");
  const root = b.render();
  assert.deepEqual([st().saved, st().error, allCards(st().data).some((c) => c.title === "Gespeicherter Titel")], [true, "GitHub antwortete mit HTTP 502: Bad Gateway", true]);
  assert.deepEqual([ageOf(root), texts(root).includes("GitHub antwortete mit HTTP 502: Bad Gateway")], ["Stand vor 5 min", true]);
  await press(b, cx, "l", shiftL);
  assert.deepEqual(host.open("gh").map((c) => isBoardCall(c.args)), [true], "the read again, still no move");
  await host.answer("gh", ok(fixture("github-board.json")));
  await press(b, cx, "l", shiftL);
  assert.ok(host.open("gh").some((c) => c.args.some((a) => String(a).includes("updateProjectV2ItemFieldValue"))), "on read data the move is written");
});

test("the saved state: an entry is a view's only while its form and hidden columns are the same; one the store would take more than SAVED_MAX bytes for is none, counted as the store counts, and a board at its limit of 1000 items fits; gone views' entries are named", () => {
  const view = testView("mine");
  const hidden = board.hiddenColumns(view, null);
  const text = board.savedText(view, hidden, { data: githubBoard(), warnings: ["w"] }, 5);
  assert.deepEqual(Object.keys(board.readSaved(text, view, hidden)), ["data", "warnings", "at"]);
  assert.deepEqual(board.readSaved(text, view, hidden).warnings, ["w"]);
  assert.equal(board.readSaved(text, view, new Set(["Done"])), null, "other hidden columns");
  assert.equal(board.readSaved(text, { ...view, filter: "" }, hidden), null, "another form of the view");
  assert.equal(board.readSaved("{", view, hidden), null);
  assert.equal(board.readSaved(JSON.stringify({ ...JSON.parse(text), at: "x" }), view, hidden), null);
  for (const data of [null, {}, { shape: 3 }]) assert.equal(board.readSaved(JSON.stringify({ ...JSON.parse(text), data }), view, hidden), null, JSON.stringify(data));
  const sizes = [
    ["a", 3], ['"', 4], ["\n", 4], ["ä", 4], ["€", 5], ["😀", 6], ["\u007f", 3], ["\u0080", 4], ["\u07ff", 4], ["\u0800", 5],
    ["\ud7ff", 5], ["\ue000", 5], ["\u{10000}", 6], ["\u{103ff}", 6], ["\ud800", 8],
  ];
  assert.deepEqual(sizes.map(([text]) => board.storeBytes(text)), sizes.map(([, bytes]) => bytes));
  const pad = (s, n) => ({ data: { shape: "board", pad: s.repeat(n) }, warnings: [] });
  assert.equal(board.savedText(view, hidden, pad("x", board.SAVED_MAX), 1), null);
  assert.equal(board.savedText(view, hidden, pad("€", board.SAVED_MAX / 2), 1), null, "fewer characters than SAVED_MAX, more bytes");
  assert.ok(board.savedText(view, hidden, pad("x", board.SAVED_MAX - 1000), 1), "just below");
  const answer = json("github-board-cards.json");
  const items = answer.data.repositoryOwner.projectV2.items;
  const base = items.nodes;
  items.nodes = Array.from({ length: 1000 }, (_, i) => ({ ...base[i % base.length], id: `PVTI_${i}` }));
  assert.ok(board.savedText(view, hidden, { data: board.parseGithubBoard(answer, view, hidden), warnings: [] }, 1), "1000 cards");
  assert.equal(board.savedKey("mine"), "board:data:mine");
  assert.deepEqual(board.goneSaved(["board:data:mine", "board:data:gone", "data:gone", "source", "hidden:gone"], new Set(["mine"])), ["board:data:gone"]);
});

// What a shape's data holds, as saved: each key's own, and the types of what
// is no object; an array as the set of what its items hold.
function skeleton(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return [...new Set(v.map((x) => JSON.stringify(skeleton(x))))].sort().map((x) => JSON.parse(x));
  if (typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, skeleton(v[k])]));
  return typeof v;
}

test("what each shape keeps in its saved data is the form SAVED_VERSION names: a change to it raises SAVED_VERSION and the fingerprint here", () => {
  const print = (data) => createHash("sha256").update(JSON.stringify(skeleton(JSON.parse(JSON.stringify(data))))).digest("hex").slice(0, 12);
  const shapes = {
    board: githubBoard(), prs: board.parseGithubList(json("github-list.json"), testView("prs")), sprint: sprintData(), backlog: backlogData(),
  };
  assert.deepEqual({ version: board.SAVED_VERSION, ...Object.fromEntries(Object.entries(shapes).map(([k, d]) => [k, print(d)])) },
    { version: 1, board: "180d63b68cc0", prs: "ec79f6598c09", sprint: "e4b71886155b", backlog: "fd167b2a10f0" });
});

test("UI: on start the entries of views views.json no longer has are dropped; a saved state of another form of the view is not drawn; the other views' saved states come after the first draw; one too large to save drops the one before and says so in herdr's log", async () => {
  const at = Date.now() - MIN;
  logged.length = 0;
  const prs = board.parseGithubList(json("github-list.json"), testView("prs"));
  const { b, cx, host, st } = await bootBoard({ raw: {
    "board:data:gone": "{}", "board:data:prs": savedFor("prs", prs, at), "board:data:mine": savedFor("mine", savedBoard(), at, { hidden: new Set(["Done"]) }),
  } });
  assert.deepEqual([memory.has("board:data:gone"), memory.has("board:data:prs")], [false, true]);
  assert.deepEqual([st().data, st().loading], [null, true], "not its data");
  assert.equal(b.state("prs").data, null, "the other tabs' saved states wait for the first draw");
  await cx.fire();
  assert.equal(b.state("prs").data.shape, "prs", "and come after it");
  const huge = boardPage(0, 6, null);
  for (const n of huge.data.repositoryOwner.projectV2.items.nodes) n.content.title = "x".repeat(200000);
  memory.set("board:data:mine", savedFor("mine", savedBoard(), at));
  await host.answer("gh", ok(JSON.stringify(huge)));
  assert.equal(st().data.shape, "board", "drawn");
  await cx.fire();
  assert.equal(memory.has("board:data:mine"), false, "not saved, and the older entry gone");
  assert.ok(logged.includes(`board: board:data:mine not saved: more than ${board.SAVED_MAX} bytes`), logged.join("\n"));
});

test("UI: a views.json with problems drops no saved entry, not even those of the views it leaves out; read without them it drops the gone views' entries", async () => {
  const at = Date.now() - MIN;
  const broken = JSON.parse(testConfig());
  broken.sources.github.views.find((v) => v.id === "prs").sections = "none";
  const raw = { "board:data:gone": "{}", "board:data:prs": savedFor("prs", board.parseGithubList(json("github-list.json"), testView("prs")), at) };
  const { b, cx, host } = await bootBoard({ config: JSON.stringify(broken), raw });
  assert.ok(b.configErrors.length, "the problem is said");
  assert.equal(b.viewById("prs"), null, "the view is left out");
  assert.deepEqual([memory.has("board:data:gone"), memory.has("board:data:prs")], [true, true]);
  host.config = testConfig();
  await press(b, cx, "r");
  assert.deepEqual([memory.has("board:data:gone"), memory.has("board:data:prs")], [false, true]);
});

test("UI: an entry the store refuses drops the one before, and herdr's log names its key and the store's reason", async () => {
  const at = Date.now() - MIN;
  logged.length = 0;
  const { cx, host } = await bootBoard({ raw: { "board:data:mine": savedFor("mine", savedBoard(), at) } });
  const store = globalThis.localStorage;
  const setItem = store.setItem;
  store.setItem = (k, v) => {
    if (k.startsWith(board.SAVED_PREFIX)) throw new Error("store value `board:data:mine` is 9 bytes, over the limit\nmore");
    return setItem(k, v);
  };
  try {
    await host.answer("gh", ok(fixture("github-board.json")));
    await cx.fire();
  } finally {
    store.setItem = setItem;
  }
  assert.equal(memory.has("board:data:mine"), false);
  assert.ok(logged.includes("board: board:data:mine not saved: store value `board:data:mine` is 9 bytes, over the limit"), logged.join("\n"));
});

test("UI: a saved entry the board cannot draw is dropped and said in herdr's log; the view reads as if it had none, on start, on a switch to its tab and among the other views' saved states", async () => {
  const at = Date.now() - MIN;
  logged.length = 0;
  const other = board.parseGithubBoard(json("github-board.json"), testView("other"), board.hiddenColumns(testView("other"), null));
  const { b, cx, host, st } = await bootBoard({ raw: {
    "board:data:mine": savedFor("mine", { shape: "board", meta: {}, columns: [{ id: "c", name: "C", hidden: false }] }, at),
    "board:data:prs": savedFor("prs", { shape: "prs" }, at), "board:data:other": savedFor("other", other, at),
  } });
  assert.deepEqual([st().data, st().saved, st().at, st().sel, memory.has("board:data:mine")], [null, false, 0, null, false]);
  assert.ok(logged.some((l) => l.startsWith("board: board:data:mine dropped: ")), logged.join("\n"));
  assert.deepEqual(host.open("gh").map((c) => isMineCall(c.args)), [true], "and is read");
  assert.ok(byId(b.render(), "loading"));
  await press(b, cx, "2");
  assert.deepEqual([b.state("prs").data, memory.has("board:data:prs")], [null, false]);
  assert.equal(host.open("gh").filter((c) => isListCall(c.args)).length, 1, "the switch reads it");
  await cx.fire();
  assert.equal(b.state("other").saved, true, "the next view's saved state still comes");
});

test("UI: a GitHub board without data draws each page as it comes, with its warnings, says which page it reads, and the „Nur die ersten“ note waits for the last", async () => {
  const config = JSON.parse(testConfig());
  config.sources.github.views[0].limit = 150;
  const { b, host, st } = await bootBoard({ config: JSON.stringify(config) });
  assert.equal(readingOf(b.render()), "lädt …", "the pages are not known before the first");
  const first = boardPage(0, 3, "c1", { total: 9 });
  first.errors = [{ message: "Ein Fehler der ersten Seite", path: ["elsewhere"] }];
  await host.answer("gh", ok(JSON.stringify(first)), isBoardCall);
  let root = b.render();
  assert.deepEqual([st().loading, allCards(st().data).length], [true, 3], "the first page drawn");
  assert.ok(texts(root).includes("Ein Fehler der ersten Seite"), "with its warnings");
  assert.equal(readingOf(root), "lädt … Seite 2 von 2");
  assert.equal(texts(root).some((x) => x.startsWith("Nur die ersten")), false, "no note before the last page");
  assert.equal(texts(byId(root, "tab-github:mine")).includes("…"), false, "the tab counts what is drawn");
  const page = (total) => boardPage(0, 3, "c1", { total });
  assert.deepEqual([board.boardPages(page(250), testView("mine"), 10), board.boardPages(page(250), { limit: 150 }, 2), board.boardPages(page(0), testView("mine"), 10)], [3, 2, 1],
    "the pages by the count GitHub names, no more than the calls; a page more than it names counts as one more");
  await host.answer("gh", ok(JSON.stringify(boardPage(3, 6, "c2", { first: false, total: 9 }))), isBoardCall);
  root = b.render();
  assert.deepEqual([st().loading, allCards(st().data).length, byId(root, "reading")], [false, 6, null]);
  assert.ok(texts(root).some((x) => x.startsWith("Nur die ersten 6 von 9")), "the note at the end");
});

test("UI: a refresh over a board read since the start, by r or by the timer, draws its pages only once all came: the chosen card of a later page, its open details and the counts stay; the top right names the page", async () => {
  for (const how of ["r", "timer"]) {
    const config = JSON.parse(testConfig());
    config.sources.github.views[0].limit = 150;
    const { b, cx, host, st } = await bootBoard({ config: JSON.stringify(config) });
    await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1", { total: 6 }))), isBoardCall);
    await host.answer("gh", ok(JSON.stringify(boardPage(3, 6, null, { first: false, total: 6 }))), isBoardCall);
    const late = allCards(st().data)[5].key;
    b.choose(b.view(), { col: board.columnOf(b.navColumns(b.view()), late), key: late }, cx);
    st().detail = true;
    const count = () => texts(byId(b.render(), "tab-github:mine")).at(-1);
    const before = count();
    if (how === "r") await press(b, cx, "r");
    else {
      advance(3 * MIN);
      await cx.tick();
    }
    assert.deepEqual(host.open("gh").filter((c) => isMineCall(c.args)).length, 1, `${how}: read`);
    await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1", { total: 6 }))), isMineCall);
    assert.deepEqual([allCards(st().data).length, st().sel.key, st().picked, st().detail, count()], [6, late, late, true, before], `${how}: the board as it was`);
    assert.equal(readingOf(b.render()), "lädt … Seite 2 von 2", how);
    await host.answer("gh", ok(JSON.stringify(boardPage(3, 6, null, { first: false, total: 6 }))), isMineCall);
    assert.deepEqual([st().loading, allCards(st().data).length, st().sel.key, st().detail], [false, 6, late, true], `${how}: the new read, the card still chosen`);
  }
});

test("UI: a board whose later page fails shows what it showed before the read, not its first page", async () => {
  const at = Date.now() - MIN;
  const { host, st } = await bootBoard({ raw: { "board:data:mine": savedFor("mine", savedBoard(), at) } });
  await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1"))), isBoardCall);
  assert.equal(allCards(st().data).length, 3);
  await host.answer("gh", { code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" }, isBoardCall);
  assert.deepEqual([allCards(st().data).some((c) => c.title === "Gespeicherter Titel"), st().saved, st().error], [true, true, "GitHub antwortete mit HTTP 502: Bad Gateway"]);
});

test("UI: a board whose later page fails selects again in what it showed before: a card there, or none where it showed nothing, the choice and the details gone", async () => {
  const saved = savedBoard();
  const first = new Set(allCards(board.parseGithubBoard(boardPage(0, 3, "c1"), githubView(), HIDDEN)).map((c) => c.key));
  for (const c of saved.columns) c.cards = c.cards.filter((card) => !first.has(card.key));
  const fail = { code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" };
  const over = await bootBoard({ raw: { "board:data:mine": savedFor("mine", saved, Date.now() - MIN) } });
  await over.host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1"))), isBoardCall);
  assert.ok(first.has(over.st().sel.key), "the first page's card selected");
  await over.host.answer("gh", fail, isBoardCall);
  const { sel } = over.st();
  assert.equal(over.b.navColumns(over.b.view())[sel.col]?.shown.some((c) => c.key === sel.key), true, `a card of the saved state, in its column: ${JSON.stringify(sel)}`);
  const { b, cx, host, st } = await bootBoard();
  await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1"))), isBoardCall);
  const key = allCards(st().data)[1].key;
  b.choose(b.view(), { col: board.columnOf(b.navColumns(b.view()), key), key }, cx);
  st().detail = true;
  await host.answer("gh", fail, isBoardCall);
  assert.deepEqual([st().data, st().sel, st().picked, st().detail], [null, null, null, false]);
});

test("UI: what a load draws on its way counts only while it runs: a late part or page after its end changes nothing, the late part is not even built", async () => {
  const { b, cx, host, st } = await bootBoard();
  await host.answer("gh", ok(fixture("github-board.json")));
  const loader = b.sources.github.views.board;
  let live = null;
  loader.load = async (view, options) => {
    live = options.live;
    return { data: board.parseGithubBoard(json("github-board.json"), view, options.hiddenFor(view)), warnings: [] };
  };
  await press(b, cx, "3");
  const other = b.state("other");
  assert.deepEqual([other.loading, other.data.shape], [false, "board"]);
  const drawn = other.data;
  let built = 0;
  live.partial(() => (built++, { data: savedBoard(), warnings: ["spät"] }));
  live.page(2, 3);
  assert.deepEqual([other.data, other.warnings.includes("spät"), other.progress, built], [drawn, false, null, 0]);
  assert.ok(st().data);
});

test("UI: a load builds what it would draw on its way only where that is drawn: over nothing, not over data this session read", async () => {
  const { b, cx, host } = await bootBoard();
  await host.answer("gh", ok(fixture("github-board.json")));
  const loader = b.sources.github.views.board;
  let [loads, built] = [0, 0];
  loader.load = async (view, options) => {
    loads++;
    const result = () => ({ data: board.parseGithubBoard(json("github-board.json"), view, options.hiddenFor(view)), warnings: [] });
    options.live.partial(() => (built++, result()));
    return result();
  };
  await press(b, cx, "3");
  assert.deepEqual([loads, built, b.state("other").loading], [1, 1, false], "over nothing");
  await press(b, cx, "r");
  assert.deepEqual([loads, built, b.state("other").loading], [2, 1, false], "over this session's read");
});

test("UI: a saved entry that fails to draw leaves the view's state as it was before: one that fails once the selection moved, a Sprint's that dropped the chosen sprint", async () => {
  const sprintId = "azure:team:Example Project/Example Team:sprint";
  const other = board.parseGithubBoard(json("github-board.json"), testView("other"), board.hiddenColumns(testView("other"), null));
  for (const [id, entry] of [["other", other], [sprintId, { shape: "sprint", meta: { gone: { id: "s", name: "S" } } }]]) {
    logged.length = 0;
    const { b, cx } = await bootBoard({ raw: { [board.savedKey(id)]: savedFor(id, entry, Date.now() - MIN) } });
    const st = b.state(id);
    const before = { warnings: ["vorher"], at: 7, sel: { col: 0, key: "k" }, picked: "k", detail: true, sprint: { id: "s", name: "S" } };
    Object.assign(st, before);
    if (id === "other") b.scrollToSelection = () => { throw new Error("kein Platz"); };
    await cx.fire();
    assert.ok(logged.some((l) => l.startsWith(`board: ${board.savedKey(id)} dropped: `)), logged.join("\n"));
    assert.deepEqual([st.data, st.saved, st.warnings, st.at, st.sel, st.picked, st.detail, st.sprint],
      [null, false, before.warnings, before.at, before.sel, before.picked, before.detail, before.sprint], id);
  }
});

test("a pull request whose more threads are still to come is pending: no „mehr als“ unread, never „bereit zum Mergen“ nor „wartet auf Autor“ before them", () => {
  const data = json("github-list-attention.json");
  const view = shippedListView();
  const row = (list, n) => list.sections.flatMap((x) => x.rows).find((r) => r.number === n);
  const plain = attentionList(data);
  assert.ok(row(plain, 201).attention.includes("bereit zum Mergen"));
  const waits = plain.sections.flatMap((x) => x.rows).find((r) => r.waiting);
  attentionPr(data, 201).reviewThreads.totalCount = 12;
  attentionPr(data, waits.number).reviewThreads.totalCount = 12;
  const pending = board.parseGithubList(data, view, [], { pending: new Set(["PR_sample201", waits.key]) });
  assert.deepEqual([row(pending, 201).attention, row(pending, 201).unread, row(pending, 201).threadsPending], [[], [], true]);
  assert.deepEqual([row(pending, waits.number).waiting, row(pending, waits.number).threadsPending], [false, true]);
  assert.deepEqual(row(board.parseGithubList(data, view), 201).unread, [UNREAD.moreThreads(1)], "without the follow-up to come: unread");
  assert.equal(row(pending, 101).threadsPending, undefined, "a row that waits for none carries no mark");
});

test("UI: the PR list draws before its follow-up for more threads, with its warnings, the rows that wait for it with „…“, not „?“, and their details say so; the follow-up fills them in, and one that fails marks them „?“", async () => {
  for (const [what, answer, mark, idle] of [
    ["the follow-up", (nodes) => ok(JSON.stringify({ data: { nodes } })), "● neue Commits seit deinem Review · Antwort erwartet", "wartet auf Autor"],
    ["a failed follow-up", () => ({ code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" }), "● neue Commits seit deinem Review · ?", "? nicht ganz gelesen"],
  ]) {
    const { b, cx, host } = await bootBoard({ config: shippedConfig(), stored: { source: "github", "tab:github": "github:prs" } });
    const data = json("github-list-attention.json");
    const node = cutThreads(data, 102, 12, [...resolvedThreads(11), waitingThread]);
    const resolved = cutThreads(data, 301, 12, resolvedThreads(12));
    attentionPr(data, 302).reviewThreads.totalCount = attentionPr(data, 302).reviewThreads.nodes.length;
    data.errors = [{ message: "Ein Fehler abseits der Zeilen", path: ["elsewhere"] }];
    await host.answer("gh", ok(JSON.stringify(data)), isListCall);
    const cell = (id, start) => texts(byId(b.render(), `row-${id}`)).find((x) => x.startsWith(start));
    assert.equal(cell(node.id, "●"), "● neue Commits seit deinem Review · …", `${what}: drawn before it`);
    assert.equal(cell(resolved.id, "…"), board.THREADS_PENDING, `${what}: a row with nothing to do waits too`);
    assert.equal(b.state("prs").loading, true);
    assert.ok(texts(byId(b.render(), "row-PR_sample101")).length, "the other rows too");
    assert.ok(texts(b.render()).includes("Ein Fehler abseits der Zeilen"), `${what}: the list's warnings before it`);
    await click(b, cx, `row-${resolved.id}`);
    await click(b, cx, `row-${resolved.id}`);
    assert.deepEqual(texts(byId(detailPanel(b), "pending-note")), ["Review-Threads werden noch gelesen …"]);
    await host.answer("gh", answer([node, resolved]), isThreadsCall);
    assert.equal(cell(node.id, "●"), mark, what);
    assert.equal(cell(resolved.id, idle.slice(0, 1)), idle, what);
    assert.equal(byId(detailPanel(b), "pending-note"), null, `${what}: the details no longer wait`);
    assert.ok(texts(b.render()).includes("Ein Fehler abseits der Zeilen"), `${what}: and after it`);
  }
});

test("UI: the PR list asks gh for the login it runs as before its first request, and reads that login's reviews; later reads go by the login the last answer named; where gh names none or the question fails, it reads anyone's reviews and asks again while it does not know the login", async () => {
  const opened = (viewerAnswer) => bootBoard({ config: shippedConfig(), stored: { source: "github", "tab:github": "github:prs" }, viewerAnswer });
  const sent = (host) => host.open("gh").find((c) => isListCall(c.args)).args.find((a) => a.startsWith("login=")) ?? null;
  const { b, cx, host } = await opened();
  assert.deepEqual([host.viewerAsks, sent(host)], [1, "login=sample-user"], "asked before the list's request");
  const data = json("github-list-attention.json");
  data.data.viewer.login = "sample-other";
  await host.answer("gh", ok(JSON.stringify(data)), isListCall);
  const rowOf = (n) => b.state("prs").data.sections.flatMap((s) => s.rows).find((r) => r.number === n);
  assert.deepEqual(rowOf(301).unread, [UNREAD.reviews], "an answer for another login: the reviews are not its");
  assert.deepEqual(rowOf(101).unread, [UNREAD.reviews], "nor where they are none");
  b.refresh(b.view(), cx);
  await settle();
  assert.deepEqual([host.viewerAsks, sent(host)], [1, "login=sample-other"], "the login the answer named, not asked again");
  const unnamed = await opened(ok(JSON.stringify({ data: { viewer: null } })));
  assert.deepEqual([unnamed.host.viewerAsks, sent(unnamed.host)], [1, null], "none named: no login sent");
  await unnamed.host.answer("gh", ok(fixture("github-list-attention.json")), isListCall);
  unnamed.b.refresh(unnamed.b.view(), unnamed.cx);
  await settle();
  assert.deepEqual([unnamed.host.viewerAsks, sent(unnamed.host)], [1, "login=sample-user"], "the list's answer named it");
  const failed = await opened({ code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" });
  assert.deepEqual([failed.host.viewerAsks, sent(failed.host)], [1, null], "a failed question: the read goes on without a login");
  const nameless = json("github-list-attention.json");
  nameless.data.viewer = null;
  await failed.host.answer("gh", ok(JSON.stringify(nameless)), isListCall);
  assert.equal(failed.b.state("prs").error ?? null, null);
  failed.b.refresh(failed.b.view(), failed.cx);
  await settle();
  assert.deepEqual([failed.host.viewerAsks, sent(failed.host)], [2, null], "still unknown: asked again");
  await failed.host.answer("gh", ok(fixture("github-list-attention.json")), isListCall);
  failed.b.refresh(failed.b.view(), failed.cx);
  await settle();
  assert.deepEqual([failed.host.viewerAsks, sent(failed.host)], [2, "login=sample-user"], "the list's answer named it");
});

test("the prefetch's order: not the shown view, none without a loader, loading, unavailable or tried within refreshMinutes; the shown source's first, then the oldest data, never read first", () => {
  const views = [
    { id: "a", source: "github" }, { id: "b", source: "github" }, { id: "c", source: "azure" }, { id: "d", source: "github" },
    { id: "e", source: "github" }, { id: "f", source: "github" }, { id: "g", source: "azure" }, { id: "h", source: "github" },
  ];
  const states = {
    a: { at: 0, tried: 0 }, b: { at: 50, tried: 50 }, c: { at: 0, tried: 0 }, d: { at: 10, tried: 10 },
    e: { at: 0, tried: 0, loading: true }, f: { at: 0, tried: 0, unavailable: true }, g: { at: 5, tried: 95 }, h: { at: 0, tried: 0 },
  };
  const order = board.prefetchOrder(views, { shown: { id: "a" }, source: "github", now: 100, every: 30, stateOf: (id) => states[id], loads: (v) => v.id !== "h" });
  assert.deepEqual(order.map((v) => v.id), ["d", "b", "c"]);
  assert.deepEqual([board.refreshDue({ tried: 70 }, 100, 30), board.refreshDue({ tried: 71 }, 100, 30)], [true, false]);
});

test("UI: once the shown view is read, the prefetch reads each other view once, one at a time, the shown source's first; az that is not installed is not asked again; after that only the shown view refreshes, until r reads each other view once more, Azure's too", async () => {
  const { b, cx, host } = await bootBoard();
  await cx.fire();
  assert.equal(host.open("gh").length, 1, "nothing before the shown view is read");
  await host.answer("gh", ok(fixture("github-board.json")));
  await cx.fire();
  assert.deepEqual(host.open("gh").map((c) => isListCall(c.args)), [true], "the PR list, alone");
  await host.answer("gh", ok(fixture("github-list.json")), isListCall);
  assert.equal(b.state("prs").data.shape, "prs");
  await cx.fire();
  assert.deepEqual(host.open("gh").map((c) => isOtherCall(c.args)), [true], "then the other board");
  await host.answer("gh", ok(fixture("github-board.json")), isOtherCall);
  const asked = () => host.asked.filter((a) => a.tool === "az").length;
  await cx.fire();
  await cx.fire();
  const sprint = b.state("azure:team:Example Project/Example Team:sprint");
  const backlog = b.state("azure:team:Example Project/Example Team:backlog");
  assert.deepEqual([sprint.error, sprint.unavailable, backlog.unavailable, asked()], ["az ist nicht installiert", true, true, 2], "then Azure's, which say why");
  await cx.fire();
  assert.deepEqual([host.open("gh").length, asked()], [0, 2], "nothing left to read");
  for (let n = 0; n < 2; n++) {
    advance(3 * MIN);
    await cx.tick();
    assert.deepEqual(host.open("gh").map((c) => isMineCall(c.args)), [true], "the shown view, every refreshMinutes");
    await host.answer("gh", ok(fixture("github-board.json")));
    await cx.tick();
    await cx.fire();
    assert.deepEqual([host.open("gh").length, asked()], [0, 2], "the others not again");
  }
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-board.json")), isMineCall);
  await cx.fire();
  assert.deepEqual(host.open("gh").map((c) => isListCall(c.args)), [true], "r: the others once more");
  await host.answer("gh", ok(fixture("github-list.json")), isListCall);
  await cx.fire();
  assert.deepEqual(host.open("gh").map((c) => isOtherCall(c.args)), [true]);
  await host.answer("gh", ok(fixture("github-board.json")), isOtherCall);
  await cx.fire();
  await cx.fire();
  await cx.fire();
  assert.deepEqual([host.open("gh").length, asked(), sprint.unavailable, backlog.unavailable], [0, 4, true, true], "Azure's asked again, as az may be there now");
  advance(3 * MIN);
  await press(b, cx, "2");
  assert.deepEqual([ageOf(b.render()), host.open("gh").map((c) => isListCall(c.args))], ["Stand vor 3 min", [true]], "a tab shown later: its last state and its age, read behind them");
});

test("UI: the prefetch yields to a read the person starts: r reads beside the one under way and the next waits for both; a switch to the view it reads shows that read, no second", async () => {
  const { b, cx, host } = await bootBoard();
  await host.answer("gh", ok(fixture("github-board.json")));
  await cx.fire();
  assert.deepEqual(host.open("gh").map((c) => isListCall(c.args)), [true]);
  await press(b, cx, "r");
  assert.equal(host.open("gh").length, 2, "r reads at once");
  await host.answer("gh", ok(fixture("github-list.json")), isListCall);
  await cx.fire();
  assert.equal(host.open("gh").length, 1, "the next prefetch waits for r's read");
  await host.answer("gh", ok(fixture("github-board.json")));
  await cx.fire();
  assert.deepEqual(host.open("gh").map((c) => isOtherCall(c.args)), [true], "then it goes on");
  await press(b, cx, "3");
  assert.equal(host.open("gh").length, 1, "the switch reads nothing more");
  assert.ok(byId(b.render(), "loading"), "and shows that read under way");
  await host.answer("gh", ok(fixture("github-board.json")), isOtherCall);
  assert.equal(b.state("other").data.shape, "board");
  await cx.fire();
  assert.equal(host.open("gh").length, 0);
});

test("UI: on a start over a tab that reads nothing yet the prefetch begins at once", async () => {
  const { cx, host } = await bootBoard({ stored: { source: "azure", "tab:azure": "azure:prs:Example Project" } });
  const asked = () => host.asked.filter((a) => a.tool === "az").length;
  assert.deepEqual([host.open("gh").length, asked()], [0, 0], "nothing for the shown tab");
  await cx.fire();
  assert.equal(asked(), 1, "the shown source's Sprint first");
});

test("UI: the prefetch waits while a write runs, a dialog is busy or the board does not show, and goes on after", async () => {
  const { b, cx, host } = await bootBoard();
  await host.answer("gh", ok(fixture("github-board.json")));
  await press(b, cx, "l", shiftL);
  const moving = host.open("gh");
  assert.equal(moving.length, 1, "the move");
  await cx.fire();
  assert.equal(host.open("gh").length, 1, "no prefetch beside it");
  await host.answer("gh", confirmed(moving[0].args.find((a) => a.startsWith("item="))?.slice(5)));
  b.modal = { kind: "start", busy: "Sitzung wird geöffnet …" };
  await cx.tick();
  await cx.fire();
  assert.equal(host.open("gh").length, 0, "none while a dialog is busy");
  b.modal = null;
  await cx.tick();
  const panes = host.panes;
  host.panes = () => [];
  await cx.fire();
  await cx.tick();
  await cx.fire();
  assert.equal(host.open("gh").length, 0, "none while the board does not show");
  host.panes = panes;
  await cx.tick();
  await cx.fire();
  assert.deepEqual(host.open("gh").map((c) => isListCall(c.args)), [true]);
});

test("UI: a board that shows again goes on with the prefetch at the look that sees it, not at the next tick", async () => {
  const { cx, host } = await bootBoard();
  await host.answer("gh", ok(fixture("github-board.json")));
  const panes = host.panes;
  host.panes = () => [];
  await cx.look();
  await cx.fire();
  assert.equal(host.open("gh").length, 0, "none while the board does not show");
  host.panes = panes;
  await cx.look();
  assert.deepEqual(host.open("gh").map((c) => isListCall(c.args)), [true], "the PR list, once it shows");
});

test("UI: a view read or restored in the background scrolls none of the shown view's lists: its own first selection is set, no column of the shown board and not the PR list's rows scroll", async () => {
  const list = board.parseGithubList(json("github-list.json"), testView("prs"));
  const { b, cx, host } = await bootBoard({ raw: { "board:data:prs": savedFor("prs", list, Date.now() - 20 * MIN) } });
  await host.answer("gh", ok(fixture("github-board.json")));
  b.render();
  for (const c of b.navColumns(b.view())) Object.assign(board.keptOf(b, c.id).scroll, { y: 150, width: 300, height: 200, content: 2000 });
  host.scrolled.splice(0);
  await cx.fire();
  assert.ok(b.state("prs").sel?.key, "the PR list's saved state, its first row selected");
  await host.answer("gh", ok(fixture("github-board.json")), isOtherCall);
  assert.ok(b.state("other").sel?.key, "the other board read, its first card selected");
  await cx.fire();
  await host.answer("gh", ok(fixture("github-list.json")), isListCall);
  assert.equal(b.state("prs").saved, false, "the PR list read");
  assert.deepEqual(host.scrolled, [], "no list scrolled");
});

test("UI: each tab shows the age of what it draws: two saved tabs their own, a prefetched one its read's, and a new board the saved ones'", async () => {
  const { b, cx, host } = await bootBoard({ raw: {
    "board:data:mine": savedFor("mine", savedBoard(), Date.now() - 10 * MIN), "board:data:prs": savedFor("prs", board.parseGithubList(json("github-list.json"), testView("prs")), Date.now() - 20 * MIN),
  } });
  assert.equal(ageOf(b.render()), "Stand vor 10 min");
  await cx.fire();
  assert.deepEqual(texts(byId(b.render(), "tab-github:prs")).at(-1), "4", "a saved tab's count");
  await press(b, cx, "2");
  assert.deepEqual([ageOf(b.render()), readingOf(b.render())], ["Stand vor 20 min", "lädt …"], "at once, while its read runs");
  await press(b, cx, "1");
  await host.answer("gh", ok(fixture("github-board.json")), isMineCall);
  await host.answer("gh", ok(fixture("github-list.json")), isListCall);
  await cx.fire();
  await host.answer("gh", ok(fixture("github-board.json")), isOtherCall);
  advance(2 * MIN);
  await press(b, cx, "3");
  assert.deepEqual([ageOf(b.render()), host.open("gh").length], ["Stand vor 2 min", 0], "the prefetched tab: its read's age, no read again");
  await press(b, cx, "1");
  assert.equal(ageOf(b.render()), "Stand vor 2 min");
  await cx.fire();
  const again = new board.default();
  again.init({}, fakeCx());
  await settle();
  advance(MIN);
  assert.deepEqual([again.state("mine").saved, ageOf(again.render())], [true, "Stand vor 3 min"], "after a restart: the saved read's age");
});

test("UI: the Azure Sprint asks for the taskboard once the sprint is known and the query once its areas and the backlog's order field are too, in any order of answers; it draws before its parents outside it and the team's settings beside them", async () => {
  const datas = [];
  for (const order of [["iteration", "areas", "columns", "types", "config"], ["config", "types", "columns", "areas", "iteration"], ["iteration", "areas", "types", "columns", "config"]]) {
    const { b, host } = await bootBoard({ stored: { source: "azure" }, which: found });
    assert.deepEqual(openCounts(host, [...SETTINGS, "config", "me"]), [1, 1, 1, 1, 1, 1]);
    const answers = {
      iteration: iterationAnswer(), areas: fixture("azure-sprint-areas.json"), columns: fixture("azure-sprint-columns.json"), types: fixture("azure-sprint-types.json"),
      config: fixture("azure-backlog-config.json"),
    };
    const seen = [];
    for (const kind of order) {
      await host.answer("az", ok(answers[kind]), AZ[kind]);
      seen.push([kind, openAz(host, "places").length, openAz(host, "query").length]);
    }
    const [iterationAt, areasAt, configAt] = ["iteration", "areas", "config"].map((k) => order.indexOf(k));
    assert.deepEqual(seen.map(([, places]) => places), order.map((_, i) => Number(i >= iterationAt)), `${order}: the taskboard once the sprint is known`);
    assert.deepEqual(seen.map(([, , query]) => query), order.map((_, i) => Number(i >= Math.max(iterationAt, areasAt, configAt))), `${order}: the query once its areas and order field are known too`);
    const st = b.state(b.view().id);
    await host.answer("az", ok(fixture("azure-sprint-taskboard.json")), AZ.places);
    await host.answer("az", ok(fixture("azure-sprint-items.json")), AZ.query);
    await host.answer("az", ok(fixture("azure-sprint-account.json")), AZ.me);
    assert.deepEqual(openCounts(host, ["parents", "teamSettings"]), [1, 1], "its parents outside it under way, the team's settings beside them");
    const titles = () => board.sprintItems(st.data).filter((i) => Number.isInteger(i.parent)).map((i) => i.parentTitle);
    assert.deepEqual([st.loading, st.data.shape, titles().includes(null), board.findCard(st.data, "AB#331").card.row], [true, "sprint", true, "none"],
      "drawn before them, a task under one of them in „Ohne Story“ meanwhile: nothing drew before");
    await host.answer("az", ok(fixture("azure-sprint-parents.json")), AZ.parents);
    assert.equal(st.loading, true, "the team's settings still under way");
    await host.answer("az", ok(fixture("azure-backlog-settings.json")), AZ.teamSettings);
    assert.deepEqual([st.loading, titles().includes(null), board.findCard(st.data, "AB#331").card.row], [false, false, "AB#299"]);
    datas.push(st.data);
  }
  assert.deepEqual(datas[0], datas[1], "the same sprint either way");
});

test("UI: after a restart the Sprint draws its saved state, and what it draws before its parents' query keeps their rows as the saved state drew them", async () => {
  const { st: first, view } = await openSprint();
  assert.ok(first().data.rows.some((r) => r.key === "AB#299"), "read with the parent's row");
  const saved = board.savedText(view, board.hiddenColumns(view, null), { data: first().data, warnings: [] }, Date.now() - MIN);
  const { b, host } = await bootBoard({ stored: { source: "azure" }, which: found, raw: { [board.savedKey(view.id)]: saved } });
  const st = () => b.state(b.view().id);
  assert.deepEqual([st().saved, board.findCard(st().data, "AB#331").card.row], [true, "AB#299"], "the saved state");
  await answerSettings(host);
  const items = json("azure-sprint-items.json");
  items.find((wi) => wi.id === 331).fields["System.Title"] = "Clean up the exports, read again";
  await host.answer("az", ok(fixture("azure-sprint-taskboard.json")), AZ.places);
  await host.answer("az", ok(JSON.stringify(items)), AZ.query);
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZ.me);
  assert.equal(openAz(host, "parents").length, 1, "its parents' query under way");
  const task = () => board.findCard(st().data, "AB#331").card;
  const leftover = st().data.rows.find((r) => r.key === "AB#299")?.story;
  assert.deepEqual([st().loading, task().title, task().row, leftover?.sprint], [true, "Clean up the exports, read again", "AB#299", "Sprint 11"],
    "drawn in steps, the task in its parent's row as drawn last");
  assert.equal(drawnRows(b.render()).includes("row-AB#299"), true);
  await host.answer("az", ok(fixture("azure-sprint-parents.json")), AZ.parents);
  await host.answer("az", ok(fixture("azure-backlog-settings.json")), AZ.teamSettings);
  assert.deepEqual([st().loading, st().saved, task().row], [false, false, "AB#299"]);
});

test("UI: the Azure Backlog asks for the level's ids once its levels came and for their fields once its configuration came too; the rows draw before the types' colors", async () => {
  const { b, host } = await bootBoard({ stored: BACKLOG_STORED, which: found });
  assert.deepEqual(backlogCounts(host, [...BACKLOG_SETTINGS, "types", "me", "ids"]), [1, 1, 1, 1, 1, 1, 0]);
  await host.answer("az", ok(fixture("azure-backlog-levels.json")), AZB.levels);
  assert.deepEqual(backlogCounts(host, ["config", "settings", "areas", "ids"]), [1, 1, 1, 1], "the ids beside the rest of the settings");
  await host.answer("az", ok(fixture("azure-backlog-ids.json")), AZB.ids);
  assert.equal(openAzb(host, "query").length, 0, "the fields wait for the order field");
  await host.answer("az", ok(fixture("azure-backlog-config.json")), AZB.config);
  assert.equal(openAzb(host, "query").length, 1);
  await host.answer("az", ok(fixture("azure-backlog-settings.json")), AZB.settings);
  await host.answer("az", ok(fixture("azure-sprint-areas.json")), AZB.areas);
  await host.answer("az", ok(fixture("azure-backlog-items.json")), AZB.query);
  await host.answer("az", ok(fixture("azure-sprint-account.json")), AZB.me);
  const st = b.state(b.view().id);
  assert.deepEqual([st.loading, st.data.shape, st.data.rows.length > 0, st.data.meta.typeColors], [true, "backlog", true, {}], "drawn without the colors");
  await host.answer("az", ok(fixture("azure-sprint-types.json")), AZB.types);
  assert.deepEqual([st.loading, Object.keys(st.data.meta.typeColors).length > 0], [false, true]);
  assert.deepEqual(st.data.meta.typeColors, board.parseAzureTypes(fixture("azure-sprint-types.json")).colors);
  assert.deepEqual({ ...st.data, meta: { ...st.data.meta, typeColors: {} } }, backlogData(), "as one read in a row makes it");
});

test("each gh, az and sh run logs one line: what it ran for, its view and how long it took, how it ended; no argument, so no query text and no token; finding gh and az too", async () => {
  logged.length = 0;
  const { host } = await bootBoard();
  assert.match(logged[0], /^board: sh which-gh \d+ ms ok view=-$/, "finding gh first");
  logged.length = 0;
  advance(1234);
  await host.answer("gh", ok(JSON.stringify(boardPage(0, 3, "c1"))), isBoardCall);
  await host.answer("gh", { code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" }, isBoardCall);
  const ms = (line) => Number(line.match(/ (\d+) ms /)[1]);
  assert.match(logged[0], /^board: gh board-page-1 \d+ ms ok view=mine$/);
  assert.ok(ms(logged[0]) >= 1234 && ms(logged[0]) < 1234 + 5000, logged[0]);
  assert.match(logged[1], /^board: gh board-page-2 \d+ ms exit 1 view=mine$/);
  const { host: az } = await bootBoard({ stored: { source: "azure" }, which: found });
  await az.answer("az", new Error("boom"), AZ.iteration);
  await az.answer("az", ok(fixture("azure-sprint-areas.json")), AZ.areas);
  assert.ok(logged.includes(`board: az iteration ${ms(logged.find((l) => l.includes(" iteration ")))} ms failed view=azure:team:Example Project/Example Team:sprint`));
  assert.ok(logged.some((l) => /^board: az areas \d+ ms ok view=azure:team:Example Project\/Example Team:sprint$/.test(l)));
  assert.ok(logged.some((l) => /^board: sh which-az \d+ ms ok view=-$/.test(l)), logged.join("\n"));
  for (const line of logged) assert.match(line, /^board: (gh|az|sh) [a-z0-9-]+ \d+ ms (ok|exit \d+|failed) view=[^{}\n]+$/, line);
  assert.equal(board.callLine("gh", undefined, 3, "ok"), "board: gh call 3 ms ok view=-");
});

test("UI: „Lädt …“ in an empty view has a spinner before it; the ↻ turns while a read of the shown view runs, also over data, not for a prefetch of another view", async () => {
  const { b, cx, host } = await bootBoard();
  let root = b.render();
  const loading = byId(root, "loading");
  assert.deepEqual(loading.kids[0].with.frames, [["◐", "◓", "◑", "◒"], 150]);
  assert.equal(loading.kids[1], "Lädt …");
  assert.deepEqual([refreshSpins(root), byId(root, "refresh").kids[0].with.path[0]], [true, "mods/board/refresh.svg"]);
  assert.equal(byId(root, "age"), null, "a view never read names no age");
  await host.answer("gh", ok(fixture("github-board.json")));
  root = b.render();
  assert.deepEqual([byId(root, "loading"), refreshSpins(root)], [null, false]);
  await cx.fire();
  assert.equal(host.open("gh").length, 1, "a prefetch runs");
  assert.equal(refreshSpins(b.render()), false, "it is not the shown view's");
  await host.answer("gh", ok(fixture("github-list.json")), isListCall);
  advance(3 * MIN);
  await cx.tick();
  root = b.render();
  assert.deepEqual([refreshSpins(root), Boolean(byId(root, "columns"))], [true, true], "a refresh over the data drawn");
  assert.match(readFileSync(join(modDir, "refresh.svg"), "utf8"), /^<svg [^>]*stroke="currentColor"/, "tinted with the text color");
});

test("UI: the create dialog on a Backlog that shows its saved state stays open with its title and says it is refused; while the read runs nothing more is read, after a failed one it starts again", async () => {
  const id = "azure:team:Example Project/Example Team:backlog";
  const { b, cx, host } = await bootBoard({ stored: BACKLOG_STORED, which: found, raw: { [`board:data:${id}`]: savedFor(id, backlogData(), Date.now() - MIN) } });
  assert.equal(b.state(id).saved, true);
  await press(b, cx, "n");
  b.modal.input.set_value("Sample new story");
  await click(b, cx, "create-go");
  assert.deepEqual([b.modal?.kind, b.modal?.error, b.modal?.input.value()], ["create", board.SAVED_WRITE, "Sample new story"]);
  assert.deepEqual([openAzb(host, "create").length, openAzb(host, "levels").length], [0, 1], "no create, the one read under way");
  await host.answer("az", { code: 1, stdout: "", stderr: "ERROR: boom" }, AZB.levels);
  assert.deepEqual([b.state(id).loading, b.state(id).saved, openAzb(host, "levels").length], [false, true, 0], "the read failed");
  await click(b, cx, "create-go");
  assert.deepEqual([b.modal?.error, openAzb(host, "create").length, openAzb(host, "levels").length], [board.SAVED_WRITE, 0, 1], "the read again, still no create");
});
