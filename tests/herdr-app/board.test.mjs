// Tests for the data functions of the herdr board mod
// (herdr-app/.config/herdr-app/mods/board/main.js), run with node's test
// runner: `mise run herdr-board-test`, or `node --test tests/herdr-app/`.
//
// The mod imports "gpui-kit" and "herdr", which only herdr provides; a
// resolve/load hook hands node a stand-in for each that exports every name
// the mod imports, as functions that throw when called, so importing the
// module runs nothing of herdr's. BOARD_MAIN points the tests at another copy
// of main.js (to see a test fail against a broken one).
//
// The fixtures in board-fixtures/ hold sample data in the shapes gh 2.96 and
// GitHub's GraphQL API returned when they were recorded; the Azure ones follow
// the documented shapes of `az boards query`, `az devops invoke` (work item
// types) and `az devops configure --list`, since no az was at hand.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const modDir = resolve(here, "../../herdr-app/.config/herdr-app/mods/board");
const mainPath = process.env.BOARD_MAIN ? resolve(process.env.BOARD_MAIN) : join(modDir, "main.js");
const STUBBED = new Set(["gpui-kit", "gpui-base", "herdr"]);

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
    const source = list
      .split(",")
      .filter(Boolean)
      .map((n) => `export function ${n}() { throw new Error("${specifier}.${n} is not available under node"); }`)
      .join("\n");
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
    start: { message: "/work {number}", worktree: "{checkout}.worktrees/{branch}" },
    repos: { "example/tender": { checkout: "~/src/tender", machine: "server" } },
    views: [
      { id: "mine", name: "Mine", source: "github", layout: "board", project: { owner: "sample-user", number: 7 }, filter: "assignee:@me", hide: ["Backlog", "Done"], startColumn: "In progress" },
      { id: "prs", name: "PRs", source: "github", layout: "list", sections: [{ name: "Review", query: "is:pr review-requested:@me" }, { name: "Mine", query: "is:pr author:@me" }] },
      { id: "az", name: "Azure", source: "azure", layout: "board", hideCategories: ["Completed", "Removed"], start: { checkout: "~/src/work" } },
    ],
  });
  assert.deepEqual(errors, []);
  return config;
}

const githubView = () => sampleConfig().views[0];
const listView = () => sampleConfig().views[1];
const azureView = () => sampleConfig().views[2];
const githubBoard = () => board.parseGithubBoard(json("github-board.json"), githubView(), new Set(["Backlog", "Done"]));

// ---- views.json (decision 2) ----

test("the shipped views.json holds exactly the three default views, valid", () => {
  const { config, errors } = board.readConfig(shippedConfig());
  assert.deepEqual(errors, []);
  assert.deepEqual(config.views.map((v) => [v.name, v.source, v.layout]), [
    ["Meine Aufgaben", "github", "board"],
    ["PRs", "github", "list"],
    ["Azure", "azure", "board"],
  ]);
  const [mine, prs, azure] = config.views;
  assert.ok(mine.hide.includes("Done"), "Done is hidden by default");
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
  for (const key of ["message", "review", "agent", "machine", "worktree"]) add(raw.start?.[key]);
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
  const { config, errors } = board.validateConfig({
    refreshMinutes: 0,
    start: { colour: "x" },
    views: [
      { id: "ok", name: "Ok", source: "github", layout: "list", sections: [{ name: "A", query: "is:pr" }] },
      { id: "ok", name: "Twice", source: "github", layout: "list", sections: [{ name: "A", query: "is:pr" }] },
      { name: "No id", source: "github", layout: "list", sections: [{ name: "A", query: "is:pr" }] },
      { id: "b", name: "Bad source", source: "jira", layout: "board" },
      { id: "c", name: "No project", source: "github", layout: "board" },
      { id: "d", name: "Azure list", source: "azure", layout: "list", sections: [{ name: "A", query: "x" }] },
      { id: "e", name: "No sections", source: "github", layout: "list" },
      { id: "f", name: "Bad hide", source: "github", layout: "board", project: { owner: "o", number: 1 }, hide: "Done" },
    ],
  });
  assert.deepEqual(config.views.map((v) => v.id), ["ok"]);
  assert.equal(config.refreshMinutes, 3);
  const text = errors.join("\n");
  for (const expected of [/refreshMinutes/, /start\.colour/, /„id“ ok gibt es schon/, /Ansicht 3 \(„No id“\): „id“ fehlt/, /„source“/,
    /„project“ braucht/, /Azure-Ansichten sind Boards/, /„sections“ braucht/, /„hide“ muss eine Liste/]) {
    assert.match(text, expected);
  }
});

