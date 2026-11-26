# dotfiles

Personal configuration files, managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Install / update

```bash
git clone git@github.com:danielcopper/dotfiles.git ~/dotfiles
cd ~/dotfiles
./bootstrap.sh <class>
```

Where `<class>` is one of `arch`, `debian`, `steamdeck`, `wsl-arch`. A `debian` host clones over HTTPS and has steps of its own ("Debian server" below).

The clone has to live at `~/dotfiles`: the commit-on-main allowlist (`git/.githooks/commit-on-main-allowed`) and, on wsl-arch, the personal git identity (`includeIf "gitdir:~/dotfiles/"` in `host-wsl-arch/.gitconfig.local`) match that path, and the mise tasks `dotfiles-pull`, `dotfiles-relink`, `herdr-app-check`, `herdr-board-build`, `herdr-board-test`, `herdr-leader-test`, `memex-sync-test`, `install-dotfiles-test`, `shell-test` and `skill-trigger-test` use it unless `DOTFILES_DIR` is set.

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
| `tests/` | Tests for scripts in this repo (`tests/memex-sync/`, `tests/install-dotfiles/`), for the Claude Code status line's width (`tests/statusline/width.sh`), the bash startup (`tests/bash/startup.sh`), `preview-serve` (`tests/bash/preview-serve.sh`), `image-page` (`tests/bash/image-page.sh`) and `agent-env` (`tests/bash/agent-env.sh`), for the herdr app's command check and board mod (`tests/herdr-app/`), and whether the Claude Code skills fire on the right prompts (`tests/skill-triggers/`); `tests/run-listed.sh` hands each named case to the test file that lists it. Not a stow package: `install-dotfiles.sh` stows only the packages it lists. |
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

## Secrets

