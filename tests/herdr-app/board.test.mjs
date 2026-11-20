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
//   is gone (null) and an issue whose author is gone (null);
// - written from az's documentation (`az devops invoke` for work item
//   types), not recorded: azure-types.json;
// - written in the shapes az prints for the Sprint view's calls (the REST
//   reference at api-version 7.1 and the azure-devops extension's models),
//   with made-up names, not recorded: azure-sprint-iteration.json (az
//   boards iteration team list --timeframe current),
//   azure-sprint-areas.json (az boards area team list),
//   azure-sprint-columns.json (taskboardColumns), azure-sprint-types.json
//   (workitemtypes), azure-sprint-taskboard.json (taskboardWorkItems, with
//   one work item the query does not find), azure-sprint-items.json (az
//   boards query) and azure-sprint-account.json (az account show --query
//   user).

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
    { shape: "sprint" }, { text: "Backlog folgt" }, { text: "PR-Ansicht folgt" }, { shape: "board" },
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
  assert.deepEqual([board.isMine(pr, "sample-user"), board.isMine(pr, "other"), board.isMine({ assignees: ["x"] }, "x"), board.isMine({}, "x")], [true, false, true, false]);
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
  assert.match(args.find((a) => a.startsWith("query=")), /assignees\(first: 10\) \{ nodes \{ login \} \}\s+reviewRequests\(first: 20\) \{ nodes \{ requestedReviewer \{ \.\.\. on User \{ login \} \} \} \}/,
    "and each pull request's assignees and the people asked to review it");
});