test("validateConfig without any usable view gives no config", () => {
  const { config, errors } = board.validateConfig({ views: [] });
  assert.equal(config, null);
  assert.match(errors[0], /mindestens eine Ansicht/);
});

test("start settings merge defaults, start, the view's start and the repo's entry, in that order", () => {
  const config = sampleConfig();
  const s = board.startSettings(config, config.views[0], "example/tender");
  assert.equal(s.message, "/work {number}");
  assert.equal(s.checkout, "~/src/tender");
  assert.equal(s.machine, "server");
  assert.equal(s.base, "main");
  assert.equal(board.startSettings(config, config.views[2], "Example Project").checkout, "~/src/work");
  assert.equal(board.startSettings(config, config.views[2], "example/tender").checkout, "~/src/tender", "the repo's entry wins over the view's start");
  assert.equal(board.startSettings(config, config.views[0], "other/repo").checkout, null);
});

// ---- GitHub board (decisions 3, 6) ----

test("the board query leaves hidden columns out and counts them in the same request", () => {
  const args = board.githubBoardArgs(githubView(), new Set(["Backlog", "Done"]));
  const value = (name) => args[args.indexOf(args.find((a) => a.startsWith(`${name}=`)))].slice(name.length + 1);
  assert.equal(args.filter((a) => a === "graphql").length, 1);
  assert.equal(value("filter"), 'assignee:@me -status:"Backlog","Done"');
  assert.equal(value("h0"), 'assignee:@me status:"Backlog"');
  assert.equal(value("h1"), 'assignee:@me status:"Done"');
  assert.ok(args.includes("-F") && args.includes("number=7"));
  const doc = value("query");
  assert.match(doc, /h0: items\(first: 0, query: \$h0\)/);
  assert.match(doc, /items\(first: 100, query: \$filter\)/);
  assert.match(doc, /\$h1: String!/);
});

test("a board without hidden columns asks for no counts", () => {
  const args = board.githubBoardArgs({ ...githubView(), filter: "" }, new Set());
  assert.ok(args.includes("filter="));
  assert.doesNotMatch(args.find((a) => a.startsWith("query=")), /\$h0/);
});

test("columns come from the project's field options, in order, with theme colors", () => {
  const b = githubBoard();
  assert.deepEqual(b.columns.map((c) => c.name), ["Ohne Status", "Backlog", "Ready", "In progress", "In review", "Done"]);
  assert.deepEqual(b.columns.map((c) => c.color), ["dim", "ansi2", "ansi4", "ansi3", "ansi5", "ansi11"]);
  assert.deepEqual(b.meta, { projectId: "PVT_sample", fieldId: "PVTSSF_sample", title: "Sample", url: "https://github.com/users/sample-user/projects/7" });
});

test("hidden columns carry the server's count and no cards; shown ones their cards", () => {
  const b = githubBoard();
  const col = (name) => b.columns.find((c) => c.name === name);
  assert.deepEqual([col("Backlog").hidden, col("Backlog").count, col("Backlog").cards.length], [true, 265, 0]);
  assert.deepEqual([col("Done").hidden, col("Done").count], [true, 957]);
  assert.deepEqual(col("In progress").cards.map((c) => c.number), [2845, 1735]);
  assert.equal(col("In progress").count, 2);
  assert.deepEqual(col("Ready").cards.map((c) => c.title), ["fix(saves): a save sync no longer fails its uploads", "(kein Zugriff)"]);
  assert.equal(b.limited, false);
});

test("items without a status get their own column that takes no drops", () => {
  const none = githubBoard().columns[0];
  assert.equal(none.target, false);
  assert.deepEqual(none.cards.map((c) => [c.kind, c.title, c.number]), [["draft", "Draft: sort the release notes", null]]);
});

