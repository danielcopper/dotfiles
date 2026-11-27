import { foldedName, itemKey } from "../shared.js";

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

export const NO_FOLDER = 3;

// Prints the folder $1 names on the chosen machine, or exits NO_FOLDER
// where there is none.
export const CHECKOUT_SCRIPT = [
  TO_DIR,
  'to_dir "$1"',
  `[ -d "$dir" ] || { echo "Kein Checkout unter $dir" >&2; exit ${NO_FOLDER}; }`,
  'cd "$dir" && pwd',
].join("\n");

export const checkoutArgs = (checkout) => ["-c", CHECKOUT_SCRIPT, "board-checkout", checkout];

// Prints, per folder given ($@) by its place among them,
// "<place><tab><git><tab><origin><tab><upstream><tab><repo's folder>" for
// each folder directly beneath it that holds a .git (a folder, or a
// worktree's file): origin and upstream the URLs of those remotes (empty
// where there is none, or where it holds a tab), git empty where git read
// them, else its exit status (127: no git); "<place><tab>" alone for a
// folder that is not there, "<place><tab><tab>" for one it cannot enter or
// list. A repo's folder whose path holds a line break is left out, as a
// line break would break the scan's lines, and named by
// "<place><tab><tab><tab><tab><tab><its path, each line break a ?>".
export const REPOS_SCRIPT = [
  TO_DIR,
  "tab=$(printf '\\t')",
  "nl='\n'",
  "i=0",
  'for f in "$@"; do',
  '  to_dir "$f"',
  '  if [ ! -d "$dir" ]; then printf \'%s\\t\\n\' "$i"',
  '  elif [ -r "$dir" ] && dir=$(cd "$dir" && pwd); then',
  '    for d in "$dir"/*/; do',
  '      [ -e "$d.git" ] || continue',
  '      case $d in *"$nl"*)',
  "        n=${d%/}",
  '        while :; do case $n in *"$nl"*) n=${n%%"$nl"*}?${n#*"$nl"} ;; *) break ;; esac; done',
  '        printf \'%s\\t\\t\\t\\t\\t%s\\n\' "$i" "$n"',
  "        continue ;;",
  "      esac",
  "      o= u=",
  '      r=$(git --git-dir="$d.git" config --local --get-regexp \'^remote\\.(origin|upstream)\\.url$\' 2>/dev/null)',
  "      s=$?",
  '      [ "$s" -gt 1 ] || s=',
  "      while read -r k v; do",
  '        case $v in *"$tab"*) v= ;; esac',
  "        case $k in remote.origin.url) o=$v ;; remote.upstream.url) u=$v ;; esac",
  "      done <<EOF",
  "$r",
  "EOF",
  '      printf \'%s\\t%s\\t%s\\t%s\\t%s\\n\' "$i" "$s" "$o" "$u" "${d%/}"',
  "    done",
  "  else printf '%s\\t\\t\\n' \"$i\"; fi",
  "  i=$((i + 1))",
  "done",
  "exit 0",
].join("\n");

export const reposArgs = (folders) => ["-c", REPOS_SCRIPT, "board-repos", ...folders];

const GITHUB_HOST = "github.com";
const AZURE_HOST = "dev.azure.com";
const AZURE_SSH_HOSTS = ["ssh.dev.azure.com", "vs-ssh.visualstudio.com"];
const OLD_AZURE_HOST = /\.visualstudio\.com$/;
const OLD_AZURE_COLLECTION = "defaultcollection";
const SCP_LIKE = /^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.+)$/;
const WITH_SCHEME = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d*)?\/(.+)$/i;

const unescaped = (part) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

export const azureRepoKey = (project, repo) => `${project}/${repo}`;

// An Azure DevOps remote's path → [project, repo]: .../_git/<repo> after
// its organisation (dev.azure.com/<org>, <org>.visualstudio.com with or
// without DefaultCollection) and its project, or without a project for the
// project's own repo; v3/<org>/<project>/<repo> over ssh.
function azureParts(host, parts) {
  if (AZURE_SSH_HOSTS.includes(host)) return parts[0] === "v3" ? [parts[2], parts[3]] : [];
  const git = parts.indexOf("_git");
  const org = host === AZURE_HOST || parts[0]?.toLowerCase() === OLD_AZURE_COLLECTION ? 1 : 0;
  return [git === org ? parts[git + 1] : parts[git - 1], parts[git + 1]];
}

