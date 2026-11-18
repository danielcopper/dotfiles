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
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const modDir = resolve(here, "../../herdr-app/.config/herdr-app/mods/board");
const mainPath = process.env.BOARD_MAIN ? resolve(process.env.BOARD_MAIN) : join(modDir, "main.js");
const STUBBED = new Set(["gpui-kit", "gpui-base", "herdr"]);
const realHome = process.env.HOME;
process.env.HOME = mkdtempSync(join(tmpdir(), "board-home-"));
after(() => rmSync(process.env.HOME, { recursive: true, force: true }));

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
  for (const net of ["dial tcp: lookup api.github.com: no such host", "Post \"https://api.github.com/graphql\": dial tcp 1.2.3.4:443: connect: connection refused", "read: connection reset by peer", "net/http: i/o timeout", "could not resolve host: api.github.com"]) {
    assert.match(fail({ code: 1, stdout: "", stderr: `gh: ${net}` }).message, /^GitHub nicht erreichbar: /, net);
  }
  assert.equal(fail({ code: 1, stdout: "", stderr: "gh: the connection to a field was reshaped" }).message, "the connection to a field was reshaped");
  assert.equal(fail({ code: 2, stdout: "", stderr: "" }).message, "gh endete mit 2");
  const garbled = fail({ code: 0, stdout: "<html>", stderr: "" });
  assert.deepEqual([garbled.unclear, garbled.message], [false, "gh antwortete ohne lesbares JSON"]);
});

test("on a write, any GraphQL error is a refusal with its message, the mutation's own first", () => {
  const refused = { code: 1, stdout: '{"data":{"updateProjectV2ItemFieldValue":null},"errors":[{"type":"FORBIDDEN","path":["updateProjectV2ItemFieldValue"],"locations":[{"line":2,"column":3}],"message":"Resource not accessible by integration"}]}', stderr: "gh: Resource not accessible by integration" };
  assert.throws(() => board.readGh(refused, { write: true }), (e) => !e.unclear && e.message === "Resource not accessible by integration");
  const two = { code: 1, stdout: JSON.stringify({ data: null, errors: [{ message: "other", path: ["x"] }, { message: "mine", path: ["updateProjectV2ItemFieldValue"] }] }), stderr: "" };
  assert.throws(() => board.readGh(two, { write: true }), { message: "mine" });
});

