// Builds the board's main.js from its modules in src/: `mise run
// herdr-board-build` (or `node build.mjs` here). herdr loads a stowed mod's
// main.js through its link but refuses a module that main.js imports when
// that module is a link out of the mod folder (README, "herdr app"), so the
// board is written as modules and shipped as the one file this builds.
// tests/herdr-app/board.test.mjs fails when main.js differs from a fresh
// build. Neither this file nor src/ is stowed (herdr-app/.stow-local-ignore).
//
// The build concatenates the modules' text as it stands, comments included,
// with no bundler: the shipped file reads like its sources, and nothing has
// to be downloaded to build it. The price is a few rules for the sources,
// which the build enforces:
// - A module imports only `import { a, b } from "./other.js";` (a module
//   in src/, by a relative path; a name it imports must be exported there,
//   and no `as`) or `import { … } from "<host module>";` for the modules
//   herdr provides (HOST). The entry, src/main.js, may also re-export a
//   module with `export * from "./other.js";`, so that src/main.js exports
//   what main.js does.
// - Imports stand at the top of a module, after its leading comment.
// - All modules share one scope in main.js: two modules must not declare the
//   same top-level name (node --check of the output catches it), and no
//   module may import itself through others.
// main.js is: a line that it is built, the entry's leading comment, the host
// imports (each host module's names from all modules, sorted), then each
// module after the modules it imports, in the order of its imports, the
// entry last, each under a line naming its file.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HOST = ["gpui-kit", "gpui-base", "herdr"];
const here = dirname(fileURLToPath(import.meta.url));
export const SRC = join(here, "src");
export const ENTRY = "main.js";
export const OUT = join(here, "main.js");
export const BANNER = "// Built from src/ by `mise run herdr-board-build`; edit the modules there, not this file.";

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";[ \t]*\n/;
const REEXPORT = /^export \* from "([^"]+)";[ \t]*\n/;
const EXPORTED = /^export (?:default )?(?:async )?(?:const|let|function\*?|class) ([A-Za-z_$][\w$]*)/gm;

class BuildError extends Error {}

// A module's leading comment (its first lines starting with //, and the
// blank line after them) and the rest.
function splitComment(text) {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("//")) i++;
  const comment = lines.slice(0, i).join("\n");
  while (i < lines.length && lines[i] === "") i++;
  return { comment, rest: lines.slice(i).join("\n") };
}

// A module read: { name, comment, body, local: [{ from, names, all }],
// host: [{ from, names }], exports }.
function readModule(src, name, entry) {
  const where = `src/${name}`;
  let text;
  try {
    text = readFileSync(join(src, name), "utf8");
  } catch (e) {
    throw new BuildError(`${where}: not readable (${e.code ?? e.message})`);
  }
  if (text.includes("\r")) throw new BuildError(`${where}: CRLF line endings`);
  const { comment, rest } = splitComment(text);
  const local = [];
  const host = [];
  let body = rest;
  for (;;) {
    const imp = body.match(IMPORT);
    const re = body.match(REEXPORT);
    if (imp) {
      const names = imp[1].split(",").map((n) => n.trim()).filter(Boolean);
      if (names.some((n) => !/^[A-Za-z_$][\w$]*$/.test(n))) throw new BuildError(`${where}: import { ${imp[1].trim()} }: plain names only`);
      if (HOST.includes(imp[2])) host.push({ from: imp[2], names });
      else if (imp[2].startsWith("./") || imp[2].startsWith("../")) local.push({ from: resolveName(name, imp[2], where), names, all: false });
      else throw new BuildError(`${where}: import from "${imp[2]}": only modules in src/ and ${HOST.join(", ")}`);
      body = body.slice(imp[0].length);
    } else if (re) {
      if (name !== entry) throw new BuildError(`${where}: export * only in the entry, src/${entry}`);
      local.push({ from: resolveName(name, re[1], where), names: [], all: true });
      body = body.slice(re[0].length);
    } else break;
  }
  body = body.replace(/^\n+/, "");
  const stray = body.match(/^(import\b.*|export \*.*|export \{.*)$/m);
  if (stray) throw new BuildError(`${where}: "${stray[1]}": imports belong at the top, in the forms build.mjs names`);
  if (name !== entry && /^export default\b/m.test(body)) throw new BuildError(`${where}: export default only in the entry, src/${entry}`);
  const exports = new Set([...body.matchAll(EXPORTED)].map((m) => m[1]));
  return { name, comment, body, local, host, exports };
}

// resolveName works on names relative to src/; any absolute root will do.
const SRC_ROOT = "/src";

// A relative import's module name under src/, checked to stay there.
function resolveName(from, spec, where) {
  if (!spec.endsWith(".js")) throw new BuildError(`${where}: import "${spec}": name the file with its .js`);
  const name = relative(SRC_ROOT, resolve(SRC_ROOT, dirname(from), spec));
  if (name.startsWith("..")) throw new BuildError(`${where}: import "${spec}" leaves src/`);
  return name.split("\\").join("/");
}

// main.js's text from the modules under `src` (default: src/ beside this
// file). Throws a BuildError naming what is wrong.
export function build(src = SRC) {
  const modules = new Map();
  const order = [];
  const visiting = [];
  const visit = (name) => {
    if (visiting.includes(name)) throw new BuildError(`import cycle: ${[...visiting.slice(visiting.indexOf(name)), name].map((n) => `src/${n}`).join(" → ")}`);
    if (modules.has(name)) return modules.get(name);
    visiting.push(name);
    const mod = readModule(src, name, ENTRY);
    for (const dep of mod.local) {
      const target = visit(dep.from);
      const missing = dep.names.filter((n) => !target.exports.has(n));
      if (missing.length) throw new BuildError(`src/${name}: src/${dep.from} does not export ${missing.join(", ")}`);
    }
    visiting.pop();
    modules.set(name, mod);
    order.push(mod);
    return mod;
  };
  const entry = visit(ENTRY);
  const host = new Map(HOST.map((h) => [h, []]));
  for (const mod of order) {
    for (const imp of mod.host) for (const n of imp.names) if (!host.get(imp.from).includes(n)) host.get(imp.from).push(n);
  }
  const hostLines = HOST.filter((h) => host.get(h).length).map((h) => `import { ${host.get(h).sort().join(", ")} } from "${h}";`);
  const parts = [BANNER, ...(entry.comment ? ["", entry.comment] : []), "", ...hostLines];
  for (const mod of order) {
    const head = mod === entry ? [] : mod.comment ? [mod.comment, ""] : [];
    parts.push("", `// ==== src/${mod.name} ====`, "", ...head, mod.body.replace(/\n+$/, ""));
  }
  return `${parts.join("\n")}\n`;
}

// Run as a script: write main.js and check that node can parse it (two
// modules declaring one name fail here).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    writeFileSync(OUT, build());
  } catch (e) {
    if (!(e instanceof BuildError)) throw e;
    console.error(`herdr-board-build: ${e.message}`);
    process.exit(1);
  }
  const check = spawnSync(process.execPath, ["--check", OUT], { encoding: "utf8" });
  if (check.status !== 0) {
    console.error(`herdr-board-build: node --check ${OUT} failed:\n${check.stderr}`);
    process.exit(1);
  }
  console.log(`herdr-board-build: wrote ${OUT}`);
}