API keys and passwords (`SQLCMDPASSWORD`, the SonarQube CLI's token) live in
`~/.bashrc.secrets`, which git ignores and which never goes into this repo.
It is bash, `export NAME=value` lines, and a value may come from a `$(...)`.
Every interactive shell sources it from `.bashrc`, before the prompt setup
and the harness functions.

An agent harness does not take its secrets from the shell it starts in, which
holds the values the file had when that shell started.
`~/.local/bin/agent-env` (`bash` package) reads the file afresh at each start
instead: `.bashrc` makes `claude`, `opencode` and `pi` functions that run
`agent-env <harness> <harness> "$@"`, each only where agent-env and that
harness are installed and no function of that name exists yet: the Deck's
`claude` in `host-steamdeck/.bashrc.local` starts its slice through agent-env
itself ("Memory protection on the Steam Deck"). nvim's claudecode.nvim
(`nvim/.config/nvim/plugin/claudecode.lua`) starts Claude through agent-env
too, where it is installed.

agent-env passes on only the names the harness's list
`~/.config/agent-env/<harness>` declares, one per line with `#` comments, and
only with the values the file gives them. The names the file assigns are
every name a line assigns first (`NAME=…` / `export NAME=…`); one assignment
per line. agent-env unsets each of them the list does not declare, also
where the starting shell holds a value for it, but never `PATH`, `HOME`,
`SHELL`, `USER`, `LOGNAME` or `TERM`. It prints no value, also under
`bash -x`; an error a command in the file raises reaches stderr as bash
writes it. A missing file is named on stderr and the harness starts
without its secrets; a missing list, or a file that cannot be read or does
not parse, stops the start. The script's header has the details.

To give a harness another secret, add its `export NAME=...` line to
`~/.bashrc.secrets` and the name to `bash/.config/agent-env/<harness>`, and
commit the list. The next start of the harness passes it on; no shell needs
to be restarted. A new harness needs a list of its own and a function beside
the others at the end of `bash/.bashrc`.

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
leader a second `ctrl-space`, and `Esc` while the leader's own bindings are
missing: a failed bind, or `keys.json` reloaded while a leader is open; a
`tab` entry there does not beat herdr's own Tab binding after the app starts,
see below), the mods `mods/leader/` (its `f`
opens a second level for files: `f f` and `f g`, the keys of nvim's
`<leader>ff` and `<leader>fg`, open the file popup, `f e` and `f G` show the
right panel on Files or Changes; `Z` switches that panel between its normal
width and about two thirds of the space beside the sidebar; `H`, `J`, `K`
and `L` move the focused pane's border, repeating like `h`, `j`, `k` and
`l`, and do nothing while the board shows; `ctrl-space ctrl-space <key>`
is for a tmux in the focused terminal, see below),
`mods/focus-history/` (it remembers the previous place for the leader's
`Tab`: a pane, or the board while the personal layout shows it),
`mods/file-popup/` (a popup with the files of the focused pane's repo or
folder, or with the repo's changed files, that opens the picked one in nvim
in a new pane on the right), `mods/board/` (the board
the leader's `b` shows, see below), `mods/board-button/` (a button at the
start of the tab row that does the same) and `mods/board-tabs/` (the tab
bar, a copy of herdr's, see below), the layout `layouts/personal.json`
(herdr's `main`, cloned, plus an empty block that keeps focus-history
running, the board button's block left of the tab bar, the tab bar's block
on `board-tabs` in place of herdr's `tabs`, and the work area as a stack of
the shown tab and the board; its right panel has no maximum width)
and the themes: `themes/copper-light.json` and `themes/copper-dark.json`,
which `settings.json` picks by the system's light or dark mode, plus
`themes/catppuccin-mocha.json`. The copper pair is copied unchanged from the
copper-design release `v0.4.0` (`ports/herdr/`); on a new release, copy both
files from its tag and update the tag here.
Everything else in `~/.config/herdr-app` is herdr's own, except
`board/settings.json`, the board's settings for this machine (below), which
no package holds. `stow-packages.sh`
stows the package without folding (the reason is in its comment on
`no_folding_pkgs`), so relink it
with `mise run dotfiles-relink herdr-app` rather than a bare `stow -R
herdr-app`; a file new to the package, such as a mod's icon, is linked only
by that run. Which files of the package git tracks is set in the root
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
- **On WSL, dark comes from the portal, not from Windows.** A WSLg app learns
  light or dark from xdg-desktop-portal's Settings portal and draws light
  without one, so herdr's "System" appearance showed the light half of its
  theme. `wsl-arch.pkglist` installs the portal with its gtk backend,
  `host-wsl-arch/.config/xdg-desktop-portal/portals.conf` picks that backend
  (WSL sets no `XDG_CURRENT_DESKTOP`), and `install-dotfiles.sh wsl-arch` sets
  `color-scheme` to `prefer-dark` in gsettings. It does not follow Windows'
  mode; `gsettings set org.gnome.desktop.interface color-scheme default` makes
  it light.
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
  is a link out of the mod folder, which every stowed file is, as it refuses
  one from another mod's folder. So `mods/file-popup/` keeps its listers in
  `main.js` rather than in a `./list.js`, and `mods/board-button/` keeps its
  own marked copies of the leader's board layer block and board toggle; the
  board's `src/ui/layer.js` holds the layer block too,
  `mods/focus-history/` the part of it that finds the layer and a copy of
  the leader's place block (the place the focus is in, for `Tab`), and
  `mods/board-tabs/` that part too. An icon is no module:
  `mods/board-button/board.svg` draws through its link. The board is
  written as modules in `mods/board/src/` and built into its `main.js` by
  `mise run herdr-board-build`; the header of `mods/board/build.mjs` says
  how and why.
- **The tab bar (`mods/board-tabs/`) is a copy of herdr's tabs mod.**
  herdr's marks the shown tab as shown also while the board layer shows the
  board in its place, and no setting changes that; its shipped mods are
  read-only, written anew on every start. So the personal layout shows this
  copy: herdr's `main.js` with a few lines that mark no tab while the board
  shows, else the same, in a layout without a board layer too. Its icons
  are herdr's own files in herdr's mod folders. `upstream/main.js` is the
  herdr file it is based on, `cloned_from` in its `mod.json` that file's
  herdr version. At every start the copy compares herdr's current
  `~/.config/herdr-app/mods/tabs/main.js` with `upstream/main.js` and, when
  they differ or one of them is missing, says so in a notice; a read that
  fails says so in herdr's log alone. To port: `diff upstream/main.js
  ~/.config/herdr-app/mods/tabs/main.js` in the copy's folder shows herdr's
  change; copy herdr's file over `upstream/main.js`, set `cloned_from`'s
  version to herdr's, make the same change in `main.js` and run `mise run
  herdr-board-test`, whose test lists the lines in which `main.js` differs
  from `upstream/main.js` beside its two marked blocks, so it fails where a
  board line no longer fits. The notice is gone at the next start.
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
  close the leader again. An `Esc` within about 10–30 ms of the first
  `ctrl-space` after a start goes to the terminal, since the leader does not
  have the keyboard yet; a second `Esc` closes the leader.
- **The leader binds Tab, shift-Tab and Esc itself.** herdr's own bindings
  would take Tab and shift-Tab first; the comment above `BOUND_KEYS` in
  `mods/leader/main.js` says how and why. `mise run herdr-leader-test`
  (without mise, `node --test tests/herdr-app/leader.test.mjs` from the
  repo) tests what the leader binds and what Tab, shift-Tab and Esc then
  do, in the leader and on their way to tmux, and what focus-history
  records for Tab. It needs node.
- **The board (`mods/board/`) shows my own work.** In the personal layout it is
  a layer of the work area, not a tab: a stack in the layout with the shown
  tab's content and a board block whose props say `layer`. The board button left
  of the tabs (a press of any mouse button) and the leader's `b` show the board
  in place of the tab's content; the button is highlighted while it shows.
  The leader's `Tab` counts the board as a place, like a pane: from the board
  it brings the tab's content back with the place before the board, the pane
  under it too, and from there it shows the board again.
  Whenever the board comes to show, there or in a Board tab, it takes the
  keyboard where the one rule for it says (the comment above `takeKeyboard` in
  `mods/board/src/main.js`); to show the layer's board, the button and `b` also
  send it the board's focus command, which herdr hands only to a copy that
  shows. The tab's content comes back,
  with the keyboard, on a second press of the button or `b`, on `Esc` when the
  board has nothing else to close (details, a notice, the filter), on `Enter` to
  an item's session, and when the focus moves to another space, tab or pane, for
  example to the agent the board just started; a new program in the same pane
  keeps the board. Any click outside the board but the button's (the tab bar,
  the sidebar, the right panel; any mouse button), pressed and released within
  8 px, brings the tab's content back, while a press that turns into a drag (a
  divider, a tab) keeps the board; a herdr before 0.1.18 brings the content back
  on the press. The pane gets the keyboard only if the board still has it then,
  otherwise what was pressed keeps it. While the board shows, the tab bar marks
  no tab as the shown one (`mods/board-tabs/`, above). The board layer is found
  by its shape, not by ids. Without one, the button and `b` show the board's
  "Board" tab or open one, except in the personal layout, where they say the
  layer is missing. A Board tab left open from before is best closed there: when
  the layer hides the board, that tab's board may take the keyboard if its tab
  is the shown one. A top bar switches between contexts ("Kontext"), as
  `mods/board/views.json` sets them: one per GitHub owner (a user or an
  organisation) and one per Azure project, grouped by source, the source's name
  once before its contexts. Beside them stand the shown context's tabs, its PR
  tab last: on Azure each of my teams, with a switch between its Sprint and its
  Backlog in the row below, then the pull requests of its project; on GitHub one
  tab per project board, as "Meine Aufgaben" (my issues on the Tender project's
  board, in the columns of its Status field), then "PRs" (pull requests I am
  asked to review, I opened, or I reviewed, with checks, review state and
  whether I have to act on them). The PR tabs of all GitHub contexts share
  their sections, `sources.github.prs` in `views.json` (`sections`, and the
  `limit` of each search), read once for all of them, so each tab sees what
  the others see and a pull request cannot fall between them; a refresh of
  one PR tab refreshes them all. A context's own `prs` holds its tab alone
  (`id`, `name`, `hideRepos`, `start`); a `sections` or `limit` there is the
  older form: the board names where they stand now and leaves that PR tab out.
  The searches run as `views.json` writes them, and a context's PR tab shows
  what they find in the owner's repos and in foreign ones, whose owner is no
  GitHub context the board reads with a PR tab; a pull request in a repo of
  another such context shows in that context's PR tab only (owners compare in
  any case, and two contexts whose owners differ only in case are one owner: the
  second is left out). A
  team's Sprint shows its current sprint the way Azure's taskboard does: one row
  per story (its id, title, own state and assignee), its tasks as cards in the
  team's taskboard columns, each with its own state, assignee and id; a task
  whose story is not in the sprint (one left in the sprint before, say) shows
  under that story's own row, marked with its sprint ("Sprint 11", or "ohne
  Sprint" where it is in the team's backlog iteration or the project's root),
  and the tasks without a story, or whose story could not be read or was not
  found, stand in a row "Ohne Story" at the top; a warning says when a story
  could not be read, and names one that was not found. The rows, and the tasks
  within a cell, follow the team's backlog order (the order field its backlog
  configuration names: Stack Rank, or Backlog Priority in Scrum), those without
  a value after the rest by id; where the configuration cannot be read, a
  warning says so and they go by id. "N Stories" above them counts every story
  row, those from other sprints too. It holds the work items of the sprint in
  the team's area paths ("Bereichspfad"), and its tasks are the work items of
  the types the taskboard's columns map. What it reads per refresh, the header
  of `mods/board/src/main.js` says, and makeAzure (in
  `mods/board/src/sources/azure/index.js`) what it keeps; `r` reads the team's
  sprint, area paths, columns, backlog configuration and settings again. The
  command menu's "Sprint wählen…", or a click on the sprint's name above the
  stories, opens a picker of the team's sprints, past, current and future, in
  Azure's order, each with its dates; the current one is marked "aktuell", and
  marked as the picker opens. It filters and moves as the command menu does, and
  `Enter` or a click shows the sprint picked. A sprint other than the current
  one says "nicht aktuell" beside its name, and the menu's "Aktueller Sprint"
  goes back. The choice is the Sprint view's while the board runs and is stored
  nowhere, so after a restart the Sprint shows the current sprint again. A
  refresh keeps it; `r` reads the team's sprints again too, and where the team
  no longer has the chosen one, the Sprint shows the current one (or that none
  runs) and says so. Where the team has no sprint running, the Sprint says "kein
  laufender Sprint" in place of a sprint's name and draws no taskboard; the
  picker opens there the same way, with no sprint marked "aktuell" (it marks the
  next sprint to start, else the last one that ended), a sprint picked shows,
  and "Aktueller Sprint" is not offered; the first refresh on the day a sprint
  starts shows that sprint as the team's current one. A team's Backlog lists its
  requirement level (its Stories, and Bugs where the team keeps them there) in
  backlog order, one row each with id, type, title, state, sprint ("—" for none)
  and assignee. It needs `az login`: the level's work items come through
  `az rest`, which takes no PAT, and the Backlog says so when the login is
  missing. What it keeps and for how long, makeAzure says; `r` reads that again
  (not the project's types). On the Sprint's cards and stories and the Backlog's
  rows a work item's id stands without its "AB#"; its details, the notices and
  the toasts keep it. Azure's pull request tabs read nothing yet; each says
  which view it will hold.
  "nur meine" narrows whatever shows to my own items (on GitHub: assigned to
  me, opened by me, or asking for my review; a list section of my own search,
  whose query sets author, assignee, reviewed-by, review-requested or
  user-review-requested to @me, counts whole, so "Geprüft" stays; on Azure:
  assigned to the account az is signed in as, which needs `az login`, and a
  story stays dimmed for my tasks in it) without reading anything again. A
  context, a team or a project added to `views.json` adds a context or a tab,
  and `r` reads the file again; the board remembers the context shown last, each
  context's tab, each team's view and "nur meine". A board that kept the shown
  source and each source's tab from before the contexts opens on their context
  and tab, once. A count in a tab, a column or a list section that the filter or
  "nur meine" thins says so ("1/4"); a tab's count leaves the cards of hidden
  columns out. The code holds nothing of mine; the header of
  `mods/board/src/main.js` describes the file's fields. In a `views.json` from
  before the contexts, with `sources.github.views` or an entry of
  `sources.azure.contexts` with `team` or `prs`, their old part is not read: the
  board says where its views and teams go now.
  `views.json` is the base; each machine's own settings lie over it in
  `~/.config/herdr-app/board/settings.json`, outside the dotfiles: no stow
  package has a `board/` there, `.stow-local-ignore` keeps every
  `settings.json` of the package unlinked, and herdr reloads nothing when
  it changes (it watches only `mods/`, `layouts/`, `themes/` and its own
  files). The file has the shape of `views.json`, holding only what this
  machine sets: a value there overrides the one in `views.json`, an object
  merges key by key down to its lists and values, and a list replaces the
  `views.json` list whole. A list whose entries have a name of their own, the
  GitHub contexts their `owner`, the Azure contexts their `project` and a
  GitHub context's projects their `id`, can also be reached entry by entry: an
  object in its place, keyed by those names, merges into the entries with them,
  wherever `views.json` moves them, so `{ "sources": { "github": { "contexts": {
  "<owner>": { "projects": { "mine": { "hide": ["Done"] } } } } } } }` sets that
  one board's hidden columns, while an array in place of `projects` would
  replace every project of the context. Of two entries with one name the first
  has it, as for the board's views, and entries without one leave the others
  reachable by theirs. A name no entry of `views.json` has, or such an object
  for any other list (an Azure context's teams, set here only as a whole list),
  is an error naming the file and the key, and the rest of the file applies; so
  is a value there that changes an entry's own name, and the rest of the entry
  applies. Settings from before the contexts, a GitHub view's entry under
  `sources.github.views` by its id, move into its tab at a read of `views.json`,
  once: into `sources.github.contexts.<owner>.projects.<id>`, or `.prs` for the
  PR list (its `sections` and `limit` into `sources.github.prs`, one place for
  all PR tabs), a project's `number`, `field` and `priorityField` out of its
  `project`, what the context says (`source`, `layout`, the project's `owner`)
  left out. The board writes that at once and says what moved where. Where any
  value has no place there (an id `views.json` has no tab for, a whole list of
  views, the Azure teams in the old form, a project of another owner, a key the
  tab does not take, a tab the file sets already, or two values for one place
  that differ) nothing moves: the board names each such value and shows
  `views.json` alone until the file is changed by hand. Nor does anything move
  while `views.json` has a problem: the board says to fix that first. A write
  that fails, or finds the file changed since it was read, is said (a move that
  finds the settings moved meanwhile takes them without a word), the file is
  read again, and the next read (`r`) tries again. Settings that cannot be read,
  are no JSON object, or give `views.json` a problem it does not have on its
  own, are not applied: the board names the file with each problem, in the words
  it uses for `views.json`, says that it shows `views.json` alone, and does, and
  it changes nothing in the file until a read finds it fit again. Removing a
  value from the file (a reset) lets `views.json`'s apply again. The board reads
  the file whenever it reads `views.json` (the start, `r`), and a change it
  makes is written at once, over what the file holds at that moment, one after
  the other. Where the file no longer holds, at a value the change sets, what
  the board made the change over (another copy of the board, or a hand, changed
  it since), or changes while it is written, the board does not save, says that
  the file changed and the change has to be made again, reads the file again
  and shows what it holds; where it cannot write the file, it says so with
  herdr's reason, the same way. Hidden columns are such a setting: hiding or
  showing a column writes the view's whole hidden list there, which replaces
  the view's `hide` from `views.json` on this machine until it is reset. A
  GitHub PR tab's repos turned off are another: its `hideRepos` (repos with
  their owner, "owner/repo"), which a switch writes there as a whole list
  the same way. The
  hidden columns an older board kept in herdr's localStorage move into the
  file at a read of `views.json` once the write succeeds, and leave the
  localStorage; where the file sets that view's hidden columns already, the
  file's stay; those of views `views.json` no longer has stay in the
  localStorage, and all of them do while the file does not apply. What else
  the board remembers, as above, stays in herdr's localStorage.
  Each view keeps its last good read in herdr's localStorage (about 217 kB
  for a board of 300 cards; herdr's store takes at most 1 MiB a value and
  8 MiB in all, so a view keeps at most a million bytes, and one the store
  refuses keeps nothing, which herdr's log names). Each read of `views.json`
  (the start, `r`) drops the entries of views it no longer has, unless
  `views.json` or this machine's settings have problems. After a restart,
  and on a switch to a tab not read yet, the view draws that state at once,
  its age at the top right ("Stand vor 3 min", "vor 2 d" from two days on),
  and reads anew behind it; a read that fails keeps it and says why. Every
  tab's age is that of what it draws. Nothing is written against that saved
  state: a move, a status change, an assignment or a create is refused with
  a note and has to be made again once the read is in; a read that failed
  starts again. While a view shows nothing or only its saved state, a GitHub
  board draws each page as it comes, the "Nur die ersten" note after the
  last; the PR list draws before the follow-up for pull requests with many
  review threads, their rows marked "…" until it came ("?" stays for what
  could not be read); the Sprint draws before its parents outside it (their
  tasks where its saved state drew them, else in "Ohne Story"), the Backlog
  before its types' colors. A read over data read since the start shows
  its result only once whole, so the selection and open details stay. The
  top right says which page a board reads ("lädt … Seite 2 von 3"). After
  each read of `views.json`, once the shown view is read, the board reads
  each other view once, one at a time in the background, the shown context's
  first, then the rest of its source's, the oldest or never read first, none
  tried within `refreshMinutes` and none whose own last read since then found az
  unavailable; it waits while another read runs, something is written or a
  dialog is busy, so a switch to such a tab shows it at once. After that a view
  refreshes only while it shows, as above, a GitHub PR tab also with the
  others. While a read of the shown view runs, `↻` turns, and an empty view
  shows a spinner before "Lädt …". Each gh, az and sh run (checkout, the Repo
  field's repos, finding gh and az, the Claude Code sessions and their task
  lists) writes one line to herdr's log (console.log), without its arguments:
  `board: <gh|az|sh> <kind> <ms> ms <ok|exit n|failed> view=<view id>`.
  Keys: `1 2 3` or `[ ]` switch the tab, `{ }` the context (also as AltGr types
  them, on a German layout AltGr+7 and AltGr+0), `g` and a digit go to that
  context, `v` a team's Sprint and Backlog, `R` opens a PR tab's repo menu
  (below), `m` turns "nur meine" on and off
  (the contexts, the tabs, the switch and "nur meine" take clicks too), `/`
  filters, `r` refreshes (the shown view also refreshes every few minutes while
  the board shows), `Esc` closes, `gg` and `Home` go to the first card of the
  selected column (in a list, the first row), `G` and `End` to its last, and `:`
  opens the command menu: the actions that can run now, under a heading for what
  they act on (the selected item, the details panel, the view, the board), each
  with its key where that key runs it right then. Typing filters it: an entry
  stays where it holds the typed letters in their order, those that hold them at
  a word's start or one after another first, the letters in the accent color.
  `↑`/`↓`, `ctrl-j/k` and `ctrl-n/p` mark an entry (a bare `j` or `k` is a
  letter for the filter, as in the assignee picker), `Enter` or a click runs
  it, `Esc` closes; it runs only on what it was opened for, and where a refresh
  took that away, or the action can no longer run on it, it says so instead.
  Ten rows show at a time: the window follows the mark, the mouse wheel moves
  it, and a thin mark at the right and "↓ N weitere" say there are more.
  The menu names each other context of the first nine ("Kontext 2: …", `g2`);
  hiding the selected column and the column menu have no key and run from the
  menu alone. A letter key is the same with Caps Lock, and Shift makes it
  another key (`S` is no `s`). The hint line names the keys of what shows, and
  `:`, each key once:
  while the details panel has the keyboard its keys, and the board's keys that
  still act there. It leaves out the moves (`h/j/k/l`, `ctrl-d/u`, `gg/G`),
  `/`, which the filter field shows, and `z`: a description's fold says "… mehr
  (z)", a Sprint's story fold is named only in the command menu. The keys of
  the board's actions, the hint line and the menu read one action table,
  `mods/board/src/commands.js`, so each runs the same code. On a Sprint `j/k`
  move within a column (the stories' or a taskboard column) and `h/l` stay in
  the row: they go to the row's item in the next column that has one, past
  empty cells, and move nothing where no column further on has one; `H/L` move
  a task to the next column its type has (az takes the request from a file under
  `~/.cache/herdr-app/board/`). Like Azure's taskboard, a move across states
  sets the state the column maps (as `s` does), and the column itself is sent
  where the task keeps its state or another column maps the new one too; a move
  that set a state reads the Sprint again, and where the state lands and the
  column does not, the notice says so and that read shows where the task stands.
  `s` sets a story's or task's state from its type's states, a click selects,
  and `Enter` shows the details (parent, state, assignee, column, area path and
  iteration). `z`, while the board and not the details panel has the keyboard,
  folds the selected story's tasks away and back; on a task it folds its
  story's, which it then selects where it shows. A click on the triangle in a
  story's row folds it without choosing anything; a fold that takes the selected
  task away selects its story, where that shows. A folded row says how many
  tasks it holds, the keys pass over them, and the board remembers the folded
  stories per sprint, after a restart too (a new sprint starts unfolded); a
  chosen sprint's folds last while the board runs and leave the current sprint's
  alone. On a Backlog `j/k` move, `s` sets the state, `Enter` shows the details
  (parent, state, assignee, area path, iteration and sprint), `o` opens the item
  in the browser, and `n` creates a work item: a dialog asks for its type (the
  level's, Story first; with a Story selected also Task, as its child) and its
  title; the type is a choice like the start dialog's (`←`/`→`, its list on
  space or a click), and `Enter` creates from either field. It is created in the
  team's default area path and iteration, assigned to me, and shows, selected,
  once Azure has named its id and the Backlog is read again; a Task is linked to
  the selected Story as its parent and, being no Story, does not show in the
  list. Where Azure's answer to a create leaves open whether it landed, the
  board asks Azure after the next refresh for work items of that project, type
  and title that I created today (a Task only among those without a parent):
  exactly one is taken as the new one, none means it did not land, several are
  named; the header's "Calls:" says what that costs. A team whose default
  iteration follows the current one has it read again for each create. A work
  item's session starts in the repo chosen in the start dialog (below). On a
  GitHub view `h/l j/k` move over the columns shown, `H/L` move a card one
  column, hidden ones included (`s` picks from a menu, hidden ones too, or drag
  the card onto a column; the notice says when a card went to a hidden column),
  the command menu's "Spalte ausblenden" hides the selected column (views.json
  sets which start hidden; hiding or showing one writes this machine's settings,
  above), `o` opens the item in the browser. A GitHub board reads its items in
  pages of up to 100, one gh call each, up to views.json's `limit` (1000 by
  default) and at most as many calls as full pages of it take; where that cuts
  them, a note under the columns says how many it read. A hidden column is not
  drawn: the line below the columns names the hidden ones ("ausgeblendet:
  Backlog, Done"), a click on a name shows that column again, and the command
  menu's "Spalten…" opens a menu of every column, shown or hidden, where
  `Enter`, a digit or a click hides or shows one. A long column draws whole only
  the cards about what it shows, half its height above and below; every other
  card is an empty frame of the card's height until the column scrolls near it:
  at once by the wheel or a key, within a tenth of a second by the scrollbar's
  thumb, wherever the pointer is released (`mods/board/src/ui/band.js`). herdr
  before 0.1.18 tells a mod no scroll position; there every card draws whole. A
  click on a card or a list's row selects it; a click on one I chose (clicked
  before, moved to with the keys or dragged onto another column; not one the
  board selected by itself) opens its details. Where the board selects another
  item by itself (a refresh, the filter, a hidden column), open details close.
  The details take a third of the board's width, half of it beside a single
  column, but never less than 420 or more than 720 pixels (detailWidth in
  `mods/board/src/ui/helpers.js` has the rule).
  In each section of a GitHub PR tab the rows stand grouped by repo, each
  group where its first row would stand (so the rows that ask something of
  me still lead), under a repo row with the repo's name and how many of its
  rows show, where the section shows more than one group; a group of a
  foreign repo always has its row, named "owner/repo" with a chip
  "fremd". Repo rows are not selected: `j/k`, the details and every action
  go over the pull requests alone, and a section's count is theirs. The key
  of an issue or pull request of a foreign repo names its owner too
  ("owner/repo#12") wherever it shows: in a PR row, on a board, in the
  details and their lines, the notices and the start dialog. A line
  "Repos:" above the sections has a switch per repo with pull requests in
  the tab and per repo turned off there, the owner's first, each with how
  many of its pull requests the filter and "nur meine" let through, a
  foreign one marked "fremd", a turned-on one marked "✓"; a click turns it
  off or on on this machine (`hideRepos`, above), at once and without a
  read. A turned-off repo's pull requests show nowhere in the tab, and the
  counts of its sections and of the tab leave them out. `R`, or "Repos…" in
  the command menu, opens a menu of the same switches, where `Enter`, a
  digit or a click turns one off or on.
  The GitHub PR list says whether I have to act on a pull request: such a row
  carries a mark with the reasons ("● Review angefragt"), its details list
  them under "DU BIST DRAN", and in each section those rows come first, in
  GitHub's order, then the others in theirs. On someone else's pull request
  the reasons are my review asked for, of me or of a team I am in (a search
  that sets `review-requested:@me` found it), while I gave none or mine was
  dismissed ("Review angefragt"); commits after my latest review, asked again
  or not ("neue Commits seit deinem Review"); my review asked for again while
  mine is on its last commit ("Review erneut angefragt"); and an unresolved
  review thread I took part in whose last comment is someone else's ("Antwort
  erwartet"), where I have a latest review (not a dismissed one) only if that
  comment was published after it: a reply I answered with a new review asks
  nothing more of me, even while its thread stays unresolved. My latest
  review, for each of these reasons, is the last of my last 5 reviews on the
  pull request that approves, asks for changes, or has a text or a comment
  that starts a thread; a reply in a thread alone, which GitHub files as a
  review too, never counts, nor does one with neither text nor comments.
  Where none of the 5 counts, I have none: every such comment counts. Where
  GitHub sends too little to tell whether one of them counts (it reads each
  one's first 10 comments), the reasons count it, and where that is all that
  decides them, the row is not wholly read (its details say "deine letzten
  Reviews nicht ganz gelesen"). Where GitHub sends no time for the comment or
  the review, the comment counts. One I reviewed that asks nothing of me says
  "wartet auf Autor", unless it says "ungelesen" (below).
  On my own: changes requested ("Änderungen gewünscht"), unresolved threads
  whose last comment is someone else's ("2 offene Threads"), failing checks
  ("Checks rot"), a merge conflict ("Konflikt"), and with none of these:
  "bereit zum Mergen", where it is no draft, no review is still required
  (approved, or a repo that asks for none), its checks passed or it has none,
  and it merges without conflict (not while GitHub still works that out).
  Comments as such are no reason, except through "ungelesen": on mine and
  others' alike, it comes first among the reasons where GitHub's own unread list
  for me holds the pull request: my unread notifications, as the bell on
  github.com shows them, which the list reads once per refresh. Opening the pull
  request on GitHub marks it read there, and the mark goes with the next
  refresh. Only a classic token or gh's own login (`gh auth login`) may read
  them. Where they cannot be read, no row says "ungelesen" and the list's notes
  above it say why; an unread one about a pull request whose address the board
  cannot read marks no row and is counted there. Where the rows show before the
  notifications are in, a grey line above says they are still being read. It
  reads each pull request's first 10 review threads in its one request and, for
  those with more, the first 50 in one more per 100 of them, and of each thread
  the authors of its last 10 comments (a thread I took part in only before its
  last 10 comments counts as one I did not), and my last 5 reviews; it asks gh
  for my login until it knows it, which the reviews need before the list's
  answer names it. Where it could not read all it needs (an error at the pull
  request, a part GitHub did not send, more than 50 threads, reviews it cannot
  tell apart where that decides, or reviews read for another login than the
  answer names), nothing says "wartet auf Autor" or "bereit zum Mergen": the row
  says "? nicht ganz gelesen" where it names no reason and adds "· ?" after its
  reasons where it names some, checks GitHub sent an error for show "?", and the
  details list what is missing as warnings after the checks. Where it has more
  threads than it read (more than 50, or more than 10 where the second request
  failed), a count of my threads gets a "+" ("3+ offene Threads"). A pull
  request GitHub sent as nothing for an error is named among the list's notes
  above it ("1 Treffer in „Meine“ nicht gelesen: …"). The shipped `views.json`
  has three shared sections: "Zu prüfen" (review asked of me), "Meine" (opened
  by me) and "Geprüft" (open pull requests I reviewed and did not open,
  `reviewed-by:@me -author:@me`): GitHub drops a review request once the review
  is given, so without it a reviewed pull request would leave the list. A pull
  request that asks my review again shows in "Zu prüfen", the first section that
  finds it. A `views.json` of my own without that search keeps working and shows
  no reviewed pull requests. Without the login gh runs as nothing is marked but
  "ungelesen". The header of `mods/board/src/main.js` says how many of GitHub's
  points and REST requests an hour the list's requests cost.
  A card, on a GitHub board and on the Sprint's taskboard, shows one line per
  topic, each only where it has something, so a card without them stays as
  compact as before: its key with its priority at the right ("P1": on GitHub the
  option of the project's single-select field "Priority", or the one
  project's `priorityField` in `views.json` names, in that option's color; on
  Azure the work item's priority, 1 red, 2 orange, 3 and 4 grey), its title, its
  milestone as a grey chip and its parent ("Teil von #1735 [Epic] …", cut short
  with "…" where it does not fit; the repo's name before the number only where
  the parent lives in another repo; on Azure its id and title), its type and
  labels (or a work item's state), and its progress: "14 / 25", a bar of one
  segment per sub-issue (one continuous bar above 30), its done part green, and
  "56 %", rounded down. Its session (a sure one by what its agent does, in that
  status's color; "○ Kandidat" where it has only likely ones), "speichert …"
  while a change of it is written, and its assignees end its progress line, or
  its chips' line where it has no progress. On the Sprint a story's progress
  counts the tasks in its row, done by the state their column shows, and a
  task names its parent only in "Ohne Story" (its story's row names it
  otherwise); the Sprint reads, in one query more, its tasks' parents outside
  it with each refresh and the titles of its stories' parents where it does
  not keep them; it keeps those for four hours (`r` reads them again). The
  board's query reads priority, milestone and parent at no extra cost; the
  header's "Calls:" says why. Where a project's `priorityField` names a field
  the project does not have as a single-select field, a warning above the
  columns says so; the default "Priority" may be missing without one.
  The board's colors are the theme's, or tints of them. A column's head sits
  on a tint of its status color, and each card, on the Sprint's taskboard
  too, has a narrow edge in it; which theme color a status or a state has,
  its source says. A PR list's section has a tone, its `tone` in `views.json`
  (one of copper's hues but orange: red, green, yellow, blue, violet, teal),
  else the next of blue, violet, teal, green, yellow and red by its place that
  no other section sets (the shipped file sets blue, violet and teal): its
  head shows its name and count in that tone on a band of its tint, as a
  column's head does, and each of its rows has a thin stripe in it at its
  left, the accent while the row is selected. The mark on a pull request I
  have to act on is in copper's orange, which no section and no check state
  takes; on a theme without copper's colors, in the theme's foreground, since
  each of its hues is a section's or a check state's. Labels are chips in
  their GitHub color, brought onto the theme's hues by hue, grey ones muted;
  issue types are chips in their named GitHub color, pink as violet. An Epic
  by its "[Epic]" title alone gets an "Epic" chip in its "epic" label's color,
  in place of that label's own chip, and the details name it an Epic. A thin
  line across the top of a card or row is in its type's color: on Azure, of
  every work item, the color the project's work item types define (kept as
  makeAzure says), brought onto the theme by hue as a label's is; on GitHub,
  of an issue with an issue type, that type's named color as its chip has it.
  A type without a color, and an item without a type (an Epic by its title
  too), has no line; where the Backlog could not read the types, or where they
  name their colors in a form the board does not read, the view says so and
  draws none.
  The copper themes carry copper's colors for mods, and there the board draws
  in them: its seven hues (red, orange, yellow, green, teal, blue, violet; a
  label's red reaches further toward orange than halfway, so GitHub's dark
  reds stay red) and its neutral, text and lines in their text color
  (`copper-<color>-text`), a chip or a head on their tinted step
  (`copper-<color>-3`, or `-4` where step 3 stands too close to the card or
  column it is drawn on), a selected card or row on the theme's `selected`,
  copper's blue step for it, and a column a card is dragged over keeps its
  ground, marked by the accent border. A theme without those colors
  (catppuccin-mocha) draws in its red, green, yellow, blue, violet and teal,
  an issue type's or a priority's orange as yellow, the mark on a pull
  request in its foreground, with its colors at a low alpha under chips and
  heads, a selected card or row on a tint of the accent, so its chips stay
  readable, and a column a card is dragged over on the theme's `selected`.
  `mods/board/src/ui/tones.js` holds the label and type colors, which theme
  takes which colors, the selected background and how strong the tints are.
  The details of a GitHub issue show its description formatted, as GitHub
  does (its Markdown drawn by herdr's TextView: headings, lists, code, links,
  tables; its HTML shows as text, its comments not at all, but for one not
  closed, one that starts in code, or one that spans an empty line without
  starting a line, which shows as text; "keine Beschreibung" where it has
  none), then its parent ("ÜBERGEORDNET", where it has one), its
  sub-issues ("UNTERAUFGABEN · 7/11", the count the card shows; the first
  50, with "erste 50 von N" where it has more) and the pull requests linked
  to it by a closing keyword or by hand in its Development sidebar, open,
  merged or closed ("VERKNÜPFTE PRS", where it has any), each with its key,
  title and state, a closed or merged one dimmed, a draft marked, and how
  many GitHub sent without access. The details of an Azure work item, on
  the Sprint and on the Backlog, show the same: its description formatted
  from its HTML, keeping only plain formatting tags
  (`mods/board/src/description.js` lists them and says why; any other tag
  goes and its text stays, a `<pre>` shows as code that wraps), its parent
  ("ÜBERGEORDNET") and its children ("UNTERAUFGABEN", each with its state,
  a done one dimmed, and how many the query did not find; one query reads
  both) and the pull requests linked to it, each by its id only ("!57 Pull
  Request"): reading a pull request's title and state would cost an az
  call each. A description's images are never loaded: herdr's TextView
  would fetch them from wherever the text points. A Markdown image
  `![alt](url)`, and an `<img>` tag in Markdown or HTML, show as a link
  "Bild: alt" to an http or https URL (the text alone for any other). An
  image by reference shows as a link "Bild: alt" where it names its
  reference and that is defined (`![alt][ref]`), else as text
  (`![alt][]`, `![ref]`). A link opens in the browser, http and https
  only.
  A description taller than about 12 lines shows folded to that height with
  "… mehr (z)" ("(z)" where `z` folds it then); `z` or a click unfolds it and
  folds it again. `z` folds what is where the keyboard is: the description
  while the details panel has it, and while the board has it the Sprint's story
  there, the description on a view that folds nothing of its own. What reading
  them costs and what a refresh keeps of them, the header of
  `mods/board/src/main.js` says; `r` reads them again while they are open.
  While they show, or the details list a session (on any item), `Tab` moves
  the keyboard into the details panel and back (`Esc` gives it back too;
  elsewhere, and while the filter is typed, `Tab` stays herdr's): there
  `j/k` walk those lines, each scrolled into view, and then the sessions'
  lines under "SITZUNG", which always show; with no line selected they
  scroll the details a line, `j` until the first line shows whole, which it
  then selects. `ctrl-d` and `ctrl-u` scroll half the details' height, `gg`
  and `Home` go to the panel's top with no line selected, `G` and `End` to
  its bottom on its last line; these glide there in 120 ms with an ease-out,
  herdr's native transition of the details' top, the first press after any
  other move too, while `j/k`, the mouse wheel and a change of the details'
  heights move them at once. The board scrolls the details itself (herdr gives
  a mod no scroll position to set), so they have no scrollbar to drag:
  the mouse wheel scrolls them, and a thin mark at the right shows where they
  are. `Enter` shows a line's item in the panel, a level down: a parent's, a
  sub-issue's or a child's description, its own related items and its state; a
  pull request as the PR list's details show one (its author, review, draft
  mark and branch and, on GitHub, its assignees and checks), with its state,
  read by one more gh call, on Azure by `az repos pr show` (its reviewers'
  votes as the review). A line whose item the panel cannot read says so, and
  `o` opens it. The panel's top names the way down (`tender#914 › #2217`, on
  Azure a work item by its number alone); there `j/k` walk that item's lines,
  `Enter` goes further down, to any depth, and `Esc` goes back up a level, to
  the line it came from, marked and scrolled into view. The board's selection
  stays where it was. `o` opens the marked line in the browser; with no line
  selected `Enter` and `o` act on the item the panel shows: at the top what
  they do on the board, on a level that item's session and page, as the hint
  line says. On a level `s`, `a`, `H/L` and a story's `z` do nothing, since
  they act on the board's item (the command menu still offers them under its
  heading), and `Tab` back to the board closes the levels. The command menu's
  "Zeile auf dem Board", and the panel's button of that name while a line is
  marked, select the line's item where a shown column holds it, its details
  shown at the top, and otherwise say that it is not on the board. A click on
  a line does what `Enter` on it does. `r` reads each level's related items
  again; a level whose item is no longer among the lines of the level above
  goes, and the board says so, where those lines came whole (lines that could
  not all be read, or were cut short, decide nothing). `Enter` opens the
  details, a second `Enter` goes to the item's most urgent sure session that
  has a place to go to (blocked, done, working, idle); where it has none but
  other sessions (sure ones in no terminal, likely ones), it first names them
  and offers "Zur Sitzung springen" for each in a terminal, "Trotzdem neue
  Sitzung starten" and "Abbrechen" (`j/k` and `Enter`, a digit or a click;
  `Esc` cancels); its action and button say "Sitzung wählen" where one of
  them is in a terminal, else "Agent starten" ("Review starten" for a pull
  request), as the question then only confirms a start. With no session at all, or "Trotzdem neue Sitzung
  starten", it starts one: a new tab on the chosen machine, in the repo's
  checkout (for an item without a repo, in the repo chosen under "Repo"),
  whose agent gets the first message views.json sets (`/implement <n>`,
  `/pr-review <n>` for a pull request) and makes its own worktree. In the
  start dialog `Enter` starts the session from every field. The
  first message grows with its text up to six lines and then scrolls
  (`PageUp`/`PageDown`, herdr's own keys there); shift-`Enter` breaks the line.
  The board binds `Enter` in the message's own key context (why: the comment
  above `MESSAGE_KEYS` in `mods/board/src/ui/modals/start.js`); a load of
  `keys.json` drops that binding and the board's `Tab` and shift-`Tab`, so until
  the board binds its keys again those keys in the dialog's text fields are
  herdr's own (in the message they indent and outdent). The first `Enter` in the
  message after such a load binds them again and puts the message back as it was
  before that `Enter`. Where that `Enter` put in only its one line break, in
  place of the selection, it starts; where it put in more (several cursors), it
  starts nothing and asks for `Enter` once more. The choices "Repo" (only for an
  item without a repo), "Agent", "Rechner" and "Öffnen in" work alike: `←`/`→`
  (or `h`/`l`) step through the entries in place, space or a click opens a list
  under the field, whose filter then has the keyboard. Typing filters the list,
  `↑`/`↓` (or `ctrl-n/p`, `ctrl-j/k`) mark a row, `Enter` or a click takes it
  and closes the list, and `Esc` or a press beside the list closes only the
  list. The hint line names the keys of the field that has the keyboard. "Öffnen
  in" says where the tab goes, with "Neuer Space …" and the chosen machine's
  spaces. An existing space gets the tab, in the checkout's folder whatever the
  space's own; a new space takes the name typed in the field that then shows,
  prefilled with the repo's name (for an item without a repo the chosen repo's
  folder name). Preselected is the space of that name, ignoring case, else the
  space I am in, else that machine's first; "Neuer Space …" only where the
  machine has none. Another machine in "Rechner" chooses anew among its spaces,
  unless a new space with a name I typed is chosen; a machine whose spaces herdr
  has not read says so and offers only a new space. A chosen space that closes
  while the dialog is open is said there, and the dialog starts nothing until I
  choose again; for one chosen on a machine whose spaces herdr is reading
  (again), it starts nothing until they are read. "Repo" offers a work item, or
  a pull request reached from one, the git repositories (a folder holding a
  `.git`) directly beneath the folders `repoFolders` in views.json names, the
  team's own or else those for every team under `sources.azure` (`~` is the
  machine's home), as they are on the machine chosen under "Rechner" (the
  header's "Calls:" says what that costs). A repo chosen stays chosen where the
  other machine has it too. The first time nothing is chosen, and `Enter` then
  starts nothing and says "Repo wählen"; after a start the view's next dialog
  preselects that repo where it is among the repos listed, and otherwise, where
  others are listed, says that it is not. A pull request the details went down
  to from a work item has, once its details are read, the repo named like its
  Azure repository preselected where exactly one listed repo is, and its start
  is not remembered. A listing that fails says why in the field, a folder that
  is not there or cannot be read is named, and where no folder is set or none
  holds a repo the dialog says what to set in views.json; it then starts
  nothing, and never in `start.checkout`. In the start dialog and the create
  dialog `Tab` and shift-`Tab` move between the fields, from the message or
  title too: the board binds them in its own key context, as the leader does
  (the comment above `BOARD_KEYS` in `mods/board/src/main.js`).
  The tab is named after the item (`romm-tender#2845 …`, `AB#456 …` for a work
  item), which is one way the board finds it again. The details' "SITZUNG"
  lists every session of the item, the sure ones (a dot in their agent's
  status color, and that status) before the likely ones (a ring and
  "Kandidat"), one per place with every reason it was found by; a click, or
  `Enter` on its line in the details panel, goes there (its space, tab and
  pane). Sure: the item's key (`tender#3000`, `AB#101`, `!57`; on GitHub
  also with its repo's owner, `owner/tender#3000`, the only key that names an
  item of a foreign repo) in a space's, tab's or pane's name, or a bare `#3000`
  there in a folder of the item's repo; on GitHub its number in the branch
  of any terminal in a folder of its repo (a part that starts with `3000-`,
  or a last part `3000`; a pull request's own head branch) or in a
  worktree's folder below
  `<repo>.worktrees/` (its first two parts there); the name of a Claude Code
  session running on this machine that names the item so. Likely: an open
  task in such a session's task list, or a terminal's title, that names it
  so. A number stands alone (`#12` is not in `#123`), and an Azure work item
  counts only by its whole key. A Claude session shows in the pane whose
  terminal runs its process or one of that process's parents; else, where it
  is the only Claude session in its folder not found by its process, in the
  one pane on this machine in that folder whose agent reports itself as
  Claude Code and runs no other session; where neither is found, it is
  listed with "kein Terminal gefunden". A Claude session in no terminal
  shows the status Claude Code writes (busy and shell: "arbeitet", waiting:
  "wartet auf dich", idle: "bereit"); one in a pane shows that pane's, like
  any place, and Claude Code's where the pane has none. "SITZUNG" names a
  status Claude Code does not write. The board reads the files of the
  sessions whose process runs (`~/.claude/sessions/<pid>.json`, or under
  `CLAUDE_CONFIG_DIR`; never the `.key` files beside them) and, where `ps`
  runs, is Claude Code's by `ps`'s name for it (`claude`, `claude.exe`, a
  version number as the native install's binary is named, or node's with
  Claude Code in its arguments; "SITZUNG" names a file of another program's
  process, and without `ps` that every file is taken unchecked), `ps`'s
  processes and those sessions' task lists (`tasks/session-<the id's first
  eight characters>/`) with sh, off the draw (when, and what it costs: the
  header of `mods/board/src/main.js`); a draw looks each card up in an index
  it makes once. A file it cannot read, or not in the shape Claude Code
  writes, is left out, as is the rest of an output herdr cut short, and
  "SITZUNG" says so. A status change shows at once
  and is written to GitHub or Azure; a refusal moves the card back (or sets the
  state back) with the error, and a write without a clear answer refreshes the
  board and then says where the card is, or which state the work item has. A
  state set on Azure refreshes the Sprint either way, since which column it puts
  a task in is Azure's to say. Who an item is assigned to shows the same way on
  both sources, by name (on GitHub the login where the account has no name): on
  a card and a story after its state or chips, in the Backlog's "Zugewiesen"
  column and in the details ("zugewiesen: …"); the filter finds it by name and
  by login. `a` on a GitHub card, a Sprint's story or task or a Backlog's row
  opens a picker: "Ich", "niemand", then the people of the item's repo that
  GitHub lets it be assigned to (the first 100), or the members of the view's
  team on Azure, narrowed by typing; `↑`/`↓` (or `ctrl-j/k`, `ctrl-n/p`) mark
  one, `Enter` or a click assigns it. Ten show at a time, the window following
  the mark and moved by the mouse wheel, as in the command menu. It always sets
  exactly one person, or no one: on GitHub the chosen one replaces all
  assignees. The people are read once per repo or team and kept while the board
  runs; where they cannot be read, the picker and a toast say why, and it still
  offers "niemand" (and "Ich" on Azure, which az resolves itself) with no row
  marked, so that `Enter` assigns no one until a row is chosen. A draft takes no
  assignment. The change shows at once and goes back with the error where it is
  refused, as a status change does; one without a clear answer refreshes the
  view and then says who has the item. It runs gh and az by the path my shell
  gives, since herdr's own PATH lacks Homebrew and mise. `mise run
  herdr-board-test` (without mise, `node --test tests/herdr-app/board.test.mjs`
  from the repo) tests that `main.js` is built from its sources, its data
  functions and a few of its key paths against sample answers of gh, GitHub and
  az; the test file's header says which answers are recorded, which built by
  hand and which written from az's documentation. It needs node.
- **herdr writes `layouts/personal.json` itself.** `layout.set` saves the
  whole tree, in herdr's key order, through the link into this repo, so such
  a change shows up in `git diff`; clicks (sizes, shown or hidden, the child a
  stack shows, such as the board layer) stay in herdr's `layouts/.state/`,
  so the board still shows after a restart if it showed before.

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

## preview-serve

`~/.local/bin/preview-serve` (`bash` package) shows a directory of pages or
images on this machine's home-network address, so a browser on another device
opens them:

- `preview-serve <dir>` starts `python3 -m http.server` in the background on
  the address and the first free port of the host's preview range, and prints
  the link and the PID. It refuses a directory holding a `.git` or a symlink
  that leads outside it, since the server hands out everything below.
- `preview-serve --stop <pid>` ends a server it started.
- `preview-serve --addr` prints the address and port for a dev server to bind
  to, and starts nothing.

The range comes from `/etc/preview-ports` (`<first>-<last>`). On the
Minisforum the homelab playbook writes that file from the variable that opens
the range in the host firewall; without it the script falls back to the
playbook's range and says so. The script's header has the details.

`~/.local/bin/image-page <out-dir> <image>[::caption] ...` writes a page to
serve this way: it copies PNG, JPEG, GIF or WebP images into `<out-dir>` and
lays them out in an `index.html` side by side as they fit, at their real
size, each CSS pixel `--density` image pixels (2.625 for an Android render
drawn at that density). Its header lists the options and what it refuses.

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
a `memex-sync (<Machine>): fetch refused` notification.

Each of the failures that need a hand can also send an ntfy notification,
repeated daily while it lasts (see the script's header). Two files outside
this repo switch notifications on; without them the script only logs:

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

Four runners are described beside what they check: `mise run
memex-sync-test` under "memex sync", in its "Tests" part, and `mise run
herdr-app-check`, `mise run herdr-board-test` and `mise run
herdr-leader-test` under "herdr app".

`mise run install-dotfiles-test` (without mise,
`tests/install-dotfiles/memory-link.sh` and `shared-dirs.sh`) checks the
`memex` package and the `~/Memory` link that `install-dotfiles.sh` makes, and
the directories that must be real ("Install / update" above), in
throwaway homes. Each file's header lists its cases, `--list` prints their
names, and naming cases runs only those. It needs stow, git and tar.

`mise run shell-test` (without mise, `tests/statusline/width.sh`,
`tests/bash/startup.sh`, `tests/bash/preview-serve.sh`,
`tests/bash/image-page.sh` and `tests/bash/agent-env.sh`) checks how the
Claude Code status line finds the terminal's width, and the startup of an
interactive bash: the greeter, the TMUX variables a herdr terminal drops and,
on wsl-arch, how a shell finds or starts the keyring daemon, and the one line
it prints on stderr when the lock stays busy or the start fails. Stand-ins
take the place of hc, tmux, fastfetch and gnome-keyring-daemon, and flock and
mkdir run through logging wrappers around the real tools, so no herdr or tmux
server is asked and no real keyring daemon starts. It also checks how
`preview-serve` picks its port, refuses a directory, waits for its server and
stops it, with stand-ins for ip, ss and python3, so no real port is taken,
how `image-page` reads each format's pixel size, sizes and captions the
images and refuses a directory it did not fill itself, and which secrets
`agent-env` and the harness functions of `.bashrc` hand a stand-in harness,
from a throwaway `~/.bashrc.secrets` of dummy values, and that `bash -x`
shows none of them.
Each file's header lists its cases, `--list` prints their names, and naming
cases runs only those. It needs jq, timeout, flock, setsid, python3 and nvim.

`mise run skill-trigger-test` (without mise, `python3 -I
tests/skill-triggers/run.py`) checks that the skills under
`claude/.claude/skills` that Claude may start on its own, those without
`disable-model-invocation: true`, start on the prompts in
`tests/skill-triggers/cases.toml` and stay quiet on the ones meant for
another skill; the header of `cases.toml` says what a case holds and what
the file must cover. Each case is one headless `claude -p` run, read for the
Skill tool calls it makes. The runs are model calls on your claude.ai login
or API key, so run it by hand after a skill description changes, not per
commit and never beside another heavy run; it prints each run's cost and the
total, the CLI's list-price estimate. A case whose runs did not pass only
because they ended in errors (a timeout, an API error) is listed apart and
counts as no result: with no failed case, such errors end the run with exit
2 rather than 0. Run `--check` first: it validates the cases and the
isolation without a model call. Name cases to run only those, and pass
`--runs 3` to judge a description, since a skill does not fire the same way
every time. Each run starts under bwrap with a throwaway home that
holds a copy of the skills and nothing else of yours; the header of `run.py`
says how it is isolated and authenticated and lists the options.
`mise run skill-trigger-test --test` (without mise, `python3 -I
tests/skill-triggers/run-test.py`) runs the runner's own tests, which make no
model call. It needs python3 (3.11 or later), bwrap and claude.

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