test("a card carries repo, number, title, labels, type, assignees, parent and sub-issues", () => {
  const card = board.findCard(githubBoard(), "PVTI_sample3").card;
  assert.equal(card.repoShort, "tender");
  assert.equal(card.repo, "example/tender");
  assert.deepEqual(card.labels, ["enhancement", "area:architecture"]);
  assert.deepEqual(card.assignees, ["sample-user"]);
  assert.deepEqual(card.sub, { total: 22, done: 15 });
  assert.equal(board.findCard(githubBoard(), "PVTI_sample1").card.parent, 2844);
});

test("parseGithubBoard says when the owner, project or field is missing", () => {
  const view = githubView();
  assert.throws(() => board.parseGithubBoard({ data: { repositoryOwner: null } }, view, new Set()), /kennt „sample-user“ nicht/);
  assert.throws(() => board.parseGithubBoard({ data: { repositoryOwner: { projectV2: null } } }, view, new Set()), /Projekt 7 von sample-user nicht gefunden/);
  const noField = json("github-board.json");
  noField.data.repositoryOwner.projectV2.field = null;
  assert.throws(() => board.parseGithubBoard(noField, view, new Set()), /kein Auswahlfeld „Status“/);
});

test("a board with more items than one page says it is cut", () => {
  const data = json("github-board.json");
  data.data.repositoryOwner.projectV2.items.pageInfo.hasNextPage = true;
  data.data.repositoryOwner.projectV2.items.totalCount = 290;
  const b = board.parseGithubBoard(data, githubView(), new Set(["Backlog", "Done"]));
  assert.deepEqual([b.limited, b.total], [true, 290]);
});

// ---- Status changes (decision 4) ----

test("a GitHub status change is one GraphQL mutation with the project, item, field and option ids", () => {
  const b = githubBoard();
  const card = board.findCard(b, "PVTI_sample2").card;
  const args = board.githubMoveArgs(b.meta, card, b.columns.find((c) => c.name === "In progress"));
  assert.deepEqual(args.slice(0, 2), ["api", "graphql"]);
  assert.ok(args.includes(`query=${board.MOVE_MUTATION}`));
  assert.match(board.MOVE_MUTATION, /updateProjectV2ItemFieldValue/);
  assert.deepEqual(args.filter((a, i) => args[i - 1] === "-f" && !a.startsWith("query=")),
    ["project=PVT_sample", "item=PVTI_sample2", "field=PVTSSF_sample", "option=opt-progress"]);
});

test("a mutation's answer must name the item it changed", () => {
  const card = board.findCard(githubBoard(), "PVTI_sample2").card;
  board.checkMoveResult(json("github-move.json"), card);
  assert.throws(() => board.checkMoveResult({ data: { updateProjectV2ItemFieldValue: null }, errors: [{ message: "Item not found" }] }, card), /Item not found/);
  assert.throws(() => board.checkMoveResult({}, card), /nicht bestätigt/);
});

test("moving a card changes its column and the counts, and moving back restores them", () => {
  const before = githubBoard();
  const moved = board.moveCard(before, "PVTI_sample2", "opt-progress");
  const col = (b, name) => b.columns.find((c) => c.name === name);
  assert.deepEqual(col(moved, "In progress").cards.map((c) => c.number), [2845, 1735, 2837]);
  assert.equal(col(moved, "Ready").count, 1);
  assert.equal(col(moved, "In progress").count, 3);
  assert.equal(board.findCard(moved, "PVTI_sample2").card.column, "opt-progress");
  assert.equal(col(before, "Ready").count, 2, "the board moved from stays as it was");
  const back = board.moveCard(moved, "PVTI_sample2", "opt-ready");
  assert.equal(col(back, "Ready").count, 2);
  assert.equal(col(back, "In progress").count, 2);
});

test("a card moved into a hidden column adds to its count and can come back", () => {
  const moved = board.moveCard(githubBoard(), "PVTI_sample1", "opt-done");
  const done = moved.columns.find((c) => c.name === "Done");
  assert.equal(done.count, 958);
  assert.deepEqual(board.shownColumns(moved, "").find((c) => c.name === "Done").shown, []);
  const back = board.moveCard(moved, "PVTI_sample1", "opt-progress");
  assert.equal(back.columns.find((c) => c.name === "Done").count, 957);
  assert.equal(board.findCard(back, "PVTI_sample1").column.name, "In progress");
});

