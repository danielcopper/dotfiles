# Dotfiles

Personal dotfiles for my machines, managed with [yadm](https://yadm.io) (Yet Another Dotfiles Manager).

## Structure

- **Single `main` branch** — no more branch-per-machine drift
- **Alternates** (`##class.<name>`) and **templates** (`##template.esh`) handle per-machine variations
- **Archive tags** under `archive/pre-yadm/*` preserve the old branch-per-machine history

## Install on a new machine

```bash
# Install yadm
sudo pacman -S yadm                       # Arch
# sudo apt install yadm                   # Debian/Ubuntu
# brew install yadm                       # macOS

# Clone
yadm clone git@github.com:danielcopper/dotfiles.git

# Set class for this machine
yadm config local.class arch              # or: wsl, steamdeck, ...

# Resolve alternates + templates
yadm alt
```

## Day-to-day

```bash
yadm status
yadm diff
yadm add <file>
yadm commit -m "..."
yadm push
```

Behaves like git. Use it exactly as you'd use `git` for a regular repo.

## Templates

`.claude/settings.json` is a yadm esh template at `.claude/settings.json##template.esh`. It is class-conditional — Matrix-bridge hooks for the `claude-matrix-bridge` are only rendered when `YADM_CLASS=arch`. After editing the template, run `yadm alt` to regenerate `~/.claude/settings.json`.

## Archive tags

The old branch-per-machine layout is preserved as git tags:

- `archive/pre-yadm/main`
- `archive/pre-yadm/arch`
- `archive/pre-yadm/wsl`
- `archive/pre-yadm/steamdeck`
- `archive/pre-yadm/windows`

Pull any file from an old branch:

```bash
yadm show archive/pre-yadm/windows:Microsoft.PowerShell_profile.ps1 \
  > ~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1
```