// A remote's URL → the key of its repo: "owner/repo" on GitHub,
// "project/repo" on Azure DevOps (azureParts), "host/path" anywhere else;
// null for a URL of no host, a local path.
export function remoteKey(url) {
  const text = String(url ?? "").trim();
  const [, host, rest] = text.match(WITH_SCHEME) ?? text.match(SCP_LIKE) ?? [];
  if (!host) return null;
  const parts = rest.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\.git$/, "").split("/").filter(Boolean);
  const at = host.toLowerCase();
  if (at === AZURE_HOST || AZURE_SSH_HOSTS.includes(at) || OLD_AZURE_HOST.test(at)) {
    const [project, repo] = azureParts(at, parts);
    return project && repo ? azureRepoKey(unescaped(project), unescaped(repo)) : null;
  }
  if (parts.length < 2) return null;
  return at === GITHUB_HOST ? `${parts[0]}/${parts[1]}` : `${at}/${parts.join("/")}`;
}

const sameRepoKey = (a, b) => foldedName(a) === foldedName(b);
const NO_GIT = 127;

// REPOS_SCRIPT's answer for `folders` → { repos, missing, unreadable,
// remotesUnread, gitMissing, withLineBreak }: repos [{ key, folder,
// written }] by key, once per key of its origin and its upstream
// (remoteKey), or by its folder's name where neither has one; folder where
// it is on that machine, written that folder as views.json writes its repo
// folder. remotesUnread: [{ written, status }] for each repo whose remotes
// git did not read, with git's exit status; gitMissing where that is NO_GIT
// for every repo found; withLineBreak the repos left out for a line break
// in their path, as written.
export function parseRepos(stdout, folders) {
  const repos = [];
  const missing = [];
  const unreadable = [];
  const remotesUnread = [];
  const withLineBreak = [];
  let found = 0;
  for (const line of String(stdout ?? "").split("\n")) {
    const [place, ...fields] = line.split("\t");
    const parent = /^\d+$/.test(place) ? folders[Number(place)] : undefined;
    if (parent === undefined || !fields.length) continue;
    if (fields.length === 1 && !fields[0]) missing.push(parent);
    else if (fields.length === 2 && !fields[0] && !fields[1]) unreadable.push(parent);
    else if (fields[3]) {
      const [git, origin, upstream] = fields;
      const folder = fields.slice(3).join("\t");
      const name = folder.split("/").pop();
      const written = writtenIn(parent, folder);
      found++;
      if (git) remotesUnread.push({ written, status: Number(git) });
      const keys = [origin, upstream].map(remoteKey).filter(Boolean);
      for (const key of keys.length ? keys : [name]) {
        if (!repos.some((r) => r.folder === folder && sameRepoKey(r.key, key))) repos.push({ key, folder, written });
      }
    } else if (fields[4]) withLineBreak.push(writtenIn(parent, fields.slice(4).join("\t")));
  }
  const gitMissing = found > 0 && remotesUnread.length === found && remotesUnread.every((u) => u.status === NO_GIT);
  return { repos: sortedByKey(repos), missing, unreadable, remotesUnread, gitMissing, withLineBreak };
}

const writtenIn = (parent, folder) => `${parent.endsWith("/") ? parent : `${parent}/`}${folder.split("/").pop()}`;

const sortedByKey = (repos) => repos.sort((a, b) => a.key.localeCompare(b.key));

// The repos with a folder of their own (repoExceptions), each in place of
// those of its key the folders hold: { key, folder: null (looked up at the
// start, CHECKOUT_SCRIPT), written: its checkout }.
export function withExceptions(repos, exceptions) {
  const own = exceptions.map(([key, e]) => ({ key, folder: null, written: e.checkout }));
  return sortedByKey([...repos.filter((r) => !own.some((o) => sameRepoKey(o.key, r.key))), ...own]);
}

export const reposOfKey = (repos, key) => (typeof key === "string" ? repos.filter((r) => sameRepoKey(r.key, key)) : []);

export function sameKeyGroups(repos) {
  const groups = [];
  for (const r of repos) {
    const group = groups.find((g) => sameRepoKey(g[0].key, r.key));
    if (group) group.push(r);
    else groups.push([r]);
  }
  return groups.filter((g) => g.length > 1);
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