test("moving to an unknown column, an unknown card or the same column changes nothing", () => {
  const b = githubBoard();
  assert.equal(board.moveCard(b, "PVTI_sample2", "nope"), b);
  assert.equal(board.moveCard(b, "nope", "opt-done"), b);
  assert.equal(board.moveCard(b, "PVTI_sample2", "opt-ready"), b);
});

test("moves made during a refresh are laid over its result", () => {
  const fresh = githubBoard();
  const b = board.applyMoves(fresh, [{ key: "PVTI_sample2", to: "opt-review" }, { key: "PVTI_sample3", to: "opt-ready" }]);
  assert.equal(board.findCard(b, "PVTI_sample2").column.name, "In review");
  assert.equal(board.findCard(b, "PVTI_sample3").column.name, "Ready");
});

// ---- Hidden columns, filter, keyboard (decisions 3, 7) ----

test("the person's toggles win over the view's hidden columns", () => {
  const view = githubView();
  assert.deepEqual([...board.hiddenColumns(view, null)], ["Backlog", "Done"]);
  assert.deepEqual([...board.hiddenColumns(view, ["Done"])], ["Done"]);
  assert.deepEqual([...board.hiddenColumns(view, [])], []);
  const shown = board.withHidden(githubBoard(), new Set(["Done"]));
  assert.deepEqual(shown.columns.filter((c) => c.hidden).map((c) => c.name), ["Done"]);
});

test("Azure hides the states of the view's hidden categories", () => {
  const { states } = board.parseAzureTypes(fixture("azure-types.json"));
  assert.deepEqual([...board.hiddenColumns(azureView(), null, states)], ["Done", "Removed"]);
});

test("the filter keeps cards holding every word, in title, number, repo, labels or assignee", () => {
  const cols = board.shownColumns(githubBoard(), "#2837 BUG");
  assert.deepEqual(cols.flatMap((c) => c.shown.map((x) => x.number)), [2837]);
  assert.deepEqual(board.shownColumns(githubBoard(), "epic area:arch").flatMap((c) => c.shown.map((x) => x.number)), [1735]);
  assert.equal(board.shownColumns(githubBoard(), "").flatMap((c) => c.shown).length, 6);
  assert.equal(board.shownColumns(githubBoard(), "nothing-like-this").flatMap((c) => c.shown).length, 0);
  assert.equal(board.shownColumns(githubBoard(), "#2837 epic").flatMap((c) => c.shown).length, 0, "one matching word is not enough");
});

test("j/k move within a column, h/l across columns and stubs, keeping the row", () => {
  const cols = board.shownColumns(githubBoard(), "");
  // Columns: 0 Ohne Status, 1 Backlog (stub), 2 Ready, 3 In progress, 4 In review, 5 Done (stub).
  let sel = { col: 3, key: "PVTI_sample1" };
  sel = board.navigate(cols, sel, "down");
  assert.deepEqual(sel, { col: 3, key: "PVTI_sample3" });
  assert.deepEqual(board.navigate(cols, sel, "down"), sel, "stops at the last card");
  sel = board.navigate(cols, sel, "left");
  assert.deepEqual(sel, { col: 2, key: "PVTI_sample5" });
  sel = board.navigate(cols, sel, "left");
  assert.deepEqual(sel, { col: 1, key: null }, "a stub takes the selection without a card");
  assert.deepEqual(board.navigate(cols, { col: 5, key: null }, "right"), { col: 5, key: null });
  assert.deepEqual(board.navigate(cols, { col: 1, key: null }, "up"), { col: 1, key: null }, "up and down on a stub stay there");
  assert.deepEqual(board.navigate([], null, "down"), { col: 0, key: null });
});

// ---- PR list (decision 2) ----

test("the PR list is one GraphQL request with one search per section", () => {
  const args = board.githubListArgs(listView());
  assert.equal(args.filter((a) => a.startsWith("query=")).length, 1);
  assert.match(args.find((a) => a.startsWith("query=")), /s0: search\(type: ISSUE, first: 50, query: \$q0\)[\s\S]*s1: search/);
  assert.ok(args.includes("q0=is:pr review-requested:@me"));
  assert.ok(args.includes("q1=is:pr author:@me"));
});

