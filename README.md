# dotfiles

Personal configuration files, managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Install / update

```bash
git clone git@github.com:danielcopper/dotfiles.git ~/dotfiles
cd ~/dotfiles
./bootstrap.sh <class>
```

Where `<class>` is one of `arch`, `debian`, `steamdeck`, `wsl-arch`. A `debian` host clones over HTTPS and has steps of its own ("Debian server" below).

The clone has to live at `~/dotfiles`: the commit-on-main allowlist (`git/.githooks/commit-on-main-allowed`) and, on wsl-arch, the personal git identity (`includeIf "gitdir:~/dotfiles/"` in `host-wsl-arch/.gitconfig.local`) match that path, and the mise tasks `dotfiles-pull`, `dotfiles-relink`, `herdr-app-check`, `herdr-board-test`, `memex-sync-test`, `install-dotfiles-test` and `shell-test` use it unless `DOTFILES_DIR` is set.

`bootstrap.sh` is the only command needed — same call on a fresh machine and after pulling changes. The whole pipeline is idempotent: pacman runs with `--needed`, apt leaves installed packages alone unless a newer version is available, brew skips already-installed packages and `upgrade`s new versions, flatpak's `--noninteractive` is a no-op on installed apps, and stow re-links while moving what is in the way of a package file into a timestamped backup under `~/.dotfiles-pre-stow.<ts>/`, as below.

