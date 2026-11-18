// Tests for the herdr board mod (herdr-app/.config/herdr-app/mods/board/main.js):
// its data functions, and a few UI paths driven through the Board class with
// a fake herdr. Run with `mise run herdr-board-test` (README, "herdr app"),
// or from the repo root with `node --test tests/herdr-app/board.test.mjs`.
//
// The mod imports "gpui-kit", "gpui-base" and "herdr", which only herdr
// provides. A resolve/load hook hands node a stand-in for each that exports
// every name the mod imports: View as an empty class, everything else as a
// function (with `.new` and any other member) that calls the fake host a test
// puts in globalThis.__boardHost, and throws when there is none. HOME points
// at an empty temporary folder before the mod is imported (removed after the
// run). BOARD_MAIN points
// the tests at another copy of main.js (to see a test fail against a broken
// one).
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
//   github-scope-error.json;
// - written from az's documentation (`az boards query`, `az devops invoke`
//   for work item types, `az devops configure --list`), not recorded:
//   azure-items.json, azure-types.json, azure-defaults.txt.

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
const fixture = (name) => readFileSync(join(here, "board-fixtures", name), "utf8");
const json = (name) => JSON.parse(fixture(name));
const shippedConfig = () => readFileSync(join(modDir, "views.json"), "utf8");

// A config with one view of each kind, for the functions that take views.
function sampleConfig() {
  const { config, errors } = board.validateConfig({
    start: { message: "/work {number}", review: "/look {number}" },
    repos: { "example/tender": { checkout: "~/src/tender", machine: "server" } },
    views: [
      { id: "mine", name: "Mine", source: "github", layout: "board", project: { owner: "sample-user", number: 7 }, filter: "assignee:@me", hide: ["Backlog", "Done"] },
      { id: "prs", name: "PRs", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] },
      { id: "az", name: "Azure", source: "azure", layout: "board", hideCategories: ["Completed", "Removed"], start: { checkout: "~/src/work", message: "AB {number}" } },
    ],
  });
  assert.deepEqual(errors, []);
  return config;
}

const githubView = () => sampleConfig().views[0];
const listView = () => sampleConfig().views[1];
const azureView = () => sampleConfig().views[2];
const HIDDEN = new Set(["Backlog", "Done"]);
const githubBoard = () => board.parseGithubBoard(json("github-board.json"), githubView(), HIDDEN);
const casesBoard = () => board.parseGithubBoard(json("github-board-cases.json"), githubView(), HIDDEN);
const azureTypes = () => board.parseAzureTypes(fixture("azure-types.json"));
const azureBoard = (hidden = new Set(["Done", "Removed"])) => board.parseAzureBoard(fixture("azure-items.json"), azureTypes(), hidden);
const names = (b) => b.columns.map((c) => c.name);
const numbersIn = (b, name) => b.columns.find((c) => c.name === name).cards.map((c) => c.number);

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

// ---- views.json ----

test("the shipped views.json holds exactly the three default views, valid", () => {
  const { config, errors } = board.readConfig(shippedConfig());
  assert.deepEqual(errors, []);
  assert.deepEqual(config.views.map((v) => [v.name, v.source, v.layout]), [
    ["Meine Aufgaben", "github", "board"],
    ["PRs", "github", "list"],
    ["Azure", "azure", "board"],
  ]);
  const [mine, prs, azure] = config.views;
  assert.deepEqual(mine.hide, ["Backlog", "Done"]);
  assert.match(prs.sections.map((s) => s.query).join(" "), /author:@me/);
  assert.match(prs.sections.map((s) => s.query).join(" "), /review-requested:@me/);
  assert.match(azure.where, /@Me/);
});

test("no person-specific value of views.json appears in main.js", () => {
  const raw = JSON.parse(shippedConfig());
  const values = new Set();
  const add = (v) => typeof v === "string" && v.length > 3 && values.add(v);
  for (const v of raw.views) {
    add(v.project?.owner);
    if (v.project?.number) values.add(`number: ${v.project.number}`);
    add(v.organization);
  }
  for (const [repo, entry] of Object.entries(raw.repos ?? {})) {
    add(repo);
    add(repo.split("/")[0]);
    Object.values(entry).forEach(add);
  }
  for (const key of ["message", "review", "agent", "machine"]) add(raw.start?.[key]);
  const code = readFileSync(mainPath, "utf8");
  assert.ok(values.size >= 5, "the config names the person's values");
  for (const value of values) assert.ok(!code.includes(value), `main.js holds ${JSON.stringify(value)}`);
});

test("readConfig reports a missing file and invalid JSON", () => {
  assert.match(board.readConfig(null).errors[0], /fehlt/);
  const bad = board.readConfig("{ views: [");
  assert.equal(bad.config, null);
  assert.match(bad.errors[0], /kein gültiges JSON/);
});

test("validateConfig keeps valid views and names each problem of the others", () => {
  const ok = { source: "github", layout: "list", sections: [{ name: "A", query: "is:pr" }] };
  const { config, errors } = board.validateConfig({
    refreshMinutes: 0,
    colour: "blue",
    start: { colour: "x", open: "window" },
    views: [
      { id: "ok", name: "Ok", ...ok },
      { id: "ok", name: "Twice", ...ok },
      { name: "No id", ...ok },
      { id: "b", name: "Bad source", source: "jira", layout: "board" },
      { id: "c", name: "No project", source: "github", layout: "board" },
      { id: "d", name: "Azure list", source: "azure", layout: "list", sections: [{ name: "A", query: "x" }] },
      { id: "e", name: "No sections", source: "github", layout: "list" },
      { id: "f", name: "Bad hide", source: "github", layout: "board", project: { owner: "o", number: 1 }, hide: "Done" },
      { id: "g", name: "Typo", ...ok, hidden: ["Done"] },
      { id: "h", name: "On", source: "github", layout: "board", project: { owner: "o", number: 1 }, on: "server" },
    ],
  });
  assert.deepEqual(config.views.map((v) => v.id), ["ok"]);
  assert.equal(config.refreshMinutes, 3);
  const text = errors.join("\n");
  for (const expected of [/refreshMinutes/, /„colour“ gibt es nicht/, /„start\.colour“ gibt es nicht/, /„start\.open“ ist "space" oder "tab"/,
    /„id“ ok gibt es schon/, /Ansicht 3 \(„No id“\): „id“ fehlt/, /„source“/, /„project“ braucht/, /Azure-Ansichten sind Boards/,
    /„sections“ braucht/, /„hide“ muss eine Liste/, /Ansicht 9 \(„Typo“\): „hidden“ gibt es nicht/, /„on“ gilt nur für Azure-Ansichten/]) {
    assert.match(text, expected);
  }
});