test("PR sections hold their rows once, with checks, review state and branch", () => {
  const list = board.parseGithubList(json("github-list.json"), listView());
  assert.deepEqual(list.sections.map((s) => [s.name, s.count, s.rows.map((r) => r.number)]), [
    ["Review", 1, [2820]],
    ["Mine", 4, [1921, 808, 77]],
  ]);
  assert.equal(list.sections[1].limited, false);
  const [review] = list.sections[0].rows;
  assert.deepEqual([review.repoShort, review.author, review.review, review.branch, review.checks.short, review.checks.text],
    ["tender", "sample-contributor", "noch kein Review", "pr/desktop-emulation-card", "✓ 15", "15 bestanden · 3 übersprungen"]);
  const [release, draft, failing] = list.sections[1].rows;
  assert.deepEqual([release.checks.state, release.checks.short], ["pending", "◷ 2"]);
  assert.deepEqual([draft.review, draft.checks.state, draft.checks.text], ["Entwurf", "none", "keine Checks"]);
  assert.deepEqual([failing.review, failing.checks.state, failing.checks.text], ["Änderungen gewünscht", "failed", "3 bestanden · 2 fehlgeschlagen"]);
});

test("a section whose search came back empty-handed is an error", () => {
  assert.throws(() => board.parseGithubList({ data: { s0: { issueCount: 0, nodes: [] } } }, listView()), /„is:pr author:@me“/);
});

// ---- Errors surface (constraint: no silent catch) ----

test("gh's failures become messages: not signed in, missing scope, rate limit, network, GraphQL", () => {
  assert.match(board.ghFailure({ code: 4, stdout: "", stderr: fixture("gh-no-login.txt") }).message, /nicht angemeldet: gh auth login/);
  const scope = { code: 1, stdout: fixture("github-scope-error.json"), stderr: "gh: Your token has not been granted the required scopes" };
  assert.match(board.ghFailure(scope).message, /Scope „project“/);
  assert.match(board.ghFailure({ code: 1, stdout: fixture("github-rate-limited.json"), stderr: "" }).message, /Ratenlimit/);
  assert.match(board.ghFailure({ code: 1, stdout: "", stderr: "HTTP 403: API rate limit exceeded for user" }).message, /Ratenlimit/);
  assert.match(board.ghFailure({ code: 1, stdout: "", stderr: "error connecting to api.github.com" }).message, /nicht erreichbar/);
  const graphql = { code: 1, stdout: '{"errors":[{"message":"Field \'nope\' doesn\'t exist on type \'Query\'"}]}', stderr: "gh: Field 'nope' doesn't exist" };
  assert.equal(board.ghFailure(graphql).message, "Field 'nope' doesn't exist on type 'Query'");
  assert.equal(board.ghFailure({ code: 2, stdout: "", stderr: "" }).message, "gh endete mit 2");
});

test("a tool that cannot run, or runs out of time, says so; a missing az makes its view unavailable", () => {
  const missing = board.execRejection("az", new Error("failed to start az: No such file or directory (os error 2)"), 60000);
  assert.deepEqual([missing.message, missing.unavailable], ["az ist nicht installiert", true]);
  const gh = board.execRejection("gh", new Error("program not found"), 30000);
  assert.deepEqual([gh.message, gh.unavailable], ["gh ist nicht installiert", false]);
  assert.equal(board.execRejection("gh", new Error("timed out after 30000 ms"), 30000).message, "gh antwortete nicht in 30 s");
  assert.match(board.execRejection("gh", new Error("machine unreachable"), 30000).message, /ließ sich nicht starten: machine unreachable/);
});

test("az's failures: not signed in and a missing extension make the view unavailable, others are errors", () => {
  const login = board.azFailure({ code: 1, stderr: "ERROR: Before you can run Azure DevOps commands, you need to run the login command(az login if using AAD/MSA identity else az devops login if using PAT token) to setup credentials." });
  assert.deepEqual([login.unavailable, /nicht angemeldet/.test(login.message)], [true, true]);
  const ext = board.azFailure({ code: 2, stderr: "ERROR: 'boards' is misspelled or not recognized by the system." });
  assert.deepEqual([ext.unavailable, /azure-devops/.test(ext.message)], [true, true]);
  const other = board.azFailure({ code: 1, stderr: "ERROR: TF401232: Work item 9 does not exist, or you do not have permissions to read it." });
  assert.deepEqual([other.unavailable, other.message], [false, "TF401232: Work item 9 does not exist, or you do not have permissions to read it."]);
});