Some directories have to be real directories in `$HOME`, never one link into this repo: each one that more than one of the stowed packages fills, such as `~/.config/environment.d` (`mise` and, on arch and debian, the class's host package), every directory of `herdr-app`, and a few more, listed with their reasons in `stow-packages.sh`. Once a second package fills a directory that an earlier run folded into one link, `stow -R` aborts; the header of `stow-packages.sh` says why. So `stow-packages.sh`, which `install-dotfiles.sh` and `mise run dotfiles-relink` stow through, makes each of them real before it stows:

- A link of one to its own path in a package of this clone or one of its worktrees becomes a real directory. What git does not track there moves into it, a reference copy such as Claude Code's `settings.json` is copied in as the live file, and the run lists both first, with the worktree they come from. All of it goes into `<directory>.unfolding` beside the link, which takes the link's place only once everything is in it.
- A stop before that swap leaves the link, says what stayed where and fails the run, and the next run picks up from the staging directory, saying what it already holds; a directory that is staged and back in the repo is merged. A file that is both staged and back in the repo is named with both paths, and the runs stop until it is merged into the staged one. A staging directory left after the link is gone is put in its place by the next run; where the directory exists again by then, the run names both for you to merge and stops. Where a file, a link to one or a dangling link stands in its place, the run leaves both alone and says to move it elsewhere; the next run then puts the staging directory in its place. A run checks the staging directories only of the directories it handles, those of the packages it is given: `mise run dotfiles-relink claude` does not see one beside `~/.config/environment.d`, while `install-dotfiles.sh` passes all packages of the class.
- What the app writes through the link while the run fills the staging directory is moved in after the swap, a directory merged with the one already moved. A file the new directory has too goes into the staging directory instead: the run stows, names both paths and fails, and the next runs stop on the staging directory until it is merged and gone. A reference copy that changed after it was copied is named.
- A top-level link to a package path in another worktree, or in another package of this one, is made real the same way when it is a directory, so what git does not track there moves along; a link to a file is dropped and linked again from here. A dangling top-level link into a worktree of this repo is removed, and any other top-level link, except stow's own into this package, is left alone, both as below. Where the package has a file, such a link that does not lead into this repo, such as one to a file outside it or one dangling outside the worktrees, goes into the backup instead with `--backup`, named in one line, unless a staging directory sits beside it, which the run names with what to do; without `--backup`, its line says to remove or move it and run again. A staging directory beside a top-level directory not listed is put in its place as above; where that directory is still the link stow folded into this package, the run says that what is moved into it lands in the repo, names what the app already wrote through it, says to move that into the staging directory and remove the link, and stops. A staging directory beside a top-level entry the package has as a file is left alone and named, again at the end, and the run fails after stow.
- A dangling link into any worktree of this repo, the main checkout, a registered worktree or one under `<main checkout>.worktrees/` or `.worktrees/`, is removed: nothing is behind it. The same goes for the live file of a reference copy.
- Anything else in such a place, a link elsewhere, a dangling link outside the worktrees or a file, is left alone with everything below it, the backup included, apart from the top-level links the bullet above sends into the backup; the run says so in one line, and stow names the conflict.
- Should stowing all packages together fail, each is stowed alone, and the run names the ones that still fail. A run that stops before stow names the directories it made real, whose package links are missing until a run gets through.

After stow, the live file of each reference copy that has none yet is seeded from the repo, as Claude Code's `settings.json` and herdr's are. `install-dotfiles.sh` passes `--backup`, so what is in the way of a package file, a file or a link that does not lead into this repo, goes into the backup, unless it is a top-level link with a staging directory beside it; `mise run dotfiles-relink` does not, and stow's conflict stops it there, the run saying to remove or move such a top-level link.

A `mise install` that fails does not stop the steps after it: the run ends with exit 1 and names it.

## Layout

| path | purpose |
|---|---|
| `bash/`, `git/`, `nvim/`, `tmux/`, `wezterm/`, … | Stow packages — one per app. Each mirrors the target tree under `$HOME`. |
| `host-<class>/` | Per-host packages holding `.local` addenda (`.bashrc.local`, `.gitconfig.local`) and class-specific overrides where merge isn't possible (e.g. the NVIDIA wireplumber tweak on arch). Claude Code's `settings.json` is not among them: the `claude` package keeps a reference copy that `stow-packages.sh` seeds into `~/.claude/settings.json` once, and that live file then drifts per machine (`CLAUDE.md`, "Claude config lives here"). |
| `packages/common.pkglist`, `packages/arch.pkglist`, `packages/wsl-arch.pkglist` | Pacman lists: `common.pkglist` plus the class's own, for the arch and wsl-arch classes. Blank lines and `#` comments ignored. |
| `packages/debian.pkglist` | Apt list for the debian class, used instead of `common.pkglist`, whose names are Arch's. |
| `packages/steamdeck.brewlist` | Linuxbrew list — SteamOS root is read-only, so steamdeck uses brew instead of pacman. `install-packages.sh` bootstraps brew if missing. |
| `packages/steamdeck.flatpaklist` | Flatpak app list for steamdeck — for apps that ship as macOS-only Homebrew Casks (wezterm) and need a Linux install path. Installed user-scope from flathub. |
| `install-packages.sh <class>` | Install / update OS packages (pacman on arch / wsl-arch, apt on debian, brew + flatpak on steamdeck). |
| `install-dotfiles.sh <class>` | Symlink the relevant stow packages into `$HOME`. Worktree-aware; backs up real conflicts. |
| `stow-packages.sh [--backup] <pkg>…` | Makes the directories real that must be ("Install / update"), stows the given packages and seeds missing live files of reference copies; with `--backup` it first moves conflicting files into the backup. `install-dotfiles.sh` and `mise run dotfiles-relink` stow through it. |
| `bootstrap.sh <class>` | Wrapper that runs both `install-packages.sh` and `install-dotfiles.sh`. |
| `samples/` | Snapshots that aren't dotfiles and aren't stow-managed (SDDM theme + login wallpapers — they live under `/usr/share/sddm/`, manual root deploy). Kept in repo as a record. |
| `tests/` | Tests for scripts in this repo (`tests/memex-sync/`, `tests/install-dotfiles/`), for the Claude Code status line's width (`tests/statusline/width.sh`) and the bash startup (`tests/bash/startup.sh`), the herdr app's command check and board mod (`tests/herdr-app/`), and `run-listed.sh`, which routes case names for the three test tasks. Not a stow package: `install-dotfiles.sh` stows only the packages it lists. |
| `.stowrc` | Default stow flags (`--target=~`, ignores `install-*.sh`, `bootstrap.sh`, `packages/`, `samples/`, `host-*/`). |

## Adding or changing a file

**Shared across all hosts:**

```bash
mv ~/.config/<app>/<file> <app>/.config/<app>/<file>
mise run dotfiles-relink <app>
```

**New stow package:**

1. Create the package directory at repo root, mirroring the target path: `<pkg>/.config/<pkg>/…` (or `<pkg>/.<file>` for `$HOME`-level dotfiles).
2. Add `<pkg>` to `install-dotfiles.sh`'s `common_pkgs` array, to `desktop_pkgs` if it configures a GUI app (every class but the headless `debian`), or to a class-specific `class_pkgs` if it should only land on certain hosts.
3. `mise run dotfiles-relink <pkg>` to symlink it immediately.

**Class-specific tweak to a mostly-shared file:**

```bash
printf '\nexport PATH="$HOME/extra:$PATH"\n' >> host-arch/.bashrc.local
mise run dotfiles-relink host-arch
```

## Debian server

The `debian` class is for a headless Debian 13 server: a shell, git, mise and
the terminal tools, without the GUI packages `wezterm` and `herdr-app`. Its
packages come from apt (`packages/debian.pkglist`), mise from mise's own apt
repository, which `install-packages.sh` enables. Neovim and the tree-sitter
CLI come from mise, as Debian ships both too old for the nvim config;
`host-debian/.config/mise/conf.d/debian.toml` says which versions.

The host needs git and gh, gh logged in with HTTPS as its git protocol and
`gh auth setup-git` run; the repo is cloned over HTTPS:

```bash
gh repo clone danielcopper/dotfiles ~/dotfiles
cd ~/dotfiles
./bootstrap.sh debian
exec bash -l
```

`bootstrap.sh` asks for the sudo password once. `gh auth setup-git` has written
`~/.gitconfig` with gh's credential helper, and Debian puts its own `~/.bashrc`
into a new home; the stow run moves both into `~/.dotfiles-pre-stow.<ts>/` and
says so. `host-debian/.gitconfig.local` carries the same credential sections
for github.com and gist.github.com, so check the backed-up `.gitconfig` for
anything else and carry that over by hand.

**Commit signing.** The shared `.gitconfig` signs every commit and tag, and
`host-debian/.gitconfig.local` points it at `~/.ssh/id_ed25519_signing.pub`;
until that key exists, every commit fails. Create it without a passphrase:
the coding agents on this host commit unattended, and nobody is there to type
one.

```bash
ssh-keygen -t ed25519 -N '' -C "daniel@$(hostname) signing" -f ~/.ssh/id_ed25519_signing
cat ~/.ssh/id_ed25519_signing.pub
```

GitHub shows such commits as verified once the public key is added to the
account as a signing key, in GitHub's web settings as
[Adding a new SSH key to your GitHub account](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)
describes, with the key type for signing. Not with `gh ssh-key add`: that
needs a token with the `admin:ssh_signing_key` scope, and the gh login on the
server has no admin scopes. To commit unsigned instead, swap the two lines
`host-debian/.gitconfig.local` names.

**GitHub over SSH.** After the bootstrap, switch git to SSH for GitHub, as
on the Deck; gh keeps its token for the API. The token has no `workflow` scope,
so over HTTPS a push that touches `.github/workflows/` is refused. On the
Minisforum the homelab playbook pins GitHub's host keys in
`/etc/ssh/ssh_known_hosts`; on another server the first connection asks to
accept them (check them against GitHub's published fingerprints). The login
key, again without a passphrase, and its entry are made by hand:

```bash
ssh-keygen -t ed25519 -N '' -C "daniel@$(hostname) github" -f ~/.ssh/id_ed25519_github
printf 'Host github.com\n    IdentityFile ~/.ssh/id_ed25519_github\n    IdentitiesOnly yes\n' >> ~/.ssh/config
gh config set -h github.com git_protocol ssh
cat ~/.ssh/id_ed25519_github.pub
```

Add the public key on GitHub as an authentication key (same page as above,
key type "Authentication Key"); `ssh -T git@github.com` then greets you by
name. Clones made over HTTPS before, this one included, switch with
`git remote set-url origin git@github.com:<owner>/<repo>.git`.

**ssh-agent.** Debian's `openssh-client` ships a user `ssh-agent.socket`,
enabled for every user, that points the user manager's `SSH_AUTH_SOCK` at
`$XDG_RUNTIME_DIR/openssh_agent` and starts `ssh-agent.service` on the first
connection. The `systemd` package replaces that service with the agent every
class uses, on `$XDG_RUNTIME_DIR/ssh-agent.socket`, which never takes the
socket's connections. Before it reads a signing key file, ssh-keygen asks the
agent at `SSH_AUTH_SOCK` for the key, and a socket nobody answers makes that
question wait forever: a user service that commits waits with it.
`host-debian` masks the socket with an empty
`~/.config/systemd/user/ssh-agent.socket` and, as `host-arch` does, points
`SSH_AUTH_SOCK` at the repo's agent in `~/.config/environment.d/ssh-agent.conf`,
which the user manager reads when it starts or reloads; `.bashrc` points the shell at the
same agent. On a host where the socket already ran, stop it before the stow,
which clears the variable, and set it until the user manager's next start:

```bash
systemctl --user stop ssh-agent.socket
systemctl --user set-environment SSH_AUTH_SOCK="$XDG_RUNTIME_DIR/ssh-agent.socket"
```

**Forgejo.** git takes the credentials for `https://git.kueppermann.com` from
`~/.git-credentials`. git's store helper fills it the first time the token is
entered, or it is written directly when the token is set up; this repo does
not write it.

**memex.** The class stows the memex sync; the clone, the `~/Memory` link
and the two units to enable are in "memex sync", "On the Debian server".

**Claude Code** is installed by hand, as on every host, with its native
installer into `~/.local/bin/claude`; `claude` then signs in.

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

## herdr app

The herdr desktop app comes from its official installer script into
`~/.local/share/herdr-app`; this repo does not install it. The `herdr-app`
package carries the config that is mine: `keys.json` (the shipped defaults plus
`ctrl-space` for the leader mod, and a `mod:leader` section that hands the
leader a second `ctrl-space` and `Esc`), the mods `mods/leader/` (its `f`
opens a second level for files: `f f` and `f g`, the keys of nvim's
`<leader>ff` and `<leader>fg`, open the file popup, `f e` and `f G` show the
right panel on Files or Changes; `Z` switches that panel between its normal
width and about two thirds of the space beside the sidebar; `ctrl-space
ctrl-space <key>` is for a tmux in the focused terminal, see below),
`mods/focus-history/` (it remembers the previously focused pane for the
leader's `Tab`), `mods/file-popup/` (a popup with the files of the focused
pane's repo or folder, or with the repo's changed files, that opens the
picked one in nvim in a new pane on the right) and `mods/board/` (the
"Arbeit" tab the leader's `b` opens, see below), the layout
`layouts/personal.json` (herdr's `main`, cloned, plus an empty block that
keeps focus-history running; its right panel has no maximum width) and the
theme `themes/catppuccin-mocha.json`.
Everything else in `~/.config/herdr-app` is herdr's own. `stow-packages.sh`
stows the package without folding (the reason is in its comment on
`no_folding_pkgs`), so relink it
with `mise run dotfiles-relink herdr-app` rather than a bare `stow -R
herdr-app`. Which files of the package git tracks is set in the root
`.gitignore`.

- **`settings.json` is a reference copy, not stowed.** herdr replaces
  `~/.config/herdr-app/settings.json` whenever it saves zoom or a Settings
  page, so a stow link there would become a local file. The reference keeps
  only `telemetry` and `theme`; zoom, font sizes and sounds are per device.
  `stow-packages.sh` seeds the live file from it when none exists, and
  after that the two drift: `diff ~/.config/herdr-app/settings.json
  herdr-app/.config/herdr-app/settings.json` shows what each has; copy across
  by hand and commit the reference when you want to keep a change.
- **On WSL, Windows needs a system-wide entry.** WSLg reads the Start menu and
  taskbar icon only from desktop entries under `/usr/share` or `/usr/local/share`,
  not from the installer's `~/.local/share/applications`. `install-dotfiles.sh
  wsl-arch` installs one under `/usr/local/share` with a PNG icon rendered from
  the app's SVG; run it again after the app's installer, and once more `wsl
  --shutdown` if `/usr/local/share/applications` did not exist before.
- **`keys.json` is edited, so it stays mine.** herdr refreshes only an
  untouched keys file on upgrade; new default shortcuts have to be added by
  hand.
- **herdr reloads only what changes in `~/.config/herdr-app` itself.** An
  edit to a linked file, in this repo or through its link there, changes the
  file in this repo, which herdr does not watch, so the running app keeps the
  old version. After such an edit, `touch -h` the link in
  `~/.config/herdr-app` (e.g. `touch -h
  ~/.config/herdr-app/mods/leader/main.js`) and herdr reloads it.
- **A fresh machine has to pick the layout once.** Which layout is shown
  lives in herdr's own `shared.json`: `herdr-app do layout.switch
  '{"name":"personal"}'`, or the palette.
- **A mod here is one `main.js`.** herdr loads a mod's `main.js` through
  stow's link, but refuses a module that `main.js` imports when that module
  is a link out of the mod folder, which every stowed file is. So
  `mods/file-popup/` keeps its listers in `main.js` rather than in a
  `./list.js`.
- **herdr's `run` answers ok for a command it does not know,** so a mod
  that runs a misspelt one fails without a word. `mise run herdr-app-check`
  checks the commands this package's mods and `keys.json` use against the
  ones herdr documents, and the mods they open against the ones that exist;
  run it after changing a mod or a key. It needs python3 and a herdr app
  that has started once, since herdr writes the files it reads into
  `~/.config/herdr-app`. The header of `tests/herdr-app/check-commands.py`
  says what it checks in detail; `mise run herdr-app-check --test` runs the
  check's own tests.
- **tmux inside herdr keeps `ctrl-space` as its prefix.** `ctrl-space
  ctrl-space <key>` gives `<key>` to the tmux in the focused terminal as if
  typed after tmux's prefix, so a tmux inside herdr needs no second prefix;
  repeatable keys such as `H` keep working, and a third `ctrl-space` before
  `<key>` cancels. The tmux can run in the terminal itself, on this computer
  or in a space on another machine, or behind an ssh login in it; mosh is
  not reached. Behind ssh the leader runs its own `ssh` with the same login
  options from the terminal's machine, so the host must accept a login
  without a prompt (key or agent). It uses only a tmux client whose ssh
  session came from that ssh's connection: the same source port, and the
  connection's local address (from `ss` on the terminal's machine) or,
  through a NAT that keeps the source port, the address the host sees for
  the leader's own login; when
  more than one client matches, it sends nothing and says so. Not through a
  jump host, a ProxyCommand or another ssh's ControlMaster connection
  (there is no connection of its own to find, and the leader says so).
  Only tmux servers in the user's socket folder (`$TMUX_TMPDIR` or `/tmp`)
  count; it needs tmux 3.4 or newer and Linux (`/proc`) where tmux runs. In
  the personal layout `ctrl-space` goes through focus-history, so a fast
  second `ctrl-space` still reaches the leader; in other layouts it can
  close the leader again.
- **The board (`mods/board/`) shows my own work.** As `mods/board/views.json`
  sets them, its views are "Meine Aufgaben" (my issues on the Tender project's
  board, in the columns of its Status field), "PRs" (pull requests I opened or
  am asked to review, with checks and review state) and "Azure" (work items
  assigned to me, in the columns of their states). A view is a filter: adding
  one to `views.json` adds it to the board, and `r` reads the file again. The
  code holds nothing of mine; the header of `mods/board/main.js` describes the
  file's fields and when Azure shows. Keys: `1 2 3` or `[ ]` switch the view,
  `h/l j/k` move, `H/L` move a card one column (`s` picks from a menu, or drag
  the card onto a column), `x` hides or shows a column (views.json sets which
  start hidden), `/` filters, `o` opens the item in the browser, `r` refreshes
  (the shown view also refreshes every few minutes while the tab is shown),
  `Esc` closes. `Enter` opens the details, a second `Enter` goes to the item's
  session or starts one: a new space or tab on the chosen machine, in the
  repo's checkout, whose agent gets the first message views.json sets
  (`/implement <n>`, `/pr-review <n>` for a pull request) and makes its own
  worktree. The session is named after the item (`romm-tender#2845 …`, `AB#456
  …`), which is how the board finds it again. A status change shows at once
  and is written to GitHub or Azure; a refusal moves the card back with the
  error, and a write without a clear answer refreshes the board and then says
  where the card is. `mise run herdr-board-test` (without mise, `node --test
  tests/herdr-app/board.test.mjs` from the repo) tests its data functions and
  a few of its key paths against sample answers of gh, GitHub and az; the test
  file's header says which are recorded, which built by hand and which written
  from az's documentation. It needs node.
- **herdr writes `layouts/personal.json` itself.** `layout.set` saves the
  whole tree, in herdr's key order, through the link into this repo, so such
  a change shows up in `git diff`; clicks (sizes, shown or hidden) stay in
  herdr's `layouts/.state/`.

## tmux agent sidebar

The agent overview in tmux is [tmux-agent-sidebar](https://github.com/hiroppy/tmux-agent-sidebar),
and it has three parts. Stow brings none of them:

1. **The tmux plugin**, declared in `tmux.conf` and installed by TPM: `prefix + I`.
2. **Its binary**, which the plugin's install wizard fetches. The wizard pops up
   on the first tmux start after the plugin landed. Headless:
   `~/.config/tmux/plugins/tmux-agent-sidebar/install-wizard.sh download-binary`.
3. **The Claude Code plugin** `tmux-agent-sidebar@hiroppy`, whose hooks report each
   Claude pane's state to the sidebar. Without it the sidebar is up but lists no
   agents. It is declared in the reference `claude/.claude/settings.json`
   (`extraKnownMarketplaces.hiroppy`, `enabledPlugins`), so a fresh machine gets
   it through the seeded live file. A machine whose live `~/.claude/settings.json`
   predates it registers it once:

   ```bash
   claude plugin marketplace add hiroppy/tmux-agent-sidebar
   claude plugin install tmux-agent-sidebar@hiroppy
   ```

   Running Claude sessions pick the hooks up only after a restart. The plugin's
   `hook.sh` finds the binary only in its own cache dir (empty for a GitHub
   source), in a hard-coded `~/.tmux/plugins` or on `PATH`, so the `tmux`
   package stows a wrapper `~/.local/bin/tmux-agent-sidebar` that execs the TPM
   copy under `~/.config/tmux/plugins`.

## memex sync

`~/Memory` is a symlink into `~/memex`, a git clone of the memex repository
that the `memex` package keeps in sync. The `steamdeck` and `debian` classes
stow it, for the Steam Deck and the Debian server: the scripts
`~/.local/bin/memex-sync` and `~/.local/bin/memex-watch` and the user units
`memex-sync.service`, `memex-sync.timer` and `memex-watch.service`. A sync run
commits whatever changed in the clone, rebases onto `origin/main` and pushes.
The timer starts one every 2 minutes, which also brings in what other devices
pushed; `memex-watch.service` watches the clone with `inotifywait` and starts
one 30 seconds after the last change, ignoring `.git/` and `.obsidian/`. What
a run does offline, in a rebase conflict, when origin refuses a fetch or a
push, when git refuses the commit, or when a git operation was left
unfinished in the clone is described at the top of the script, together
with how to resolve a conflict by hand. Its output is in `journalctl --user -u memex-sync`, the watcher's in
`journalctl --user -u memex-watch`.

The sync's commit subjects, conflict branches and notifications name the
machine (`deck: …`, `conflict/deck-<date>`, `memex-sync (Deck): …`); the
script's header says where the name comes from.

`install-dotfiles.sh` links `~/Memory` to `memex/daniel/memory` for both
classes, once the clone is there; before that it only says that it made no
link. When `~/Memory` already exists and is not that link, a directory with
notes of its own say, the run leaves it as it is and, once everything else is
done, ends with exit 1 and says why: move what it holds into the clone,
remove it and run the script again. The script enables neither unit, because
on a fresh machine the clone does not exist yet; each host's section below
does.

Each clone pushes as `memex-bot`, the Forgejo user that every memex writer
shares, each machine with a token or key of its own, instead of the owner's
account: Forgejo credits a push to whoever pushes it, and the sync's pushes
would otherwise fill the owner's activity (the full reason is in the homelab
repo, ADR-0006, amendment "Schreiben über ein Bot-Konto"). The bot and its
write access to the repository come from the one-time recipe in the homelab
repo (README of the Forgejo role, section "memex-Bot"); where each machine
keeps its token is in its own section below. Each clone's commits get a
machine address in the clone's config only; `user.name` and commit signing
stay as they are. A missing, wrong or revoked token shows up as a fetch that
origin refuses: the run exits 1 and, with the ntfy files below in place, sends
one `memex-sync (<Machine>): fetch refused` notification.

Each of the failures that need a hand can also send one ntfy notification.
Two files outside this repo switch that on; without them the script only logs:

- `~/.config/memex/ntfy_url` — the full topic URL
- `~/.config/memex/ntfy_token` — an access token, sent as a Bearer header

The sync's push goes through the global git hooks like any other push, so the
pre-push hook scans it with gitleaks. Its commit skips them with
`--no-verify`. The message is made of file paths, which the commit-msg hook's
AI-attribution guard can take for an attribution
(`daniel/wiki/ai/what claude made.md`, say) and would then refuse on every
run; the pre-commit hook only guards `main`, which `~/memex` may commit on
anyway, being listed in `git/.githooks/commit-on-main-allowed`.

A machine with a clone writes to memex only through it. The memex MCP server
can write too, but Claude Code on such a machine does not use its write tools,
because both paths change the same files. When the server creates a note with
`create`, it adds the note's line to its topic index (`MEMORY.md`), a file the
memory skills edit in the clone. The clone gets the server's commit only with
its next fetch. If Claude Code has changed the same lines in the meantime, the
sync's rebase fails and one side lands on a conflict branch. Searching and
reading through the server stay. The rule is a hand step on each machine with
a clone, the Deck and the Debian server: it goes into that machine's live
`~/.claude/settings.json`, not into the reference copy here, which every host
shares, while a machine without a clone writes through the server. It goes
under `permissions.deny`:

```json
"mcp__memex__create",
"mcp__memex__append",
"mcp__memex__edit",
"mcp__memex__delete"
```

The decision and its reasons are in the homelab repo, ADR-0006, amendment
"Anbindung von Open WebUI und Schreibweg mit Klon".

`systemctl --user enable` links each unit by its full path in this repo. When
a pull moves a unit file to another package, relink the package it moved to
and enable the units again, which replaces those links, here for the `memex`
package. Not `reenable`: its disable step also removes the stowed link to the
unit file.

```bash
mise run dotfiles-pull claude memex
systemctl --user daemon-reload
systemctl --user enable memex-sync.timer memex-watch.service
```

### On the Steam Deck

The Deck's token comes from the homelab recipe, which stores it in the
keyring. Git's libsecret helper keeps one entry per host and user, as
`credential.useHttpPath` is unset, so the bot's token is a second entry next
to the owner's: a remote that names its user in the URL gets that user's
entry, one without a user may get either. Once the token is stored, switch the
clone's remote to the bot (only the user part of the URL changes), give its
commits the Deck's machine address, link `~/Memory` and enable both units:

```bash
git -C ~/memex remote set-url origin \
  "$(git -C ~/memex remote get-url origin \
    | sed 's#//daniel@#//memex-bot@#')"
git -C ~/memex config user.email deck@memex.invalid
cd ~/dotfiles && ./install-dotfiles.sh steamdeck
systemctl --user enable --now memex-sync.timer memex-watch.service
```

### On the Debian server

The server runs both units without a desktop and without a login, in the user
manager that lingering starts at boot. The homelab repo's Ansible playbook
enables lingering for the Minisforum; on another server:
`sudo loginctl enable-linger "$USER"`. The watcher runs there too, as Claude
Code sessions on the server write notes into the clone: it pushes them 30
seconds after the last write, not at the next timer run, which keeps the
window for a conflict with another machine's writes as short as on the Deck.

The clone fetches and pushes over HTTPS as the bot, with its token in
`~/.git-credentials`, which git's store helper reads ("Forgejo" under "Debian
server" above). Its commits are signed like every commit on the server, so
the signing key from "Commit signing" there has to exist first; without it,
git refuses every sync commit. Before ssh-keygen reads that key file, it asks
the agent at `SSH_AUTH_SOCK` for the key; `memex-sync.service` names the
repo's agent, which answers ("ssh-agent" there).

With the token in `~/.git-credentials`, the clone, its machine address (the
host name here), the link, the two units, the ntfy files and the rule against
the MCP write tools are:

```bash
git clone https://memex-bot@git.kueppermann.com/daniel/memex.git ~/memex
git -C ~/memex config user.email "$(hostname -s)@memex.invalid"
cd ~/dotfiles && ./install-dotfiles.sh debian
systemctl --user enable --now memex-sync.timer memex-watch.service
mkdir -p ~/.config/memex
nvim ~/.config/memex/ntfy_url ~/.config/memex/ntfy_token
nvim ~/.claude/settings.json    # the four mcp__memex__ entries above, under permissions.deny
```

### Tests

`tests/memex-sync/` holds the tests of both scripts. That directory is not a
stow package, so nothing of it lands in `$HOME`. `mise run memex-sync-test`
runs the scenarios against `memex/.local/bin/memex-sync` and
`memex-watch`, each on a throwaway bare origin with the script's own unit
`PATH`; the watcher's wait is cut to 3 seconds and a stand-in `systemctl`
records the starts. Name scenarios to run only those (`scenarios.sh --list`
prints their names), and set `VERBOSE=1` to see every run's output.
`mise run memex-sync-test --mutants` breaks each guard of both scripts in
turn and fails unless its scenario catches it. Both need git, python3, curl,
flock, setsid, pgrep and inotifywait, and stay on localhost: ntfy and the
refusing origins are small python servers there.
Without mise, run `tests/memex-sync/scenarios.sh` and
`python3 tests/memex-sync/mutants.py` from the repo.

## Tests

Three runners are described beside what they check: `mise run
memex-sync-test` under "memex sync", in its "Tests" part, and `mise run
herdr-app-check` and `mise run herdr-board-test` under "herdr app".

`mise run install-dotfiles-test` (without mise,
`tests/install-dotfiles/memory-link.sh` and `shared-dirs.sh`) checks the
`memex` package and the `~/Memory` link that `install-dotfiles.sh` makes, and
the directories that must be real ("Install / update" above), in
throwaway homes. Each file's header lists its cases, `--list` prints their
names, and naming cases runs only those. It needs stow, git and tar.

`mise run shell-test` (without mise, `tests/statusline/width.sh` and
`tests/bash/startup.sh`) checks how the Claude Code status line finds the
terminal's width, and the startup of an interactive bash: the greeter, the
TMUX variables a herdr terminal drops and, on wsl-arch, how a shell finds or
starts the keyring daemon, and the one line it prints on stderr when the lock
stays busy or the start fails. Stand-ins take the place of hc, tmux,
fastfetch and gnome-keyring-daemon, and flock and mkdir run through logging
wrappers around the real tools, so no herdr or tmux server is asked and no
real keyring daemon starts. Each file's header lists its cases, `--list`
prints their names, and naming cases runs only those. It needs jq, timeout,
flock and python3.

## Memory protection on the Steam Deck

The Deck has 14 GB of RAM for the desktop, Steam, the browser and several
Claude sessions with their test runs. `host-steamdeck` stows three user units
that share it out:

- `claude.slice` — every session the `claude` function in `.bashrc.local`
  starts runs in it. It has half the CPU weight of the rest, and above its
  `MemoryHigh` it is throttled instead of crowding out the desktop.
- `session.slice.d/memory-low.conf` (Plasma, KWin) and
  `app.slice.d/memory-low.conf` (browser, Steam, terminal) — memory below their
  `MemoryLow` is swapped out only once nothing unprotected is left.

`stow-packages.sh` makes both `.d` directories under
`~/.config/systemd/user/` real directories before it stows `host-steamdeck`.
Stow would otherwise link the whole directory instead of the file in it, and
the systemd user manager does not read a drop-in directory that is a symlink:
the unit then shows `DropInPaths=` empty and its `MemoryLow` stays 0, with no
error. A changed `MemoryLow` reaches a running slice only through
`systemctl --user set-property --runtime <slice> MemoryLow=<value>`;
`daemon-reload` loads the new value but leaves the cgroup's `memory.low`
untouched.

The `claude` function also sets `VITEST_MAX_WORKERS` and
`PYTEST_XDIST_AUTO_NUM_WORKERS` to 4, so a test run in a session takes half the
threads, and about half the memory, it would take with one worker per thread.
That applies to sessions started from a new shell.

A `MemoryLow` protects only as far as every ancestor cgroup carries one too:
the kernel caps a cgroup's protection at its parent's. The three ancestors are
system units, so their share is set once with root rather than stowed:

```bash
sudo systemctl set-property user.slice MemoryLow=4G
sudo systemctl set-property user-1000.slice MemoryLow=4G
sudo systemctl set-property user@1000.service MemoryLow=4G
```

4G is the sum of the two user drop-ins; raise all three together when either
grows. `set-property` applies the value at once and writes it under
`/etc/systemd/system.control/`, which lives in SteamOS's `/etc` overlay and
survives OS updates. To check that the protection holds, read `memory.low` of
`/sys/fs/cgroup/user.slice` and of each cgroup below it down to `app.slice`.

## Recovery

- **Pre-stow conflict backups** are created at `~/.dotfiles-pre-stow.<timestamp>/` whenever `install-dotfiles.sh` finds existing `$HOME` files that would clash with the stow run.
- **Pre-stow snapshot of the WSL machine**: branch `archive/wsl-2026-04-24` on origin.
- **Pre-yadm per-machine history**: tags `archive/pre-yadm/{main,arch,wsl,steamdeck,windows}`.
- **Retired yadm repo** (the predecessor layout, shared this same origin): archived locally at `~/.local/share/yadm.retired-2026-08-30`. It owned `~/.bashrc` and `~/.gitconfig` until 2026-08-30; its `alt` step deleted stow symlinks on every yadm invocation, so it is not to be reinstated.

Pull a single file from an archive tag:

```bash
git show archive/pre-yadm/windows:Microsoft.PowerShell_profile.ps1 \
  > ~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1
```