test("validateConfig rejects the keys of the worktree start with a clear message", () => {
  const { config, errors } = board.validateConfig({
    start: { worktree: "{checkout}.worktrees/{branch}", branch: "{type}/{number}-{slug}", base: "main" },
    repos: { "o/r": { checkout: "~/r", worktree: "x" } },
    views: [{ id: "a", name: "A", source: "github", layout: "board", project: { owner: "o", number: 1 }, startColumn: "In progress" }],
  });
  assert.equal(config, null);
  const text = errors.join("\n");
  for (const key of ["start.worktree", "start.branch", "start.base", "repos.o/r.worktree"]) {
    assert.match(text, new RegExp(`„${key.replace(/\./g, "\\.")}“ gibt es nicht mehr: der Start öffnet eine Sitzung im Checkout`));
  }
  assert.match(text, /„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst/);
});

test("validateConfig without any usable view gives no config", () => {
  const { config, errors } = board.validateConfig({ views: [] });
  assert.equal(config, null);
  assert.match(errors[0], /mindestens eine Ansicht/);
});

test("start settings: defaults < start < the view's start < the repo's entry", () => {
  const config = sampleConfig();
  const s = board.startSettings(config, config.views[0], "example/tender");
  assert.deepEqual([s.message, s.review, s.checkout, s.machine, s.open], ["/work {number}", "/look {number}", "~/src/tender", "server", "space"]);
  assert.equal(board.startSettings(config, config.views[2], "Example Project").checkout, "~/src/work");
  assert.equal(board.startSettings(config, config.views[2], "Example Project").message, "AB {number}");
  assert.equal(board.startSettings(config, config.views[2], "example/tender").checkout, "~/src/tender", "the repo's entry wins over the view's start");
  assert.equal(board.startSettings(config, config.views[0], "other/repo").checkout, null);
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
  let stored = board.toggleHidden(view, null, col("Done"), cols);
  assert.deepEqual(stored, { hide: [], show: ["Done"] });
  stored = board.toggleHidden(view, stored, col("Done"), cols);
  assert.deepEqual(stored, { hide: [], show: [] });
  stored = board.toggleHidden(view, stored, col("Ready"), cols);
  assert.deepEqual(stored, { hide: ["Ready"], show: [] });
  assert.equal(board.toggleHidden(view, stored, col("Ohne Status"), cols), stored);
});

test("Azure hides the states of the view's hidden categories", () => {
  assert.deepEqual([...board.hiddenColumns(azureView(), null, azureTypes().states)].sort(), ["Done", "Inactive", "Removed"]);
});

test("names in hide or hideCategories that match no column are reported", () => {
  const view = { ...githubView(), hide: ["Backlog", "Doen"], hideCategories: [] };
  assert.deepEqual(board.unknownHidden(view, githubBoard().columns), ["Doen"]);
  const az = { ...azureView(), hideCategories: ["Completed", "Closed"] };
  assert.deepEqual(board.unknownHidden(az, azureBoard().meta.states), ["Closed"]);
});

test("Azure's hide and hideCategories are checked against all the project's states, even on an empty board", () => {
  const shipped = board.readConfig(shippedConfig()).config.views.find((v) => v.source === "azure");
  const empty = board.parseAzureBoard("", azureTypes(), new Set());
  assert.deepEqual(board.unknownHidden(shipped, empty.meta.states), []);
  assert.deepEqual(board.unknownHidden({ ...shipped, hide: ["Inactive"] }, empty.meta.states), [], "a state of a type no item has");
  assert.deepEqual(board.unknownHidden({ ...shipped, hide: ["Closed"] }, empty.meta.states), ["Closed"]);
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
});