// ---- Azure (decisions 2, 3, 4) ----

test("az's configured defaults give the organization and project", () => {
  assert.deepEqual(board.parseAzureDefaults(fixture("azure-defaults.txt")), { organization: "https://dev.azure.com/example-org/", project: "Example Project" });
  assert.deepEqual(board.parseAzureDefaults("[defaults]\n"), { organization: null, project: null });
});

test("Azure states come from the work item types, in category order", () => {
  const { states, types } = board.parseAzureTypes(fixture("azure-types.json"));
  assert.deepEqual(states.map((s) => s.name), ["To Do", "New", "Approved", "In Progress", "Committed", "Done", "Removed"]);
  assert.deepEqual(types.Task, ["To Do", "In Progress", "Done", "Removed"]);
  assert.equal(states.find((s) => s.name === "Committed").color, "ansi4");
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

test("Azure work items become cards in the states of their types", () => {
  const types = board.parseAzureTypes(fixture("azure-types.json"));
  const hidden = new Set(["Done", "Removed"]);
  const b = board.parseAzureBoard(fixture("azure-items.json"), types, hidden);
  assert.deepEqual(b.columns.map((c) => [c.name, c.hidden]), [
    ["To Do", false], ["New", false], ["Approved", false], ["In Progress", false], ["Committed", false], ["Done", true], ["Removed", true],
  ]);
  const task = board.findCard(b, "az-101");
  assert.deepEqual([task.column.name, task.card.assignees, task.card.type, task.card.repoShort], ["In Progress", ["Sample Person"], "Task", "Example Project"]);
  assert.equal(task.card.url, "https://dev.azure.com/example-org/Example%20Project/_workitems/edit/101");
  const bug = board.findCard(b, "az-102").card;
  assert.deepEqual([bug.assignees, bug.labels], [["Sample Person"], ["import", "data"]]);
  assert.equal(bug.url, "https://dev.azure.com/example-org/Example%20Project/_workitems/edit/102");
});

test("az printing nothing means no work items, not an error", () => {
  const b = board.parseAzureBoard("", board.parseAzureTypes(fixture("azure-types.json")), new Set());
  assert.equal(b.total, 0);
  assert.equal(b.columns.length, 7);
});

test("an Azure state change is az boards work-item update --state", () => {
  const b = board.parseAzureBoard(fixture("azure-items.json"), board.parseAzureTypes(fixture("azure-types.json")), new Set());
  const card = board.findCard(b, "az-102").card;
  const args = board.azureMoveArgs(azureView(), card, b.columns.find((c) => c.name === "Committed"));
  assert.deepEqual(args.slice(0, 7), ["boards", "work-item", "update", "--id", "102", "--state", "Committed"]);
  assert.ok(args.includes("--detect"));
});

// ---- Starting an agent (decision 5) ----

test("branch type and slug come from the title, the issue type or its labels", () => {
  const card = (title, extra = {}) => ({ title, labels: [], type: null, ...extra });
  assert.equal(board.branchType(card("fix(saves): a save sync")), "fix");
  assert.equal(board.branchType(card("Sync breaks", { labels: ["bug"] })), "fix");
  assert.equal(board.branchType(card("Sync breaks", { type: "Bug" })), "fix");
  assert.equal(board.branchType(card("Write the guide", { labels: ["documentation"] })), "docs");
  assert.equal(board.branchType(card("Whatever: not a type")), "feat");
  assert.equal(board.slugify("fix(saves): a save sync of a ROM RomM no longer has says so instead of failing"), "a-save-sync-of-a-rom-romm-no-longer-has");
  assert.equal(board.slugify("Größe ändern: Über-Ansicht"), "groesse-aendern-ueber-ansicht");
  assert.equal(board.slugify("!!!"), "item");
});

test("template variables fill the branch, worktree folder and first message", () => {
  const config = sampleConfig();
  const view = config.views[0];
  const card = board.findCard(githubBoard(), "PVTI_sample2").card;
  const settings = board.startSettings(config, view, card.repo);
  const vars = board.templateVars(card, settings);
  assert.equal(vars.branch, "fix/2837-a-save-sync-no-longer-fails-its-uploads");
  assert.equal(board.renderTemplate(settings.worktree, vars), "~/src/tender.worktrees/fix/2837-a-save-sync-no-longer-fails-its-uploads");
  assert.equal(board.renderTemplate(settings.message, vars), "/work 2837");
  assert.equal(board.renderTemplate("{nope} {number}", vars), "{nope} 2837");
  assert.equal(board.renderTemplate(board.START_DEFAULTS.worktree, vars), "~/.herdr/worktrees/tender/fix-2837-a-save-sync-no-longer-fails-its-uploads");
  const pr = board.parseGithubList(json("github-list.json"), listView()).sections[0].rows[0];
  assert.equal(board.templateVars(pr, settings).branch, "pr/desktop-emulation-card", "a pull request keeps its head branch");
  const projectPr = board.findCard(githubBoard(), "PVTI_sample6").card;
  assert.deepEqual([projectPr.kind, projectPr.branch], ["pr", "feat/2844-remote-dev-loop"]);
  assert.equal(board.templateVars(projectPr, settings).branch, "feat/2844-remote-dev-loop", "so does one on a project board");
  assert.equal(board.templateVars({ ...projectPr, branch: null }, settings).branch, "feat/2850-wire-the-remote-target-into-the-dev-loop");
  assert.equal(board.templateVars(card, settings, "own/branch").branchDashed, "own-branch");
});

test("the worktree script gets checkout, base, branch and folder as arguments, never inside the script", () => {
  const settings = { ...board.START_DEFAULTS, checkout: "~/src/tender", worktree: "{checkout}.worktrees/{branch}" };
  const args = board.worktreeArgs(settings, { branch: "fix/1-x; rm -rf ~", checkout: "~/src/tender" });
  assert.deepEqual(args.slice(0, 2), ["-c", board.WORKTREE_SCRIPT]);
  assert.deepEqual(args.slice(2), ["board-worktree", "~/src/tender", "main", "fix/1-x; rm -rf ~", "~/src/tender.worktrees/fix/1-x; rm -rf ~"]);
});

test("an agent opens as a new space on its machine or a tab in a space there", () => {
  assert.deepEqual(board.startCommand({ open: "space", on: "server", folder: "/w", argv: ["claude"], task: "/work 1", name: "#1" }),
    ["space.new", { tab: "#1", machine: "server", folder: "/w", argv: ["claude"], task: "/work 1" }]);
  assert.deepEqual(board.startCommand({ open: "space", on: null, folder: "/w", argv: ["claude"], task: "", name: "#1" }),
    ["space.new", { tab: "#1", machine: "", folder: "/w", argv: ["claude"] }]);
  assert.deepEqual(board.startCommand({ open: "tab", on: null, folder: "/w", argv: ["claude"], task: "go", name: "#1", space: "s2" }),
    ["tab.new", { name: "#1", space: "s2", folder: "/w", argv: ["claude"], task: "go" }]);
});

test("a new tab goes to a space of the repo on that machine, else the shown one there", () => {
  const spaces = [
    { id: "a", machine: null, folder: "/home/me/src/other", active: true },
    { id: "b", machine: "server", folder: "/home/me/src/tender.worktrees/feat/9-x", active: false },
    { id: "c", machine: null, folder: "/home/me/src/tender", active: false },
  ];
  assert.equal(board.spaceForTab(spaces, null, "/home/me/src/tender").id, "c");
  assert.equal(board.spaceForTab(spaces, "server", "/home/me/src/tender").id, "b");
  assert.equal(board.spaceForTab(spaces, null, "/home/me/src/none").id, "a");
  assert.equal(board.spaceForTab(spaces, "laptop", "/home/me/src/tender"), null);
});

test("the start column is the view's, or on Azure the first in-progress state", () => {
  assert.equal(board.startColumn(githubView(), githubBoard()).id, "opt-progress");
  assert.equal(board.startColumn({ ...githubView(), startColumn: null }, githubBoard()), null);
  const az = board.parseAzureBoard(fixture("azure-items.json"), board.parseAzureTypes(fixture("azure-types.json")), new Set());
  assert.equal(board.startColumn(azureView(), az).name, "In Progress");
});

test("a card's agent is the space on its branch, the most urgent first", () => {
  const card = board.findCard(githubBoard(), "PVTI_sample1").card;
  const spaces = [
    { id: "x", branch: "feat/28450-other", folder: "/r/tender.worktrees/a", status: "blocked" },
    { id: "y", branch: "feat/2845-remote-target", folder: "/r/tender.worktrees/feat/2845-remote-target", status: "working" },
    { id: "z", branch: "fix/2845-again", folder: "/r/tender.worktrees/fix/2845-again", status: "blocked" },
    { id: "w", branch: "feat/2845-elsewhere", folder: "/r/atlas.worktrees/feat/2845-elsewhere", status: "blocked" },
  ];
  assert.equal(board.linkedSpace(card, spaces).id, "z");
  assert.equal(board.linkedSpace(card, spaces.slice(0, 2)).id, "y");
  assert.equal(board.linkedSpace(card, [spaces[1], spaces[3]]).id, "y", "a branch of the same number in another repo is not this card's");
  assert.equal(board.linkedSpace(card, []), null);
  const pr = board.parseGithubList(json("github-list.json"), listView()).sections[0].rows[0];
  assert.equal(board.linkedSpace(pr, [{ id: "p", branch: "pr/desktop-emulation-card", folder: "/x", status: "idle" }]).id, "p");
});

// ---- Times (decision 6) ----

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

// ---- The worktree script against a real git repo (decision 5) ----

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv(), stdio: ["ignore", "pipe", "pipe"] }).trim();
}
let home;
const gitEnv = () => ({ PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" });
function runScript(settings, branch) {
  const vars = { branch, checkout: settings.checkout };
  return spawnSync("sh", board.worktreeArgs(settings, vars), { encoding: "utf8", env: gitEnv() });
}

test("the worktree script makes, reuses and tracks worktrees from origin", (t) => {
  home = mkdtempSync(join(tmpdir(), "board-wt-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const origin = join(home, "origin.git");
  git(home, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  const seed = join(home, "seed");
  git(home, "clone", "--quiet", origin, seed);
  git(seed, "commit", "--quiet", "--allow-empty", "-m", "one");
  git(seed, "push", "--quiet", "origin", "main");
  git(seed, "switch", "--quiet", "-c", "pr/remote-only");
  git(seed, "commit", "--quiet", "--allow-empty", "-m", "on the pr branch");
  git(seed, "push", "--quiet", "origin", "pr/remote-only");
  mkdirSync(join(home, "src"));
  git(join(home, "src"), "clone", "--quiet", origin, "tender");
  git(seed, "switch", "--quiet", "main");
  git(seed, "commit", "--quiet", "--allow-empty", "-m", "two, after the clone");
  git(seed, "push", "--quiet", "origin", "main");
  const settings = { ...board.START_DEFAULTS, checkout: "~/src/tender", worktree: "{checkout}.worktrees/{branch}" };

  const made = runScript(settings, "fix/1-new");
  assert.equal(made.status, 0, made.stderr);
  const folder = join(home, "src/tender.worktrees/fix/1-new");
  assert.deepEqual(made.stdout.trim().split("\n"), [folder, join(home, "src/tender")]);
  assert.equal(git(folder, "log", "-1", "--format=%s"), "two, after the clone", "the new branch starts at the fetched origin/main");
  assert.equal(git(folder, "rev-parse", "--abbrev-ref", "HEAD"), "fix/1-new");

  const again = runScript(settings, "fix/1-new");
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.stdout.trim().split("\n")[0], folder, "an existing worktree of the branch is reused");

  const pr = runScript(settings, "pr/remote-only");
  assert.equal(pr.status, 0, pr.stderr);
  const prFolder = pr.stdout.trim().split("\n")[0];
  assert.equal(git(prFolder, "log", "-1", "--format=%s"), "on the pr branch", "a branch on origin is checked out, not made anew");
  assert.equal(git(prFolder, "rev-parse", "--abbrev-ref", "@{upstream}"), "origin/pr/remote-only");

  const missing = runScript({ ...settings, checkout: "~/src/none" }, "fix/2-x");
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /Kein Checkout unter .*src\/none/);

  const bad = runScript(settings, "fix/3 two words");
  assert.equal(bad.status, 4);
  assert.match(bad.stderr, /Ungültiger Branch-Name/);
  assert.ok(!existsSync(join(home, "src/tender.worktrees/fix/3 two words")));
});
