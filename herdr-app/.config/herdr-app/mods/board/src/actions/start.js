import { itemKey } from "../shared.js";

const NAME_MAX = 60;

// The tab's name, by which itemSessions (sessions.js) finds the session again.
export function sessionName(item) {
  const key = itemKey(item);
  const full = key ? `${key} ${item.title}` : item.title;
  return full.length <= NAME_MAX ? full : `${full.slice(0, NAME_MAX - 1)}…`;
}

// `{name}` placeholders filled from vars; unknown ones stay.
export function renderTemplate(template, vars) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (all, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : all));
}

export function templateVars(item) {
  const name = item.repo ?? "";
  const [owner, repo] = name.includes("/") ? name.split("/") : ["", name];
  return { number: item.number ?? "", title: item.title, url: item.url ?? "", owner, repo, key: itemKey(item) ?? "" };
}

// Sets dir to the folder $1 names, a leading ~ that machine's home.
const TO_DIR = "to_dir() { case $1 in \\~) dir=$HOME ;; \\~/*) dir=$HOME/${1#\\~/} ;; *) dir=$1 ;; esac; }";

// Prints the checkout's folder on the chosen machine ($1), or exits 3 when
// there is none.
export const CHECKOUT_SCRIPT = [
  TO_DIR,
  'to_dir "$1"',
  '[ -d "$dir" ] || { echo "Kein Checkout unter $dir" >&2; exit 3; }',
  'cd "$dir" && pwd',
].join("\n");

export const checkoutArgs = (checkout) => ["-c", CHECKOUT_SCRIPT, "board-checkout", checkout];

// Prints, per folder given ($@) by its place among them, "<place><tab><repo's
// folder>" for each folder directly beneath it that holds a .git (a folder,
// or a worktree's file); "<place><tab>" alone for a folder that is not
// there, "<place><tab><tab>" for one it cannot enter or list.
export const REPOS_SCRIPT = [
  TO_DIR,
  "i=0",
  'for f in "$@"; do',
  '  to_dir "$f"',
  '  if [ ! -d "$dir" ]; then printf \'%s\\t\\n\' "$i"',
  '  elif [ -r "$dir" ] && dir=$(cd "$dir" && pwd); then',
  '    for d in "$dir"/*/; do [ -e "$d.git" ] && printf \'%s\\t%s\\n\' "$i" "${d%/}"; done',
  "  else printf '%s\\t\\t\\n' \"$i\"; fi",
  "  i=$((i + 1))",
  "done",
  "exit 0",
].join("\n");

export const reposArgs = (folders) => ["-c", REPOS_SCRIPT, "board-repos", ...folders];

// REPOS_SCRIPT's answer for `folders` → { repos, missing, unreadable }:
// repos [{ key, name, folder, parent }] by name, then in the order of the
// folders; key the parent as views.json writes it and the repo's name (the
// same on every machine), folder where it is on that machine.
export function parseRepos(stdout, folders) {
  const repos = [];
  const missing = [];
  const unreadable = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const tab = line.indexOf("\t");
    const parent = folders[Number(line.slice(0, tab))];
    if (tab < 1 || parent === undefined) continue;
    const folder = line.slice(tab + 1);
    if (!folder) missing.push(parent);
    else if (folder === "\t") unreadable.push(parent);
    else {
      const name = folder.split("/").pop();
      repos.push({ key: `${parent.endsWith("/") ? parent : `${parent}/`}${name}`, name, folder, parent });
    }
  }
  repos.sort((a, b) => a.name.localeCompare(b.name));
  return { repos, missing, unreadable };
}

export const spacesOn = (allSpaces, on) => allSpaces.filter((s) => (s.machine ?? null) === (on ?? null));

export function preselectedSpace(here, name) {
  const wanted = String(name ?? "").toLowerCase();
  return (wanted && here.find((s) => s.name.toLowerCase() === wanted)) || here.find((s) => s.active) || here[0] || null;
}

// The app command that opens a session: [name, args].
export function startCommand({ on, folder, argv, task, name, space, spaceName }) {
  const common = { folder, argv, ...(task ? { task } : {}) };
  if (space) return ["tab.new", { name, space, ...common }];
  return ["space.new", { name: spaceName, tab: name, machine: on ?? "", ...common }];
}