test("columns come from the project's field options, in order, with theme colors", () => {
  const b = githubBoard();
  assert.deepEqual(names(b), ["Backlog", "Ready", "In progress", "In review", "Done"]);
  assert.deepEqual(b.columns.map((c) => c.color), ["ansi2", "ansi4", "ansi3", "ansi5", "ansi11"]);
  assert.deepEqual(b.meta, { projectId: "PVT_sample", fieldId: "PVTSSF_sample", title: "Sample", url: "https://github.com/users/sample-user/projects/7" });
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

test("a card carries repo, number, title, labels, assignees, parent and sub-issues", () => {
  const b = githubBoard();
  const epic = board.findCard(b, "PVTI_rec1").card;
  assert.deepEqual([epic.repo, epic.repoShort, epic.labels, epic.assignees, epic.sub], ["example/tender", "tender", ["enhancement", "area:architecture", "epic"], ["sample-user"], { total: 22, done: 15 }]);
  assert.equal(board.findCard(b, "PVTI_rec2").card.parent, 3002);
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
  assert.deepEqual(board.shownColumns(moved, "").find((c) => c.name === "Done").shown, []);
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

test("Azure cards can only go to the states of their own type", () => {
  const b = azureBoard();
  const task = board.findCard(b, "az-101").card;
  assert.deepEqual(board.targetsFor(b, task).map((c) => c.name), ["To Do", "In Progress", "Done", "Removed"]);
  assert.equal(board.canDrop(b, task, b.columns.find((c) => c.name === "Committed")), false);
  const cases = casesBoard();
  assert.equal(board.canDrop(cases, board.findCard(cases, "PVTI_case1").card, cases.columns[0]), false, "never into Ohne Status");
});

test("H/L step to the next column the card may go to, stubs included", () => {
  const b = azureBoard();
  const cols = board.shownColumns(b, "");
  assert.deepEqual(names(b), ["To Do", "New", "Approved", "In Progress", "Committed", "Done", "Removed"]);
  assert.equal(board.stepTarget(b, cols, "az-101", 1)?.name, "Done");
  assert.equal(board.stepTarget(b, cols, "az-101", -1)?.name, "To Do");
  assert.equal(board.stepTarget(b, cols, "az-102", -1), null, "nothing left of the first state");
  const gh = casesBoard();
  assert.equal(board.stepTarget(gh, board.shownColumns(gh, ""), "PVTI_case3", -1)?.name, "Backlog", "Ohne Status is skipped");
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

test("j/k move within a column, h/l across columns and stubs, keeping the row", () => {
  const cols = board.shownColumns(githubBoard(), "");
  // Columns: 0 Backlog (stub), 1 Ready, 2 In progress, 3 In review, 4 Done (stub).
  let sel = { col: 2, key: "PVTI_rec1" };
  sel = board.navigate(cols, sel, "down");
  assert.deepEqual(sel, { col: 2, key: "PVTI_rec2" });
  sel = board.navigate(cols, board.navigate(cols, sel, "down"), "down");
  assert.deepEqual(sel, { col: 2, key: "PVTI_rec3" }, "stops at the last card");
  assert.deepEqual(board.navigate(cols, sel, "left"), { col: 1, key: "PVTI_rec6" });
  assert.deepEqual(board.navigate(cols, { col: 1, key: "PVTI_rec4" }, "left"), { col: 0, key: null }, "a stub takes the selection without a card");
  assert.deepEqual(board.navigate(cols, { col: 0, key: null }, "up"), { col: 0, key: null });
  assert.deepEqual(board.navigate(cols, { col: 4, key: null }, "right"), { col: 4, key: null });
  assert.deepEqual(board.navigate([], null, "down"), { col: 0, key: null });
  const list = [{ shown: [{ key: "a" }, { key: "b" }] }];
  assert.deepEqual(board.navigate(list, { col: 0, key: "a" }, "down"), { col: 0, key: "b" }, "a list is one column");
});

test("after new data the selection follows its card, else falls to the first card", () => {
  const cols = board.shownColumns(githubBoard(), "");
  assert.deepEqual(board.selectionAfter(cols, { col: 0, key: "PVTI_rec4" }), { col: 1, key: "PVTI_rec4" });
  assert.deepEqual(board.selectionAfter(cols, { col: 2, key: "gone" }), { col: 1, key: "PVTI_rec4" });
  assert.deepEqual(board.selectionAfter(cols, { col: 4, key: null }), { col: 4, key: null }, "a selected stub stays");
  assert.deepEqual(board.selectionAfter([], { col: 3, key: "x" }), { col: 0, key: null });
});

// ---- PR list ----

test("the PR list is one GraphQL request with one search per section", () => {
  const args = board.githubListArgs(listView());
  assert.equal(args.filter((a) => a.startsWith("query=")).length, 1);
  assert.match(args.find((a) => a.startsWith("query=")), /s0: search\(type: ISSUE, first: 50, query: \$q0\)[\s\S]*s1: search/);
  assert.ok(args.includes("q0=is:pr review-requested:@me"));
  assert.ok(args.includes("q1=is:pr author:@me"));
});

test("PR sections hold their rows once, with checks, review state and branch", () => {
  const list = board.parseGithubList(json("github-list.json"), listView());
  assert.deepEqual(list.sections.map((s) => [s.name, s.count, s.rows.map((r) => r.number)]), [["Review", 1, [2820]], ["Mine", 4, [1921, 808, 77]]]);
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

test("a tool that cannot run, or runs out of time, says so; only a missing az makes its view unavailable", () => {
  const missing = board.execRejection("az", new Error("failed to start az: No such file or directory (os error 2)"), 60000, null);
  assert.deepEqual([missing.message, missing.unavailable], ["az ist nicht installiert", true]);
  const gh = board.execRejection("gh", new Error("program not found"), 30000, null);
  assert.deepEqual([gh.message, gh.unavailable], ["gh ist nicht installiert", false]);
  const late = board.execRejection("gh", new Error("timed out after 30000 ms"), 30000, null);
  assert.deepEqual([late.message, late.unclear], ["gh antwortete nicht in 30 s", false]);
  const away = board.execRejection("az", new Error("machine server is unreachable"), 60000, "server");
  assert.deepEqual([away.message, away.unavailable], ["az auf server ließ sich nicht starten: machine server is unreachable", false]);
  assert.equal(board.execRejection("gh", new Error("boom"), 30000, null).message, "gh ließ sich nicht starten: boom");
});

test("on a write, a timeout or a lost remote call is unclear; a missing program or a local start failure is a refusal", () => {
  const write = { write: true };
  const late = board.execRejection("gh", new Error("timed out after 30000 ms"), 30000, null, write);
  assert.deepEqual([late.unclear, late.message], [true, "Ergebnis unklar: gh antwortete nicht in 30 s"]);
  const lost = board.execRejection("az", new Error("connection to server lost"), 60000, "server", write);
  assert.deepEqual([lost.unclear, lost.message], [true, "Ergebnis unklar: az auf server: connection to server lost"]);
  assert.equal(board.execRejection("az", new Error("No such file or directory"), 60000, "server", write).unclear, false);
  assert.equal(board.execRejection("gh", new Error("boom"), 30000, null, write).unclear, false);
});

// ---- Finding gh and az ----

// What a shell prints around the answer: an interactive bash's colour banner
// on stdout (as on the Deck).
const BANNER = "\u001b[40m   \u001b[41m   \u001b[m\n  Welcome back\n";
const answered = (answer, after = "") => ({ code: 0, stdout: `${BANNER}${board.WHICH_START}${answer}\n${board.WHICH_END}${after}`, stderr: "" });

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

test("the shell's answer is read between the markers, whatever its startup files print around them", () => {
  assert.equal(board.readWhich(answered("/home/linuxbrew/.linuxbrew/bin/gh", "\nlogout\n").stdout), "/home/linuxbrew/.linuxbrew/bin/gh");
  assert.equal(board.readWhich(`${board.WHICH_START}/a/gh${board.WHICH_END}`), "/a/gh");
  assert.equal(board.readWhich(answered("").stdout), "", "found nothing");
  assert.equal(board.readWhich(`${BANNER}${board.WHICH_START}`), null, "cut off before the end marker");
  assert.equal(board.readWhich(`${board.WHICH_END}${board.WHICH_START}`), null, "no start before the end");
  assert.equal(board.readWhich(BANNER), null);
});

test("a program's path is asked of the shell: interactive here, also login on another machine", async () => {
  const here = fakeRun(answered("/home/linuxbrew/.linuxbrew/bin/gh"));
  assert.equal(await board.findTool(here.run, "gh", null, 30000), "/home/linuxbrew/.linuxbrew/bin/gh");
  assert.deepEqual(here.calls, [{ program: "sh", args: ["-c", board.WHICH_SCRIPT, "board-which", "gh", ""], options: { on: null, timeout: 30000 } }]);
  const there = fakeRun(answered("/usr/bin/az"));
  assert.equal(await board.findTool(there.run, "az", "server", 60000), "/usr/bin/az");
  assert.deepEqual(there.calls[0].args.slice(-2), ["az", "login"]);
  assert.deepEqual(there.calls[0].options, { on: "server", timeout: 60000 });
});

test("a program the shell does not find is not installed; only a missing az makes its view unavailable", async () => {
  const gh = await board.findTool(fakeRun(answered("")).run, "gh", null, 30000).catch((e) => e);
  assert.deepEqual([gh instanceof board.BoardError, gh.message, gh.unavailable], [true, "gh ist nicht installiert", false]);
  const az = await board.findTool(fakeRun(answered("")).run, "az", "server", 60000).catch((e) => e);
  assert.deepEqual([az.message, az.unavailable], ["az auf server ist nicht installiert", true]);
});

test("a shell that cannot be asked, or gives no answer or no path, says so, not that the program is missing", async () => {
  const fail = (answer, tool = "az", on = "server") => board.findTool(fakeRun(answer).run, tool, on, 60000).catch((e) => e);
  const away = await fail(new Error("machine server is unreachable"));
  assert.deepEqual([away instanceof board.BoardError, away.message, away.unavailable], [true, "Pfad von az auf server nicht ermittelt: machine server is unreachable", false]);
  assert.equal((await fail(new Error("timed out after 60000 ms"))).message, "Pfad von az auf server nicht ermittelt: die Shell antwortete nicht in 60 s");
  const silent = await fail({ code: 127, stdout: BANNER, stderr: "sh: 6: exec: /bin/nope: not found" }, "gh", null);
  assert.deepEqual([silent.message, silent.unavailable], ["Pfad von gh nicht ermittelt: die Shell endete mit 127 ohne Antwort", false]);
  assert.equal((await fail(answered("alias gh='gh --pager=cat'"), "gh", null)).message, "Pfad von gh nicht ermittelt: die Shell kennt nur „alias gh='gh --pager=cat'“, kein Programm");
});

test("a found path is asked for once per machine and program, until reset or forgotten; a failed question is not kept", async () => {
  const { run, calls } = fakeRun(answered("/x/gh"));
  const paths = board.toolPaths(run);
  const [a, b] = await Promise.all([paths.path("gh", null, 30000), paths.path("gh", null, 30000)]);
  assert.deepEqual([a, b, calls.length], ["/x/gh", "/x/gh", 1], "one question for two calls at once");
  assert.equal(await paths.path("gh", null, 30000), "/x/gh");
  assert.equal(calls.length, 1, "reused");
  await paths.path("gh", "server", 30000);
  await paths.path("az", null, 30000);
  assert.equal(calls.length, 3, "another machine and another program are asked of their own");
  paths.forget("gh", null);
  await paths.path("gh", null, 30000);
  await paths.path("gh", "server", 30000);
  assert.equal(calls.length, 4, "forget drops only that machine's path");
  paths.reset();
  await paths.path("gh", null, 30000);
  await paths.path("gh", "server", 30000);
  assert.equal(calls.length, 6, "reset drops all");
  const missing = fakeRun(answered(""), answered("/y/az"));
  const later = board.toolPaths(missing.run);
  await assert.rejects(later.path("az", null, 60000), /az ist nicht installiert/);
  assert.equal(await later.path("az", null, 60000), "/y/az", "asked again after it was not found");
});

test("a question that fails after reset leaves the answer of the one asked since", async () => {
  const answers = [deferred(), deferred()];
  let asked = 0;
  const paths = board.toolPaths(() => answers[asked++].promise);
  const first = paths.path("gh", null, 30000);
  paths.reset();
  const second = paths.path("gh", null, 30000);
  answers[1].resolve(answered("/new/gh"));
  answers[0].reject(new Error("timed out after 30000 ms"));
  await assert.rejects(first, /die Shell antwortete nicht/);
  assert.equal(await second, "/new/gh");
  // Checked before awaiting: a third question would never be answered.
  const third = paths.path("gh", null, 30000);
  assert.equal(asked, 2, "the answer since is kept");
  assert.equal(await third, "/new/gh");
});

// The script under sh, with a bare environment as herdr's service has (a
// PATH without Homebrew), in a home whose bash prints a banner and adds a
// folder in .bashrc (read by an interactive bash) and another in
// .bash_profile (read by a login bash instead), each with a program of its
// own. `shell` is $SHELL; null leaves it unset. `sh` runs the script.
const bash = spawnSync("sh", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const dash = spawnSync("sh", ["-c", "command -v dash"], { encoding: "utf8" }).stdout.trim();
function inShellHome(fn) {
  const home = mkdtempSync(join(tmpdir(), "board-which-"));
  try {
    for (const [dir, tool] of [["brew/bin", "board-rc-tool"], ["login/bin", "board-login-tool"]]) {
      mkdirSync(join(home, dir), { recursive: true });
      writeFileSync(join(home, dir, tool), "#!/bin/sh\n", { mode: 0o755 });
    }
    writeFileSync(join(home, ".bashrc"), `printf '\\033[40m banner \\033[m\\n'\necho noise >&2\nPATH=$PATH:${home}/brew/bin\n`);
    writeFileSync(join(home, ".bash_profile"), `echo profile\nPATH=$PATH:${home}/login/bin\n`);
    const run = (tool, on, shell = bash, sh = "sh") => {
      const env = { HOME: home, PATH: "/usr/local/bin:/usr/bin:/bin", ...(shell ? { SHELL: shell } : {}) };
      // stdin from /dev/null: on a socket, as node's pipes are, bash reads
      // .bashrc even when not interactive (as under sshd).
      const r = spawnSync(sh, board.whichArgs(tool, on), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000, env });
      return { answer: board.readWhich(r.stdout), said: `${r.stdout} ${r.stderr}` };
    };
    return fn(run, home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("the path script asks an interactive shell here and a login shell on another machine", { skip: !bash && "no bash on this machine" }, () => {
  inShellHome((run, home) => {
    const here = run("board-rc-tool", null);
    assert.equal(here.answer, join(home, "brew/bin/board-rc-tool"), here.said);
    assert.equal(run("board-login-tool", null).answer, "", "here no login shell");
    const there = run("board-login-tool", "server");
    assert.equal(there.answer, join(home, "login/bin/board-login-tool"), there.said);
    assert.equal(run("board-no-such-tool", null).answer, "");
    assert.equal(run("board-no-such-tool", "server").answer, "");
    assert.match(run("sh", null, "/usr/bin/board-no-such-shell").answer, /^\/.*\/sh$/, "any other shell is asked as /bin/sh");
  });
});

const accountShell = spawnSync("sh", ["-c", 'getent passwd "$(id -un)" | cut -d: -f7'], { encoding: "utf8" }).stdout.trim();
// Under dash where there is one: bash, as sh, sets $SHELL itself.
test("without $SHELL the path script asks the account's shell", { skip: !/\/bash$/.test(accountShell) && "the account's shell is no bash" }, () => {
  inShellHome((run, home) => {
    const r = run("board-rc-tool", null, null, dash || "sh");
    assert.equal(r.answer, join(home, "brew/bin/board-rc-tool"), r.said);
  });
});

test("az's failures: login and a missing extension make the view unavailable, others are errors without az's WARNING lines", () => {
  const login = board.azFailure({ code: 1, stderr: "WARNING: a notice\nERROR: Before you can run Azure DevOps commands, you need to run the login command(az login if using AAD/MSA identity else az devops login if using PAT token) to setup credentials." });
  assert.deepEqual([login.unavailable, login.message], [true, "az ist nicht angemeldet (az login oder az devops login)"]);
  for (const err of ["ERROR: 'boards' is misspelled or not recognized by the system.", "ERROR: az: 'devops' is not in the 'az' command group."]) {
    const ext = board.azFailure({ code: 2, stderr: err });
    assert.deepEqual([ext.unavailable, /azure-devops/.test(ext.message)], [true, true], err);
  }
  const other = board.azFailure({ code: 1, stderr: "WARNING: The behavior of this command will change\nERROR: TF401232: Work item 9 does not exist." });
  assert.deepEqual([other.unavailable, other.message], [false, "TF401232: Work item 9 does not exist."]);
  assert.equal(board.azFailure({ code: 1, stderr: "WARNING: The behavior of this command will change\nThe request failed" }).message, "The request failed");
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: --project must be specified. The value can be passed at command line or set using 'az devops configure --defaults project=<name>'." }).message,
    "Azure-Projekt fehlt: „project“ in der Ansicht oder az devops configure --defaults project=…");
  assert.equal(board.azFailure({ code: 1, stderr: "ERROR: TF200016: The following project does not exist: Nope." }).message,
    "Azure-Projekt unbekannt: TF200016: The following project does not exist: Nope.");
  const wiql = "ERROR: TF51005: The query references a field that does not exist. The error is caused by «[System.Project]».";
  assert.equal(board.azFailure({ code: 1, stderr: wiql }).message, wiql.slice(7), "a WIQL error naming a project field is no missing project");
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

test("az's configured defaults give the organization and project", () => {
  assert.deepEqual(board.parseAzureDefaults(fixture("azure-defaults.txt")), { organization: "https://dev.azure.com/example-org/", project: "Example Project" });
  assert.deepEqual(board.parseAzureDefaults("[defaults]\n"), { organization: null, project: null });
});

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

test("the WIQL query asks for @Me's items without the hidden states, quotes escaped", () => {
  const args = board.azureQueryArgs({ ...azureView(), where: "[System.AssignedTo] = @Me" }, new Set(["Done", "Won't fix"]));
  const wiql = args[args.indexOf("--wiql") + 1];
  assert.match(wiql, /^SELECT \[System\.Id\], \[System\.Title\], \[System\.State\]/);
  assert.match(wiql, /WHERE \(\[System\.AssignedTo\] = @Me\) AND \[System\.State\] NOT IN \('Done', 'Won''t fix'\)/);
  assert.deepEqual(args.slice(args.indexOf("--detect"), args.indexOf("--detect") + 2), ["--detect", "false"]);
  assert.ok(!args.includes("--org"), "no organization flag where the view names none");
  const scoped = board.azureQueryArgs({ ...azureView(), organization: "https://dev.azure.com/o", project: "P" }, new Set());
  assert.deepEqual(scoped.slice(-4), ["--org", "https://dev.azure.com/o", "--project", "P"]);
  assert.doesNotMatch(scoped[scoped.indexOf("--wiql") + 1], /NOT IN/);
});

test("Azure columns are the states of the types found, hidden ones as stubs; others' states stay out", () => {
  const b = azureBoard();
  assert.deepEqual(b.columns.map((c) => [c.name, c.hidden]), [
    ["To Do", false], ["New", false], ["Approved", false], ["In Progress", false], ["Committed", false], ["Done", true], ["Removed", true],
  ]);
  const task = board.findCard(b, "az-101");
  assert.deepEqual([task.column.name, task.card.assignees, task.card.type, task.card.repoShort], ["In Progress", ["Sample Person"], "Task", "Example Project"]);
  assert.equal(task.card.url, "https://dev.azure.com/example-org/Example%20Project/_workitems/edit/101");
  const bug = board.findCard(b, "az-102").card;
  assert.deepEqual([bug.assignees, bug.labels, bug.url], [["Sample Person"], ["import", "data"], "https://dev.azure.com/example-org/Example%20Project/_workitems/edit/102"]);
  assert.equal(b.columns.find((c) => c.name === "Done").count, null, "Azure stubs have no count");
});

test("az printing nothing means no work items and no columns, not an error", () => {
  const b = board.parseAzureBoard("", azureTypes(), new Set());
  assert.deepEqual([b.total, b.columns.length], [0, 0]);
});

test("an Azure state change is az boards work-item update --state", () => {
  const b = azureBoard();
  const card = board.findCard(b, "az-102").card;
  const args = board.azureMoveArgs(azureView(), card, b.columns.find((c) => c.name === "Committed"));
  assert.deepEqual(args.slice(0, 7), ["boards", "work-item", "update", "--id", "102", "--state", "Committed"]);
  assert.ok(args.includes("--detect"));
});

// ---- Sessions ----

test("an item's key names it on every source; a draft has none", () => {
  assert.equal(board.itemKey(board.findCard(githubBoard(), "PVTI_rec1").card), "tender#3000");
  assert.equal(board.itemKey(board.findCard(azureBoard(), "az-101").card), "AB#101");
  const draft = board.findCard(casesBoard(), "PVTI_case2").card;
  assert.equal(board.itemKey(draft), null);
  assert.equal(board.itemLabel(draft), "Entwurf");
  assert.equal(board.itemLabel(board.findCard(azureBoard(), "az-101").card), "AB#101");
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
  const az = board.findCard(azureBoard(), "az-101").card;
  assert.equal(board.linkedSession(az, [{ id: "s6", name: "w", folder: "/w", branch: null, status: null, tabs: [tab("t6", "AB#101 Write the sample importer", "blocked")] }]).tab, "t6");
  const pr = board.parseGithubList(json("github-list.json"), listView()).sections[0].rows[0];
  assert.equal(board.linkedSession(pr, [{ id: "p", name: "p", folder: "/x", branch: "pr/summary-card", status: "idle", tabs: [] }]).space, "p");
});

test("templates take the item's number, title, url, owner, repo and key", () => {
  const card = board.findCard(githubBoard(), "PVTI_rec4").card;
  const vars = board.templateVars(card);
  assert.deepEqual(vars, { number: 3004, title: card.title, url: "https://github.com/example/tender/issues/3004", owner: "example", repo: "tender", key: "tender#3004" });
  assert.equal(board.renderTemplate("/implement {number} {nope}", vars), "/implement 3004 {nope}");
  assert.equal(board.templateVars(board.findCard(azureBoard(), "az-101").card).repo, "Example Project");
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

// The UI tests' own views.json: three GitHub views and an Azure one.
// hide: the first view's hidden columns; azureStart: the Azure view's start
// (null: none); repos: more repos entries.
function testConfig({ start = {}, filter = "assignee:@me", hide = ["Backlog", "Done"], azureStart = { checkout: "~/src/work" }, repos = {} } = {}) {
  const azure = { id: "azure", name: "Azure", source: "azure", layout: "board", hide: ["Inactive"], hideCategories: ["Completed", "Removed"] };
  return JSON.stringify({
    refreshMinutes: 3,
    start: { agent: "claude", message: "/work {number}", review: "/look {number}", ...start },
    repos: { "example/tender": { checkout: "~/src/tender" }, ...repos },
    views: [
      { id: "mine", name: "Mine", source: "github", layout: "board", project: { owner: "sample-user", number: 7 }, filter, hide },
      { id: "prs", name: "PRs", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] },
      { id: "other", name: "Other", source: "github", layout: "board", project: { owner: "sample-user", number: 8 }, hide: ["Done"] },
      azureStart ? { ...azure, start: azureStart } : azure,
    ],
  });
}

// A clock the tests can move: the mod reads Date.now().
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const advance = (ms) => (clockOffset += ms);

// An element of the fake gpui: it records the styling calls by name and
// keeps its children; when(cond, fn) applies fn when cond holds.
function element(kind) {
  const el = { kind, styles: [], kids: [] };
  const proxy = new Proxy(el, {
    get(target, p) {
      if (p in target) return target[p];
      return (...args) => {
        if (p === "child") target.kids.push(args[0]);
        else if (p === "children") target.kids.push(...args[0]);
        else if (p === "when") return args[0] ? args[1](proxy) : proxy;
        else target.styles.push(p);
        return proxy;
      };
    },
  });
  return proxy;
}

// The fake herdr: exec calls wait until the test answers them, except the
// questions for gh's and az's paths: those are answered at once from
// which(tool, on) (a path, "" for not found, an Error, or exec's result) and
// recorded in asked. spaces() is spaceList, which a test may change.
function fakeHost({ config = testConfig(), shown = true, which = (tool) => `/opt/fake/bin/${tool}` } = {}) {
  const calls = [];
  const host = {
    calls,
    asked: [],
    which,
    runs: [],
    notes: [],
    focused: 0,
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
    readTextFile: async () => host.config,
    appHome: () => "/fake-home",
    checking: () => false,
    nextCommand: () => new Promise(() => {}),
    notify: (n) => host.notes.push(n),
    run: (name, args) => host.runs.push([name, args]),
    panes: () => (shown ? [{ pane: "p1", mod: "board", tab: "t1" }] : []),
    machines: () => [{ name: null, layout: "ready" }, { name: "server", layout: "ready" }],
    knownAgents: async () => [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }],
    settings: () => ({}),
    theme: () => ({}),
    "InputState.new": (opts) => {
      let value = opts?.value ?? "";
      return { on: () => true, value: () => value, set_value: (v) => (value = v), focus: () => {} };
    },
    "ScrollHandle.new": () => ({ scroll_to_item() {} }),
    div: () => element("div"),
    h_flex: () => element("h_flex"),
    v_flex: () => element("v_flex"),
    "Input.new": () => element("input"),
  };
  // A call of a tool: by its name, or by the path which gave for it.
  const named = (c, tool) => c.tool === tool || c.tool.endsWith(`/${tool}`);
  // Answers the oldest open call of a tool (whose arguments hold `has`).
  host.answer = async (tool, result, has) => {
    const at = calls.findIndex((c) => named(c, tool) && !c.done && (!has || c.args.some((a) => String(a).includes(has))));
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

// A fake cx; its timers run when a test calls fire() or tick().
function fakeCx() {
  const cx = {
    later: [],
    every: [],
    focus_handle: () => ({ focus: () => globalThis.__boardHost.focused++ }),
    spawn: (fn) => Promise.resolve().then(() => fn(cx)),
    timer: {
      after: (ms, fn) => cx.later.push(fn),
      every: (ms, fn) => cx.every.push(fn),
    },
    notify() {},
    stop_propagation() {},
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
  };
  return cx;
}

const memory = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)) },
});

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });

// A Board on the fake host, started, its calls not answered yet.
async function bootBoard(options = {}) {
  memory.clear();
  clockOffset = 0;
  const host = fakeHost(options);
  globalThis.__boardHost = host;
  const b = new board.default();
  const cx = fakeCx();
  b.init({}, cx);
  await settle();
  return { b, cx, host, st: () => b.views.mine };
}

// A Board on the fake host, its first view loaded from github-board.json
// (or `answer`), the Azure view unavailable (no az).
async function openBoard(options = {}) {
  const { b, cx, host } = await bootBoard(options);
  await host.answer("az", new Error("failed to start az: No such file or directory"));
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

test("UI: on the shipped views.json the board loads its first view and hides Azure without az", async () => {
  const { b, st, host } = await openBoard({ config: shippedConfig() });
  assert.equal(st().data.columns.length, 5);
  assert.deepEqual(st().sel, { col: 1, key: "PVTI_rec4" });
  assert.equal(b.views.azure.unavailable, "az ist nicht installiert");
  assert.deepEqual(b.shownViews().map((v) => v.id), ["mine", "prs"]);
  assert.ok(host.focused > 0);
});

test("UI: a board copy that is not shown does not take the keyboard", async () => {
  memory.clear();
  const host = fakeHost({ shown: false });
  globalThis.__boardHost = host;
  new board.default().init({}, fakeCx());
  await settle();
  assert.equal(host.focused, 0);
});

test("UI: number keys beyond the views do nothing; [ and ] go back and forth, also with AltGr, not with Control alone", async () => {
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
  assert.equal(b.view().id, "prs", "4 names no view while Azure is unavailable");
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

test("UI: x shows a hidden column and keeps it shown when storage fails", async () => {
  const { b, cx, st, host } = await openBoard();
  st().sel = { col: 4, key: null };
  const setItem = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error("full");
  };
  try {
    await press(b, cx, "x");
  } finally {
    localStorage.setItem = setItem;
  }
  assert.equal(st().hidden.has("Done"), false);
  assert.equal(st().data.columns[4].hidden, false);
  assert.ok(host.open("gh").at(-1).args.includes('filter=assignee:@me -status:"Backlog"'), "the refresh asks for Done again");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  await host.answer("gh", ok(boardWith((nodes) => (nodes.find((n) => n.id === "PVTI_rec4").fieldValueByName.optionId = "opt-in-progress"))));
  assert.deepEqual([b.notice.text, b.notice.level], ["tender#3004 steht nach dem Neuladen in „In progress“", "info"]);
  await press(b, cx, "s");
  await press(b, cx, "5");
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  await host.answer("gh", ok(boardWith((nodes) => nodes.splice(nodes.findIndex((n) => n.id === "PVTI_rec4"), 1))));
  assert.deepEqual([b.notice.text, b.notice.level], ["tender#3004 steht nicht in den gezeigten Spalten („Done“ ist ausgeblendet)", "info"]);
});

test("UI: a refresh that read before an unclear write ended says nothing about it; the one after does", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "r");
  advance(5);
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  await host.answer("gh", gone);
  assert.deepEqual([b.notice.text, b.notice.level], ["tender#3004 steht nicht in den gezeigten Spalten (ausgeblendet: „Backlog“, „Done“)", "warning"]);
  const all = await openBoard({ config: testConfig({ hide: [] }) });
  await press(all.b, all.cx, "l", shiftL);
  await all.host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  await all.host.answer("gh", gone);
  assert.deepEqual([all.b.notice.text, all.b.notice.level], ["tender#3004 ist nach dem Neuladen nicht auf dem Board", "warning"]);
  assert.deepEqual(all.host.notes.at(-1), { title: "Status nach dem Neuladen", body: "tender#3004 ist nach dem Neuladen nicht auf dem Board", level: "warning" });
});

test("UI: a new move of a card that lands drops the open outcome of its earlier one", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  await press(b, cx, "h", { char: "H", modifiers: { shift: true } });
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  assert.deepEqual(st().unclear.map((u) => u.to.name), ["Ready"]);
});

test("UI: a new move of a card that is refused keeps the open outcome of its earlier one", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
    await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  config.views[0] = { id: "mine", name: "Mine", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] };
  host.config = JSON.stringify(config);
  await press(b, cx, "r");
  await host.answer("gh", ok(fixture("github-list.json")), "search(");
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  assert.equal(b.notice.text, "tender#3004 → In progress: Ergebnis unklar: gh antwortete nicht in 30 s", "no follow-up promised");
  assert.deepEqual(b.views.mine.unclear, []);
  assert.equal(host.open("gh").length, 0, "no refresh of a board that is gone");
  assert.equal(b.views.mine.error, null);
});

test("UI: a write under way while r removes its view promises no follow-up", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  host.config = JSON.stringify({ ...JSON.parse(testConfig()), views: JSON.parse(testConfig()).views.filter((v) => v.id !== "mine") });
  await press(b, cx, "r");
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  assert.equal(b.notice.text, "tender#3004 → In progress: Ergebnis unklar: gh antwortete nicht in 30 s");
  assert.deepEqual(b.views.mine.unclear, []);
});

test("UI: a write that ends unclear after r read an invalid views.json is told once views.json is fixed", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  host.config = "{ views: [";
  await press(b, cx, "r");
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  st.unclear = [{ key: "PVTI_rec4", label: "tender#3004", to: { id: "opt-in-progress", name: "In progress" }, at: 0 }];
  b.notice = null;
  b.settleUnclear(b.config.views[0], 1, st.data, cx);
  assert.deepEqual([st.unclear, b.notice], [[], null]);
});

test("UI: r drops the open outcomes of a view that became a list", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  const config = JSON.parse(testConfig());
  config.views[0] = { id: "mine", name: "Mine", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] };
  host.config = JSON.stringify(config);
  await press(b, cx, "r");
  assert.deepEqual(b.views.mine.unclear, []);
  await host.answer("gh", ok(fixture("github-board.json")), "items(first");
  await host.answer("gh", ok(fixture("github-list.json")), "search(");
  assert.equal(b.views.mine.error, null);
  assert.equal(b.views.mine.data.kind, "list");
});