test("on a write, a failure that may have reached GitHub is unclear; one that never left is a refusal", () => {
  const outcome = (stderr, code = 1) => {
    try {
      board.readGh({ code, stdout: "", stderr }, { write: true });
    } catch (e) {
      return e.unclear ? "unclear" : "refused";
    }
    return "ok";
  };
  for (const err of ["gh: read tcp 10.0.0.2:5000->140.82.121.6:443: read: connection reset by peer", "gh: net/http: i/o timeout",
    "gh: Post \"https://api.github.com/graphql\": net/http: request canceled (Client.Timeout exceeded while awaiting headers)",
    "gh: Post \"https://api.github.com/graphql\": unexpected EOF", "gh: HTTP 502: Bad Gateway (https://api.github.com/graphql)"]) {
    assert.equal(outcome(err), "unclear", err);
  }
  for (const err of ["gh: dial tcp: lookup api.github.com: no such host", "gh: dial tcp 140.82.121.6:443: connect: connection refused",
    "gh: HTTP 422: Unprocessable Entity (https://api.github.com/graphql)"]) {
    assert.equal(outcome(err), "refused", err);
  }
  assert.equal(outcome("", 0), "unclear", "an unreadable answer to a write");
  assert.throws(() => board.readGh({ code: 1, stdout: "", stderr: "gh: HTTP 502: Bad Gateway" }), (e) => !e.unclear && /GitHub antwortete mit HTTP 502/.test(e.message));
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

test("on a write, az's connection failures are unclear and its ERROR: answers refusals", () => {
  const write = { write: true };
  const timedOut = "ERROR: HTTPSConnectionPool(host='dev.azure.com', port=443): Read timed out. (read timeout=30)";
  const unclear = board.azFailure({ code: 1, stderr: timedOut }, null, write);
  assert.deepEqual([unclear.unclear, unclear.message.startsWith("Ergebnis unklar: Azure nicht erreichbar (az): ")], [true, true]);
  for (const err of ["ERROR: ('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))",
    "ERROR: HTTPSConnectionPool(host='dev.azure.com', port=443): Max retries exceeded with url: /_apis"]) {
    assert.equal(board.azFailure({ code: 1, stderr: err }, null, write).unclear, true, err);
  }
  assert.equal(board.azFailure({ code: 1, stderr: timedOut }).unclear, false, "a read is just an error");
  const rule = board.azFailure({ code: 1, stderr: "ERROR: TF401320: Rule Error for field State. Error code: Required, InvalidEmpty." }, null, write);
  assert.deepEqual([rule.unclear, rule.message], [false, "TF401320: Rule Error for field State. Error code: Required, InvalidEmpty."]);
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
    { id: "s2", name: "romm", folder: "/r/tender", branch: "main", status: "working", tabs: [tab("t2", "1"), tab("t3", "tender#3000 feat(dev)…", "working")] },
  ];
  assert.deepEqual(board.linkedSession(card, spaces), { space: "s2", tab: "t3", status: "working", label: "tender#3000 feat(dev)…" });
  const two = [{ id: "s7", name: "x", folder: "/r/tender", branch: "main", status: null,
    tabs: [tab("t7", "tender#3000 a", "idle"), tab("t8", "tender#3000 b", "blocked"), tab("t9", "tender#30001 c", "blocked")] }];
  assert.equal(board.linkedSession(card, two).tab, "t8", "the most urgent first; tender#30001 is another item");
  assert.equal(board.linkedSession(card, [{ ...two[0], tabs: [two[0].tabs[2]] }]), null);
  const named = [{ id: "s3", name: "tender#3000 feat(dev)…", folder: "/r/tender", branch: "main", status: "done", tabs: [tab("t4", "1", "done")] }];
  assert.deepEqual(board.linkedSession(card, named), { space: "s3", tab: null, status: "done", label: "tender#3000 feat(dev)…" });
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

const dash = spawnSync("sh", ["-c", "command -v dash"], { encoding: "utf8" }).stdout.trim();
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
function testConfig({ start = {}, filter = "assignee:@me" } = {}) {
  return JSON.stringify({
    refreshMinutes: 3,
    start: { agent: "claude", message: "/work {number}", review: "/look {number}", ...start },
    repos: { "example/tender": { checkout: "~/src/tender" } },
    views: [
      { id: "mine", name: "Mine", source: "github", layout: "board", project: { owner: "sample-user", number: 7 }, filter, hide: ["Backlog", "Done"] },
      { id: "prs", name: "PRs", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] },
      { id: "other", name: "Other", source: "github", layout: "board", project: { owner: "sample-user", number: 8 }, hide: ["Done"] },
      { id: "azure", name: "Azure", source: "azure", layout: "board", hide: ["Inactive"], hideCategories: ["Completed", "Removed"], start: { checkout: "~/src/work" } },
    ],
  });
}

// The fake herdr: exec calls wait until the test answers them; spaces() is
// spaceList, which a test may change.
function fakeHost({ config = testConfig(), shown = true } = {}) {
  const calls = [];
  const host = {
    calls,
    runs: [],
    notes: [],
    focused: 0,
    config,
    spaceList: [{ id: "s1", name: "x", folder: "/r/tender", machine: null, branch: "main", active: true, status: null, tabs: [{ id: "t1", name: "Arbeit", active: true }] }],
    spaces: () => host.spaceList,
    exec: (tool, args, options) => {
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
  };
  // Answers the oldest open call of a tool (whose arguments hold `has`).
  host.answer = async (tool, result, has) => {
    const at = calls.findIndex((c) => c.tool === tool && !c.done && (!has || c.args.some((a) => String(a).includes(has))));
    assert.ok(at >= 0, `no open ${tool} call${has ? ` with ${has}` : ""}`);
    calls[at].done = true;
    if (result instanceof Error) calls[at].reject(result);
    else calls[at].resolve(result);
    await settle();
  };
  host.open = (tool) => calls.filter((c) => c.tool === tool && !c.done);
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

// A Board on the fake host, its first view loaded from github-board.json
// (or `answer`), the Azure view unavailable (no az).
async function openBoard(options = {}) {
  memory.clear();
  const host = fakeHost(options);
  globalThis.__boardHost = host;
  const b = new board.default();
  const cx = fakeCx();
  b.init({}, cx);
  await settle();
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
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "Ready");
  assert.equal(st().pending.PVTI_rec4, undefined);
  assert.equal(b.notice.text, "tender#3004 bleibt in „Ready“: Resource not accessible by integration");
  assert.equal(host.notes.at(-1).level, "error");
});

test("UI: a write without a clear answer keeps the card, warns, and the next refresh says where it is", async () => {
  const { b, cx, host, st } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  assert.equal(board.findCard(st().data, "PVTI_rec4").column.name, "In progress");
  assert.equal(b.notice.text, "tender#3004 → In progress: Ergebnis unklar: gh antwortete nicht in 30 s; lädt neu");
  assert.equal(host.notes.at(-1).level, "warning");
  assert.equal(host.open("gh").length, 1, "a refresh asks GitHub");
  await host.answer("gh", ok(fixture("github-board.json")));
  assert.equal(b.notice.text, "tender#3004 steht nach dem Neuladen in „Ready“");
});

test("UI: a refresh that fails after an unclear write says the outcome is still open", async () => {
  const { b, cx, host } = await openBoard();
  await press(b, cx, "l", shiftL);
  await host.answer("gh", new Error("timed out after 30000 ms"), "updateProjectV2ItemFieldValue");
  await host.answer("gh", { code: 1, stdout: "", stderr: "gh: dial tcp: lookup api.github.com: no such host" });
  assert.match(b.notice.text, /^tender#3004: Ergebnis weiter offen, Neuladen fehlgeschlagen \(GitHub nicht erreichbar/);
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
  host.spaceList = [...host.spaceList, { id: "s9", name, folder: "/home/me/src/tender", machine: null, branch: "main", active: false, status: null, tabs: [{ id: "t9", name }] }];
  await cx.fire();
  assert.equal(b.notice.text, `Sitzung geöffnet: ${name}`);
});

test("UI: a session that does not appear is warned about", async () => {
  const { b, cx, host } = await openBoard();
  await openStart(b, cx);
  b.startAgent(cx);
  await settle();
  await host.answer("sh", ok("/home/me/src/tender\n"));
  for (let i = 0; i < 3; i++) await cx.fire();
  assert.match(b.notice.text, /^Kein Space und kein Tab „tender#3004 feat\(api\): page through long lists“ erschienen/);
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
    throw new Error("machine server is unreachable\nmore");
  };
  await openStart(b, cx);
  assert.equal(b.modal.agentsError, "Agents auf Dieser Rechner nicht lesbar: machine server is unreachable");
});

test("UI: an Azure view loads its defaults and types once, again after r, and the timer brings it back when it was unavailable", async () => {
  const { b, cx, host } = await openBoard();
  assert.ok(b.views.azure.unavailable);
  b.views.azure.tried = 0;
  await cx.tick();
  await host.answer("az", ok(fixture("azure-defaults.txt")), "configure");
  await host.answer("az", ok(fixture("azure-types.json")), "workitemtypes");
  await host.answer("az", ok(fixture("azure-items.json")), "--wiql");
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
  const { b, cx, host } = await openBoard({ config: testConfig().replace(', "start": { "checkout": "~/src/work" }', "").replace(',"start":{"checkout":"~/src/work"}', "") });
  b.views.azure.tried = 0;
  await cx.tick();
  await host.answer("az", ok(fixture("azure-defaults.txt")), "configure");
  await host.answer("az", ok(fixture("azure-types.json")), "workitemtypes");
  await host.answer("az", ok(fixture("azure-items.json")), "--wiql");
  await press(b, cx, "4");
  assert.equal(b.view().id, "azure");
  await press(b, cx, "enter");
  await press(b, cx, "enter");
  assert.equal(b.modal, null);
  assert.equal(b.notice.text, "Für Example Project steht kein „checkout“ in views.json: „repos“ → „Example Project“ oder „start.checkout“ der Ansicht „Azure“");
});
