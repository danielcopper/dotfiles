# dotfiles

Personal configuration files, managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Install / update

```bash
git clone git@github.com:danielcopper/dotfiles.git ~/dotfiles
cd ~/dotfiles
./bootstrap.sh <class>
```

Where `<class>` is one of `arch`, `steamdeck`, `wsl-arch`.

`bootstrap.sh` is the only command needed — same call on a fresh machine and after pulling changes. The whole pipeline is idempotent: pacman runs with `--needed`, brew skips already-installed packages and `upgrade`s new versions, flatpak's `--noninteractive` is a no-op on installed apps, and stow re-links while moving any genuinely conflicting `$HOME` files into a timestamped backup under `~/.dotfiles-pre-stow.<ts>/`.

## Layout

| path | purpose |
|---|---|
| `bash/`, `git/`, `nvim/`, `tmux/`, `wezterm/`, … | Stow packages — one per app. Each mirrors the target tree under `$HOME`. |
| `host-<class>/` | Per-host packages holding `.local` addenda (`.bashrc.local`, `.gitconfig.local`) and class-specific overrides where merge isn't possible (e.g. the NVIDIA wireplumber tweak on arch). Claude Code's `settings.json` is not among them: the `claude` package keeps a reference copy that `install-dotfiles.sh` seeds into `~/.claude/settings.json` once, and that live file then drifts per machine (`CLAUDE.md`, "Claude config lives here"). |
| `packages/common.pkglist`, `packages/<class>.pkglist` | Pacman lists for the arch and wsl-arch classes. Blank lines and `#` comments ignored. |
| `packages/steamdeck.brewlist` | Linuxbrew list — SteamOS root is read-only, so steamdeck uses brew instead of pacman. `install-packages.sh` bootstraps brew if missing. |
| `packages/steamdeck.flatpaklist` | Flatpak app list for steamdeck — for apps that ship as macOS-only Homebrew Casks (wezterm) and need a Linux install path. Installed user-scope from flathub. |
| `install-packages.sh <class>` | Install / update OS packages (pacman on arch / wsl-arch, brew + flatpak on steamdeck). |
| `install-dotfiles.sh <class>` | Symlink the relevant stow packages into `$HOME`. Worktree-aware; backs up real conflicts. |
| `bootstrap.sh <class>` | Wrapper that runs both `install-packages.sh` and `install-dotfiles.sh`. |
| `samples/` | Snapshots that aren't dotfiles and aren't stow-managed (SDDM theme + login wallpapers — they live under `/usr/share/sddm/`, manual root deploy). Kept in repo as a record. |
| `tests/` | Tests for scripts in this repo (`tests/memex-sync/`). Not a stow package: `install-dotfiles.sh` stows only the packages it lists. |
| `.stowrc` | Default stow flags (`--target=~`, ignores `install-*.sh`, `bootstrap.sh`, `packages/`, `samples/`, `host-*/`). |

## Adding or changing a file

**Shared across all hosts:**

```bash
mv ~/.config/<app>/<file> <app>/.config/<app>/<file>
cd ~/dotfiles && stow -R <app>
```

**New stow package:**

1. Create the package directory at repo root, mirroring the target path: `<pkg>/.config/<pkg>/…` (or `<pkg>/.<file>` for `$HOME`-level dotfiles).
2. Add `<pkg>` to `install-dotfiles.sh`'s `common_pkgs` array, or to a class-specific `class_pkgs` if it should only land on certain hosts.
3. `cd ~/dotfiles && stow -R <pkg>` to symlink it immediately.

**Class-specific tweak to a mostly-shared file:**

```bash
printf '\nexport PATH="$HOME/extra:$PATH"\n' >> host-arch/.bashrc.local
stow -R host-arch
```

## herdr ⇄ Claude Code agent-state hook

herdr shows each Claude session's state (working / idle / blocked) in its
sidebar via a hook that `herdr integration install claude` installs. That
command does **not** compose with this repo: it bakes an **absolute** `$HOME`
path into `~/.claude/settings.json` (a local file, not stowed; the repo keeps
only a reference copy, see `CLAUDE.md`) and
rewrites the whole file alphabetically — both fight the single, shared
`settings.json`. So the integration is vendored by hand instead:

- **The hook script is committed** at `claude/.claude/hooks/herdr-agent-state.sh`
  and stows to every host. It is portable — a no-op unless run inside a herdr
  pane (`HERDR_ENV` / `HERDR_SOCKET_PATH` / `HERDR_PANE_ID`) — and carries a
  `HERDR_INTEGRATION_VERSION` marker.
- **Its `SessionStart` entry in `settings.json` uses `$HOME`**, not an absolute
  path, so it works on every machine. Hand-maintained — don't let
  `herdr integration install` own it.

Do **not** run `herdr integration install claude` during setup; `mise install`
(the `herdr` entry) plus a normal stow is all a machine needs. Only re-run it to
regenerate the script when `herdr integration status` reports `stale` (herdr
bumped the integration version), then:

1. It rewrites the script *through the symlink* — the repo copy updates, good —
   and reformats `settings.json`.
2. `git restore claude/.claude/settings.json` to drop the reformat.
3. Re-apply the one-line `$HOME` hook path if it was lost, then commit the
   updated script.

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

## memex sync on the Steam Deck