test("UI: a refresh settles the outcomes that came before it started and keeps the later ones for the next", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  advance(5);
  b.views.mine.sel = { col: 2, key: "PVTI_rec1" };
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
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
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  const unclear = b.notice.text;
  await host.answer("gh", { code: 1, stdout: "", stderr: GH_DNS }, "items(first");
  assert.equal(b.notice.text, unclear);
});

test("UI: a refresh that fails after an unclear write says the outcome is still open", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  await host.answer("gh", { code: 1, stdout: "", stderr: GH_DNS });
  assert.equal(b.notice.text, "tender#3004: Ergebnis weiter offen, Neuladen fehlgeschlagen (GitHub nicht erreichbar: error connecting to api.github.com)");
});

test("UI: r forgets the open outcomes of views no longer in views.json", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  assert.equal(b.views.mine.unclear.length, 1);
  host.config = JSON.stringify({ ...JSON.parse(testConfig()), views: JSON.parse(testConfig()).views.filter((v) => v.id !== "mine") });
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
  assert.equal(b.messageInput.value(), "/work 3004");
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
  b.startAgent(cx);
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
  b.startAgent(cx);
  await settle();
  await host.answer("sh", { code: 3, stdout: "", stderr: "Kein Checkout unter /home/me/src/tender\n" });
  assert.equal(b.modal?.kind, "start");
  assert.equal(b.modal.error, "Kein Checkout unter /home/me/src/tender");
  assert.equal(b.modal.busy, null);
  assert.equal(host.runs.length, 0);
  b.startAgent(cx);
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
// Brings the Azure view back: the timer tries it once refreshMinutes have
// passed, and az answers its defaults, types and work items.
async function azureBack(cx, host) {
  advance(3 * 60000);
  await cx.tick();
  await host.answer("az", ok(fixture("azure-defaults.txt")), "configure");
  await host.answer("az", ok(fixture("azure-types.json")), "workitemtypes");
  await host.answer("az", ok(fixture("azure-items.json")), "--wiql");
}

test("UI: the timer tries an unavailable view again only after refreshMinutes", async () => {
  const { b, cx, host } = await openBoard();
  assert.ok(b.views.azure.unavailable);
  advance(2 * 60000);
  await cx.tick();
  assert.equal(host.open("az").length, 0, "not before refreshMinutes");
  advance(60000);
  await cx.tick();
  assert.equal(host.open("az").length, 1);
});

test("UI: an Azure view loads its defaults and types once and again after r", async () => {
  const { b, cx, host } = await openBoard();
  await azureBack(cx, host);
  assert.equal(b.views.azure.unavailable, null);
  assert.equal(b.views.azure.data.columns.length, 7);
  assert.deepEqual(b.views.azure.warnings, [], "Inactive is a state of the project's types, though no item has it");
  b.refresh(b.config.views.find((v) => v.id === "azure"), cx);
  await settle();
  assert.deepEqual(host.open("az").map((c) => c.args[1]), ["query"], "a refresh asks for the work items only");
  await host.answer("az", ok(fixture("azure-items.json")), "--wiql");
  await press(b, cx, "r");
  assert.ok(host.open("az").some((c) => c.args.includes("configure")), "r reads az's defaults and the types anew");
});
test("UI: an Azure card without a checkout names where to set one", async () => {
  const { b, cx, host } = await openBoard({ config: testConfig({ azureStart: null }) });
  await azureBack(cx, host);
  await press(b, cx, "4");
  assert.equal(b.view().id, "azure");
  await press(b, cx, "enter");
  await press(b, cx, "enter");
  assert.equal(b.modal, null);
  assert.equal(b.notice.text, "Für Example Project steht kein „checkout“ in views.json: „repos“ → „Example Project“ oder „start.checkout“ der Ansicht „Azure“");
});

test("UI: an Azure card starts from its project's entry in repos", async () => {
  const { b, cx, host } = await openBoard({ config: testConfig({ azureStart: null, repos: { "Example Project": { checkout: "~/src/example" } } }) });
  await azureBack(cx, host);
  await press(b, cx, "4");
  await openStart(b, cx);
  assert.equal(b.messageInput.value(), "/work 102", "the first card, in New");
  b.startAgent(cx);
  await settle();
  assert.deepEqual(host.open("sh")[0].args.slice(-1), ["~/src/example"]);
});

// ---- UI: gh and az by the shell's path ----

test("UI: gh and az run by the path the shell gives, asked once per machine until r", async () => {
  const which = (tool) => (tool === "gh" ? "/home/linuxbrew/.linuxbrew/bin/gh" : "/opt/az/bin/az");
  const { b, cx, host, st } = await openBoard({ which });
  assert.deepEqual(host.calls.map((c) => c.tool).sort(), ["/home/linuxbrew/.linuxbrew/bin/gh", "/opt/az/bin/az"]);
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

test("UI: az for a view on another machine is asked for and run there", async () => {
  const config = JSON.parse(testConfig());
  config.views[3].on = "server";
  const { b, host } = await openBoard({ config: JSON.stringify(config), which: (tool, on) => `/opt/${on ?? "here"}/bin/${tool}` });
  assert.deepEqual(host.asked.filter((a) => a.tool === "az"), [{ tool: "az", on: "server", timeout: 60000 }]);
  assert.deepEqual(host.calls.filter((c) => c.tool.endsWith("/az")).map((c) => [c.tool, c.options.on]), [["/opt/server/bin/az", "server"]]);
  assert.equal(b.views.azure.unavailable, "az auf server ist nicht installiert");
});

test("UI: gh and az that the shell does not find are not installed; the Azure view is left out", async () => {
  const { b, host, st } = await bootBoard({ which: () => "" });
  assert.deepEqual(host.calls, [], "nothing runs");
  assert.equal(st().error, "gh ist nicht installiert");
  assert.equal(b.views.azure.unavailable, "az ist nicht installiert");
});

test("UI: a shell that cannot be asked says so, not that gh is missing", async () => {
  const { st } = await bootBoard({ which: (tool) => (tool === "gh" ? new Error("timed out after 30000 ms") : "") });
  assert.equal(st().error, "Pfad von gh nicht ermittelt: die Shell antwortete nicht in 30 s");
});

test("UI: a program gone from the path found is asked for again at the next call; a timeout keeps the path", async () => {
  const { b, cx, host } = await openBoard();
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", new Error("timed out after 30000 ms"));
  b.refresh(b.view(), cx);
  await settle();
  assert.equal(host.asked.filter((a) => a.tool === "gh").length, 1, "kept after a timeout");
  await host.answer("gh", ok(fixture("github-board.json")));
  b.refresh(b.view(), cx);
  await settle();
  await host.answer("gh", new Error("failed to start /opt/fake/bin/gh: No such file or directory"));
  assert.equal(b.views.mine.error, "gh ist nicht installiert");
  b.refresh(b.view(), cx);
  await settle();
  assert.equal(host.asked.filter((a) => a.tool === "gh").length, 2);
});

// ---- UI: drawing ----

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
const centring = (chain) => chain.filter((el) => crossAlign(el) === "items_center").map((el) => el.kind);

test("UI: the views sidebar fills the height; the content and its error start at the top", async () => {
  const { b, st } = await bootBoard({ which: (tool) => (tool === "gh" ? "" : "/opt/fake/bin/az") });
  assert.equal(st().error, "gh ist nicht installiert");
  const root = b.render();
  for (const text of ["ANSICHTEN", "gh ist nicht installiert"]) {
    const chain = pathTo(root, text);
    assert.ok(chain, text);
    assert.deepEqual(centring(chain), [], `no row centres „${text}“`);
  }
  const row = pathTo(root, "ANSICHTEN").filter((el) => el.kind === "h_flex").at(-1);
  assert.equal(crossAlign(row), "items_stretch", "the sidebar's row stretches it to the full height");
});

test("UI: the board and the detail beside it start at the top", async () => {
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
});