test("PR sections hold their rows once, with checks, review state and branch", () => {
  const list = board.parseGithubList(json("github-list.json"), listView());
  assert.deepEqual(list.sections.map((s) => [s.name, s.count, s.rows.map((r) => r.number)]), [["Review", 1, [2820]], ["Mine", 4, [1921, 808, 77]]]);
  assert.deepEqual(list.sections.flatMap((s) => s.rows.map((r) => [r.number, r.assignees, r.reviewers])), [
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
// children; when(cond, fn) applies fn when cond holds.
function element(kind) {
  const el = { kind, styles: [], with: {}, calls: [], kids: [] };
  const proxy = new Proxy(el, {
    get(target, p) {
      if (p in target) return target[p];
      return (...args) => {
        if (p === "child") target.kids.push(args[0]);
        else if (p === "children") target.kids.push(...args[0]);
        else if (p === "when") return args[0] ? args[1](proxy) : proxy;
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

// A fake cx; its timers run when a test calls fire(), tick() or look().
function fakeCx() {
  const cx = {
    later: [],
    every: [],
    // A handle that knows whether it has the keyboard: from its focus()
    // until a test says otherwise (handle.held = false).
    // The board's handle, one of the host's handles: its focus() takes the
    // keyboard from the others and from every input.
    focus_handle: () => {
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
    },
    spawn: (fn) => Promise.resolve().then(() => fn(cx)),
    timer: {
      after: (ms, fn) => cx.later.push(fn),
      every: (ms, fn) => cx.every.push(Object.assign(fn, { ms })),
    },
    notify() {},
    stopped: 0,
    stop_propagation() {
      cx.stopped++;
    },
    open_url(url) {
      (cx.opened ??= []).push(url);
    },
    async fire() {
      for (const fn of cx.later.splice(0)) fn(cx);
      await settle();
    },
    async tick() {
      for (const fn of cx.every) fn(cx);
      await settle();
    },
    // One look of the copy's WATCH_MS timer, then what it queued.
    async look() {
      for (const fn of cx.every.filter((f) => f.ms === board.WATCH_MS)) fn(cx);
      for (const fn of cx.later.splice(0)) fn(cx);
      await settle();
    },
  };
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
  const cx = fakeCx();
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
  b.key(key(k, extra), cx);
  await settle();
}
const shiftL = { char: "L", modifiers: { shift: true } };
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

test("UI: x on the column without status does nothing", async () => {
  const { b, cx, st, host } = await openBoard({ answer: fixture("github-board-cases.json") });
  st().sel = { col: 0, key: null };
  await press(b, cx, "x");
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

const ALL_HIDDEN = "Alle Spalten sind ausgeblendet: ein Name oben oder X zeigt eine wieder";

test("UI: with every column hidden the board says how to show one", async () => {
  const { b, cx, st } = await openBoard({ config: testConfig({ hide: ["Backlog", "Ready", "In progress", "In review", "Done"] }) });
  assert.deepEqual(st().sel, { col: 0, key: null });
  assert.equal(byId(b.render(), "columns"), null);
  assert.ok(texts(b.render()).includes(ALL_HIDDEN));
  await press(b, cx, "l");
  await press(b, cx, "enter");
  assert.equal(st().detail, false);
});

test("UI: x hides the selected column; the selection goes to the column taking its place", async () => {
  const { b, cx, st, host } = await openBoard();
  st().sel = { col: 1, key: "PVTI_rec1" };
  await press(b, cx, "x");
  assert.deepEqual(b.navColumns(b.view()).map((c) => c.name), ["Ready", "In review"]);
  assert.deepEqual(texts(byId(b.render(), "hidden-columns")), ["ausgeblendet:", "Backlog", "In progress", "Done"]);
  assert.deepEqual(st().sel, { col: 1, key: null }, "In review, empty");
  assert.ok(host.open("gh").at(-1).args.includes('filter=assignee:@me -status:"Backlog","Done","In progress"'), "the refresh leaves it out");
  await host.answer("gh", ok(fixture("github-board.json")));
  await press(b, cx, "x");
  assert.deepEqual(b.navColumns(b.view()).map((c) => c.name), ["Ready"]);
  assert.deepEqual(st().sel, { col: 0, key: "PVTI_rec4" }, "the last column hidden: the one before it, on the card in the same row");
  assert.ok(byId(b.render(), "col-0"), "one column shown is drawn");
  assert.equal(texts(b.render()).includes(ALL_HIDDEN), false);
  await click(b, cx, "show-opt-backlog");
  assert.deepEqual(st().sel, { col: 1, key: "PVTI_rec4" }, "a column shown before the selected one keeps the selection on its card");
  await press(b, cx, "x");
  assert.deepEqual([b.navColumns(b.view()).map((c) => c.name), st().sel], [["Backlog"], { col: 0, key: null }]);
  await press(b, cx, "x");
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

test("UI: X opens the column menu: every column, shown or hidden; Enter, a digit or a click hides or shows one, and it stays open until Esc", async () => {
  const { b, cx, st, host } = await openBoard();
  await press(b, cx, "x", { char: "X", modifiers: { shift: true } });
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
  await press(b, cx, "x");
  assert.equal(st().hidden.has("In progress"), true, "x still hides the selected column");
});

test("UI: the column menu says the column without status is always shown, and leaves it so", async () => {
  const { b, cx, st } = await openBoard({ answer: fixture("github-board-cases.json") });
  // Shift-x whose character comes without the shift.
  await press(b, cx, "x", { modifiers: { shift: true } });
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
  el.with.on_click[0]({}, cx);
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

test("UI: q switches between Azure and GitHub, each keeping its tab, without reading a fresh view again", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "2");
  assert.equal(b.context().id, "github:prs");
  await host.answer("gh", ok(fixture("github-list.json")));
  await press(b, cx, "q");
  assert.deepEqual([b.source().id, b.context().id], ["azure", "azure:team:Example Project/Example Team"]);
  await press(b, cx, "]");
  assert.equal(b.context().id, "azure:prs:Example Project");
  await press(b, cx, "q");
  assert.deepEqual([b.source().id, b.context().id], ["github", "github:prs"]);
  assert.equal(host.open("gh").length, 0, "the list is fresh");
  await press(b, cx, "q", { modifiers: { control: true } });
  assert.equal(b.source().id, "github", "Control+q stays herdr's");
  await press(b, cx, "q", { char: "Q", modifiers: { shift: true } });
  assert.equal(b.source().id, "github", "Q does nothing");
});

test("UI: a new board opens on the source, tab and team view shown last; ones views.json no longer has fall back to the first", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "q");
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

test("UI: an Azure team tab shows its Sprint, or its Backlog to come, and v switches them; the PRs tab its list to come; the hints follow", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" } });
  const shown = () => texts(b.render());
  assert.ok(shown().includes("az ist nicht installiert"), "the Sprint reads with az, which is not found here");
  assert.deepEqual(hintKeys(b), ["q", "1 2 3 [ ]", "v", "h/l j/k", "H/L", "s", "Enter", "o", "m", "/", "r", "Esc"], "the Sprint's keys");
  await press(b, cx, "v");
  assert.ok(shown().includes("Backlog folgt"));
  assert.deepEqual(hintKeys(b), ["q", "1 2 3 [ ]", "v", "m", "/", "r", "Esc"]);
  await press(b, cx, "v");
  assert.ok(shown().includes("az ist nicht installiert"));
  await click(b, cx, "team-view-backlog");
  assert.ok(shown().includes("Backlog folgt"), "a click on the switch");
  await press(b, cx, "2");
  assert.ok(shown().includes("PR-Ansicht folgt"));
  assert.equal(byId(b.render(), "team-view"), null, "no view switch on the PRs tab");
  assert.deepEqual(hintKeys(b), ["q", "1 2 3 [ ]", "m", "/", "r", "Esc"]);
  await press(b, cx, "v");
  assert.ok(shown().includes("PR-Ansicht folgt"), "v does nothing there");
  await press(b, cx, "1");
  assert.ok(shown().includes("Backlog folgt"), "the team kept its view");
  assert.deepEqual(host.calls, []);
});

test("UI: a team with one view shows it without a switch; a config with one source has no source key", async () => {
  const config = JSON.parse(testConfig());
  config.sources.azure.contexts[0].views = ["backlog"];
  delete config.sources.github;
  const { b, cx } = await bootBoard({ config: JSON.stringify(config), stored: {} });
  assert.ok(texts(b.render()).includes("Backlog folgt"));
  assert.equal(byId(b.render(), "team-view"), null);
  assert.deepEqual(hintKeys(b), ["1 2 3 [ ]", "m", "/", "r", "Esc"]);
  await press(b, cx, "q");
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
  await press(b, cx, "v");
  assert.equal(b.shape(b.view()), board.SHAPES.placeholder, "the Backlog to come");
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

test("UI: Alt+] and Control+Alt+[ switch tabs; Control+] and the logged alt-q stay herdr's", async () => {
  const { b, cx } = await openBoard();
  b.key(LOGGED.altQ, cx);
  await settle();
  assert.deepEqual([b.source().id, cx.stopped], ["github", 0], "alt-q: neither q nor taken");
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

test("UI: while one types in the filter, m, q, v and digits are text, not keys", async () => {
  const { b, cx } = await bootBoard({ stored: { source: "azure" } });
  await press(b, cx, "/");
  assert.equal(b.filtering, true);
  for (const k of ["m", "q", "v", "2", "]"]) await press(b, cx, k);
  assert.deepEqual([b.mine, b.source().id, b.teamViewOf(b.context()), b.context().kind], [false, "azure", "sprint", "team"]);
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
  await press(b, cx, "q");
  await press(b, cx, "v");
  advance(10 * 60000);
  await cx.tick();
  assert.deepEqual([host.open("gh").length, host.open("az").length], [0, 0], "the Backlog to come reads nothing");
});

test("UI: the GitHub tabs keep their keys and hints: a board's, a list's", async () => {
  const { b, cx, host } = await openBoard();
  assert.deepEqual(hintKeys(b), ["q", "1 2 3 [ ]", "h/l j/k", "H/L", "s", "x", "X", "Enter", "o", "m", "/", "r", "Esc"]);
  await press(b, cx, "2");
  await host.answer("gh", ok(fixture("github-list.json")));
  assert.deepEqual(hintKeys(b), ["q", "1 2 3 [ ]", "j/k", "Enter", "o", "m", "/", "r", "Esc"]);
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
  assert.equal(host.open("gh").length, 1, "only H wrote");
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
  await host.answer("gh", ok(fixture("github-board.json")));
  assert.deepEqual([st().sel.key, st().detail], ["PVTI_rec6", true], "a refresh keeping the card keeps the details");
  await press(b, cx, "r");
  await host.answer("gh", ok(boardWith((nodes) => nodes.splice(nodes.findIndex((n) => n.id === "PVTI_rec6"), 1))));
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
  await press(b, cx, "x");
  assert.deepEqual([st().sel, st().detail], [{ col: 1, key: null }, false]);
});

test("UI: the column menu hiding a column before the selected one keeps the selection on its card", async () => {
  const { b, cx, st } = await openBoard();
  await press(b, cx, "l");
  await press(b, cx, "X", { modifiers: { shift: true } });
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
const THEME = { chrome: "#chrome", border: "#border", muted: "#muted", foreground: "#fg", hover: "#hover", selected: "#selected" };

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

test("the leader, the board button and the board hold the same board layer block, the leader and the button the same toggle", () => {
  const files = [join(buttonDir, "main.js"), resolve(modDir, "../leader/main.js"), join(modDir, "src/ui/layer.js")];
  const layer = markedCopy(files[0], "layer");
  assert.ok(layer?.includes("function boardLayer(root) {") && layer.includes("function leaveLayer(options) {"), "the button has the layer block");
  for (const file of files.slice(1)) assert.equal(markedCopy(file, "layer"), layer, file);
  const toggle = markedCopy(files[0], "board");
  assert.ok(toggle?.includes("function toggleBoard() {") && toggle.includes("function openBoard() {"), "the button has the board block");
  assert.equal(markedCopy(files[1], "board"), toggle, "the leader's");
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

test("UI: the board button is highlighted while the board layer shows the board, and plain otherwise", async () => {
  let tree = () => layerLayout("main");
  const { render } = await boardButton({ tree: () => tree() });
  const look = () => {
    const el = byId(render(), "board-open");
    return [el.with.bg?.[0] ?? null, el.with.text_color[0]];
  };
  assert.deepEqual(look(), [null, "#muted"], "the tab's content shows");
  tree = () => layerLayout("board");
  assert.deepEqual(look(), ["#selected", "#fg"], "the board shows");
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
  });
  assert.deepEqual(board.parseAreas('{"field": {"referenceName": "Custom.Team"}, "values": [{"value": "Core", "includeChildren": false}]}'),
    { field: "Custom.Team", values: [{ value: "Core", includeChildren: false }] }, "the team's own field");
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
  assert.deepEqual([board.sprintUntil("2026-11-27T00:00:00Z", 0), board.sprintUntil(null, 1000), board.sprintUntil("soon", 1000)],
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

test("the Sprint's keys walk the stories, then each column in row order; h/l land on the same row's item, else the next one below, else the last", () => {
  const data = sprintData();
  const nav = board.sprintNav(data, "", false);
  assert.deepEqual(nav.map((c) => c.name), ["Story", "To Do", "In Progress", "In PR/Work done", "Done"]);
  assert.deepEqual(nav.map((c) => c.shown.map((i) => i.number)), [[301, 302], [331, 311], [332, 312], [313], [321]]);
  const go = (col, key, dir, columns = nav) => board.sprintNavigate(columns, { col, key }, dir, data.rows);
  assert.deepEqual(go(0, "AB#301", "right"), { col: 1, key: "AB#311" });
  assert.deepEqual(go(1, "AB#311", "right"), { col: 2, key: "AB#312" });
  assert.deepEqual(go(3, "AB#313", "right"), { col: 4, key: "AB#321" }, "the next row below");
  assert.deepEqual(go(0, "AB#302", "right"), { col: 1, key: "AB#311" }, "none below: the last");
  assert.deepEqual(go(2, "AB#332", "left"), { col: 1, key: "AB#331" });
  assert.deepEqual(go(0, "AB#302", "left"), { col: 0, key: "AB#302" }, "at the edge it stays");
  const item = (key, row) => ({ key, row });
  const synthetic = [{ shown: [item("a", "r0")] }, { shown: [item("b", "r1"), item("c", "r2")] }];
  assert.deepEqual(board.sprintNavigate(synthetic, { col: 0, key: "a" }, "right", [{ key: "r0" }, { key: "r1" }, { key: "r2" }]), { col: 1, key: "b" },
    "the first one below, not the last");
  assert.deepEqual(go(1, "AB#331", "down"), { col: 1, key: "AB#311" });
  const mine = board.sprintNav(data, "", true);
  assert.deepEqual(mine.map((c) => c.shown.map((i) => i.number)), [[301], [331, 311], [], [313], []]);
  assert.deepEqual(go(1, "AB#311", "right", mine), { col: 2, key: null }, "an empty column is selected as such");
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
  assert.equal(host.open("az").length, 2, "still the sprint's last day");
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
  for (const s of ["AB#301", "User Story", "Import the sample catalogue", "In Progress"]) assert.ok(story.includes(s), s);
  assert.deepEqual(rowCells(root, "AB#301"), [["card-AB#311"], ["card-AB#312"], ["card-AB#313"], []]);
  assert.deepEqual(rowCells(root, "none"), [["card-AB#331"], ["card-AB#332"], [], []]);
  assert.deepEqual(rowCells(root, "AB#302"), [[], [], [], ["card-AB#321"]]);
  const card = texts(byId(root, "card-AB#311"));
  for (const s of ["AB#311", "Parse the sample file", "To Do", "Alex Sample"]) assert.ok(card.includes(s), s);
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
  assert.equal(host.notes.at(-1).level, "error");
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

test("UI: a Sprint that cannot be read says why in its view; a failed read of its settings keeps nothing", async () => {
  const { b, cx, host } = await bootBoard({ stored: { source: "azure" }, which: found });
  await host.answer("az", ok("[]"), AZ.iteration);
  for (const k of ["areas", "columns", "types"]) await host.answer("az", ok(fixture(`azure-sprint-${k}.json`)), AZ[k]);
  assert.equal(b.state(b.view().id).error, "Das Team hat keinen laufenden Sprint");
  assert.ok(texts(b.render()).includes("Das Team hat keinen laufenden Sprint"));
  await press(b, cx, "r");
  assert.deepEqual(openCounts(host, SETTINGS), [1, 1, 1, 1], "the settings are asked again");
  await host.answer("az", azRefused("Before you can run Azure DevOps commands, you need to run the login command (az login if using AAD/MSA identity else az devops login if using PAT token) to setup credentials."), AZ.iteration);
  assert.equal(b.state(b.view().id).error, "az ist nicht angemeldet (az login oder az devops login)");
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