On the Deck, `~/Memory` is a symlink into `~/memex`, a git clone that
`host-steamdeck` keeps in sync: it stows the scripts `~/.local/bin/memex-sync`
and `~/.local/bin/memex-watch` and the user units `memex-sync.service`,
`memex-sync.timer` and `memex-watch.service`. A sync run commits whatever
changed in the clone, rebases onto `origin/main` and pushes. The timer starts
one every 2 minutes, which also brings in what other devices pushed;
`memex-watch.service` watches the clone with `inotifywait` (Homebrew's
`inotify-tools`) and starts one 30 seconds after the last change, ignoring
`.git/` and `.obsidian/`. What a run does offline, in a rebase conflict, when
origin refuses a fetch or a push, or when a git operation was left unfinished
in the clone is described at the top of the script, together with how to
resolve a conflict by hand. Its output is in `journalctl --user -u memex-sync`,
the watcher's in `journalctl --user -u memex-watch`.

`install-dotfiles.sh` enables neither unit, because on a fresh Deck the clone
does not exist yet. Once it does, enable both once:

```bash
cd ~/dotfiles && stow -R host-steamdeck
systemctl --user enable --now memex-sync.timer
systemctl --user enable --now memex-watch.service
```

On a Deck where the timer already runs, these steps take the place of the
ones above: they install `inotify-tools`, load the timer's 2-minute schedule
and enable the watcher.

```bash
brew install inotify-tools
cd ~/dotfiles && stow -R host-steamdeck
systemctl --user daemon-reload
systemctl --user restart memex-sync.timer
systemctl --user enable --now memex-watch.service
```

Once switched, the clone pushes as `memex-bot`, the Forgejo user that every
memex writer shares, each machine with a token or key of its own, instead of
the owner's account: Forgejo credits a push to whoever pushes it, and the
sync's pushes would otherwise fill the owner's activity (the full reason is in
the homelab repo, ADR-0006, amendment "Schreiben über ein Bot-Konto"). The
bot, its write access to the repository and the Deck's token come from the
one-time recipe in the homelab repo (README of the Forgejo role, section
"memex-Bot"), which stores the token in the keyring. Git's libsecret helper
keeps one entry per host and user, as `credential.useHttpPath` is unset, so
the bot's token is a second entry next to the owner's: a remote that names its
user in the URL gets that user's entry, one without a user may get either.
Once the token is stored, switch the clone's remote to the bot (only the user
part of the URL changes) and give its commits a machine address, in the
clone's config only:

```bash
git -C ~/memex remote set-url origin \
  "$(git -C ~/memex remote get-url origin \
    | sed 's#//daniel@#//memex-bot@#')"
git -C ~/memex config user.email deck@memex.invalid
```

`user.name` and commit signing stay as they are. A missing, wrong or revoked
token shows up as a fetch that origin refuses: the run exits 1 and, with the
ntfy files below in place, sends one "memex-sync (Deck): fetch refused"
notification.

Each of the failures that need a hand can also send one ntfy notification.
Two files outside this repo switch that on; without them the script only logs:

- `~/.config/memex/ntfy_url` — the full topic URL
- `~/.config/memex/ntfy_token` — an access token, sent as a Bearer header

The sync's push goes through the global git hooks like any other push:
`memex-sync.service` puts Homebrew on its `PATH`, so the pre-push hook finds
gitleaks. Its commit skips them with `--no-verify`. The message is made of
file paths, which the commit-msg hook's AI-attribution guard can take for an
attribution (`daniel/wiki/ai/claude-written-summaries.md`, say) and would then
refuse on every run; the pre-commit hook only guards `main`, which `~/memex`
may commit on anyway, being listed in `git/.githooks/commit-on-main-allowed`.

The Deck writes to memex only through this clone. The memex MCP server can
write too, but Claude Code on the Deck does not use its write tools, because
both paths change the same files. When the server creates a note with
`create`, it adds the note's line to its topic index (`MEMORY.md`), a file the
memory skills on the Deck edit in the clone. The clone gets the server's
commit only with its next fetch. If Claude Code has changed the same lines in
the meantime, the sync's rebase fails and one side lands on a conflict branch.
Searching and reading through the server stay. The rule is a hand step on
each machine with a clone, today only the Deck: it goes into that machine's
live `~/.claude/settings.json`, not into the reference copy here, which every
host shares, while a machine without a clone writes through the server. It
goes under `permissions.deny`:

```json
"mcp__memex__create",
"mcp__memex__append",
"mcp__memex__edit",
"mcp__memex__delete"
```

The decision and its reasons are in the homelab repo, ADR-0006, amendment
"Anbindung von Open WebUI und Schreibweg mit Klon".

`tests/memex-sync/` holds the tests of both scripts. That directory is not a
stow package, so nothing of it lands in `$HOME`. `mise run memex-sync-test`
runs the scenarios against `host-steamdeck/.local/bin/memex-sync` and
`memex-watch`, each on a throwaway bare origin with the script's own unit
`PATH`; the watcher's wait is cut to 3 seconds and a stand-in `systemctl`
records the starts. Name scenarios to run only those, and set `VERBOSE=1` to
see every run's output. `mise run memex-sync-test --mutants` breaks each guard
of both scripts in turn and fails unless its scenario catches it. Both need
git, python3, curl, flock, setsid, pgrep and inotifywait, and stay on
localhost: ntfy and the refusing origins are small python servers there.
Without mise, run `tests/memex-sync/scenarios.sh` and
`python3 tests/memex-sync/mutants.py` from the repo.

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

The two `.d` directories must exist as real directories under
`~/.config/systemd/user/` before `stow -R host-steamdeck` runs. Where they are
missing, stow links the whole directory instead of the file in it, and the
systemd user manager does not read a drop-in directory that is a symlink: the
unit then shows `DropInPaths=` empty and its `MemoryLow` stays 0, with no
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
